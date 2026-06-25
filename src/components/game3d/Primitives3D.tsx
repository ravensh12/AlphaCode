import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import {
  GROUND_HALF,
  BIOME_TINTS,
  SCENERY,
  ROADS,
  ROAD_LINES,
  ROAD_HALF_W,
  CITY_LIMIT,
  roadRoute,
  type Prop,
  type Building,
  type Vec2,
  type Landmark,
} from './layout'
import type { World } from '../../content/adventure'

/* ------------------------------------------------------------------ Ground */

export function Ground() {
  return (
    <group>
      {/* sidewalk / pavement base */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]}>
        <circleGeometry args={[GROUND_HALF * 1.35, 96]} />
        <meshStandardMaterial color="#aeb2ba" roughness={0.96} metalness={0.02} />
      </mesh>
      {/* soft district colour wash on the pavement */}
      {BIOME_TINTS.map((b, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[b.center.x, 0.02 + i * 0.004, b.center.z]}>
          <circleGeometry args={[b.radius, 48]} />
          <meshBasicMaterial color={b.color} transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------- Roads */

/** Asphalt avenues + dashed centre lines laid over the pavement. */
export function Roads() {
  const dash = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.5, 3.4)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const dashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#f2d24a', toneMapped: false }),
    [],
  )
  const dashRef = useRef<THREE.InstancedMesh>(null)

  const dashes = useMemo(() => {
    const list: { x: number; z: number; rot: number }[] = []
    for (const r of ROADS) {
      const len = r.vertical ? r.d : r.w
      const n = Math.floor(len / 8)
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + 4 + i * 8
        if (r.vertical) list.push({ x: r.x, z: t, rot: 0 })
        else list.push({ x: t, z: r.z, rot: Math.PI / 2 })
      }
    }
    return list
  }, [])

  useEffect(() => {
    const m = dashRef.current
    if (!m) return
    const d = new THREE.Object3D()
    dashes.forEach((p, i) => {
      d.position.set(p.x, 0.05, p.z)
      d.rotation.set(0, p.rot, 0)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [dashes])

  const asphaltMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2f323a', roughness: 0.86, metalness: 0.04 }),
    [],
  )
  const curbMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.9 }),
    [],
  )
  const curbGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const curbRef = useRef<THREE.InstancedMesh>(null)

  // Kerb segments live between consecutive grid lines, leaving a gap at every
  // intersection so cross-streets stay open.
  const curbs = useMemo(() => {
    const list: { x: number; z: number; sx: number; sz: number }[] = []
    const offset = ROAD_HALF_W + 0.3
    const gap = ROAD_HALF_W + 1.2
    for (const line of ROAD_LINES) {
      for (let k = 0; k < ROAD_LINES.length - 1; k++) {
        const a = ROAD_LINES[k]
        const b = ROAD_LINES[k + 1]
        const mid = (a + b) / 2
        const len = b - a - gap * 2
        if (len < 4) continue
        if (Math.hypot(line, mid) > CITY_LIMIT + 4) continue
        // vertical road at x=line → kerbs run along z
        list.push({ x: line - offset, z: mid, sx: 0.6, sz: len })
        list.push({ x: line + offset, z: mid, sx: 0.6, sz: len })
        // horizontal road at z=line → kerbs run along x
        list.push({ x: mid, z: line - offset, sx: len, sz: 0.6 })
        list.push({ x: mid, z: line + offset, sx: len, sz: 0.6 })
      }
    }
    return list
  }, [])

  useEffect(() => {
    const m = curbRef.current
    if (!m) return
    const d = new THREE.Object3D()
    curbs.forEach((c, i) => {
      d.position.set(c.x, 0, c.z)
      d.scale.set(c.sx, 0.16, c.sz)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [curbs])

  return (
    <group>
      {ROADS.map((r, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[r.x, 0.03, r.z]} receiveShadow material={asphaltMat}>
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
      <instancedMesh ref={curbRef} args={[curbGeo, curbMat, Math.max(1, curbs.length)]} receiveShadow castShadow />
      <instancedMesh ref={dashRef} args={[dash, dashMat, Math.max(1, dashes.length)]} />
    </group>
  )
}

export function PathTrail({ points }: { points: Vec2[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const { geo, mat, discs } = useMemo(() => {
    const g = new THREE.CircleGeometry(1.6, 14)
    g.rotateX(-Math.PI / 2)
    const m = new THREE.MeshStandardMaterial({ color: '#d9c08a', roughness: 0.95 })
    const list: Vec2[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const dist = Math.hypot(b.x - a.x, b.z - a.z)
      const steps = Math.max(2, Math.floor(dist / 4))
      for (let s = 0; s < steps; s++) {
        const t = s / steps
        list.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      }
    }
    return { geo: g, mat: m, discs: list }
  }, [points])

  useEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    discs.forEach((p, i) => {
      d.position.set(p.x, 0.05, p.z)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
  }, [discs])

  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, discs.length)]} receiveShadow />
}

/* -------------------------------------------------------------- Instancing */

function Instanced({
  geometry,
  material,
  items,
  shadow = true,
  palette,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  items: Prop[]
  shadow?: boolean
  palette?: string[]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((it, i) => {
      d.position.set(it.x, it.y ?? 0, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.setScalar(it.s)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      if (palette && palette.length) {
        const h = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5)
        col.set(palette[Math.floor((h % 1) * palette.length)])
        m.setColorAt(i, col)
      }
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [items, palette])
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, items.length)]}
      castShadow={shadow}
      receiveShadow={shadow}
    />
  )
}

/* ----------------------------------------------------------- City buildings */

const BUILD_COLORS = ['#d8d2c4', '#cdd3da', '#c6b9a6', '#b9c2cc', '#d9c9b0', '#c2c6cd']
const ROOF_COLORS = ['#3c414b', '#473f3a', '#42474f']

/**
 * A stylised facade tile: concrete with a grid of windows. Returns both the
 * albedo map and a matching emissive map so lit windows actually glow (and feed
 * the bloom pass) while walls stay dark.
 */
function makeFacade(): { map: THREE.Texture; emissive: THREE.Texture } {
  const W = 96
  const H = 192
  const cols = 5
  const rows = 11
  const mx = 8
  const my = 8
  const gw = (W - mx * 2) / cols
  const gh = (H - my * 2) / rows

  const albedo = document.createElement('canvas')
  albedo.width = W
  albedo.height = H
  const emap = document.createElement('canvas')
  emap.width = W
  emap.height = H
  const ac = albedo.getContext('2d')!
  const ec = emap.getContext('2d')!

  // concrete base with faint vertical banding
  ac.fillStyle = '#cfd3da'
  ac.fillRect(0, 0, W, H)
  for (let x = 0; x < W; x += 6) {
    ac.fillStyle = x % 12 === 0 ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)'
    ac.fillRect(x, 0, 3, H)
  }
  ec.fillStyle = '#000'
  ec.fillRect(0, 0, W, H)

  const litColors = ['#ffe7a0', '#fff2c8', '#bfe3ff', '#ffd9a0']
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = mx + col * gw + 1.5
      const y = my + r * gh + 1.5
      const w = gw - 3
      const h = gh - 4
      const lit = Math.random() < 0.38
      const glass = lit ? litColors[(Math.random() * litColors.length) | 0] : '#4f5a6e'
      ac.fillStyle = glass
      ac.fillRect(x, y, w, h)
      // window frame
      ac.fillStyle = 'rgba(20,26,38,0.5)'
      ac.fillRect(x, y, w, 1.5)
      ac.fillRect(x, y + h - 1.5, w, 1.5)
      if (lit) {
        ec.fillStyle = glass
        ec.fillRect(x, y, w, h)
      }
    }
  }

  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  const emissive = new THREE.CanvasTexture(emap)
  emissive.colorSpace = THREE.SRGBColorSpace
  emissive.anisotropy = 4
  return { map, emissive }
}

