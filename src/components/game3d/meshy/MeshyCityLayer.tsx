import {
  Suspense,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { GraphicsTier } from '../../../lib/graphicsQuality'
import { LANDMARKS, SCENERY, setDynamicColliders, type Collider } from '../layout'
import {
  SIM,
  applyNightEmissive,
  applyNightFade,
  applyTrafficMotion,
  applyTreeSway,
} from '../simulation'
import { extendGltfLoader } from '../assetLoaders'
import { MESHY_ASSETS } from '../../../content/assets/meshyManifest'
import { TRAFFIC_ALTITUDE, TRAFFIC_SPAN, buildTrafficRoutes } from '../trafficLanes'
import {
  CITIZEN_WALK_REF,
  buildCitizenRoutes,
  citizenPoseAt,
  type CitizenPose,
} from '../citizenRoutes'
import {
  MESHY_CELLS,
  LANDMARK_MODEL_BY_INDEX,
  LANDMARK_REPLACEABLE_MASK,
  baseIdOf,
  buildGritBatches,
  buildMeshyBuildingPlan,
  buildingRingRadii,
  buildSignalSpire,
  buildRooftopBatches,
  buildShowpiecePlan,
  buildSignaturePlacements,
  buildSpawnShowpiece,
  buildStorefrontBatches,
  buildStreetBatches,
  buildHeroCarPlan,
  collidersForPlacements,
  heroCarRingRadius,
  lodId,
  meshyCountScale,
  meshyRadiusScale,
  modelsForCell,
  overworldPreloadInventory,
  signatureModelFor,
  streetCellsFor,
  streetModelsForTier,
  streetRingRadii,
  type MeshyPlacement,
  type MeshySignatureKind,
  type ShowpiecePlacement,
} from './meshyPropsCore'
import { publishMeshyPreload } from './preloadStatus'
import {
  setMeshyHeroCars,
  setMeshyHiddenBuildings,
  setMeshyLandmarkState,
  setMeshyRooftopCover,
  setMeshyStreetCells,
  setMeshySwapState,
} from './meshySwap'
import {
  releaseMeshyModel,
  retainMeshyModel,
  type MeshyModel,
} from './meshyModels'
import { MeshyBatch, type MeshyInstance } from './MeshyBatch'
import { instantiateMeshyCitizen, meshyCitizenVariants } from './meshyCitizen'

/* ============================================================================
   MeshyCityLayer — the lazy chunk that dresses Code City with the Meshy
   library on MEDIUM and up. Never mounted on LOW (zero fetches, zero cost).

   Realism rebuild — three streaming systems:

   1. STREET GRID (MeshyStreetLayer): full-city coverage. Every seeded street
      prop inside the NEAR ring renders as its real model at the primitive's
      exact transform (ONE InstancedMesh per model id for the whole shell);
      the MID ring carries density-thinned trees. The swap store hides the
      matching primitives; past the rings the primitives are the impostors.
      Rebuilt only when the player crosses a quantization step.
   2. PLAZA SIGNATURE CELLS: the seven detail bubbles keep their kiosks,
      shelters, food carts, hedges… streamed by the same load/dispose rings
      as before.
   3. WAVE-2 BANDS: rooftop clutter / storefront band / street grit light up
      automatically for whichever second-wave models exist in the manifest
      (keyword-matched) — nothing renders (and nothing hides) until then.

   Landmarks are visible city-wide, so their six models stream immediately
   and swap in one by one as they decode.
   ========================================================================== */

const CELL_LOAD_RADIUS = 300
const CELL_DISPOSE_RADIUS = 440
const CELL_TICK_MS = 800
/** Player movement step (m) that triggers a street-ring recompute. */
const STREET_QUANT = 24

/** Tier-7 real-building swap (MeshyBuildingLayer): ON again with the phase-2
 *  skyline set (July 2026, owner direction). The original complaints are
 *  addressed head-on: purpose-made tower models (crown/twin/terraced/blade)
 *  pass the anti-melt gate on real tower boxes instead of smearing, and
 *  TOWERS swap through the wider MID ring so the skyline settles once at
 *  boot instead of morphing at the street-ring boundary while running.
 *  Mid-rises/shops still swap in the NEAR ring where facades read up close.
 *  Colliders never change — models are fitted onto the exact primitive box. */
const USE_MESHY_BUILDINGS = true

interface CellRecord {
  ids: string[]
  live: boolean
}

/** One-time material patches keyed by model id (Living Simulation hooks). */
function patchModelMaterial(model: MeshyModel): void {
  const material = model.material
  const data = material.userData as { meshyPatched?: boolean }
  if (data.meshyPatched) return
  data.meshyPatched = true
  // LOD variants (`lod:` ids) carry the same material hooks as their base.
  switch (baseIdOf(model.id)) {
    case 'nature-tree-broadleaf':
      applyTreeSway(material, 0.045)
      break
    case 'nature-data-palm':
      applyTreeSway(material, 0.035)
      break
    case 'street-lamp-led':
      applyNightEmissive(material, 0.18, 1.9)
      break
    case 'street-lamp-neon':
      // Neon tubes idle brighter by day and flare hard after dark.
      applyNightEmissive(material, 0.45, 2.3)
      break
    case 'street-bench-neon':
      applyNightEmissive(material, 0.35, 1.6)
      break
    case 'street-phone-booth':
      applyNightEmissive(material, 0.25, 1.3)
      break
    case 'street-vending-machine':
      applyNightEmissive(material, 0.4, 1.6)
      break
    case 'street-holo-kiosk':
      applyNightEmissive(material, 0.55, 1.8)
      break
    case 'landmark-spiral-tower':
    case 'landmark-lighthouse':
    case 'landmark-district-gate':
    case 'landmark-observatory-dome':
    case 'landmark-signal-spire':
      applyNightEmissive(material, 0.35, 1.6)
      break
    default: {
      // Wave-2 keyword patches (models land mid-development).
      const base = baseIdOf(model.id)
      if (base.includes('tree') || base.includes('bush')) {
        applyTreeSway(material, 0.04)
      } else if (base.includes('billboard') || base.includes('sign')) {
        applyNightEmissive(material, 0.35, 1.7)
      } else if (base.startsWith('bld-') || base.startsWith('structure-midrise')) {
        // Tier-7 real buildings: their baked emissive windows flare after
        // dark so the near city glows like the primitive facade schedule.
        applyNightEmissive(material, 0.45, 2.0)
      }
      break
    }
  }
}

/* ---------------------------------------------------------- boot preload */

/** Frames the warm pocket stays visible after the latest decode (each model
 *  must be DRAWN once so its textures upload + programs compile behind the
 *  boot veil instead of hitching the first street it appears on). */
const PRELOAD_WARM_FRAMES = 24

/**
 * INSTA-RENDER PRELOADER — decodes the ENTIRE overworld model inventory at
 * boot (behind the loading veil, with live progress via preloadStatus) and
 * keeps every model retained for the session. After this resolves, the
 * street/building rings are pure visibility toggles: retainMeshyModel is
 * always a cache hit, so sprinting into fresh cells never fetches, never
 * meshopt-decodes, never KTX2-transcodes. Each decoded model is also drawn
 * once from a pocket far under the city so texture upload + shader compile
 * happen behind the veil too.
 */
function MeshyCityPreloader() {
  const gl = useThree((state) => state.gl)
  const [warm, setWarm] = useState<MeshyModel[]>([])
  const group = useRef<THREE.Group>(null)
  const framesSinceWarm = useRef(0)

  useEffect(() => {
    const ids = overworldPreloadInventory(availableIdsMemo)
    publishMeshyPreload(ids.length, 0)
    let cancelled = false
    let loaded = 0
    const t0 = performance.now()
    for (const id of ids) {
      retainMeshyModel(id, gl).then(
        (model) => {
          if (cancelled) return
          patchModelMaterial(model)
          loaded++
          publishMeshyPreload(ids.length, loaded)
          setWarm((prev) => [...prev, model])
          if (loaded === ids.length) {
            console.info(
              `[meshy] preloaded ${ids.length} models in ${Math.round(performance.now() - t0)}ms`,
            )
          }
        },
        () => {
          if (cancelled) return
          loaded++ // a failed decode must never wedge the boot veil
          publishMeshyPreload(ids.length, loaded)
        },
      )
    }
    return () => {
      cancelled = true
      publishMeshyPreload(0, 0)
      for (const id of ids) releaseMeshyModel(id)
    }
  }, [gl])

  // New decode → re-open the warm window; a quiet stretch hides the pocket.
  useEffect(() => {
    framesSinceWarm.current = 0
    if (group.current) group.current.visible = true
  }, [warm])
  useFrame(() => {
    const g = group.current
    if (!g || !g.visible) return
    framesSinceWarm.current++
    if (framesSinceWarm.current > PRELOAD_WARM_FRAMES) g.visible = false
  })

  return (
    <group ref={group} position={[0, -140, 0]}>
      {warm.map((m) => (
        <mesh key={m.id} geometry={m.geometry} material={m.material} frustumCulled={false} />
      ))}
    </group>
  )
}

/* ---------------------------------------------------------- street layer */

/** Delayed re-attempts after a failed stream (transient network/decoder
 *  blips under load). One failure used to null the whole consumer forever —
 *  the "primitive city" fallback became permanent for the session, which is
 *  exactly the blocky look the graphics-purity directive forbids. */
const STREAM_RETRY_LIMIT = 4
const STREAM_RETRY_BASE_MS = 4_000

/**
 * Retain a fixed model list; returns the id→model map once EVERY id decoded
 * (callers keep primitives until then), or null. Failures release the batch
 * and re-attempt on a backoff — the primitive fallback is a transition
 * state, never a destination.
 */
function useRetainedModels(ids: readonly string[]): Record<string, MeshyModel> | null {
  const gl = useThree((state) => state.gl)
  const key = ids.join('|')
  const [models, setModels] = useState<Record<string, MeshyModel> | null>(null)
  useEffect(() => {
    setModels(null)
    if (key.length === 0) return
    const retained = key.split('|')
    let cancelled = false
    let timer = 0
    // Whether this effect currently holds a retain on every id in the list
    // (a failed attempt releases them all before scheduling the retry).
    let held = false
    const attempt = (n: number) => {
      held = true
      Promise.all(retained.map((id) => retainMeshyModel(id, gl))).then(
        (loaded) => {
          if (cancelled) return
          const map: Record<string, MeshyModel> = {}
          loaded.forEach((model, i) => {
            patchModelMaterial(model)
            map[retained[i]] = model
          })
          setModels(map)
        },
        (error) => {
          console.warn(`[meshy] street models failed to stream (attempt ${n + 1}):`, error)
          for (const id of retained) releaseMeshyModel(id)
          held = false
          if (!cancelled && n + 1 < STREAM_RETRY_LIMIT) {
            timer = window.setTimeout(() => attempt(n + 1), STREAM_RETRY_BASE_MS * (n + 1))
          }
        },
      )
    }
    attempt(0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (held) for (const id of retained) releaseMeshyModel(id)
    }
  }, [key, gl])
  return models
}

/**
 * PROGRESSIVE variant for the building set: the returned map GROWS as models
 * decode and keeps every still-wanted entry when the wanted set changes (the
 * rings move with the player, so an all-or-nothing gate would flash the whole
 * skyline back to primitives on every boundary crossing). Refcounts stay
 * balanced: each effect run retains its full id list and releases it on
 * cleanup; re-entered cells resolve instantly from the model cache.
 */
function useRetainedModelsProgressive(ids: readonly string[]): Record<string, MeshyModel> {
  const gl = useThree((state) => state.gl)
  const key = ids.join('|')
  const [models, setModels] = useState<Record<string, MeshyModel>>({})
  useEffect(() => {
    if (key.length === 0) {
      setModels({})
      return
    }
    const retained = key.split('|')
    let cancelled = false
    // Drop entries that fell out of the wanted set; keep live ones renderable.
    setModels((prev) => {
      const keep: Record<string, MeshyModel> = {}
      for (const id of retained) if (prev[id]) keep[id] = prev[id]
      return keep
    })
    for (const id of retained) {
      retainMeshyModel(id, gl).then(
        (model) => {
          if (cancelled) return
          patchModelMaterial(model)
          setModels((prev) => (prev[id] ? prev : { ...prev, [id]: model }))
        },
        (error) => console.warn(`[meshy] building model ${id} failed to stream:`, error),
      )
    }
    return () => {
      cancelled = true
      for (const id of retained) releaseMeshyModel(id)
    }
  }, [key, gl])
  return models
}

/** Quantized live rings for the street grid, re-computed as the player moves.
 *  `phaseMs` staggers each consumer's decision tick: after a quantization-step
 *  crossing the street shell, the building set and the hero cars used to all
 *  recompute (and commit their React state) in the SAME frame — a visible
 *  sprint hitch. Offsetting the intervals spreads that work across frames. */
function useStreetRings(
  playerPosRef: MutableRefObject<THREE.Vector3>,
  near: number,
  mid: number,
  phaseMs = 0,
): { near: number[]; mid: number[] } {
  const [rings, setRings] = useState<{ near: number[]; mid: number[] }>(() => {
    const p = playerPosRef.current
    return streetCellsFor(
      Math.round(p.x / STREET_QUANT) * STREET_QUANT,
      Math.round(p.z / STREET_QUANT) * STREET_QUANT,
      near,
      mid,
    )
  })
  const last = useRef<string>('')
  useEffect(() => {
    const tick = () => {
      const p = playerPosRef.current
      const qx = Math.round(p.x / STREET_QUANT) * STREET_QUANT
      const qz = Math.round(p.z / STREET_QUANT) * STREET_QUANT
      const key = `${qx}:${qz}`
      if (key === last.current) return
      last.current = key
      setRings(streetCellsFor(qx, qz, near, mid))
    }
    tick()
    let interval = 0
    const phase = window.setTimeout(() => {
      interval = window.setInterval(tick, CELL_TICK_MS)
    }, phaseMs)
    return () => {
      window.clearTimeout(phase)
      if (interval) window.clearInterval(interval)
    }
  }, [playerPosRef, near, mid, phaseMs])
  return rings
}

/** Every landed manifest id (static per session — the manifest module is
 *  baked at build/serve time). Wave-2 pickers fall back to wave-1 stand-ins
 *  for anything not in this set. */
function landedIds(): Set<string> {
  return new Set(MESHY_ASSETS.map((e) => e.id))
}

/**
 * The citywide street shell: one InstancedMesh per model id covering every
 * live NEAR/MID cell, plus the wave-2 rooftop/storefront/grit bands. The
 * swap store is only told to hide primitives once the models are decoded.
 */
function MeshyStreetLayer({
  tier,
  playerPosRef,
}: {
  tier: GraphicsTier
  playerPosRef: MutableRefObject<THREE.Vector3>
}) {
  const rings = useMemo(() => streetRingRadii(tier), [tier])
  const live = useStreetRings(playerPosRef, rings.near, rings.mid, 0)

  // Wave-2 adoption: which ids exist right now (session-static). Pickers
  // downgrade anything missing to its wave-1 stand-in.
  const available = availableIdsMemo
  const availableList = useMemo(() => [...available], [available])
  const rooftopPlan = useMemo(
    () => buildRooftopBatches(live.near, availableList),
    [live.near, availableList],
  )
  // MEDIUM has no furniture ring but keeps its storefront-band promise: the
  // awnings/signs ride the tree ring's cells instead.
  const storefrontCells = live.near.length > 0 ? live.near : live.mid
  const storefronts = useMemo(
    () => buildStorefrontBatches(storefrontCells, availableList),
    [storefrontCells, availableList],
  )
  const grit = useMemo(
    () => buildGritBatches(live.near, availableList),
    [live.near, availableList],
  )

  const streetBatches = useMemo(
    () => buildStreetBatches(live.near, live.mid, rings.midDensity, available),
    [live, rings.midDensity, available],
  )

  const wantedIds = useMemo(() => {
    const ids = new Set<string>(streetModelsForTier(tier, available))
    for (const id of rooftopPlan.batches.keys()) ids.add(id)
    for (const id of storefronts.keys()) ids.add(id)
    for (const id of grit.keys()) ids.add(id)
    return [...ids].sort()
  }, [tier, available, rooftopPlan, storefronts, grit])

  const models = useRetainedModels(wantedIds)

  // Publish the hide-sets only while the replacement batches can render.
  useEffect(() => {
    if (!models) {
      setMeshyStreetCells([], [])
      setMeshyRooftopCover(false, false)
      return
    }
    setMeshyStreetCells(live.near, live.mid, rings.midDensity)
    setMeshyRooftopCover(rooftopPlan.coversTanks, rooftopPlan.coversAc)
  }, [models, live, rings.midDensity, rooftopPlan])
  useEffect(
    () => () => {
      setMeshyStreetCells([], [])
      setMeshyRooftopCover(false, false)
    },
    [],
  )

  // Street grit (dumpsters, phone booths, lockers, billboards, barriers…)
  // has no primitive twin, so it registers its own footprints — solid the
  // moment it renders, gone the moment it streams out.
  useEffect(() => {
    if (!models) {
      setDynamicColliders('meshy-grit', [])
      return
    }
    const colliders: Collider[] = []
    for (const [id, items] of grit) {
      if (models[id]) colliders.push(...collidersForPlacements(id, items))
    }
    setDynamicColliders('meshy-grit', colliders)
  }, [models, grit])
  useEffect(() => () => setDynamicColliders('meshy-grit', []), [])

  const batches = useMemo(() => {
    if (!models) return []
    // One InstancedMesh per model id for the whole shell. (A quadrant split
    // for frustum culling was measured: only ~3% fewer vertices at typical
    // street-level camera angles for +40 draws — the quadrant bounding
    // spheres still straddle the frustum. Not worth the budget.)
    const out: { model: MeshyModel; items: MeshyInstance[] }[] = []
    const add = (id: string, items: readonly MeshyPlacement[]) => {
      const model = models[id]
      if (model && items.length > 0) {
        out.push({
          model,
          items: items.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, scale: p.scale, y: p.y })),
        })
      }
    }
    for (const [id, items] of streetBatches) add(id, items)
    for (const [id, items] of rooftopPlan.batches) add(id, items)
    for (const [id, items] of storefronts) add(id, items)
    for (const [id, items] of grit) add(id, items)
    return out
  }, [models, streetBatches, rooftopPlan, storefronts, grit])

  return (
    <group>
      {batches.map(({ model, items }) => (
        <MeshyBatch key={model.id} model={model} items={items} />
      ))}
    </group>
  )
}

