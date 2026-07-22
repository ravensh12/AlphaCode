import { useMemo, useSyncExternalStore } from 'react'
import { CHECKPOINTS_3D, SCENERY, START_3D, type Prop, type Vec2 } from '../layout'

/* ============================================================================
   Meshy swap store — the ONLY Meshy-related module in the overworld's main
   chunk, so it stays tiny and three.js/manifest-free.

   Realism rebuild: street furniture streaming is no longer restricted to the
   seven plaza "detail bubbles". A STREET GRID of road-block cells (74m)
   covers the whole city; the lazy Meshy city layer marks cells live in two
   rings around the player — NEAR (every swap kind becomes a real model) and
   MID (trees only, density-thinned) — and the primitive street batches in
   Primitives3D consume `keptStreetProps` to hide exactly the instances the
   Meshy batches now render (plus ALL mid-cell trees: the thinned remainder
   renders nothing rather than a primitive — graphics-purity directive).
   Beyond the MID ring the primitive props are the far-shell impostors, but
   the rings are sized past the primitives' own cull radii (see
   streetRingRadii), so in practice a primitive prop never reaches the frame
   while the layer is live.

   The original plaza-cell mask remains for the plaza signature dressing
   (kiosks, shelters, food carts…) and the landmark swaps.

   LOW-tier contract: the layer never mounts on LOW, both rings stay empty,
   and every kept list keeps the ORIGINAL SCENERY array identity — the
   primitive city is byte-identical to pre-Meshy.
   ========================================================================== */

/**
 * The seven signature "detail bubbles": one per district plaza (index == realm
 * index, matching DISTRICTS/BIOME_TINTS order) plus the spawn plaza.
 */
export const MESHY_CELLS: Vec2[] = [
  ...CHECKPOINTS_3D.map((c) => c.flag),
  START_3D,
]
export const SPAWN_CELL_INDEX = MESHY_CELLS.length - 1

/** SCENERY lists that hand instances over to Meshy models inside live cells. */
export type MeshySwapKind =
  | 'tree'
  | 'bench'
  | 'trashCan'
  | 'planter'
  | 'hydrant'
  | 'lamp'
  | 'car'

export const MESHY_SWAP_KINDS: MeshySwapKind[] = [
  'tree',
  'bench',
  'trashCan',
  'planter',
  'hydrant',
  'lamp',
  'car',
]

/* ------------------------------------------------------------ street grid */

/** Street-grid cell edge (meters) — one road block. */
export const STREET_CELL_SIZE = 74
/** Grid index range: city spans ±694m → cell coords -10..10 on each axis. */
const CELL_RANGE = 10
const CELL_STRIDE = CELL_RANGE * 2 + 1

/** Integer cell coordinate of a world position (one axis). */
export function streetCellCoord(v: number): number {
  return Math.round(v / STREET_CELL_SIZE)
}

/** Stable scalar key for a grid cell (ix, iz in -CELL_RANGE..CELL_RANGE). */
export function streetCellKey(ix: number, iz: number): number {
  return (ix + CELL_RANGE) * CELL_STRIDE + (iz + CELL_RANGE)
}

/** Cell key covering a world position. */
export function streetCellKeyAt(x: number, z: number): number {
  return streetCellKey(streetCellCoord(x), streetCellCoord(z))
}

/**
 * Live grid rings for a player position: cells whose CLOSEST POINT is within
 * the ring radius, so a ring radius is a hard coverage guarantee — every
 * prop within `nearRadius` of the player sits in a live NEAR cell. (The old
 * centre-distance membership left corner props of a just-outside cell
 * primitive as close as radius − 52m: the "blocky bush right there" hole.)
 * NEAR cells stream every swap kind; MID cells stream density-thinned trees
 * only. Pure + deterministic (the layer feeds a quantized player position so
 * membership never flickers while idle). Sorted ascending so set comparisons
 * stay cheap.
 */
