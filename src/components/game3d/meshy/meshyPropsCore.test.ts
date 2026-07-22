/// <reference types="node" />
import { existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MESHY_ASSETS, MESHY_MANIFEST, meshyAsset } from '../../../content/assets/meshyManifest'
import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  SCENERY,
  START_3D,
  WORLD_GATES,
} from '../layout'
import {
  ARENA_DRESSING_MODELS,
  BUILDING_FOOTPRINTS_H30,
  BUILDING_MAX_STRETCH,
  BUILDING_POOLS,
  buildingFitDistortion,
  CELL_SIGNATURE_KINDS,
  DOJO_DRESSING,
  DOJO_DRESSING_MODELS,
  LANDMARK_MODEL_BY_INDEX,
  LANDMARK_REPLACEABLE_MASK,
  MESHY_CELLS,
  MESHY_MODEL_SPECS,
  SIGNATURE_MODEL,
  SPAWN_CELL_INDEX,
  SPAWN_SHOWPIECE_MODEL,
  buildSignalSpire,
  buildSpawnShowpiece,
  benchModelForDistrict,
  benchSwapYaw,
  buildArenaDressingPlacements,
  buildGritBatches,
  buildMeshyBuildingPlan,
  buildRooftopBatches,
  buildSignaturePlacements,
  buildStorefrontBatches,
  buildStreetBatches,
  buildingModelAt,
  buildingRingRadii,
  collidersForPlacements,
  keptStreetProps,
  lodId,
  meshyPropFootprint,
  signatureModelFor,
  meshyCountScale,
  meshyRadiusScale,
  modelsForCell,
  pickModelId,
  specForModel,
  streetCellKeyAt,
  streetCellsFor,
  streetModelsForTier,
  streetRingRadii,
  vehicleModelAt,
  type MeshySignatureKind,
  type MeshySwapKind,
} from './meshyPropsCore'
import {
  getMeshySwapSnapshot,
  resetMeshySwapStateForTests,
  setMeshyLandmarkState,
  setMeshyStreetCells,
  setMeshySwapState,
  subscribeMeshySwaps,
} from './meshySwap'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../../public')

const SWAP_KINDS: MeshySwapKind[] = [
  'tree',
  'bench',
  'trashCan',
  'planter',
  'hydrant',
  'lamp',
  'car',
]

describe('meshy manifest ↔ model registry consistency', () => {
  it('every registry spec resolves to a manifest entry and a file on disk', () => {
    for (const id of Object.keys(MESHY_MODEL_SPECS)) {
      const entry = meshyAsset(id)
      expect(entry, `spec ${id} missing from meshyManifest`).toBeTruthy()
      const file = join(PUBLIC_DIR, entry!.url)
      expect(existsSync(file), `${id} missing at public/${entry!.url}`).toBe(true)
      expect(statSync(file).size, `${id} bytes drifted — re-run meshy:optimize`).toBe(
        entry!.bytes,
      )
    }
  })

  it('every manifest entry has a normalization spec (nothing ships unspecced)', () => {
    for (const entry of MESHY_ASSETS) {
      if (entry.category === 'character') continue // skinned rigs normalize at runtime
      // Wave-1 ids come from the explicit registry; wave-2 ids resolve
      // through the keyword rules — either way a spec must exist.
      expect(specForModel(entry.id), `no spec for ${entry.id}`).toBeTruthy()
    }
  })

  it('scene model references all exist in the manifest', () => {
    const referenced = new Set<string>([
      ...Object.values(SIGNATURE_MODEL),
      ...LANDMARK_MODEL_BY_INDEX,
      ...DOJO_DRESSING_MODELS,
      ...ARENA_DRESSING_MODELS,
      ...MESHY_CELLS.flatMap((_, cell) => modelsForCell(cell)),
      benchModelForDistrict(0),
      benchModelForDistrict(3),
      'vehicle-hoverbike',
      'interact-arcade-cabinet',
      'interact-camera-tripod',
      'interact-parcel-box',
      'vehicle-courier-drone',
      'street-holo-kiosk',
    ])
    for (const id of referenced) {
      expect(MESHY_MANIFEST[id], `referenced model ${id} not in manifest`).toBeTruthy()
    }
  })
})

describe('tier scaling', () => {
  it('LOW never dresses anything; scales grow monotonically with tier', () => {
    expect(meshyRadiusScale('low')).toBe(0)
    expect(meshyCountScale('low')).toBe(0)
    expect(meshyRadiusScale('medium')).toBeGreaterThan(0)
    expect(meshyRadiusScale('high')).toBeGreaterThan(meshyRadiusScale('medium'))
    expect(meshyRadiusScale('ultra')).toBeGreaterThanOrEqual(meshyRadiusScale('high'))
    expect(meshyCountScale('ultra')).toBe(1)
  })
})

