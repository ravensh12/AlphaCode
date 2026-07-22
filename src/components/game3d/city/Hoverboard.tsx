import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useMeshyModels } from '../meshy/useMeshyModels'
import {
  HOVERBOARD_BOOST_SPEED,
  HOVERBOARD_TRAIL_MIN_SPEED,
  type HoverboardPose,
} from './hoverboardCore'

/* ============================================================================
   Hoverboard — the rideable board, visuals only.

   No controller or keyboard code lives here: while mounted the integration
   agent's controller writes a HoverboardPose into `poseRef` each frame and
   this component just reads it inside useFrame (speed drives tilt, dust, and
   the pooled trail ribbon). Unmounted it idles over its pad — solid once
   unlocked, a faint hologram while still locked. The speed PROFILE the
   controller should integrate lives in hoverboardCore (cruise 15 → boost
   24 m/s, hoverboardTargetSpeed + stepHoverboardSpeed with asymmetric
   accel/brake curves) — import it from there.

   `meshyDeck` (MEDIUM+) streams the Meshy rideable hoverbike in as the deck
   visual — same board group, same HoverboardPose contract, same trail/dust
   anchors (underside glow rides along under the bike's turbine pods). LOW
   (and pre-decode, and the locked hologram) keeps the primitive deck.
   ========================================================================== */

const MESHY_BIKE_ID = 'vehicle-hoverbike'

export interface HoverboardProps {
  /** Pad position while unmounted. */
  parked: { x: number; z: number }
  parkedYaw?: number
  /** True while the hero rides — the board follows `poseRef`. */
  mounted: boolean
  /** Controller-written pose, read per frame while mounted. */
  poseRef?: MutableRefObject<HoverboardPose>
  /** False renders the locked hologram (first delivery not done yet). */
  unlocked?: boolean
  /** Trail ribbon pool (tier gate). */
  trail?: boolean
  /** Ground-dust ring (tier gate). */
  dust?: boolean
  accent?: string
  /** Stream the Meshy hoverbike as the deck visual (MEDIUM+). */
  meshyDeck?: boolean
}

const TRAIL_SEGMENTS = 28
const TRAIL_LIFE = 0.5
const TRAIL_EMIT_INTERVAL = 0.045
/** Board deck hovers this far above the pose's ground height. */
const HOVER_HEIGHT = 0.34

interface TrailSlot {
  age: number
  x: number
  y: number
  z: number
  yaw: number
}

