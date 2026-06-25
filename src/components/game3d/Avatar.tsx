import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type AvatarAnim = 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'dance' | 'punch'

/**
 * A hand-built low-poly "explorer bot" hero, ~1.8m tall with feet at y=0.
 *
 * Built from primitives (no rigged GLB) so it ALWAYS renders, and so every
 * joint can be animated by hand with Disney principles:
 *  - squash & stretch (breathing / stride bounce)
 *  - overlapping action + follow-through (antenna lags the body)
 *  - slow in / slow out (amplitudes eased toward their target)
 *  - arcs & secondary action (arms swing opposite the legs)
 */

export function Avatar({
  anim,
  accent = '#6d4afe',
  fireRef,
}: {
  anim: AvatarAnim
  accent?: string
  fireRef?: MutableRefObject<number>
}) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const antenna = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const gun = useRef<THREE.Group>(null)
  const flash = useRef<THREE.Group>(null)

  const phase = useRef(0)
  const amp = useRef(0) // eased stride amplitude (0 idle .. 1 run)
  const antennaVel = useRef(0)
  const antennaAng = useRef(0)

  const colors = useMemo(() => {
    const a = new THREE.Color(accent)
    return {
      body: accent,
      bodyDark: '#' + a.clone().multiplyScalar(0.65).getHexString(),
      limb: '#d7dded',
      joint: '#2b3040',
      visor: '#8fe9ff',
      tip: accent,
    }
  }, [accent])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime

    const running = anim === 'run' || anim === 'walk'
    const jumping = anim === 'jump'

    // Ease stride amplitude in/out (slow in / slow out).
    const targetAmp = jumping ? 0 : running ? 1 : 0
    amp.current += (targetAmp - amp.current) * Math.min(1, dt * 8)

    const cadence = running ? 11 : 2.2
    phase.current += dt * cadence

    const swing = Math.sin(phase.current)
    const legAmp = 0.7 * amp.current

    if (legL.current && legR.current) {
      if (jumping) {
        legL.current.rotation.x = -0.7
        legR.current.rotation.x = -0.4
      } else {
        legL.current.rotation.x = swing * legAmp
        legR.current.rotation.x = -swing * legAmp
      }
    }

    // Sharp, quick recoil kick from the most recent shot.
    const kick = fireRef ? THREE.MathUtils.clamp(1 - (t - fireRef.current) / 0.14, 0, 1) : 0

    if (armL.current && armR.current) {
      if (jumping) {
        armL.current.rotation.x = -2.0
        armR.current.rotation.x = -2.0
        armL.current.rotation.z = 0.3
        armR.current.rotation.z = -0.3
      } else {
        // Gun-ready stance: both hands reach forward to hold the blaster, with a
        // gentle bob; the trigger arm kicks up briefly on recoil.
        const bob = Math.sin(phase.current) * 0.06 * amp.current
        armR.current.rotation.x = -1.42 - kick * 0.5 + bob
        armL.current.rotation.x = -1.26 + bob
        armR.current.rotation.z = -0.18
        armL.current.rotation.z = 0.5
      }
    }
    if (body.current) body.current.rotation.x = -0.06 * kick

    // Gun recoil + muzzle flash.
    if (gun.current) gun.current.position.z = 0.34 - kick * 0.12
    if (flash.current) {
      flash.current.visible = kick > 0.04
      flash.current.scale.setScalar(0.0001 + kick * 0.55)
    }

    // Body bounce + breathing squash & stretch.
    if (body.current) {
      const bounce = running ? Math.abs(Math.sin(phase.current)) * 0.08 * amp.current : 0
      const breathe = (1 - amp.current) * Math.sin(t * 2) * 0.02
      body.current.position.y = bounce
      body.current.scale.y = 1 + breathe + bounce * 0.4
      body.current.scale.x = 1 - breathe * 0.5
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 1.3) * 0.04 * (1 - amp.current)
    }

    // Antenna follow-through: a damped spring chasing the body's motion.
    if (antenna.current && body.current) {
      const drive = -body.current.position.y * 6 - (running ? Math.cos(phase.current) * 0.6 * amp.current : 0)
      antennaVel.current += (drive - antennaAng.current) * dt * 60
      antennaVel.current *= 0.86
      antennaAng.current += antennaVel.current * dt
      antenna.current.rotation.z = THREE.MathUtils.clamp(antennaAng.current, -0.7, 0.7)
    }

    if (root.current) root.current.rotation.y = 0
  })

  return (
    <group ref={root}>
      <group ref={body} position={[0, 0, 0]}>
        {/* torso */}
        <mesh position={[0, 1.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.62, 0.36]} />
          <meshStandardMaterial color={colors.body} roughness={0.5} metalness={0.15} />
        </mesh>
        {/* chest panel */}
        <mesh position={[0, 1.14, 0.19]} castShadow>
          <boxGeometry args={[0.3, 0.34, 0.04]} />
          <meshStandardMaterial color={colors.bodyDark} emissive={colors.visor} emissiveIntensity={0.25} roughness={0.4} />
        </mesh>
        {/* hips */}
        <mesh position={[0, 0.84, 0]} castShadow>
          <boxGeometry args={[0.46, 0.18, 0.32]} />
          <meshStandardMaterial color={colors.joint} roughness={0.6} />
        </mesh>
        {/* backpack / jetpack */}
        <mesh position={[0, 1.12, -0.22]} castShadow>
          <boxGeometry args={[0.34, 0.4, 0.14]} />
          <meshStandardMaterial color={colors.joint} roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[-0.1, 0.9, -0.3]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[0.1, 0.9, -0.3]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.6} />
        </mesh>

        {/* head */}
        <group ref={head} position={[0, 1.5, 0]}>
          <mesh position={[0, 0.13, 0]} castShadow>
            <boxGeometry args={[0.36, 0.34, 0.34]} />
            <meshStandardMaterial color={colors.limb} roughness={0.45} metalness={0.2} />
          </mesh>
          {/* visor */}
          <mesh position={[0, 0.15, 0.18]}>
            <boxGeometry args={[0.28, 0.14, 0.04]} />
            <meshStandardMaterial color={colors.visor} emissive={colors.visor} emissiveIntensity={0.9} roughness={0.2} />
          </mesh>
          {/* ears */}
          <mesh position={[-0.2, 0.13, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.06, 10]} />
            <meshStandardMaterial color={colors.joint} />
          </mesh>
          <mesh position={[0.2, 0.13, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.06, 10]} />
            <meshStandardMaterial color={colors.joint} />
          </mesh>
          {/* antenna with follow-through */}
          <group ref={antenna} position={[0, 0.3, 0]}>
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.012, 0.018, 0.2, 6]} />
              <meshStandardMaterial color={colors.joint} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.8} />
            </mesh>
          </group>
        </group>

        {/* arms (pivot at shoulder) — posed forward to hold the blaster */}
        <group ref={armL} position={[-0.34, 1.34, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.4, 4, 10]} />
            <meshStandardMaterial color={colors.limb} roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, -0.56, 0]} castShadow>
            <sphereGeometry args={[0.11, 12, 12]} />
            <meshStandardMaterial color={colors.body} roughness={0.5} />
          </mesh>
        </group>
        <group ref={armR} position={[0.34, 1.34, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.4, 4, 10]} />
            <meshStandardMaterial color={colors.limb} roughness={0.5} metalness={0.2} />
          </mesh>
          <mesh position={[0, -0.56, 0]} castShadow>
            <sphereGeometry args={[0.11, 12, 12]} />
            <meshStandardMaterial color={colors.body} roughness={0.5} />
          </mesh>
        </group>

        {/* blaster held in front of the chest, pointing forward (+Z) */}
        <group ref={gun} position={[0.2, 1.16, 0.34]}>
          {/* receiver */}
          <mesh castShadow>
            <boxGeometry args={[0.12, 0.15, 0.34]} />
            <meshStandardMaterial color={colors.joint} metalness={0.55} roughness={0.4} />
          </mesh>
          {/* barrel */}
          <mesh position={[0, 0.02, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.36, 12]} />
            <meshStandardMaterial color="#23283a" metalness={0.75} roughness={0.3} />
          </mesh>
          {/* glowing energy cell */}
          <mesh position={[0, -0.13, -0.03]}>
            <boxGeometry args={[0.08, 0.13, 0.13]} />
            <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.1} />
          </mesh>
          {/* grip */}
          <mesh position={[0, -0.17, -0.1]} rotation={[0.32, 0, 0]} castShadow>
            <boxGeometry args={[0.07, 0.2, 0.09]} />
            <meshStandardMaterial color={colors.joint} roughness={0.6} />
          </mesh>
          {/* sight rail */}
          <mesh position={[0, 0.11, 0.02]}>
            <boxGeometry args={[0.03, 0.05, 0.16]} />
            <meshStandardMaterial color={colors.bodyDark} roughness={0.5} />
          </mesh>
          {/* muzzle flash (toggled on fire) */}
          <group ref={flash} position={[0, 0.02, 0.52]} visible={false}>
            <mesh>
              <sphereGeometry args={[0.17, 10, 10]} />
              <meshBasicMaterial color="#fff6c0" transparent opacity={0.95} toneMapped={false} fog={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.14, 0.42, 8]} />
              <meshBasicMaterial color="#ffce3f" transparent opacity={0.9} toneMapped={false} fog={false} />
            </mesh>
          </group>
        </group>

        {/* legs (pivot at hip) */}
        <group ref={legL} position={[-0.15, 0.82, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.5, 4, 10]} />
            <meshStandardMaterial color={colors.limb} roughness={0.5} metalness={0.15} />
          </mesh>
          <mesh position={[0, -0.78, 0.06]} castShadow>
            <boxGeometry args={[0.18, 0.12, 0.3]} />
            <meshStandardMaterial color={colors.joint} roughness={0.6} />
          </mesh>
        </group>
        <group ref={legR} position={[0.15, 0.82, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.5, 4, 10]} />
            <meshStandardMaterial color={colors.limb} roughness={0.5} metalness={0.15} />
          </mesh>
          <mesh position={[0, -0.78, 0.06]} castShadow>
            <boxGeometry args={[0.18, 0.12, 0.3]} />
            <meshStandardMaterial color={colors.joint} roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
