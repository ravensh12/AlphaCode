import {
  GRAPHICS_TIERS,
  profileForTier,
  readDeviceCaps,
  type DeviceCaps,
  type GraphicsTier,
  type QualityProfile,
} from './graphicsQuality'

/* ============================================================================
   THE INVISIBLE FPS GOVERNOR — the only thing allowed to reduce quality
   mid-session.

   Players boot at a device-aware notch (see suggestBootNotch) and the
   governor steps DOWN when the frame-rate floor cannot be held, and UP after
   sustained recovery, capped at ULTRA. No UI. A sessionStorage hint means
   refreshes restart near the right notch; a brand-new session uses the
   device suggestion (not a blind ULTRA grind).

   What each notch trades (see governedProfile):
     notch 0 — ULTRA: full product look. dpr window up to 1.15.
     notch 1 — dpr ceiling 1.05, street shell at HIGH rings, city-life at HIGH.
     notch 2 — dpr window 0.75–0.95, street shell trees-only (MEDIUM rings),
               city-life at MEDIUM.
     notch 3 — SAFETY FLOOR: dpr 0.65–0.85, Meshy street shell off (primitive
               props return), minimal city life, rain visuals off.
   Pipeline SHAPE is deliberately pinned at ULTRA across notches (cascade
   COUNT, facade mode, HDRI sky): changing those mid-session recompiles
   every lit shader. Density + resolution are the honest levers — including
   the sun-shadow map RESOLUTION (shadowMapScale).

   The steppers are pure and unit-tested; the page feeds stepGovernor
   PerformanceMonitor FPS samples and stepJankFrame per-frame rAF deltas
   (the long-frame signal — see the jank section below).
   ========================================================================== */

export const GOVERNOR_MIN_NOTCH = 0
export const GOVERNOR_MAX_NOTCH = 3

/** Ignore samples this long after mount: first-load shader compilation and
 *  asset decode legitimately tank the frame rate on EVERY device — demoting
 *  during warmup would punish strong machines for booting. Kept short (5s)
 *  so a genuinely overwhelmed device is rescued before the player writes the
 *  session off as broken. */
export const GOVERNOR_WARMUP_MS = 5_000

/** Step down when sustained below this for DOWN_HOLD_MS. Set above a bare
 *  "playable" 30 so a device stuck in the choppy 30–38 band is actually
 *  rescued toward a lighter, smoother notch. */
export const GOVERNOR_DOWN_FPS = 40
export const GOVERNOR_DOWN_HOLD_MS = 2_500
/** Step up when sustained above this for UP_HOLD_MS (after the cooldown). */
export const GOVERNOR_UP_FPS = 52
export const GOVERNOR_UP_HOLD_MS = 6_000
/** Cooldown after ANY step before the governor may step up (anti-thrash). */
export const GOVERNOR_UP_COOLDOWN_MS = 10_000

/* --------------------------------------------------- jank (long-frame) signal
   The average-fps path above misses the way real lag FEELS: a machine can
   average 50+ fps while spilling a spiky stream of 33–100ms frames (measured
   on fanless hardware during base-city traversal: ~7 long frames/sec with a
   perfect 16.7ms median). Long frames are an ADDITIONAL demote signal:
   sustained jank steps the same notch ladder down one notch — the ladder's
   levers (dpr window, shadow-map scale, god-rays, density) are exactly the
   recompile-free GPU costs behind those spikes. Promotion stays owned by the
   average-fps path (sustained >UP_FPS after the cooldown), so a jank demote
   cannot oscillate: the same hysteresis window guards both signals. */

/** A frame slower than this (ms) counts as jank — ≥2 missed vsyncs at 60Hz. */
export const JANK_FRAME_MS = 33.4
/** Rolling window the jank frames are counted within. */
export const JANK_WINDOW_MS = 4_000
/** Long frames within the window that trip a demote. Tuned from traversal
 *  captures: sustained GPU-bound jank runs ~5–7 long frames/sec (trips in
 *  ~2s), while a lone GC pause / late shader compile is a burst of 1–4 and a
 *  healthy scene shows <1 every 5s — neither ever reaches 12 in 4s. */
export const JANK_DEMOTE_COUNT = 12
/** Frames beyond this (ms) are suspension artifacts (tab switch, bg throttle,
 *  debugger pause) — never evidence about rendering cost. Ignored. */
