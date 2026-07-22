import * as THREE from 'three'

/* ============================================================================
   Proximity culling — "only render what's near the player".

   The city's instanced sets (buildings, lamps, trees, cars, rooftop clutter…)
   used to upload EVERY instance and draw the whole 1.4km map each frame; the
   camera frustum never helps because each set is one mesh whose bounding
   sphere spans the city. Instead, every set now keeps its full placement data
   packed in flat arrays and re-uploads only the instances inside a player-
   centred bubble. Rebuilds happen only after the player has travelled a few
   meters (staggered per set so they never land on the same frame); standing
   still costs zero rebuild CPU.

   The bubble radius rides the graphics governor's active profile
   (QualityProfile.cullRadius) — strong machines get a wide bubble, weak ones
   a tight bubble — and the scene fog is capped to the same distance so the
   cull boundary reads as atmosphere, never as missing world.
   ========================================================================== */

/** Meters of player travel before a set re-compacts (base; hooks stagger). */
export const CULL_REBUILD_STEP = 9

/**
 * Flat-packed instanced-set data: everything precomputed once at build time
 * so a rebuild is pure array copying (no Object3D math, no allocations).
 */
export interface InstancePack {
  /** Total placed instances (the compacted subset is <= this). */
  count: number
  /** x,z world position per instance (2 floats each) — the cull key. */
  posXZ: Float32Array
  /** Per-instance extra cull radius (big buildings stay longer), or null. */
  pad: Float32Array | null
  /** Column-major 4x4 matrix per instance (16 floats each). */
  matrices: Float32Array
  /** Linear RGB per instance (3 floats each), or null when untinted. */
  colors: Float32Array | null
  /** Extra per-instance attribute payloads compacted alongside (aFacade…). */
  extras: { name: string; size: number; data: Float32Array }[]
}

/**
 * Copy every instance within `radius` of (cx, cz) to the head of the output
 * arrays. Returns the visible count. Pure; outputs may alias the live GPU
 * attribute arrays.
 */
export function compactInRadius(
  pack: InstancePack,
  cx: number,
  cz: number,
  radius: number,
  outMatrices: Float32Array,
  outColors: Float32Array | null,
  outExtras: (Float32Array | null)[] | null,
): number {
  const { count, posXZ, pad, matrices, colors, extras } = pack
  const r = radius
  let visible = 0
  for (let i = 0; i < count; i++) {
    const dx = posXZ[i * 2] - cx
    const dz = posXZ[i * 2 + 1] - cz
    const reach = r + (pad ? pad[i] : 0)
    if (dx * dx + dz * dz > reach * reach) continue
    outMatrices.set(matrices.subarray(i * 16, i * 16 + 16), visible * 16)
    if (outColors && colors) {
      outColors.set(colors.subarray(i * 3, i * 3 + 3), visible * 3)
    }
    if (outExtras) {
      for (let e = 0; e < extras.length; e++) {
        const out = outExtras[e]
        if (!out) continue
        const { size, data } = extras[e]
        out.set(data.subarray(i * size, i * size + size), visible * size)
      }
    }
    visible++
  }
  return visible
}

/** Write ALL instances (the uncapped path — radius disabled). */
export function writeAllInstances(
  pack: InstancePack,
  outMatrices: Float32Array,
  outColors: Float32Array | null,
  outExtras: (Float32Array | null)[] | null,
): number {
  outMatrices.set(pack.matrices)
  if (outColors && pack.colors) outColors.set(pack.colors)
  if (outExtras) {
    for (let e = 0; e < pack.extras.length; e++) {
      outExtras[e]?.set(pack.extras[e].data)
    }
  }
  return pack.count
}

/* ------------------------------------------------------------ pack builder */

const _packDummy = new THREE.Object3D()
const _packColor = new THREE.Color()

export interface PackItemWriter<T> {
  /** Position + rotation + scale for one item (write into the dummy). */
  place: (item: T, dummy: THREE.Object3D) => void
  /** Optional per-item tint. */
  color?: (item: T) => THREE.ColorRepresentation
  /** Optional per-item extra cull-radius pad (e.g. building footprint). */
  pad?: (item: T) => number
}

/** Precompute the packed matrix/color arrays for an item list, once. */
export function buildInstancePack<T extends { x: number; z: number }>(
  items: readonly T[],
  writer: PackItemWriter<T>,
  extras: { name: string; size: number; data: Float32Array }[] = [],
): InstancePack {
  const n = items.length
  const matrices = new Float32Array(n * 16)
  const posXZ = new Float32Array(n * 2)
  const colors = writer.color ? new Float32Array(n * 3) : null
  const pad = writer.pad ? new Float32Array(n) : null
  for (let i = 0; i < n; i++) {
    const it = items[i]
    _packDummy.position.set(0, 0, 0)
    _packDummy.rotation.set(0, 0, 0)
    _packDummy.scale.set(1, 1, 1)
    writer.place(it, _packDummy)
    _packDummy.updateMatrix()
    matrices.set(_packDummy.matrix.elements, i * 16)
    posXZ[i * 2] = it.x
    posXZ[i * 2 + 1] = it.z
    if (colors && writer.color) {
      _packColor.set(writer.color(it))
      colors[i * 3] = _packColor.r
      colors[i * 3 + 1] = _packColor.g
      colors[i * 3 + 2] = _packColor.b
    }
    if (pad && writer.pad) pad[i] = writer.pad(it)
  }
  return { count: n, posXZ, pad, matrices, colors, extras }
}
