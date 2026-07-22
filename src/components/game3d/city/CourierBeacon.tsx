import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM } from '../simulation'
import { useMeshyModels } from '../meshy/useMeshyModels'
import {
  DELIVERY_BURST_SECONDS,
  courierArrowYaw,
  deliveryBurstFrame,
  type Vec2Like,
} from './courierBeaconCore'

/* ============================================================================
   CourierBeacon — the delivery depot and its destination beacon.

   Depot: kiosk + parcel (the parcel hides while a run is active — the hero is
   carrying it), a ground ring whose arrowhead orients toward the destination
   (pure prop-driven yaw from courierBeaconCore), and a soft light column with
   NightOnly-style visibility. Destination: a taller accent column so the drop
   point reads across the city, plus a pooled delivery-complete burst that
   replays whenever `burstKey` increments. All motion is ref-driven.

   `meshyKit` (MEDIUM+) streams the Meshy depot kit: holo-kiosk in place of
   the post+board, the sealed parcel box on the pad (same bob group + same
   carried/hidden contract), and a courier drone loitering over the depot.
   Primitives return whenever the GLBs are absent (LOW / still streaming).
   ========================================================================== */

const MESHY_KIT_IDS = [
  'street-holo-kiosk',
  'interact-parcel-box',
  'vehicle-courier-drone',
] as const

export type BeaconColumnMode = 'always' | 'night' | 'off'

export interface CourierBeaconProps {
  /** Depot (pickup board) position. */
  depot: Vec2Like
  /** Active run's drop point; null when no delivery is under way. */
  destination?: Vec2Like | null
  /** Light-column visibility: always on, night only (NightOnly), or off. */
  columns?: BeaconColumnMode
  /** Increment to replay the delivery-complete burst (0 = never fired). */
  burstKey?: number
  /** Particle burst tier gate. */
  burst?: boolean
  accent?: string
  /** Stream the Meshy depot kit (kiosk + parcel + drone) on MEDIUM+. */
  meshyKit?: boolean
}

const SPARK_COUNT = 12

