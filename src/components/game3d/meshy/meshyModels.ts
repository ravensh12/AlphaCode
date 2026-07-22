import * as THREE from 'three'
import { mergeBufferGeometries } from 'three-stdlib'
import type { GLTF } from 'three-stdlib'
import { MeshoptSimplifier } from 'meshoptimizer'
import { meshyAsset } from '../../../content/assets/meshyManifest'
import { createConfiguredGLTFLoader } from '../assetLoaders'
import { baseIdOf, specForModel, type MeshyModelSpec } from './meshyPropsCore'

/* ============================================================================
   Meshy model runtime — load a GLB ONCE through the shared loader stack
   (meshopt geometry + KTX2 textures via createConfiguredGLTFLoader), extract
   a single geometry+material pair, and bake the spec's normalization into
   the geometry so every consumer just instances it:

   - yawOffset rotates around the origin (vehicles are modeled along +x),
   - uniform scale to targetHeight (or targetLength on the ground plane),
   - recentred so x/z = 0 under the visual centre and minY = -groundSink.

   LOD variants (realism rebuild): an id like `lod:street-lamp-led` loads the
   SAME GLB and meshopt-simplifies the extracted geometry to ~35% of its
   triangles at load time (a few ms, once per cache entry, zero shipped
   bytes). The citywide street shell renders hundreds of instances per model
   — full-detail 6-14k-tri props were pushing 30M+ vertices per frame.

   Entries are reference-counted: retain() while a scene consumes the model,
   release() on unmount — at zero the geometry, material, and textures are
   disposed and the cache slot cleared, so a revisit re-streams exactly like
   the district KTX2 bundles.
   ========================================================================== */

const BASE = import.meta.env.BASE_URL ?? '/'

export interface MeshyModel {
  id: string
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** Post-normalization size (meters) for placement sanity checks. */
  size: THREE.Vector3
}

interface CacheEntry {
  promise: Promise<MeshyModel>
  refs: number
  resolved: MeshyModel | null
}

const cache = new Map<string, CacheEntry>()

/**
 * Meshy GLBs ship meshopt-quantized positions (KHR_mesh_quantization):
 * normalized Int16 in [-1, 1] plus a de-quantization scale on the node.
 * Baking world transforms into such an attribute writes METER-space values
 * back through the normalized encoder, and anything past ±1 m wraps around
 * the Int16 range — the mesh shreds into a 2×2×2 cube of triangles. Expand
 * to plain Float32 first so every later applyMatrix4/rotateY/scale/translate
 * operates in real units.
 */
export function toFloat32Positions(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position')
  if (!position || (!position.normalized && position.array instanceof Float32Array)) {
    return
  }
  const out = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    // getX/getY/getZ de-normalize quantized storage into real units.
    out[i * 3] = position.getX(i)
    out[i * 3 + 1] = position.getY(i)
    out[i * 3 + 2] = position.getZ(i)
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(out, 3))
}

function bakeMeshGeometry(mesh: THREE.Mesh, root: THREE.Object3D): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone()
  toFloat32Positions(geometry)
  root.updateMatrixWorld(true)
  geometry.applyMatrix4(mesh.matrixWorld)
  return geometry
}

/** Extract ONE geometry+material from a GLTF scene (Meshy GLBs are 1 prim). */
function extractModel(gltf: GLTF, spec: MeshyModelSpec): MeshyModel {
  const meshes: THREE.Mesh[] = []
  gltf.scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh)
  })
  if (meshes.length === 0) {
    throw new Error(`meshy model ${spec.id} contains no mesh`)
  }
  const baked = meshes.map((mesh) => bakeMeshGeometry(mesh, gltf.scene))
  let geometry: THREE.BufferGeometry
  if (baked.length === 1) {
    geometry = baked[0]
  } else {
    // All 44 shipped models are single-primitive; this fallback keeps a
    // future multi-mesh regeneration from crashing (first material wins).
    geometry = mergeBufferGeometries(baked, false) ?? baked[0]
    for (const g of baked) {
      if (g !== geometry) g.dispose()
    }
  }

  // --- Bake the normalization transform (never re-process the GLB itself).
  if (spec.yawOffset) geometry.rotateY(spec.yawOffset)
  geometry.computeBoundingBox()
  let box = geometry.boundingBox!
  const height = Math.max(1e-3, box.max.y - box.min.y)
  const footprint = Math.max(1e-3, box.max.x - box.min.x, box.max.z - box.min.z)
  const scale = spec.targetLength
    ? spec.targetLength / footprint
    : (spec.targetHeight ?? height) / height
  geometry.scale(scale, scale, scale)
  geometry.computeBoundingBox()
  box = geometry.boundingBox!
  geometry.translate(
    -(box.min.x + box.max.x) / 2,
    -box.min.y - (spec.groundSink ?? 0),
    -(box.min.z + box.max.z) / 2,
  )
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const sourceMaterial = Array.isArray(meshes[0].material)
    ? meshes[0].material[0]
    : meshes[0].material
  const material = sourceMaterial as THREE.Material

  const finalBox = geometry.boundingBox!
  return {
    id: spec.id,
    geometry,
    material,
    size: new THREE.Vector3(
      finalBox.max.x - finalBox.min.x,
      finalBox.max.y - finalBox.min.y,
      finalBox.max.z - finalBox.min.z,
    ),
  }
}