describe('street-grid partition (kept + rendered == original)', () => {
  const RINGS = streetCellsFor(-444, 370, 160, 320)

  it('empty rings return the ORIGINAL SCENERY array identity (LOW contract)', () => {
    for (const kind of SWAP_KINDS) {
      expect(keptStreetProps(kind, [], [])).toBe(SCENERY[kind])
    }
    expect(streetCellsFor(0, 0, 0, 0)).toEqual({ near: [], mid: [] })
  })

  it('rings partition every list (nothing renders twice; mid trees only thin)', () => {
    const batches = buildStreetBatches(RINGS.near, RINGS.mid, 0.65)
    let rendered = 0
    for (const items of batches.values()) rendered += items.length
    let hidden = 0
    for (const kind of SWAP_KINDS) {
      hidden += SCENERY[kind].length - keptStreetProps(kind, RINGS.near, RINGS.mid).length
    }
    // Graphics purity: EVERY primitive in a live cell hides. The Meshy side
    // renders all of the NEAR ring but only the density-kept fraction of MID
    // trees — so rendered ≤ hidden, never the other way (a double-render
    // would z-fight; a primitive leak would read blocky).
    expect(rendered).toBeLessThanOrEqual(hidden)
    // Everything hidden but not rendered must be a MID-cell tree (thinning).
    const nearSet = new Set(RINGS.near)
    let midTrees = 0
    for (const item of SCENERY.tree) {
      const key = streetCellKeyAt(item.x, item.z)
      if (!nearSet.has(key) && RINGS.mid.includes(key)) midTrees++
    }
    expect(hidden - rendered).toBeLessThanOrEqual(midTrees)
    expect(rendered).toBeGreaterThan(50) // the shell is a real crowd of props
  })

  it('rendered instances sit at exact seeded transforms (colliders intact)', () => {
    const batches = buildStreetBatches(RINGS.near, RINGS.mid, 0.65)
    const seeded = new Set<string>()
    for (const kind of SWAP_KINDS) {
      for (const item of SCENERY[kind]) seeded.add(`${item.x}:${item.z}`)
    }
    for (const items of batches.values()) {
      for (const item of items) {
        expect(seeded.has(`${item.x}:${item.z}`), `foreign transform at ${item.x},${item.z}`).toBe(true)
      }
    }
  })

  it('is deterministic and rings cover the primitive cull bubbles', () => {
    expect(buildStreetBatches(RINGS.near, RINGS.mid, 0.65)).toEqual(
      buildStreetBatches(RINGS.near, RINGS.mid, 0.65),
    )
    expect(streetRingRadii('low')).toEqual({ near: 0, mid: 0, midDensity: 0 })
    // Graphics-purity contract: at EVERY mounted tier the NEAR ring covers
    // the primitive prop cull radius (cullRadius 300 × 0.55 = 165m) and the
    // MID ring covers the tree cull radius (300 × 0.7 = 210m), so blocky
    // primitives are never inside the visible bubble. Density is the only
    // tier lever.
    for (const tier of ['medium', 'high', 'ultra'] as const) {
      expect(streetRingRadii(tier).near).toBeGreaterThanOrEqual(165)
      expect(streetRingRadii(tier).mid).toBeGreaterThanOrEqual(210)
      expect(streetRingRadii(tier).midDensity).toBeGreaterThan(0)
    }
    expect(streetRingRadii('ultra').midDensity).toBeGreaterThan(
      streetRingRadii('medium').midDensity,
    )
    expect(streetModelsForTier('low')).toEqual([])
    // Every mounted tier streams the full furniture inventory now (MEDIUM
    // included — a governor step-down must never bring back primitive props).
    for (const tier of ['medium', 'high', 'ultra'] as const) {
      expect(streetModelsForTier(tier).length).toBeGreaterThan(10)
    }
  })

  it('building rings stay tighter than the street shell (their own knob)', () => {
    expect(buildingRingRadii('low')).toEqual({ near: 0, mid: 0, midDensity: 0 })
    expect(buildingRingRadii('ultra').near).toBeGreaterThan(buildingRingRadii('high').near)
    expect(buildingRingRadii('medium').near).toBe(0)
    expect(buildingRingRadii('medium').mid).toBeGreaterThan(0) // towers still swap
  })

  it('closest-point membership: every prop within the radius is in a live cell', () => {
    const px = -444
    const pz = 370
    const { near } = streetCellsFor(px, pz, 170, 215)
    const nearSet = new Set(near)
    for (const kind of SWAP_KINDS) {
      for (const item of SCENERY[kind]) {
        if (Math.hypot(item.x - px, item.z - pz) > 170) continue
        expect(
          nearSet.has(streetCellKeyAt(item.x, item.z)),
          `${kind}@${item.x},${item.z} within 170m but not in a NEAR cell`,
        ).toBe(true)
      }
    }
  })
})

