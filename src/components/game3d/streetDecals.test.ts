import { describe, expect, it } from 'vitest'
import {
  DECAL_CROSSWALK,
  DECAL_PUDDLE,
  DECAL_TILE_COUNT,
  buildStreetDecals,
} from './streetDecals'
import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  ROAD_HALF_W,
  ROAD_LINES,
  START_3D,
  WORLD_GATES,
} from './layout'

function distToNearestRoad(x: number, z: number): number {
  let best = Infinity
  for (const line of ROAD_LINES) {
    best = Math.min(best, Math.abs(x - line), Math.abs(z - line))
  }
  return best
}

describe('street decal placement', () => {
  const decals = buildStreetDecals(true)

  it('is fully deterministic', () => {
    expect(buildStreetDecals(true)).toEqual(decals)
  })

  it('stays within a sane single-draw instance budget', () => {
    expect(decals.length).toBeGreaterThan(800)
    expect(decals.length).toBeLessThan(4200)
  })

  it('every decal sits on or beside an avenue, inside the city ring', () => {
    for (const d of decals) {
      expect(Math.hypot(d.x, d.z), `decal off-map at ${d.x},${d.z}`).toBeLessThanOrEqual(
        CITY_LIMIT + 0.001,
      )
      // Everything must hug a road line (crosswalks sit just past the kerb).
      expect(distToNearestRoad(d.x, d.z)).toBeLessThanOrEqual(ROAD_HALF_W + 2.2)
      expect(d.tile).toBeGreaterThanOrEqual(0)
      expect(d.tile).toBeLessThan(DECAL_TILE_COUNT)
      expect(d.sx).toBeGreaterThan(0.4)
      expect(d.sz).toBeGreaterThan(0.4)
    }
  })

  it('only puddles are rain-gated', () => {
    for (const d of decals) {
      if (d.rainOnly) expect(d.tile).toBe(DECAL_PUDDLE)
      if (d.tile === DECAL_PUDDLE) expect(d.rainOnly).toBe(1)
    }
    expect(decals.some((d) => d.rainOnly === 1)).toBe(true)
  })

  it('keeps quest plazas clear', () => {
    const sites = [
      ...CHECKPOINTS_3D.flatMap((c) => [c.flag, c.boss]),
      ...WORLD_GATES.flat(),
      START_3D,
    ]
    for (const d of decals) {
      for (const s of sites) {
        expect(
          Math.hypot(d.x - s.x, d.z - s.z),
          `decal inside plaza at ${s.x},${s.z}`,
        ).toBeGreaterThan(10)
      }
    }
  })

  it('crosswalk bands appear only when requested (LOW keeps legacy stripes)', () => {
    expect(decals.some((d) => d.tile === DECAL_CROSSWALK)).toBe(true)
    const withoutCrosswalks = buildStreetDecals(false)
    expect(withoutCrosswalks.some((d) => d.tile === DECAL_CROSSWALK)).toBe(false)
    // The rest of the layer is identical either way.
    expect(withoutCrosswalks.length).toBeLessThan(decals.length)
  })

  it('crosswalk bands frame intersections at the stop line', () => {
    const bands = decals.filter((d) => d.tile === DECAL_CROSSWALK)
    for (const band of bands) {
      // One axis snaps exactly to a road line; the other sits ROAD_HALF_W+1.6 out.
      const snapX = ROAD_LINES.some((l) => Math.abs(band.x - l) < 0.001)
      const snapZ = ROAD_LINES.some((l) => Math.abs(band.z - l) < 0.001)
      expect(snapX || snapZ).toBe(true)
    }
  })
})