/** Every building drawn as two instanced meshes (body + roof cap). */
function CityBuildings({ items }: { items: Building[] }) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const roofRef = useRef<THREE.InstancedMesh>(null)
  const facade = useMemo(makeFacade, [])

  const bodyGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const roofGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const bodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: facade.map,
        emissiveMap: facade.emissive,
        emissive: new THREE.Color('#fff0cf'),
        emissiveIntensity: 0.85,
        roughness: 0.8,
        metalness: 0.05,
      }),
    [facade],
  )
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9 }), [])

  useEffect(() => {
    const b = bodyRef.current
    const rf = roofRef.current
    if (!b || !rf) return
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    items.forEach((it, i) => {
      d.position.set(it.x, 0, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(it.w, it.h, it.d)
      d.updateMatrix()
      b.setMatrixAt(i, d.matrix)
      col.set(BUILD_COLORS[it.color % BUILD_COLORS.length])
      b.setColorAt(i, col)

      d.position.set(it.x, it.h, it.z)
      d.rotation.set(0, it.r, 0)
      d.scale.set(it.w + 0.6, 0.7, it.d + 0.6)
      d.updateMatrix()
      rf.setMatrixAt(i, d.matrix)
      col.set(ROOF_COLORS[it.roof % ROOF_COLORS.length])
      rf.setColorAt(i, col)
    })
    b.instanceMatrix.needsUpdate = true
    rf.instanceMatrix.needsUpdate = true
    if (b.instanceColor) b.instanceColor.needsUpdate = true
    if (rf.instanceColor) rf.instanceColor.needsUpdate = true
    b.computeBoundingSphere()
    rf.computeBoundingSphere()
  }, [items])

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[bodyGeo, bodyMat, Math.max(1, items.length)]} castShadow receiveShadow />
      <instancedMesh ref={roofRef} args={[roofGeo, roofMat, Math.max(1, items.length)]} castShadow />
    </group>
  )
}