/* ---------------------------------------------------- hero cars (always-on) */

/**
 * THE PARKED-CAR LAYER — real vehicle models around the player at EVERY
 * mounted tier. Root-cause fix for "cars still render blocky": the density
 * street shell only streamed cars inside its near-ring, which the FPS governor
 * ZEROES at MEDIUM — so a single frame-rate dip turned every nearby parked car
 * back into a primitive box. Cars are the street element players notice most,
 * so they get their own always-on ring here (full-detail models, not the LOD
 * shell), independent of the governor. The colliders are unchanged (they live
 * in layout.COLLIDERS), so vaulting onto a car roof still works.
 *
 * Only the primitives whose real replacement is actually resident are hidden
 * (published via setMeshyHeroCars), so the field never flashes a hole.
 */
function MeshyHeroCars({
  tier,
  playerPosRef,
}: {
  tier: GraphicsTier
  playerPosRef: MutableRefObject<THREE.Vector3>
}) {
  const radius = useMemo(() => heroCarRingRadius(tier), [tier])
  const available = availableIdsMemo

  const [plan, setPlan] = useState(() =>
    buildHeroCarPlan(SCENERY.car, playerPosRef.current.x, playerPosRef.current.z, radius, available),
  )
  const last = useRef('')
  useEffect(() => {
    const tick = () => {
      const p = playerPosRef.current
      const qx = Math.round(p.x / STREET_QUANT) * STREET_QUANT
      const qz = Math.round(p.z / STREET_QUANT) * STREET_QUANT
      const key = `${qx}:${qz}:${radius}`
      if (key === last.current) return
      last.current = key
      setPlan(buildHeroCarPlan(SCENERY.car, qx, qz, radius, available))
    }
    tick()
    // Staggered two thirds of a tick behind the street shell so a ring
    // crossing never rebuilds cars + furniture + buildings in one frame.
    let interval = 0
    const phase = window.setTimeout(() => {
      interval = window.setInterval(tick, CELL_TICK_MS)
    }, (CELL_TICK_MS * 2) / 3)
    return () => {
      window.clearTimeout(phase)
      if (interval) window.clearInterval(interval)
    }
  }, [playerPosRef, radius, available])

  const wanted = useMemo(() => [...plan.groups.keys()].sort(), [plan])
  const models = useRetainedModelsProgressive(wanted)

  // Hide exactly the primitives whose real replacement is resident right now.
  const hidden = useMemo(() => {
    const out: number[] = []
    for (const [id, placements] of plan.groups) {
      if (!models[id]) continue
      for (const p of placements) out.push(p.index)
    }
    out.sort((a, b) => a - b)
    return out
  }, [plan, models])
  useEffect(() => {
    setMeshyHeroCars(hidden)
  }, [hidden])
  useEffect(() => () => setMeshyHeroCars([]), [])

  const batches = useMemo(() => {
    const out: { model: MeshyModel; items: MeshyInstance[] }[] = []
    for (const [id, placements] of plan.groups) {
      const model = models[id]
      if (!model) continue
      out.push({
        model,
        items: placements.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, scale: p.scale })),
      })
    }
    return out
  }, [plan, models])

  return (
    <group>
      {batches.map(({ model, items }) => (
        <MeshyBatch key={model.id} model={model} items={items} castShadow={tier === 'ultra'} />
      ))}
    </group>
  )
}

