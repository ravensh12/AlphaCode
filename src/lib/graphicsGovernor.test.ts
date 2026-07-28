import { describe, expect, it } from 'vitest'
import {
  GOVERNOR_DOWN_FPS,
  GOVERNOR_DOWN_HOLD_MS,
  GOVERNOR_MAX_NOTCH,
  GOVERNOR_UP_COOLDOWN_MS,
  GOVERNOR_UP_FPS,
  GOVERNOR_UP_HOLD_MS,
  CADENCE_BREAK_RATIO,
  COST_EVIDENCE_MS,
  MAX_DISPLAY_INTERVAL_MS,
  JANK_DEMOTE_COUNT,
  JANK_FRAME_MAX_MS,
  JANK_FRAME_MS,
  JANK_WINDOW_MS,
  clampNotch,
  densityTierForNotch,
  frameJustifiesDemote,
  governedProfile,
  initialGovernorState,
  stepGovernor,
  stepJankFrame,
  suggestBootNotch,
  type FrameCost,
  type GovernorState,
} from './graphicsGovernor'
import { profileForTier } from './graphicsQuality'

/** Drive the governor with a constant FPS for a duration (1s samples). */
function run(state: GovernorState, fps: number, ms: number, startNow: number) {
  let s = state
  let now = startNow
  let changes = 0
  for (let t = 0; t < ms; t += 1000) {
    now += 1000
    const step = stepGovernor(s, fps, 1000, now)
    s = step.state
    if (step.changed) changes++
  }
  return { state: s, now, changes }
}

describe('FPS governor (the invisible quality net)', () => {
  it('starts at ULTRA and stays there while the frame rate holds', () => {
    const { state, changes } = run(initialGovernorState(), 60, 60_000, 0)
    expect(state.notch).toBe(0)
    expect(changes).toBe(0)
  })

  it('steps down after sustained sub-floor FPS — never instantly', () => {
    let s = initialGovernorState()
    // A single bad sample must NOT trip it (loading hitch, GC pause).
    s = stepGovernor(s, 12, 1000, 1000).state
    expect(s.notch).toBe(0)
    const after = run(s, 20, GOVERNOR_DOWN_HOLD_MS + 1000, 1000)
    expect(after.state.notch).toBe(1)
    expect(after.changes).toBe(1)
  })

  it('walks all the way to the safety floor under hopeless load, then stops', () => {
    const { state } = run(initialGovernorState(), 10, 120_000, 0)
    expect(state.notch).toBe(GOVERNOR_MAX_NOTCH)
  })

  it('recovers one notch after sustained good FPS, gated by the cooldown', () => {
    // Get to notch 1 first.
    const down = run(initialGovernorState(), 20, GOVERNOR_DOWN_HOLD_MS + 1000, 0)
    expect(down.state.notch).toBe(1)
    // Immediately good FPS: the cooldown forbids stepping up right away.
    const early = run(down.state, 60, GOVERNOR_UP_HOLD_MS, down.now)
    expect(early.state.notch).toBe(1)
    // After the cooldown + hold, it steps back up to ULTRA.
    const later = run(early.state, 60, GOVERNOR_UP_COOLDOWN_MS + GOVERNOR_UP_HOLD_MS, early.now)
    expect(later.state.notch).toBe(0)
  })

  it('mid-band FPS (between floor and recovery) holds the current notch', () => {
    const mid = (GOVERNOR_DOWN_FPS + GOVERNOR_UP_FPS) / 2
    const down = run(initialGovernorState(), 20, GOVERNOR_DOWN_HOLD_MS + 1000, 0)
    const hold = run(down.state, mid, 60_000, down.now)
    expect(hold.state.notch).toBe(1)
  })

  it('a good blip resets the below accumulator (no false step-down)', () => {
    let s = initialGovernorState()
    let now = 0
    for (let i = 0; i < 20; i++) {
      now += 1000
      // 2s bad, 1s good — always resets before DOWN_HOLD (2.5s).
      const fps = i % 3 === 2 ? 60 : 20
      s = stepGovernor(s, fps, 1000, now).state
    }
    expect(s.notch).toBe(0)
  })

  it('ignores nonsense samples', () => {
    let s = initialGovernorState()
    s = stepGovernor(s, NaN, 1000, 1000).state
    s = stepGovernor(s, -5, 1000, 2000).state
    s = stepGovernor(s, 60, 0, 3000).state
    expect(s).toEqual(initialGovernorState())
  })
})

