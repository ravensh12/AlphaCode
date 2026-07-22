/**
 * Pure, frame-driven state machines for the per-boss KILL MECHANICS.
 *
 * Every realm boss (BossArena variants 0–5) guards its HP behind a unique,
 * practice-demanding mechanic; the Architect finale reuses twisted versions of
 * them per phase. All rules live here — deterministic, renderer-free, unit
 * tested — while the arenas consume the returned events for VFX/HUD/damage.
 *
 * Conventions:
 *  - Positions are XZ ground coordinates ({@link Vec2}).
 *  - `tick*` advances a state by `dt` seconds and returns any events fired.
 *  - Randomness is injected (`Rng`) so tests are deterministic.
 */

export type Rng = () => number

export interface Vec2 {
  x: number
  z: number
}

export const dist2 = (ax: number, az: number, bx: number, bz: number): number =>
  Math.hypot(ax - bx, az - bz)

/* ====================================================================== */
/* Shared event vocabulary                                                */
/* ====================================================================== */

export type MechEvent =
  /** The boss guard broke — full damage for `dur` seconds. */
  | { type: 'open'; dur: number }
  /** The damage window closed; the guard is back up. */
  | { type: 'close' }
  /** The boss regenerates HP (failed mechanic). */
  | { type: 'heal'; amount: number }
  /** The player takes a hit (zap / reflected shot / detonation). */
  | { type: 'zap'; amount: number }
  /** Spawn `count` homing adds at the given point. */
  | { type: 'adds'; count: number; x: number; z: number }
  /** Layout changed (signals/tiles/nodes reshuffled) — refresh props. */
  | { type: 'shuffle' }
  /** A step of the mechanic locked in (tile locked, node destroyed…). */
  | { type: 'progress' }
  /** Player did the mechanic wrong (order break, decoy ping, bad dash). */
  | { type: 'mistake'; reason: string }

/* ====================================================================== */
/* Mechanic registry + player-facing copy (single source of truth)        */
/* ====================================================================== */

export type MechanicId =
  | 'hider'
  | 'mirror'
  | 'twinkey'
  | 'gatekeeper'
  | 'bracket'
  | 'sphinx'

export function mechanicForVariant(variant: number): MechanicId {
  const order: MechanicId[] = [
    'hider',
    'mirror',
    'twinkey',
    'gatekeeper',
    'bracket',
    'sphinx',
  ]
  return order[((variant % order.length) + order.length) % order.length]
}

export interface MechanicSpec {
  /** Big title on the intro card. */
  title: string
  /** Two short teaching lines under the title. */
  lines: [string, string]
  /** Persistent bottom controls line during the fight. */
  controls: string
}

export const MECH_SPECS: Record<MechanicId, MechanicSpec> = {
  hider: {
    title: 'SIGNAL LOCK',
    lines: [
      'It hides among false signals — only ONE flicker is real (watch the pulse).',
      'Run to the true signal and PING it to force it out. Decoys bite back.',
    ],
    controls: '↑↓←→ move · SPACE ping the true signal · F shoot while it’s exposed',
  },
  mirror: {
    title: 'BROKEN REFLECTION',
    lines: [
      'It mirrors your every move across the arena — and reflects your shots.',
      'Steer YOUR position so ITS mirrored body stands in the shatter zone.',
    ],
    controls: '↑↓←→ steer the reflection · hold fire while the mirror is up · F when it shatters',
  },
  twinkey: {
    title: 'TWIN LOCKS',
    lines: [
      'Strike the GLOWING lock first — Q is the LEFT lock, E is the RIGHT.',
      'Wait for its twin to arm, then strike it. Mash or miss and it regenerates.',
    ],
    controls: 'Q left lock · E right lock — glowing one first, then its twin · F while it kneels',
  },
  gatekeeper: {
    title: 'PERFECT PASSAGE',
    lines: [
      'His gate-slam is unblockable — until the ring flashes WHITE.',
      'Dash (SPACE) exactly on the flash to pass through and break his guard.',
    ],
    controls: 'SPACE dash on the WHITE flash · ↑↓←→ move · F shoot while he staggers',
  },
  bracket: {
    title: 'MATCH THE PAIRS',
    lines: [
      'Six bracket sigils feed its armor. Stand in a sigil ring to target it.',
      'Openers first — a closer only falls if it matches the LAST open bracket.',
    ],
    controls: 'stand in a sigil ring + F to break it · wrong order heals the beast',
  },
  sphinx: {
    title: 'SORTED STEPS',
    lines: [
      'Numbered plates rise from the mountain. PLANT your feet on them in ASCENDING order.',
      'Running across a plate is always safe — standing on the wrong one shocks you.',
    ],
    controls: '↑↓←→ run · STAND STILL on plates lowest → highest · F while it’s stunned',
  },
}

