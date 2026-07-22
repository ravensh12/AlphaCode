import { describe, expect, it } from 'vitest'
import {
  GOVERNOR_DOWN_FPS,
  GOVERNOR_DOWN_HOLD_MS,
  GOVERNOR_MAX_NOTCH,
  GOVERNOR_UP_COOLDOWN_MS,
  GOVERNOR_UP_FPS,
  GOVERNOR_UP_HOLD_MS,
  JANK_DEMOTE_COUNT,
  JANK_FRAME_MAX_MS,
  JANK_FRAME_MS,
  JANK_WINDOW_MS,
  clampNotch,
  densityTierForNotch,
  governedProfile,
  initialGovernorState,
  stepGovernor,
  stepJankFrame,
  suggestBootNotch,
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
) {
  let s = state
  let now = startNow
  let changes = 0
  for (let i = 0; i < count; i++) {
    now += gapMs
    const step = stepJankFrame(s, frameMs, now)
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
