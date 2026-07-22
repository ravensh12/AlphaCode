import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import {
  cityDressing,
  makeFacadeTexture,
  makeGlowTexture,
  makeSkyTexture,
  towerLayout,
} from './heroCityAssets'

/* ============================================================================
   Landing hero backdrop — the player character on a rooftop at night,
   looking down over Code City. Lazy-mounted BEHIND the hero copy after the
   poster frame has painted; built to be cheap:

   - capped DPR, no shadows, one rim light + hemisphere fill
   - the whole city is 3 instanced draws of unlit (MeshBasicMaterial) boxes
     whose canvas facades carry their own lit windows — fog does the depth
   - frameloop switches to 'never' when the hero scrolls offscreen or the
     tab hides (driven by the `active` prop from LandingHero3D)
   ========================================================================== */

const CYBORG_URL = `${import.meta.env.BASE_URL ?? '/'}world/characters/cyborg.glb`

/** He stands ON the parapet ledge (top at y≈0.4), over the drop. */
const HERO_POS = new THREE.Vector3(1.55, 0.4, -3.28)

const HERO_YAW = Math.PI - 0.22

function RooftopHero() {
  const { scene, animations } = useGLTF(CYBORG_URL)
  const group = useRef<THREE.Group>(null)
  const headBase = useRef<THREE.Quaternion | null>(null)
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (mesh.isSkinnedMesh) mesh.frustumCulled = false
    })
  }, [scene])

  useEffect(() => {
    // Sentinel on the ledge: the victory clip FROZEN mid-beat (1.2s) reads
    // as a proud, upright watch over the city — chrome arm catching the rim
    // light. Life comes from the procedural breath/sway below, so the pose
    // can't drift into a walk. Dev override for staging shots:
    // /?heroPose=<clip>&heroT=<sec>&heroRate=<x>
    let clipName = 'victory'
    let time = 1.2
    let rate = 0
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(window.location.search)
      clipName = q.get('heroPose') ?? clipName
      time = Number(q.get('heroT') ?? time)
      rate = Number(q.get('heroRate') ?? rate)
    }
    const pose = actions[clipName] ?? actions.idle
    if (!pose) return
    pose.reset()
    pose.setLoop(THREE.LoopRepeat, Infinity)
    pose.time = time
    pose.timeScale = rate
    pose.play()
    return () => {
      pose.stop()
    }
  }, [actions])

  // Breath + a slow scan keep the frozen pose alive, and a post-mixer head/
  // neck pitch turns the straight-ahead clip into "surveying the streets
  // below". Runs AFTER useAnimations' mixer update (hook order), so the
  // additive bone rotation sticks — same pattern as the game's recoil kick.
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = clock.elapsedTime
    g.rotation.y = HERO_YAW + Math.sin(t * 0.24) * 0.045
    g.rotation.x = 0.03
    g.position.y = HERO_POS.y + Math.sin(t * 0.9) * 0.006
    g.scale.y = 1 + Math.sin(t * 0.9 + 0.6) * 0.004
    // Whisper of head pitch only: from the over-the-shoulder camera a real
    // bow hides the head behind the shoulders and reads as headless.
    // The frozen action (timeScale 0) never rewrites the bone, so the pitch
    // must be absolute from the clip's pose — an incremental rotateX here
    // accumulates every frame and spins the head.
    const head = scene.getObjectByName('Head') as THREE.Bone | undefined
    if (head) {
      headBase.current ??= head.quaternion.clone()
      head.quaternion.copy(headBase.current)
      head.rotateX(0.05 + Math.sin(t * 0.18) * 0.03)
    }
  })

  // Back 3/4 to camera, gaze out over the city (rig faces +z in-file).
  return (
    <group ref={group} position={HERO_POS} rotation={[0, HERO_YAW, 0]}>
      <primitive object={scene} />
    </group>
  )
}

