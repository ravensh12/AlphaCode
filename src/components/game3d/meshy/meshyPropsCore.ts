import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  ROAD_HALF_W,
  ROAD_LINES,
  SCENERY,
  START_3D,
  WORLD_GATES,
  rotatedFootprint,
  type Building,
  type Collider,
  type Prop,
  type Vec2,
} from '../layout'
import { districtIndexAt, positionHash } from '../districtTheme'
import type { GraphicsTier } from '../../../lib/graphicsQuality'
import {
  MESHY_CELLS,
  MESHY_SWAP_KINDS,
  midTreeKept,
  streetCellKeyAt,
  type MeshySwapKind,
} from './meshySwap'

/* ============================================================================
   Meshy prop system — pure core (Node-testable, no three.js).

   Realism rebuild: the Meshy library dresses the WHOLE city, not just plaza
   bubbles. Three deterministic systems:

   - STREET GRID (buildStreetBatches): every seeded SCENERY placement inside
     the live NEAR cells (see meshySwap.ts) renders as its real model at the
     exact primitive transform — colliders and layout never change. Live MID
     cells render density-thinned trees only; past that, the primitive
     instanced props ARE the far impostors.
   - SIGNATURE kinds (kiosks, shelters, bollards, vending machines, food
     carts, hedges, rocks, palms) are NEW placements on sidewalk anchors and
     plaza rings, built per plaza cell with the same quest-plaza clearance
     rule the street decal layer enforces.
   - WAVE-2 BANDS (rooftop clutter / storefronts / street grit): pure
     builders keyed off the seeded layout that light up per model id as the
     second-wave manifest lands — a missing id simply renders nothing.

   LOW-tier contract: nothing here runs on LOW — the render layer is never
   mounted, every ring stays empty, and the primitive draw list is
   byte-identical to the pre-Meshy city.
   ========================================================================== */

/* ----------------------------------------------------------- model registry */

/** How a Meshy GLB is normalized when its geometry is extracted (baked once). */
export interface MeshyModelSpec {
  /** Manifest id (meshyManifest.ts). */
  id: string
  /** Uniform-scale the model so its height becomes this (meters). */
  targetHeight?: number
  /** …or so its longest ground-plane edge becomes this (vehicles). */
  targetLength?: number
  /** Yaw baked into the geometry (vehicle GLBs are modeled along +x). */
  yawOffset?: number
  /** Positive values sink the model into the ground (meters, post-scale). */
  groundSink?: number
}

export const MESHY_MODEL_SPECS: Record<string, MeshyModelSpec> = {
  // street furniture
  'street-lamp-led': { id: 'street-lamp-led', targetHeight: 4.4 },
  'street-bench-modern': { id: 'street-bench-modern', targetHeight: 0.85 },
  'street-bench-classic': { id: 'street-bench-classic', targetHeight: 0.95 },
  'street-trash-bin': { id: 'street-trash-bin', targetHeight: 1.05 },
  'street-planter-shrub': { id: 'street-planter-shrub', targetHeight: 1.15 },
  'street-fire-hydrant': { id: 'street-fire-hydrant', targetHeight: 0.95 },
  'street-holo-kiosk': { id: 'street-holo-kiosk', targetHeight: 2.3 },
  'street-bus-shelter': { id: 'street-bus-shelter', targetHeight: 2.6 },
  'street-bollard': { id: 'street-bollard', targetHeight: 0.95 },
  'street-vending-machine': { id: 'street-vending-machine', targetHeight: 1.95 },
  'street-food-cart': { id: 'street-food-cart', targetHeight: 1.9 },
  // nature
  'nature-tree-broadleaf': { id: 'nature-tree-broadleaf', targetHeight: 5.4 },
  'nature-data-palm': { id: 'nature-data-palm', targetHeight: 4.8 },
  'nature-hedge-section': { id: 'nature-hedge-section', targetHeight: 1.05 },
  'nature-rock-cluster': { id: 'nature-rock-cluster', targetHeight: 1.15 },
  // vehicles (modeled along +x; -π/2 lays the length onto +z, the city's
  // parked-car axis at rotation 0)
  'vehicle-hovercar-sedan': { id: 'vehicle-hovercar-sedan', targetLength: 4.5, yawOffset: -Math.PI / 2 },
  'vehicle-hovercar-sport': { id: 'vehicle-hovercar-sport', targetLength: 4.2, yawOffset: -Math.PI / 2 },
  'vehicle-delivery-van': { id: 'vehicle-delivery-van', targetLength: 4.8, yawOffset: -Math.PI / 2 },
  // The bike is modeled front = -x — SETTLED in the standalone viewer
  // (artifacts/visual-qa/rebuild/hoverbike-negx.png: camera on -x sees the
  // windshield + handlebars dead-on). rotateY(+π/2) maps -x → +z, the
  // direction HoverboardPose.yaw = 0 rides toward — the wave-1 value was
  // right; the flagged 50/50 is now verified, not guessed.
  'vehicle-hoverbike': { id: 'vehicle-hoverbike', targetLength: 2.05, yawOffset: Math.PI / 2 },
  'vehicle-courier-drone': { id: 'vehicle-courier-drone', targetLength: 1.1 },
  // realism street pack (July 2026): real-world meters, origin bottom-centre,
  // rest at hover-pad height. Unlike the wave-1 fleet these vehicles are
  // modeled front = +z — the parked-car axis at rotation 0 — so no yawOffset.
  'vehicle-hover-pickup': { id: 'vehicle-hover-pickup', targetLength: 5.0 },
  'vehicle-hovercar-wagon': { id: 'vehicle-hovercar-wagon', targetLength: 4.7 },
  'vehicle-hovercar-beater': { id: 'vehicle-hovercar-beater', targetLength: 4.3 },
  'street-lamp-neon': { id: 'street-lamp-neon', targetHeight: 4.4 },
  'street-bench-neon': { id: 'street-bench-neon', targetHeight: 0.9 },
  'street-recycle-station': { id: 'street-recycle-station', targetHeight: 1.35 },
  'street-bus-shelter-old': { id: 'street-bus-shelter-old', targetHeight: 2.6 },
  'street-barrier-crowd': { id: 'street-barrier-crowd', targetHeight: 1.1 },
  'street-parcel-locker': { id: 'street-parcel-locker', targetHeight: 1.9 },
  'street-traffic-signal': { id: 'street-traffic-signal', targetHeight: 5.4 },
  'street-scooter-shared': { id: 'street-scooter-shared', targetHeight: 1.15 },
  'street-phone-booth': { id: 'street-phone-booth', targetHeight: 2.4 },
  'street-utility-pole': { id: 'street-utility-pole', targetHeight: 8.5 },
  // interactables
  'interact-arcade-cabinet': { id: 'interact-arcade-cabinet', targetHeight: 1.9 },
  'interact-camera-tripod': { id: 'interact-camera-tripod', targetHeight: 1.4 },
  'interact-parcel-box': { id: 'interact-parcel-box', targetHeight: 0.5 },
  'interact-memory-crystal': { id: 'interact-memory-crystal', targetHeight: 1.3 },
  // landmarks (heights sized against the primitives they replace)
  // The signal spire normalizes tall; its box fit (buildSignalSpire) rescales
  // per-axis anyway, so this only sets the neutral model.size basis.
  'landmark-signal-spire': { id: 'landmark-signal-spire', targetHeight: 62 },
  'landmark-observatory-dome': { id: 'landmark-observatory-dome', targetHeight: 16 },
  'landmark-bridge-pylon': { id: 'landmark-bridge-pylon', targetHeight: 34 },
  'landmark-spiral-tower': { id: 'landmark-spiral-tower', targetHeight: 46 },
  'landmark-district-gate': { id: 'landmark-district-gate', targetHeight: 16 },
  'landmark-lighthouse': { id: 'landmark-lighthouse', targetHeight: 30 },
  'landmark-wind-turbine': { id: 'landmark-wind-turbine', targetHeight: 34 },
  // dojo set dressing
  'dojo-brass-orrery': { id: 'dojo-brass-orrery', targetHeight: 1.7 },
  'dojo-conveyor-unit': { id: 'dojo-conveyor-unit', targetHeight: 1.1 },
  'dojo-crane-gantry': { id: 'dojo-crane-gantry', targetHeight: 4.2 },
  'dojo-display-plinth': { id: 'dojo-display-plinth', targetHeight: 1.1 },
  'dojo-holo-console': { id: 'dojo-holo-console', targetHeight: 1.05 },
  'dojo-server-rack': { id: 'dojo-server-rack', targetHeight: 1.85 },
  'dojo-switchboard-panel': { id: 'dojo-switchboard-panel', targetHeight: 1.6 },
  'dojo-vault-door': { id: 'dojo-vault-door', targetHeight: 3.4 },
  'dojo-workbench': { id: 'dojo-workbench', targetHeight: 0.95 },
  // boss arena set dressing
  'arena-corrupted-obelisk': { id: 'arena-corrupted-obelisk', targetHeight: 5.2 },
  'arena-energy-pylon': { id: 'arena-energy-pylon', targetHeight: 3.6 },
  'arena-firewall-panel': { id: 'arena-firewall-panel', targetHeight: 3.2 },
  // Boss-kit (July 2026 asset pass) — normalization only; the arena
  // integration is the follow-up batch. Sizes are provisional stage-dressing
  // scales, retuned when the kit is placed.
  'arena-core-throne': { id: 'arena-core-throne', targetHeight: 4.5 },
  'arena-debris-barricade': { id: 'arena-debris-barricade', targetHeight: 1.6 },
  'arena-floor-emblem': { id: 'arena-floor-emblem', targetLength: 6 },
  'arena-holo-ring': { id: 'arena-holo-ring', targetLength: 8 },
  'arena-holo-warning': { id: 'arena-holo-warning', targetHeight: 2.2 },
  'arena-pillar-conduit': { id: 'arena-pillar-conduit', targetHeight: 5 },
  'arena-pillar-holo': { id: 'arena-pillar-holo', targetHeight: 5 },
  // Tier-13 per-boss arena signature set pieces (RealmStageDressing).
  'arena-alley-signstack': { id: 'arena-alley-signstack', targetHeight: 7.5 },
  'arena-mirror-monolith': { id: 'arena-mirror-monolith', targetHeight: 6.5 },
  'arena-quarry-excavator': { id: 'arena-quarry-excavator', targetLength: 5.5 },
  'arena-container-stack': { id: 'arena-container-stack', targetHeight: 5.2 },
  'arena-sphinx-statue': { id: 'arena-sphinx-statue', targetHeight: 4.2 },
}

/* ------------------------------------------------------------- prop cells */

export {
  MESHY_CELLS,
  SPAWN_CELL_INDEX,
  cellIndexWithin,
  keptStreetProps,
  streetCellsFor,
  streetCellKeyAt,
  midTreeKept,
  STREET_CELL_SIZE,
} from './meshySwap'
export type { MeshySwapKind } from './meshySwap'

/** Radius factor per unified tier (LOW never mounts the system at all). */
export function meshyRadiusScale(tier: GraphicsTier): number {
  switch (tier) {
    case 'ultra':
      return 1
    case 'high':
      return 0.85
    case 'medium':
      return 0.55
    case 'low':
      return 0
  }
}

/** Signature-kind count factor per tier. */
export function meshyCountScale(tier: GraphicsTier): number {
  switch (tier) {
    case 'ultra':
      return 1
    case 'high':
      return 0.85
    case 'medium':
      return 0.6
    case 'low':
      return 0
  }
}

/* ------------------------------------------------------------ street grid */

export interface StreetRings {
  /** NEAR ring radius (all swap kinds become real models). 0 = off. */
  near: number
  /** MID ring radius (trees only). 0 = off. */
  mid: number
  /** Tree keep-density inside the MID ring. */
  midDensity: number
}