export function streetCellsFor(
  px: number,
  pz: number,
  nearRadius: number,
  midRadius: number,
): { near: number[]; mid: number[] } {
  const near: number[] = []
  const mid: number[] = []
  if (nearRadius <= 0 && midRadius <= 0) return { near, mid }
  const reach = Math.max(nearRadius, midRadius)
  const half = STREET_CELL_SIZE / 2
  const span = Math.ceil((reach + half) / STREET_CELL_SIZE)
  const cx = streetCellCoord(px)
  const cz = streetCellCoord(pz)
  for (let ix = cx - span; ix <= cx + span; ix++) {
    if (ix < -CELL_RANGE || ix > CELL_RANGE) continue
    for (let iz = cz - span; iz <= cz + span; iz++) {
      if (iz < -CELL_RANGE || iz > CELL_RANGE) continue
      // Distance from the player to the nearest point of the cell square.
      const dx = Math.max(0, Math.abs(ix * STREET_CELL_SIZE - px) - half)
      const dz = Math.max(0, Math.abs(iz * STREET_CELL_SIZE - pz) - half)
      const d = Math.hypot(dx, dz)
      if (nearRadius > 0 && d <= nearRadius) near.push(streetCellKey(ix, iz))
      else if (d <= midRadius) mid.push(streetCellKey(ix, iz))
    }
  }
  near.sort((a, b) => a - b)
  mid.sort((a, b) => a - b)
  return { near, mid }
}

/** Density roll for MID-ring trees (must match renderer + hider exactly). */
export function midTreeKept(item: Pick<Prop, 'x' | 'z'>, density: number): boolean {
  const s = Math.sin(item.x * 12.9898 + item.z * 78.233 + 61 * 37.719) * 43758.5453
  return s - Math.floor(s) < density
}

/** Cell index whose radius covers (x, z) — nearest wins — or -1. */
export function cellIndexWithin(
  x: number,
  z: number,
  radius: number,
  cellMask: number,
): number {
  let best = -1
  let bestD2 = radius * radius
  for (let i = 0; i < MESHY_CELLS.length; i++) {
    if ((cellMask & (1 << i)) === 0) continue
    const dx = MESHY_CELLS[i].x - x
    const dz = MESHY_CELLS[i].z - z
    const d2 = dx * dx + dz * dz
    if (d2 <= bestD2) {
      bestD2 = d2
      best = i
    }
  }
  return best
}

const EMPTY_CELLS: readonly number[] = []

/**
 * The primitive (kept) side of the street-grid swap: SCENERY items NOT
 * covered by a live NEAR cell. Trees additionally leave EVERY live MID cell
 * — the Meshy layer renders the density-kept fraction as real models and the
 * rest simply thin out (a primitive cone-tree mixed in among real trees read
 * as "old graphics" inside normal view distance; graphics-purity directive).
 * Returns the ORIGINAL array identity when nothing is live (LOW contract).
 */
export function keptStreetProps(
  kind: MeshySwapKind,
  nearCells: readonly number[],
  midCells: readonly number[],
  _midDensity = 1,
): readonly Prop[] {
  const items = SCENERY[kind]
  // Cars are no longer streamed by the density ring — they are owned by the
  // always-on MeshyHeroCars layer, which hides exactly the primitives it
  // replaces via its own index set (see useMeshyKeptScenery). So the density
  // ring never hides a car here; the primitive car field stays whole and the
  // hero layer subtracts its replacements at render time.
  if (kind === 'car') return items
  const checkMid = kind === 'tree' && midCells.length > 0
  if (nearCells.length === 0 && !checkMid) return items
  const near = new Set(nearCells)
  const mid = checkMid ? new Set(midCells) : null
  const kept: Prop[] = []
  for (const item of items) {
    const key = streetCellKeyAt(item.x, item.z)
    if (near.has(key)) continue
    if (mid && mid.has(key)) continue
    kept.push(item)
  }
  return kept.length === items.length ? items : kept
}

/** The primitive car field minus the indices the hero-car layer renders. */
export function keptHeroCars(heroCars: readonly number[]): readonly Prop[] {
  const items = SCENERY.car
  if (heroCars.length === 0) return items
  const skip = new Set(heroCars)
  const kept = items.filter((_, i) => !skip.has(i))
  return kept.length === items.length ? items : kept
}