/* ====================================================================== */
/* 0 · THE HIDER — signal lock                                            */
/* ====================================================================== */

export const HIDER = {
  signals: 3,
  ringMin: 8,
  ringMax: 14,
  pingRadius: 3.6,
  pingCooldown: 1.1,
  revealDur: 2.6,
  shuffleEvery: 6.5,
  decoyAdds: 4,
} as const

export interface HiderSignal extends Vec2 {
  real: boolean
}

export interface HiderState {
  phase: 'cloak' | 'revealed'
  /** Time left in the reveal window (while `phase === 'revealed'`). */
  windowT: number
  signals: HiderSignal[]
  pingCd: number
  shuffleIn: number
}

function rollSignals(rng: Rng): HiderSignal[] {
  const baseA = rng() * Math.PI * 2
  const realIdx = Math.floor(rng() * HIDER.signals) % HIDER.signals
  return Array.from({ length: HIDER.signals }, (_, i) => {
    const a = baseA + (i / HIDER.signals) * Math.PI * 2 + (rng() - 0.5) * 0.9
    const r = HIDER.ringMin + rng() * (HIDER.ringMax - HIDER.ringMin)
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, real: i === realIdx }
  })
}

export function createHiderState(rng: Rng = Math.random): HiderState {
  return {
    phase: 'cloak',
    windowT: 0,
    signals: rollSignals(rng),
    pingCd: 0,
    shuffleIn: HIDER.shuffleEvery,
  }
}

export function hiderRealSignal(s: HiderState): HiderSignal {
  return s.signals.find((sig) => sig.real) ?? s.signals[0]
}

export function tickHider(
  s: HiderState,
  dt: number,
  rng: Rng = Math.random,
): MechEvent[] {
  const events: MechEvent[] = []
  s.pingCd = Math.max(0, s.pingCd - dt)
  if (s.phase === 'revealed') {
    s.windowT -= dt
    if (s.windowT <= 0) {
      s.phase = 'cloak'
      s.windowT = 0
      s.signals = rollSignals(rng)
      s.shuffleIn = HIDER.shuffleEvery
      events.push({ type: 'close' }, { type: 'shuffle' })
    }
  } else {
    s.shuffleIn -= dt
    if (s.shuffleIn <= 0) {
      s.shuffleIn = HIDER.shuffleEvery
      s.signals = rollSignals(rng)
      events.push({ type: 'shuffle' })
    }
  }
  return events
}

/** Player pressed PING at (px,pz). */
export function hiderPing(s: HiderState, px: number, pz: number): MechEvent[] {
  if (s.phase !== 'cloak' || s.pingCd > 0) return []
  s.pingCd = HIDER.pingCooldown
  let nearest = -1
  let nearestD = Infinity
  for (let i = 0; i < s.signals.length; i++) {
    const d = dist2(px, pz, s.signals[i].x, s.signals[i].z)
    if (d < nearestD) {
      nearestD = d
      nearest = i
    }
  }
  if (nearest < 0 || nearestD > HIDER.pingRadius) {
    return [{ type: 'mistake', reason: 'whiff' }]
  }
  const sig = s.signals[nearest]
  if (sig.real) {
    s.phase = 'revealed'
    s.windowT = HIDER.revealDur
    return [{ type: 'open', dur: HIDER.revealDur }]
  }
  // Decoy — it bites back and the true signal relocates.
  s.signals.splice(nearest, 1)
  return [
    { type: 'mistake', reason: 'decoy' },
    { type: 'adds', count: HIDER.decoyAdds, x: sig.x, z: sig.z },
  ]
}

/* ====================================================================== */
/* 1 · MIRROR MIMIC — broken reflection                                   */
/* ====================================================================== */

