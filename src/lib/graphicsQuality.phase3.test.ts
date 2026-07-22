import { describe, expect, it } from 'vitest'
import { GRAPHICS_TIERS, profileForTier, type QualityProfile } from './graphicsQuality'

/* ============================================================================
   Phase 3 gating — facade pipeline, street decals, and city-life budgets.

   LOW is pinned to today's exact cost profile (legacy facades, no decals, no
   ambient life), and every Phase 3 cost is monotonic in tier. The draw-call
   delta model below is the budget CONTRACT for the render layer: each system
   maps to a fixed number of instanced draws, so the estimate is exact by
   construction (instancing means counts never change the draw total).
   ========================================================================== */

/**
 * Draw calls the road-strip merge reclaims on EVERY tier (38 planes → 1
 * merged mesh, shared material — Phase 3 ships this unconditionally).
 */
const ROAD_MERGE_RECLAIM = 37

/** Extra overworld draw calls a profile's tier-gated Phase 3 systems add. */
function phase3DrawCallAdds(p: QualityProfile): number {
  let adds = 0
  if (p.streetDecals) adds += 1 // StreetDecals instanced quad layer
  if (p.facadeMode !== 'legacy') {
    adds += 3 // BuildingDressing: crowns + awnings + holo-signs
    adds += 12 // DistrictAprons: ≤2 draws × 6 districts (when all resident)
    adds -= 1 // legacy crosswalk stripe draw replaced by the decal layer
  }
  if (p.cityLife.traffic > 0) adds += 2 // pods + glow pools
  if (p.cityLife.citizens > 0) adds += 2 // crowd + blob shadows
  if (p.cityLife.birds > 0) adds += 1
  if (p.cityLife.steam > 0) adds += 1
  if (p.cityLife.leaves > 0) adds += 1
  return adds
}

describe('Phase 3 feature gating', () => {
  it('matches the tier table for facades / decals / city life', () => {
    const table = {
      ultra: {
        facadeMode: 'atlas',
        streetDecals: true,
        facadeAtlasFull: true,
        cityLife: { traffic: 28, citizens: 14, birds: 10, steam: 36, leaves: 48 },
      },
      high: {
        facadeMode: 'atlas',
        streetDecals: true,
        facadeAtlasFull: true,
        cityLife: { traffic: 20, citizens: 10, birds: 8, steam: 28, leaves: 0 },
      },
      medium: {
        facadeMode: 'atlas',
        streetDecals: true,
        facadeAtlasFull: false,
        cityLife: { traffic: 14, citizens: 8, birds: 0, steam: 20, leaves: 0 },
      },
      low: {
        facadeMode: 'legacy',
        streetDecals: false,
        facadeAtlasFull: false,
        cityLife: { traffic: 0, citizens: 0, birds: 0, steam: 0, leaves: 0 },
      },
    } as const
    for (const tier of GRAPHICS_TIERS) {
      const p = profileForTier(tier, 2)
      expect({
        facadeMode: p.facadeMode,
        streetDecals: p.streetDecals,
        facadeAtlasFull: p.facadeAtlasFull,
        cityLife: p.cityLife,
      }).toEqual(table[tier])
    }
  })

  it('the deepest governor notch (internal LOW) adds ZERO phase-3 systems', () => {
    // Formerly the user-facing pinned-LOW contract; LOW survives only as the
    // FPS governor's safety floor, and it must stay the cheapest config.
    const p = profileForTier('low', 2)
    expect(p.facadeMode).toBe('legacy')
    expect(p.streetDecals).toBe(false)
    expect(Object.values(p.cityLife).every((v) => v === 0)).toBe(true)
    expect(phase3DrawCallAdds(p)).toBe(0)
  })

  it('city-life budgets are monotonic in tier', () => {
    const ranked = GRAPHICS_TIERS.map((t) => profileForTier(t, 2))
    const modeRank = { legacy: 0, atlas: 1, interior: 2 } as const
    for (let i = 1; i < ranked.length; i++) {
      const lo = ranked[i - 1]
      const hi = ranked[i]
      expect(hi.cityLife.traffic).toBeGreaterThanOrEqual(lo.cityLife.traffic)
      expect(hi.cityLife.citizens).toBeGreaterThanOrEqual(lo.cityLife.citizens)
      expect(hi.cityLife.birds).toBeGreaterThanOrEqual(lo.cityLife.birds)
      expect(hi.cityLife.steam).toBeGreaterThanOrEqual(lo.cityLife.steam)
      expect(hi.cityLife.leaves).toBeGreaterThanOrEqual(lo.cityLife.leaves)
      expect(modeRank[hi.facadeMode]).toBeGreaterThanOrEqual(modeRank[lo.facadeMode])
      expect(Number(hi.streetDecals)).toBeGreaterThanOrEqual(Number(lo.streetDecals))
    }
  })

  it('per-tier draw-call budget: the road merge funds every addition (net negative)', () => {
    // Even with every new system on screen, every tier lands BELOW today's
    // overworld draw-call count. The additions caps are the budget contract
    // the render layer must not silently outgrow.
    for (const tier of GRAPHICS_TIERS) {
      const adds = phase3DrawCallAdds(profileForTier(tier, 2))
      expect(adds).toBeLessThanOrEqual(22)
      expect(adds - ROAD_MERGE_RECLAIM).toBeLessThan(0)
    }
  })

  it('instance budgets stay inside the spec ceilings', () => {
    for (const tier of GRAPHICS_TIERS) {
      const p = profileForTier(tier, 2)
      expect(p.cityLife.traffic).toBeLessThanOrEqual(96)
      expect(p.cityLife.citizens).toBeLessThanOrEqual(72)
      expect(p.cityLife.birds).toBeLessThanOrEqual(48)
      expect(p.cityLife.steam).toBeLessThanOrEqual(160)
      expect(p.cityLife.leaves).toBeLessThanOrEqual(200)
    }
  })
})

/* ============================================================================
   REALISM REBUILD — overworld draw budget (July 2026, ULTRA-for-everyone).

   Every player loads at ULTRA; the internal notches below it exist only for
   the invisible FPS governor. The DELIBERATE ceilings, measured via
   scripts/debug-overworld-boot.mjs (real per-frame GL draw counts, shadow +
   post passes included):

     ULTRA (the product)        ≤260 day / ≤290 night
     governor notch 1 (high)    ≤230
     governor notch 2 (medium)  ≤180
     governor notch 3 (floor)   ≤112   (measured ~101/103)

   Node tests can't count GL draws; this block pins the AGREED numbers so a
   future renegotiation has to edit this file consciously, and the harness
   run measures the real values against them.
   ========================================================================== */
describe('Realism-rebuild draw budget contract (documented ceilings)', () => {
  const DRAW_BUDGETS = {
    low: { day: 112, night: 112 }, // governor safety floor
    medium: { day: 180, night: 180 },
    high: { day: 230, night: 230 },
    ultra: { day: 260, night: 290 }, // the product
  } as const

  it('budgets are monotonic and the floor stays cheap', () => {
    expect(DRAW_BUDGETS.low.day).toBeLessThanOrEqual(112)
    expect(DRAW_BUDGETS.medium.day).toBeLessThanOrEqual(DRAW_BUDGETS.high.day)
    expect(DRAW_BUDGETS.high.day).toBeLessThanOrEqual(DRAW_BUDGETS.ultra.day)
    expect(DRAW_BUDGETS.ultra.night).toBeLessThanOrEqual(290)
  })
})
