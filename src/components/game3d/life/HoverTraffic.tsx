import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyNightFade, applyTrafficMotion } from '../simulation'
import { radialGlowTexture } from '../proceduralTextures'
import {
  TRAFFIC_ALTITUDE,
  TRAFFIC_SPAN,
  buildTrafficRoutes,
  type TrafficRoute,
} from '../trafficLanes'

/* ============================================================================
   Phase 3 — HOVER TRAFFIC. Ambient pods cruise every avenue at rooftop-
   skimming height, flying the exact ±5.2m rails the road's data-pulse shader
   paints — the packets made physical. Fully GPU-driven:

   - Instance matrices are STATIC (cross-axis position, altitude, facing);
     the vertex shader advances the along-axis coordinate off the shared SIM
     clock and wraps it across the city (applyTrafficMotion). Zero CPU/frame.
   - The pod body is one merged geometry with vertex colors (hull tinted per
     instance, dark canopy, light bar marked in uv.y); the light bar idles by
     day and flares into headlights with uSimNight.
   - A second instanced draw drops a soft additive glow pool onto the street
     under each pod — night-only via applyNightFade, composing with the same
     motion patch so it travels with its pod.

   Two draws for the whole fleet, any budget.
   ========================================================================== */

const POD_TINTS = ['#e8534e', '#3a86ff', '#ffd23f', '#14d39a', '#ededed', '#9b6bff']

/** Pod hull: capsule-ish body + canopy + skids + nose light bar (uv.y = 1). */
function buildPodGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const mark = (g: THREE.BufferGeometry, tone: [number, number, number], strip: boolean) => {
    const count = g.attributes.position.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tone[0]
      colors[i * 3 + 1] = tone[1]
      colors[i * 3 + 2] = tone[2]
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, strip ? 1 : 0)
    return g
  }
  // hull (nose toward +z)
  const hull = new THREE.BoxGeometry(1.7, 0.5, 3.2)
  hull.translate(0, 0, 0)
  parts.push(mark(hull, [1, 1, 1], false))
  const nose = new THREE.BoxGeometry(1.2, 0.34, 0.8)
  nose.translate(0, -0.02, 1.9)
  parts.push(mark(nose, [1, 1, 1], false))
  // canopy
  const canopy = new THREE.BoxGeometry(1.15, 0.4, 1.4)
  canopy.translate(0, 0.42, 0.35)
  parts.push(mark(canopy, [0.16, 0.19, 0.24], false))
  // skids
  for (const side of [-1, 1]) {
    const skid = new THREE.BoxGeometry(0.18, 0.14, 2.4)
    skid.translate(side * 0.85, -0.34, 0)
    parts.push(mark(skid, [0.22, 0.24, 0.28], false))
  }
  // light bar across the nose — uv.y = 1 marks the emissive headlight strip.
  const bar = new THREE.BoxGeometry(1.05, 0.12, 0.1)
  bar.translate(0, 0.02, 2.32)
  parts.push(mark(bar, [1, 0.97, 0.88], true))
  const merged = mergeGeometries(parts, false)!
  for (const p of parts) p.dispose()
  return merged
}

function routeAttr(routes: TrafficRoute[]): THREE.InstancedBufferAttribute {
  const arr = new Float32Array(routes.length * 4)
  routes.forEach((r, i) => {
    arr[i * 4] = r.axis
    arr[i * 4 + 1] = r.speed * r.dir
    arr[i * 4 + 2] = r.phase
    arr[i * 4 + 3] = 0
  })
  return new THREE.InstancedBufferAttribute(arr, 4)
}

export const HoverTraffic = memo(function HoverTraffic({ count }: { count: number }) {
  const routes = useMemo(() => buildTrafficRoutes(count), [count])

  const podGeo = useMemo(() => {
    const g = buildPodGeometry()
    g.setAttribute('aRoute', routeAttr(routes))
    return g
  }, [routes])
  const glowGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(2.1, 20)
    g.rotateX(-Math.PI / 2)
    g.translate(0, -TRAFFIC_ALTITUDE + 0.08, 0)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setY(i, 0)
    g.setAttribute('aRoute', routeAttr(routes))
    return g
  }, [routes])

  const podMat = useMemo(
    () =>
      applyTrafficMotion(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.34,
          metalness: 0.55,
          envMapIntensity: 1.2,
        }),
        TRAFFIC_SPAN,
        true,
      ),
    [],
  )
  const glowMat = useMemo(
    () =>
      applyNightFade(
        applyTrafficMotion(
          new THREE.MeshBasicMaterial({
            color: '#ffd9a0',
            transparent: true,
            opacity: 0.34,
            alphaMap: radialGlowTexture(),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
            toneMapped: false,
          }),
          TRAFFIC_SPAN,
        ),
      ),
    [],
  )

  const podRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const pods = podRef.current
    const glow = glowRef.current
    if (!pods || !glow) return
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    routes.forEach((r, i) => {
      const cross = r.line + r.lane
      d.position.set(r.axis === 0 ? cross : 0, TRAFFIC_ALTITUDE, r.axis === 0 ? 0 : cross)
      d.rotation.set(0, r.axis === 0 ? (r.dir > 0 ? 0 : Math.PI) : r.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0)
      d.scale.setScalar(1)
      d.updateMatrix()
      pods.setMatrixAt(i, d.matrix)
      glow.setMatrixAt(i, d.matrix)
      col.set(POD_TINTS[r.tint % POD_TINTS.length])
      pods.setColorAt(i, col)
    })
    pods.instanceMatrix.needsUpdate = true
    glow.instanceMatrix.needsUpdate = true
    if (pods.instanceColor) pods.instanceColor.needsUpdate = true
  }, [routes])

  useEffect(
    () => () => {
      podGeo.dispose()
      glowGeo.dispose()
      podMat.dispose()
      glowMat.dispose()
    },
    [podGeo, glowGeo, podMat, glowMat],
  )

  if (count <= 0) return null
  return (
    <group>
      {/* The shader slides pods along their avenue — never frustum-cull. */}
      <instancedMesh ref={podRef} args={[podGeo, podMat, routes.length]} frustumCulled={false} />
      <instancedMesh ref={glowRef} args={[glowGeo, glowMat, routes.length]} frustumCulled={false} />
    </group>
  )
})
