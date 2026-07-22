import { Suspense, memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { applyRimLight } from '../simulation'
import { configureAssetLoaders } from '../decoderConfig'
import { extendGltfLoader } from '../assetLoaders'
import { citizenVariantFor, instantiateMeshyCitizen } from '../meshy/meshyCitizen'
import { assetById } from '../../../content/assets/assetManifest'

/* ============================================================================
   NpcCitizen — a rescued citizen standing on their district plaza.

   Rig ladder (highest first, each falling back to the next while streaming):
   - HIGH/ULTRA (`meshyRig`): the Meshy-generated human citizen
     (character-citizen-idle.glb — KTX2 textures + meshopt, one skin, one
     idle clip) with its own AnimationMixer.
   - MEDIUM (`rig`): the shipped Quaternius CC0 robot (robot-sentinel.glb)
     with its baked "Idle" clip — exactly the pre-Meshy behavior.
   - LOW / Suspense fallback: a clean primitive bot in the Companion's
     language with a procedural idle sway.
   One mixer per NPC, six NPCs city-wide, so real skinned idles are
   affordable here (the crowd-scale citizens stay on the VAT path).

   District identity: the accent prop tints the rim light, chest emissive, and
   the talk-spot ring. A floating chat glyph appears while a quiz chain is
   available. Pure presentation — XP/progress flow through the overlays.
   ========================================================================== */

const NPC_MODEL_URL = `/${assetById('model-robot-sentinel')?.path ?? 'assets/models/robot-sentinel.glb'}`
/** World height (m) the rig is normalized to. */
const NPC_HEIGHT = 1.62

// Self-hosted decoder paths must be set before the first loader is created.
// No module-scope useGLTF.preload here: on HIGH/ULTRA the Meshy citizen
// replaces this rig entirely, so an unconditional preload would waste the
// 220 kB robot-sentinel fetch on exactly the tiers that never render it.
// On MEDIUM, GltfCitizenBody's own useGLTF starts the fetch in the same
// commit that would have run the preload — nothing is lost.
configureAssetLoaders()

export interface NpcCitizenProps {
  x: number
  z: number
  /** Yaw (radians) the citizen faces. */
  rotationY?: number
  /** District accent tint (rim light, ring, glyph). */
  accent: string
  /** A quiz chain is available — show the floating chat glyph. */
  chainAvailable: boolean
  /** Load the GLTF rig; false keeps the primitive fallback bot (tier gate). */
  rig?: boolean
  /** HIGH/ULTRA: the Meshy citizen replaces robot-sentinel as the rig. */
  meshyRig?: boolean
}

/* -------------------------------------------------------------- chat glyph */

const ChatGlyph = memo(function ChatGlyph({ accent }: { accent: string }) {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    g.position.y = NPC_HEIGHT + 0.62 + Math.sin(t * 2.2) * 0.07
    g.rotation.y = Math.sin(t * 0.9) * 0.35
  })
  return (
    <group ref={group} position={[0, NPC_HEIGHT + 0.62, 0]}>
      {/* Speech-bubble body + tail. */}
      <mesh scale={[1, 0.72, 0.55]}>
        <sphereGeometry args={[0.26, 16, 12]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.75}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[-0.1, -0.22, 0]} rotation={[0, 0, 2.6]}>
        <coneGeometry args={[0.07, 0.18, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.75}
          roughness={0.4}
        />
      </mesh>
      {/* The "…" dots. */}
      {[-0.09, 0, 0.09].map((dx) => (
        <mesh key={dx} position={[dx, 0, 0.15]}>
          <sphereGeometry args={[0.028, 8, 8]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
})

/* -------------------------------------------------------- talk-spot ring */

const TalkRing = memo(function TalkRing({
  accent,
  emphasized,
}: {
  accent: string
  emphasized: boolean
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame((state) => {
    const m = mat.current
    if (!m) return
    const t = state.clock.elapsedTime
    m.opacity = emphasized ? 0.34 + Math.sin(t * 2.6) * 0.14 : 0.18
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
      <ringGeometry args={[0.55, 0.72, 28]} />
      <meshBasicMaterial
        ref={mat}
        color={accent}
        transparent
        opacity={0.18}
        toneMapped={false}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  )
})

/* ------------------------------------------------------------ GLTF citizen */

function GltfCitizenBody({
  accent,
  activeRef,
}: {
  accent: string
  activeRef?: { current: boolean }
}) {
  const gltf = useGLTF(NPC_MODEL_URL)

  // Instance-local skeleton + materials so six district NPCs never share
  // mutable state; rim/emissive carry the district accent.
  const rig = useMemo(() => {
    const scene = cloneSkeleton(gltf.scene)
    const materials: THREE.Material[] = []
    let tinted = false
    scene.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      mesh.castShadow = true
      mesh.frustumCulled = false
      const instance = (mesh.material as THREE.MeshStandardMaterial).clone()
      applyRimLight(instance, accent, 0.42)
      if (!tinted && instance.emissive) {
        instance.emissive = new THREE.Color(accent)
        instance.emissiveIntensity = 0.12
        tinted = true
      }
      materials.push(instance)
      mesh.material = instance
    })

    // Normalize the source rig to street scale off its bind-pose bounds.
    const bounds = new THREE.Box3().setFromObject(scene)
    const rawHeight = Math.max(0.001, bounds.max.y - bounds.min.y)
    const scale = NPC_HEIGHT / rawHeight

    const mixer = new THREE.AnimationMixer(scene)
    const clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle')
    const idle = clip ? mixer.clipAction(clip) : null
    return { scene, materials, mixer, idle, scale }
  }, [gltf, accent])

  // Activate the loop in an effect (StrictMode-symmetric with the teardown —
  // see Avatar.tsx for the full story) and dispose the instance materials.
  useEffect(() => {
    rig.idle?.reset().play()
    return () => {
      rig.mixer.stopAllAction()
      rig.materials.forEach((material) => material.dispose())
    }
  }, [rig])

  useFrame((_, dt) => {
    if (activeRef && !activeRef.current) return // parked outside the bubble
    rig.mixer.update(Math.min(dt, 0.05))
  })

  return <primitive object={rig.scene} scale={rig.scale} />
}

/* ------------------------------------------------------ Meshy human citizen */

function MeshyCitizenBody({
  accent,
  seed = 0,
  activeRef,
}: {
  accent: string
  seed?: number
  activeRef?: { current: boolean }
}) {
  const gl = useThree((state) => state.gl)
  // Wave-2 variety: each district NPC picks a deterministic wardrobe from
  // whatever citizen variants the manifest has landed so far.
  const variant = useMemo(() => citizenVariantFor(seed), [seed])
  const gltf = useGLTF(variant.idleUrl, true, true, extendGltfLoader(gl))

  const rig = useMemo(() => {
    const instance = instantiateMeshyCitizen(gltf, NPC_HEIGHT)
    for (const material of instance.materials) {
      applyRimLight(material, accent, 0.42)
    }
    return instance
  }, [gltf, accent])

  useEffect(() => {
    rig.action?.reset().play()
    return () => {
      rig.mixer.stopAllAction()
      rig.materials.forEach((material) => material.dispose())
    }
  }, [rig])

  useFrame((_, dt) => {
    if (activeRef && !activeRef.current) return // parked outside the bubble
    rig.mixer.update(Math.min(dt, 0.05))
  })

  return <primitive object={rig.scene} scale={rig.scale} />
}

/* ------------------------------------------------------- primitive citizen */

/** Companion-pattern fallback bot: hovering core with a procedural sway. */
const PrimitiveCitizenBody = memo(function PrimitiveCitizenBody({
  accent,
}: {
  accent: string
}) {
  const body = useRef<THREE.Group>(null)
  const coreMat = useMemo(
    () =>
      applyRimLight(
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: new THREE.Color(accent),
          emissiveIntensity: 0.45,
          flatShading: true,
        }),
        '#ffffff',
        0.5,
      ),
    [accent],
  )
  useEffect(() => () => coreMat.dispose(), [coreMat])

  useFrame((state) => {
    const b = body.current
    if (!b) return
    const t = state.clock.elapsedTime
    // The Companion idle language: gentle bob + a curious look-around sway.
    b.position.y = 1.05 + Math.sin(t * 2.1) * 0.08
    b.rotation.y = Math.sin(t * 0.7) * 0.5
  })

  return (
    <group ref={body} position={[0, 1.05, 0]}>
      <mesh castShadow material={coreMat}>
        <icosahedronGeometry args={[0.42, 1]} />
      </mesh>
      {/* Visor + eye. */}
      <mesh position={[0, 0.06, 0.34]}>
        <sphereGeometry args={[0.21, 16, 16]} />
        <meshStandardMaterial color="#0c1230" emissive="#9fd0ff" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.08, 0.5]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
      </mesh>
      {/* Fins. */}
      <mesh position={[-0.42, 0, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.4, 0.07, 0.26]} />
        <meshStandardMaterial color="#e8ecf6" />
      </mesh>
      <mesh position={[0.42, 0, 0]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.4, 0.07, 0.26]} />
        <meshStandardMaterial color="#e8ecf6" />
      </mesh>
    </group>
  )
})