/**
 * GRAPHICS-PURITY rings (owner directive: "the old graphics should never
 * show up"). The primitive prop batches cull at cullRadius·0.55 = 165m
 * (props) and ·0.7 = 210m (trees) — see InstancedWorld — so the Meshy rings
 * are sized to COVER those bands completely at every mounted tier:
 * - NEAR 170m ≥ the 165m prop cull → a primitive bench/planter/lamp/bin is
 *   never inside the visible bubble; beyond it nothing renders (fog band).
 * - MID 215m ≥ the 210m tree cull → every visible tree is a real model.
 * `streetCellsFor` guarantees full coverage (closest-point membership), so
 * these radii are hard promises, not centre-of-cell approximations. Tiers
 * now differ only in MID-tree density — the governor's honest levers are
 * resolution / shadows / city-life, never "turn the city blocky".
 * - LOW: nothing (the layer is never mounted at LOW).
 */
export function streetRingRadii(tier: GraphicsTier): StreetRings {
  switch (tier) {
    case 'ultra':
      return { near: 170, mid: 215, midDensity: 0.75 }
    case 'high':
      return { near: 170, mid: 215, midDensity: 0.6 }
    case 'medium':
      return { near: 170, mid: 215, midDensity: 0.5 }
    case 'low':
      return { near: 0, mid: 0, midDensity: 0 }
  }
}

/**
 * The real-building swap keeps its own (tighter) rings: primitive buildings
 * are the DESIGNED far look (atlas facades + emissive night windows), not
 * placeholder graphics, and every swapped building is a heavy LOD draw. The
 * NEAR ring swaps everything; towers additionally swap through MID so the
 * skyline settles once instead of morphing at the street boundary.
 */
export function buildingRingRadii(tier: GraphicsTier): StreetRings {
  switch (tier) {
    case 'ultra':
      return { near: 110, mid: 220, midDensity: 1 }
    case 'high':
      return { near: 90, mid: 180, midDensity: 1 }
    case 'medium':
      return { near: 0, mid: 140, midDensity: 1 }
    case 'low':
      return { near: 0, mid: 0, midDensity: 0 }
  }
}

/** Swap-kind → model id (single-model kinds; benches/cars/trees/hydrants/
 *  lamps pick per instance). */
export const SWAP_MODEL: Record<Exclude<MeshySwapKind, 'bench' | 'car' | 'tree' | 'hydrant' | 'lamp'>, string> = {
  trashCan: 'street-trash-bin',
  planter: 'street-planter-shrub',
}

/** The Crystal Neon Quarter runs neon-tube lamp heads; LED everywhere else. */
export function lampModelAt(x: number, z: number, available?: ReadonlySet<string>): string {
  if (districtIndexAt(x, z) === 2 && (!available || available.has('street-lamp-neon'))) {
    return 'street-lamp-neon'
  }
  return 'street-lamp-led'
}

/** District tree species (wave-2 adoption; broadleaf is the wave-1 floor). */
export function treeModelAt(x: number, z: number, available?: ReadonlySet<string>): string {
  const district = districtIndexAt(x, z)
  const roll = positionHash(x, z, 91)
  let id: string
  switch (district) {
    case 0: // Verdant Downtown — lush mixed park species
      id = roll < 0.4 ? 'nature-tree-oak' : roll < 0.72 ? 'nature-tree-broadleaf' : 'nature-tree-maple'
      break
    case 1: // Harborfront — sea-wind cypress among the broadleafs
      id = roll < 0.55 ? 'nature-tree-broadleaf' : 'nature-tree-cypress'
      break
    case 2: // Crystal Neon Quarter — manicured maples under the towers
      id = roll < 0.55 ? 'nature-tree-broadleaf' : 'nature-tree-maple'
      break
    case 3: // Old Town — autumn maples + oaks
      id = roll < 0.5 ? 'nature-tree-maple' : 'nature-tree-oak'
      break
    case 4: // Container Port — sparse, a third of them dead (industrial)
      id = roll < 0.3 ? 'nature-tree-dead' : 'nature-tree-broadleaf'
      break
    default: // Mountain Outskirts — alpine cypress + hardy oaks
      id = roll < 0.55 ? 'nature-tree-cypress' : 'nature-tree-oak'
      break
  }
  return !available || available.has(id) ? id : 'nature-tree-broadleaf'
}

/** Downtown/Neon districts run the modern hydrant once it lands. */
export function hydrantModelAt(x: number, z: number, available?: ReadonlySet<string>): string {
  const district = districtIndexAt(x, z)
  const modern = district === 0 || district === 2
  if (modern && (!available || available.has('street-hydrant-modern'))) {
    return 'street-hydrant-modern'
  }
  return 'street-fire-hydrant'
}

/** The full street-shell model inventory for a tier (before availability).
 *  Every shell id ships as its `lod:` variant — hundreds of instances per
 *  model make the full-detail meshes vertex-bound. */
export function streetModelsForTier(
  tier: GraphicsTier,
  available?: ReadonlySet<string>,
): string[] {
  const rings = streetRingRadii(tier)
  if (rings.near <= 0 && rings.mid <= 0) return []
  const trees = [
    'nature-tree-broadleaf',
    'nature-tree-oak',
    'nature-tree-maple',
    'nature-tree-cypress',
    'nature-tree-dead',
  ]
  const ids =
    rings.near <= 0
      ? trees
      : [
          ...trees,
          'street-bench-modern',
          'street-bench-classic',
          'street-bench-neon',
          'street-trash-bin',
          'street-planter-shrub',
          'street-fire-hydrant',
          'street-hydrant-modern',
          'street-lamp-led',
          'street-lamp-neon',
          // NB: vehicles are NOT in the density shell — the always-on
          // MeshyHeroCars layer owns car rendering (see heroCarModelsForTier).
        ]
  return (available ? ids.filter((id) => available.has(id)) : ids).map(lodId)
}

/**
 * All street-grid Meshy instances for the live rings, grouped per model id —
 * ONE InstancedMesh draw per model for the whole shell. Deterministic; the
 * exact complement of `keptStreetProps` so no prop ever renders twice.
 * `available` (landed manifest ids) downgrades wave-2 picks to their wave-1
 * fallback so a mid-landing manifest never leaves holes.
 */
export function buildStreetBatches(
  nearCells: readonly number[],
  midCells: readonly number[],
  midDensity: number,
  available?: ReadonlySet<string>,
): Map<string, MeshyPlacement[]> {
  const out = new Map<string, MeshyPlacement[]>()
  if (nearCells.length === 0 && midCells.length === 0) return out
  const near = new Set(nearCells)
  const mid = new Set(midCells)
  const push = (id: string, x: number, z: number, yaw: number, scale: number) => {
    const key = lodId(id)
    let list = out.get(key)
    if (!list) out.set(key, (list = []))
    list.push({ x, z, yaw, scale })
  }
  for (const kind of MESHY_SWAP_KINDS) {
    if (near.size === 0 && kind !== 'tree') continue
    for (const item of SCENERY[kind]) {
      const key = streetCellKeyAt(item.x, item.z)
      const inNear = near.has(key)
      const inMid =
        !inNear && kind === 'tree' && mid.has(key) && midTreeKept(item, midDensity)
      if (!inNear && !inMid) continue
      switch (kind) {
        case 'tree':
          push(treeModelAt(item.x, item.z, available), item.x, item.z, item.r, item.s)
          break
        case 'bench':
          push(
            benchModelForDistrict(districtIndexAt(item.x, item.z), available),
            item.x,
            item.z,
            benchSwapYaw(item),
            item.s,
          )
          break
        case 'car':
          // Cars are owned by the always-on MeshyHeroCars layer (rendered near
          // the player at EVERY mounted tier, not gated behind the density
          // near-ring which is off at MEDIUM). Skip them here.
          break
        case 'hydrant':
          push(hydrantModelAt(item.x, item.z, available), item.x, item.z, item.r, item.s)
          break
        case 'lamp':
          push(lampModelAt(item.x, item.z, available), item.x, item.z, item.r, item.s)
          break
        default:
          push(SWAP_MODEL[kind], item.x, item.z, item.r, item.s)
          break
      }
    }
  }
  return out
}

/* -------------------------------------------------------------- swap kinds */

/** Old Town + Mountain Outskirts favour the wrought classic bench; the
 *  Crystal Neon Quarter runs the glowing neon bench (availability-gated). */
export function benchModelForDistrict(district: number, available?: ReadonlySet<string>): string {
  if (district === 3 || district === 5) return 'street-bench-classic'
  if (district === 2 && (!available || available.has('street-bench-neon'))) {
    return 'street-bench-neon'
  }
  return 'street-bench-modern'
}

/** Kerb strip offset the street furniture stands on (layout.ts: off = 10). */
const KERB_STRIP_OFF = ROAD_HALF_W + 4 - 1
const KERB_TOLERANCE = 0.75
const ROAD_STEP = 74

function nearestRoadLineTo(v: number): number {
  return Math.round(v / ROAD_STEP) * ROAD_STEP
}

/**
 * Yaw for a SWAPPED bench so the seat faces its street. The seeded layout
 * reuses r ∈ {0, π/2} for every bench — fine for the symmetric primitive
 * box, but the Meshy benches have a real back (modeled at -z), so kerb
 * benches would face ALONG the road. Kerb benches (exactly on the lamp
 * strip, ±10m off a road line) turn toward their road; park benches keep
 * their seeded yaw. Pure + deterministic — the primitive kept-list never
 * sees this.
 */
export function benchSwapYaw(prop: Pick<Prop, 'x' | 'z' | 'r'>): number {
  const lineX = nearestRoadLineTo(prop.x)
  const lineZ = nearestRoadLineTo(prop.z)
  const offX = prop.x - lineX
  const offZ = prop.z - lineZ
  // Vertical-road kerb bench (seeded r=0): face across toward the asphalt.
  if (Math.abs(Math.abs(offX) - KERB_STRIP_OFF) <= KERB_TOLERANCE) {
    return offX > 0 ? -Math.PI / 2 : Math.PI / 2
  }
  // Horizontal-road kerb bench (seeded r=π/2): same, along z.
  if (Math.abs(Math.abs(offZ) - KERB_STRIP_OFF) <= KERB_TOLERANCE) {
    return offZ > 0 ? Math.PI : 0
  }
  return prop.r
}

/** Deterministic parked-vehicle model per kerb spot (Neon Quarter loves
 *  sport cars; the port parks working trucks + pickups; Old Town runs
 *  beaters; the outskirts park pickups + wagons — every pick is
 *  availability-gated to its wave-1 stand-in). */
export function vehicleModelAt(
  x: number,
  z: number,
  available?: ReadonlySet<string>,
): string {
  const ok = (id: string) => !available || available.has(id)
  const district = districtIndexAt(x, z)
  const roll = positionHash(x, z, 71)
  if (district === 2) {
    // Crystal Neon Quarter — upscale kerbs: sports, taxis, clean sedans.
    if (roll < 0.5) return 'vehicle-hovercar-sport'
    if (roll < 0.62 && ok('vehicle-hovercar-taxi')) return 'vehicle-hovercar-taxi'
    return 'vehicle-hovercar-sedan'
  }
  if (district === 4) {
    // Container Port — working iron: vans, box trucks, hover pickups.
    if (roll < 0.22) return 'vehicle-delivery-van'
    if (roll < 0.38 && ok('vehicle-box-truck')) return 'vehicle-box-truck'
    if (roll < 0.6 && ok('vehicle-hover-pickup')) return 'vehicle-hover-pickup'
  }
  if (district === 3) {
    // Old Town — dented beaters between the brick rows.
    if (roll < 0.24 && ok('vehicle-hovercar-beater')) return 'vehicle-hovercar-beater'
    if (roll < 0.34 && ok('vehicle-box-truck')) return 'vehicle-box-truck'
  }
  if (district === 5) {
    // Mountain Outskirts driveways — pickups + family wagons.
    if (roll < 0.3 && ok('vehicle-hover-pickup')) return 'vehicle-hover-pickup'
    if (roll < 0.55 && ok('vehicle-hovercar-wagon')) return 'vehicle-hovercar-wagon'
  }
  if (roll < 0.12) return 'vehicle-delivery-van'
  if (roll < 0.34) return 'vehicle-hovercar-sport'
  if (roll < 0.44 && ok('vehicle-hovercar-wagon')) return 'vehicle-hovercar-wagon'
  if (roll < 0.52 && ok('vehicle-hovercar-compact')) return 'vehicle-hovercar-compact'
  if (roll < 0.58 && ok('vehicle-hovercar-taxi')) return 'vehicle-hovercar-taxi'
  if (roll < 0.64 && ok('vehicle-hovercar-beater')) return 'vehicle-hovercar-beater'
  return 'vehicle-hovercar-sedan'
}

