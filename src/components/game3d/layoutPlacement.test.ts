import { afterEach, describe, expect, it } from 'vitest'
import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  COLLIDERS,
  LANDMARKS,
  ROAD_HALF_W,
  ROAD_LINES,
  SCENERY,
  START_3D,
  VAULT_CLEAR_TOP,
  WORLD_GATES,
  collidersNear,
  resetDynamicCollidersForTests,
  rotatedFootprint,
  setDynamicColliders,
} from './layout'

/* ============================================================================
   Placement realism invariants (July 2026 visual pass).

   The city generator must place props like a real city would: parked cars in
   the kerb lane of the asphalt (never on sidewalks, never in intersections),
   street furniture between crossings (never in the middle of a crossing
   street), benches facing the roadway, and street trees inside block
   parkway strips (never in the sidewalk or the asphalt).
   ========================================================================== */

const SIDEWALK = 4
const EDGE = ROAD_HALF_W + SIDEWALK

/** Distance from a 1-D coordinate to the nearest road centreline. */
function distToRoadLine(v: number): number {
  let best = Infinity
  for (const at of ROAD_LINES) best = Math.min(best, Math.abs(v - at))
  return best
}

describe('parked cars', () => {
  it('sit inside the asphalt kerb lane, aligned with their road', () => {
    for (const car of SCENERY.car) {
      const dx = distToRoadLine(car.x)
      const dz = distToRoadLine(car.z)
      const cross = Math.min(dx, dz) // distance to the road they park on
      // Lane centre 5.5m out; the 2m-wide body must stay inside the 7m asphalt.
      expect(cross).toBeGreaterThan(ROAD_HALF_W - 2.6)
      expect(cross + 1.0).toBeLessThanOrEqual(ROAD_HALF_W)
      // Aligned with the road axis: yaw is a multiple of π/2.
      const quarter = car.r / (Math.PI / 2)
      expect(Math.abs(quarter - Math.round(quarter))).toBeLessThan(1e-9)
    }
  })

  it('never park inside an intersection box or on the crosswalk stripes', () => {
    for (const car of SCENERY.car) {
      const dx = distToRoadLine(car.x)
      const dz = distToRoadLine(car.z)
      // The along-road coordinate (the axis further from its road line) must
      // clear the crossing road + crosswalk band (stripes sit at ±8.6m).
      const along = Math.max(dx, dz)
      expect(along).toBeGreaterThanOrEqual(ROAD_HALF_W + 6 - 3.001)
      // …and even with the ±3m slot jitter, never inside crossing asphalt.
      expect(along).toBeGreaterThan(ROAD_HALF_W + 2.6)
    }
  })
})

describe('street furniture', () => {
  it('lamps and benches never stand in a crossing street', () => {
    for (const list of [SCENERY.lamp, SCENERY.bench, SCENERY.trashCan]) {
      for (const p of list) {
        const dx = distToRoadLine(p.x)
        const dz = distToRoadLine(p.z)
        // Kerb props sit ~10m off their own road line; the other axis must be
        // outside the crossing road's asphalt entirely.
        expect(Math.max(dx, dz)).toBeGreaterThan(ROAD_HALF_W)
      }
    }
  })

  it('kerbside benches face the roadway (yaw turns the back to the block)', () => {
    let kerbBenches = 0
    for (const b of SCENERY.bench) {
      const dx = distToRoadLine(b.x)
      const dz = distToRoadLine(b.z)
      // Kerb benches hug a road at EDGE-1 = 10m; park benches sit deeper.
      if (Math.min(dx, dz) > EDGE) continue
      kerbBenches++
      // Front direction after yaw r is (sin r, cos r) — it must point toward
      // the road line the bench belongs to.
      const frontX = Math.sin(b.r)
      const frontZ = Math.cos(b.r)
      if (dx < dz) {
        // vertical road: must face ±x toward the centreline
        const toward = ROAD_LINES.reduce((s, at) => (Math.abs(b.x - at) < Math.abs(b.x - s) ? at : s))
        expect(Math.sign(frontX)).toBe(Math.sign(toward - b.x))
        expect(Math.abs(frontZ)).toBeLessThan(1e-9)
      } else {
        const toward = ROAD_LINES.reduce((s, at) => (Math.abs(b.z - at) < Math.abs(b.z - s) ? at : s))
        expect(Math.sign(frontZ)).toBe(Math.sign(toward - b.z))
        expect(Math.abs(frontX)).toBeLessThan(1e-9)
      }
    }
    expect(kerbBenches).toBeGreaterThan(100) // the kerb rows actually exist
  })
})

