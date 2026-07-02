import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { applyRimLight } from './simulation'
import type { Vec2 } from './layout'

/**
 * "Bit" — a floating guide drone that hovers beside the hero, bobs with
 * personality, and aims a clear pointer at the next objective. The subtle lit
 * trail on the ground (FloorPath) marks the route; Bit points the heading.
 */
export function Companion({
  playerPosRef,
  target,
  accent = '#6d4afe',
}: {
  playerPosRef: MutableRefObject<THREE.Vector3>
  target: Vec2 | null
  accent?: string
}) {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const desired = useRef(new THREE.Vector3())

  // Rim-lit core (M7) — Bit reads as a bright data-sprite against the city.
  const coreMat = useMemo(
    () =>
      applyRimLight(
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: new THREE.Color(accent),
          emissiveIntensity: 0.5,
          flatShading: true,
        }),
        '#ffffff',
        0.55,
      ),
    [accent],
  )
  useEffect(() => () => coreMat.dispose(), [coreMat])

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const p = playerPosRef.current
    const t = state.clock.elapsedTime

    desired.current.set(p.x + 2.2, p.y + 2.7 + Math.sin(t * 2) * 0.2, p.z + 0.4)
    g.position.lerp(desired.current, 0.09)

    if (body.current) {
      // Face the next objective so Bit still "looks" the way to go.
      if (target) body.current.rotation.y = Math.atan2(target.x - g.position.x, target.z - g.position.z)
      else body.current.rotation.y = Math.sin(t * 1.5) * 0.4
      body.current.position.y = Math.sin(t * 2.4) * 0.12
    }
  })

  return (
    <group ref={group} scale={0.6}>
      <group ref={body}>
        {/* core */}
        <mesh castShadow material={coreMat}>
          <icosahedronGeometry args={[0.5, 1]} />
        </mesh>
        {/* glass visor */}
        <mesh position={[0, 0.08, 0.42]}>
          <sphereGeometry args={[0.26, 16, 16]} />
          <meshStandardMaterial color="#0c1230" emissive="#9fd0ff" emissiveIntensity={0.5} />
        </mesh>
        {/* eye */}
        <mesh position={[0, 0.1, 0.6]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1} />
        </mesh>
        {/* fins */}
        <mesh position={[-0.5, 0, 0]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.5, 0.08, 0.3]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
        <mesh position={[0.5, 0, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.5, 0.08, 0.3]} />
          <meshStandardMaterial color="#fff" />
        </mesh>
      </group>
    </group>
  )
}