/* ------------------------------------------------------- hero cars (always-on) */

/** The full parked-vehicle pool the always-on hero-car layer can render. */
export const HERO_CAR_MODELS = [
  'vehicle-hovercar-sedan',
  'vehicle-hovercar-sport',
  'vehicle-hovercar-compact',
  'vehicle-hovercar-taxi',
  'vehicle-hovercar-wagon',
  'vehicle-hovercar-beater',
  'vehicle-hover-pickup',
  'vehicle-delivery-van',
  'vehicle-box-truck',
] as const

/**
 * Radius (m) the hero-car layer renders real vehicles around the player.
 * Cars are the street element players notice most, so the ring covers the
 * ENTIRE primitive-car visibility bubble (the car batches cull at
 * cullRadius·0.55 = 165m): with the ring at 170m a primitive box-car can
 * never be on screen at any mounted tier — the kept primitives all sit
 * beyond their own cull radius. Per-instance distance (not cells), so the
 * radius is exact.
 */
export function heroCarRingRadius(tier: GraphicsTier): number {
  return tier === 'low' ? 0 : 170
}

export interface HeroCarPlan {
  /** SCENERY.car indices covered (published to hide the matching primitives). */
  indices: number[]
  /** Real vehicle placements grouped by FULL-detail model id. */
  groups: Map<string, (MeshyPlacement & { index: number })[]>
}

/**
 * Every parked car within `radius` of the player, resolved to its deterministic
 * real vehicle model (availability-gated) and grouped per model id for one
 * InstancedMesh draw each. Pure + deterministic; `cars` is SCENERY.car.
 */
export function buildHeroCarPlan(
  cars: readonly Prop[],
  px: number,
  pz: number,
  radius: number,
  available?: ReadonlySet<string>,
): HeroCarPlan {
  const indices: number[] = []
  const groups = new Map<string, (MeshyPlacement & { index: number })[]>()
  if (radius <= 0) return { indices, groups }
  const r2 = radius * radius
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i]
    const dx = c.x - px
    const dz = c.z - pz
    if (dx * dx + dz * dz > r2) continue
    indices.push(i)
    const id = vehicleModelAt(c.x, c.z, available)
    let list = groups.get(id)
    if (!list) groups.set(id, (list = []))
    list.push({ x: c.x, z: c.z, yaw: c.r, scale: c.s, index: i })
  }
  indices.sort((a, b) => a - b)
  return { indices, groups }
}

/* --------------------------------------------------------- signature kinds */

export type MeshySignatureKind =
  | 'kiosk'
  | 'shelter'
  | 'bollard'
  | 'vending'
  | 'foodCart'
  | 'hedge'
  | 'rock'
  | 'palm'
  | 'fountain'
  | 'marketStall'
  | 'metro'

export const SIGNATURE_MODEL: Record<MeshySignatureKind, string> = {
  kiosk: 'street-holo-kiosk',
  shelter: 'street-bus-shelter',
  bollard: 'street-bollard',
  vending: 'street-vending-machine',
  foodCart: 'street-food-cart',
  hedge: 'nature-hedge-section',
  rock: 'nature-rock-cluster',
  palm: 'nature-data-palm',
  // Wave-2 structures (landed): plaza water feature, market, metro entrance.
  fountain: 'structure-plaza-fountain',
  marketStall: 'structure-market-stall',
  metro: 'structure-metro-entrance',
}

/** A Meshy instance transform (yaw radians, uniform scale). */
export interface MeshyPlacement {
  x: number
  z: number
  yaw: number
  scale: number
  /** Optional height (rooftop clutter rides its building's roof). */
  y?: number
}

/**
 * Which signature kinds each cell favours (placementHint-driven):
 *   0 Verdant Downtown   — greenery: hedges, planter-dense sidewalks
 *   1 Harborfront        — data palms + food carts on the promenade
 *   2 Crystal Neon Qtr   — holo kiosks ×2 density, showpiece vending
 *   3 Old Town           — bollard-sealed arcades, market food cart
 *   4 Container Port     — vending alcoves + bollards
 *   5 Mountain Outskirts — rock clusters + hedge windbreaks
 *   6 Spawn plaza        — a little of everything (first impression)
 */
export const CELL_SIGNATURE_KINDS: Record<number, Partial<Record<MeshySignatureKind, number>>> = {
  0: { kiosk: 2, shelter: 1, vending: 1, hedge: 2, rock: 3, bollard: 8, fountain: 1, metro: 1 },
  1: { kiosk: 2, shelter: 1, foodCart: 2, palm: 8, bollard: 8, marketStall: 2, fountain: 1 },
  2: { kiosk: 4, shelter: 1, vending: 2, palm: 6, foodCart: 1, metro: 1, fountain: 1 },
  3: { kiosk: 1, shelter: 1, foodCart: 1, hedge: 2, bollard: 8, vending: 1, marketStall: 2, fountain: 1 },
  4: { kiosk: 1, shelter: 1, vending: 2, bollard: 8, rock: 2, metro: 1 },
  5: { kiosk: 1, shelter: 1, rock: 5, hedge: 2, vending: 1, marketStall: 1 },
  6: { kiosk: 1, shelter: 1, vending: 1, foodCart: 1, palm: 4, hedge: 2, bollard: 8, fountain: 1, metro: 1 },
}

/** Quest-site clearance (same rule family as streetDecals/citizenRoutes). */
const CLEARINGS: { p: Vec2; r: number }[] = [
  ...CHECKPOINTS_3D.map((c) => ({ p: c.flag, r: 24 })),
  ...CHECKPOINTS_3D.map((c) => ({ p: c.boss, r: 24 })),
  ...WORLD_GATES.flatMap((gates) => gates.map((g) => ({ p: g, r: 22 }))),
  { p: START_3D, r: 22 },
]

function inClearing(x: number, z: number, pad = 0): boolean {
  for (const c of CLEARINGS) {
    const dx = c.p.x - x
    const dz = c.p.z - z
    const r = c.r + pad
    if (dx * dx + dz * dz < r * r) return true
  }
  return false
}

/** Sidewalk anchor: a point on the pedestrian strip + the road's direction. */
interface SidewalkAnchor {
  x: number
  z: number
  /** Yaw facing the road (toward the kerb). */
  faceRoad: number
  /** Yaw along the road direction. */
  alongRoad: number
  d2: number
}

const SIDEWALK_OFF = ROAD_HALF_W + 3 // 10m — same strip the lamps stand on
const ANCHOR_STEP = 74 / 3

/**
 * Deterministic sidewalk anchors around a cell centre, sorted nearest-first.
 * Anchors sit halfway between the existing lamp/bench/bin rhythm points so
 * signature props never collide with the swapped street furniture.
 */
export function sidewalkAnchorsFor(cell: number, radius = 100): SidewalkAnchor[] {
  const centre = MESHY_CELLS[cell]
  const anchors: SidewalkAnchor[] = []
  for (const line of ROAD_LINES) {
    for (let s = -CITY_LIMIT + ANCHOR_STEP / 2; s <= CITY_LIMIT; s += ANCHOR_STEP) {
      const mid = s + ANCHOR_STEP / 2
      for (const side of [-1, 1] as const) {
        // vertical road at x=line (runs along z)
        {
          const x = line + side * SIDEWALK_OFF
          const z = mid
          const dx = x - centre.x
          const dz = z - centre.z
          const d2 = dx * dx + dz * dz
          if (d2 <= radius * radius && Math.hypot(x, z) <= CITY_LIMIT - 10 && !inClearing(x, z, 2)) {
            anchors.push({
              x,
              z,
              faceRoad: side < 0 ? Math.PI / 2 : -Math.PI / 2,
              alongRoad: 0,
              d2,
            })
          }
        }
        // horizontal road at z=line (runs along x)
        {
          const x = mid
          const z = line + side * SIDEWALK_OFF
          const dx = x - centre.x
          const dz = z - centre.z
          const d2 = dx * dx + dz * dz
          if (d2 <= radius * radius && Math.hypot(x, z) <= CITY_LIMIT - 10 && !inClearing(x, z, 2)) {
            anchors.push({
              x,
              z,
              faceRoad: side < 0 ? 0 : Math.PI,
              alongRoad: Math.PI / 2,
              d2,
            })
          }
        }
      }
    }
  }
  anchors.sort((a, b) => a.d2 - b.d2)
  return anchors
}

function placeAt(anchor: SidewalkAnchor, yaw: number, cell: number, salt: number): MeshyPlacement {
  return {
    x: anchor.x,
    z: anchor.z,
    yaw,
    scale: 0.95 + positionHash(anchor.x + cell, anchor.z, salt) * 0.12,
  }
}

/**
 * All signature placements for one cell. Deterministic. Everything except
 * bollards sits on sidewalk anchors (building-free by construction — the
 * same strip lamps/benches occupy, offset half a rhythm step); bollard rows
 * sit on the plaza's road approaches. Quest clearings respected via the
 * anchor filter. `countScale` trims counts on lower tiers.
 */