function disposeModel(model: MeshyModel): void {
  model.geometry.dispose()
  for (const value of Object.values(model.material)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  model.material.dispose()
}

/** Target index ratio for LOD geometry (~1/4 of the source triangles —
 *  street props read from 10m+; meshopt's error bound keeps silhouettes). */
const LOD_RATIO = 0.25
/** Buildings are the near-player architecture (whole facades fill the frame),
 *  so their LOD keeps more of the source: cornices/window reveals survive. */
const LOD_RATIO_BUILDING = 0.55

function lodRatioFor(baseId: string): number {
  return baseId.startsWith('bld-') || baseId.startsWith('structure-midrise')
    ? LOD_RATIO_BUILDING
    : LOD_RATIO
}

/** In-place meshopt simplification of an extracted (indexed) geometry. */
function simplifyGeometry(geometry: THREE.BufferGeometry, ratio: number): void {
  const index = geometry.getIndex()
  const position = geometry.getAttribute('position')
  if (!index || !position) return
  const indices =
    index.array instanceof Uint32Array ? index.array : new Uint32Array(index.array)
  const positions =
    position.array instanceof Float32Array
      ? position.array
      : Float32Array.from(position.array as ArrayLike<number>)
  const targetCount = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3)
  const [simplified] = MeshoptSimplifier.simplify(
    indices,
    positions,
    3,
    targetCount,
    0.02, // permissive error — street props read from 10m+
    ['LockBorder'],
  )
  geometry.setIndex(new THREE.BufferAttribute(simplified, 1))
}

/** Fetch/decode with retry: a transient network/decoder hiccup on ONE model
 *  used to leave whole consumer groups primitive for the session (the street
 *  shell's all-or-nothing Promise.all has no second chance) — graphics-purity
 *  directive says the blocky fallback must never win over a retriable blip. */
const LOAD_ATTEMPTS = 3
const LOAD_RETRY_DELAY_MS = 1_500

async function loadGltfWithRetry(
  url: string,
  gl?: THREE.WebGLRenderer,
): Promise<GLTF> {
  let lastError: unknown
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt++) {
    try {
      return await createConfiguredGLTFLoader(gl).loadAsync(url)
    } catch (error) {
      lastError = error
      if (attempt < LOAD_ATTEMPTS - 1) {
        await new Promise((res) => setTimeout(res, LOAD_RETRY_DELAY_MS * (attempt + 1)))
      }
    }
  }
  throw lastError
}

async function loadModel(id: string, gl?: THREE.WebGLRenderer): Promise<MeshyModel> {
  const base = baseIdOf(id)
  const lod = base !== id
  const spec = specForModel(base)
  const entry = meshyAsset(base)
  if (!spec || !entry) throw new Error(`unknown meshy model id: ${id}`)
  const gltf = await loadGltfWithRetry(`${BASE}${entry.url}`, gl)
  const model = extractModel(gltf, spec)
  if (lod) {
    await MeshoptSimplifier.ready
    simplifyGeometry(model.geometry, lodRatioFor(base))
  }
  // Everything the instanced batches need is baked out; free the rest of the
  // GLTF graph EXCEPT the extracted material and its textures.
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
  })
  return { ...model, id }
}

/**
 * Retain a model (starts the fetch on first call). Pair every retain with a
 * release. The promise stays stable for a cache generation. In-flight
 * entries survive a transient release-to-zero (React Suspense reveals
 * remount whole subtrees at boot) — the resolve handler disposes if nobody
 * re-retained by the time the decode lands.
 */
export function retainMeshyModel(id: string, gl?: THREE.WebGLRenderer): Promise<MeshyModel> {
  let entry = cache.get(id)
  if (!entry) {
    const fresh: CacheEntry = { promise: null as never, refs: 0, resolved: null }
    fresh.promise = loadModel(id, gl).then((model) => {
      if (cache.get(id) !== fresh || fresh.refs <= 0) {
        // Superseded or released while in flight → free immediately.
        if (cache.get(id) === fresh) cache.delete(id)
        disposeModel(model)
        return model
      }
      fresh.resolved = model
      return model
    })
    fresh.promise.catch(() => {
      if (cache.get(id) === fresh) cache.delete(id)
    })
    cache.set(id, fresh)
    entry = fresh
  }
  entry.refs++
  return entry.promise
}

/** Release one retain; the last release disposes GPU resources. */
export function releaseMeshyModel(id: string): void {
  const entry = cache.get(id)
  if (!entry) return
  entry.refs--
  if (entry.refs > 0) return
  if (entry.resolved) {
    cache.delete(id)
    disposeModel(entry.resolved)
  }
  // Still in flight: keep the entry so an immediate re-retain (boot-time
  // Suspense remount) reuses the same fetch; the resolve handler disposes
  // if the refs are still zero when the decode lands.
}
