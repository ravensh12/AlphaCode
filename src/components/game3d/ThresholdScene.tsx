import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type JSX,
  type MutableRefObject,
} from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'
import { WORLDS } from '../../content/adventure'
import { CinematicStage, CameraDirector, EmberField, useQuality } from './cinematic'

/* ======================================================================
   THE THRESHOLD — a surreal liminal void crossed after VEX falls.

   A starlit space between realities: shattered fragments of the six conquered
   worlds drift around a glowing path that leads to a monumental GATE. The camera
   flies the player along the path on rails (~19s, eased), arrives at the Gate,
   and idles. When the page calls openGate(), the event horizon blooms, the
   aperture irises open, the camera pushes through, and the frame whites out —
   then onEnter() fires.

   Built on the same `cinematic` engine as the boss so it matches visually. All
   motion is REF-DRIVEN; the only "state" is one-shot callback guards in refs.
   ====================================================================== */

export interface ThresholdSceneHandle {
  /** Page calls this after loadout confirm -> gate-open + push-through, then onEnter fires. */
  openGate(): void
}

export interface ThresholdSceneProps {
  accent?: string
  /** Fired once when the rail flythrough reaches the Gate (~19000ms). */
  onArrive?: () => void
  /** Fired once after openGate() finishes the push-through (~2500ms later). */
  onEnter?: () => void
}

/* ------------------------------------------------------------- Timing */

const RAIL_DUR = 19 // s — the on-rails flythrough length
const PUSH_DUR = 2.5 // s — gate-open push-through to white
const GATE_Z = -92
const GATE_Y = 6
const RAIL_END_Z = -76 // camera holds a touch short of the Gate
const START_Z = 30

const COLD = '#9fb8ff'
const C_WHITE = new THREE.Color('#ffffff')