export function buildSignaturePlacements(
  cell: number,
  countScale = 1,
): Map<MeshySignatureKind, MeshyPlacement[]> {
  const out = new Map<MeshySignatureKind, MeshyPlacement[]>()
  const palette = CELL_SIGNATURE_KINDS[cell] ?? {}
  const anchors = sidewalkAnchorsFor(cell)
  if (anchors.length === 0) return out
  const centre = MESHY_CELLS[cell]

  const scaled = (n: number) => Math.max(n > 0 ? 1 : 0, Math.round(n * countScale))
  // Distinct (fromIndex, stride) pairs keep the kinds from stacking on the
  // same anchors while every pick stays deterministic.
  const take = (fromIndex: number, stride: number, n: number): SidewalkAnchor[] => {
    const picked: SidewalkAnchor[] = []
    const seen = new Set<number>()
    for (let k = 0; k < n; k++) {
      const idx = (fromIndex + k * stride) % anchors.length
      if (seen.has(idx)) continue
      seen.add(idx)
      picked.push(anchors[idx])
    }
    return picked
  }

  // Kiosks face the road from plaza-adjacent sidewalks.
  if (palette.kiosk) {
    out.set(
      'kiosk',
      take(2, 5, scaled(palette.kiosk)).map((a) => placeAt(a, a.faceRoad, cell, 3)),
    )
  }
  // Bus shelter on the nearest sidewalk, back panel to the block, open to road.
  if (palette.shelter) {
    out.set(
      'shelter',
      take(0, 9, scaled(palette.shelter)).map((a) => placeAt(a, a.faceRoad, cell, 5)),
    )
  }
  // Vending machines nudged off the strip toward the building line.
  if (palette.vending) {
    out.set(
      'vending',
      take(4, 7, scaled(palette.vending)).map((a) => {
        const p = placeAt(a, a.faceRoad, cell, 7)
        p.x += Math.sin(a.faceRoad + Math.PI) * 1.0
        p.z += Math.cos(a.faceRoad + Math.PI) * 1.0
        return p
      }),
    )
  }
  // Food carts angle across their sidewalk pitch (vendor anchor points).
  if (palette.foodCart) {
    out.set(
      'foodCart',
      take(3, 11, scaled(palette.foodCart)).map((a) =>
        placeAt(a, a.faceRoad + 0.5, cell, 11),
      ),
    )
  }
  // Hedges tile 3 sections end-to-end along the sidewalk.
  if (palette.hedge) {
    const rows = take(9, 13, scaled(palette.hedge))
    const items: MeshyPlacement[] = []
    for (const row of rows) {
      for (let k = -1; k <= 1; k++) {
        items.push({
          x: row.x + Math.sin(row.alongRoad) * k * 1.75,
          z: row.z + Math.cos(row.alongRoad) * k * 1.75,
          yaw: row.alongRoad + Math.PI / 2,
          scale: 1,
        })
      }
    }
    out.set('hedge', items)
  }
  // Rock clusters as park landscaping on the strip, random yaw.
  if (palette.rock) {
    out.set(
      'rock',
      take(6, 17, scaled(palette.rock)).map((a) => {
        const p = placeAt(a, positionHash(a.x, a.z, 13) * Math.PI * 2, cell, 13)
        p.scale = 0.8 + positionHash(a.x, a.z, 14) * 0.55
        return p
      }),
    )
  }
  // Data palms alternate down the sidewalks (boulevard rhythm).
  if (palette.palm) {
    out.set(
      'palm',
      take(1, 3, scaled(palette.palm)).map((a) => {
        const p = placeAt(a, positionHash(a.x, a.z, 17) * Math.PI * 2, cell, 17)
        p.scale = 0.9 + positionHash(a.x, a.z, 19) * 0.3
        return p
      }),
    )
  }
  // Plaza fountain: the first anchor whose strip faces the plaza — a real
  // centerpiece one block off the quest clearing.
  if (palette.fountain) {
    out.set(
      'fountain',
      take(5, 19, scaled(palette.fountain)).map((a) =>
        placeAt(a, positionHash(a.x, a.z, 21) * Math.PI * 2, cell, 21),
      ),
    )
  }
  // Market stalls angle across their pitch beside the food carts.
  if (palette.marketStall) {
    out.set(
      'marketStall',
      take(7, 23, scaled(palette.marketStall)).map((a) => placeAt(a, a.faceRoad - 0.35, cell, 23)),
    )
  }
  // Metro entrance at the far edge of the cell — the district's front door.
  if (palette.metro) {
    const anchorsFar = [...anchors].sort((a, b) => b.d2 - a.d2)
    const picks: MeshyPlacement[] = []
    for (const a of anchorsFar) {
      if (picks.length >= scaled(palette.metro)) break
      picks.push(placeAt(a, a.faceRoad, cell, 29))
    }
    out.set('metro', picks)
  }
  // Bollard rows seal the plaza's road approaches from the hover lanes.
  // x within ±5.25 of the crossing keeps every bollard on the road surface.
  if (palette.bollard) {
    const n = scaled(palette.bollard)
    const items: MeshyPlacement[] = []
    const perRow = 4
    const rows = Math.min(2, Math.max(1, Math.round(n / perRow)))
    for (let row = 0; row < rows; row++) {
      const dir = row % 2 === 0 ? 1 : -1
      const zRow = centre.z + dir * 26
      for (let k = 0; k < perRow; k++) {
        const x = centre.x + (k - (perRow - 1) / 2) * 3.5
        if (Math.hypot(x, zRow) > CITY_LIMIT - 10) continue
        items.push({ x, z: zRow, yaw: 0, scale: 1 })
      }
    }
    out.set('bollard', items)
  }

  return out
}

/* ----------------------------------------------- per-cell model inventory */

/** District-flavoured signature model: the gritty plazas (Old Town, Container
 *  Port, Mountain Outskirts) run the aged bus shelter once it lands; every
 *  other kind keeps its single SIGNATURE_MODEL. */
export function signatureModelFor(
  kind: MeshySignatureKind,
  cell: number,
  available?: ReadonlySet<string>,
): string {
  if (
    kind === 'shelter' &&
    (cell === 3 || cell === 4 || cell === 5) &&
    (!available || available.has('street-bus-shelter-old'))
  ) {
    return 'street-bus-shelter-old'
  }
  return SIGNATURE_MODEL[kind]
}

/** Every model id a live plaza cell needs before its dressing can appear.
 *  (The swap kinds moved to the citywide street grid — see streetModelsForTier;
 *  plaza cells now stream only their signature palette.) */
export function modelsForCell(cell: number, available?: ReadonlySet<string>): string[] {
  const ids = new Set<string>()
  for (const kind of Object.keys(CELL_SIGNATURE_KINDS[cell] ?? {}) as MeshySignatureKind[]) {
    ids.add(signatureModelFor(kind, cell, available))
  }
  return [...ids]
}

/* --------------------------------------------------- wave-2 model adoption */

/**
 * Wave-2 assets land DURING development (the generation agent appends to the
 * manifest). Everything here matches models by id KEYWORD, so exact naming
 * variance is tolerated, and every band renders nothing until its models
 * exist — the primitive city is the permanent graceful fallback.
 */
export interface Wave2SpecRule {
  /** Substring the model id must contain. */
  match: string
  spec: Omit<MeshyModelSpec, 'id'>
}

/** Normalization templates for the wave-2 catalog (first match wins; ids
 *  verified against the landed manifest — see meshyManifest.ts). */
export const WAVE2_SPEC_RULES: Wave2SpecRule[] = [
  // Tier-7 real building SET (bld-*). Normalized to a 30 m baseline height;
  // the building layer refits every model NON-UNIFORMLY onto the exact
  // primitive box it replaces (like the showpieces), so this baseline only
  // sets model.size before the per-axis fit — the ratio cancels it out.
  // Must sit FIRST so a keyword like 'tower'/'block' never wins over it.
  { match: 'bld-', spec: { targetHeight: 30 } },
  // Boss-kit catch-all: the arena asset drop lands incrementally; anything
  // without an explicit registry entry normalizes to stage-dressing scale
  // (retuned per piece when the arena integration batch places the kit).
  { match: 'arena-', spec: { targetHeight: 4 } },
  // nature (realistic trees/bushes: nature-tree-oak/maple/cypress/dead,
  // nature-bush-large, nature-hedge-low). NOTE: matched on 'nature-tree',
  // never bare 'tree' — "street" contains "tree" (s-TREE-t), so a bare rule
  // would swallow every unregistered street-* prop into a 6.2m swaying tree.
  { match: 'tree-cypress', spec: { targetHeight: 7.4 } },
  { match: 'tree-dead', spec: { targetHeight: 5.2 } },
  { match: 'nature-tree', spec: { targetHeight: 6.2 } },
  { match: 'bush', spec: { targetHeight: 1.2 } },
  { match: 'shrub', spec: { targetHeight: 1.2 } },
  { match: 'hedge-low', spec: { targetHeight: 0.7 } },
  { match: 'bench', spec: { targetHeight: 0.9 } },
  // rooftop clutter
  { match: 'water-tower', spec: { targetHeight: 4.6 } },
  { match: 'water-tank', spec: { targetHeight: 4.2 } },
  { match: 'hvac', spec: { targetHeight: 1.6 } },
  { match: 'antenna', spec: { targetHeight: 4.8 } },
  { match: 'vent', spec: { targetHeight: 1.1 } },
  { match: 'pergola', spec: { targetHeight: 2.6 } },
  { match: 'solar', spec: { targetHeight: 1.0 } },
  // storefronts (storefront-awning / storefront-sign-blade / -sign-box)
  { match: 'awning', spec: { targetHeight: 1.1 } },
  { match: 'sign-blade', spec: { targetHeight: 1.5 } },
  { match: 'sign-box', spec: { targetHeight: 1.2 } },
  // street grit
  { match: 'dumpster', spec: { targetHeight: 1.5 } },
  { match: 'scaffold', spec: { targetHeight: 7.5 } },
  { match: 'mailbox', spec: { targetHeight: 1.25 } },
  { match: 'bike-rack', spec: { targetHeight: 0.95 } },
  { match: 'vendor', spec: { targetHeight: 2.4 } },
  { match: 'jersey', spec: { targetLength: 2.2 } },
  { match: 'cone', spec: { targetHeight: 0.72 } },
  { match: 'fence', spec: { targetHeight: 1.9 } },
  { match: 'billboard-holo', spec: { targetHeight: 9.0 } },
  { match: 'billboard', spec: { targetHeight: 4.0 } },
  { match: 'hydrant', spec: { targetHeight: 0.95 } },
  // structures (structure-midrise-brick/-glass, market-stall, plaza-fountain,
  // metro-entrance, skybridge)
  { match: 'market-stall', spec: { targetHeight: 3.2 } },
  { match: 'fountain', spec: { targetHeight: 3.4 } },
  { match: 'metro', spec: { targetHeight: 4.4 } },
  { match: 'skybridge', spec: { targetLength: 26 } },
  { match: 'midrise', spec: { targetHeight: 30 } },
  { match: 'building', spec: { targetHeight: 30 } },
  // vehicles (vehicle-hover-bus, box-truck, hovercar-compact/-taxi,
  // security-drone). Parked spots have 5.2m colliders; the truck normalizes
  // a touch short so the overhang stays cosmetic.
  { match: 'bus', spec: { targetLength: 10.5, yawOffset: -Math.PI / 2 } },
  { match: 'truck', spec: { targetLength: 6.2, yawOffset: -Math.PI / 2 } },
  { match: 'hovercar', spec: { targetLength: 4.4, yawOffset: -Math.PI / 2 } },
  { match: 'sedan', spec: { targetLength: 4.5, yawOffset: -Math.PI / 2 } },
  { match: 'drone', spec: { targetLength: 1.2 } },
]

/* ------------------------------------------------------------ LOD variants */

/** LOD id prefix: `lod:<baseId>` loads the same GLB and meshopt-simplifies
 *  the geometry at load time (meshyModels.ts). The citywide shells render
 *  hundreds of instances per model — they use LOD ids; hero placements
 *  (landmarks, plaza signature props, interactables) stay full-detail. */
export const LOD_PREFIX = 'lod:'

export function lodId(id: string): string {
  return `${LOD_PREFIX}${id}`
}

export function baseIdOf(id: string): string {
  return id.startsWith(LOD_PREFIX) ? id.slice(LOD_PREFIX.length) : id
}

/** Spec for any model id: wave-1 registry first, then wave-2 keyword rules. */
export function specForModel(id: string): MeshyModelSpec | undefined {
  const base = baseIdOf(id)
  const known = MESHY_MODEL_SPECS[base]
  if (known) return known
  for (const rule of WAVE2_SPEC_RULES) {
    if (base.includes(rule.match)) return { id: base, ...rule.spec }
  }
  return undefined
}

/** First id (sorted for determinism) containing the keyword, else null. */
export function pickModelId(available: readonly string[], keyword: string): string | null {
  const hits = available.filter((id) => id.includes(keyword)).sort()
  return hits[0] ?? null
}

/* -------------------------------------------------- streamed-prop colliders */

/**
 * Ground-plane half-extents (m, at instance scale 1, model-local axes) for
 * every SOLID streamed prop the Meshy layers place at positions that have no
 * primitive twin (signature dressing, street grit). The render layer turns
 * these into rotation-aware layout colliders for exactly the instances it
 * draws, so the hero can no longer sprint through kiosks, shelters, food
 * carts, fountains, dumpsters… Models absent here are walk-through by
 * design (elevated bands, awnings, drones, people). Sized a touch UNDER the
 * visual silhouette — brushing a mesh edge beats hitting an invisible wall.
 */