describe('street trees', () => {
  it('never stand in the sidewalk or the asphalt', () => {
    for (const t of SCENERY.tree) {
      const dx = distToRoadLine(t.x)
      const dz = distToRoadLine(t.z)
      // Block interiors start EDGE (11m) off the road centreline; a small
      // tolerance covers trunk radius at the parkway strip boundary.
      expect(Math.min(dx, dz)).toBeGreaterThan(EDGE - 1.65)
      // Never inside the asphalt or the walkable sidewalk band proper.
      expect(Math.min(dx, dz)).toBeGreaterThan(ROAD_HALF_W)
    }
  })

  it('the city still has a healthy tree population', () => {
    expect(SCENERY.tree.length).toBeGreaterThan(400)
  })
})

describe('spawn surroundings', () => {
  it('keeps the spawn plaza clear of parked cars', () => {
    for (const car of SCENERY.car) {
      expect(Math.hypot(car.x - START_3D.x, car.z - START_3D.z)).toBeGreaterThan(20)
    }
  })

  it('cars and lamps stay inside the city limit', () => {
    // (Trees/benches may drift a few metres past the limit — block edges and
    // kerb offsets apply after the generator's centre-point limit check.)
    for (const list of [SCENERY.car, SCENERY.lamp]) {
      for (const p of list) expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(CITY_LIMIT)
    }
  })

  it('does not trap the spawn point inside any collider', () => {
    for (const c of collidersNear(START_3D.x, START_3D.z)) {
      const inside =
        Math.abs(START_3D.x - c.x) < c.hw + 0.7 && Math.abs(START_3D.z - c.z) < c.hd + 0.7
      expect(inside).toBe(false)
    }
  })
})

describe('street-prop colliders (no walking through objects)', () => {
  /** Some collider must cover the prop's centre point. */
  function covered(x: number, z: number): boolean {
    return COLLIDERS.some((c) => Math.abs(x - c.x) <= c.hw && Math.abs(z - c.z) <= c.hd)
  }

  it('every lamp, planter, bench, hydrant, traffic light and trash can is solid', () => {
    for (const list of [
      SCENERY.lamp,
      SCENERY.planter,
      SCENERY.bench,
      SCENERY.hydrant,
      SCENERY.trafficLight,
      SCENERY.trashCan,
      SCENERY.tree,
    ]) {
      for (const p of list) {
        expect(covered(p.x, p.z), `prop at ${p.x},${p.z}`).toBe(true)
      }
    }
  })

  it('prop colliders stay small enough to vault and to keep sidewalks walkable', () => {
    // Anything bigger than a bench footprint must be a building/car/quest box.
    for (const c of COLLIDERS) {
      const area = c.hw * 2 * (c.hd * 2)
      if (area < 4) {
        expect(Math.max(c.hw, c.hd)).toBeLessThanOrEqual(1.2)
      }
    }
  })

  it('pole props (lamps, trees, traffic lights) are marked too tall to vault', () => {
    // The parkour vault disables collision pushout mid-air; a small-footprint
    // pole without a `top` would let the hero hurdle THROUGH the mast.
    const poleAt = (items: { x: number; z: number }[]) =>
      items.every((p) =>
        COLLIDERS.some(
          (c) =>
            Math.abs(p.x - c.x) <= c.hw &&
            Math.abs(p.z - c.z) <= c.hd &&
            c.top !== undefined &&
            c.top > VAULT_CLEAR_TOP,
        ),
      )
    expect(poleAt(SCENERY.lamp)).toBe(true)
    expect(poleAt(SCENERY.tree)).toBe(true)
    expect(poleAt(SCENERY.trafficLight)).toBe(true)
  })
})

