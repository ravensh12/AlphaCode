import { describe, expect, it } from 'vitest'
import {
  GRAPHICS_TIERS,
  clampSimTier,
  meetsTier,
  profileForTier,
  resolveQualityProfile,
  simTierForDpr,
  tierRank,
} from './graphicsQuality'

/* ============================================================================
   Smooth-first (July 2026): resolveQualityProfile still returns the ULTRA
   shape for non-overworld callers; the overworld boots via resolveBootNotch
   + governedProfile. Sub-ULTRA profiles are the FPS governor's internal
   notch ladder (graphicsGovernor.test.ts).
   ========================================================================== */

describe('tier ordering (internal notch ladder)', () => {
  it('ranks low < medium < high < ultra', () => {
    expect(GRAPHICS_TIERS).toEqual(['low', 'medium', 'high', 'ultra'])
    expect(tierRank('low')).toBeLessThan(tierRank('medium'))
    expect(tierRank('medium')).toBeLessThan(tierRank('high'))
    expect(tierRank('high')).toBeLessThan(tierRank('ultra'))
  })

  it('meetsTier gates manifest minimums', () => {
    expect(meetsTier('high', 'medium')).toBe(true)
    expect(meetsTier('medium', 'medium')).toBe(true)
    expect(meetsTier('low', 'medium')).toBe(false)
  })

  it('clampSimTier caps the cinematic ladder', () => {
    expect(clampSimTier('high', 'med')).toBe('med')
    expect(clampSimTier('low', 'high')).toBe('low')
    expect(clampSimTier('med', 'med')).toBe('med')
  })
})

describe('ULTRA product profile', () => {
  it('resolveQualityProfile returns the ULTRA profile', () => {
    const p = resolveQualityProfile({ webgl2: true, devicePixelRatio: 2 })
    expect(p).toEqual(profileForTier('ultra', 2))
    expect(p.tier).toBe('ultra')
  })

  it('is safe without a window (SSR/tests): defaults to dpr 1', () => {
    expect(() => resolveQualityProfile()).not.toThrow()
    expect(resolveQualityProfile().tier).toBe('ultra')
  })
})

describe('internal notch profiles (the governor ladder)', () => {
  it('start dpr never exceeds the device pixel ratio', () => {
    for (const tier of GRAPHICS_TIERS) {
      expect(profileForTier(tier, 1).dpr.start).toBeLessThanOrEqual(1)
    }
  })

  it('dpr windows are sane (min ≤ start ≤ max) on every notch', () => {
    for (const tier of GRAPHICS_TIERS) {
      const p = profileForTier(tier, 2)
      expect(p.dpr.min).toBeLessThanOrEqual(p.dpr.start)
      expect(p.dpr.start).toBeLessThanOrEqual(p.dpr.max)
    }
  })

  it('simTierForDpr derives from dpr and honors the notch cap', () => {
    const ultra = profileForTier('ultra', 2)
    expect(simTierForDpr(1.5, ultra)).toBe('high')
    expect(simTierForDpr(1.0, ultra)).toBe('med')
    const medium = profileForTier('medium', 2)
    expect(simTierForDpr(1.35, medium)).toBe('med')
    const low = profileForTier('low', 2)
    expect(simTierForDpr(1.35, low)).toBe('low')
  })

  it('every cost is monotonic up the ladder (a deeper notch never adds work)', () => {
    const ranked = GRAPHICS_TIERS.map((t) => profileForTier(t, 2))
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].shadowCascades).toBeGreaterThanOrEqual(ranked[i - 1].shadowCascades)
      expect(ranked[i].rainParticles).toBeGreaterThanOrEqual(ranked[i - 1].rainParticles)
      expect(ranked[i].dpr.max).toBeGreaterThanOrEqual(ranked[i - 1].dpr.max)
      expect(Number(ranked[i].buildingShadowCasters)).toBeGreaterThanOrEqual(
        Number(ranked[i - 1].buildingShadowCasters),
      )
      expect(Number(ranked[i].hdriEnvironment)).toBeGreaterThanOrEqual(
        Number(ranked[i - 1].hdriEnvironment),
      )
      expect(Number(ranked[i].godRays)).toBeGreaterThanOrEqual(Number(ranked[i - 1].godRays))
    }
  })

  it('ULTRA (the product) is tuned for sustained smoothness', () => {
    const p = profileForTier('ultra', 2)
    // One near cascade — a second mid-box was pure headroom tax under fog.
    expect(p.shadowCascades).toBe(1)
    expect(p.buildingShadowCasters).toBe(false)
    expect(p.hdriEnvironment).toBe(true)
    expect(p.godRays).toBe(false)
    // Atlas (not interior parallax): the room ray-march was the skyline's
    // #1 fragment cost and a common WebGL context-loss trigger.
    expect(p.facadeMode).toBe('atlas')
    expect(p.streetDecals).toBe(true)
    // Boot at native-ish so the heavy HIGH post stack stays off until the
    // PerformanceMonitor proves headroom (simTier climbs past 1.15).
    expect(p.dpr).toEqual({ start: 1.0, min: 0.75, max: 1.15 })
  })

  it('LOW (the deepest safety floor) is the cheapest configuration', () => {
    const p = profileForTier('low', 2)
    expect(p.shadowCascades).toBe(1)
    expect(p.buildingShadowCasters).toBe(false)
    expect(p.hdriEnvironment).toBe(false)
    expect(p.rainParticles).toBe(0)
    expect(p.facadeMode).toBe('legacy')
    expect(p.streetDecals).toBe(false)
    expect(p.cityLife).toEqual({ traffic: 0, citizens: 0, birds: 0, steam: 0, leaves: 0 })
  })
})