export interface MeshyPropFootprint {
  hw: number
  hd: number
  /** Obstacle top height (m) — anything above layout.VAULT_CLEAR_TOP makes
   *  the parkour vault refuse it (a wall, not a hurdle). Omitted = low. */
  top?: number
}

const MESHY_PROP_FOOTPRINT_TABLE: Record<string, MeshyPropFootprint> = {
  // plaza signature dressing
  'street-holo-kiosk': { hw: 0.55, hd: 0.45, top: 2.3 },
  'street-bus-shelter': { hw: 1.8, hd: 0.7, top: 2.6 },
  'street-bus-shelter-old': { hw: 1.8, hd: 0.7, top: 2.6 },
  'street-bollard': { hw: 0.16, hd: 0.16, top: 0.95 },
  'street-vending-machine': { hw: 0.5, hd: 0.4, top: 1.95 },
  'street-food-cart': { hw: 1.0, hd: 0.6, top: 1.9 },
  'nature-hedge-section': { hw: 0.85, hd: 0.3, top: 1.05 },
  'nature-rock-cluster': { hw: 0.75, hd: 0.6, top: 1.15 },
  'nature-data-palm': { hw: 0.28, hd: 0.28, top: 4.8 },
  'structure-plaza-fountain': { hw: 1.7, hd: 1.7, top: 3.2 },
  'structure-market-stall': { hw: 1.3, hd: 0.9, top: 3.0 },
  'structure-metro-entrance': { hw: 2.2, hd: 1.4, top: 4.4 },
  // street-grit pack
  'street-phone-booth': { hw: 0.55, hd: 0.55, top: 2.4 },
  'street-parcel-locker': { hw: 0.7, hd: 0.35, top: 1.9 },
  'street-recycle-station': { hw: 0.6, hd: 0.45, top: 1.35 },
  'street-scooter-shared': { hw: 0.35, hd: 0.2, top: 1.15 },
  'street-utility-pole': { hw: 0.18, hd: 0.18, top: 8.5 },
  'street-barrier-crowd': { hw: 0.95, hd: 0.12, top: 1.1 },
  'street-traffic-signal': { hw: 0.2, hd: 0.2, top: 5.4 },
}

/** Keyword fallbacks for wave-2 grit models whose exact ids are matched at
 *  runtime (`pickModelId`) rather than authored. First hit wins. */
const MESHY_PROP_FOOTPRINT_KEYWORDS: [string, MeshyPropFootprint][] = [
  ['dumpster', { hw: 1.1, hd: 0.65, top: 1.4 }],
  ['scaffold', { hw: 2.2, hd: 0.7, top: 7.5 }],
  ['billboard', { hw: 2.0, hd: 0.5, top: 6.0 }],
  ['phone-booth', { hw: 0.55, hd: 0.55, top: 2.4 }],
  ['parcel-locker', { hw: 0.7, hd: 0.35, top: 1.9 }],
  ['recycle', { hw: 0.6, hd: 0.45, top: 1.35 }],
  ['scooter', { hw: 0.35, hd: 0.2, top: 1.15 }],
  ['utility-pole', { hw: 0.18, hd: 0.18, top: 8.5 }],
  ['bus-shelter', { hw: 1.8, hd: 0.7, top: 2.6 }],
  ['barrier-crowd', { hw: 0.95, hd: 0.12, top: 1.1 }],
  ['traffic-signal', { hw: 0.2, hd: 0.2, top: 5.4 }],
]

/** Solid footprint for a model id (lod-stripped, keyword-tolerant), or null
 *  for walk-through props. Pure. */
export function meshyPropFootprint(id: string): MeshyPropFootprint | null {
  const base = baseIdOf(id)
  const exact = MESHY_PROP_FOOTPRINT_TABLE[base]
  if (exact) return exact
  for (const [keyword, footprint] of MESHY_PROP_FOOTPRINT_KEYWORDS) {
    if (base.includes(keyword)) return footprint
  }
  return null
}

/** Placements with any real ground presence (elevated bands don't block). */
const COLLIDER_MAX_Y = 0.5

/**
 * Rotation-aware layout colliders for one rendered batch. Skips elevated
 * placements (rooftop/storefront bands) and models without a footprint.
 * Pure — the render layer feeds the result to layout.setDynamicColliders.
 */
export function collidersForPlacements(
  id: string,
  items: readonly Pick<MeshyPlacement, 'x' | 'z' | 'yaw' | 'scale' | 'y'>[],
): Collider[] {
  const footprint = meshyPropFootprint(id)
  if (!footprint) return []
  const out: Collider[] = []
  for (const item of items) {
    if ((item.y ?? 0) > COLLIDER_MAX_Y) continue
    out.push(
      rotatedFootprint(
        item.x,
        item.z,
        footprint.hw,
        footprint.hd,
        item.yaw,
        item.scale,
        footprint.top,
      ),
    )
  }
  return out
}

/* ------------------------------------------------------ wave-2 band builds */

/**
 * ROOFTOP CLUTTER BAND — the seeded rooftop water tanks / AC boxes inside
 * live NEAR cells re-render as real models (hash-varied per roof), turning
 * flat roofs into a varied skyline. Pure: pass the available wave-2 ids;
 * returns per-model placements PLUS which primitive lists it now covers
 * (the render layer publishes those so the primitives hide).
 */
export function buildRooftopBatches(
  nearCells: readonly number[],
  available: readonly string[],
): { batches: Map<string, MeshyPlacement[]>; coversTanks: boolean; coversAc: boolean } {
  const batches = new Map<string, MeshyPlacement[]>()
  const tower = pickModelId(available, 'water-tower') ?? pickModelId(available, 'water-tank')
  const antenna = pickModelId(available, 'antenna')
  const hvac = pickModelId(available, 'hvac')
  const vents = pickModelId(available, 'vent')
  const pergola = pickModelId(available, 'pergola')
  const solar = pickModelId(available, 'solar')
  const coversTanks = tower !== null
  const coversAc = hvac !== null || vents !== null
  if (nearCells.length === 0 || (!coversTanks && !coversAc)) {
    return { batches, coversTanks: false, coversAc: false }
  }
  const near = new Set(nearCells)
  const push = (id: string, x: number, z: number, yaw: number, scale: number, y: number) => {
    const key = lodId(id)
    let list = batches.get(key)
    if (!list) batches.set(key, (list = []))
    list.push({ x, z, yaw, scale, y })
  }
  if (coversTanks) {
    for (const item of SCENERY.rooftop) {
      if (!near.has(streetCellKeyAt(item.x, item.z))) continue
      // Tanks stay the majority; antennas and rooftop gardens break the
      // silhouette so no two skylines read the same.
      const roll = positionHash(item.x, item.z, 81)
      let id = tower!
      if (antenna && roll < 0.3) id = antenna
      else if (pergola && roll < 0.42) id = pergola
      push(id, item.x, item.z, item.r, 0.62 + item.s * 0.32, item.y ?? 0)
    }
  }
  if (coversAc) {
    for (const item of SCENERY.ac) {
      if (!near.has(streetCellKeyAt(item.x, item.z))) continue
      const roll = positionHash(item.x, item.z, 83)
      let id = (hvac ?? vents)!
      if (vents && roll < 0.34) id = vents
      else if (solar && roll < 0.52) id = solar
      push(id, item.x, item.z, item.r, 0.7 + item.s * 0.4, item.y ?? 0)
    }
  }
  return { batches, coversTanks, coversAc }
}

/**
 * STOREFRONT BAND — awnings + signs on street-facing shop bases inside live
 * NEAR cells. Additive (complements the primitive awning dressing, which
 * covers a DIFFERENT hash range of shops — no shop gets both).
 */
export function buildStorefrontBatches(
  nearCells: readonly number[],
  available: readonly string[],
  buildings: readonly Building[] = SCENERY.building,
): Map<string, MeshyPlacement[]> {
  const out = new Map<string, MeshyPlacement[]>()
  const awning = pickModelId(available, 'awning')
  const blade = pickModelId(available, 'sign-blade')
  const box = pickModelId(available, 'sign-box')
  if (nearCells.length === 0 || (!awning && !blade && !box)) return out
  const near = new Set(nearCells)
  const push = (id: string, x: number, z: number, yaw: number, scale: number, y = 0) => {
    const key = lodId(id)
    let list = out.get(key)
    if (!list) out.set(key, (list = []))
    list.push({ x, z, yaw, scale, y })
  }
  for (const b of buildings) {
    if (b.kind !== 'shop') continue
    if (!near.has(streetCellKeyAt(b.x, b.z))) continue
    const h2 = positionHash(b.x, b.z, 23)
    // The primitive awning dressing takes h2 < 0.7 (districtTheme); the
    // Meshy storefront band dresses the rest so nothing doubles up.
    if (h2 < 0.7) continue
    const sin = Math.sin(b.r)
    const cos = Math.cos(b.r)
    const off = b.d / 2 + 0.35
    const fx = b.x + sin * off
    const fz = b.z + cos * off
    const roll = positionHash(b.x, b.z, 29)
    if (awning && roll < 0.6) {
      push(awning, fx, fz, b.r, Math.min(1.4, b.w * 0.14), 2.6)
    } else if (blade && roll < 0.85) {
      // Blade signs hang perpendicular to the wall at the corner third.
      push(blade, fx + cos * b.w * 0.3, fz - sin * b.w * 0.3, b.r + Math.PI / 2, 1, 3.4)
    } else if (box) {
      push(box, fx, fz, b.r, 1, 3.6)
    }
  }
  return out
}

/** Grittier half of the city — Old Town, Container Port, Mountain Outskirts.
 *  Utility poles / aged shelters read wrong under the neon towers. */
function gritDistrict(x: number, z: number): boolean {
  const d = districtIndexAt(x, z)
  return d === 3 || d === 4 || d === 5
}

/**
 * STREET GRIT — dumpsters behind shops, scaffolding on a couple of mid-rises
 * per district, freestanding billboards on the main axes, plus the realism
 * street pack (July 2026): phone booths / parcel lockers / recycle stations /
 * shared scooters on shop frontage, utility poles + aged bus shelters down
 * the gritty districts' kerbs, second-corner traffic signals at crossings,
 * and crowd barriers flanking the checkpoint gates. Additive dressing inside
 * live NEAR cells; every piece hugs an existing collider footprint or the
 * sidewalk strip, so gameplay never changes.
 */