/* ------------------------------------------------------ real building set */

/**
 * The tier-7 real building SET: every primitive building inside the live NEAR
 * ring becomes a district+kind-appropriate Meshy model, fitted NON-uniformly
 * onto the exact primitive box it replaces (collider footprint untouched);
 * the primitive box hides via the swap store the moment the models decode.
 * Beyond the ring the primitive facade boxes are the far impostor + the
 * governor's cheap floor. Skybridges (wave-2) still span tower pairs high
 * above gameplay (visual only). ONE non-casting InstancedMesh per model —
 * near buildings skip the shadow pass (like the street-prop shell), so the
 * dense-district draw budget stays under the ULTRA ceiling; the far primitive
 * skyline keeps its tall-tower shadow casters and the hero still shadows the
 * street.
 *
 * Governor density knob: the near ring is the SAME street ring the furniture
 * shell uses, so the tier the governor feeds down (ULTRA 160m → HIGH 135m →
 * MEDIUM off → LOW unmounted) thins the Meshy buildings back toward the
 * primitive floor with no pipeline recompile.
 */
function MeshyBuildingLayer({
  tier,
  playerPosRef,
}: {
  tier: GraphicsTier
  playerPosRef: MutableRefObject<THREE.Vector3>
}) {
  const rings = useMemo(() => buildingRingRadii(tier), [tier])
  // Staggered a third of a tick behind the street shell (see useStreetRings).
  const live = useStreetRings(playerPosRef, rings.near, rings.mid, CELL_TICK_MS / 3)
  const available = availableIdsMemo

  // Slots the hero showpieces own (spawn atrium, signal spire) — the pool
  // swap must never double-render on top of them.
  const exclude = useMemo(() => {
    const taken = new Set<number>()
    const spawn = buildSpawnShowpiece(available)
    if (spawn) taken.add(spawn.index)
    const spire = buildSignalSpire(available)
    if (spire) taken.add(spire.index)
    return taken
  }, [available])

  const plan = useMemo(
    () => buildMeshyBuildingPlan(live.near, available, SCENERY.building, live.mid, exclude),
    [live, available, exclude],
  )
  const bridges = useMemo(() => buildShowpiecePlan(available).bridges, [available])

  const wanted = useMemo(() => {
    const ids = new Set<string>(plan.groups.keys())
    if (bridges.length > 0) ids.add(lodId('structure-skybridge'))
    return [...ids].sort()
  }, [plan, bridges])
  // Progressive: buildings pop in one model at a time as GLBs decode, and a
  // moving ring never resets the whole set back to primitives.
  const models = useRetainedModelsProgressive(wanted)

  // Hide exactly the primitive boxes whose replacement model CAN render.
  const hidden = useMemo(() => {
    const out: number[] = []
    for (const [key, items] of plan.groups) {
      if (!models[key]) continue
      for (const { index } of items) out.push(index)
    }
    out.sort((a, b) => a - b)
    return out
  }, [plan, models])
  useEffect(() => {
    setMeshyHiddenBuildings(hidden, 'set')
  }, [hidden])
  useEffect(() => () => setMeshyHiddenBuildings([], 'set'), [])

  const groups = useMemo(() => {
    if (!models) return []
    const out: { key: string; model: MeshyModel; matrices: THREE.Matrix4[] }[] = []
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    for (const [key, placements] of plan.groups) {
      const model = models[key]
      if (!model) continue
      const matrices: THREE.Matrix4[] = []
      for (const { building: b } of placements) {
        p.set(b.x, 0, b.z)
        q.setFromEuler(e.set(0, b.r, 0))
        // Fit the normalized model onto the primitive's exact box.
        s.set(
          b.w / Math.max(1e-3, model.size.x),
          b.h / Math.max(1e-3, model.size.y),
          b.d / Math.max(1e-3, model.size.z),
        )
        matrices.push(new THREE.Matrix4().compose(p, q, s))
      }
      out.push({ key, model, matrices })
    }
    // Skybridges: stretched onto each tower-pair span.
    const bridgeModel = models[lodId('structure-skybridge')]
    if (bridgeModel && bridges.length > 0) {
      const alongX = bridgeModel.size.x >= bridgeModel.size.z
      const matrices: THREE.Matrix4[] = []
      for (const bridge of bridges) {
        p.set(bridge.x, bridge.y, bridge.z)
        q.setFromEuler(e.set(0, alongX ? bridge.yaw - Math.PI / 2 : bridge.yaw, 0))
        const stretch =
          bridge.span / Math.max(1e-3, alongX ? bridgeModel.size.x : bridgeModel.size.z)
        s.set(alongX ? stretch : 1, 1, alongX ? 1 : stretch)
        matrices.push(new THREE.Matrix4().compose(p, q, s))
      }
      out.push({ key: lodId('structure-skybridge'), model: bridgeModel, matrices })
    }
    return out
  }, [models, plan, bridges])

  return (
    <group>
      {groups.map(({ key, model, matrices }) => (
        <BuildingBatch key={key} model={model} matrices={matrices} />
      ))}
    </group>
  )
}

