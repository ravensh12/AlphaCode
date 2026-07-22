import { memo, useEffect, useMemo, useRef, type JSX } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMeshyModels } from './meshy/useMeshyModels'
import { MeshyBatch, type MeshyInstance } from './meshy/MeshyBatch'

/* ============================================================================
   RealmStageDressing — the themed set dressing that gives each realm boss its
   own arena identity (specs/palettes live in realmStages.ts):

     0 The Hider      · The Signal Alleys — signage totems, dumpsters,
                        scaffolds, chainlink, flickering alley neon
     1 Mirror Mimic   · The Mirror Atrium — mirror monoliths, chrome pillars,
                        floating glass shards
     2 Twin-Key Golem · The Broken Quarry — excavators, rubble, girders,
                        barriers, amber floodlight masts
     3 The Gatekeeper · The Great Gate — the monumental district gate, stone
                        walls, banners, bridge pylons
     4 Bracket Beast  · The Rust Yards — container stacks, wrecked trucks,
                        chainlink, leaning pillars, hazard strobes
     5 Sorted Sphinx  · The Gilded Court — colonnade, gilded sphinx statues,
                        museum dome, gold trim

   Everything sits OUTSIDE the play boundary (r ≥ ~25; BOUND is 20, the
   barrier ring at ~24.4), so combat, movement clamps and camera framing are
   untouched. Meshy props render via MeshyBatch (one instanced draw per prop
   type); procedural pieces are instanced or few. Per-frame animation is
   limited to two flicker materials + one strobe light — no allocations.
   ========================================================================== */

const ring = (
  n: number,
  r: number,
  scale: number,
  opts: { jitterR?: number; y?: number; phase?: number; skip?: (i: number) => boolean } = {},
): MeshyInstance[] => {
  const out: MeshyInstance[] = []
  for (let i = 0; i < n; i++) {
    if (opts.skip?.(i)) continue
    const a = (i / n) * Math.PI * 2 + (opts.phase ?? 0)
    const rr = r + ((i * 37) % 7) * (opts.jitterR ?? 0)
    out.push({
      x: Math.cos(a) * rr,
      z: Math.sin(a) * rr,
      yaw: -a + Math.PI / 2 + ((i * 13) % 5) * 0.1,
      scale,
      y: opts.y,
    })
  }
  return out
}

/* ------------------------------------------------------- shared flicker -- */

/** Emissive material whose intensity flickers like failing neon. */
function useFlickerMaterial(color: string, base = 1.4): THREE.MeshStandardMaterial {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0a0a10',
        emissive: color,
        emissiveIntensity: base,
        roughness: 0.5,
        metalness: 0.2,
      }),
    [color, base],
  )
  useEffect(() => () => mat.dispose(), [mat])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Two incommensurate squares + a rare dropout — classic dying-sign strobe.
    const buzz = Math.sin(t * 31) > -0.2 ? 1 : 0.35
    const drop = Math.sin(t * 2.13 + 1.7) > 0.94 ? 0.1 : 1
    mat.emissiveIntensity = base * buzz * drop
  })
  return mat
}

/* ------------------------------------------------------------ 0 · Hider -- */