/** The rooftop the character stands on: slab, raised edge lip, props. */
function Rooftop() {
  const blink = useRef<THREE.Mesh>(null)
  const shadowTex = useMemo(() => makeGlowTexture('rgba(255,255,255,1)'), [])
  useEffect(() => () => shadowTex.dispose(), [shadowTex])
  useFrame(({ clock }) => {
    if (!blink.current) return
    const on = Math.sin(clock.elapsedTime * 2.2) > 0.35
    ;(blink.current.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.08
  })

  return (
    <group>
      {/* Roof slab (top at y=0), wet-asphalt sheen catches the rim light. */}
      <mesh position={[0, -0.5, 3.2]}>
        <boxGeometry args={[26, 1, 13]} />
        <meshStandardMaterial color="#11151f" roughness={0.34} metalness={0.22} />
      </mesh>
      {/* Raised parapet along the city edge — the ledge he stands on. A
          lighter concrete cap + the warm practical keep it clearly visible
          under his boots against the dark canyon. */}
      <mesh position={[0, 0.17, -3.32]}>
        <boxGeometry args={[26, 0.38, 0.7]} />
        <meshStandardMaterial color="#232b3b" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0.375, -3.32]}>
        <boxGeometry args={[26, 0.05, 0.78]} />
        <meshStandardMaterial color="#2a3346" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Dim safety strip on the ledge segment he stands on — grounds his
          boots without cutting a beam across the whole frame. */}
      <mesh position={[1.55, 0.407, -2.95]}>
        <boxGeometry args={[5.5, 0.012, 0.04]} />
        <meshBasicMaterial color="#1f7a70" toneMapped={false} />
      </mesh>
      {/* Soft contact shadow under his boots (radial alpha disc). */}
      <mesh position={[1.55, 0.404, -3.26]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.62, 24]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.62}
          alphaMap={shadowTex}
          depthWrite={false}
        />
      </mesh>
      {/* Cool pool of light on the ledge cap around him. */}
      <pointLight position={[1.7, 1.1, -3.0]} intensity={1.6} distance={3.4} color="#7fd8ff" />

      {/* Roof furniture, off to the left so the character owns the right. */}
      <group position={[-4.6, 0, 1.6]}>
        <mesh position={[0, 0.55, 0]}>
          <boxGeometry args={[1.9, 1.1, 1.3]} />
          <meshStandardMaterial color="#1a2130" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[1.6, 0.3, 0.6]}>
          <boxGeometry args={[0.9, 0.6, 0.9]} />
          <meshStandardMaterial color="#151b28" roughness={0.65} metalness={0.15} />
        </mesh>
      </group>

      {/* Antenna mast with a slow-blinking beacon. */}
      <group position={[-7.4, 0, -1.9]}>
        <mesh position={[0, 2.6, 0]}>
          <cylinderGeometry args={[0.05, 0.09, 5.2, 6]} />
          <meshStandardMaterial color="#232b3d" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh ref={blink} position={[0, 5.3, 0]}>
          <sphereGeometry args={[0.11, 8, 8]} />
          <meshBasicMaterial color="#ff5a6e" transparent opacity={1} toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Far sky backdrop — horizon light-pollution band the towers cut against. */
function SkyBackdrop() {
  const tex = useMemo(() => makeSkyTexture(), [])
  useEffect(() => () => tex.dispose(), [tex])
  // Bottom edge at y≈13 puts the brightest light-pollution band right behind
  // the far tower tops (~y 27), so the skyline cuts against it.
  return (
    <mesh position={[0, 108, -200]}>
      <planeGeometry args={[560, 190]} />
      <meshBasicMaterial map={tex} fog={false} depthWrite={false} />
    </mesh>
  )
}