/** ONE non-casting InstancedMesh with full (non-uniform) building matrices.
 *  Allocated with slack capacity and re-used as the live rings move (only
 *  `count` + matrices change) — remounting per ring crossing was a sprint
 *  hitch (fresh GPU buffers + object teardown every 24m of travel). */
function BuildingBatch({
  model,
  matrices,
}: {
  model: MeshyModel
  matrices: THREE.Matrix4[]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const capacityRef = useRef(0)
  if (matrices.length > capacityRef.current) {
    capacityRef.current = Math.max(8, Math.ceil(matrices.length * 1.5))
  }
  const capacity = capacityRef.current
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    mesh.count = matrices.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [matrices, capacity])
  if (matrices.length === 0) return null
  return (
    <instancedMesh
      key={`${model.id}:${capacity}`}
      ref={ref}
      args={[model.geometry, model.material, capacity]}
      castShadow={false}
      receiveShadow={false}
    />
  )
}

/* ------------------------------------------------------- spawn showpiece */

/**
 * The spawn-street showpiece: ONE hero Meshy building (`bld-spawn-atrium`)
 * permanently replaces the most prominent primitive mid-rise near the world-1
 * spawn. Unlike the (disabled) full building swap this streams once at mount
 * and never swaps back at ring boundaries, so the morph complaint that parked
 * USE_MESHY_BUILDINGS doesn't apply — it behaves like a seventh landmark.
 * The primitive box hides only after the model decodes; collider unchanged.
 */