describe('landmark footprints (no sprinting through monuments)', () => {
  it('every landmark anchor is covered by a solid collider', () => {
    for (const l of LANDMARKS) {
      const covered = collidersNear(l.pos.x, l.pos.z).some(
        (c) => Math.abs(l.pos.x - c.x) <= c.hw && Math.abs(l.pos.z - c.z) <= c.hd,
      )
      expect(covered, `landmark ${l.type} at ${l.pos.x},${l.pos.z}`).toBe(true)
    }
  })

  it('landmark colliders are never vault-eligible', () => {
    // The vault ceiling is VAULT_MAX_HALF (3m half-extent) in the controller;
    // every landmark box must exceed it on at least one axis so a sprint-jump
    // can never carry the hero through a monument.
    for (const l of LANDMARKS) {
      const boxes = collidersNear(l.pos.x, l.pos.z).filter(
        (c) => Math.hypot(l.pos.x - c.x, l.pos.z - c.z) <= 30 && Math.max(c.hw, c.hd) >= 3.2,
      )
      expect(boxes.length, `landmark ${l.type}`).toBeGreaterThan(0)
    }
  })

  it('landmark colliders never swallow a quest interaction point', () => {
    const questPoints = [
      START_3D,
      ...CHECKPOINTS_3D.flatMap((c) => [c.flag, c.boss]),
      ...WORLD_GATES.flat(),
    ]
    // Landmark footprints are the big boxes anchored at landmark positions
    // (quest buildings own their OWN footprints — the flag point sits inside
    // its academy box by design, with the door outside).
    const landmarkBoxes = COLLIDERS.filter(
      (c) =>
        Math.max(c.hw, c.hd) >= 3.2 &&
        LANDMARKS.some((l) => Math.hypot(l.pos.x - c.x, l.pos.z - c.z) <= 30),
    )
    for (const p of questPoints) {
      for (const c of landmarkBoxes) {
        const inside =
          Math.abs(p.x - c.x) < c.hw + 0.7 && Math.abs(p.z - c.z) < c.hd + 0.7
        expect(inside, `quest point ${p.x},${p.z} inside collider at ${c.x},${c.z}`).toBe(
          false,
        )
      }
    }
  })
})

describe('dynamic prop colliders', () => {
  afterEach(() => resetDynamicCollidersForTests())

  it('registered footprints join collidersNear and clear on unregister', () => {
    const x = START_3D.x + 5
    const z = START_3D.z + 5
    const before = collidersNear(x, z).length
    setDynamicColliders('test-props', [{ x, z, hw: 0.5, hd: 0.5 }])
    const during = collidersNear(x, z)
    expect(during.length).toBe(before + 1)
    expect(during.some((c) => c.x === x && c.z === z)).toBe(true)
    setDynamicColliders('test-props', [])
    expect(collidersNear(x, z).length).toBe(before)
  })

  it('static-only cells still resolve while the merged overlay is active elsewhere', () => {
    // The merged grid only materializes cells that contain dynamic colliders;
    // every other cell must fall through to the static grid untouched.
    const dynX = START_3D.x + 5
    const dynZ = START_3D.z + 5
    // A static-only probe point far from the dynamic registration (a kerb
    // lamp row exists along every road, so this returns a non-empty set).
    const staticX = START_3D.x + 200
    const staticZ = START_3D.z
    const before = collidersNear(staticX, staticZ)
    expect(before.length).toBeGreaterThan(0)
    setDynamicColliders('far-away-set', [{ x: dynX, z: dynZ, hw: 0.5, hd: 0.5 }])
    const during = collidersNear(staticX, staticZ)
    expect(during).toEqual(before)
    expect(collidersNear(dynX, dynZ).some((c) => c.x === dynX && c.z === dynZ)).toBe(true)
    setDynamicColliders('far-away-set', [])
  })

  it('owners replace their own set without stomping others', () => {
    const x = START_3D.x - 6
    const z = START_3D.z - 6
    const before = collidersNear(x, z).length
    setDynamicColliders('owner-a', [{ x, z, hw: 0.4, hd: 0.4 }])
    setDynamicColliders('owner-b', [{ x: x + 1, z, hw: 0.4, hd: 0.4 }])
    expect(collidersNear(x, z).length).toBe(before + 2)
    setDynamicColliders('owner-a', [{ x, z, hw: 0.6, hd: 0.6 }])
    expect(collidersNear(x, z).length).toBe(before + 2)
    setDynamicColliders('owner-b', [])
    expect(collidersNear(x, z).length).toBe(before + 1)
  })

  it('rotatedFootprint is rotation-aware and scale-aware', () => {
    const axis = rotatedFootprint(0, 0, 1.8, 0.7, 0)
    expect(axis.hw).toBeCloseTo(1.8)
    expect(axis.hd).toBeCloseTo(0.7)
    const quarter = rotatedFootprint(0, 0, 1.8, 0.7, Math.PI / 2)
    expect(quarter.hw).toBeCloseTo(0.7)
    expect(quarter.hd).toBeCloseTo(1.8)
    const diagonal = rotatedFootprint(0, 0, 1.8, 0.7, Math.PI / 4)
    expect(diagonal.hw).toBeCloseTo((1.8 + 0.7) / Math.SQRT2)
    expect(diagonal.hd).toBeCloseTo((1.8 + 0.7) / Math.SQRT2)
    const scaled = rotatedFootprint(0, 0, 1, 1, 0, 1.5)
    expect(scaled.hw).toBeCloseTo(1.5)
  })
})