describe('wave-2 band builders (land-when-ready)', () => {
  const RINGS = streetCellsFor(-444, 370, 160, 320)

  it('render nothing while no wave-2 models exist', () => {
    const rooftop = buildRooftopBatches(RINGS.near, [])
    expect(rooftop.batches.size).toBe(0)
    expect(rooftop.coversTanks).toBe(false)
    expect(rooftop.coversAc).toBe(false)
    expect(buildStorefrontBatches(RINGS.near, []).size).toBe(0)
    expect(buildGritBatches(RINGS.near, []).size).toBe(0)
  })

  it('rooftop band adopts tank/antenna/hvac ids and covers the roof lists', () => {
    const available = ['rooftop-water-tower', 'rooftop-antenna-cluster', 'rooftop-hvac-unit']
    const { batches, coversTanks, coversAc } = buildRooftopBatches(RINGS.near, available)
    expect(coversTanks).toBe(true)
    expect(coversAc).toBe(true)
    let placed = 0
    for (const [id, items] of batches) {
      // Shell batches ship as LOD variants of the landed ids.
      expect(id.startsWith('lod:')).toBe(true)
      expect(available).toContain(id.slice(4))
      placed += items.length
      for (const item of items) {
        expect(item.y).toBeGreaterThan(5) // rides its building's roof height
      }
    }
    const nearSet = new Set(RINGS.near)
    const expected =
      SCENERY.rooftop.filter((i) => nearSet.has(streetCellKeyAtTest(i.x, i.z))).length +
      SCENERY.ac.filter((i) => nearSet.has(streetCellKeyAtTest(i.x, i.z))).length
    expect(placed).toBe(expected)
  })

  it('storefront band dresses only the shops the primitive awnings skip', () => {
    const available = ['storefront-awning-canvas', 'storefront-blade-sign', 'storefront-box-sign']
    const batches = buildStorefrontBatches(RINGS.near, available)
    let placed = 0
    for (const items of batches.values()) placed += items.length
    expect(placed).toBeGreaterThan(0)
  })

  it('grit stays out of quest clearings and inside the city ring', () => {
    const available = ['street-dumpster', 'street-scaffolding', 'street-billboard-freestanding']
    const batches = buildGritBatches(RINGS.near, available)
    for (const items of batches.values()) {
      for (const item of items) {
        expect(Math.hypot(item.x, item.z)).toBeLessThanOrEqual(CITY_LIMIT)
      }
    }
  })

  it('specForModel: wave-1 registry first, then keyword rules, else undefined', () => {
    expect(specForModel('street-lamp-led')).toBe(MESHY_MODEL_SPECS['street-lamp-led'])
    expect(specForModel('rooftop-water-tower')?.targetHeight).toBe(4.6)
    expect(specForModel('nature-tree-oak')?.targetHeight).toBe(6.2)
    expect(specForModel('vehicle-city-bus')?.yawOffset).toBe(-Math.PI / 2)
    expect(specForModel('mystery-thing')).toBeUndefined()
    expect(pickModelId(['b-awning', 'a-awning'], 'awning')).toBe('a-awning')
    expect(pickModelId([], 'awning')).toBeNull()
  })
})

// Local twin of streetCellKeyAt for count assertions (import kept minimal).
function streetCellKeyAtTest(x: number, z: number): number {
  const ix = Math.round(x / 74)
  const iz = Math.round(z / 74)
  return (ix + 10) * 21 + (iz + 10)
}