/** Feed `count` long frames of `frameMs`, `gapMs` apart, starting at `now`. */
function runJank(
  state: GovernorState,
  count: number,
  frameMs: number,
  gapMs: number,
  startNow: number,
  cost?: FrameCost,
) {
  let s = state
  let now = startNow
  let changes = 0
  for (let i = 0; i < count; i++) {
    now += gapMs
    const step = stepJankFrame(s, frameMs, now, cost)
    s = step.state
    if (step.changed) changes++
  }
  return { state: s, now, changes }
}

describe('jank (long-frame) demote signal', () => {
  it('sustained long frames step the notch down once', () => {
    // Measured traversal jank: ~50ms frames arriving ~150ms apart (spiky
    // stream on a healthy-average fps) — trips within one window.
    const { state, changes } = runJank(initialGovernorState(), JANK_DEMOTE_COUNT, 50, 150, 0)
    expect(state.notch).toBe(1)
    expect(changes).toBe(1)
    expect(state.jankCount).toBe(0) // tally consumed by the step
  })

  it('a single hitch (or a small burst) never demotes', () => {
    // A GC pause / late shader compile: a burst of 4 long frames, then quiet.
    const burst = runJank(initialGovernorState(), 4, 80, 30, 0)
    expect(burst.state.notch).toBe(0)
    // Normal frames never even touch the tally (fast path).
    const s = stepJankFrame(burst.state, 16.7, burst.now + 100).state
    expect(s).toBe(burst.state)
  })

  it('isolated hitches minutes apart never accumulate (rolling window)', () => {
    let s = initialGovernorState()
    let now = 0
    // One long frame every 10s — the window (4s) restarts every time.
    for (let i = 0; i < 40; i++) {
      now += 10_000
      s = stepJankFrame(s, 60, now).state
    }
    expect(s.notch).toBe(0)
    expect(s.jankCount).toBe(1)
  })

  it(`needs ${JANK_DEMOTE_COUNT} long frames INSIDE one ${JANK_WINDOW_MS}ms window`, () => {
    // 11 in-window then the window lapses: the next long frame starts fresh.
    const eleven = runJank(initialGovernorState(), JANK_DEMOTE_COUNT - 1, 50, 200, 0)
    expect(eleven.state.notch).toBe(0)
    const later = stepJankFrame(eleven.state, 50, eleven.now + JANK_WINDOW_MS + 500).state
    expect(later.notch).toBe(0)
    expect(later.jankCount).toBe(1)
  })

  it('suspension artifacts (huge frames) are ignored', () => {
    let s = initialGovernorState()
    for (let i = 0; i < 30; i++) {
      s = stepJankFrame(s, JANK_FRAME_MAX_MS + 500, 1000 + i * 100).state
    }
    expect(s).toEqual(initialGovernorState())
    expect(stepJankFrame(s, NaN, 5000).state).toEqual(initialGovernorState())
  })

  it('a jank demote arms the shared promote cooldown (no oscillation)', () => {
    const down = runJank(initialGovernorState(), JANK_DEMOTE_COUNT, 50, 150, 0)
    expect(down.state.notch).toBe(1)
    expect(down.state.cooldownUntil).toBe(down.now + GOVERNOR_UP_COOLDOWN_MS)
    // Immediately-good fps cannot promote until the cooldown lapses…
    const early = run(down.state, 60, GOVERNOR_UP_HOLD_MS, down.now)
    expect(early.state.notch).toBe(1)
    // …after cooldown + sustained hold, quality visibly recovers.
    const later = run(early.state, 60, GOVERNOR_UP_COOLDOWN_MS + GOVERNOR_UP_HOLD_MS, early.now)
    expect(later.state.notch).toBe(0)
  })

  it('keeps stepping down under sustained jank, clamped at the floor', () => {
    let s = initialGovernorState()
    let now = 0
    // Relentless 50ms frames for a minute: walks 0 → 3, never past.
    for (let i = 0; i < 1200; i++) {
      now += 50
      s = stepJankFrame(s, 50, now).state
    }
    expect(s.notch).toBe(GOVERNOR_MAX_NOTCH)
  })

  it('frames at exactly the threshold do not count', () => {
    const s = stepJankFrame(initialGovernorState(), JANK_FRAME_MS, 1000).state
    expect(s).toEqual(initialGovernorState())
  })

  it('an fps-path notch change clears the jank tally (no double demote)', () => {
    // Build up a near-trip tally, then let the average-fps path demote.
    const almost = runJank(initialGovernorState(), JANK_DEMOTE_COUNT - 1, 50, 100, 0)
    expect(almost.state.jankCount).toBe(JANK_DEMOTE_COUNT - 1)
    const down = run(almost.state, 20, GOVERNOR_DOWN_HOLD_MS + 1000, almost.now)
    expect(down.state.notch).toBe(1)
    expect(down.state.jankCount).toBe(0)
    // One more long frame right after must NOT instantly demote again.
    const after = stepJankFrame(down.state, 50, down.now + 100).state
    expect(after.notch).toBe(1)
    expect(after.jankCount).toBe(1)
  })
})