/** The city below: three instanced facade draws + additive glow sprites. */
function CityBelow() {
  const { facades, roofMat, glowNeon, glowWarm } = useMemo(() => {
    const lit = {
      warm: ['#ffd98f', '#ffe9b8', '#ffc97a'],
      cool: ['#9fd8ff', '#c8ecff', '#7fc4ff'],
      neon: ['#b39aff', '#8fe8ff', '#ff9ee8'],
    }
    return {
      facades: [
        makeFacadeTexture({ lit: [...lit.warm, ...lit.cool], litChance: 0.34, cols: 11, rows: 40, seed: 11 }),
        makeFacadeTexture({ lit: [...lit.cool, ...lit.neon], litChance: 0.42, cols: 9, rows: 34, seed: 47 }),
        makeFacadeTexture({ lit: [...lit.warm, ...lit.neon], litChance: 0.27, cols: 13, rows: 46, seed: 83 }),
      ],
      roofMat: new THREE.MeshBasicMaterial({ color: '#0e1320' }),
      glowNeon: makeGlowTexture('rgba(94, 200, 255, 0.85)'),
      glowWarm: makeGlowTexture('rgba(255, 122, 210, 0.7)'),
    }
  }, [])
  useEffect(() => {
    return () => {
      for (const f of facades) f.dispose()
      roofMat.dispose()
      glowNeon.dispose()
      glowWarm.dispose()
    }
  }, [facades, roofMat, glowNeon, glowWarm])

  const towers = useMemo(() => towerLayout(2026), [])
  const buckets = useMemo(
    () => [0, 1, 2].map((v) => towers.filter((t) => t.variant === v)),
    [towers],
  )
  const dressing = useMemo(() => cityDressing(towers, 505), [towers])

  const meshes = useRef<(THREE.InstancedMesh | null)[]>([null, null, null])
  useEffect(() => {
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    buckets.forEach((bucket, bi) => {
      const mesh = meshes.current[bi]
      if (!mesh) return
      bucket.forEach((t, i) => {
        p.set(t.x, t.topY - t.h / 2, t.z)
        s.set(t.w, t.h, t.d)
        m4.compose(p, q, s)
        mesh.setMatrixAt(i, m4)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
  }, [buckets])

  return (
    <group>
      {buckets.map((bucket, i) => {
        const facadeMat = new THREE.MeshBasicMaterial({ map: facades[i] })
        // Box face order: +x, -x, +y (roof), -y, +z, -z.
        const mats = [facadeMat, facadeMat, roofMat, roofMat, facadeMat, facadeMat]
        return (
          <instancedMesh
            key={i}
            ref={(el) => {
              meshes.current[i] = el
            }}
            args={[undefined, undefined, bucket.length]}
            material={mats}
            frustumCulled={false}
          >
            <boxGeometry args={[1, 1, 1]} />
          </instancedMesh>
        )
      })}

      {/* Neon roofline trims — the cyberpunk skyline signature. */}
      {dressing.trims.map((trim, i) => (
        <mesh key={`t${i}`} position={[trim.x, trim.y, trim.z]}>
          <boxGeometry args={[trim.w, 0.22, 0.22]} />
          <meshBasicMaterial color={trim.color} toneMapped={false} transparent opacity={0.8} />
        </mesh>
      ))}
      {/* Red aircraft beacons crowning the tallest silhouettes. */}
      {dressing.beacons.map((b, i) => (
        <sprite key={`b${i}`} position={[b.x, b.y, b.z]} scale={[3.4, 3.4, 1]}>
          <spriteMaterial
            map={glowWarm}
            color="#ff2f4e"
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </sprite>
      ))}

      {/* Street-level haze pools + canyon mist between the towers. */}
      {(
        [
          [-14, -26, -46, 60, 'neon', 0.5],
          [18, -24, -70, 76, 'warm', 0.4],
          [-4, -20, -110, 110, 'neon', 0.55],
          [30, -16, -128, 120, 'warm', 0.35],
          [2, -14, -38, 44, 'neon', 0.42],
          [-30, -18, -88, 90, 'warm', 0.3],
          [8, -6, -150, 150, 'neon', 0.4],
        ] as const
      ).map(([x, y, z, size, kind, opacity], i) => (
        <sprite key={i} position={[x, y, z]} scale={[size, size * 0.5, 1]}>
          <spriteMaterial
            map={kind === 'neon' ? glowNeon : glowWarm}
            transparent
            opacity={opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            fog={false}
          />
        </sprite>
      ))}

      {/* Neon focal point: a left-aligned holo-sign stack on the mid-canyon
          tower face — three staggered bars + a bright core line, like real
          signage rather than floating rectangles. */}
      {/* Sits center-right of the desktop frame, well below his eye line —
          down IN the canyon he watches, clear of the title and his head. */}
      <group position={[19, -12.5, -62]} rotation={[0, -0.24, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[5.2, 1.05, 0.18]} />
          <meshBasicMaterial color="#ff4fd8" toneMapped={false} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, -0.72, 0]}>
          <boxGeometry args={[5.2, 0.14, 0.18]} />
          <meshBasicMaterial color="#ffd7f3" toneMapped={false} />
        </mesh>
        <mesh position={[-0.8, -1.75, 0]}>
          <boxGeometry args={[3.6, 0.7, 0.18]} />
          <meshBasicMaterial color="#41f0dc" toneMapped={false} transparent opacity={0.85} />
        </mesh>
        <mesh position={[-1.5, -2.85, 0]}>
          <boxGeometry args={[2.2, 0.5, 0.18]} />
          <meshBasicMaterial color="#8a66ff" toneMapped={false} transparent opacity={0.8} />
        </mesh>
      </group>
      <sprite position={[19, -13.9, -60.5]} scale={[14, 8.5, 1]}>
        <spriteMaterial
          map={glowWarm}
          color="#ff4fd8"
          transparent
          opacity={0.32}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      <mesh position={[13.5, -9, -71.2]} rotation={[0, -0.12, 0]}>
        <boxGeometry args={[0.2, 6.4, 1.4]} />
        <meshBasicMaterial color="#8fe8ff" toneMapped={false} transparent opacity={0.75} />
      </mesh>

      {/* Horizon glow behind the far skyline. */}
      <sprite position={[0, 24, -172]} scale={[360, 110, 1]}>
        <spriteMaterial
          map={glowNeon}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
      <sprite position={[70, 18, -168]} scale={[180, 70, 1]}>
        <spriteMaterial
          map={glowWarm}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          fog={false}
        />
      </sprite>
    </group>
  )
}

/** Very slow cinematic drift; framing adapts to portrait viewports. */
function DriftCamera() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const target = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const portrait = size.width / size.height < 0.95
    // Desktop: over-the-shoulder, character on the right third, city falling
    // away under him. Portrait: pull back + center, character above the copy.
    // Portrait frames him LOW-RIGHT (the copy stacks above him), desktop
    // puts him on the right third beside the copy.
    const bx = portrait ? 0.2 : -0.35
    const by = portrait ? 2.5 : 2.05
    const bz = portrait ? 2.6 : -0.25
    camera.position.set(
      bx + Math.sin(t * 0.07) * 0.14,
      by + Math.sin(t * 0.11 + 1.7) * 0.07,
      bz + Math.sin(t * 0.05 + 3.1) * 0.1,
    )
    // Aim past his shoulder down into the canyon: he reads tall on the right
    // third (desktop) / clear of the CTA row with his boots on the visible
    // ledge (portrait), the lit city filling the space beneath him.
    target.set(portrait ? 1.42 : 2.0, portrait ? 0.95 : -0.85, -14)
    camera.lookAt(target)
  })
  return null
}

function SceneContents() {
  return (
    <>
      <color attach="background" args={['#04060b']} />
      <fog attach="fog" args={['#081220', 22, 170]} />
      <SkyBackdrop />

      {/* Cool moonlit fill; the city's cyan uplight is the key rim, a violet
          camera-side kicker lifts his back out of the black. */}
      <hemisphereLight args={['#2c3a55', '#0a0d16', 0.28]} />
      {/* True rim: nearly opposite the camera (city side), slightly high —
          draws a cyan edge along his shoulders/arms from the viewer's POV. */}
      <directionalLight position={[1.8, 3.2, -9]} intensity={7.6} color="#7fd8ff" />
      {/* One-sided violet kicker: shapes his camera-facing back instead of
          flat-filling it (right side lit, left falls into shadow). */}
      <directionalLight position={[8, 3, 4]} intensity={2.8} color="#9a7dff" />
      {/* City uplight washing his front from the canyon below — the "lit by
          ten million windows" integration cue. */}
      <pointLight position={[2.2, -3, -9]} intensity={26} distance={26} color="#69d4ff" />
      {/* Warm practical on the roof behind him: grounds his legs + parapet. */}
      <pointLight position={[0.4, 1.1, -1.2]} intensity={3.6} distance={8} color="#ffa25e" />

      <RooftopHero />
      <Rooftop />
      <CityBelow />
      <DriftCamera />
    </>
  )
}

export default function HeroRooftopScene({ active }: { active: boolean }) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 1.75]}
      camera={{ fov: 40, near: 0.1, far: 420, position: [-1.35, 1.72, 3.9] }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      style={{ width: '100%', height: '100%' }}
    >
      <SceneContents />
    </Canvas>
  )
}

useGLTF.preload(CYBORG_URL)