const AlleyStage = memo(function AlleyStage({ accent }: { accent: string }) {
  const models = useMeshyModels([
    'arena-alley-signstack',
    'street-dumpster',
    'street-scaffolding',
    'street-fence-chainlink',
    'street-trash-bin',
  ])
  const signMat = useFlickerMaterial(accent, 1.6)
  const pinkMat = useFlickerMaterial('#ff5ad0', 1.2)
  const placements = useMemo(
    () => ({
      totems: ring(4, 28, 1.35, { jitterR: 0.4, phase: 0.4 }),
      dumpsters: ring(5, 26, 1, { jitterR: 0.3, phase: 1.1 }),
      scaffolds: ring(3, 31, 1, { phase: 2.2 }),
      fence: ring(14, 25.2, 1, { skip: (i) => i % 4 === 0 }),
      bins: ring(6, 25.8, 1, { phase: 0.9 }),
    }),
    [],
  )
  const poleMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#181c20', roughness: 0.6, metalness: 0.6 }),
    [],
  )
  useEffect(() => () => poleMat.dispose(), [poleMat])
  // Pole-mounted alley signs — emissive boxes on rusty masts, flickering.
  const signs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.25
        const r = 27 + (i % 3) * 2.2
        return {
          x: Math.cos(a) * r,
          z: Math.sin(a) * r,
          y: 4.6 + (i % 3) * 1.9,
          yaw: -a - Math.PI / 2,
          w: 2.6 + (i % 2) * 1.6,
          h: 1.3 + (i % 3) * 0.6,
          pink: i % 3 === 1,
        }
      }),
    [],
  )
  return (
    <group>
      {models && (
        <>
          <MeshyBatch model={models['arena-alley-signstack']} items={placements.totems} />
          <MeshyBatch model={models['street-dumpster']} items={placements.dumpsters} />
          <MeshyBatch model={models['street-scaffolding']} items={placements.scaffolds} />
          <MeshyBatch model={models['street-fence-chainlink']} items={placements.fence} />
          <MeshyBatch model={models['street-trash-bin']} items={placements.bins} />
        </>
      )}
      {signs.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation-y={s.yaw}>
          <mesh position={[0, s.y / 2 + 0.5, 0]} material={poleMat}>
            <cylinderGeometry args={[0.09, 0.13, s.y + 1, 8]} />
          </mesh>
          <mesh position={[0, s.y, 0]} material={s.pink ? pinkMat : signMat}>
            <boxGeometry args={[s.w, s.h, 0.2]} />
          </mesh>
          {i % 2 === 0 && (
            <mesh position={[0, s.y - 1.6, 0]} material={s.pink ? signMat : pinkMat}>
              <boxGeometry args={[s.w * 0.6, s.h * 0.7, 0.2]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
})

/* ------------------------------------------------------------ 1 · Mimic -- */

const AtriumStage = memo(function AtriumStage({ accent }: { accent: string }) {
  const models = useMeshyModels(['arena-mirror-monolith'])
  const chromeMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#dfe6f2',
        metalness: 1,
        roughness: 0.07,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.6,
      }),
    [],
  )
  const seamMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0a1018', emissive: accent, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.5 }),
    [accent],
  )
  useEffect(
    () => () => {
      chromeMat.dispose()
      seamMat.dispose()
    },
    [chromeMat, seamMat],
  )
  const monoliths = useMemo(
    () => [
      ...ring(6, 28, 1.4, { jitterR: 0.5 }),
      ...ring(4, 33, 2.1, { phase: 0.55 }),
    ],
    [],
  )
  return (
    <group>
      {models && <MeshyBatch model={models['arena-mirror-monolith']} items={monoliths} />}
      {/* Chrome pillar colonnade between the monoliths. */}
      {ring(12, 26, 1, { skip: (i) => i % 3 === 0 }).map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <mesh position={[0, 3.5, 0]} material={chromeMat} castShadow>
            <cylinderGeometry args={[0.28, 0.34, 7, 12]} />
          </mesh>
          <mesh position={[0, 7.15, 0]} material={seamMat}>
            <boxGeometry args={[0.9, 0.3, 0.9]} />
          </mesh>
        </group>
      ))}
    </group>
  )
})

/* ------------------------------------------------------------ 2 · Golem -- */