describe('signature placements', () => {
  const CLEARINGS = [
    ...CHECKPOINTS_3D.map((c) => ({ p: c.flag, r: 22 })),
    ...CHECKPOINTS_3D.map((c) => ({ p: c.boss, r: 22 })),
    ...WORLD_GATES.flatMap((gates) => gates.map((g) => ({ p: g, r: 20 }))),
    { p: START_3D, r: 20 },
  ]

  it('every cell places its palette, deterministically, inside the city ring', () => {
    for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
      const a = buildSignaturePlacements(cell, 1)
      const b = buildSignaturePlacements(cell, 1)
      expect([...a.keys()]).toEqual([...b.keys()])
      for (const kind of Object.keys(CELL_SIGNATURE_KINDS[cell] ?? {})) {
        const items = a.get(kind as MeshySignatureKind) ?? []
        expect(items.length, `${kind} empty for cell ${cell}`).toBeGreaterThan(0)
        for (const item of items) {
          expect(Math.hypot(item.x, item.z)).toBeLessThanOrEqual(CITY_LIMIT)
        }
      }
      for (const [kind, items] of a) {
        expect(items).toEqual(b.get(kind))
      }
    }
  })

  it('keeps quest plazas clear (same principle as the street decals)', () => {
    for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
      for (const [kind, items] of buildSignaturePlacements(cell, 1)) {
        if (kind === 'bollard') continue // bollard rows deliberately seal plaza approaches
        for (const item of items) {
          for (const clearing of CLEARINGS) {
            const d = Math.hypot(clearing.p.x - item.x, clearing.p.z - item.z)
            expect(
              d,
              `${kind} at (${item.x.toFixed(1)}, ${item.z.toFixed(1)}) inside clearing`,
            ).toBeGreaterThanOrEqual(clearing.r)
          }
        }
      }
    }
  })

  it('bollard rows stay on the road surface at the plaza approaches', () => {
    for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
      const items = buildSignaturePlacements(cell, 1).get('bollard') ?? []
      for (const item of items) {
        // Within the 7m half-width of the plaza's vertical road.
        expect(Math.abs(item.x - MESHY_CELLS[cell].x)).toBeLessThanOrEqual(7)
        expect(Math.abs(item.z - MESHY_CELLS[cell].z)).toBeCloseTo(26, 5)
      }
    }
  })

  it('count scaling trims but never zeroes a kind the palette wants', () => {
    for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
      const full = buildSignaturePlacements(cell, 1)
      const trimmed = buildSignaturePlacements(cell, 0.6)
      for (const [kind, items] of full) {
        const t = trimmed.get(kind) ?? []
        expect(t.length).toBeGreaterThan(0)
        expect(t.length).toBeLessThanOrEqual(items.length)
      }
    }
  })
})

describe('district flavor', () => {
  it('Old Town and Mountain Outskirts take the classic bench; Neon glows', () => {
    expect(benchModelForDistrict(3)).toBe('street-bench-classic')
    expect(benchModelForDistrict(5)).toBe('street-bench-classic')
    expect(benchModelForDistrict(0)).toBe('street-bench-modern')
    expect(benchModelForDistrict(2)).toBe('street-bench-neon')
    // Availability-gated: before the neon bench lands, Neon keeps the modern.
    expect(benchModelForDistrict(2, new Set(['street-bench-modern']))).toBe(
      'street-bench-modern',
    )
  })

  it('swapped kerb benches face their road; park benches keep seeded yaw', () => {
    // Vertical-road kerb strips sit at x = line ± 10 (layout.ts): the seat
    // must turn toward the asphalt, whichever side it stands on.
    expect(benchSwapYaw({ x: 74 + 10, z: 33, r: 0 })).toBe(-Math.PI / 2)
    expect(benchSwapYaw({ x: 74 - 10, z: 33, r: 0 })).toBe(Math.PI / 2)
    expect(benchSwapYaw({ x: -148 + 10, z: -200.33, r: 0 })).toBe(-Math.PI / 2)
    // Horizontal-road kerb strips at z = line ± 10.
    expect(benchSwapYaw({ x: 27.33, z: -74 + 10, r: Math.PI / 2 })).toBe(Math.PI)
    expect(benchSwapYaw({ x: 27.33, z: -74 - 10, r: Math.PI / 2 })).toBe(0)
    // Park benches live in block interiors (>11m off every line): untouched.
    expect(benchSwapYaw({ x: 37, z: 24, r: Math.PI / 2 })).toBe(Math.PI / 2)
    expect(benchSwapYaw({ x: 100, z: 140, r: 0 })).toBe(0)
  })

  it('every real seeded bench resolves to a deterministic finite yaw', () => {
    for (const bench of SCENERY.bench) {
      const yaw = benchSwapYaw(bench)
      expect(Number.isFinite(yaw)).toBe(true)
      expect(benchSwapYaw(bench)).toBe(yaw)
    }
  })

  it('vehicle picks are deterministic and manifest-valid', () => {
    for (const prop of SCENERY.car.slice(0, 200)) {
      const id = vehicleModelAt(prop.x, prop.z)
      expect(vehicleModelAt(prop.x, prop.z)).toBe(id)
      expect(MESHY_MANIFEST[id]).toBeTruthy()
    }
  })

  it('spawn cell exists and every cell inventory is manifest-valid', () => {
    expect(SPAWN_CELL_INDEX).toBe(MESHY_CELLS.length - 1)
    for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
      const ids = modelsForCell(cell)
      expect(ids.length).toBeGreaterThan(0)
      for (const id of ids) expect(MESHY_MANIFEST[id]).toBeTruthy()
    }
  })
})