export const MIRROR = {
  zoneRadius: 3.1,
  zoneFuse: 4.0,
  zoneRespawn: 1.3,
  zoneRingMin: 6,
  zoneRingMax: 13,
  /** Zones spawn this far from the mimic's CURRENT spot — always reachable
   *  within the fuse, never trivially underfoot. */
  zoneNearMin: 4.5,
  zoneNearMax: 9.5,
  /** Sized so three shatter windows (and not four) finish the fight. */
  shatterDur: 5.0,
  reflectCooldown: 0.7,
} as const

export interface MirrorZone extends Vec2 {
  fuse: number
}

export interface MirrorState {
  /** true = mirror up (immune + reflects shots). */
  guard: boolean
  windowT: number
  zone: MirrorZone | null
  respawnIn: number
  reflectCd: number
}

export function createMirrorState(
  rng: Rng = Math.random,
  mimicX = 0,
  mimicZ = -6,
): MirrorState {
  return {
    guard: true,
    windowT: 0,
    zone: rollZone(rng, mimicX, mimicZ),
    respawnIn: 0,
    reflectCd: 0,
  }
}

/** New zones bloom a sprint away from the mimic, clamped onto the play ring. */
function rollZone(rng: Rng, mimicX: number, mimicZ: number): MirrorZone {
  const a = rng() * Math.PI * 2
  const d = MIRROR.zoneNearMin + rng() * (MIRROR.zoneNearMax - MIRROR.zoneNearMin)
  let x = mimicX + Math.cos(a) * d
  let z = mimicZ + Math.sin(a) * d
  const r = Math.hypot(x, z) || 1
  const clamped = Math.min(MIRROR.zoneRingMax, Math.max(MIRROR.zoneRingMin, r))
  x *= clamped / r
  z *= clamped / r
  return { x, z, fuse: MIRROR.zoneFuse }
}

/** The Mimic's position is the player's, reflected through the arena center. */
export function mirrorPoint(px: number, pz: number): Vec2 {
  return { x: -px, z: -pz }
}

export function tickMirror(
  s: MirrorState,
  dt: number,
  mimicX: number,
  mimicZ: number,
  rng: Rng = Math.random,
): MechEvent[] {
  const events: MechEvent[] = []
  s.reflectCd = Math.max(0, s.reflectCd - dt)
  if (!s.guard) {
    s.windowT -= dt
    if (s.windowT <= 0) {
      s.guard = true
      s.windowT = 0
      s.respawnIn = MIRROR.zoneRespawn
      events.push({ type: 'close' })
    }
    return events
  }
  if (!s.zone) {
    s.respawnIn -= dt
    if (s.respawnIn <= 0) {
      s.zone = rollZone(rng, mimicX, mimicZ)
      events.push({ type: 'shuffle' })
    }
    return events
  }
  s.zone.fuse -= dt
  if (s.zone.fuse <= 0) {
    const inZone =
      dist2(mimicX, mimicZ, s.zone.x, s.zone.z) <= MIRROR.zoneRadius
    s.zone = null
    if (inZone) {
      s.guard = false
      s.windowT = MIRROR.shatterDur
      events.push({ type: 'open', dur: MIRROR.shatterDur })
    } else {
      s.respawnIn = MIRROR.zoneRespawn
      events.push({ type: 'mistake', reason: 'zone-missed' }, { type: 'shuffle' })
    }
  }
  return events
}

/**
 * A player bolt struck the guarded mirror — reflect it back as a dodgeable
 * homing shot from (x,z), on a cooldown so rapid-fire isn't a death sentence.
 */
export function mirrorReflect(s: MirrorState, x: number, z: number): MechEvent[] {
  if (!s.guard || s.reflectCd > 0) return []
  s.reflectCd = MIRROR.reflectCooldown
  return [
    { type: 'adds', count: 1, x, z },
    { type: 'mistake', reason: 'reflected' },
  ]
}

/* ====================================================================== */
/* 2 · TWIN-KEY GOLEM — twin locks                                        */
/* ====================================================================== */

export interface TwinKeyConfig {
  /** Seconds between arm cycles. */
  cycle: number
  /** Window to strike the FIRST (indicated) lock. */
  armDur: number
  /** The second lock charges this long before it can be struck — striking
   *  during the charge is a punished mistake, so Q+E mashing always FAILS. */
  chargeDelay: number
  /** Window to strike the SECOND lock once it arms. */
  link: number
  /** Damage window on success. */
  windowDur: number
  /** HP regained when the sequence fails. */
  regenHeal: number
}