export const JANK_FRAME_MAX_MS = 1_000

export interface GovernorState {
  /** Current notch (0 = ULTRA … 3 = safety floor). */
  notch: number
  /** Accumulated ms of consecutive below-floor samples. */
  belowMs: number
  /** Accumulated ms of consecutive above-recovery samples. */
  aboveMs: number
  /** Timestamp (ms) until which stepping UP is forbidden. */
  cooldownUntil: number
  /** Start (ms clock) of the current jank counting window. */
  jankWindowStart: number
  /** Long frames seen inside the current window. */
  jankCount: number
}

export function initialGovernorState(notch = 0): GovernorState {
  return {
    notch: clampNotch(notch),
    belowMs: 0,
    aboveMs: 0,
    cooldownUntil: 0,
    jankWindowStart: 0,
    jankCount: 0,
  }
}

export function clampNotch(notch: number): number {
  return Math.max(GOVERNOR_MIN_NOTCH, Math.min(GOVERNOR_MAX_NOTCH, Math.round(notch)))
}

export interface GovernorStep {
  state: GovernorState
  /** Set when this sample crossed a threshold and changed the notch. */
  changed: boolean
}

/**
 * Fold one FPS sample into the governor. `dtMs` is the time covered by the
 * sample (the PerformanceMonitor reports roughly every couple of seconds),
 * `now` is a monotonic ms clock. Pure — returns a new state.
 */
export function stepGovernor(
  state: GovernorState,
  fps: number,
  dtMs: number,
  now: number,
): GovernorStep {
  if (!Number.isFinite(fps) || fps <= 0 || dtMs <= 0) return { state, changed: false }
  const next: GovernorState = { ...state }

  if (fps < GOVERNOR_DOWN_FPS) {
    next.belowMs += dtMs
    next.aboveMs = 0
  } else if (fps > GOVERNOR_UP_FPS) {
    next.aboveMs += dtMs
    next.belowMs = 0
  } else {
    next.belowMs = 0
    next.aboveMs = 0
  }

  if (next.belowMs >= GOVERNOR_DOWN_HOLD_MS && next.notch < GOVERNOR_MAX_NOTCH) {
    next.notch += 1
    next.belowMs = 0
    next.aboveMs = 0
    next.jankCount = 0
    next.jankWindowStart = now
    next.cooldownUntil = now + GOVERNOR_UP_COOLDOWN_MS
    return { state: next, changed: true }
  }

  if (
    next.aboveMs >= GOVERNOR_UP_HOLD_MS &&
    next.notch > GOVERNOR_MIN_NOTCH &&
    now >= next.cooldownUntil
  ) {
    next.notch -= 1
    next.belowMs = 0
    next.aboveMs = 0
    // A promote also clears the jank tally: the lighter→heavier transition
    // itself can hitch a couple of frames (buffer reallocs, density remount)
    // and must not count as evidence against the notch we just returned to.
    next.jankCount = 0
    next.jankWindowStart = now
    next.cooldownUntil = now + GOVERNOR_UP_COOLDOWN_MS
    return { state: next, changed: true }
  }

  return { state: next, changed: false }
}

/**
 * Fold one FRAME's duration into the jank detector. Call every rAF frame with
 * the frame delta in ms; cheap fast-path (no allocation) for normal frames.
 * Pure — returns a new state only when a long frame changed the tally.
 *
 * The caller owns the protected windows exactly like stepGovernor: don't feed
 * frames during boot warmup, while hidden, inside the visibility grace, or
 * across a context restore.
 */
export function stepJankFrame(
  state: GovernorState,
  frameMs: number,
  now: number,
): GovernorStep {
  if (!Number.isFinite(frameMs) || frameMs <= JANK_FRAME_MS || frameMs > JANK_FRAME_MAX_MS) {
    return { state, changed: false }
  }
  const next: GovernorState = { ...state }
  // Rolling window: a stale tally (last long frame more than a window ago)
  // restarts the count, so isolated hitches minutes apart never accumulate.
  if (now - next.jankWindowStart > JANK_WINDOW_MS) {
    next.jankWindowStart = now
    next.jankCount = 0
  }
  next.jankCount += 1
  if (next.jankCount >= JANK_DEMOTE_COUNT && next.notch < GOVERNOR_MAX_NOTCH) {
    next.notch += 1
    next.jankCount = 0
    next.jankWindowStart = now
    // Sustained-fps streaks are void across a notch change (same as the fps
    // stepper), and the shared cooldown blocks an immediate promote — the two
    // signals can never ping-pong the notch.
    next.belowMs = 0
    next.aboveMs = 0
    next.cooldownUntil = now + GOVERNOR_UP_COOLDOWN_MS
    return { state: next, changed: true }
  }
  return { state: next, changed: false }
}