describe('real building set (tier 7)', () => {
  // Every model id the district pools can reach (the landed manifest at ship).
  const ALL_BUILDING_IDS = new Set<string>(
    Object.values(BUILDING_POOLS).flatMap((byKind) => Object.values(byKind).flat()),
  )
  const RINGS = streetCellsFor(-444, 370, 160, 320)

  it('every pool id resolves through specForModel (nothing ships unspecced)', () => {
    for (const id of ALL_BUILDING_IDS) {
      expect(specForModel(id), `no spec for building ${id}`).toBeTruthy()
    }
  })

  it('buildingModelAt is deterministic, pool-valid, and null when nothing landed', () => {
    for (const b of SCENERY.building.slice(0, 300)) {
      expect(buildingModelAt(b, new Set())).toBeNull()
      const id = buildingModelAt(b, ALL_BUILDING_IDS)
      expect(buildingModelAt(b, ALL_BUILDING_IDS)).toBe(id)
      if (id) expect(ALL_BUILDING_IDS.has(id)).toBe(true)
    }
  })

  it('every pool id has a measured natural footprint (the anti-melt gate)', () => {
    for (const id of ALL_BUILDING_IDS) {
      expect(BUILDING_FOOTPRINTS_H30[id], `no measured footprint for ${id}`).toBeTruthy()
    }
  })

  it('never assigns a model whose box fit smears it past the stretch bound', () => {
    for (const b of SCENERY.building) {
      const id = buildingModelAt(b, ALL_BUILDING_IDS)
      if (!id) continue
      expect(buildingFitDistortion(id, b.w, b.h, b.d)).toBeLessThanOrEqual(
        BUILDING_MAX_STRETCH,
      )
    }
  })

  it('the gate keeps meaningful coverage (the set still reads as a real city)', () => {
    const byKind: Record<string, { swapped: number; total: number }> = {}
    for (const b of SCENERY.building) {
      byKind[b.kind] ??= { swapped: 0, total: 0 }
      byKind[b.kind].total++
      if (buildingModelAt(b, ALL_BUILDING_IDS)) byKind[b.kind].swapped++
    }
    // Shops and mids carry the street-level look — most must still swap.
    expect(byKind.shop.swapped / byKind.shop.total).toBeGreaterThan(0.5)
    expect(byKind.mid.swapped / byKind.mid.total).toBeGreaterThan(0.4)
    // Phase 2 (July 2026): the crown/twin/terraced/blade towers were
    // generated WITH tall-thin proportions, so most tower boxes now pass the
    // anti-melt gate legitimately (the per-slot distortion test above still
    // bounds every fit). The skyline is expected to be mostly modeled.
    expect(byKind.tower.swapped / byKind.tower.total).toBeGreaterThan(0.7)
  })

  it('distortion metric: uniform fit = 1, degenerate/unknown = Infinity', () => {
    const f = BUILDING_FOOTPRINTS_H30['bld-slab-tower']
    expect(buildingFitDistortion('bld-slab-tower', f.x * 2, 60, f.z * 2)).toBeCloseTo(1)
    expect(buildingFitDistortion('bld-slab-tower', f.x * 3, 30, f.z)).toBeCloseTo(3)
    expect(buildingFitDistortion('no-such-model', 10, 30, 10)).toBe(Infinity)
  })

  it('empty near ring → empty plan', () => {
    const plan = buildMeshyBuildingPlan([], ALL_BUILDING_IDS)
    expect(plan.groups.size).toBe(0)
    expect(plan.indices).toEqual([])
  })

  it('plan partitions cleanly: indices == placements, all inside the near ring', () => {
    const plan = buildMeshyBuildingPlan(RINGS.near, ALL_BUILDING_IDS)
    const near = new Set(RINGS.near)
    let placed = 0
    const seen = new Set<number>()
    for (const [key, items] of plan.groups) {
      // Shell batches ship as LOD variants of a landed id.
      expect(key.startsWith('lod:')).toBe(true)
      expect(ALL_BUILDING_IDS.has(key.slice(4))).toBe(true)
      placed += items.length
      for (const { index, building } of items) {
        expect(near.has(streetCellKeyAtTest(building.x, building.z))).toBe(true)
        expect(seen.has(index), `index ${index} rendered twice`).toBe(false)
        seen.add(index)
      }
    }
    expect(placed).toBe(plan.indices.length)
    expect(plan.indices).toEqual([...plan.indices].sort((a, b) => a - b))
    expect(plan.indices.length).toBeGreaterThan(0)
  })

  it('is deterministic and leaves unlanded slots primitive (partial manifest)', () => {
    expect(buildMeshyBuildingPlan(RINGS.near, ALL_BUILDING_IDS)).toEqual(
      buildMeshyBuildingPlan(RINGS.near, ALL_BUILDING_IDS),
    )
    // Only glass-tower-a landed: every rendered slot must map to it.
    const partial = new Set(['bld-glass-tower-a'])
    for (const [key] of buildMeshyBuildingPlan(RINGS.near, partial).groups) {
      expect(key).toBe('lod:bld-glass-tower-a')
    }
  })
})