/** The whole city rendered as a handful of instanced draw calls. */
export function InstancedWorld() {
  const geo = useMemo(() => {
    const trunk = new THREE.CylinderGeometry(0.18, 0.26, 1.8, 6)
    trunk.translate(0, 0.9, 0)
    const canopy = new THREE.IcosahedronGeometry(1.5, 0)
    canopy.translate(0, 2.7, 0)
    const bush = new THREE.IcosahedronGeometry(0.8, 0)
    bush.translate(0, 0.5, 0)

    const lampPost = new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6)
    lampPost.translate(0, 2.1, 0)
    const lampHead = new THREE.BoxGeometry(0.5, 0.26, 0.5)
    lampHead.translate(0, 4.25, 0)

    const benchSeat = new THREE.BoxGeometry(2, 0.16, 0.6)
    benchSeat.translate(0, 0.5, 0)
    const benchBack = new THREE.BoxGeometry(2, 0.5, 0.12)
    benchBack.translate(0, 0.85, -0.24)

    const carBody = new THREE.BoxGeometry(2, 0.7, 4.2)
    carBody.translate(0, 0.55, 0)
    const carCabin = new THREE.BoxGeometry(1.8, 0.6, 2.2)
    carCabin.translate(0, 1.15, -0.1)

    const hydrant = new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8)
    hydrant.translate(0, 0.45, 0)

    // rooftop water tank (cylinder on stubby legs, sits at building height via y)
    const roofTank = new THREE.CylinderGeometry(1, 1, 1.6, 10)
    roofTank.translate(0, 1.4, 0)
    // rooftop AC / vent box
    const acBox = new THREE.BoxGeometry(1.6, 0.9, 1.6)
    acBox.translate(0, 0.45, 0)

    // traffic light: tall pole + signal head
    const tlPost = new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6)
    tlPost.translate(0, 2.7, 0)
    const tlHead = new THREE.BoxGeometry(0.42, 1.1, 0.42)
    tlHead.translate(0, 5.1, 0.25)

    // trash can
    const trash = new THREE.CylinderGeometry(0.38, 0.32, 1, 10)
    trash.translate(0, 0.5, 0)
    const trashLid = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10)
    trashLid.translate(0, 1.05, 0)

    // crosswalk stripe (flat on the road)
    const stripe = new THREE.BoxGeometry(0.55, 0.04, 4)
    stripe.translate(0, 0.05, 0)

    return {
      trunk, canopy, bush, lampPost, lampHead, benchSeat, benchBack, carBody, carCabin, hydrant,
      roofTank, acBox, tlPost, tlHead, trash, trashLid, stripe,
    }
  }, [])

  const mat = useMemo(
    () => ({
      bark: new THREE.MeshStandardMaterial({ color: '#7c5532', roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#3f9e54', flatShading: true, roughness: 0.9 }),
      bush: new THREE.MeshStandardMaterial({ color: '#4fae5a', flatShading: true, roughness: 1 }),
      lampPost: new THREE.MeshStandardMaterial({ color: '#2c2f38', roughness: 0.6, metalness: 0.3 }),
      lampHead: new THREE.MeshStandardMaterial({ color: '#ffe6a8', emissive: '#ffcf6a', emissiveIntensity: 1.4 }),
      bench: new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.9 }),
      carBody: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.3 }),
      carCabin: new THREE.MeshStandardMaterial({ color: '#9fd0ff', roughness: 0.3, metalness: 0.2, emissive: '#22344a', emissiveIntensity: 0.2 }),
      hydrant: new THREE.MeshStandardMaterial({ color: '#d23b46', roughness: 0.7 }),
      roofMetal: new THREE.MeshStandardMaterial({ color: '#9aa1ab', roughness: 0.6, metalness: 0.5 }),
      acMetal: new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.7, metalness: 0.3 }),
      tlPost: new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.6, metalness: 0.4 }),
      tlHead: new THREE.MeshStandardMaterial({ color: '#15181d', emissive: '#ffae3c', emissiveIntensity: 0.5, roughness: 0.5 }),
      trash: new THREE.MeshStandardMaterial({ color: '#2f6b46', roughness: 0.8 }),
      trashLid: new THREE.MeshStandardMaterial({ color: '#24563a', roughness: 0.7 }),
      stripe: new THREE.MeshBasicMaterial({ color: '#eef0f2', toneMapped: false }),
    }),
    [],
  )

  const CAR = ['#e8534e', '#3a86ff', '#ffd23f', '#14d39a', '#ededed', '#9b6bff']

  return (
    <group>
      <CityBuildings items={SCENERY.building} />

      <Instanced geometry={geo.trunk} material={mat.bark} items={SCENERY.tree} />
      <Instanced geometry={geo.canopy} material={mat.leaf} items={SCENERY.tree} />
      <Instanced geometry={geo.bush} material={mat.bush} items={SCENERY.planter} shadow={false} />

      <Instanced geometry={geo.benchSeat} material={mat.bench} items={SCENERY.bench} />
      <Instanced geometry={geo.benchBack} material={mat.bench} items={SCENERY.bench} />

      <Instanced geometry={geo.carBody} material={mat.carBody} items={SCENERY.car} palette={CAR} />
      <Instanced geometry={geo.carCabin} material={mat.carCabin} items={SCENERY.car} />

      <Instanced geometry={geo.hydrant} material={mat.hydrant} items={SCENERY.hydrant} />

      <Instanced geometry={geo.lampPost} material={mat.lampPost} items={SCENERY.lamp} />
      <Instanced geometry={geo.lampHead} material={mat.lampHead} items={SCENERY.lamp} shadow={false} />

      {/* rooftop clutter — read at building height via per-item y */}
      <Instanced geometry={geo.roofTank} material={mat.roofMetal} items={SCENERY.rooftop} />
      <Instanced geometry={geo.acBox} material={mat.acMetal} items={SCENERY.ac} />

      {/* intersections */}
      <Instanced geometry={geo.tlPost} material={mat.tlPost} items={SCENERY.trafficLight} />
      <Instanced geometry={geo.tlHead} material={mat.tlHead} items={SCENERY.trafficLight} shadow={false} />
      <Instanced geometry={geo.stripe} material={mat.stripe} items={SCENERY.crosswalk} shadow={false} />

      {/* trash cans */}
      <Instanced geometry={geo.trash} material={mat.trash} items={SCENERY.trashCan} />
      <Instanced geometry={geo.trashLid} material={mat.trashLid} items={SCENERY.trashCan} shadow={false} />
    </group>
  )
}