/* --------------------------------------------------------- cost evidence */

/** A frame that arrived late because the DISPLAY only presents that often:
 *  cheap to produce, and exactly on the beat every time. These are the
 *  numbers from the production capture that motivated the gate — frame delta
 *  p50 33.2ms, of which 3.0ms was JavaScript and 2.4ms was inside gl.render. */
const cappedPresentation: FrameCost = { workMs: 5.4, floorMs: 33.2 }
/** A frame that arrived late because the machine was busy making it. */
const expensiveFrame: FrameCost = { workMs: COST_EVIDENCE_MS + 6, floorMs: 16.7 }
/** A cheap frame that still broke the beat — GPU-bound stutter on a 60Hz
 *  display, where most frames make 16.7ms and the bad ones do not. This is
 *  the traversal profile the jank signal was built for. */
const stutter: FrameCost = { workMs: 4, floorMs: 16.7 }
/** The device the governor exists for: a GPU so far behind that EVERY frame
 *  is slow, so the beat never breaks, while the main thread sits idle waiting
 *  on it so no work is recorded either. Nothing about this frame is unusual
 *  for this machine — which is exactly why it must still count. */
const uniformlySlow: FrameCost = { workMs: 6, floorMs: 190 }

describe('cost evidence (late frame vs expensive frame)', () => {
  it('treats an expensive frame as evidence whatever the cadence', () => {
    expect(frameJustifiesDemote(40, expensiveFrame)).toBe(true)
  })

  it('treats a cheap frame that broke the cadence as evidence', () => {
    expect(frameJustifiesDemote(40, stutter)).toBe(true)
    // Exactly at the ratio is still the beat, not a break.
    expect(frameJustifiesDemote(16.7 * CADENCE_BREAK_RATIO, stutter)).toBe(false)
  })

  it('does NOT treat a cheap frame on a steady capped cadence as evidence', () => {
    expect(frameJustifiesDemote(33.2, cappedPresentation)).toBe(false)
    // p95 of that same capture — still the beat, with jitter.
    expect(frameJustifiesDemote(35.9, cappedPresentation)).toBe(false)
  })

  it('falls back to the old always-demote behaviour without usable evidence', () => {
    expect(frameJustifiesDemote(40)).toBe(true)
    expect(frameJustifiesDemote(40, { workMs: Number.NaN, floorMs: 16.7 })).toBe(true)
    expect(frameJustifiesDemote(40, { workMs: 5, floorMs: 0 })).toBe(true)
  })

  it('never accepts a beat slower than any display can present as "the cadence"', () => {
    // The hole the gate would otherwise have: uniformly slow frames never
    // break their own cadence, and a GPU-bound main thread records no work,
    // so a 5fps machine would be excused forever.
    expect(frameJustifiesDemote(200, uniformlySlow)).toBe(true)
    expect(frameJustifiesDemote(MAX_DISPLAY_INTERVAL_MS + 1, { workMs: 2, floorMs: 43 })).toBe(true)
    // Right at the limit, a real 24Hz cinema-mode panel is still believed.
    expect(frameJustifiesDemote(41.7, { workMs: 2, floorMs: 41.7 })).toBe(false)
  })

})