function MeshyShowpieceBuilding({
  placement,
  owner,
}: {
  placement: ShowpiecePlacement
  owner: string
}) {
  const ids = useMemo(() => [placement.model], [placement])
  const models = useRetainedModels(ids)
  const model = models ? models[placement.model] : null

  useEffect(() => {
    if (!model) return
    setMeshyHiddenBuildings([placement.index], owner)
    return () => setMeshyHiddenBuildings([], owner)
  }, [model, placement, owner])

  if (!model) return null
  const b = placement.building
  return (
    <group
      position={[b.x, 0, b.z]}
      rotation={[0, b.r, 0]}
      scale={[
        b.w / Math.max(1e-3, model.size.x),
        b.h / Math.max(1e-3, model.size.y),
        b.d / Math.max(1e-3, model.size.z),
      ]}
    >
      <mesh
        geometry={model.geometry}
        material={model.material}
        castShadow={false}
        receiveShadow={false}
      />
    </group>
  )
}

function MeshySpawnShowpiece() {
  const placement = useMemo(() => buildSpawnShowpiece(availableIdsMemo), [])
  if (!placement) return null
  return <MeshyShowpieceBuilding placement={placement} owner="spawn" />
}

/** Phase-2 hero landmark: the signal spire pins the city-centre skyline by
 *  claiming (and out-growing) the tallest central tower box. Streams once at
 *  mount like the spawn atrium — never swaps back at ring boundaries. */