/* -------------------------------------------------------------- Checkpoints */

export type CheckpointVisual = {
  world: World
  pos: Vec2
  locked: boolean
  cleared: boolean
  active: boolean
  /** Hide the floating map label (completion is shown in the list instead). */
  hideLabel?: boolean
}

export function CheckpointPortal({ world, pos, locked, cleared, active, hideLabel }: CheckpointVisual) {
  const doorGlow = useRef<THREE.MeshStandardMaterial>(null)
  const threshold = useRef<THREE.MeshStandardMaterial>(null)
  const invite = useRef<THREE.Group>(null)
  const inviteRing = useRef<THREE.Mesh>(null)

  const accent = locked ? '#9a93c0' : world.theme.accent
  const soft = locked ? '#d8d5e0' : world.theme.accentSoft
  const plaster = locked ? '#c3bfce' : '#efe7d6'
  const roofCol = locked ? '#9b97a8' : '#b5563f'
  const warm = '#ffe6a8'

  // Entrance (front face, +Z) points toward the map center.
  const facing = Math.atan2(-pos.x, -pos.z)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (active) {
      const pulse = 0.9 + Math.sin(t * 2.6) * 0.55
      if (doorGlow.current) doorGlow.current.emissiveIntensity = Math.max(0.2, pulse)
      if (threshold.current) threshold.current.emissiveIntensity = Math.max(0.25, pulse * 0.9)
      if (invite.current) invite.current.position.y = 3.7 + Math.sin(t * 2.2) * 0.22
      if (inviteRing.current) inviteRing.current.rotation.z += 0.02
    }
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* Foundation / plinth */}
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.8, 0.5, 8.8]} />
        <meshStandardMaterial color={soft} roughness={0.95} />
      </mesh>

      {/* Walls */}
      <mesh position={[0, 3, 0]} receiveShadow castShadow>
        <boxGeometry args={[9, 5, 8]} />
        <meshStandardMaterial color={plaster} roughness={0.9} />
      </mesh>

      {/* Corner pilasters (trim accent) */}
      {[-4.4, 4.4].map((x) =>
        [-3.9, 3.9].map((z) => (
          <mesh key={`${x}_${z}`} position={[x, 3, z]} castShadow>
            <boxGeometry args={[0.5, 5.2, 0.5]} />
            <meshStandardMaterial color={accent} roughness={0.7} />
          </mesh>
        )),
      )}

      {/* Hipped roof with overhang */}
      <mesh position={[0, 6.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[7.1, 3.4, 4]} />
        <meshStandardMaterial color={roofCol} flatShading roughness={0.85} />
      </mesh>

      {/* Decorative banner over the entrance (accent) */}
      <mesh position={[0, 4.6, 4.06]}>
        <boxGeometry args={[5.2, 0.7, 0.12]} />
        <meshStandardMaterial color={accent} roughness={0.7} emissive={accent} emissiveIntensity={locked ? 0 : 0.25} />
      </mesh>

      {/* ----- Arched doorway on the front face ----- */}
      {/* Dark interior recess */}
      <mesh position={[0, 1.35, 3.55]}>
        <boxGeometry args={[1.9, 2.7, 0.9]} />
        <meshStandardMaterial color="#15171f" roughness={1} />
      </mesh>
      <mesh position={[0, 2.7, 3.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.9, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#15171f" roughness={1} />
      </mesh>

      {/* Door side trim posts */}
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 1.35, 4.02]} castShadow>
          <boxGeometry args={[0.28, 2.8, 0.28]} />
          <meshStandardMaterial
            ref={x < 0 ? doorGlow : undefined}
            color={accent}
            emissive={accent}
            emissiveIntensity={locked ? 0 : active ? 0.9 : 0.5}
            roughness={0.6}
          />
        </mesh>
      ))}
      {/* Arched trim above the door */}
      <mesh position={[0, 2.75, 4.02]}>
        <torusGeometry args={[0.95, 0.14, 8, 20, Math.PI]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={locked ? 0 : active ? 0.9 : 0.5}
          roughness={0.6}
        />
      </mesh>

      {/* Locked: bars across the doorway */}
      {locked && (
        <group>
          {[-0.55, 0, 0.55].map((x) => (
            <mesh key={x} position={[x, 1.5, 3.95]}>
              <boxGeometry args={[0.16, 2.7, 0.16]} />
              <meshStandardMaterial color="#7d788f" roughness={0.8} metalness={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {/* Warm threshold glow (only when not locked) */}
      {!locked && (
        <mesh position={[0, 0.06, 4.7]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 1.6]} />
          <meshStandardMaterial
            ref={threshold}
            color={accent}
            emissive={accent}
            emissiveIntensity={active ? 0.9 : 0.45}
            transparent
            opacity={0.55}
            roughness={1}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Front windows with a faint warm glow */}
      {[-3, 3].map((x) => (
        <mesh key={x} position={[x, 3.1, 4.02]}>
          <boxGeometry args={[1.1, 1.4, 0.12]} />
          <meshStandardMaterial
            color={locked ? '#6f6a82' : warm}
            emissive={warm}
            emissiveIntensity={locked ? 0 : 0.55}
            roughness={0.5}
          />
        </mesh>
      ))}

      {/* Active: floating ring + downward arrow inviting entry */}
      {active && (
        <group ref={invite} position={[0, 3.7, 4.4]}>
          <mesh ref={inviteRing}>
            <torusGeometry args={[0.55, 0.09, 8, 22]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} />
          </mesh>
          <mesh position={[0, -0.05, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.32, 0.55, 4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} flatShading />
          </mesh>
        </group>
      )}

      {/* Cleared: flag + checkmark on the roof */}
      {cleared && (
        <group position={[0, 8.5, 0]}>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 1.8, 6]} />
            <meshStandardMaterial color="#cfcad9" roughness={0.7} />
          </mesh>
          <mesh position={[0.7, 1.1, 0]}>
            <boxGeometry args={[1.3, 0.8, 0.06]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} roughness={0.7} />
          </mesh>
        </group>
      )}

      {!hideLabel && (
        <Html position={[0, 9.4, 0]} center distanceFactor={55} occlude={false} zIndexRange={[40, 0]}>
          <div className={`cp-label ${locked ? 'is-locked' : ''} ${active ? 'is-active' : ''}`}>
            <span className="cp-label-name">Checkpoint {world.index + 1}</span>
            <span className="cp-label-sub">
              {locked ? 'Locked' : active ? 'Enter to train' : 'Academy'}
            </span>
          </div>
        </Html>
      )}
    </group>
  )
}

export function BossTotem({ world, pos, locked, cleared, hideLabel }: Omit<CheckpointVisual, 'active'>) {
  const sigil = useRef<THREE.MeshStandardMaterial>(null)
  const eyeL = useRef<THREE.MeshStandardMaterial>(null)
  const eyeR = useRef<THREE.MeshStandardMaterial>(null)

  const red = '#ff5a5f'
  const glow = !locked
  const baseIntensity = locked ? 0 : cleared ? 0.5 : 1.6
  const stone = locked ? '#4a4756' : cleared ? '#3c3947' : '#46424f'
  const darkStone = locked ? '#3d3a47' : '#322f3a'

  // Gate (front face, +Z) faces the map center.
  const facing = Math.atan2(-pos.x, -pos.z)

  useFrame((state) => {
    if (!glow) return
    const pulse = baseIntensity + Math.sin(state.clock.elapsedTime * 3) * (cleared ? 0.15 : 0.6)
    if (sigil.current) sigil.current.emissiveIntensity = Math.max(0.1, pulse)
    if (eyeL.current) eyeL.current.emissiveIntensity = Math.max(0.1, pulse)
    if (eyeR.current) eyeR.current.emissiveIntensity = Math.max(0.1, pulse)
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* Base platform */}
      <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
        <boxGeometry args={[11, 0.8, 8]} />
        <meshStandardMaterial color={darkStone} roughness={1} flatShading />
      </mesh>

      {/* Main keep */}
      <mesh position={[0, 4, 0]} receiveShadow castShadow>
        <boxGeometry args={[8, 7, 6]} />
        <meshStandardMaterial color={stone} roughness={1} flatShading />
      </mesh>

      {/* Battlement merlons / jagged crown */}
      {[-3, -1.8, -0.6, 0.6, 1.8, 3].map((x) => (
        <mesh key={x} position={[x, 7.9, 2.6]} castShadow>
          <boxGeometry args={[0.9, 1.2, 0.9]} />
          <meshStandardMaterial color={darkStone} roughness={1} flatShading />
        </mesh>
      ))}

      {/* Flanking towers with menacing horns */}
      {[-4.4, 4.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 5, 0]} castShadow>
            <cylinderGeometry args={[1.4, 1.7, 10, 6]} />
            <meshStandardMaterial color={stone} roughness={1} flatShading />
          </mesh>
          {/* Twin horns */}
          <mesh position={[-0.6, 10.4, 0]} rotation={[0, 0, 0.35]} castShadow>
            <coneGeometry args={[0.5, 2.4, 5]} />
            <meshStandardMaterial color={darkStone} roughness={1} flatShading />
          </mesh>
          <mesh position={[0.6, 10.4, 0]} rotation={[0, 0, -0.35]} castShadow>
            <coneGeometry args={[0.5, 2.4, 5]} />
            <meshStandardMaterial color={darkStone} roughness={1} flatShading />
          </mesh>
        </group>
      ))}

      {/* Roof spikes on the keep */}
      {[-2, 0, 2].map((x) => (
        <mesh key={x} position={[x, 8.6, -1]} rotation={[0, 0, 0]} castShadow>
          <coneGeometry args={[0.55, 2, 5]} />
          <meshStandardMaterial color={darkStone} roughness={1} flatShading />
        </mesh>
      ))}

      {/* ----- Arched gate on the front face ----- */}
      <mesh position={[0, 1.9, 2.7]}>
        <boxGeometry args={[2.8, 3.8, 1.0]} />
        <meshStandardMaterial color="#0c0b10" roughness={1} />
      </mesh>
      <mesh position={[0, 3.8, 2.7]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 1.0, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#0c0b10" roughness={1} />
      </mesh>

      {/* Portcullis bars */}
      {[-1, -0.5, 0, 0.5, 1].map((x) => (
        <mesh key={`v${x}`} position={[x, 2, 3.18]}>
          <boxGeometry args={[0.14, 4, 0.14]} />
          <meshStandardMaterial color="#2a2730" roughness={0.7} metalness={0.4} />
        </mesh>
      ))}
      {[1, 2.6].map((y) => (
        <mesh key={`h${y}`} position={[0, y, 3.18]}>
          <boxGeometry args={[2.6, 0.14, 0.14]} />
          <meshStandardMaterial color="#2a2730" roughness={0.7} metalness={0.4} />
        </mesh>
      ))}

      {/* Glowing sigil above the gate */}
      <mesh position={[0, 6, 3.06]} rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[0.7, 0.13, 4, 16]} />
        <meshStandardMaterial ref={sigil} color={red} emissive={red} emissiveIntensity={baseIntensity} flatShading />
      </mesh>
      <mesh position={[0, 6, 3.0]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color={red} emissive={red} emissiveIntensity={baseIntensity} flatShading />
      </mesh>

      {/* Menacing eyes on the keep */}
      <mesh position={[-1.2, 6.6, 3.02]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial ref={eyeL} color={red} emissive={red} emissiveIntensity={baseIntensity} />
      </mesh>
      <mesh position={[1.2, 6.6, 3.02]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial ref={eyeR} color={red} emissive={red} emissiveIntensity={baseIntensity} />
      </mesh>

      {/* Cleared: cracks across the gate */}
      {cleared && (
        <mesh position={[0.3, 4, 3.04]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.12, 5, 0.06]} />
          <meshStandardMaterial color="#1c1a22" roughness={1} />
        </mesh>
      )}

      {!hideLabel && (
        <Html position={[0, 12.2, 0]} center distanceFactor={55} occlude={false} zIndexRange={[40, 0]}>
          <div className={`cp-label boss ${locked ? 'is-locked' : ''}`}>
            <span className="cp-label-name">Level {world.index + 1}</span>
            <span className="cp-label-sub">{locked ? 'Sealed' : 'Boss'}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

/** Enterable lesson-part building — solid walls, glowing doorway when active. */
export function GateBuilding({
  pos,
  color,
  levelNum,
  checkpointNum,
  active,
}: {
  pos: Vec2
  color: string
  levelNum: number
  checkpointNum: number
  active: boolean
}) {
  const doorGlow = useRef<THREE.MeshStandardMaterial>(null)
  const threshold = useRef<THREE.MeshStandardMaterial>(null)
  const invite = useRef<THREE.Group>(null)

  const accent = color
  const soft = '#e8e4f4'
  const plaster = '#f2ebe0'
  const roofCol = '#6a4a38'
  const facing = Math.atan2(-pos.x, -pos.z)

  useFrame((state) => {
    if (!active) return
    const t = state.clock.elapsedTime
    const pulse = 0.85 + Math.sin(t * 2.4) * 0.55
    if (doorGlow.current) doorGlow.current.emissiveIntensity = Math.max(0.25, pulse)
    if (threshold.current) threshold.current.emissiveIntensity = Math.max(0.2, pulse * 0.85)
    if (invite.current) invite.current.position.y = 3.2 + Math.sin(t * 2) * 0.18
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* foundation */}
      <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
        <boxGeometry args={[8.2, 0.44, 7.2]} />
        <meshStandardMaterial color={soft} roughness={0.95} />
      </mesh>

      {/* walls — solid, you can't walk through */}
      <mesh position={[0, 2.6, 0]} receiveShadow castShadow>
        <boxGeometry args={[7.6, 4.6, 6.6]} />
        <meshStandardMaterial color={plaster} roughness={0.92} />
      </mesh>

      {/* roof */}
      <mesh position={[0, 5.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[5.8, 2.6, 4]} />
        <meshStandardMaterial color={roofCol} flatShading roughness={0.88} />
      </mesh>

      {/* accent trim */}
      <mesh position={[0, 4.2, 3.35]}>
        <boxGeometry args={[4.4, 0.55, 0.12]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={active ? 0.5 : 0.2} roughness={0.65} />
      </mesh>

      {/* doorway recess */}
      <mesh position={[0, 1.25, 3.15]}>
        <boxGeometry args={[1.7, 2.5, 0.85]} />
        <meshStandardMaterial color="#12141c" roughness={1} />
      </mesh>
      <mesh position={[0, 2.45, 3.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.85, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#12141c" roughness={1} />
      </mesh>

      {/* door frame glow */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 1.25, 3.42]} castShadow>
          <boxGeometry args={[0.22, 2.5, 0.22]} />
          <meshStandardMaterial
            ref={x < 0 ? doorGlow : undefined}
            color={accent}
            emissive={accent}
            emissiveIntensity={active ? 0.9 : 0.35}
            roughness={0.55}
          />
        </mesh>
      ))}

      {/* threshold pad — stand here to enter */}
      <mesh position={[0, 0.05, 4.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 1.8]} />
        <meshStandardMaterial
          ref={threshold}
          color={accent}
          emissive={accent}
          emissiveIntensity={active ? 0.75 : 0.3}
          transparent
          opacity={0.6}
          roughness={1}
          depthWrite={false}
        />
      </mesh>

      {/* side windows */}
      {[-2.8, 2.8].map((x) => (
        <mesh key={x} position={[x, 2.8, 3.36]}>
          <boxGeometry args={[0.95, 1.2, 0.1]} />
          <meshStandardMaterial color="#ffe6a8" emissive="#ffe6a8" emissiveIntensity={active ? 0.6 : 0.35} roughness={0.5} />
        </mesh>
      ))}

      {active && (
        <group ref={invite} position={[0, 3.2, 4.0]}>
          <mesh>
            <coneGeometry args={[0.28, 0.5, 4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} flatShading />
          </mesh>
        </group>
      )}

      {active && (
        <Html position={[0, 7.4, 0]} center distanceFactor={58} occlude={false} zIndexRange={[30, 0]}>
          <div className="cp-gate-label is-current">
            Level {levelNum} · Checkpoint {checkpointNum}
          </div>
        </Html>
      )}
    </group>
  )
}

/** @deprecated Use GateBuilding — kept for reference only. */
export function CheckpointGate({
  pos,
  color,
  index,
  checkpointNum,
  status,
}: {
  pos: Vec2
  color: string
  /** Gate number along the route (1–3). */
  index: number
  /** Which lesson checkpoint this route belongs to (1–6). */
  checkpointNum: number
  status: 'passed' | 'current' | 'upcoming'
}) {
  const ring = useRef<THREE.Mesh>(null)
  const barMat = useRef<THREE.MeshStandardMaterial>(null)
  const facing = Math.atan2(-pos.x, -pos.z)
  const passed = status === 'passed'
  const current = status === 'current'
  const tint = passed ? '#46d17f' : current ? color : '#8a93a8'

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (current) {
      if (ring.current) {
        const s = 1 + (Math.sin(t * 2.2) * 0.5 + 0.5) * 0.18
        ring.current.scale.set(s, s, s)
      }
      if (barMat.current) barMat.current.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.5
    }
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* posts */}
      {[-3.2, 3.2].map((x) => (
        <mesh key={x} position={[x, 2.4, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.34, 4.8, 8]} />
          <meshStandardMaterial color={tint} emissive={tint} emissiveIntensity={passed ? 0.2 : current ? 0.8 : 0.15} roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {/* top banner */}
      <mesh position={[0, 4.9, 0]}>
        <boxGeometry args={[7.2, 0.7, 0.3]} />
        <meshStandardMaterial ref={barMat} color={tint} emissive={tint} emissiveIntensity={passed ? 0.25 : current ? 0.9 : 0.15} roughness={0.5} />
      </mesh>
      {/* ground ring to drive through */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.08, 0]}>
        <ringGeometry args={[2.6, 3.3, 32]} />
        <meshBasicMaterial color={tint} transparent opacity={passed ? 0.3 : current ? 0.7 : 0.28} side={THREE.DoubleSide} depthWrite={false} fog={false} />
      </mesh>

      <Html position={[0, 6, 0]} center distanceFactor={60} occlude={false} zIndexRange={[30, 0]}>
        <div className={`cp-gate-label ${passed ? 'is-passed' : ''} ${current ? 'is-current' : ''}`}>
          {passed ? '✓' : current ? `Checkpoint ${checkpointNum} · Gate ${index}` : `Gate ${index}`}
        </div>
      </Html>
    </group>
  )
}

export function FloorPath({
  from,
  target,
  color,
}: {
  /** Fixed leg start (spawn point). The path is stable for the whole leg. */
  from: Vec2 | null
  target: Vec2 | null
  color: string
}) {
  const COUNT = 42
  const markers = useRef<(THREE.Mesh | null)[]>([])

  // A small flat chevron pointing toward +Z (lies on the ground).
  const geo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0.55)
    shape.lineTo(-0.42, -0.1)
    shape.lineTo(-0.18, -0.1)
    shape.lineTo(0, 0.28)
    shape.lineTo(0.18, -0.1)
    shape.lineTo(0.42, -0.1)
    shape.closePath()
    const g = new THREE.ShapeGeometry(shape)
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  // Precompute each chevron's static position/heading along the road route ONCE
  // per leg (when from/target change). This avoids per-frame route maths and the
  // jittery path that came from recomputing the bend from the moving player.
  const layout = useMemo(() => {
    if (!from || !target) return null
    if (Math.hypot(target.x - from.x, target.z - from.z) < 4) return null

    const route = roadRoute(from, target)
    const segs: { x: number; z: number; nx: number; nz: number; len: number; acc: number }[] = []
    let total = 0
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i]
      const b = route[i + 1]
      const sx = b.x - a.x
      const sz = b.z - a.z
      const len = Math.hypot(sx, sz) || 0.0001
      segs.push({ x: a.x, z: a.z, nx: sx / len, nz: sz / len, len, acc: total })
      total += len
    }

    const start = 1.5
    const end = Math.max(start + 0.001, total - 1.0)
    const span = end - start
    const pts: { x: number; z: number; angle: number; f: number }[] = []
    for (let i = 0; i < COUNT; i++) {
      const f = COUNT > 1 ? i / (COUNT - 1) : 0
      const along = start + f * span
      let seg = segs[0]
      for (let s = 0; s < segs.length; s++) {
        if (along >= segs[s].acc && along <= segs[s].acc + segs[s].len) {
          seg = segs[s]
          break
        }
      }
      const local = along - seg.acc
      pts.push({
        x: seg.x + seg.nx * local,
        z: seg.z + seg.nz * local,
        angle: Math.atan2(seg.nx, seg.nz),
        f,
      })
    }
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.x, from?.z, target?.x, target?.z])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (let i = 0; i < COUNT; i++) {
      const m = markers.current[i]
      if (!m) continue
      if (!layout) {
        if (m.visible) m.visible = false
        continue
      }
      const pt = layout[i]
      m.visible = true
      m.position.set(pt.x, 0.06, pt.z)
      m.rotation.set(0, pt.angle, 0)
      // A traveling brightness wave (toward the goal) over a visible base glow.
      const wave = 0.5 + 0.5 * Math.sin(pt.f * Math.PI * 6 - t * 3)
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = 0.24 + 0.42 * wave
      m.scale.setScalar(0.8 + 0.18 * wave)
    }
  })

  return (
    <group>
      {Array.from({ length: COUNT }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            markers.current[i] = el
          }}
          geometry={geo}
          visible={false}
        >
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            depthWrite={false}
            fog={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

export function GuideBeam({ pos, color }: { pos: Vec2; color: string }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ring.current) {
      const t = (state.clock.elapsedTime % 2) / 2
      ring.current.scale.setScalar(1 + t * 3)
      const mat = ring.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.6 * (1 - t)
    }
  })
  return (
    <group position={[pos.x, 0, pos.z]}>
      <mesh position={[0, 22, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 44, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
        <ringGeometry args={[2.4, 3, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

/* --------------------------------------------------------------- Landmarks */

function Cliff() {
  const tex = useTexture('/textures/cliff_tile.png')
  useMemo(() => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
  }, [tex])
  return (
    <group>
      <mesh position={[0, 22, 0]} castShadow>
        <coneGeometry args={[26, 48, 6]} />
        <meshStandardMaterial map={tex} color="#c9c4cf" roughness={1} flatShading />
      </mesh>
      <mesh position={[14, 12, 8]} castShadow>
        <coneGeometry args={[12, 26, 6]} />
        <meshStandardMaterial map={tex} color="#bfbac8" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 45, 0]}>
        <coneGeometry args={[9, 8, 6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} flatShading />
      </mesh>
    </group>
  )
}

export function LandmarkMesh({ landmark }: { landmark: Landmark }) {
  const { type, pos, color } = landmark
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.6
  })

  return (
    <group position={[pos.x, 0, pos.z]}>
      {type === 'mountain' && <Cliff />}

      {type === 'lighthouse' && (
        <group>
          <mesh position={[0, 11, 0]} castShadow>
            <cylinderGeometry args={[2.4, 3.6, 22, 16]} />
            <meshStandardMaterial color="#f4f4f8" roughness={0.8} />
          </mesh>
          <mesh position={[0, 7, 0]}>
            <cylinderGeometry args={[2.7, 2.9, 3, 16]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 15, 0]}>
            <cylinderGeometry args={[2.7, 2.9, 3, 16]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 23.5, 0]}>
            <cylinderGeometry args={[2, 2, 3, 16]} />
            <meshStandardMaterial color="#ffe9a8" emissive="#ffd23f" emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0, 26, 0]} castShadow>
            <coneGeometry args={[2.6, 3, 16]} />
            <meshStandardMaterial color="#d23b46" roughness={0.7} />
          </mesh>
        </group>
      )}

      {type === 'spire' && (
        <group ref={spin}>
          <mesh position={[0, 16, 0]} castShadow>
            <coneGeometry args={[5, 34, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} flatShading roughness={0.3} />
          </mesh>
          <mesh position={[6, 8, 2]} rotation={[0, 0, 0.2]} castShadow>
            <coneGeometry args={[2.6, 18, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} flatShading roughness={0.3} />
          </mesh>
          <mesh position={[-6, 6, -3]} rotation={[0, 0, -0.2]} castShadow>
            <coneGeometry args={[2.2, 14, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} flatShading roughness={0.3} />
          </mesh>
        </group>
      )}

      {type === 'arch' && (
        <group>
          {[-7, 7].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 9, 0]} castShadow>
                <torusGeometry args={[7, 1.4, 10, 20, Math.PI]} />
                <meshStandardMaterial color={color} roughness={0.8} flatShading />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 1, 0]} receiveShadow>
            <boxGeometry args={[30, 2, 6]} />
            <meshStandardMaterial color="#c2b189" roughness={1} />
          </mesh>
        </group>
      )}

      {type === 'tower' && (
        <group>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 4 + i * 6, 0]} rotation={[0, i * 0.5, 0]} castShadow>
              <boxGeometry args={[8 - i * 1.1, 5.5, 8 - i * 1.1]} />
              <meshStandardMaterial color={i % 2 ? color : '#ffffff'} roughness={0.8} flatShading />
            </mesh>
          ))}
        </group>
      )}

      {type === 'windmill' && (
        <group>
          <mesh position={[0, 9, 0]} castShadow>
            <cylinderGeometry args={[2.6, 4, 18, 12]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.9} />
          </mesh>
          <mesh position={[0, 19, 0]} castShadow>
            <coneGeometry args={[4, 5, 12]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <group ref={spin} position={[0, 15, 4]}>
            {[0, 1, 2, 3].map((i) => (
              <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0, 0]} castShadow>
                <boxGeometry args={[1.4, 11, 0.4]} />
                <meshStandardMaterial color="#f4f4f8" roughness={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      )}
    </group>
  )
}