describe('a capped display must not ratchet quality away', () => {
  // The failure this was written for: a production capture where the window
  // presented at 30Hz while frames cost ~5ms to make. Every frame read as
  // jank, the ladder walked ULTRA → safety floor, and because a capped
  // display can never report the promote fps it stayed there for the session.
  it('ignores a relentless stream of cheap, on-cadence 33ms frames', () => {
    const capped = runJank(initialGovernorState(), 1200, 33.5, 33.5, 0, cappedPresentation)
    expect(capped.state.notch).toBe(0)
    expect(capped.state.jankCount).toBe(0)
    expect(capped.changes).toBe(0)
  })

  it('ignores sub-floor fps when the frames were cheap to produce', () => {
    let s = initialGovernorState()
    let now = 0
    for (let t = 0; t < 60_000; t += 1000) {
      now += 1000
      s = stepGovernor(s, 30, 1000, now, cappedPresentation).state
    }
    expect(s.notch).toBe(0)
    expect(s.belowMs).toBe(0)
  })

  it('still demotes when the SAME low fps comes with expensive frames', () => {
    const busy: FrameCost = { workMs: 30, floorMs: 16.7 }
    let s = initialGovernorState()
    let now = 0
    for (let t = 0; t < GOVERNOR_DOWN_HOLD_MS + 2000; t += 1000) {
      now += 1000
      s = stepGovernor(s, 30, 1000, now, busy).state
    }
    expect(s.notch).toBe(1)
  })

  it('still demotes on genuine GPU-bound stutter (cheap frames, broken beat)', () => {
    const janky = runJank(initialGovernorState(), JANK_DEMOTE_COUNT, 50, 150, 0, stutter)
    expect(janky.state.notch).toBe(1)
    expect(janky.changes).toBe(1)
  })

  it('still rescues a machine that is uniformly, hopelessly slow', () => {
    // Every frame 200ms, main thread idle, cadence never broken. The gate has
    // no local evidence at all here — only the knowledge that no display runs
    // this slowly — and this is the device the ladder matters most for.
    const hopeless = runJank(initialGovernorState(), 200, 200, 200, 0, uniformlySlow)
    expect(hopeless.state.notch).toBe(GOVERNOR_MAX_NOTCH)

    let s = initialGovernorState()
    let now = 0
    for (let t = 0; t < 60_000; t += 1000) {
      now += 1000
      s = stepGovernor(s, 5, 1000, now, uniformlySlow).state
    }
    expect(s.notch).toBe(GOVERNOR_MAX_NOTCH)
  })

  it('holds position on ambiguous frames instead of promoting on them', () => {
    // Cheap on-cadence frames are not evidence in EITHER direction. Counting
    // them as recovery was tried and made a spiky GPU-bound machine sawtooth
    // between notches forever: the jank path demoted on the spikes while the
    // fps path read the cheap mean as recovery, every ~11 seconds.
    let s = { ...initialGovernorState(), notch: 2 }
    let now = 0
    for (let t = 0; t < 120_000; t += 1000) {
      now += 1000
      s = stepGovernor(s, 30, 1000, now, cappedPresentation).state
    }
    expect(s.notch).toBe(2)
    expect(s.aboveMs).toBe(0)
    expect(s.belowMs).toBe(0)
  })

  it('does not sawtooth when a spiky GPU-bound machine is cheap on average', () => {
    // The measured fanless profile: a 16.7ms median with ~7 long frames a
    // second, averaging 45.7fps. The jank path should demote it and it should
    // then STAY demoted, not be promoted straight back by the cheap average.
    let s = initialGovernorState()
    let now = 0
    let changes = 0
    for (let sample = 0; sample < 180; sample++) {
      for (let f = 0; f < 53; f++) {
        now += 16.7
        const step = stepJankFrame(s, 16.7, now, stutter)
        s = step.state
        if (step.changed) changes++
      }
      for (let f = 0; f < 7; f++) {
        now += 50
        const step = stepJankFrame(s, 50, now, stutter)
        s = step.state
        if (step.changed) changes++
      }
      const step = stepGovernor(s, 45.7, 1000, now, { workMs: 6, floorMs: 16.7 })
      s = step.state
      if (step.changed) changes++
    }
    expect(s.notch).toBe(GOVERNOR_MAX_NOTCH)
    // Three demotes to reach the floor, and then nothing — no oscillation.
    expect(changes).toBe(GOVERNOR_MAX_NOTCH)
  })

  it('KNOWN LIMIT: a display that slows mid-session still demotes once', () => {
    // Documented rather than fixed. For the few seconds the cadence floor
    // still remembers the faster display, every frame on the new slower beat
    // reads as a cadence break, and the jank path reaches the floor before
    // the meter catches up. It is unfixable from these numbers — a display
    // slowing and a scene falling behind are the same measurement — and it is
    // the behaviour that shipped before the cost gate existed, so the gate
    // has not made it worse. It only affects a display that changes rate
    // DURING a session; a session that boots on a capped display is fine, and
    // that is the case the gate was built for (see the tests above).
    const wasFast: FrameCost = { workMs: 5, floorMs: 16.7 }
    const slowed = runJank(initialGovernorState(), JANK_DEMOTE_COUNT, 33.8, 33.8, 0, wasFast)
    expect(slowed.state.notch).toBe(1)

    // Once the floor has learned the new beat, it settles and stops.
    let s = slowed.state
    let now = slowed.now
    for (let i = 0; i < 600; i++) {
      now += 33.8
      s = stepJankFrame(s, 33.8, now, { workMs: 5, floorMs: 33.3 }).state
    }
    expect(s.notch).toBe(1)
  })

  it('promotion is unaffected — good fps still recovers quality', () => {
    let s = initialGovernorState(2)
    let now = 0
    for (let t = 0; t < GOVERNOR_UP_HOLD_MS + 2000; t += 1000) {
      now += 1000
      s = stepGovernor(s, 60, 1000, now, cappedPresentation).state
    }
    expect(s.notch).toBe(1)
  })
})