export const TWINKEY: TwinKeyConfig = {
  cycle: 3.4,
  armDur: 2.2,
  chargeDelay: 0.55,
  link: 0.75,
  /** Sized so three CLEAN sequences (and not four) finish the fight. */
  windowDur: 4.6,
  regenHeal: 5,
}

export type TwinSide = 'L' | 'R'
export type TwinPhase = 'idle' | 'first' | 'charge' | 'second' | 'window'

export interface TwinKeyState {
  phase: TwinPhase
  /** Time left in the current phase. */
  t: number
  /** The lock that must be struck FIRST this cycle (randomized per cycle). */
  firstSide: TwinSide
  windowT: number
  cfg: TwinKeyConfig
}

export function createTwinKeyState(
  cfg: TwinKeyConfig = TWINKEY,
  rng: Rng = Math.random,
): TwinKeyState {
  return {
    phase: 'idle',
    t: cfg.cycle,
    firstSide: rng() < 0.5 ? 'L' : 'R',
    windowT: 0,
    cfg,
  }
}

function twinReseal(s: TwinKeyState): void {
  s.phase = 'idle'
  s.t = s.cfg.cycle
  s.windowT = 0
}

export function tickTwinKey(
  s: TwinKeyState,
  dt: number,
  rng: Rng = Math.random,
): MechEvent[] {
  const events: MechEvent[] = []
  const cfg = s.cfg
  s.t -= dt
  switch (s.phase) {
    case 'window':
      s.windowT = Math.max(0, s.t)
      if (s.t <= 0) {
        twinReseal(s)
        events.push({ type: 'close' })
      }
      break
    case 'idle':
      if (s.t <= 0) {
        s.phase = 'first'
        s.t = cfg.armDur
        s.firstSide = rng() < 0.5 ? 'L' : 'R'
        events.push({ type: 'shuffle' }) // "first lock armed" cue
      }
      break
    case 'first':
      // Expired unengaged — reseal quietly (no heal: the player never bit).
      if (s.t <= 0) twinReseal(s)
      break
    case 'charge':
      if (s.t <= 0) {
        s.phase = 'second'
        s.t = cfg.link
        events.push({ type: 'shuffle' }) // "second lock armed" cue
      }
      break
    case 'second':
      if (s.t <= 0) {
        // Second strike came too late — it re-seals and regenerates.
        twinReseal(s)
        events.push(
          { type: 'mistake', reason: 'link-broken' },
          { type: 'heal', amount: cfg.regenHeal },
        )
      }
      break
  }
  return events
}

export function twinStrike(s: TwinKeyState, side: TwinSide): MechEvent[] {
  switch (s.phase) {
    case 'window':
      return []
    case 'idle':
      return [{ type: 'mistake', reason: 'not-armed' }]
    case 'first':
      if (side !== s.firstSide) {
        // Struck the dormant lock — punished, resealed.
        twinReseal(s)
        return [
          { type: 'mistake', reason: 'wrong-lock' },
          { type: 'heal', amount: s.cfg.regenHeal },
        ]
      }
      s.phase = 'charge'
      s.t = s.cfg.chargeDelay
      return [{ type: 'progress' }]
    case 'charge':
      if (side === s.firstSide) return [] // re-tap ignored
      // Mashed into the charge — the whole point of the delay: punished.
      twinReseal(s)
      return [
        { type: 'mistake', reason: 'too-early' },
        { type: 'heal', amount: s.cfg.regenHeal },
      ]
    case 'second':
      if (side === s.firstSide) return [] // re-tap ignored
      s.phase = 'window'
      s.t = s.cfg.windowDur
      s.windowT = s.cfg.windowDur
      return [{ type: 'open', dur: s.cfg.windowDur }]
  }
}

/* ====================================================================== */
/* 3 · THE GATEKEEPER — perfect passage                                   */
/* ====================================================================== */

export const GATE = {
  /** Seconds of calm between slams. */
  idle: 3.2,
  windup: 1.6,
  /** Final slice of the windup where a dash is PERFECT. */
  flash: 0.38,
  slamRadius: 8,
  slamDamage: 2,
  /** Sized so three PERFECT passes (and not two) finish the fight. */
  staggerDur: 4.0,
  /** Player must be at most this far to dash THROUGH him. */
  passRange: 9.5,
} as const