const QuarryStage = memo(function QuarryStage({ accent }: { accent: string }) {
  const models = useMeshyModels([
    'arena-quarry-excavator',
    'street-jersey-barrier',
    'street-traffic-cone',
    'street-scaffolding',
  ])
  void accent
  const rockMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#241f1e', roughness: 0.95, metalness: 0.05, flatShading: true }),
    [],
  )
  const girderMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#3a2f22', roughness: 0.6, metalness: 0.7 }),
    [],
  )
  const lampMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1a150f', emissive: '#ffb85c', emissiveIntensity: 2.4, roughness: 0.4 }),
    [],
  )
  useEffect(
    () => () => {
      rockMat.dispose()
      girderMat.dispose()
      lampMat.dispose()
    },
    [rockMat, girderMat, lampMat],
  )
  const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), [])
  const rocksRef = useRef<THREE.InstancedMesh>(null)
  const rocks = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const a = (i / 26) * Math.PI * 2 + ((i * 17) % 5) * 0.09
        const r = 26 + ((i * 23) % 11)
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + ((i * 7) % 6) * 0.45, yaw: i * 0.7 }
      }),
    [],
  )
  useEffect(() => {
    const m = rocksRef.current
    if (!m) return
    const d = new THREE.Object3D()
    rocks.forEach((rk, i) => {
      d.position.set(rk.x, rk.s * 0.4, rk.z)
      d.rotation.set(0.3, rk.yaw, 0.2)
      d.scale.set(rk.s, rk.s * 0.7, rk.s)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [rocks])
  useEffect(() => () => rockGeo.dispose(), [rockGeo])
  const placements = useMemo(
    () => ({
      excavators: [
        { x: -27, z: -16, yaw: 0.8, scale: 1 },
        { x: 24, z: 21, yaw: -2.2, scale: 1.15 },
      ],
      barriers: ring(9, 25.4, 1, { phase: 0.5, skip: (i) => i % 3 === 2 }),
      cones: ring(10, 26.5, 1, { jitterR: 0.6, phase: 1.4 }),
      scaffolds: ring(3, 32, 1.2, { phase: 2.9 }),
    }),
    [],
  )
  return (
    <group>
      {models && (
        <>
          <MeshyBatch model={models['arena-quarry-excavator']} items={placements.excavators} castShadow />
          <MeshyBatch model={models['street-jersey-barrier']} items={placements.barriers} />
          <MeshyBatch model={models['street-traffic-cone']} items={placements.cones} />
          <MeshyBatch model={models['street-scaffolding']} items={placements.scaffolds} />
        </>
      )}
      <instancedMesh ref={rocksRef} args={[rockGeo, rockMat, rocks.length]} frustumCulled={false} />
      {/* Girder stacks. */}
      {[[-30, 8, 0.4], [31, -6, 1.9], [8, -31, 0.9]].map(([x, z, yaw], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={yaw}>
          <mesh position={[0, 0.35, 0]} material={girderMat} castShadow>
            <boxGeometry args={[6.5, 0.5, 0.5]} />
          </mesh>
          <mesh position={[0.3, 0.9, 0.1]} rotation-y={0.08} material={girderMat}>
            <boxGeometry args={[6.5, 0.5, 0.5]} />
          </mesh>
        </group>
      ))}
      {/* Floodlight masts — amber worklight pools over the cut. */}
      {[[-24, 18], [22, -22]].map(([x, z], i) => (
        <group key={`fl${i}`} position={[x, 0, z]}>
          <mesh position={[0, 4.5, 0]} material={girderMat}>
            <cylinderGeometry args={[0.12, 0.18, 9, 8]} />
          </mesh>
          <mesh position={[0, 9, 0]} rotation-x={0.7} material={lampMat}>
            <boxGeometry args={[1.6, 0.5, 0.3]} />
          </mesh>
          <pointLight position={[0, 8.4, 1]} color="#ffb85c" intensity={3.2} distance={26} decay={1.6} />
        </group>
      ))}
    </group>
  )
})

/* ------------------------------------------------------- 3 · Gatekeeper -- */

const GateStage = memo(function GateStage({ accent }: { accent: string }) {
  const models = useMeshyModels([
    'landmark-district-gate',
    'landmark-bridge-pylon',
    'street-barrier-crowd',
    'street-lamp-neon',
  ])
  const stoneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#221e2a', roughness: 0.85, metalness: 0.1 }),
    [],
  )
  const bannerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#141018', emissive: accent, emissiveIntensity: 0.9, roughness: 0.7, side: THREE.DoubleSide }),
    [accent],
  )
  useEffect(
    () => () => {
      stoneMat.dispose()
      bannerMat.dispose()
    },
    [stoneMat, bannerMat],
  )
  const placements = useMemo(
    () => ({
      gate: [{ x: 0, z: -34, yaw: 0, scale: 1.7 }],
      pylons: [
        { x: -30, z: -12, yaw: 0.4, scale: 1.2 },
        { x: 30, z: -12, yaw: -0.4, scale: 1.2 },
      ],
      crowd: ring(8, 25.4, 1, { phase: Math.PI / 2, skip: (i) => i > 4 }),
      lamps: ring(6, 27, 1, { phase: 0.35 }),
    }),
    [],
  )
  // Flanking wall arcs (left/right of the gate).
  const walls = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const side = i < 5 ? 1 : -1
        const a = Math.PI * 1.5 + side * (0.5 + (i % 5) * 0.24)
        const r = 33
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: -a + Math.PI / 2 }
      }),
    [],
  )
  return (
    <group>
      {models && (
        <>
          <MeshyBatch model={models['landmark-district-gate']} items={placements.gate} castShadow />
          <MeshyBatch model={models['landmark-bridge-pylon']} items={placements.pylons} />
          <MeshyBatch model={models['street-barrier-crowd']} items={placements.crowd} />
          <MeshyBatch model={models['street-lamp-neon']} items={placements.lamps} />
        </>
      )}
      {walls.map((w, i) => (
        <group key={i} position={[w.x, 0, w.z]} rotation-y={w.yaw}>
          <mesh position={[0, 6, 0]} material={stoneMat} castShadow>
            <boxGeometry args={[7.2, 12, 1.6]} />
          </mesh>
          {/* Hanging banner every other segment. */}
          {i % 2 === 0 && (
            <mesh position={[0, 6.5, 0.95]} material={bannerMat}>
              <planeGeometry args={[2.2, 6.5]} />
            </mesh>
          )}
        </group>
      ))}
      {/* Gate uplights — ceremonial gold wash on the arch. */}
      <pointLight position={[-6, 2, -30]} color="#ffcf7a" intensity={4} distance={30} decay={1.7} />
      <pointLight position={[6, 2, -30]} color="#ffcf7a" intensity={4} distance={30} decay={1.7} />
    </group>
  )
})