export function buildGritBatches(
  nearCells: readonly number[],
  available: readonly string[],
  buildings: readonly Building[] = SCENERY.building,
): Map<string, MeshyPlacement[]> {
  const out = new Map<string, MeshyPlacement[]>()
  const dumpster = pickModelId(available, 'dumpster')
  const scaffold = pickModelId(available, 'scaffold')
  const billboard =
    pickModelId(available, 'billboard-holo') ?? pickModelId(available, 'billboard')
  const phoneBooth = pickModelId(available, 'phone-booth')
  const parcelLocker = pickModelId(available, 'parcel-locker')
  const recycle = pickModelId(available, 'recycle-station')
  const scooter = pickModelId(available, 'scooter-shared')
  const utilityPole = pickModelId(available, 'utility-pole')
  const oldShelter = pickModelId(available, 'bus-shelter-old')
  const crowdBarrier = pickModelId(available, 'barrier-crowd')
  const signal = pickModelId(available, 'traffic-signal')
  const any =
    dumpster || scaffold || billboard || phoneBooth || parcelLocker || recycle ||
    scooter || utilityPole || oldShelter || crowdBarrier || signal
  if (nearCells.length === 0 || !any) return out
  const near = new Set(nearCells)
  const push = (id: string, x: number, z: number, yaw: number, scale: number) => {
    const key = lodId(id)
    let list = out.get(key)
    if (!list) out.set(key, (list = []))
    list.push({ x, z, yaw, scale })
  }
  for (const b of buildings) {
    if (!near.has(streetCellKeyAt(b.x, b.z))) continue
    const sin = Math.sin(b.r)
    const cos = Math.cos(b.r)
    if (dumpster && b.kind === 'shop' && positionHash(b.x, b.z, 61) < 0.3) {
      // Back face (away from the street the shop fronts).
      const off = b.d / 2 + 1.1
      const x = b.x - sin * off
      const z = b.z - cos * off
      if (Math.hypot(x, z) <= CITY_LIMIT - 8 && !inClearing(x, z, 2)) {
        push(dumpster, x, z, b.r + Math.PI / 2, 1)
      }
    }
    if (scaffold && b.kind === 'mid' && positionHash(b.x, b.z, 67) < 0.12) {
      // Street face, sized to roughly half the facade width.
      const off = b.d / 2 + 0.8
      const x = b.x + sin * off
      const z = b.z + cos * off
      if (Math.hypot(x, z) <= CITY_LIMIT - 8 && !inClearing(x, z, 2)) {
        push(scaffold, x, z, b.r, Math.min(1.3, Math.max(0.8, b.w / 14)))
      }
    }
    // Realism street pack — shop-frontage clutter. Disjoint hash bands (each
    // on its own salt) keep the pieces from stacking on one storefront.
    if (b.kind === 'shop') {
      const frontOff = b.d / 2 + 0.7
      const fx = b.x + sin * frontOff
      const fz = b.z + cos * frontOff
      // Corner offsets slide along the facade width (perpendicular to front).
      const corner = (t: number) => ({ x: fx + cos * b.w * t, z: fz - sin * b.w * t })
      if (recycle && positionHash(b.x, b.z, 101) < 0.16) {
        // Beside the back-alley dumpster line, other corner.
        const off = b.d / 2 + 1.0
        const p = { x: b.x - sin * off + cos * b.w * 0.28, z: b.z - cos * off - sin * b.w * 0.28 }
        if (Math.hypot(p.x, p.z) <= CITY_LIMIT - 8 && !inClearing(p.x, p.z, 2)) {
          push(recycle, p.x, p.z, b.r + Math.PI, 1)
        }
      }
      if (phoneBooth && positionHash(b.x, b.z, 103) < 0.1 && gritDistrict(b.x, b.z)) {
        const p = corner(0.34)
        if (Math.hypot(p.x, p.z) <= CITY_LIMIT - 8 && !inClearing(p.x, p.z, 2)) {
          push(phoneBooth, p.x, p.z, b.r, 1)
        }
      }
      if (parcelLocker && positionHash(b.x, b.z, 107) < 0.1) {
        const p = corner(-0.34)
        if (Math.hypot(p.x, p.z) <= CITY_LIMIT - 8 && !inClearing(p.x, p.z, 2)) {
          push(parcelLocker, p.x, p.z, b.r, 1)
        }
      }
      if (scooter && positionHash(b.x, b.z, 109) < 0.14) {
        // A shared scooter leaned askew by the door; busy shops get a pair.
        const p = corner(0.12)
        if (Math.hypot(p.x, p.z) <= CITY_LIMIT - 8 && !inClearing(p.x, p.z, 2)) {
          push(scooter, p.x, p.z, b.r + 1.15, 1)
          if (positionHash(b.x, b.z, 113) < 0.4) {
            push(scooter, p.x + cos * 0.8, p.z - sin * 0.8, b.r + 0.85, 1)
          }
        }
      }
    }
  }
  if (billboard) {
    // Freestanding billboards along the two main axes, one per second block.
    for (const line of [0]) {
      for (let s = -CITY_LIMIT + 111; s <= CITY_LIMIT - 111; s += 222) {
        for (const [x, z, yaw] of [
          [line + ROAD_HALF_W + 9, s, -Math.PI / 2],
          [s, line - ROAD_HALF_W - 9, Math.PI],
        ] as const) {
          if (Math.hypot(x, z) > CITY_LIMIT - 30) continue
          if (inClearing(x, z, 6)) continue
          if (!near.has(streetCellKeyAt(x, z))) continue
          if (positionHash(x, z, 71) < 0.45) continue
          push(billboard, x, z, yaw, 1)
        }
      }
    }
  }
  // Utility poles + aged bus shelters down the gritty districts' kerb strips
  // (a step behind the lamp line, one per block so they never crowd it).
  if (utilityPole || oldShelter) {
    const strip = ROAD_HALF_W + 5
    for (const line of ROAD_LINES) {
      for (let s = -CITY_LIMIT + 37; s <= CITY_LIMIT - 37; s += 74) {
        for (const [x, z, faceRoad] of [
          [line + strip, s, -Math.PI / 2],
          [line - strip, s + 37, Math.PI / 2],
          [s + 18, line + strip, Math.PI],
          [s - 18, line - strip, 0],
        ] as const) {
          if (Math.hypot(x, z) > CITY_LIMIT - 12) continue
          if (!near.has(streetCellKeyAt(x, z))) continue
          if (!gritDistrict(x, z)) continue
          if (inClearing(x, z, 2)) continue
          const roll = positionHash(x, z, 127)
          if (utilityPole && roll < 0.4) {
            push(utilityPole, x, z, positionHash(x, z, 131) * Math.PI * 2, 1)
          } else if (oldShelter && roll < 0.5) {
            push(oldShelter, x, z, faceRoad, 1)
          }
        }
      }
    }
  }
  // Second-corner traffic signals: the primitive cycling head owns the NE
  // corner of every crossing (layout.ts); the Meshy signal fills the SW
  // corner so intersections read double-poled like a real street.
  if (signal) {
    const corner = ROAD_HALF_W + 2.2
    for (const gx of ROAD_LINES) {
      for (const gz of ROAD_LINES) {
        const x = gx - corner
        const z = gz - corner
        if (Math.hypot(x, z) > CITY_LIMIT - 12) continue
        if (!near.has(streetCellKeyAt(x, z))) continue
        if (inClearing(x, z, 2)) continue
        if (positionHash(x, z, 137) < 0.35) continue
        // Face the crossing centre (model front +z).
        push(signal, x, z, Math.atan2(corner, corner), 1)
      }
    }
  }
  // Crowd barriers flank every checkpoint gate approach — the city knows a
  // fight happens here. Deliberately inside the quest clearing (they ARE the
  // checkpoint dressing), well off the 22m interact radius line.
  if (crowdBarrier) {
    for (const gates of WORLD_GATES) {
      for (const gate of gates) {
        if (!near.has(streetCellKeyAt(gate.x, gate.z))) continue
        for (const dir of [-1, 1] as const) {
          for (let k = 0; k < 3; k++) {
            const x = gate.x + (k - 1) * 2.3
            const z = gate.z + dir * 13
            if (Math.hypot(x, z) > CITY_LIMIT - 8) continue
            push(crowdBarrier, x, z, 0, 1)
          }
        }
      }
    }
  }
  return out
}

/* -------------------------------------------------- wave-2 hero structures */

export interface ShowpiecePlacement {
  /** structure-midrise-brick | structure-midrise-glass */
  model: string
  /** SCENERY.building index this showpiece replaces (primitive hidden). */
  index: number
  building: Building
}

export interface SkybridgePlacement {
  x: number
  z: number
  /** Yaw of the span axis (radians). */
  yaw: number
  /** Deck length (m) between the two tower faces. */
  span: number
  /** Deck height (m). */
  y: number
}

/**
 * Hero structures: the two detailed Meshy mid-rises replace prominent
 * primitive mid-rise buildings around every plaza (collision footprints are
 * IDENTICAL — the model is scaled onto the exact primitive box), and
 * skybridges link select tower pairs high above gameplay. Deterministic,
 * availability-gated; returns empty when the structure models haven't landed.
 */
export function buildShowpiecePlan(
  available: ReadonlySet<string>,
  buildings: readonly Building[] = SCENERY.building,
): { midrises: ShowpiecePlacement[]; bridges: SkybridgePlacement[] } {
  const midrises: ShowpiecePlacement[] = []
  const bridges: SkybridgePlacement[] = []
  const hasBrick = available.has('structure-midrise-brick')
  const hasGlass = available.has('structure-midrise-glass')
  const hasBridge = available.has('structure-skybridge')
  if (!hasBrick && !hasGlass && !hasBridge) return { midrises, bridges }

  const taken = new Set<number>()
  for (const centre of MESHY_CELLS) {
    if (hasBrick || hasGlass) {
      // The most prominent mid-rises a block or two off the plaza.
      const candidates: { index: number; b: Building; d: number }[] = []
      for (let i = 0; i < buildings.length; i++) {
        if (taken.has(i)) continue
        const b = buildings[i]
        if (b.kind !== 'mid') continue
        if (b.h < 20 || b.h > 40) continue
        if (b.w < 11 || b.d < 11) continue
        const d = Math.hypot(b.x - centre.x, b.z - centre.z)
        if (d < 30 || d > 115) continue
        candidates.push({ index: i, b, d })
      }
      candidates.sort((a, b) => b.b.w * b.b.d - a.b.w * a.b.d)
      for (const pick of candidates.slice(0, 2)) {
        taken.add(pick.index)
        const wantGlass = positionHash(pick.b.x, pick.b.z, 97) < 0.5
        const model =
          wantGlass && hasGlass
            ? 'structure-midrise-glass'
            : hasBrick
              ? 'structure-midrise-brick'
              : 'structure-midrise-glass'
        midrises.push({ model, index: pick.index, building: pick.b })
      }
    }

    if (hasBridge) {
      // One dramatic span per district: the closest tall pair off the plaza.
      const towers: Building[] = []
      for (const b of buildings) {
        if (b.kind !== 'tower' || b.h < 42) continue
        if (Math.hypot(b.x - centre.x, b.z - centre.z) > 170) continue
        towers.push(b)
      }
      let best: { a: Building; b: Building; d: number } | null = null
      for (let i = 0; i < towers.length; i++) {
        for (let j = i + 1; j < towers.length; j++) {
          const d = Math.hypot(towers[i].x - towers[j].x, towers[i].z - towers[j].z)
          if (d < 34 || d > 76) continue
          if (!best || d < best.d) best = { a: towers[i], b: towers[j], d }
        }
      }
      if (best) {
        const y = Math.min(best.a.h, best.b.h) * 0.7
        bridges.push({
          x: (best.a.x + best.b.x) / 2,
          z: (best.a.z + best.b.z) / 2,
          yaw: Math.atan2(best.b.x - best.a.x, best.b.z - best.a.z),
          span: best.d,
          y,
        })
      }
    }
  }
  return { midrises, bridges }
}

/* ---------------------------------------------- tier-7 real building set */

/**
 * Per-district, per-kind weighted model pools for the real building SET
 * (tier 7). The building layer replaces every primitive box inside the live
 * NEAR ring with a district-appropriate Meshy building fitted onto its exact
 * footprint. Pools are ordered best→fallback; the runtime filters to LANDED
 * ids and hashes a deterministic pick, so a partially-generated manifest
 * simply uses fewer models (and slots with nothing available stay primitive).
 * `structure-midrise-glass/brick` (wave-2) are folded in as extra variety.
 *
 * CURATED (July 2026, per-model viewer renders in test-results/vm*-*.png):
 * `bld-harbor-warehouse` and `bld-port-block-b` are excluded — their AI
 * textures come out blurred/smeared even unstretched (twice, across a
 * regeneration), and a clean primitive facade beats a melted model.
 */