export interface GateState {
  phase: 'idle' | 'windup' | 'stagger'
  t: number
  /** Set when the player already dashed during this windup. */
  dashSpent: boolean
  windowT: number
}

export function createGateState(): GateState {
  return { phase: 'idle', t: GATE.idle, dashSpent: false, windowT: 0 }
}

export function gateFlashOn(s: GateState): boolean {
  return s.phase === 'windup' && s.t <= GATE.flash
}

/**
 * Advance the slam cycle. `playerDist` and `playerDodging` resolve the slam
 * impact when the windup expires.
 */
export function tickGate(
  s: GateState,
  dt: number,
  playerDist: number,
  perfectPassed: boolean,
): MechEvent[] {
  const events: MechEvent[] = []
  s.t -= dt
  if (s.phase === 'idle' && s.t <= 0) {
    s.phase = 'windup'
    s.t = GATE.windup
    s.dashSpent = false
    events.push({ type: 'shuffle' }) // "windup started" cue
  } else if (s.phase === 'windup' && s.t <= 0) {
    if (perfectPassed) {
      s.phase = 'stagger'
      s.t = GATE.staggerDur
      s.windowT = GATE.staggerDur
      events.push({ type: 'open', dur: GATE.staggerDur })
    } else {
      s.phase = 'idle'
      s.t = GATE.idle
      if (playerDist <= GATE.slamRadius) {
        events.push(
          { type: 'zap', amount: GATE.slamDamage },
          { type: 'mistake', reason: 'slammed' },
        )
      }
    }
  } else if (s.phase === 'stagger') {
    s.windowT = Math.max(0, s.t)
    if (s.t <= 0) {
      s.phase = 'idle'
      s.t = GATE.idle
      s.windowT = 0
      events.push({ type: 'close' })
    }
  }
  return events
}

export type GateDashResult = 'perfect' | 'early' | 'too-far' | 'free'

/** Player pressed DASH. */
export function gateDash(s: GateState, playerDist: number): GateDashResult {
  if (s.phase !== 'windup' || s.dashSpent) return 'free'
  s.dashSpent = true
  if (s.t > GATE.flash) return 'early'
  if (playerDist > GATE.passRange) return 'too-far'
  return 'perfect'
}

/* ====================================================================== */
/* 4 · BRACKET BEAST — match the pairs                                    */
/* ====================================================================== */

export type BracketChar = '(' | '[' | '{' | '}' | ']' | ')'

export const BRACKET_PAIRS: Record<string, BracketChar> = {
  ')': '(',
  ']': '[',
  '}': '{',
}

export const BRACKET = {
  nodeCount: 6,
  /** Inside the play boundary and clear of the perimeter rail/props (QA:
   *  radius 13 put glyphs on top of the fences). */
  ringRadius: 10.5,
  /** Stand inside this radius of a node to target it. */
  standRadius: 3.0,
  wrongHeal: 6,
  /** Sized so three CLEAN rounds (and not two) finish the fight. */
  windowDur: 5.5,
} as const

export interface BracketNode extends Vec2 {
  label: BracketChar
  alive: boolean
}

export interface BracketState {
  nodes: BracketNode[]
  /** Outstanding open brackets (stack). */
  stack: BracketChar[]
  windowT: number
}

const BRACKET_SET: BracketChar[] = ['(', '[', '{', '}', ']', ')']

export function rollBracketNodes(rng: Rng = Math.random): BracketNode[] {
  const labels = [...BRACKET_SET]
  // Fisher–Yates
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[labels[i], labels[j]] = [labels[j], labels[i]]
  }
  const baseA = rng() * Math.PI * 2
  return labels.map((label, i) => {
    const a = baseA + (i / labels.length) * Math.PI * 2
    return {
      label,
      x: Math.cos(a) * BRACKET.ringRadius,
      z: Math.sin(a) * BRACKET.ringRadius,
      alive: true,
    }
  })
}

export function createBracketState(rng: Rng = Math.random): BracketState {
  return { nodes: rollBracketNodes(rng), stack: [], windowT: 0 }
}