describe('device-aware boot notch', () => {
  it('boots capable desktops at ULTRA', () => {
    expect(
      suggestBootNotch({
        devicePixelRatio: 2,
        deviceMemoryGb: 16,
        hardwareConcurrency: 12,
        mobileLike: false,
      }),
    ).toBe(0)
  })

  it('steps mobile / low-memory / low-core devices down before first paint', () => {
    expect(suggestBootNotch({ mobileLike: true, devicePixelRatio: 2 })).toBe(2)
    expect(
      suggestBootNotch({
        mobileLike: false,
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        devicePixelRatio: 2,
      }),
    ).toBe(2)
    expect(
      suggestBootNotch({
        mobileLike: false,
        deviceMemoryGb: 16,
        hardwareConcurrency: 4,
        devicePixelRatio: 2,
      }),
    ).toBe(2)
  })

  it('starts mid-tier machines one notch below ULTRA', () => {
    expect(
      suggestBootNotch({
        mobileLike: false,
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
        devicePixelRatio: 2,
      }),
    ).toBe(1)
    expect(
      suggestBootNotch({
        mobileLike: false,
        deviceMemoryGb: 16,
        hardwareConcurrency: 12,
        devicePixelRatio: 3,
      }),
    ).toBe(1)
  })
})

describe('notch → profile mapping', () => {
  it('notch 0 is exactly the ULTRA profile', () => {
    expect(governedProfile(0, 2)).toEqual(profileForTier('ultra', 2))
  })

  it('deeper notches keep the ULTRA pipeline shape (no recompile levers)', () => {
    const ultra = profileForTier('ultra', 2)
    for (const notch of [1, 2, 3]) {
      const p = governedProfile(notch, 2)
      // Pinned: changing these mid-session recompiles every lit shader.
      expect(p.shadowCascades).toBe(ultra.shadowCascades)
      expect(p.facadeMode).toBe(ultra.facadeMode)
      expect(p.hdriEnvironment).toBe(ultra.hdriEnvironment)
      expect(p.facadeAtlasFull).toBe(ultra.facadeAtlasFull)
      expect(p.buildingShadowCasters).toBe(ultra.buildingShadowCasters)
      // Traded: resolution + post + instance densities only.
      expect(p.dpr.max).toBeLessThan(ultra.dpr.max)
      expect(p.godRays).toBe(false)
    }
  })

  it('density levers fall monotonically with the notch', () => {
    const notches = [0, 1, 2, 3].map((n) => governedProfile(n, 2))
    for (let i = 1; i < notches.length; i++) {
      expect(notches[i].dpr.max).toBeLessThanOrEqual(notches[i - 1].dpr.max)
      expect(notches[i].cityLife.traffic).toBeLessThanOrEqual(notches[i - 1].cityLife.traffic)
      expect(notches[i].cityLife.citizens).toBeLessThanOrEqual(notches[i - 1].cityLife.citizens)
      expect(notches[i].rainParticles).toBeLessThanOrEqual(notches[i - 1].rainParticles)
      expect(notches[i].shadowMapScale).toBeLessThanOrEqual(notches[i - 1].shadowMapScale)
    }
    expect(densityTierForNotch(0)).toBe('ultra')
    expect(densityTierForNotch(1)).toBe('high')
    expect(densityTierForNotch(2)).toBe('medium')
    expect(densityTierForNotch(3)).toBe('low')
  })

  it('clamps out-of-range notches', () => {
    expect(clampNotch(-2)).toBe(0)
    expect(clampNotch(99)).toBe(GOVERNOR_MAX_NOTCH)
    expect(governedProfile(99, 2).dpr.max).toBe(governedProfile(3, 2).dpr.max)
  })
})