/* --------------------------------------------------------------- assembled */

/** Beyond this camera range an NPC neither renders nor ticks its mixer. */
const NPC_ACTIVE_RADIUS = 120

export const NpcCitizen = memo(function NpcCitizen({
  x,
  z,
  rotationY = 0,
  accent,
  chainAvailable,
  rig = true,
  meshyRig = false,
}: NpcCitizenProps) {
  // Proximity gate: six skinned rigs with per-frame AnimationMixer updates
  // used to run (and render into shadow cascades) from anywhere on the map.
  // Far NPCs now hide AND freeze; the gate re-checks every few frames.
  const gateRef = useRef<THREE.Group>(null)
  const activeRef = useRef(true)
  const tick = useRef(Math.floor(Math.random() * 8))
  useFrame(({ camera }) => {
    tick.current++
    if (tick.current % 8 !== 0) return
    const g = gateRef.current
    if (!g) return
    const dx = camera.position.x - x
    const dz = camera.position.z - z
    const on = dx * dx + dz * dz <= NPC_ACTIVE_RADIUS * NPC_ACTIVE_RADIUS
    activeRef.current = on
    if (g.visible !== on) g.visible = on
  })

  return (
    <group ref={gateRef} position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      {rig ? (
        <Suspense fallback={<PrimitiveCitizenBody accent={accent} />}>
          {meshyRig ? (
            <MeshyCitizenBody
              accent={accent}
              seed={Math.round(x * 7 + z * 13)}
              activeRef={activeRef}
            />
          ) : (
            <GltfCitizenBody accent={accent} activeRef={activeRef} />
          )}
        </Suspense>
      ) : (
        <PrimitiveCitizenBody accent={accent} />
      )}
      <TalkRing accent={accent} emphasized={chainAvailable} />
      {chainAvailable && <ChatGlyph accent={accent} />}
    </group>
  )
})