export const BUILDING_POOLS: Record<number, Record<Building['kind'], string[]>> = {
  // Phase-2 skyline set (July 2026): crown/twin/terraced/blade towers,
  // balcony/deco-office/mixed mid-rises, and the three single-storey
  // bld-shop-* street fronts — mixed per the manifest placementHints.
  0: {
    tower: [
      'bld-glass-tower-a',
      'bld-glass-tower-b',
      'bld-slab-tower',
      'bld-tower-crown',
      'bld-tower-twin',
      'bld-tower-terraced',
      'bld-tower-rect',
    ],
    mid: [
      'bld-glass-hq',
      'bld-corner-l',
      'structure-midrise-glass',
      'bld-midrise-balcony',
      'bld-midrise-mixed',
      'bld-row-house',
      'bld-office-wide',
      'bld-night-hotel',
    ],
    shop: ['bld-shop-tech', 'bld-row-house', 'bld-corner-l'],
  },
  1: {
    tower: ['bld-slab-tower', 'bld-glass-tower-b', 'bld-tower-twin', 'bld-tower-rect'],
    mid: [
      'bld-harbor-civic',
      'bld-oldtown-brick-b',
      'bld-midrise-balcony',
      'bld-corner-l',
      'bld-office-wide',
      'bld-night-hotel',
    ],
    shop: ['bld-shop-noodle', 'bld-corner-l', 'bld-row-house'],
  },
  2: {
    tower: ['bld-neon-tower', 'bld-glass-tower-a', 'bld-tower-blade', 'bld-tower-terraced'],
    mid: [
      'bld-neon-signage-a',
      'bld-neon-signage-b',
      'bld-neon-arcade',
      'bld-midrise-mixed',
      'structure-midrise-glass',
      'bld-night-hotel',
    ],
    shop: ['bld-shop-arcade', 'bld-shop-tech', 'bld-neon-signage-b'],
  },
  3: {
    tower: ['bld-oldtown-clocktower', 'bld-slab-tower', 'bld-tower-crown'],
    mid: [
      'bld-oldtown-brick-a',
      'bld-oldtown-brick-b',
      'bld-midrise-deco-office',
      'structure-midrise-brick',
      'bld-midrise-balcony',
      'bld-night-hotel',
      'bld-brick-loft',
    ],
    shop: ['bld-shop-noodle', 'bld-oldtown-brick-a', 'bld-row-house', 'bld-brick-loft'],
  },
  4: {
    tower: ['bld-slab-tower', 'bld-glass-tower-b', 'bld-tower-rect'],
    mid: [
      'bld-port-block-a',
      'bld-oldtown-brick-b',
      'bld-midrise-mixed',
      'bld-corner-l',
      'bld-brick-loft',
      'bld-office-wide',
    ],
    shop: ['bld-port-block-a', 'bld-row-house', 'bld-brick-loft'],
  },
  5: {
    tower: ['bld-slab-tower'],
    mid: ['bld-alpine-lodge', 'bld-alpine-lab', 'bld-midrise-balcony', 'bld-row-house'],
    shop: ['bld-alpine-lodge', 'bld-row-house'],
  },
}

/**
 * Measured model footprints (meters on each ground axis) at the 30 m
 * normalization height the `bld-` spec applies — i.e. each model's NATURAL
 * proportions. Source: bounding boxes of the generated GLBs
 * (assets-src/meshy/raw), scaled to height 30. The fitter below uses these to
 * refuse assignments that would smear a model far from its own aspect ratio.
 */
export const BUILDING_FOOTPRINTS_H30: Record<string, { x: number; z: number }> = {
  'bld-alpine-lab': { x: 54.4, z: 45.5 },
  'bld-alpine-lodge': { x: 56.1, z: 50.0 },
  'bld-corner-l': { x: 51.9, z: 51.9 },
  'bld-glass-hq': { x: 17.6, z: 16.6 },
  'bld-glass-tower-a': { x: 7.5, z: 7.5 },
  'bld-glass-tower-b': { x: 7.2, z: 7.2 },
  'bld-harbor-civic': { x: 16.8, z: 17.1 },
  'bld-harbor-warehouse': { x: 55.8, z: 56.7 },
  'bld-neon-arcade': { x: 55.8, z: 55.8 },
  'bld-neon-signage-a': { x: 13.5, z: 12.8 },
  'bld-neon-signage-b': { x: 15.4, z: 9.8 },
  'bld-neon-tower': { x: 10.4, z: 7.5 },
  'bld-oldtown-brick-a': { x: 20.6, z: 19.8 },
  'bld-oldtown-brick-b': { x: 21.8, z: 22.4 },
  'bld-oldtown-clocktower': { x: 12.0, z: 11.0 },
  'bld-port-block-a': { x: 48.0, z: 48.0 },
  'bld-port-block-b': { x: 51.2, z: 51.9 },
  'bld-row-house': { x: 21.7, z: 15.1 },
  'bld-slab-tower': { x: 6.6, z: 6.6 },
  'bld-spawn-atrium': { x: 16.7, z: 16.7 },
  'structure-midrise-brick': { x: 15.6, z: 12.3 },
  'structure-midrise-glass': { x: 15.7, z: 15.7 },
  // Phase-2 skyline set (measured from assets-src/meshy/raw, scaled to h30).
  'bld-tower-crown': { x: 7.4, z: 7.4 },
  'bld-tower-twin': { x: 11.8, z: 11.7 },
  'bld-tower-terraced': { x: 16.3, z: 16.3 },
  'bld-tower-blade': { x: 6.3, z: 6.3 },
  'bld-midrise-balcony': { x: 18.5, z: 16.5 },
  'bld-midrise-deco-office': { x: 23.9, z: 23.8 },
  'bld-midrise-mixed': { x: 52.8, z: 53.5 },
  'bld-shop-arcade': { x: 50.4, z: 44.1 },
  'bld-shop-noodle': { x: 43.6, z: 43.3 },
  'bld-shop-tech': { x: 58.4, z: 58.4 },
  'landmark-signal-spire': { x: 13.6, z: 13.6 },
  // Tier-12 night-city rescue set (measured from assets-src/meshy/raw @ h30).
  'bld-office-wide': { x: 58.5, z: 46.7 },
  'bld-night-hotel': { x: 18.4, z: 20.2 },
  'bld-brick-loft': { x: 53.9, z: 55.2 },
  'bld-tower-rect': { x: 6.8, z: 6.8 },
}

/** Max aspect distortion the non-uniform box fit may apply: the largest
 *  per-axis scale may exceed the smallest by at most this factor. 1.45 keeps
 *  stretches subtle (windows stay window-shaped); beyond it the AI textures
 *  visibly smear and the swap reads "melted". */
export const BUILDING_MAX_STRETCH = 1.45

/**
 * Aspect distortion of fitting `id` onto box (w,h,d): ratio of the largest to
 * the smallest per-axis scale factor (1 = the fit is a pure uniform scale).
 * Infinity for models with no measured footprint. Pure.
 */
export function buildingFitDistortion(
  id: string,
  w: number,
  h: number,
  d: number,
): number {
  const f = BUILDING_FOOTPRINTS_H30[id]
  if (!f) return Infinity
  const sx = w / f.x
  const sy = h / 30
  const sz = d / f.z
  const max = Math.max(sx, sy, sz)
  const min = Math.min(sx, sy, sz)
  return min > 0 ? max / min : Infinity
}

/** Deterministic building model for a slot: the district+kind pool, filtered
 *  to landed ids AND to models whose natural proportions survive the exact
 *  box fit (≤ BUILDING_MAX_STRETCH aspect distortion). Null = the slot stays
 *  primitive — a clean facade box always beats a smeared model. Pure. */
export function buildingModelAt(b: Building, available: ReadonlySet<string>): string | null {
  const district = districtIndexAt(b.x, b.z)
  const pools = BUILDING_POOLS[district] ?? BUILDING_POOLS[0]
  const pool = pools[b.kind].filter(
    (id) =>
      available.has(id) &&
      buildingFitDistortion(id, b.w, b.h, b.d) <= BUILDING_MAX_STRETCH,
  )
  if (pool.length === 0) return null
  const roll = positionHash(b.x, b.z, 89)
  return pool[Math.floor(roll * pool.length) % pool.length]
}

/* ----------------------------------------------------- spawn showpiece */

/** The hero building generated for the spawn street (July 2026 realism pass). */
export const SPAWN_SHOWPIECE_MODEL = 'bld-spawn-atrium'

/**
 * The spawn-street showpiece: `bld-spawn-atrium` replaces the most prominent
 * primitive mid-rise/tower a short walk off the world-1 spawn plaza, so new
 * players see a real modeled building on their first street. Fitted onto the
 * exact primitive box (collider untouched) with the same anti-melt stretch
 * gate the full building swap uses. Deterministic + pure; null when the model
 * hasn't landed or no nearby box survives the distortion gate.
 */
export function buildSpawnShowpiece(
  available: ReadonlySet<string>,
  buildings: readonly Building[] = SCENERY.building,
): ShowpiecePlacement | null {
  if (!available.has(SPAWN_SHOWPIECE_MODEL)) return null
  let best: { index: number; b: Building; score: number } | null = null
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]
    if (b.kind !== 'mid' && b.kind !== 'tower') continue
    if (b.h < 18 || b.h > 46) continue
    if (b.w < 10 || b.d < 10) continue
    const d = Math.hypot(b.x - START_3D.x, b.z - START_3D.z)
    // Just off the plaza clearance ring, close enough to dominate the street.
    if (d < 26 || d > 120) continue
    if (buildingFitDistortion(SPAWN_SHOWPIECE_MODEL, b.w, b.h, b.d) > BUILDING_MAX_STRETCH) {
      continue
    }
    // Prefer big footprints, then proximity to spawn.
    const score = b.w * b.d - d * 2
    if (!best || score > best.score) best = { index: i, b, score }
  }
  return best
    ? { model: SPAWN_SHOWPIECE_MODEL, index: best.index, building: best.b }
    : null
}

export interface BuildingPlacement {
  index: number
  building: Building
}

export interface MeshyBuildingPlan {
  /** LOD model id → the primitive boxes it now renders (fit at runtime). */
  groups: Map<string, BuildingPlacement[]>
  /** SCENERY.building indices the Meshy layer draws (primitives hidden). */
  indices: number[]
}

/**
 * The real building SET plan: every primitive building inside the live NEAR
 * ring gets a district+kind-appropriate Meshy model (LOD id), grouped for one
 * InstancedMesh per model. TOWERS additionally swap through the wider MID
 * ring — they're skyline-visible long before the street ring reaches them, so
 * the near-ring pop the mid-rises can hide behind facades would read as
 * whole-skyline morphing. Footprints/colliders are untouched (the model is
 * fit onto the exact box at render time); primitives outside the rings stay
 * as the far impostor + the governor's cheap floor. `exclude` skips slots a
 * showpiece already owns (spawn atrium, signal spire). Deterministic + pure.
 */
const EMPTY_INDEX_SET: ReadonlySet<number> = new Set()
export function buildMeshyBuildingPlan(
  nearCells: readonly number[],
  available: ReadonlySet<string>,
  buildings: readonly Building[] = SCENERY.building,
  midCells: readonly number[] = [],
  exclude: ReadonlySet<number> = EMPTY_INDEX_SET,
): MeshyBuildingPlan {
  const groups = new Map<string, BuildingPlacement[]>()
  const indices: number[] = []
  if (nearCells.length === 0 && midCells.length === 0) return { groups, indices }
  const near = new Set(nearCells)
  const mid = new Set(midCells)
  for (let i = 0; i < buildings.length; i++) {
    if (exclude.has(i)) continue
    const b = buildings[i]
    const key3 = streetCellKeyAt(b.x, b.z)
    const inNear = near.has(key3)
    if (!inNear && !(b.kind === 'tower' && mid.has(key3))) continue
    const model = buildingModelAt(b, available)
    if (!model) continue
    const key = lodId(model)
    let list = groups.get(key)
    if (!list) groups.set(key, (list = []))
    list.push({ index: i, building: b })
    indices.push(i)
  }
  indices.sort((a, b) => a - b)
  return { groups, indices }
}