/* ------------------------------------------------------------ 4 · Beast -- */

const YardStage = memo(function YardStage({ accent }: { accent: string }) {
  void accent
  const models = useMeshyModels([
    'arena-container-stack',
    'vehicle-box-truck',
    'street-fence-chainlink',
    'street-utility-pole',
  ])
  const strobe = useRef<THREE.PointLight>(null)
  useFrame((state) => {
    const l = strobe.current
    if (!l) return
    // Slow hazard beacon sweep — on 0.5s, off 0.7s.
    l.intensity = state.clock.elapsedTime % 1.2 < 0.5 ? 5 : 0.4
  })
  const pillarMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1c1512', roughness: 0.8, metalness: 0.3, flatShading: true }),
    [],
  )
  const hazardMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#241a10', emissive: '#ff5a3c', emissiveIntensity: 0.7, roughness: 0.6 }),
    [],
  )
  useEffect(
    () => () => {
      pillarMat.dispose()
      hazardMat.dispose()
    },
    [pillarMat, hazardMat],
  )
  const placements = useMemo(
    () => ({
      stacks: [
        { x: -28, z: -10, yaw: 0.3, scale: 1 },
        { x: 26, z: -18, yaw: 2.4, scale: 1.2 },
        { x: 18, z: 26, yaw: -0.8, scale: 0.95 },
        { x: -20, z: 25, yaw: 1.7, scale: 1.1 },
      ],
      trucks: [
        { x: -30, z: 12, yaw: 1.9, scale: 1 },
        { x: 31, z: 6, yaw: -1.2, scale: 1 },
      ],
      fence: ring(16, 25.2, 1, { skip: (i) => i % 5 === 0 }),
      poles: ring(5, 30, 1, { phase: 0.7 }),
    }),
    [],
  )
  return (
    <group>
      {models && (
        <>
          <MeshyBatch model={models['arena-container-stack']} items={placements.stacks} castShadow />
          <MeshyBatch model={models['vehicle-box-truck']} items={placements.trucks} />
          <MeshyBatch model={models['street-fence-chainlink']} items={placements.fence} />
          <MeshyBatch model={models['street-utility-pole']} items={placements.poles} />
        </>
      )}
      {/* Collapsed pillars leaning into the yard. */}
      {[[-26, 2, 0.5, 0.35], [27, -13, -0.9, -0.3], [4, 29, 1.9, 0.4], [-14, -27, 2.8, -0.35]].map(
        ([x, z, yaw, tilt], i) => (
          <mesh key={i} position={[x, 3.4, z]} rotation={[0, yaw, tilt]} material={pillarMat} castShadow>
            <boxGeometry args={[1.4, 9, 1.4]} />
          </mesh>
        ),
      )}
      {/* Hazard stripe blocks. */}
      {ring(6, 26.4, 1, { phase: 1.9 }).map((p, i) => (
        <mesh key={`hz${i}`} position={[p.x, 0.5, p.z]} rotation-y={p.yaw} material={hazardMat}>
          <boxGeometry args={[2.4, 1, 0.5]} />
        </mesh>
      ))}
      {/* Rotating hazard beacon. */}
      <pointLight ref={strobe} position={[-27, 7.5, -9]} color="#ff3c2a" intensity={5} distance={34} decay={1.7} />
    </group>
  )
})

