import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { genTowers, makeTowerMaps } from './nightTowerMaps'

/* ============================================================================
   Night-city staging shared by the boss arenas (BossArena, CinematicBossArena,
   ArchitectArena) — the same premium neon-NYC-at-night mood as the overworld:
   an instanced skyline of lit-window towers receding into fog, and a light
   instanced rain layer that recycles around the camera.

   Local to the boss surfaces on purpose: the overworld's city/** modules are
   owned by sibling agents, so these helpers copy the LOOK (dense warm/cool
   office windows, dark glass) without touching their code.
   ========================================================================== */

/** Instanced skyline ring — lit towers receding into the night fog on every
 *  side, so an arena reads as a plaza INSIDE the city, not a void.
 *  `innerRadius` keeps the nearest block outside the play area; `baseY` lets
 *  rooftop arenas sink the blocks below the deck. */
export const NightSkyline = memo(function NightSkyline({
  count,
  innerRadius = 58,
  baseY = -0.5,
}: {
  count: number
  innerRadius?: number
  baseY?: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const maps = useMemo(makeTowerMaps, [])
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3a4257',
        map: maps.map,
        emissiveMap: maps.emissive,
        emissive: '#ffffff',
        emissiveIntensity: 0.8,
        roughness: 0.68,
        metalness: 0.25,
      }),
    [maps],
  )
  const towers = useMemo(() => genTowers(count, innerRadius), [count, innerRadius])
  useEffect(() => {
    const m = meshRef.current
    if (!m) return
    const d = new THREE.Object3D()
    for (let i = 0; i < towers.length; i++) {
      const t = towers[i]
      d.position.set(t.x, t.h / 2 + baseY, t.z)
      d.scale.set(t.w, t.h, t.d)
      d.rotation.set(0, (i * 0.61) % Math.PI, 0)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.count = towers.length
    m.instanceMatrix.needsUpdate = true
  }, [towers, baseY])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      maps.map.dispose()
      maps.emissive.dispose()
    },
    [geo, mat, maps],
  )
  return <instancedMesh ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />
})

/** Light instanced rain — sells the wet-asphalt look; recycles around the
 *  camera (Architect-rooftop pattern, calmer density). */
export const NightRain = memo(function NightRain({ count }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const drops = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * 76,
        y: Math.random() * 34,
        z: (Math.random() - 0.5) * 76,
        v: 30 + Math.random() * 20,
      })),
    [count],
  )
  const geo = useMemo(() => new THREE.BoxGeometry(0.018, 0.8, 0.018), [])
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#9fb2d8', transparent: true, opacity: 0.28, toneMapped: false, fog: false }),
    [],
  )
  const dummy = useRef(new THREE.Object3D())
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])
  useFrame((state, dtRaw) => {
    const m = meshRef.current
    if (!m) return
    const dt = Math.min(dtRaw, 0.05)
    const cam = state.camera
    const d = dummy.current
    for (let i = 0; i < drops.length; i++) {
      const dr = drops[i]
      dr.y -= dr.v * dt
      if (dr.y < 0) {
        dr.y = 34
        dr.x = cam.position.x + (Math.random() - 0.5) * 76
        dr.z = cam.position.z + (Math.random() - 0.5) * 76
      }
      d.position.set(dr.x, dr.y, dr.z)
      d.rotation.set(0.08, 0, 0.03)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={meshRef} args={[geo, mat, count]} frustumCulled={false} />
})