export const Hoverboard = memo(function Hoverboard({
  parked,
  parkedYaw = 0,
  mounted,
  poseRef,
  unlocked = true,
  trail = true,
  dust = true,
  accent = '#2dd4ee',
  meshyDeck = false,
}: HoverboardProps) {
  // The locked pad shows the hologram deck regardless — only stream the bike
  // once it can actually render solid.
  const meshyModels = useMeshyModels(meshyDeck && unlocked ? [MESHY_BIKE_ID] : null)
  const bike = meshyModels?.[MESHY_BIKE_ID] ?? null
  const assets = useMemo(() => {
    const deckMat = new THREE.MeshStandardMaterial({
      color: '#1b2433',
      roughness: 0.35,
      metalness: 0.7,
    })
    const stripeMat = new THREE.MeshBasicMaterial({
      color: accent,
      toneMapped: false,
    })
    const holoMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.3,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const glowMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.32,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const dustMat = new THREE.MeshBasicMaterial({
      color: '#bcd6e6',
      transparent: true,
      opacity: 0.12,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const trailGeo = new THREE.PlaneGeometry(0.5, 1.5)
    trailGeo.rotateX(-Math.PI / 2)
    const trailMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.5,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { deckMat, stripeMat, holoMat, glowMat, dustMat, trailGeo, trailMat }
  }, [accent])
  useEffect(
    () => () => {
      assets.deckMat.dispose()
      assets.stripeMat.dispose()
      assets.holoMat.dispose()
      assets.glowMat.dispose()
      assets.dustMat.dispose()
      assets.trailGeo.dispose()
      assets.trailMat.dispose()
    },
    [assets],
  )

  const boardRef = useRef<THREE.Group>(null)
  const dustRef = useRef<THREE.Mesh>(null)
  const trailRef = useRef<THREE.InstancedMesh>(null)

  // Trail pool + motion smoothing state, all refs.
  const slots = useRef<TrailSlot[]>(
    Array.from({ length: TRAIL_SEGMENTS }, () => ({
      age: TRAIL_LIFE,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
    })),
  )
  const nextSlot = useRef(0)
  const emitTimer = useRef(0)
  const trailIdle = useRef(false)
  const lastYaw = useRef(parkedYaw)
  const roll = useRef(0)
  const scratch = useRef(new THREE.Object3D())

  useFrame((state, dtRaw) => {
    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const board = boardRef.current
    if (!board) return

    const pose = mounted ? poseRef?.current : undefined
    const speed = pose ? pose.speed : 0

    if (pose) {
      board.position.set(
        pose.x,
        pose.y + HOVER_HEIGHT + Math.sin(t * 9) * 0.02,
        pose.z,
      )
      // Lean into speed; bank with the yaw rate, softly.
      const yawRate = dt > 0 ? (pose.yaw - lastYaw.current) / dt : 0
      lastYaw.current = pose.yaw
      const wantRoll = THREE.MathUtils.clamp(yawRate * -0.28, -0.4, 0.4)
      roll.current += (wantRoll - roll.current) * Math.min(1, dt * 8)
      board.rotation.set(
        (-Math.min(speed, HOVERBOARD_BOOST_SPEED) / HOVERBOARD_BOOST_SPEED) * 0.16,
        pose.yaw,
        roll.current,
        'YXZ',
      )
    } else {
      board.position.set(
        parked.x,
        0.5 + Math.sin(t * 1.8) * 0.06,
        parked.z,
      )
      board.rotation.set(0, parkedYaw + Math.sin(t * 0.5) * 0.06, Math.sin(t * 1.1) * 0.03, 'YXZ')
      lastYaw.current = parkedYaw
      roll.current = 0
    }

    // Ground-dust ring under the deck.
    const dustMesh = dustRef.current
    if (dustMesh) {
      const dustOn = dust && unlocked
      if (dustMesh.visible !== dustOn) dustMesh.visible = dustOn
      if (dustOn) {
        dustMesh.position.set(board.position.x, 0.03, board.position.z)
        const churn = pose ? Math.min(1, speed / HOVERBOARD_BOOST_SPEED) : 0
        const s = 0.85 + churn * 0.9 + Math.sin(t * 7) * 0.05
        dustMesh.scale.set(s, s, s)
        assets.dustMat.opacity = 0.1 + churn * 0.26
      }
    }

    // Pooled trail ribbon — emitted only when genuinely fast.
    const trailMesh = trailRef.current
    if (trailMesh) {
      const emitting =
        trail && !!pose && speed >= HOVERBOARD_TRAIL_MIN_SPEED && unlocked
      if (emitting) {
        emitTimer.current += dt
        while (emitTimer.current >= TRAIL_EMIT_INTERVAL) {
          emitTimer.current -= TRAIL_EMIT_INTERVAL
          const slot = slots.current[nextSlot.current]
          nextSlot.current = (nextSlot.current + 1) % TRAIL_SEGMENTS
          slot.age = 0
          slot.x = board.position.x
          slot.y = Math.max(0.12, board.position.y - 0.18)
          slot.z = board.position.z
          slot.yaw = pose.yaw
        }
      } else {
        emitTimer.current = 0
      }

      let anyAlive = false
      const d = scratch.current
      for (let i = 0; i < TRAIL_SEGMENTS; i++) {
        const slot = slots.current[i]
        if (slot.age < TRAIL_LIFE) {
          slot.age += dt
          if (slot.age < TRAIL_LIFE) anyAlive = true
        }
        const fade = Math.max(0, 1 - slot.age / TRAIL_LIFE)
        d.position.set(slot.x, slot.y, slot.z)
        d.rotation.set(0, slot.yaw, 0)
        d.scale.set(Math.max(0.0001, fade * fade), 1, Math.max(0.0001, fade))
        d.updateMatrix()
        trailMesh.setMatrixAt(i, d.matrix)
      }
      if (anyAlive || !trailIdle.current) {
        trailMesh.instanceMatrix.needsUpdate = true
        trailIdle.current = !anyAlive
      }
    }
  })

  const solid = unlocked
  const deckMat = solid ? assets.deckMat : assets.holoMat
  const stripeMat = solid ? assets.stripeMat : assets.holoMat

  return (
    <group>
      <group ref={boardRef} position={[parked.x, 0.5, parked.z]}>
        {bike && solid ? (
          /* Meshy hoverbike (length baked onto +z, origin at rest height →
             drop it so the pods hover where the deck underside sat). */
          <mesh
            geometry={bike.geometry}
            material={bike.material}
            position={[0, -0.24, 0]}
            castShadow
          />
        ) : (
          <>
            {/* Deck + nose/tail wedges. */}
            <mesh castShadow={solid} material={deckMat}>
              <boxGeometry args={[0.62, 0.09, 1.72]} />
            </mesh>
            <mesh position={[0, 0.03, 0.95]} rotation={[0.35, 0, 0]} material={deckMat}>
              <boxGeometry args={[0.5, 0.07, 0.42]} />
            </mesh>
            <mesh position={[0, 0.03, -0.95]} rotation={[-0.35, 0, 0]} material={deckMat}>
              <boxGeometry args={[0.5, 0.07, 0.42]} />
            </mesh>
            {/* Grip stripe + hover pods. */}
            <mesh position={[0, 0.055, 0]} material={stripeMat}>
              <boxGeometry args={[0.14, 0.012, 1.5]} />
            </mesh>
            <mesh position={[0, -0.1, 0.55]} material={deckMat}>
              <cylinderGeometry args={[0.16, 0.2, 0.12, 12]} />
            </mesh>
            <mesh position={[0, -0.1, -0.55]} material={deckMat}>
              <cylinderGeometry args={[0.16, 0.2, 0.12, 12]} />
            </mesh>
          </>
        )}
        {/* Underside glow (shared by deck and bike). */}
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.17, 0]} material={assets.glowMat}>
          <planeGeometry args={[0.58, 1.6]} />
        </mesh>
      </group>

      {/* Pad marker under the parked spot. */}
      <mesh rotation-x={-Math.PI / 2} position={[parked.x, 0.015, parked.z]}>
        <ringGeometry args={[0.9, 1.12, 32]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={unlocked ? 0.3 : 0.12}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Ground-dust ring (follows the board). */}
      <mesh ref={dustRef} rotation-x={-Math.PI / 2} material={assets.dustMat} visible={false} frustumCulled={false}>
        <ringGeometry args={[0.5, 0.95, 24]} />
      </mesh>

      {/* Pooled trail ribbon. */}
      {trail && (
        <instancedMesh
          ref={trailRef}
          args={[assets.trailGeo, assets.trailMat, TRAIL_SEGMENTS]}
          frustumCulled={false}
          renderOrder={2}
        />
      )}
    </group>
  )
})
