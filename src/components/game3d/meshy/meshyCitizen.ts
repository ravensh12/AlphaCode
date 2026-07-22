import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three-stdlib'
import { MESHY_ASSETS, meshyAsset } from '../../../content/assets/meshyManifest'

/* ============================================================================
   Meshy citizen rig instantiation — shared by the district NPC (idle clip,
   HIGH/ULTRA) and the ULTRA hero walkers (walk clip). Each Meshy character
   GLB carries exactly one skin + one animation clip; instances clone the
   skeleton (SkeletonUtils) and their materials so nothing mutable is shared.

   Scale: the raw vertex data is tiny (armature nodes carry the real scale),
   so bind-pose accessor bounds are useless. We settle the mixer at t=0 and
   measure the SKINNED bounds (SkinnedMesh.computeBoundingBox applies bone
   transforms), falling back to plain object bounds, then clamp to a sane
   human range so a bad measurement can never render a giant.
   ========================================================================== */

export const MESHY_CITIZEN_IDLE_URL = `/${meshyAsset('character-citizen-idle')?.url ?? 'assets/meshy/character/character-citizen-idle.glb'}`
export const MESHY_CITIZEN_WALK_URL = `/${meshyAsset('character-citizen-walk')?.url ?? 'assets/meshy/character/character-citizen-walk.glb'}`

export interface MeshyCitizenVariant {
  id: string
  idleUrl: string
  walkUrl: string
}

/**
 * Wave-2 adoption: every `character-citizen-<name>-idle/-walk` pair present
 * in the manifest joins the pedestrian pool (business/hoodie/worker land
 * mid-development). The wave-1 citizen is always variant 0, so this never
 * returns an empty list and never references un-shipped files.
 */
export function meshyCitizenVariants(): MeshyCitizenVariant[] {
  const out: MeshyCitizenVariant[] = [
    { id: 'citizen', idleUrl: MESHY_CITIZEN_IDLE_URL, walkUrl: MESHY_CITIZEN_WALK_URL },
  ]
  for (const entry of MESHY_ASSETS) {
    if (entry.category !== 'character') continue
    const match = entry.id.match(/^character-citizen-([a-z0-9]+)-idle$/)
    if (!match) continue
    const walk = meshyAsset(`character-citizen-${match[1]}-walk`)
    if (!walk) continue
    out.push({ id: `citizen-${match[1]}`, idleUrl: `/${entry.url}`, walkUrl: `/${walk.url}` })
  }
  return out
}

/** Deterministic variant pick for a pedestrian slot. */
export function citizenVariantFor(seed: number): MeshyCitizenVariant {
  const variants = meshyCitizenVariants()
  const index = Math.abs(Math.floor(seed)) % variants.length
  return variants[index]
}

export interface MeshyCitizenRig {
  scene: THREE.Object3D
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction | null
  materials: THREE.Material[]
  /** Uniform scale that normalizes the rig to the requested height. */
  scale: number
}

function skinnedHeight(scene: THREE.Object3D): number {
  scene.updateMatrixWorld(true)
  const union = new THREE.Box3()
  const local = new THREE.Box3()
  let any = false
  scene.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    mesh.computeBoundingBox()
    if (!mesh.boundingBox) return
    local.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld)
    union.union(local)
    any = true
  })
  if (!any) union.setFromObject(scene)
  return union.max.y - union.min.y
}

/** Clone + normalize one animated citizen instance from a loaded GLTF. */
export function instantiateMeshyCitizen(
  gltf: GLTF,
  targetHeight: number,
): MeshyCitizenRig {
  const scene = cloneSkeleton(gltf.scene)
  const materials: THREE.Material[] = []
  scene.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    mesh.castShadow = true
    // Bind-pose bounds are junk (see header) — never let three cull the rig.
    mesh.frustumCulled = false
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const instance = (source as THREE.Material).clone()
    materials.push(instance)
    mesh.material = instance
  })

  const mixer = new THREE.AnimationMixer(scene)
  const clip = gltf.animations[0] ?? null
  const action = clip ? mixer.clipAction(clip) : null

  // Settle frame 0 of the clip so the skinned bounds measure a real pose.
  if (action) {
    action.play()
    mixer.update(0)
  }
  const rawHeight = skinnedHeight(scene)
  let scale = targetHeight / Math.max(1e-3, rawHeight)
  if (!Number.isFinite(scale) || scale <= 0) scale = 1
  // A wrong measurement must never render a giant/microbe: the shipped rigs
  // land close to 1.0 after normalization; clamp everything else.
  scale = Math.min(1000, Math.max(0.001, scale))
  if (action) action.stop()

  return { scene, mixer, action, materials, scale }
}