describe('signal spire', () => {
  it('is availability-gated, deterministic, and crowns a central tall tower', () => {
    expect(buildSignalSpire(new Set())).toBeNull()
    const a = buildSignalSpire(new Set(['landmark-signal-spire']))
    const b = buildSignalSpire(new Set(['landmark-signal-spire']))
    expect(a).toEqual(b)
    expect(a).toBeTruthy()
    if (!a) return
    expect(a.model).toBe('landmark-signal-spire')
    const t = a.building
    expect(SCENERY.building[a.index]).toBe(t)
    expect(t.kind).toBe('tower')
    expect(t.h).toBeGreaterThanOrEqual(46)
    expect(Math.hypot(t.x, t.z)).toBeLessThanOrEqual(150)
  })

  it('the building plan never double-renders a showpiece slot', () => {
    const available = new Set(['landmark-signal-spire', 'bld-tower-crown', 'bld-tower-blade'])
    const spire = buildSignalSpire(available)
    expect(spire).toBeTruthy()
    if (!spire) return
    const rings = streetCellsFor(spire.building.x, spire.building.z, 160, 320)
    const plan = buildMeshyBuildingPlan(
      rings.near,
      available,
      SCENERY.building,
      rings.mid,
      new Set([spire.index]),
    )
    expect(plan.indices).not.toContain(spire.index)
  })
})

describe('spawn showpiece', () => {
  it('is availability-gated and deterministic', () => {
    expect(buildSpawnShowpiece(new Set())).toBeNull()
    const a = buildSpawnShowpiece(new Set([SPAWN_SHOWPIECE_MODEL]))
    const b = buildSpawnShowpiece(new Set([SPAWN_SHOWPIECE_MODEL]))
    expect(a).toEqual(b)
  })

  it('lands on a prominent primitive building near the spawn street', () => {
    const placement = buildSpawnShowpiece(new Set([SPAWN_SHOWPIECE_MODEL]))
    expect(placement).toBeTruthy()
    if (!placement) return
    expect(placement.model).toBe(SPAWN_SHOWPIECE_MODEL)
    const b = placement.building
    expect(SCENERY.building[placement.index]).toBe(b)
    const d = Math.hypot(b.x - START_3D.x, b.z - START_3D.z)
    expect(d).toBeGreaterThanOrEqual(26)
    expect(d).toBeLessThanOrEqual(120)
    // The fit must survive the same anti-melt gate as the full building swap.
    expect(
      buildingFitDistortion(SPAWN_SHOWPIECE_MODEL, b.w, b.h, b.d),
    ).toBeLessThanOrEqual(BUILDING_MAX_STRETCH)
  })

  it('the generated model shipped with a measured footprint + manifest entry', () => {
    expect(BUILDING_FOOTPRINTS_H30[SPAWN_SHOWPIECE_MODEL]).toBeTruthy()
    expect(meshyAsset(SPAWN_SHOWPIECE_MODEL)).toBeTruthy()
    expect(specForModel(SPAWN_SHOWPIECE_MODEL)).toBeTruthy()
  })
})

describe('landmarks', () => {
  it('maps every landmark index to its realm-hinted model', () => {
    expect(LANDMARK_MODEL_BY_INDEX).toEqual([
      'landmark-observatory-dome',
      'landmark-bridge-pylon',
      'landmark-spiral-tower',
      'landmark-district-gate',
      'landmark-lighthouse',
      'landmark-wind-turbine',
    ])
    // Index 5 keeps its cliff — the turbine is additive, never a replacement.
    expect(LANDMARK_REPLACEABLE_MASK & (1 << 5)).toBe(0)
    expect(LANDMARK_REPLACEABLE_MASK).toBe(0b11111)
  })
})