/* ------------------------------------------------------- external store -- */

export interface MeshySwapSnapshot {
  /** Bitmask over MESHY_CELLS of plaza cells with live signature dressing. */
  mask: number
  /** Tier radius factor the live layer runs at (0 = no swaps). */
  radiusScale: number
  /** Bitmask over LANDMARKS whose primitive mesh a Meshy model replaced. */
  landmarkMask: number
  /** Live street-grid NEAR cells (all swap kinds hidden). Sorted keys. */
  nearCells: readonly number[]
  /** Live street-grid MID cells (trees hidden at midDensity). Sorted keys. */
  midCells: readonly number[]
  /** Tree density inside MID cells (renderer + hider share the roll). */
  midDensity: number
  /** Wave-2 rooftop band: primitive water tanks hidden in NEAR cells. */
  hideRoofTanks: boolean
  /** Wave-2 rooftop band: primitive AC boxes hidden in NEAR cells. */
  hideRoofAc: boolean
  /** Wave-2 showpieces: SCENERY.building indices a Meshy structure replaced. */
  hiddenBuildings: readonly number[]
  /** SCENERY.car indices the always-on MeshyHeroCars layer renders as real
   *  vehicle models right now (the primitive car field hides exactly these). */
  heroCars: readonly number[]
}

const IDLE_SNAPSHOT: MeshySwapSnapshot = {
  mask: 0,
  radiusScale: 0,
  landmarkMask: 0,
  nearCells: EMPTY_CELLS,
  midCells: EMPTY_CELLS,
  midDensity: 1,
  hideRoofTanks: false,
  hideRoofAc: false,
  hiddenBuildings: EMPTY_CELLS,
  heroCars: EMPTY_CELLS,
}
let snapshot: MeshySwapSnapshot = IDLE_SNAPSHOT
const listeners = new Set<() => void>()

function isIdle(next: MeshySwapSnapshot): boolean {
  return (
    next.mask === 0 &&
    next.landmarkMask === 0 &&
    next.nearCells.length === 0 &&
    next.midCells.length === 0 &&
    next.hiddenBuildings.length === 0 &&
    next.heroCars.length === 0
  )
}

function publish(next: MeshySwapSnapshot): void {
  snapshot = isIdle(next) ? IDLE_SNAPSHOT : next
  for (const listener of listeners) listener()
}

/** Written by the Meshy city layer only (mount/stream/unmount transitions). */
export function setMeshySwapState(mask: number, radiusScale: number): void {
  if (snapshot.mask === mask && snapshot.radiusScale === radiusScale) return
  publish({ ...snapshot, mask, radiusScale })
}

/** Landmark replacement mask (bit set once that landmark's model is live). */
export function setMeshyLandmarkState(landmarkMask: number): void {
  if (snapshot.landmarkMask === landmarkMask) return
  publish({ ...snapshot, landmarkMask })
}