/* ------------------------------------------------------- signal spire */

/** Phase-2 hero landmark: the skyline pin the spiral tower orbits around. */
export const SIGNAL_SPIRE_MODEL = 'landmark-signal-spire'

/**
 * The signal spire claims the TALLEST primitive tower near the city centre
 * ("city-center high ground — visible from every district") and is fitted
 * onto that exact box, so its collider — and the skyline's tallest point —
 * never move. Hero-class curation: unlike the pool swap it skips the
 * anti-melt gate (a spire stretching taller reads as an antenna, not a
 * smear); the tallest-box pick minimizes the stretch anyway. Deterministic +
 * pure; null until the model lands.
 */
export function buildSignalSpire(
  available: ReadonlySet<string>,
  buildings: readonly Building[] = SCENERY.building,
): ShowpiecePlacement | null {
  if (!available.has(SIGNAL_SPIRE_MODEL)) return null
  let best: { index: number; b: Building; score: number } | null = null
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i]
    if (b.kind !== 'tower' || b.h < 46) continue
    const d = Math.hypot(b.x, b.z)
    if (d > 150) continue
    // Height dominates (the pin must crown the centre); nearer breaks ties.
    const score = b.h * 3 - d * 0.5
    if (!best || score > best.score) best = { index: i, b, score }
  }
  return best ? { model: SIGNAL_SPIRE_MODEL, index: best.index, building: best.b } : null
}

/**
 * Landmark index (== realm index) → Meshy model, following the manifest's
 * placementHints rather than the primitive type names: each district's
 * landmark is re-themed to its realm identity. Index 5 (Mountain Outskirts)
 * KEEPS its primitive cliff; the wind turbine is placed on the ridge beside
 * it, so the primitive landmark mask never includes bit 5.
 */
export const LANDMARK_MODEL_BY_INDEX: string[] = [
  'landmark-observatory-dome', // realm1 — Verdant Downtown hill
  'landmark-bridge-pylon', // realm2 — Harborfront waterfront
  'landmark-spiral-tower', // realm3 — Crystal Neon Quarter skyline
  'landmark-district-gate', // realm4 — Old Town threshold
  'landmark-lighthouse', // realm5 — Container Port breakwater
  'landmark-wind-turbine', // realm6 — Mountain Outskirts ridge (additive)
]

/** Landmark indices whose PRIMITIVE mesh is replaced once the model lands. */
export const LANDMARK_REPLACEABLE_MASK = 0b011111

/* ------------------------------------------------------- boot preload set */

/** Every keyword the wave-2 band builders adopt (rooftop / storefront /
 *  grit). Kept beside the inventory so the boot preloader decodes exactly
 *  what the bands can ever render. */
const BAND_KEYWORDS = [
  'water-tower',
  'water-tank',
  'antenna',
  'hvac',
  'vent',
  'pergola',
  'solar',
  'awning',
  'sign-blade',
  'sign-box',
  'dumpster',
  'scaffold',
  'billboard-holo',
  'billboard',
  'phone-booth',
  'parcel-locker',
  'recycle-station',
  'scooter-shared',
  'utility-pole',
  'bus-shelter-old',
  'barrier-crowd',
  'traffic-signal',
] as const

/**
 * THE FULL OVERWORLD MODEL INVENTORY — every Meshy id any street/building/
 * plaza/band system can render at ULTRA. The boot preloader decodes all of
 * it behind the loading veil so ring transitions only ever toggle visibility:
 * gameplay never fetches, never meshopt-decodes, never KTX2-transcodes.
 * Pure + deterministic; availability-gated so a partial manifest preloads
 * exactly what can render.
 */
export function overworldPreloadInventory(available: ReadonlySet<string>): string[] {
  const availableList = [...available]
  const ids = new Set<string>(streetModelsForTier('ultra', available))
  for (let cell = 0; cell < MESHY_CELLS.length; cell++) {
    for (const id of modelsForCell(cell, available)) ids.add(id)
  }
  for (const id of LANDMARK_MODEL_BY_INDEX) if (available.has(id)) ids.add(id)
  for (const pools of Object.values(BUILDING_POOLS)) {
    for (const pool of Object.values(pools)) {
      for (const id of pool) if (available.has(id)) ids.add(lodId(id))
    }
  }
  if (available.has(SPAWN_SHOWPIECE_MODEL)) ids.add(SPAWN_SHOWPIECE_MODEL)
  if (available.has(SIGNAL_SPIRE_MODEL)) ids.add(SIGNAL_SPIRE_MODEL)
  if (available.has('structure-skybridge')) ids.add(lodId('structure-skybridge'))
  if (available.has('vehicle-security-drone')) ids.add(lodId('vehicle-security-drone'))
  // Parked hero cars are full-detail (near the player) and always-on — preload
  // them so they are GPU-resident at spawn instead of popping in after boot.
  for (const id of HERO_CAR_MODELS) if (available.has(id)) ids.add(id)
  for (const keyword of BAND_KEYWORDS) {
    const id = pickModelId(availableList, keyword)
    if (id) ids.add(lodId(id))
  }
  return [...ids].sort()
}

/* ------------------------------------------------------ dojo set dressing */

export interface DojoDressingItem {
  id: string
  x: number
  z: number
  yaw: number
  scale?: number
}

/**
 * Fixed set dressing for every dojo interior (visual only — exhibits, kits,
 * plinth gallery, explore wing, dais, exit door, and the bot patrol band all
 * keep their floor space; these hug the walls and the open lobby seam).
 * Room: 26×26 m, exit door on the back wall at x=-7.2, kits on the right
 * wall, plinth arc back-left, explore wing front-left, dais front-right.
 */
export const DOJO_DRESSING: DojoDressingItem[] = [
  // Lobby centerpiece between the plinth gallery and the dais.
  { id: 'dojo-brass-orrery', x: 0.2, z: 6.2, yaw: 0.5 },
  // Wing entrance: vault door set into the left wall beside the explore bay.
  { id: 'dojo-vault-door', x: -12.6, z: 3.2, yaw: Math.PI / 2 },
  // Server-rack row on the back wall, left of the exit door.
  { id: 'dojo-server-rack', x: -11.6, z: -12.3, yaw: 0 },
  { id: 'dojo-server-rack', x: -10.3, z: -12.4, yaw: 0.08 },
  // Display plinths flanking the exit door.
  { id: 'dojo-display-plinth', x: -9.6, z: -12.3, yaw: 0 },
  { id: 'dojo-display-plinth', x: -4.8, z: -12.3, yaw: 0 },
  // Switchboard panel on the back wall toward the plinth gallery.
  { id: 'dojo-switchboard-panel', x: -2.4, z: -12.5, yaw: 0 },
  // Crane gantry looming in the back-right corner above the kit dressing.
  { id: 'dojo-crane-gantry', x: 11.2, z: -11.6, yaw: -0.4 },
  // Holo console near the dais walkway.
  { id: 'dojo-holo-console', x: 6.2, z: 5.6, yaw: -0.7 },
  // Workbench + conveyor along the front walls.
  { id: 'dojo-workbench', x: 4.8, z: 12.1, yaw: Math.PI },
  { id: 'dojo-conveyor-unit', x: -12.1, z: 9.6, yaw: Math.PI / 2 },
]

/** Model ids the dojo dressing needs (deduped). */
export const DOJO_DRESSING_MODELS: string[] = [...new Set(DOJO_DRESSING.map((d) => d.id))]

/* ------------------------------------------------------ arena set dressing */

export interface ArenaDressingPlacements {
  obelisks: MeshyPlacement[]
  pylons: MeshyPlacement[]
  firewalls: MeshyPlacement[]
}

export const ARENA_DRESSING_MODELS: string[] = [
  'arena-corrupted-obelisk',
  'arena-energy-pylon',
  'arena-firewall-panel',
]

/**
 * Ring dressing for a combat arena of playfield radius `arenaRadius` (the
 * ARENA_R constant; the play boundary sits ~3m inside it and the wall ~2.6m
 * outside). Everything lands between boundary and wall: perimeter obelisks
 * offset from the 10-pillar rhythm, energy pylons on thirds, firewall
 * panels tangent to the wall as breach cover.
 *
 * Every radius stays OUTSIDE the boss chase camera's clamp ring
 * (ARENA_R + 0.6): with the hero hugging the play boundary the camera never
 * ends up with a panel between its near plane and the fight. (Worst-case
 * screenshots: artifacts/visual-qa/arena-boss-*-aligned.png.)
 */
export function buildArenaDressingPlacements(arenaRadius: number): ArenaDressingPlacements {
  const ring = (
    count: number,
    radius: number,
    angleOffset: number,
    faceCentre: boolean,
    scale = 1,
  ): MeshyPlacement[] =>
    Array.from({ length: count }, (_, i) => {
      const a = angleOffset + (i / count) * Math.PI * 2
      const x = Math.cos(a) * radius
      const z = Math.sin(a) * radius
      return {
        x,
        z,
        yaw: faceCentre ? Math.atan2(-x, -z) : Math.atan2(-x, -z) + Math.PI / 2,
        scale,
      }
    })
  return {
    obelisks: ring(4, arenaRadius + 1.2, 0.31, true),
    pylons: ring(3, arenaRadius + 0.4, 1.35, true),
    firewalls: ring(3, arenaRadius + 1.0, 2.4, false),
  }
}

/** Extra placements for the FULL phase-3 boss-kit (the Vex fight remake).
 *  Everything except the walkable floor emblem sits at or beyond the play
 *  boundary, so movement clamps / camera framing stay untouched. */
export interface ArenaKitPlacements {
  /** Walkable centerpiece decal-mesh at the arena origin. */
  emblem: MeshyPlacement[]
  /** Vex's backdrop throne against the far (boss-side) wall. */
  throne: MeshyPlacement[]
  /** Conduit + holo pillar variants alternating around the ring — with the
   *  obelisks and pylons these make the four pillar silhouettes. */
  pillarConduit: MeshyPlacement[]
  pillarHolo: MeshyPlacement[]
  /** Debris cover chunks scattered between the boundary and the wall. */
  barricades: MeshyPlacement[]
  /** Glitching warning holo-panels on the wall ring. */
  warnings: MeshyPlacement[]
}

export function buildArenaKitPlacements(arenaRadius: number): ArenaKitPlacements {
  const at = (a: number, r: number, scale: number, faceCentre = true): MeshyPlacement => {
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    return { x, z, yaw: faceCentre ? Math.atan2(-x, -z) : a, scale }
  }
  return {
    emblem: [{ x: 0, z: 0, yaw: 0, scale: 1.9, y: 0.04 }],
    // The throne looms behind Vex's side of the arena (-z is upstage for the
    // fight camera, which orbits from +z).
    throne: [{ x: 0, z: -(arenaRadius + 2.4), yaw: 0, scale: 1.7 }],
    // Pillars interleave the obelisk diagonals so all four silhouettes ring
    // the space evenly: conduit pair on the flanks, holo pair up/downstage.
    pillarConduit: [at(Math.PI * 0.02, arenaRadius + 1.6, 1.15), at(Math.PI * 1.02, arenaRadius + 1.6, 1.15)],
    pillarHolo: [at(Math.PI * 0.52, arenaRadius + 1.6, 1.1), at(Math.PI * 1.52, arenaRadius + 1.6, 1.1)],
    barricades: [
      at(0.9, arenaRadius + 0.6, 1.0, false),
      at(2.75, arenaRadius + 0.8, 1.25, false),
      at(4.4, arenaRadius + 0.5, 0.9, false),
      at(5.6, arenaRadius + 0.9, 1.1, false),
    ],
    warnings: [
      at(1.8, arenaRadius + 2.0, 1.2),
      at(3.6, arenaRadius + 2.0, 1.2),
      at(5.2, arenaRadius + 2.0, 1.2),
    ],
  }
}