export const CourierBeacon = memo(function CourierBeacon({
  depot,
  destination = null,
  columns = 'night',
  burstKey = 0,
  burst = true,
  accent = '#ffd23f',
  meshyKit = false,
}: CourierBeaconProps) {
  const meshyModels = useMeshyModels(meshyKit ? MESHY_KIT_IDS : null)
  const kiosk = meshyModels?.['street-holo-kiosk'] ?? null
  const parcelBox = meshyModels?.['interact-parcel-box'] ?? null
  const drone = meshyModels?.['vehicle-courier-drone'] ?? null
  const assets = useMemo(() => {
    const columnGeo = new THREE.CylinderGeometry(0.9, 1.15, 7, 18, 1, true)
    const columnMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.14,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const destColumnMat = columnMat.clone()
    destColumnMat.opacity = 0.2
    const sparkGeo = new THREE.OctahedronGeometry(0.09, 0)
    const sparkMat = new THREE.MeshBasicMaterial({
      color: '#fff2c8',
      transparent: true,
      opacity: 1,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const burstRingGeo = new THREE.RingGeometry(0.86, 1, 36)
    const burstRingMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { columnGeo, columnMat, destColumnMat, sparkGeo, sparkMat, burstRingGeo, burstRingMat }
  }, [accent])
  useEffect(
    () => () => {
      assets.columnGeo.dispose()
      assets.columnMat.dispose()
      assets.destColumnMat.dispose()
      assets.sparkGeo.dispose()
      assets.sparkMat.dispose()
      assets.burstRingGeo.dispose()
      assets.burstRingMat.dispose()
    },
    [assets],
  )

  const delivering = destination != null
  const arrowYaw = useMemo(
    () => (destination ? courierArrowYaw(depot, destination) : 0),
    [depot, destination],
  )

  /* ------------------------------------------------ refs for per-frame work */
  const depotColumnRef = useRef<THREE.Mesh>(null)
  const destColumnRef = useRef<THREE.Mesh>(null)
  const arrowGroupRef = useRef<THREE.Group>(null)
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null)
  const parcelRef = useRef<THREE.Group>(null)
  const droneRef = useRef<THREE.Group>(null)

  // Delivery-complete burst state (pooled: one slot, replayed by burstKey).
  const burstState = useRef({ t: DELIVERY_BURST_SECONDS, x: 0, z: 0 })
  const seenBurstKey = useRef(burstKey)
  const burstRingRef = useRef<THREE.Mesh>(null)
  const burstSparksRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    // The ref seeds to the mount-time key, so a fresh mount with a lifetime
    // counter never replays an old burst — only observed increments fire.
    if (burstKey === seenBurstKey.current) return
    seenBurstKey.current = burstKey
    if (!burst) return
    const at = destination ?? depot
    burstState.current.t = 0
    burstState.current.x = at.x
    burstState.current.z = at.z
  }, [burstKey, burst, destination, depot])

  const scratch = useRef(new THREE.Object3D())

  useFrame((state, dtRaw) => {
    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)

    // NightOnly-style column gate: one visibility write when the blend flips.
    const columnsOn =
      columns === 'always' || (columns === 'night' && SIM.night.value > 0.02)
    const depotColumn = depotColumnRef.current
    if (depotColumn && depotColumn.visible !== columnsOn) {
      depotColumn.visible = columnsOn
    }
    const destColumn = destColumnRef.current
    if (destColumn) {
      const on = columnsOn && delivering
      if (destColumn.visible !== on) destColumn.visible = on
    }

    // Arrow ring: gentle spin-in-place pulse; yaw itself is prop-derived.
    const arrow = arrowGroupRef.current
    if (arrow) arrow.position.y = 0.05 + Math.sin(t * 2.2) * 0.02
    const ringMat = ringMatRef.current
    if (ringMat) {
      ringMat.opacity = delivering ? 0.4 + Math.sin(t * 3) * 0.15 : 0.2
    }

    // Parcel idles on the pad between runs.
    const parcel = parcelRef.current
    if (parcel) parcel.position.y = 0.62 + Math.sin(t * 1.7) * 0.05

    // Courier drone loiters in a lazy circle over the depot kiosk.
    const droneGroup = droneRef.current
    if (droneGroup) {
      droneGroup.position.set(
        Math.sin(t * 0.5) * 1.1,
        3.1 + Math.sin(t * 1.4) * 0.16,
        Math.cos(t * 0.5) * 1.1,
      )
      droneGroup.rotation.y = t * 0.5 + Math.PI / 2
    }

    // Delivery-complete burst.
    const burstT = burstState.current
    if (burstT.t < DELIVERY_BURST_SECONDS) {
      burstT.t += dt
      const frame = deliveryBurstFrame(burstT.t / DELIVERY_BURST_SECONDS)
      const ring = burstRingRef.current
      if (ring) {
        ring.position.set(burstT.x, 0.06, burstT.z)
        ring.scale.setScalar(frame.ring)
        assets.burstRingMat.opacity = frame.opacity * 0.9
      }
      const sparks = burstSparksRef.current
      if (sparks) {
        const d = scratch.current
        for (let i = 0; i < SPARK_COUNT; i++) {
          const angle = (i / SPARK_COUNT) * Math.PI * 2
          d.position.set(
            burstT.x + Math.cos(angle) * frame.ring * 0.4,
            0.3 + frame.rise * (0.6 + (i % 3) * 0.2),
            burstT.z + Math.sin(angle) * frame.ring * 0.4,
          )
          d.rotation.set(0, angle + t * 4, 0)
          d.scale.setScalar(Math.max(0.0001, frame.opacity))
          d.updateMatrix()
          sparks.setMatrixAt(i, d.matrix)
        }
        sparks.instanceMatrix.needsUpdate = true
      }
    } else if (assets.burstRingMat.opacity !== 0) {
      assets.burstRingMat.opacity = 0
    }
  })

  return (
    <group>
      {/* ------------------------------------------------------------ depot */}
      <group position={[depot.x, 0, depot.z]}>
        {kiosk ? (
          /* Meshy holo-kiosk as the depot booth. */
          <mesh
            geometry={kiosk.geometry}
            material={kiosk.material}
            position={[0, 0, -0.5]}
            castShadow
          />
        ) : (
          <>
            {/* Kiosk: post + board canopy. */}
            <mesh position={[0, 1.1, -0.5]} castShadow>
              <boxGeometry args={[0.16, 2.2, 0.16]} />
              <meshStandardMaterial color="#39424f" roughness={0.4} metalness={0.7} />
            </mesh>
            <mesh position={[0, 1.9, -0.42]} rotation={[-0.14, 0, 0]} castShadow>
              <boxGeometry args={[1.7, 0.95, 0.1]} />
              <meshStandardMaterial
                color="#141b28"
                emissive={accent}
                emissiveIntensity={0.35}
                roughness={0.5}
              />
            </mesh>
          </>
        )}
        {/* Parcel on the pad — carried (hidden) while a run is active. */}
        <group ref={parcelRef} position={[0, 0.62, 0.35]} visible={!delivering}>
          {parcelBox ? (
            /* Meshy sealed parcel (beacon puck baked in), centred on the bob. */
            <mesh
              geometry={parcelBox.geometry}
              material={parcelBox.material}
              position={[0, -0.25, 0]}
              castShadow
            />
          ) : (
            <>
              <mesh castShadow>
                <boxGeometry args={[0.55, 0.42, 0.55]} />
                <meshStandardMaterial color="#c9a15f" roughness={0.75} metalness={0.05} />
              </mesh>
              <mesh>
                <boxGeometry args={[0.57, 0.1, 0.57]} />
                <meshStandardMaterial
                  color={accent}
                  emissive={accent}
                  emissiveIntensity={0.5}
                  roughness={0.4}
                />
              </mesh>
            </>
          )}
        </group>
        {/* Courier drone loitering over the depot (Meshy kit only). */}
        {drone && (
          <group ref={droneRef} position={[0, 3.1, 0]}>
            <mesh geometry={drone.geometry} material={drone.material} />
          </group>
        )}
        {/* Destination arrow ring (prop-driven yaw). */}
        <group ref={arrowGroupRef} rotation={[0, arrowYaw, 0]}>
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[1.2, 1.42, 40]} />
            <meshBasicMaterial
              ref={ringMatRef}
              color={accent}
              transparent
              opacity={0.2}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          {delivering && (
            <mesh position={[0, 0.06, 1.62]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.24, 0.6, 4]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          )}
        </group>
        {/* Soft depot light column (NightOnly-style gate in useFrame). */}
        <mesh
          ref={depotColumnRef}
          position={[0, 3.5, 0]}
          material={assets.columnMat}
          geometry={assets.columnGeo}
          visible={false}
        />
      </group>

      {/* ------------------------------------------------------ destination */}
      {destination && (
        <group position={[destination.x, 0, destination.z]}>
          <mesh
            ref={destColumnRef}
            position={[0, 3.5, 0]}
            material={assets.destColumnMat}
            geometry={assets.columnGeo}
            visible={false}
          />
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
            <ringGeometry args={[1.5, 1.8, 40]} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={0.45}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}

      {/* --------------------------------------- delivery-complete burst */}
      {burst && (
        <>
          <mesh
            ref={burstRingRef}
            rotation-x={-Math.PI / 2}
            geometry={assets.burstRingGeo}
            material={assets.burstRingMat}
            frustumCulled={false}
          />
          <instancedMesh
            ref={burstSparksRef}
            args={[assets.sparkGeo, assets.sparkMat, SPARK_COUNT]}
            frustumCulled={false}
            renderOrder={2}
          />
        </>
      )}
    </group>
  )
})