export const isOpener = (c: BracketChar): boolean =>
  c === '(' || c === '[' || c === '{'

/** Would destroying `label` right now be valid? (Pure stack rule.) */
export function bracketShotValid(stack: BracketChar[], label: BracketChar): boolean {
  if (isOpener(label)) return true
  return stack.length > 0 && stack[stack.length - 1] === BRACKET_PAIRS[label]
}

export function tickBracket(s: BracketState, dt: number, rng: Rng = Math.random): MechEvent[] {
  if (s.windowT <= 0) return []
  s.windowT -= dt
  if (s.windowT <= 0) {
    s.windowT = 0
    s.nodes = rollBracketNodes(rng)
    s.stack = []
    return [{ type: 'close' }, { type: 'shuffle' }]
  }
  return []
}

/** A bolt destroyed node `i`. */
export function bracketShoot(
  s: BracketState,
  i: number,
  rng: Rng = Math.random,
): MechEvent[] {
  const node = s.nodes[i]
  if (!node || !node.alive || s.windowT > 0) return []
  if (!bracketShotValid(s.stack, node.label)) {
    // Wrong order — the beast feeds, the sigils re-arm shuffled.
    s.nodes = rollBracketNodes(rng)
    s.stack = []
    return [
      { type: 'mistake', reason: 'wrong-order' },
      { type: 'heal', amount: BRACKET.wrongHeal },
      { type: 'shuffle' },
    ]
  }
  node.alive = false
  if (isOpener(node.label)) s.stack.push(node.label)
  else s.stack.pop()
  if (s.nodes.every((n) => !n.alive)) {
    s.windowT = BRACKET.windowDur
    return [{ type: 'progress' }, { type: 'open', dur: BRACKET.windowDur }]
  }
  return [{ type: 'progress' }]
}

