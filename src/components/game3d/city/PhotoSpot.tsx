import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMeshyModels } from '../meshy/useMeshyModels'

/* ============================================================================
   PhotoSpot — an authored photo-spot marker framing a district landmark.

   A holo-tripod with a floating viewfinder frame, a subtle upward beam, and a
   ground ring. The frame breathes gently at rest; when `active` (the photo
   overlay is open on this spot) it pulses harder and brightens. All motion is
   ref-driven inside useFrame; materials/geometries are memoized + disposed.

   `meshyTripod` (MEDIUM+) streams the Meshy camera-on-tripod model in as the
   stand; the holo viewfinder frame, beam, and ring stay primitive (they are
   the state displays). LOW / pre-decode keeps the primitive tripod.
   ========================================================================== */

const MESHY_TRIPOD_ID = 'interact-camera-tripod'

export interface PhotoSpotProps {
  x: number
  z: number
  /** Yaw toward the landmark being framed. */
  rotationY?: number
  /** This spot is currently open in the photo overlay. */
  active?: boolean
  accent?: string
  /** Stream the Meshy camera tripod as the stand (MEDIUM+). */
  meshyTripod?: boolean
}

const FRAME_Y = 1.62
const FRAME_W = 1.15
const FRAME_H = 0.78
const BAR = 0.045

export const PhotoSpot = memo(function PhotoSpot({
  x,
  z,
  rotationY = 0,
  active = false,
  accent = '#7fd8ff',
  meshyTripod = false,
}: PhotoSpotProps) {
  const meshyModels = useMeshyModels(meshyTripod ? [MESHY_TRIPOD_ID] : null)
  const tripod = meshyModels?.[MESHY_TRIPOD_ID] ?? null
  const assets = useMemo(() => {
    const legGeo = new THREE.CylinderGeometry(0.03, 0.045, 1.32, 8)
    const legMat = new THREE.MeshStandardMaterial({
      color: '#39424f',
      roughness: 0.4,
      metalness: 0.75,
    })
    const holoMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.75,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const beamMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.1,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { legGeo, legMat, holoMat, beamMat }
  }, [accent])
  useEffect(
    () => () => {
      assets.legGeo.dispose()
      assets.legMat.dispose()
      assets.holoMat.dispose()
      assets.beamMat.dispose()
    },
    [assets],
  )

  const frameRef = useRef<THREE.Group>(null)
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const frame = frameRef.current
    if (frame) {
      // Rest: a slow breath. Active: a confident pulse + brighter holo.
      const pulse = active
        ? 1 + Math.sin(t * 4.2) * 0.07
        : 1 + Math.sin(t * 1.6) * 0.025
      frame.scale.setScalar(pulse)
      frame.position.y = FRAME_Y + Math.sin(t * 1.3) * 0.04
      assets.holoMat.opacity = active ? 0.85 + Math.sin(t * 4.2) * 0.15 : 0.55
    }
    const ring = ringMatRef.current
    if (ring) ring.opacity = active ? 0.4 + Math.sin(t * 3.1) * 0.15 : 0.2
  })

  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      {tripod ? (
        /* Meshy camera-on-tripod stand (lens toward the landmark, +z). */
        <mesh geometry={tripod.geometry} material={tripod.material} castShadow />
      ) : (
        <>
          {/* Tripod legs. */}
          {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
            <mesh
              key={angle}
              position={[Math.sin(angle) * 0.3, 0.62, Math.cos(angle) * 0.3]}
              rotation={[Math.cos(angle) * 0.42, 0, -Math.sin(angle) * 0.42]}
              geometry={assets.legGeo}
              material={assets.legMat}
              castShadow
            />
          ))}
          {/* Head unit. */}
          <mesh position={[0, 1.3, 0]} castShadow>
            <boxGeometry args={[0.3, 0.2, 0.24]} />
            <meshStandardMaterial color="#1a2130" roughness={0.45} metalness={0.6} />
          </mesh>
          <mesh position={[0, 1.3, 0.14]}>
            <cylinderGeometry args={[0.06, 0.08, 0.08, 12]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        </>
      )}

      {/* Floating viewfinder frame hologram. */}
      <group ref={frameRef} position={[0, FRAME_Y, 0]}>
        <mesh position={[0, FRAME_H / 2, 0]} material={assets.holoMat}>
          <boxGeometry args={[FRAME_W, BAR, BAR]} />
        </mesh>
        <mesh position={[0, -FRAME_H / 2, 0]} material={assets.holoMat}>
          <boxGeometry args={[FRAME_W, BAR, BAR]} />
        </mesh>
        <mesh position={[-FRAME_W / 2, 0, 0]} material={assets.holoMat}>
          <boxGeometry args={[BAR, FRAME_H + BAR, BAR]} />
        </mesh>
        <mesh position={[FRAME_W / 2, 0, 0]} material={assets.holoMat}>
          <boxGeometry args={[BAR, FRAME_H + BAR, BAR]} />
        </mesh>
        {/* Corner ticks — the classic viewfinder read. */}
        {[
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ].map(([sx, sy]) => (
          <mesh
            key={`${sx}:${sy}`}
            position={[sx * (FRAME_W / 2 - 0.09), sy * (FRAME_H / 2 - 0.07), 0.02]}
            material={assets.holoMat}
          >
            <boxGeometry args={[0.1, 0.1, 0.02]} />
          </mesh>
        ))}
      </group>

      {/* Subtle beam rising off the head. */}
      <mesh position={[0, 3.1, 0]} material={assets.beamMat}>
        <cylinderGeometry args={[0.32, 0.14, 3.4, 12, 1, true]} />
      </mesh>

      {/* Stand-here ring. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.6, 0.78, 28]} />
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
    </group>
  )
})