/** smootherstep — gentle ease in/out for the rail. */
function ease(p: number): number {
  const x = THREE.MathUtils.clamp(p, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/* ------------------------------------------------- World fragments */

interface FragSpec {
  pos: THREE.Vector3
  scale: number
  color: string
  rotSpeed: number
  bob: number
  bobPhase: number
  spin: THREE.Vector3
}

const WorldFragments = memo(function WorldFragments({ specs }: { specs: FragSpec[] }): JSX.Element {
  const groupRefs = useRef<(THREE.Group | null)[]>([])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < specs.length; i++) {
      const g = groupRefs.current[i]
      if (!g) continue
      const s = specs[i]
      g.position.y = s.pos.y + Math.sin(t * s.bob + s.bobPhase) * 0.8
      g.rotation.x = t * s.spin.x * 0.1
      g.rotation.y = t * s.rotSpeed
      g.rotation.z = t * s.spin.z * 0.05
    }
  })

  return (
    <group>
      {specs.map((s, i) => (
        <group
          key={i}
          ref={(el) => {
            groupRefs.current[i] = el
          }}
          position={[s.pos.x, s.pos.y, s.pos.z]}
          scale={s.scale}
        >
          {/* Chunky low-poly island core (floats free — no shadow caster needed). */}
          <mesh>
            <icosahedronGeometry args={[1.4, 0]} />
            <meshStandardMaterial color="#0c0e1c" emissive={s.color} emissiveIntensity={0.35} roughness={0.55} metalness={0.4} flatShading />
          </mesh>
          {/* Jagged underside spire. */}
          <mesh position={[0, -1.3, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[1.0, 2.4, 5]} />
            <meshStandardMaterial color="#090a16" emissive={s.color} emissiveIntensity={0.2} roughness={0.7} metalness={0.3} flatShading />
          </mesh>
          {/* Glowing seam ring. */}
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.6, 0]}>
            <ringGeometry args={[1.5, 1.78, 32]} />
            <meshBasicMaterial color={s.color} transparent opacity={0.7} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} fog={false} />
          </mesh>
          {/* Floating accent crystal. */}
          <mesh position={[0, 1.1, 0]}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color="#101428" emissive={s.color} emissiveIntensity={1.4} roughness={0.3} metalness={0.6} flatShading toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
})

/* ------------------------------------------------- Path of light */

function PathOfLight({ accent, count }: { accent: string; count: number }): JSX.Element {
  const nodesMesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useRef(new THREE.Object3D())

  const positions = useMemo(() => {
    const out: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      const p = i / (count - 1)
      const z = THREE.MathUtils.lerp(START_Z, GATE_Z + 4, p)
      const x = Math.sin(p * Math.PI * 1.5) * 5 * (1 - p)
      out.push(new THREE.Vector3(x, 0.25, z))
    }
    return out
  }, [count])

  const geo = useMemo(() => new THREE.SphereGeometry(0.32, 10, 10), [])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    [accent],
  )
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])

  useFrame((state) => {
    const m = nodesMesh.current
    if (!m) return
    const t = state.clock.elapsedTime
    const d = dummy.current
    for (let i = 0; i < positions.length; i++) {
      // Travelling pulse from start toward the gate.
      const phase = i / positions.length - t * 0.5
      const pulse = 0.6 + Math.sin(phase * Math.PI * 2) * 0.4
      d.position.copy(positions[i])
      d.scale.setScalar(pulse)
      d.rotation.set(0, 0, 0)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      {/* Emissive ribbon laid along the path. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, (START_Z + GATE_Z) / 2]}>
        <planeGeometry args={[2.2, START_Z - GATE_Z + 8]} />
        <meshBasicMaterial color={accent} transparent opacity={0.16} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
      </mesh>
      {/* Pulsing path nodes. */}
      <instancedMesh ref={nodesMesh} args={[geo, mat, count]} frustumCulled={false} />
    </group>
  )
}

/* ------------------------------------------------- The Gate */

interface GateRefs {
  group: MutableRefObject<THREE.Group | null>
  horizon: MutableRefObject<THREE.Mesh | null>
  horizonMat: MutableRefObject<THREE.MeshBasicMaterial | null>
  swirlA: MutableRefObject<THREE.Mesh | null>
  swirlB: MutableRefObject<THREE.Mesh | null>
  rimMat: MutableRefObject<THREE.MeshStandardMaterial | null>
  light: MutableRefObject<THREE.PointLight | null>
}

function Gate({ accent, refs }: { accent: string; refs: GateRefs }): JSX.Element {
  return (
    <group ref={refs.group} position={[0, GATE_Y, GATE_Z]}>
      {/* Structural rim torus (PBR so it catches the IBL + bloom). */}
      <mesh>
        <torusGeometry args={[9, 0.7, 12, 64]} />
        <meshStandardMaterial ref={refs.rimMat} color="#0c1024" emissive={accent} emissiveIntensity={1.2} roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Additive glow rim. */}
      <mesh>
        <torusGeometry args={[9, 1.1, 12, 80]} />
        <meshBasicMaterial color={accent} transparent opacity={0.3} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
      </mesh>
      {/* Event horizon disc. */}
      <mesh ref={refs.horizon}>
        <circleGeometry args={[8.4, 64]} />
        <meshBasicMaterial ref={refs.horizonMat} color={accent} transparent opacity={0.45} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </mesh>
      {/* Shimmer swirls (counter-rotating thin rings). */}
      <mesh ref={refs.swirlA} position={[0, 0, 0.05]}>
        <ringGeometry args={[3.2, 8.0, 48, 1, 0, Math.PI * 1.4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </mesh>
      <mesh ref={refs.swirlB} position={[0, 0, 0.06]}>
        <ringGeometry args={[1.4, 6.0, 48, 1, 0, Math.PI * 1.1]} />
        <meshBasicMaterial color={accent} transparent opacity={0.18} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} fog={false} />
      </mesh>
      {/* Rim light bathing the approach in the gate's color. */}
      <pointLight ref={refs.light} position={[0, 0, 6]} color={accent} intensity={3} distance={60} decay={1.5} />
    </group>
  )
}

/* ------------------------------------------------- The flythrough world */

interface WorldProps {
  accent: string
  gateReq: MutableRefObject<boolean>
  onArrive?: () => void
  onEnter?: () => void
}

const ThresholdWorld = memo(function ThresholdWorld({ accent, gateReq, onArrive, onEnter }: WorldProps): JSX.Element {
  const { camera } = useThree()
  const tier = useQuality()

  const dirRef = useRef<CameraDirector | null>(null)
  if (!dirRef.current) {
    dirRef.current = new CameraDirector()
    dirRef.current.followLerp = 0.9
    dirRef.current.lookLerp = 0.6
  }

  // Gate refs.
  const gateRefs: GateRefs = {
    group: useRef<THREE.Group>(null),
    horizon: useRef<THREE.Mesh>(null),
    horizonMat: useRef<THREE.MeshBasicMaterial>(null),
    swirlA: useRef<THREE.Mesh>(null),
    swirlB: useRef<THREE.Mesh>(null),
    rimMat: useRef<THREE.MeshStandardMaterial>(null),
    light: useRef<THREE.PointLight>(null),
  }

  // White push-through overlay (billboarded in front of the camera).
  const whiteRef = useRef<THREE.Mesh>(null)
  const whiteMat = useRef<THREE.MeshBasicMaterial>(null)

  // Timeline refs (one-shot guards).
  const startT = useRef<number | null>(null)
  const arrivedFired = useRef(false)
  const openStart = useRef<number | null>(null)
  const enterFired = useRef(false)

  // Scratch.
  const from = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())
  const hold = useRef(new THREE.Vector3())
  const through = useRef(new THREE.Vector3())
  const fwd = useRef(new THREE.Vector3())

  // Fragment specs from the six conquered worlds.
  const fragSpecs = useMemo<FragSpec[]>(() => {
    const out: FragSpec[] = []
    const n = Math.min(6, WORLDS.length)
    for (let i = 0; i < n; i++) {
      const p = i / (n - 1)
      const z = THREE.MathUtils.lerp(START_Z - 8, GATE_Z + 12, p)
      const side = i % 2 === 0 ? -1 : 1
      out.push({
        pos: new THREE.Vector3(side * (8 + (i % 3) * 5), 2 + ((i * 1.7) % 6) - 1, z + (i % 2) * 6),
        scale: 1.6 + (i % 3) * 0.7,
        color: WORLDS[i].theme.accent,
        rotSpeed: 0.05 + (i % 3) * 0.03,
        bob: 0.4 + (i % 3) * 0.2,
        bobPhase: i * 1.1,
        spin: new THREE.Vector3(0.3 + (i % 2), 0, 0.4 + (i % 3) * 0.5),
      })
    }
    return out
  }, [])

  const railPos = (p: number, out: THREE.Vector3) => {
    const e = ease(p)
    const z = THREE.MathUtils.lerp(START_Z, RAIL_END_Z, e)
    const x = Math.sin(p * Math.PI * 1.5) * 6 * (1 - p) // gentle weave that settles
    const y = 5 + Math.sin(p * Math.PI) * 2.2 // rise then settle
    out.set(x, y, z)
  }

  // Hold pose computed once (rail end).
  railPos(1, hold.current)

  useFrame((state, dtRaw) => {
    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const dir = dirRef.current
    if (!dir) return
    dir.attach(camera)
    if (startT.current == null) startT.current = t
    const elapsed = t - startT.current

    // Gate-open request latches an openStart timestamp.
    if (gateReq.current && openStart.current == null) openStart.current = t
    const opening = openStart.current != null
    const pushP = opening ? THREE.MathUtils.clamp((t - (openStart.current ?? t)) / PUSH_DUR, 0, 1) : 0

    /* ---- camera rail ---- */
    if (!opening) {
      const railP = THREE.MathUtils.clamp(elapsed / RAIL_DUR, 0, 1)
      railPos(railP, from.current)
      // Look toward the gate, with a banked drift.
      look.current.set(0, GATE_Y, GATE_Z)
      // Mid-flight: bias the look toward a drifting fragment for a slow orbit beat.
      const w = railP > 0.35 && railP < 0.62 ? Math.sin(((railP - 0.35) / 0.27) * Math.PI) : 0
      if (w > 0 && fragSpecs.length > 2) {
        const f = fragSpecs[2].pos
        look.current.x = THREE.MathUtils.lerp(look.current.x, f.x, w * 0.7)
        look.current.y = THREE.MathUtils.lerp(look.current.y, f.y, w * 0.7)
      }
      // Gentle bank.
      from.current.x += Math.sin(t * 0.5) * 0.4
      dir.frame(look.current, from.current, dt)

      if (railP >= 1 && !arrivedFired.current) {
        arrivedFired.current = true
        onArrive?.()
      }
    } else {
      // Push through the gate to white.
      const e = ease(pushP)
      through.current.set(0, GATE_Y, GATE_Z - 10)
      from.current.lerpVectors(hold.current, through.current, e)
      look.current.set(0, GATE_Y, GATE_Z - 24)
      dir.frame(look.current, from.current, dt)

      if (pushP >= 1 && !enterFired.current) {
        enterFired.current = true
        onEnter?.()
      }
    }

    /* ---- gate idle + opening animation ---- */
    const idlePulse = 0.45 + Math.sin(t * 1.4) * 0.12
    const openK = opening ? pushP : 0
    if (gateRefs.horizonMat.current) {
      gateRefs.horizonMat.current.opacity = idlePulse + openK * 0.55
      // Bloom to white as it opens.
      gateRefs.horizonMat.current.color.set(accent)
      if (openK > 0) gateRefs.horizonMat.current.color.lerp(C_WHITE, openK)
    }
    if (gateRefs.horizon.current) {
      const s = 1 + openK * 0.4 // iris widens
      gateRefs.horizon.current.scale.set(s, s, 1)
    }
    if (gateRefs.rimMat.current) {
      gateRefs.rimMat.current.emissiveIntensity = 1.2 + Math.sin(t * 1.4) * 0.3 + openK * 3
    }
    if (gateRefs.light.current) {
      gateRefs.light.current.intensity = 3 + openK * 9
    }
    if (gateRefs.swirlA.current) gateRefs.swirlA.current.rotation.z += dt * (0.5 + openK * 4)
    if (gateRefs.swirlB.current) gateRefs.swirlB.current.rotation.z -= dt * (0.7 + openK * 5)
    if (gateRefs.group.current) {
      const gs = 1 + Math.sin(t * 1.1) * 0.01 + openK * 0.06
      gateRefs.group.current.scale.setScalar(gs)
    }

    /* ---- whiteout billboard ---- */
    if (whiteRef.current && whiteMat.current) {
      // Ramp in over the back half of the push-through.
      const wa = opening ? THREE.MathUtils.clamp((pushP - 0.45) / 0.55, 0, 1) : 0
      whiteMat.current.opacity = wa
      whiteRef.current.visible = wa > 0.001
      if (wa > 0.001) {
        camera.getWorldDirection(fwd.current)
        whiteRef.current.position.copy(camera.position).addScaledVector(fwd.current, 0.4)
        whiteRef.current.quaternion.copy(camera.quaternion)
      }
    }
  })

  return (
    <group>
      <Stars radius={120} depth={70} count={tier === 'low' ? 700 : tier === 'med' ? 1200 : 1800} factor={4} saturation={0} fade speed={1.0} />
      <EmberField count={tier === 'low' ? 60 : tier === 'med' ? 110 : 200} area={40} height={26} color={COLD} />

      <PathOfLight accent={accent} count={tier === 'low' ? 16 : 24} />
      <WorldFragments specs={fragSpecs} />
      <Gate accent={accent} refs={gateRefs} />

      {/* White push-through overlay (in front of camera; depth-independent). */}
      <mesh ref={whiteRef} visible={false} frustumCulled={false} renderOrder={999}>
        <planeGeometry args={[3, 3]} />
        <meshBasicMaterial ref={whiteMat} color="#ffffff" transparent opacity={0} toneMapped={false} depthTest={false} depthWrite={false} fog={false} />
      </mesh>
    </group>
  )
})

/* ------------------------------------------------------------- Component */

export const ThresholdScene = forwardRef<ThresholdSceneHandle, ThresholdSceneProps>(function ThresholdScene(
  { accent = '#37e6ff', onArrive, onEnter },
  ref,
): JSX.Element {
  const gateReq = useRef(false)

  useImperativeHandle(
    ref,
    () => ({
      openGate() {
        gateReq.current = true
      },
    }),
    [],
  )

  return (
    <CinematicStage
      environment="void"
      fog={{ color: '#05060f', near: 30, far: 160 }}
      cameraInitial={{ position: [0, 5, START_Z], fov: 55 }}
      bloom={0.95}
      dof
      ssao={false}
      grain
      chromaticAberration
      vignette
    >
      <ThresholdWorld accent={accent} gateReq={gateReq} onArrive={onArrive} onEnter={onEnter} />
    </CinematicStage>
  )
})