/* --------------------------------------------------------- notch → profile */

/** Street-shell density tier per notch (MeshyCityLayer's density knob). */
export function densityTierForNotch(notch: number): GraphicsTier {
  return GRAPHICS_TIERS[GOVERNOR_MAX_NOTCH - clampNotch(notch)]
}

/**
 * The live QualityProfile for a notch. Notch 0 IS the ULTRA profile; deeper
 * notches keep the ULTRA pipeline shape (cascades/facades/HDRI — see header)
 * and pull the density/resolution/post levers from the internal ladders.
 */
export function governedProfile(notch: number, deviceDpr: number): QualityProfile {
  const n = clampNotch(notch)
  const ultra = profileForTier('ultra', deviceDpr)
  if (n === 0) return ultra
  const ladder = profileForTier(densityTierForNotch(n), deviceDpr)
  const device = Math.max(0.5, deviceDpr || 1)
  // Windows sit strictly BELOW the ULTRA ceiling and step down evenly —
  // a deeper notch must never render MORE pixels than the one above it.
  const dpr =
    n === 1
      ? { start: Math.min(0.95, device), min: 0.75, max: 1.05 }
      : n === 2
        ? { start: Math.min(0.85, device), min: 0.7, max: 0.95 }
        : { start: Math.min(0.75, device), min: 0.65, max: 0.85 }
  // Shadow-map resolution steps down with the notch (recompile-free — see the
  // header). Roughly halves the shadow depth-pass + PCF cost by the floor.
  const shadowMapScale = n === 1 ? 0.85 : n === 2 ? 0.7 : 0.55
  return {
    ...ultra,
    dpr,
    shadowMapScale,
    godRays: false,
    rainParticles: ladder.rainParticles,
    cityLife: n === 3 ? { traffic: 10, citizens: 6, birds: 0, steam: 16, leaves: 0 } : ladder.cityLife,
    simTierCap: n >= 2 ? 'med' : 'high',
  }
}

/* ---------------------------------------------------------- session hint -- */

/** Session-only starting notch (refreshes start near the right notch).
 *  Deliberately NOT localStorage. */
export const GOVERNOR_HINT_KEY = 'alphacode.gfx.notch'

/** `null` when no hint has been written this session. */
export function readNotchHint(): number | null {
  try {
    const raw = sessionStorage.getItem(GOVERNOR_HINT_KEY)
    if (raw == null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? clampNotch(parsed) : null
  } catch {
    return null
  }
}

export function writeNotchHint(notch: number): void {
  try {
    sessionStorage.setItem(GOVERNOR_HINT_KEY, String(clampNotch(notch)))
  } catch {
    /* storage unavailable */
  }
}

/**
 * Pick a starting notch from coarse device caps so weak / mobile / high-DPR
 * GPUs never boot into a single-digit-fps ULTRA grind. Pure + testable.
 *
 *   mobile / ≤4 GB / ≤4 cores     → notch 2 (medium density)
 *   ≤8 GB / ≤6 cores / DPR ≥2.5  → notch 1 (high density)
 *   otherwise                    → notch 0 (ULTRA)
 */
export function suggestBootNotch(caps: Partial<DeviceCaps>): number {
  if (caps.mobileLike) return 2
  const mem = caps.deviceMemoryGb ?? 0
  const cores = caps.hardwareConcurrency ?? 0
  const dpr = caps.devicePixelRatio ?? 1
  if ((mem > 0 && mem <= 4) || (cores > 0 && cores <= 4)) return 2
  if ((mem > 0 && mem <= 8) || (cores > 0 && cores <= 6) || dpr >= 2.5) return 1
  return 0
}

/**
 * Session hint wins (a refresh that already found a stable notch); otherwise
 * the device suggestion. Brand-new capable desktops still start at ULTRA.
 */
export function resolveBootNotch(caps?: Partial<DeviceCaps>): number {
  const hint = readNotchHint()
  if (hint != null) return hint
  return suggestBootNotch(caps ?? readDeviceCaps())
}