/** Which node the player is currently standing in (else -1). */
export function bracketTargetIndex(s: BracketState, px: number, pz: number): number {
  let best = -1
  let bestD: number = BRACKET.standRadius
  for (let i = 0; i < s.nodes.length; i++) {
    const n = s.nodes[i]
    if (!n.alive) continue
    const d = dist2(px, pz, n.x, n.z)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/* ====================================================================== */
/* 5 · SORTED SPHINX — sorted steps                                       */
/* ====================================================================== */

export interface SphinxConfig {
  tileCount: number
  timer: number
  windowDur: number
  ringMin: number
  ringMax: number
  tileRadius: number
  wrongZap: number
  /** Longest ascending route a roll may demand (see rollSphinxTiles). */
  maxRoute: number
}

export const SPHINX: SphinxConfig = {
  tileCount: 5,
  // Sized for ~5.8s of travel (52m route bound at run speed 9) plus five
  // 0.45s PLANTS (dwell accrues only while standing still — see BossArena).
  timer: 15,
  windowDur: 5,
  ringMin: 7,
  ringMax: 13,
  tileRadius: 2.4,
  wrongZap: 1,
  // 52m at run speed 9 ≈ 5.8s travel + 1.75s dwell inside the 14s timer —
  // demanding under fire, never impossible (QA: long rolls stalled runs).
  maxRoute: 52,
}

export interface SphinxTile extends Vec2 {
  value: number
  done: boolean
}

export interface SphinxState {
  tiles: SphinxTile[]
  timer: number
  windowT: number
  cfg: SphinxConfig
}

/** Total run distance of the ascending route across a tile set. */
export function sphinxRouteLength(tiles: readonly SphinxTile[]): number {
  const sorted = [...tiles].sort((a, b) => a.value - b.value)
  let len = 0
  for (let i = 1; i < sorted.length; i++) {
    len += dist2(sorted[i - 1].x, sorted[i - 1].z, sorted[i].x, sorted[i].z)
  }
  return len
}

export function rollSphinxTiles(rng: Rng = Math.random, cfg: SphinxConfig = SPHINX): SphinxTile[] {
  const rollOnce = (): SphinxTile[] => {
    const values = new Set<number>()
    // Bounded draw + deterministic fallback so a degenerate rng can't spin.
    let guard = 0
    while (values.size < cfg.tileCount && guard++ < 200) {
      values.add(1 + Math.floor(rng() * 99))
    }
    for (let v = 1; values.size < cfg.tileCount; v++) values.add(v)
    const baseA = rng() * Math.PI * 2
    return [...values].map((value, i) => {
      const a = baseA + (i / cfg.tileCount) * Math.PI * 2 + (rng() - 0.5) * 0.5
      const r = cfg.ringMin + rng() * (cfg.ringMax - cfg.ringMin)
      return { value, x: Math.cos(a) * r, z: Math.sin(a) * r, done: false }
    })
  }
  let tiles = rollOnce()
  for (let attempt = 0; attempt < 24 && sphinxRouteLength(tiles) > cfg.maxRoute; attempt++) {
    tiles = rollOnce()
  }
  if (sphinxRouteLength(tiles) > cfg.maxRoute) {
    // Deterministic fallback: chain values along nearest neighbours so the
    // ascending route follows proximity (short by construction).
    const remaining = [...tiles]
    const chain: SphinxTile[] = [remaining.shift()!]
    while (remaining.length > 0) {
      const last = chain[chain.length - 1]
      let bi = 0
      let bd = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const d = dist2(last.x, last.z, remaining[i].x, remaining[i].z)
        if (d < bd) {
          bd = d
          bi = i
        }
      }
      chain.push(remaining.splice(bi, 1)[0])
    }
    const values = [...tiles].map((t) => t.value).sort((a, b) => a - b)
    chain.forEach((tile, i) => {
      tile.value = values[i]
    })
  }
  // Hard guarantee: if the layout is still too spread (degenerate rng), pull
  // the tiles toward their centroid — route length scales with the spread.
  const route = sphinxRouteLength(tiles)
  if (route > cfg.maxRoute) {
    const cx = tiles.reduce((s2, t) => s2 + t.x, 0) / tiles.length
    const cz = tiles.reduce((s2, t) => s2 + t.z, 0) / tiles.length
    const k = cfg.maxRoute / route
    for (const t of tiles) {
      t.x = cx + (t.x - cx) * k
      t.z = cz + (t.z - cz) * k
    }
  }
  return tiles
}

export function createSphinxState(rng: Rng = Math.random, cfg: SphinxConfig = SPHINX): SphinxState {
  return { tiles: rollSphinxTiles(rng, cfg), timer: cfg.timer, windowT: 0, cfg }
}

/** The value the player must step on next (smallest not-done). */
export function sphinxNextValue(s: SphinxState): number | null {
  let next: number | null = null
  for (const t of s.tiles) {
    if (!t.done && (next === null || t.value < next)) next = t.value
  }
  return next
}

export function tickSphinx(s: SphinxState, dt: number, rng: Rng = Math.random): MechEvent[] {
  const events: MechEvent[] = []
  if (s.windowT > 0) {
    s.windowT -= dt
    if (s.windowT <= 0) {
      s.windowT = 0
      s.tiles = rollSphinxTiles(rng, s.cfg)
      s.timer = s.cfg.timer
      events.push({ type: 'close' }, { type: 'shuffle' })
    }
    return events
  }
  s.timer -= dt
  if (s.timer <= 0) {
    s.tiles = rollSphinxTiles(rng, s.cfg)
    s.timer = s.cfg.timer
    events.push({ type: 'mistake', reason: 'timeout' }, { type: 'shuffle' })
  }
  return events
}

/** The player stepped onto tile `i`. */
export function sphinxStep(s: SphinxState, i: number, rng: Rng = Math.random): MechEvent[] {
  const tile = s.tiles[i]
  if (!tile || tile.done || s.windowT > 0) return []
  const next = sphinxNextValue(s)
  if (next !== null && tile.value !== next) {
    s.tiles = rollSphinxTiles(rng, s.cfg)
    s.timer = s.cfg.timer
    return [
      { type: 'mistake', reason: 'wrong-order' },
      { type: 'zap', amount: s.cfg.wrongZap },
      { type: 'shuffle' },
    ]
  }
  tile.done = true
  if (s.tiles.every((t) => t.done)) {
    s.windowT = s.cfg.windowDur
    return [{ type: 'progress' }, { type: 'open', dur: s.cfg.windowDur }]
  }
  return [{ type: 'progress' }]
}

/** Which tile contains the player (else -1). Returns the NEAREST containing
 *  tile so compressed layouts with overlapping plates can never misregister. */
export function sphinxTileAt(s: SphinxState, px: number, pz: number): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i]
    if (t.done) continue
    const d = dist2(px, pz, t.x, t.z)
    if (d <= s.cfg.tileRadius && d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/* ====================================================================== */
/* ARCHITECT FINALE — twisted reprises + the unique Deletion Mark         */
/* ====================================================================== */

/** Damage the Architect takes while his phase ward is intact. */
export const WARD_CHIP_MUL = 0.12

/** Phase-2 twin seals: Twin-Key twisted into a movement test — the seals sit
 *  on OPPOSITE sides of him and must both be struck by MELEE within the link. */
export const ARCHITECT_SEALS: TwinKeyConfig = {
  cycle: 4.2,
  armDur: 3.4,
  // The seals sit on OPPOSITE sides of him — the charge covers the sprint.
  chargeDelay: 0.4,
  link: 2.2,
  windowDur: 4.0,
  regenHeal: 4,
}

/** Phase-3 sorted sigils: the Sphinx twisted — 4 plates, less time, heavier
 *  punishment, solved while his full late-phase roster rains down. */
export const ARCHITECT_SIGILS: SphinxConfig = {
  tileCount: 4,
  timer: 10,
  windowDur: 4.5,
  ringMin: 7,
  ringMax: 14,
  tileRadius: 2.6,
  wrongZap: 2,
  maxRoute: 48,
}

/** Per-phase ward instruction (persistent HUD line + phase-break flash). */
export function architectWardHint(phase: number): string {
  switch (phase) {
    case 1:
      return 'NO WARD · HIT HIM HARD — MELEE (Q) & RANGED (F)'
    case 2:
      return 'WARD · MELEE (Q) BOTH TWIN SEALS WITHIN THE LINK'
    case 3:
      return 'WARD · PLANT ON THE GLYPH SIGILS IN ASCENDING ORDER'
    default:
      return 'DELETION MARK · WHEN BRANDED, DASH (SHIFT) THROUGH HIM'
  }
}

/* ---- Phase 4 · DELETION MARK (unique) -------------------------------- */

export const MARK = {
  /** Seconds between brands — relentless: the finale phase IS this game. */
  every: 9,
  /** Fuse once branded. */
  fuse: 3.4,
  /** Dash-through transfer distance to the boss. */
  transferRadius: 2.8,
  /** Damage to the boss when the mark detonates on HIM. */
  bossDamage: 16,
  /** Damage window after a transferred detonation. */
  windowDur: 2.6,
  /** Damage to the player if the fuse runs out on THEM. */
  playerDamage: 3,
  /** Seconds between transfer and detonation on the boss. */
  returnFuse: 1.1,
} as const

export interface MarkState {
  phase: 'idle' | 'branded' | 'returned'
  t: number
  windowT: number
}

export function createMarkState(): MarkState {
  return { phase: 'idle', t: MARK.every * 0.55, windowT: 0 }
}

export function tickMark(s: MarkState, dt: number): MechEvent[] {
  const events: MechEvent[] = []
  if (s.windowT > 0) {
    s.windowT -= dt
    if (s.windowT <= 0) {
      s.windowT = 0
      events.push({ type: 'close' })
    }
  }
  s.t -= dt
  if (s.t > 0) return events
  if (s.phase === 'idle') {
    s.phase = 'branded'
    s.t = MARK.fuse
    events.push({ type: 'shuffle' }) // "you are marked" cue
  } else if (s.phase === 'branded') {
    // Fuse ran out on the player.
    s.phase = 'idle'
    s.t = MARK.every
    events.push(
      { type: 'zap', amount: MARK.playerDamage },
      { type: 'mistake', reason: 'mark-detonated' },
    )
  } else {
    // Returned mark detonates on the BOSS.
    s.phase = 'idle'
    s.t = MARK.every
    s.windowT = MARK.windowDur
    events.push(
      { type: 'heal', amount: -MARK.bossDamage },
      { type: 'open', dur: MARK.windowDur },
    )
  }
  return events
}

/** The player is dashing this frame at `dist` from the boss. */
export function markDashTransfer(s: MarkState, dist: number): MechEvent[] {
  if (s.phase !== 'branded' || dist > MARK.transferRadius) return []
  s.phase = 'returned'
  s.t = MARK.returnFuse
  return [{ type: 'progress' }]
}
