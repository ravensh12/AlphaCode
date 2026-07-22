import { describe, expect, it } from 'vitest'
import {
  DISTRICT_COUNT,
  DISTRICT_THEMES,
  buildBuildingDressing,
  buildingAppearance,
  districtIndexAt,
  furnitureTint,
  positionHash,
} from './districtTheme'
import { FACADE_STYLE_COUNT } from './facadeAtlas'
import { CHECKPOINTS_3D, COLLIDERS, SCENERY } from './layout'

describe('district identities', () => {
  it('defines exactly six themes in realm order with valid style tiles', () => {
    expect(DISTRICT_THEMES).toHaveLength(DISTRICT_COUNT)
    DISTRICT_THEMES.forEach((theme, i) => {
      expect(theme.index).toBe(i)
      for (const style of theme.styles) {
        expect(style).toBeGreaterThanOrEqual(0)
        expect(style).toBeLessThan(FACADE_STYLE_COUNT)
      }
      expect(theme.wallPalette.length).toBeGreaterThanOrEqual(4)
      expect(theme.litBias).toBeGreaterThan(0)
      expect(theme.litBias).toBeLessThanOrEqual(1)
      for (const hex of [...theme.wallPalette, ...theme.roofPalette, theme.accent, theme.bench, theme.planter, theme.canopyTint]) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
      }
    })
  })

  it('maps every Academy flag to its own district', () => {
    CHECKPOINTS_3D.forEach((c, i) => {
      expect(districtIndexAt(c.flag.x, c.flag.z)).toBe(i)
    })
  })

  it('positionHash is deterministic and in [0, 1)', () => {
    for (const [x, z] of [[0, 0], [-321.5, 88.25], [694, -694]]) {
      const a = positionHash(x, z, 7)
      expect(a).toBe(positionHash(x, z, 7))
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThan(1)
    }
  })

  it('every city building gets a deterministic, valid appearance', () => {
    for (const b of SCENERY.building) {
      const a1 = buildingAppearance(b)
      const a2 = buildingAppearance(b)
      expect(a1).toEqual(a2)
      expect(a1.district).toBeGreaterThanOrEqual(0)
      expect(a1.district).toBeLessThan(DISTRICT_COUNT)
      expect(a1.style).toBeGreaterThanOrEqual(0)
      expect(a1.style).toBeLessThan(FACADE_STYLE_COUNT)
      expect(a1.litBias).toBeGreaterThan(0)
      expect(a1.litBias).toBeLessThanOrEqual(1)
    }
  })

  it('district style variety: at least 5 distinct styles across the skyline', () => {
    const styles = new Set(SCENERY.building.map((b) => buildingAppearance(b).style))
    expect(styles.size).toBeGreaterThanOrEqual(5)
  })
})

describe('building dressing (silhouette variety)', () => {
  const dressing = buildBuildingDressing()

  it('is deterministic', () => {
    const again = buildBuildingDressing()
    expect(again.crowns).toEqual(dressing.crowns)
    expect(again.awnings).toEqual(dressing.awnings)
    expect(again.signs).toEqual(dressing.signs)
  })

  it('produces a healthy amount of dressing without exploding instance counts', () => {
    expect(dressing.crowns.length).toBeGreaterThan(20)
    expect(dressing.crowns.length).toBeLessThan(600)
    expect(dressing.awnings.length).toBeGreaterThan(20)
    expect(dressing.awnings.length).toBeLessThan(900)
    expect(dressing.signs.length).toBeGreaterThan(20)
    expect(dressing.signs.length).toBeLessThan(900)
  })

  it('crowns sit on their building roofs, inside the collider footprint', () => {
    for (const crown of dressing.crowns) {
      // A crown must be fully inside SOME building collider (its own).
      const inside = COLLIDERS.some(
        (c) =>
          Math.abs(crown.x - c.x) + crown.sx / 2 <= c.hw + 0.01 &&
          Math.abs(crown.z - c.z) + crown.sz / 2 <= c.hd + 0.01,
      )
      expect(inside, `crown at ${crown.x},${crown.z}`).toBe(true)
      expect(crown.y).toBeGreaterThan(9) // above the shortest building body
    }
  })

  it('awnings and signs hang above walking head height', () => {
    for (const a of dressing.awnings) expect(a.y).toBeGreaterThanOrEqual(2.6)
    for (const s of dressing.signs) expect(s.y).toBeGreaterThanOrEqual(4)
  })

  it('signs carry valid glyph tiles and the neon quarter runs the densest RATE', () => {
    const signCount = new Array(DISTRICT_COUNT).fill(0)
    const eligible = new Array(DISTRICT_COUNT).fill(0)
    for (const s of dressing.signs) {
      expect(s.glyph).toBeGreaterThanOrEqual(0)
      expect(s.glyph).toBeLessThan(8)
      signCount[districtIndexAt(s.x, s.z)]++
    }
    for (const b of SCENERY.building) {
      if (b.kind !== 'shop') eligible[districtIndexAt(b.x, b.z)]++
    }
    // Density is a per-building probability — downtown owns far more towers,
    // so compare RATES: the violet quarter must run the hottest signage.
    const rates = signCount.map((n, i) => (eligible[i] > 0 ? n / eligible[i] : 0))
    expect(rates[2]).toBe(Math.max(...rates))
    expect(rates[2]).toBeGreaterThan(rates[0] * 2)
  })
})

describe('street furniture tints', () => {
  it('returns the owning district palette at each Academy plaza', () => {
    CHECKPOINTS_3D.forEach((c, i) => {
      expect(furnitureTint('bench', c.flag.x, c.flag.z)).toBe(DISTRICT_THEMES[i].bench)
      expect(furnitureTint('planter', c.flag.x, c.flag.z)).toBe(DISTRICT_THEMES[i].planter)
      expect(furnitureTint('canopy', c.flag.x, c.flag.z)).toBe(DISTRICT_THEMES[i].canopyTint)
    })
  })
})