function sameCells(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Street-grid ring update (sorted keys; published only on real change). */
export function setMeshyStreetCells(
  nearCells: readonly number[],
  midCells: readonly number[],
  midDensity = 1,
): void {
  if (
    sameCells(snapshot.nearCells, nearCells) &&
    sameCells(snapshot.midCells, midCells) &&
    snapshot.midDensity === midDensity
  ) {
    return
  }
  publish({ ...snapshot, nearCells, midCells, midDensity })
}

/** Live SCENERY.car indices the hero-car layer renders as real vehicles.
 *  Sorted keys; published only on real change (tear-free primitive hiding). */
export function setMeshyHeroCars(heroCars: readonly number[]): void {
  if (sameCells(snapshot.heroCars, heroCars)) return
  publish({ ...snapshot, heroCars })
}

/** Wave-2 rooftop coverage flags (which primitive roof lists to hide). */
export function setMeshyRooftopCover(hideRoofTanks: boolean, hideRoofAc: boolean): void {
  if (snapshot.hideRoofTanks === hideRoofTanks && snapshot.hideRoofAc === hideRoofAc) return
  publish({ ...snapshot, hideRoofTanks, hideRoofAc })
}

/** Per-owner hidden-building sets: the building SET, the spawn atrium and
 *  the signal spire each publish independently; the snapshot carries the
 *  merged union so no writer can stomp another's replacements. */
const hiddenByOwner = new Map<string, readonly number[]>()

/** Building indices whose primitive a Meshy replacement now renders. */
export function setMeshyHiddenBuildings(
  hiddenBuildings: readonly number[],
  owner = 'default',
): void {
  const prev = hiddenByOwner.get(owner) ?? EMPTY_CELLS
  if (sameCells(prev, hiddenBuildings)) return
  if (hiddenBuildings.length === 0) hiddenByOwner.delete(owner)
  else hiddenByOwner.set(owner, hiddenBuildings)
  const merged = [...new Set([...hiddenByOwner.values()].flat())].sort((a, b) => a - b)
  publish({ ...snapshot, hiddenBuildings: merged })
}

/** The primitive building list minus Meshy showpiece replacements. */
export function keptBuildings<T>(items: readonly T[], hidden: readonly number[]): readonly T[] {
  if (hidden.length === 0) return items
  const skip = new Set(hidden)
  return items.filter((_, i) => !skip.has(i))
}

/** Hidden-building indices for the primitive city (tear-free). */
export function useMeshyHiddenBuildings(): readonly number[] {
  return useSyncExternalStore(
    subscribeMeshySwaps,
    () => getMeshySwapSnapshot().hiddenBuildings,
    () => EMPTY_CELLS,
  )
}

export function getMeshySwapSnapshot(): MeshySwapSnapshot {
  return snapshot
}

export function subscribeMeshySwaps(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test seam. */
export function resetMeshySwapStateForTests(): void {
  snapshot = IDLE_SNAPSHOT
  hiddenByOwner.clear()
}

/** Landmark indices the primitive field should skip (tear-free). */
export function useMeshyLandmarkMask(): number {
  return useSyncExternalStore(
    subscribeMeshySwaps,
    () => getMeshySwapSnapshot().landmarkMask,
    () => 0,
  )
}

/** Roof-clutter kept list: primitives outside live NEAR cells (wave-2 band). */
export function keptRooftopProps(
  items: readonly Prop[],
  nearCells: readonly number[],
  hide: boolean,
): readonly Prop[] {
  if (!hide || nearCells.length === 0) return items
  const near = new Set(nearCells)
  const kept: Prop[] = []
  for (const item of items) {
    if (!near.has(streetCellKeyAt(item.x, item.z))) kept.push(item)
  }
  return kept.length === items.length ? items : kept
}

/** Per-kind kept lists for the primitive city batches (tear-free). */
export function useMeshyKeptScenery(): Record<MeshySwapKind | 'rooftop' | 'ac', readonly Prop[]> {
  const snap = useSyncExternalStore(
    subscribeMeshySwaps,
    getMeshySwapSnapshot,
    () => IDLE_SNAPSHOT,
  )
  return useMemo(
    () => ({
      tree: keptStreetProps('tree', snap.nearCells, snap.midCells, snap.midDensity),
      bench: keptStreetProps('bench', snap.nearCells, snap.midCells),
      trashCan: keptStreetProps('trashCan', snap.nearCells, snap.midCells),
      planter: keptStreetProps('planter', snap.nearCells, snap.midCells),
      hydrant: keptStreetProps('hydrant', snap.nearCells, snap.midCells),
      lamp: keptStreetProps('lamp', snap.nearCells, snap.midCells),
      // Cars: the whole primitive field minus the exact spots the always-on
      // hero-car layer now renders as real vehicle models.
      car: keptHeroCars(snap.heroCars),
      rooftop: keptRooftopProps(SCENERY.rooftop, snap.nearCells, snap.hideRoofTanks),
      ac: keptRooftopProps(SCENERY.ac, snap.nearCells, snap.hideRoofAc),
    }),
    [snap],
  )
}