function MeshySignalSpire() {
  const placement = useMemo(() => buildSignalSpire(availableIdsMemo), [])
  if (!placement) return null
  return <MeshyShowpieceBuilding placement={placement} owner="spire" />
}

/* ------------------------------------------------------------ plaza cells */

const MeshyCell = memo(function MeshyCell({
  cell,
  countScale,
  models,
}: {
  cell: number
  countScale: number
  models: Record<string, MeshyModel>
}) {
  const batches = useMemo(() => {
    const out: { model: MeshyModel; items: MeshyInstance[] }[] = []
    const signatures = buildSignaturePlacements(cell, countScale)
    for (const [kind, items] of signatures) {
      const model =
        models[signatureModelFor(kind as MeshySignatureKind, cell, availableIdsMemo)]
      if (model && items.length > 0) out.push({ model, items })
    }
    return out
  }, [cell, countScale, models])

  // Signature dressing (kiosks, shelters, fountains, metro entrances…) is
  // NEW geometry with no primitive twin — register a footprint per rendered
  // instance so none of it is walk-through.
  useEffect(() => {
    const owner = `meshy-cell-${cell}`
    setDynamicColliders(
      owner,
      batches.flatMap(({ model, items }) => collidersForPlacements(model.id, items)),
    )
    return () => setDynamicColliders(owner, [])
  }, [cell, batches])

  return (
    <group>
      {batches.map(({ model, items }) => (
        <MeshyBatch key={model.id} model={model} items={items} />
      ))}
    </group>
  )
})

/* -------------------------------------------------------------- landmarks */

/** Lighthouse-style sweeping night beams at the model's lantern height. */
function LandmarkBeams({ height, color }: { height: number; color: string }) {
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.6
  })
  const beamMat = useMemo(
    () =>
      applyNightFade(
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
          toneMapped: false,
        }),
      ),
    [color],
  )
  useEffect(() => () => beamMat.dispose(), [beamMat])
  return (
    <group ref={spin} position={[0, height, 0]}>
      {[0, Math.PI].map((a) => (
        <mesh
          key={a}
          rotation={[0, a, 0]}
          position={[Math.sin(a + Math.PI / 2) * 15, 0, Math.cos(a + Math.PI / 2) * 15]}
          material={beamMat}
        >
          <planeGeometry args={[28, 2.4]} />
        </mesh>
      ))}
    </group>
  )
}

/** District-accent beacon at the crown (the tint language of the re-skin). */
function LandmarkBeacon({ height, color }: { height: number; color: string }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame((state) => {
    if (mat.current) {
      mat.current.emissiveIntensity = 1 + Math.sin(state.clock.elapsedTime * 1.8) * 0.45
    }
  })
  return (
    <mesh position={[0, height, 0]}>
      <octahedronGeometry args={[0.9, 0]} />
      <meshStandardMaterial
        ref={mat}
        color={color}
        emissive={color}
        emissiveIntensity={1.2}
        flatShading
      />
    </mesh>
  )
}

/** Landmark models render only inside this camera range — past it the fog
 *  cap (profile cullRadius <= 300) has fully swallowed even a 60m spire. */
const LANDMARK_VIEW_RADIUS = 360

const MeshyLandmark = memo(function MeshyLandmark({
  index,
  model,
}: {
  index: number
  model: MeshyModel
}) {
  const landmark = LANDMARKS[index]
  const turbine = model.id === 'landmark-wind-turbine'
  const lighthouse = model.id === 'landmark-lighthouse'
  const meshRef = useRef<THREE.Mesh>(null)
  const gateRef = useRef<THREE.Group>(null)
  const tick = useRef(index)

  useFrame((state) => {
    // Proximity gate (every few frames): far landmarks stop rendering.
    tick.current++
    if (tick.current % 8 === 0 && gateRef.current) {
      const dx = state.camera.position.x - landmark.pos.x
      const dz = state.camera.position.z - landmark.pos.z
      const on = dx * dx + dz * dz <= LANDMARK_VIEW_RADIUS * LANDMARK_VIEW_RADIUS
      if (gateRef.current.visible !== on) gateRef.current.visible = on
    }
    if (gateRef.current && !gateRef.current.visible) return
    // Wind turbines yaw slowly into the wind — the one live motion a merged
    // single-mesh turbine can honestly perform.
    if (turbine && meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.05) * 0.6
    }
  })

  // The turbine shares Mountain Outskirts with the primitive cliff: place it
  // on the ridge line beside the peak instead of inside it.
  const offset = turbine ? { x: 34, z: 24 } : { x: 0, z: 0 }
  const height = model.size.y

  return (
    <group ref={gateRef} position={[landmark.pos.x + offset.x, 0, landmark.pos.z + offset.z]}>
      <mesh ref={meshRef} geometry={model.geometry} material={model.material} castShadow />
      {lighthouse && <LandmarkBeams height={height * 0.86} color="#ffe9a8" />}
      <LandmarkBeacon height={height + 1.6} color={landmark.color} />
    </group>
  )
})

