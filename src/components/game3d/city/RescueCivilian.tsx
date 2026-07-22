import { memo, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { extendGltfLoader } from '../assetLoaders'
import { meshyAsset } from '../../../content/assets/meshyManifest'
import { instantiateMeshyCitizen } from '../meshy/meshyCitizen'

/* ============================================================================
   RescueCivilian — the real trapped-citizen character at an ACTIVE rescue
   beat: cowers (loop) while the zombie ring stands, plays the relieved
   one-shot the moment the last one falls.

   Roster: civ-vendor + civ-elder ship their own cower/relieved clips; the
   three citizen wardrobes (business / hoodie / worker) borrow the vendor's
   clips bound by bone name (all five characters ride the same style_02
   skeleton — a coverage guard below falls back to the character's own idle
   if a future rig ever stops matching). The pick is seeded by beat id, so
   each rescue keeps its civilian across sessions.
   ========================================================================== */

const modelUrl = (id: string) =>
  `/${meshyAsset(id)?.url ?? `assets/meshy/character/${id}.glb`}`

interface RosterEntry {
  id: string
  /** GLB whose skin/wardrobe this civilian wears. */
  rig: string
  cower: string
  relieved: string
}

const ROSTER: RosterEntry[] = [
  {
    id: 'vendor',
    rig: 'character-civ-vendor-cower',
    cower: 'character-civ-vendor-cower',
    relieved: 'character-civ-vendor-relieved',
  },
  {
    id: 'elder',
    rig: 'character-civ-elder-cower',
    cower: 'character-civ-elder-cower',
    relieved: 'character-civ-elder-relieved',
  },
  {
    id: 'business',
    rig: 'character-citizen-business-idle',
    cower: 'character-civ-vendor-cower',
    relieved: 'character-civ-vendor-relieved',
  },
  {
    id: 'hoodie',
    rig: 'character-citizen-hoodie-idle',
    cower: 'character-civ-vendor-cower',
    relieved: 'character-civ-vendor-relieved',
  },
  {
    id: 'worker',
    rig: 'character-citizen-worker-idle',
    cower: 'character-civ-vendor-cower',
    relieved: 'character-civ-vendor-relieved',
  },
]

/** Every GLB the roster can touch — the boot warmer decodes all of them
 *  behind the loading veil so an activated rescue never decodes mid-play. */
const ALL_ROSTER_URLS = [
  ...new Set(ROSTER.flatMap((r) => [modelUrl(r.rig), modelUrl(r.cower), modelUrl(r.relieved)])),
]

/** Deterministic per-beat civilian (stable across sessions). */
export function civilianForBeat(beatId: string): RosterEntry {
  let h = 0
  for (let i = 0; i < beatId.length; i++) h = (h * 31 + beatId.charCodeAt(i)) | 0
  return ROSTER[Math.abs(h) % ROSTER.length]
}

/** Suspends during boot (inside the canvas Suspense) so every civilian GLB
 *  fetches + decodes behind the loading veil. Renders nothing. */
export function RescueCivilianWarmup() {
  const gl = useThree((state) => state.gl)
  useGLTF(ALL_ROSTER_URLS, true, true, extendGltfLoader(gl))
  return null
}

/** >=50% of a donated clip's tracks must bind to this rig's bones. */
function bindable(scene: THREE.Object3D, clip: THREE.AnimationClip | null): boolean {
  if (!clip) return false
  const names = new Set<string>()
  scene.traverse((node) => names.add(node.name))
  let bound = 0
  for (const track of clip.tracks) {
    if (names.has(track.name.split('.')[0])) bound++
  }
  return bound >= clip.tracks.length * 0.5
}

export const RescueCivilian = memo(function RescueCivilian({
  beatId,
  fightPending,
}: {
  beatId: string
  fightPending: boolean
}) {
  const gl = useThree((state) => state.gl)
  const pick = useMemo(() => civilianForBeat(beatId), [beatId])
  const gltfs = useGLTF(
    [modelUrl(pick.rig), modelUrl(pick.cower), modelUrl(pick.relieved)],
    true,
    true,
    extendGltfLoader(gl),
  )

  const rig = useMemo(() => {
    const base = instantiateMeshyCitizen(gltfs[0], 1.62)
    const donate = (clip: THREE.AnimationClip | null): THREE.AnimationAction | null =>
      clip && bindable(base.scene, clip) ? base.mixer.clipAction(clip) : null
    // Coverage guard: a non-binding donation falls back to the rig's own clip
    // (idle for the citizen wardrobes) — never a T-pose.
    const cower = donate(gltfs[1].animations[0] ?? null) ?? base.action
    const relieved = donate(gltfs[2].animations[0] ?? null)
    if (relieved) {
      relieved.setLoop(THREE.LoopOnce, 1)
      relieved.clampWhenFinished = true
    }
    return { ...base, cower, relieved }
  }, [gltfs])

  useEffect(() => {
    return () => {
      rig.mixer.stopAllAction()
      for (const material of rig.materials) material.dispose()
    }
  }, [rig])

  // Cower while trapped; the relieved one-shot fires on the rescue edge.
  useEffect(() => {
    const { cower, relieved } = rig
    if (fightPending) {
      relieved?.stop()
      cower?.reset().fadeIn(0.2).play()
    } else if (relieved) {
      cower?.fadeOut(0.25)
      relieved.reset().fadeIn(0.15).play()
    } else {
      cower?.reset().play() // no relieved clip bound — stay animated at least
    }
  }, [rig, fightPending])

  useFrame((_, dt) => {
    rig.mixer.update(Math.min(dt, 0.05))
  })

  return <primitive object={rig.scene} scale={rig.scale} />
})