describe('arena dressing', () => {
  it('places every prop between the play boundary and the wall', () => {
    for (const arenaRadius of [23, 26]) {
      const bound = arenaRadius - 3 // BOUND is ARENA_R-3 in.both arenas
      const wall = arenaRadius + 2.6
      const { obelisks, pylons, firewalls } = buildArenaDressingPlacements(arenaRadius)
      expect(obelisks).toHaveLength(4)
      expect(pylons).toHaveLength(3)
      expect(firewalls).toHaveLength(3)
      for (const item of [...obelisks, ...pylons, ...firewalls]) {
        const r = Math.hypot(item.x, item.z)
        expect(r).toBeGreaterThan(bound)
        expect(r).toBeLessThan(wall)
      }
    }
  })

  it('keeps the thin firewall panels outside the boss camera clamp ring', () => {
    // BossArena clamps its chase camera to ARENA_R + 0.6. A panel whose
    // whole depth (~0.4m) sits inside that ring can end up ENTIRELY between
    // the camera and the fight when the hero hugs the play boundary — a
    // full-frame black plank (see artifacts/visual-qa/arena-boss-firewall-
    // aligned.png from the QA run that caught it). Keep panel centres at
    // least 1m outside the arena radius so the inner face stays behind the
    // worst-case camera. Obelisks/pylons are deep enough to always extend
    // past the clamp, so they can never sit wholly in front of it.
    for (const arenaRadius of [23, 26]) {
      const { firewalls } = buildArenaDressingPlacements(arenaRadius)
      for (const item of firewalls) {
        expect(Math.hypot(item.x, item.z)).toBeGreaterThanOrEqual(
          arenaRadius + 1.0 - 1e-9,
        )
      }
    }
  })
})

describe('dojo dressing', () => {
  it('places all nine pieces inside the room, clear of interaction anchors', () => {
    const ids = new Set(DOJO_DRESSING.map((d) => d.id))
    expect([...ids].sort()).toEqual(
      [
        'dojo-brass-orrery',
        'dojo-conveyor-unit',
        'dojo-crane-gantry',
        'dojo-display-plinth',
        'dojo-holo-console',
        'dojo-server-rack',
        'dojo-switchboard-panel',
        'dojo-vault-door',
        'dojo-workbench',
      ].sort(),
    )
    for (const item of DOJO_DRESSING) {
      expect(Math.abs(item.x)).toBeLessThanOrEqual(13)
      expect(Math.abs(item.z)).toBeLessThanOrEqual(13)
      // Exit door footprint at (-7.2, -12.84): keep a walkable gap.
      expect(Math.hypot(item.x - -7.2, item.z - -12.84)).toBeGreaterThan(2)
      // Explore-wing machine bay at (-8.4, 3.2), radius ~4.4.
      expect(Math.hypot(item.x - -8.4, item.z - 3.2)).toBeGreaterThan(3.6)
      // Terminal dais at (8.6, 2.6).
      expect(Math.hypot(item.x - 8.6, item.z - 2.6)).toBeGreaterThan(2.4)
    }
  })
})

describe('meshy swap store', () => {
  it('publishes tear-free snapshots and resets to the idle identity', () => {
    resetMeshySwapStateForTests()
    const idle = getMeshySwapSnapshot()
    expect(idle.mask).toBe(0)
    expect(idle.radiusScale).toBe(0)
    expect(idle.landmarkMask).toBe(0)
    expect(idle.nearCells).toEqual([])
    expect(idle.midCells).toEqual([])

    let notified = 0
    const unsubscribe = subscribeMeshySwaps(() => notified++)
    setMeshySwapState(0b11, 0.85)
    expect(getMeshySwapSnapshot().mask).toBe(0b11)
    expect(getMeshySwapSnapshot().radiusScale).toBe(0.85)
    setMeshySwapState(0b11, 0.85) // no-op → no notify
    expect(notified).toBe(1)
    setMeshyLandmarkState(0b101)
    expect(getMeshySwapSnapshot().landmarkMask).toBe(0b101)
    expect(notified).toBe(2)
    setMeshyStreetCells([3, 5], [7], 0.65)
    expect(getMeshySwapSnapshot().nearCells).toEqual([3, 5])
    expect(getMeshySwapSnapshot().midCells).toEqual([7])
    expect(getMeshySwapSnapshot().midDensity).toBe(0.65)
    setMeshyStreetCells([3, 5], [7], 0.65) // no-op → no notify
    expect(notified).toBe(3)

    setMeshySwapState(0, 0)
    setMeshyLandmarkState(0)
    setMeshyStreetCells([], [])
    // Fully idle again → the exact idle snapshot identity (LOW contract).
    expect(getMeshySwapSnapshot()).toBe(idle)
    unsubscribe()
    resetMeshySwapStateForTests()
  })
})

