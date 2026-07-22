// QA-ONLY visual showcase for the enemy-projectile VFX (never imported by the
// app). Mounted by scripts/probe-projfx-showcase.mjs through the Vite dev
// server: a close camera watches a handful of projectiles fly repeating arcs
// in each theme color, with periodic impact flashes — so the review loop can
// judge the core/halo/trail read up close and deterministically.
import { useRef, type JSX } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  EnemyProjectiles,
  ImpactFlashes,
  type EnemyProjectilesHandle,
  type ImpactFlashesHandle,
} from '../../src/components/game3d/projectileFx'

const LANES: { color: string; core?: string; organic?: boolean; y: number; speed: number }[] = [
  { color: '#b6ff5c', y: 2.6, speed: 12 }, // realm 0 accent
  { color: '#36e0ff', y: 1.9, speed: 14 }, // realm 1 accent
  { color: '#ff48e0', y: 1.2, speed: 15 }, // VEX magenta
  { color: '#8dff2e', core: '#f4ffd0', organic: true, y: 0.6, speed: 16 }, // spitter acid
]

function Lane({ idx }: { idx: number }): JSX.Element {
  const spec = LANES[idx]
  const fx = useRef<EnemyProjectilesHandle>(null)
  const impacts = useRef<ImpactFlashesHandle>(null)
  const camera = useThree((s) => s.camera)
  const pos = useRef(new THREE.Vector3())
  const lastWrap = useRef(0)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const f = fx.current
    if (!f) return
    f.begin(camera.quaternion)
    // Two projectiles per lane, flying left→right and wrapping.
    for (let k = 0; k < 2; k++) {
      const span = 14
      const p = ((t * spec.speed * 0.14 + k * 0.5 + idx * 0.2) % 1 + 1) % 1
      const x = -span / 2 + p * span
      pos.current.set(x, spec.y, -1.5 - idx * 0.4)
      f.set(k, pos.current, spec.speed, 0, 0, t)
      // Splash when a projectile wraps (reaches the right edge).
      if (k === 0 && p < lastWrap.current) {
        impacts.current?.spawn(span / 2, spec.y, -1.5 - idx * 0.4, spec.color, 1.1, 6)
      }
      if (k === 0) lastWrap.current = p
    }
    f.commit()
  })

  return (
    <>
      <EnemyProjectiles
        ref={fx}
        pool={2}
        color={spec.color}
        coreColor={spec.core}
        organic={spec.organic}
        size={spec.organic ? 0.26 : 0.34}
      />
      <ImpactFlashes ref={impacts} pool={4} />
    </>
  )
}

export function ProjectileShowcase(): JSX.Element {
  return (
    <Canvas camera={{ position: [0, 1.6, 5.2], fov: 55 }} gl={{ antialias: true }}>
      <color attach="background" args={['#0a0c14']} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial color="#11141f" />
      </mesh>
      <gridHelper args={[40, 40, '#1d2233', '#151a28']} />
      {LANES.map((_, i) => (
        <Lane key={i} idx={i} />
      ))}
    </Canvas>
  )
}