function MeshyLandmarks() {
  const gl = useThree((state) => state.gl)
  const [ready, setReady] = useState<Record<number, MeshyModel>>({})

  useEffect(() => {
    let cancelled = false
    const ids = LANDMARK_MODEL_BY_INDEX.slice()
    ids.forEach((id, index) => {
      retainMeshyModel(id, gl).then(
        (model) => {
          if (cancelled) return
          patchModelMaterial(model)
          setReady((prev) => ({ ...prev, [index]: model }))
        },
        (error) => {
          // Primitive landmark stays — surface why (never an app error).
          console.warn(`[meshy] landmark ${id} failed to stream:`, error)
        },
      )
    })
    return () => {
      cancelled = true
      for (const id of ids) releaseMeshyModel(id)
      setMeshyLandmarkState(0)
    }
  }, [gl])

  // Primitive landmarks hide one by one as their replacement decodes; the
  // Mountain Outskirts cliff (bit 5) is additive and never masked.
  useEffect(() => {
    let mask = 0
    for (const key of Object.keys(ready)) {
      mask |= 1 << Number(key)
    }
    setMeshyLandmarkState(mask & LANDMARK_REPLACEABLE_MASK)
  }, [ready])

  // The wind turbine is ADDITIVE (placed on the ridge beside the primitive
  // cliff, not on the shared landmark anchor the static footprints cover) —
  // its mast gets a footprint of its own while the model is live.
  useEffect(() => {
    const turbine = ready[5]
    setDynamicColliders(
      'meshy-turbine',
      turbine && turbine.id === 'landmark-wind-turbine'
        ? [{ x: LANDMARKS[5].pos.x + 34, z: LANDMARKS[5].pos.z + 24, hw: 1.0, hd: 1.0, top: 34 }]
        : [],
    )
  }, [ready])
  useEffect(() => () => setDynamicColliders('meshy-turbine', []), [])

  return (
    <>
      {LANDMARK_MODEL_BY_INDEX.map((_, index) =>
        ready[index] ? (
          <MeshyLandmark key={index} index={index} model={ready[index]} />
        ) : null,
      )}
    </>
  )
}

/* --------------------------------------------------------- security drones */

const DRONE_COUNT = 14
/** Distinct seed — drones fly their own routes, never a pod's rail slot. */
const DRONE_SEED = 20260716
/** Drones patrol a band above the pod stream. */
const DRONE_ALTITUDE_LIFT = 3.2

/**
 * Wave-2 security drones join the hover-traffic system: same vertex-shader
 * route motion (applyTrafficMotion), applied to a CLONE of the drone model's
 * material so the cached original stays clean for the courier/interact uses.
 * One extra draw for the whole patrol.
 */