describe('streamed-prop colliders (no walking through Meshy dressing)', () => {
  it('every signature kind has a solid footprint', () => {
    for (const kind of Object.keys(SIGNATURE_MODEL) as MeshySignatureKind[]) {
      expect(
        meshyPropFootprint(SIGNATURE_MODEL[kind]),
        `signature kind ${kind}`,
      ).toBeTruthy()
    }
    // District-flavoured shelter variant too.
    expect(meshyPropFootprint('street-bus-shelter-old')).toBeTruthy()
  })

  it('every rendered signature placement gets a collider covering its anchor', () => {
    for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
      const signatures = buildSignaturePlacements(cell, 1)
      for (const [kind, items] of signatures) {
        const model = signatureModelFor(kind as MeshySignatureKind, cell)
        const colliders = collidersForPlacements(model, items)
        expect(colliders.length, `cell ${cell} kind ${kind}`).toBe(items.length)
        items.forEach((item, i) => {
          const c = colliders[i]
          expect(Math.abs(item.x - c.x)).toBeLessThan(1e-9)
          expect(Math.abs(item.z - c.z)).toBeLessThan(1e-9)
          expect(c.hw).toBeGreaterThan(0.1)
          expect(c.hd).toBeGreaterThan(0.1)
        })
      }
    }
  })

  it('grit ground placements are solid; elevated bands never block', () => {
    // Synthetic wave-2 manifest: one id per grit keyword.
    const available = [
      'street-dumpster',
      'structure-scaffold',
      'street-billboard-holo',
      'street-phone-booth',
      'street-parcel-locker',
      'street-recycle-station',
      'street-scooter-shared',
      'street-utility-pole',
      'street-bus-shelter-old',
      'street-barrier-crowd',
      'street-traffic-signal',
      'street-awning',
      'street-sign-blade',
      'street-sign-box',
    ]
    // All city cells live → the full-city grit plan.
    const allCells: number[] = []
    for (let ix = -10; ix <= 10; ix++) {
      for (let iz = -10; iz <= 10; iz++) allCells.push((ix + 10) * 21 + (iz + 10))
    }
    const grit = buildGritBatches(allCells, available)
    expect(grit.size).toBeGreaterThan(0)
    for (const [id, items] of grit) {
      const colliders = collidersForPlacements(id, items)
      expect(colliders.length, `grit model ${id}`).toBe(items.length)
    }
    // Storefront bands hang at 2.6m+ — no footprint, or filtered by height.
    const storefronts = buildStorefrontBatches(allCells, available)
    for (const [id, items] of storefronts) {
      expect(collidersForPlacements(id, items), `storefront ${id}`).toEqual([])
    }
    // Rooftop clutter rides roof heights — always filtered out.
    const rooftop = buildRooftopBatches(allCells, [
      'structure-water-tower',
      'structure-antenna',
      'structure-hvac',
    ])
    for (const [id, items] of rooftop.batches) {
      expect(collidersForPlacements(id, items), `rooftop ${id}`).toEqual([])
    }
  })

  it('footprints tolerate lod-prefixed ids and reject unknown props', () => {
    expect(meshyPropFootprint(lodId('street-phone-booth'))).toBeTruthy()
    expect(meshyPropFootprint('street-awning-canvas')).toBeNull()
    expect(meshyPropFootprint('vehicle-security-drone')).toBeNull()
  })

  it('props taller than the vault arc carry a blocking top height', () => {
    // The controller refuses the parkour vault when collider.top exceeds
    // VAULT_CLEAR_TOP (1.6m) — every tall streamed prop must declare it, or a
    // sprint-jump carries the hero clean through the mesh (pushout is off
    // for the whole vault arc).
    const tall = [
      'street-holo-kiosk',
      'street-bus-shelter',
      'street-bus-shelter-old',
      'street-vending-machine',
      'street-food-cart',
      'nature-data-palm',
      'structure-plaza-fountain',
      'structure-market-stall',
      'structure-metro-entrance',
      'street-phone-booth',
      'street-parcel-locker',
      'street-utility-pole',
      'street-traffic-signal',
    ]
    for (const id of tall) {
      const f = meshyPropFootprint(id)
      expect(f?.top, id).toBeGreaterThan(1.6)
    }
    // Low hurdles stay vault-friendly.
    for (const id of ['street-bollard', 'nature-hedge-section', 'street-barrier-crowd']) {
      const f = meshyPropFootprint(id)
      expect(f?.top ?? 0, id).toBeLessThanOrEqual(1.6)
    }
    // Keyword path too (wave-2 grit ids are matched, not authored).
    expect(meshyPropFootprint('structure-scaffold-heavy')?.top).toBeGreaterThan(1.6)
    expect(meshyPropFootprint('street-billboard-holo-a')?.top).toBeGreaterThan(1.6)
  })

  it('collidersForPlacements propagates scaled top heights', () => {
    const colliders = collidersForPlacements('street-holo-kiosk', [
      { x: 0, z: 0, yaw: 0, scale: 1 },
      { x: 5, z: 0, yaw: Math.PI / 2, scale: 1.1 },
    ])
    expect(colliders).toHaveLength(2)
    expect(colliders[0].top).toBeCloseTo(2.3)
    expect(colliders[1].top).toBeCloseTo(2.3 * 1.1)
    // Quarter-turn swaps the ground extents.
    expect(colliders[1].hw).toBeCloseTo(0.45 * 1.1)
    expect(colliders[1].hd).toBeCloseTo(0.55 * 1.1)
  })
})