/* ----------------------------------------------------------- 5 · Sphinx -- */

const CourtStage = memo(function CourtStage({ accent }: { accent: string }) {
  const models = useMeshyModels(['arena-sphinx-statue', 'landmark-observatory-dome', 'structure-plaza-fountain'])
  const columnMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#b8b0a4', roughness: 0.5, metalness: 0.08 }),
    [],
  )
  const goldMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8a6a2a', emissive: '#ffcf6a', emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.85 }),
    [],
  )
  const trimMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffcf6a', transparent: true, opacity: 0.5, toneMapped: false, fog: false, side: THREE.DoubleSide, depthWrite: false }),
    [],
  )
  useEffect(
    () => () => {
      columnMat.dispose()
      goldMat.dispose()
      trimMat.dispose()
    },
    [columnMat, goldMat, trimMat],
  )
  void accent
  // Colonnade wrapping the upstage 240°.
  const columns = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = Math.PI * 0.65 + (i / 13) * Math.PI * 1.7
        const r = 29
        return { x: Math.cos(a) * r, z: Math.sin(a) * r }
      }),
    [],
  )
  const placements = useMemo(
    () => ({
      sphinxes: [
        { x: -13, z: -27, yaw: 0.45, scale: 2.1 },
        { x: 13, z: -27, yaw: -0.45, scale: 2.1 },
      ],
      dome: [{ x: 0, z: -64, yaw: 0, scale: 2.6 }],
      fountain: [{ x: 0, z: 33, yaw: 0, scale: 1.3 }],
    }),
    [],
  )
  return (
    <group>
      {models && (
        <>
          <MeshyBatch model={models['arena-sphinx-statue']} items={placements.sphinxes} castShadow />
          <MeshyBatch model={models['landmark-observatory-dome']} items={placements.dome} />
          <MeshyBatch model={models['structure-plaza-fountain']} items={placements.fountain} />
        </>
      )}
      {columns.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          <mesh position={[0, 4.5, 0]} material={columnMat} castShadow>
            <cylinderGeometry args={[0.55, 0.65, 9, 14]} />
          </mesh>
          <mesh position={[0, 9.15, 0]} material={goldMat}>
            <boxGeometry args={[1.7, 0.4, 1.7]} />
          </mesh>
          <mesh position={[0, 0.25, 0]} material={goldMat}>
            <cylinderGeometry args={[0.85, 0.95, 0.5, 14]} />
          </mesh>
        </group>
      ))}
      {/* Gold trim ring just outside the boundary rail. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.045, 0]} material={trimMat}>
        <ringGeometry args={[24.6, 24.9, 96]} />
      </mesh>
      {/* Warm court uplights. */}
      <pointLight position={[-13, 3, -25]} color="#ffdf9e" intensity={3} distance={24} decay={1.7} />
      <pointLight position={[13, 3, -25]} color="#ffdf9e" intensity={3} distance={24} decay={1.7} />
    </group>
  )
})

/* -------------------------------------------------------------- switcher -- */

const STAGES = [AlleyStage, AtriumStage, QuarryStage, GateStage, YardStage, CourtStage]

export default memo(function RealmStageDressing({
  variant,
  accent,
}: {
  variant: number
  accent: string
}): JSX.Element {
  const Stage = STAGES[variant % STAGES.length]
  return <Stage accent={accent} />
})
