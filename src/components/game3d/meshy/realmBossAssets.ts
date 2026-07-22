import type * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { extendGltfLoader } from '../assetLoaders'
import { meshyAsset } from '../../../content/assets/meshyManifest'

/* ============================================================================
   Tier-11 realm-boss asset map — one rigged Meshy villain per Boss3D variant.
   Pure data + preload helper (no components) so BossArena can warm the GLBs
   without pulling the MeshyRealmBoss component chunk early.
   ========================================================================== */

export const BOSS_IDS = ['hider', 'mimic', 'golem', 'gatekeeper', 'beast', 'sphinx'] as const

/** Rig height per variant — deliberately over the catalog heightMeters: at
 *  combat camera distance a merely human-scale villain read as a minion, not
 *  a boss (QA), so every silhouette gets bossy headroom over the 1.8m hero. */
export const BOSS_HEIGHTS = [2.25, 2.3, 2.95, 2.55, 2.75, 2.45]

const modelUrl = (id: string) =>
  `/${meshyAsset(id)?.url ?? `assets/meshy/character/${id}.glb`}`

/** idle (mesh) + run/attack/scream/hit/death (animation-only) GLB urls. */
export function clipUrls(variant: number): string[] {
  const slug = BOSS_IDS[variant % BOSS_IDS.length]
  const base = `character-boss-${slug}`
  return [
    modelUrl(`${base}-idle`),
    modelUrl(`${base}-run`),
    modelUrl(`${base}-attack`),
    modelUrl(`${base}-scream`),
    modelUrl(`${base}-hit`),
    modelUrl(`${base}-death`),
  ]
}

/** Warm this variant's GLBs into drei's cache so the entrance beat frames the
 *  real villain, not the procedural stand-in (QA: no placeholder flash). */
export function preloadRealmBoss(variant: number, gl?: THREE.WebGLRenderer): void {
  for (const url of clipUrls(variant)) useGLTF.preload(url, true, true, extendGltfLoader(gl))
}