function MeshyTrafficDrones() {
  const gl = useThree((state) => state.gl)
  const [model, setModel] = useState<MeshyModel | null>(null)
  useEffect(() => {
    let cancelled = false
    retainMeshyModel(lodId('vehicle-security-drone'), gl).then(
      (m) => {
        if (!cancelled) setModel(m)
      },
      (error) => console.warn('[meshy] security drone failed to stream:', error),
    )
    return () => {
      cancelled = true
      releaseMeshyModel(lodId('vehicle-security-drone'))
    }
  }, [gl])

  const routes = useMemo(() => buildTrafficRoutes(DRONE_COUNT, DRONE_SEED), [])
  const assets = useMemo(() => {
    if (!model) return null
    const geometry = model.geometry.clone()
    const arr = new Float32Array(routes.length * 4)
    routes.forEach((r, i) => {
      arr[i * 4] = r.axis
      arr[i * 4 + 1] = r.speed * r.dir * 1.35 // patrols run hotter than pods
      arr[i * 4 + 2] = r.phase
      arr[i * 4 + 3] = 0
    })
    geometry.setAttribute('aRoute', new THREE.InstancedBufferAttribute(arr, 4))
    const material = applyTrafficMotion(
      (model.material as THREE.MeshStandardMaterial).clone(),
      TRAFFIC_SPAN,
    )
    return { geometry, material }
  }, [model, routes])
  useEffect(
    () => () => {
      assets?.geometry.dispose()
      assets?.material.dispose()
    },
    [assets],
  )

  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = ref.current
    if (!mesh || !assets) return
    const d = new THREE.Object3D()
    routes.forEach((r, i) => {
      const cross = r.line + r.lane * 1.4
      d.position.set(
        r.axis === 0 ? cross : 0,
        TRAFFIC_ALTITUDE + DRONE_ALTITUDE_LIFT,
        r.axis === 0 ? 0 : cross,
      )
      d.rotation.set(0, r.axis === 0 ? (r.dir > 0 ? 0 : Math.PI) : r.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)
      d.scale.setScalar(1)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [assets, routes])

  if (!assets) return null
  return (
    <instancedMesh
      ref={ref}
      args={[assets.geometry, assets.material, routes.length]}
      frustumCulled={false}
    />
  )
}

/* ------------------------------------------------------- ULTRA hero walkers */

const WALKER_COUNT = 3
/** Distinct seed — hero walkers own their own segments, not the crowd's. */
const WALKER_SEED = 20260715

function MeshyWalkers() {
  const gl = useThree((state) => state.gl)
  // Wave-2 variety: walkers cycle through every landed citizen wardrobe.
  const variants = useMemo(() => meshyCitizenVariants(), [])
  const urls = useMemo(() => variants.map((v) => v.walkUrl), [variants])
  const gltfs = useGLTF(urls, true, true, extendGltfLoader(gl))
  const groupRef = useRef<THREE.Group>(null)
  const refs = useRef<(THREE.Group | null)[]>([])
  const pose = useRef<CitizenPose>({ x: 0, z: 0, heading: 0 })

  const routes = useMemo(() => buildCitizenRoutes(WALKER_COUNT, WALKER_SEED), [])
  const rigs = useMemo(
    () => routes.map((_, i) => instantiateMeshyCitizen(gltfs[i % gltfs.length], 1.7)),
    [routes, gltfs],
  )

  useEffect(() => {
    for (const rig of rigs) {
      if (rig.action) {
        rig.action.reset().play()
      }
    }
    return () => {
      for (const rig of rigs) {
        rig.mixer.stopAllAction()
        for (const material of rig.materials) material.dispose()
      }
    }
  }, [rigs])

  // A 1.7m walker is fog-dust beyond this — freeze the skinned rig entirely.
  const WALKER_ACTIVE_RADIUS = 130

  useFrame((state, dtRaw) => {
    const group = groupRef.current
    if (!group) return
    // Hero walkers stroll the calm neon night (NYC identity) and shelter
    // only through the deep corruption/horde phase, with the VAT crowd.
    const daylight = SIM.night.value < 0.85
    if (group.visible !== daylight) group.visible = daylight
    if (!daylight) return
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const camX = state.camera.position.x
    const camZ = state.camera.position.z
    const r2 = WALKER_ACTIVE_RADIUS * WALKER_ACTIVE_RADIUS
    for (let i = 0; i < routes.length; i++) {
      const holder = refs.current[i]
      const rig = rigs[i]
      if (!holder || !rig) continue
      const p = citizenPoseAt(routes[i], t, pose.current)
      const dx = p.x - camX
      const dz = p.z - camZ
      // Far walkers: hide + skip the mixer (the expensive part).
      const near = dx * dx + dz * dz <= r2
      if (holder.visible !== near) holder.visible = near
      if (!near) continue
      holder.position.set(p.x, 0, p.z)
      holder.rotation.y = p.heading
      if (rig.action) rig.action.timeScale = routes[i].speed / CITIZEN_WALK_REF
      rig.mixer.update(dt)
    }
  })

  return (
    <group ref={groupRef}>
      {rigs.map((rig, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <primitive object={rig.scene} scale={rig.scale} />
        </group>
      ))}
    </group>
  )
}

/* --------------------------------------------------------------- the layer */

export default function MeshyCityLayer({
  tier,
  playerPosRef,
}: {
  tier: GraphicsTier
  playerPosRef: MutableRefObject<THREE.Vector3>
}) {
  const gl = useThree((state) => state.gl)
  const radiusScale = meshyRadiusScale(tier)
  const countScale = meshyCountScale(tier)
  const [liveMask, setLiveMask] = useState(0)
  const [models, setModels] = useState<Record<string, MeshyModel>>({})
  const cells = useRef(new Map<number, CellRecord>())

  useEffect(() => {
    if (radiusScale <= 0) return
    let disposed = false
    const cellMap = cells.current

    const rebuildModelMap = () => {
      const wanted = new Set<string>()
      for (const record of cellMap.values()) {
        for (const id of record.ids) wanted.add(id)
      }
      setModels((prev) => {
        const next: Record<string, MeshyModel> = {}
        for (const id of Object.keys(prev)) {
          if (wanted.has(id)) next[id] = prev[id]
        }
        return next
      })
    }

    const retainCell = (cell: number) => {
      const record: CellRecord = { ids: modelsForCell(cell, availableIdsMemo), live: false }
      cellMap.set(cell, record)
      Promise.all(record.ids.map((id) => retainMeshyModel(id, gl))).then(
        (loaded) => {
          if (disposed || cellMap.get(cell) !== record) return
          record.live = true
          setModels((prev) => {
            const next = { ...prev }
            loaded.forEach((model, i) => {
              patchModelMaterial(model)
              next[record.ids[i]] = model
            })
            return next
          })
          setLiveMask((mask) => mask | (1 << cell))
        },
        (error) => {
          // Cell stays primitive — surface why (never an app error).
          console.warn(`[meshy] cell ${cell} failed to stream:`, error)
        },
      )
    }

    const releaseCell = (cell: number) => {
      const record = cellMap.get(cell)
      if (!record) return
      cellMap.delete(cell)
      for (const id of record.ids) releaseMeshyModel(id)
      setLiveMask((mask) => mask & ~(1 << cell))
      rebuildModelMap()
    }

    const tick = () => {
      const p = playerPosRef.current
      for (let i = 0; i < MESHY_CELLS.length; i++) {
        const d = Math.hypot(MESHY_CELLS[i].x - p.x, MESHY_CELLS[i].z - p.z)
        const retained = cellMap.has(i)
        if (!retained && d <= CELL_LOAD_RADIUS) retainCell(i)
        else if (retained && d > CELL_DISPOSE_RADIUS) releaseCell(i)
      }
    }

    tick()
    const id = window.setInterval(tick, CELL_TICK_MS)
    return () => {
      disposed = true
      window.clearInterval(id)
      for (const cell of [...cellMap.keys()]) {
        const record = cellMap.get(cell)
        cellMap.delete(cell)
        if (record) for (const modelId of record.ids) releaseMeshyModel(modelId)
      }
      setLiveMask(0)
      setModels({})
    }
  }, [gl, radiusScale, playerPosRef])

  // Publish to the swap store (signature dressing gate).
  useEffect(() => {
    setMeshySwapState(liveMask, radiusScale)
  }, [liveMask, radiusScale])
  useEffect(() => () => setMeshySwapState(0, 0), [])

  // Meshy building swaps are off — clear any stale hide-set left by HMR or a
  // previous session so the procedural city never boots with invisible boxes.
  // (Safe alongside MeshySpawnShowpiece: this runs at mount, the showpiece
  // republishes its single index only after its model decodes.)
  useEffect(() => {
    if (!USE_MESHY_BUILDINGS) setMeshyHiddenBuildings([])
  }, [])

  if (radiusScale <= 0) return null
  return (
    <group>
      <MeshyCityPreloader />
      <MeshyStreetLayer tier={tier} playerPosRef={playerPosRef} />
      <MeshyHeroCars tier={tier} playerPosRef={playerPosRef} />
      <MeshySpawnShowpiece />
      <MeshySignalSpire />
      {USE_MESHY_BUILDINGS && <MeshyBuildingLayer tier={tier} playerPosRef={playerPosRef} />}
      {MESHY_CELLS.map((_, cell) =>
        (liveMask & (1 << cell)) !== 0 ? (
          <MeshyCell key={cell} cell={cell} countScale={countScale} models={models} />
        ) : null,
      )}
      <MeshyLandmarks />
      {availableIdsMemo.has('vehicle-security-drone') && tier !== 'medium' && (
        <MeshyTrafficDrones />
      )}
      {tier === 'ultra' && (
        <Suspense fallback={null}>
          <MeshyWalkers />
        </Suspense>
      )}
    </group>
  )
}

// Session-static landed-id set shared by the layer's wave-2 systems.
const availableIdsMemo = landedIds()
