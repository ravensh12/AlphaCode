import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { BeatVisual } from '../../../lib/encounterBeats'
import { RobotAvatar } from '../Avatar'
import { rotatedFootprint, setDynamicColliders, type Collider } from '../layout'
import { RescueCivilian, RescueCivilianWarmup } from './RescueCivilian'
import { Suspense } from 'react'

/* ============================================================================
   Encounter beat markers — the street-side mission events.

   One marker per beat of the current district: a glitching corrupted terminal,
   a trapped citizen inside a distress ring, or a bounty shard hovering where
   the Elite Glitch prowls. Cleared beats leave a small green "restored" pylon
   behind. The guide's current objective gets a tall light beacon so it reads
   from blocks away. All geometry/materials are shared and disposed on unmount;
   the per-frame work is a single loop over a ref registry (no React state).
   ========================================================================== */

const KIND_COLOR: Record<BeatVisual['kind'], string> = {
  terminal: '#46d6ff',
  rescue: '#ffd65c',
  bounty: '#ff5b6e',
}
const LOCKED_COLOR = '#6a7488'
const CLEARED_COLOR = '#63e58b'

type BeatAnim = {
  phase: number
  /** Locked markers stay dim — the pulse loop skips them. */
  dim: boolean
  /** Marker world position + proximity state (far markers hide + freeze). */
  x: number
  z: number
  near: boolean
  group: THREE.Group | null
  shard: THREE.Mesh | null
  ringMat: THREE.MeshBasicMaterial | null
  screenMat: THREE.MeshStandardMaterial | null
  beaconMat: THREE.MeshBasicMaterial | null
}

/** Camera range beyond which a beat marker stops rendering + animating. The
 *  objective beacon is tall, but past this the fog owns the skyline anyway. */
const BEAT_ACTIVE_RADIUS = 240

function BeatMarker({
  beat,
  shared,
  anims,
}: {
  beat: BeatVisual
  shared: ReturnType<typeof useSharedBeatAssets>
  anims: Map<string, BeatAnim>
}) {
  const anim = useMemo<BeatAnim>(
    () => ({
      phase: (beat.x * 13.37 + beat.z * 7.77) % Math.PI,
      dim: false,
      x: beat.x,
      z: beat.z,
      near: true,
      group: null,
      shard: null,
      ringMat: null,
      screenMat: null,
      beaconMat: null,
    }),
    [beat.x, beat.z],
  )
  anim.dim = beat.status === 'locked'
  useEffect(() => {
    anims.set(beat.id, anim)
    return () => {
      anims.delete(beat.id)
    }
  }, [anims, beat.id, anim])

  if (beat.status === 'cleared') {
    // Restored landmark: a small green pylon where the mission was won.
    return (
      <group
        ref={(g) => {
          anim.group = g
        }}
        position={[beat.x, 0, beat.z]}
      >
        <mesh geometry={shared.pylon} material={shared.clearedMat} position={[0, 0.55, 0]} />
        <mesh
          geometry={shared.ring}
          material={shared.clearedRingMat}
          rotation-x={-Math.PI / 2}
          position={[0, 0.04, 0]}
        />
      </group>
    )
  }

  const locked = beat.status === 'locked'
  const color = locked ? LOCKED_COLOR : KIND_COLOR[beat.kind]

  return (
    <group
      ref={(g) => {
        anim.group = g
      }}
      position={[beat.x, 0, beat.z]}
    >
      {/* ground ring — pulses on the available beat */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} geometry={shared.ring}>
        <meshBasicMaterial
          ref={(m) => {
            anim.ringMat = m
          }}
          color={color}
          transparent
          opacity={locked ? 0.18 : 0.55}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
          fog={false}
        />
      </mesh>

      {beat.kind === 'terminal' && (
        <group rotation-y={anim.phase}>
          <mesh geometry={shared.console} material={shared.consoleMat} position={[0, 0.7, 0]} castShadow />
          <mesh geometry={shared.screen} position={[0, 0.98, 0.27]}>
            <meshStandardMaterial
              ref={(m) => {
                anim.screenMat = m
              }}
              color="#0a1524"
              emissive={locked ? LOCKED_COLOR : '#46d6ff'}
              emissiveIntensity={locked ? 0.25 : 1.4}
              roughness={0.4}
              toneMapped={false}
            />
          </mesh>
        </group>
      )}

      {beat.kind === 'rescue' &&
        (beat.active ? (
          // ACTIVE rescue: a real civilian under attack — cowers while the
          // ring stands (the ring zombies lunge at them via the CombatSystem's
          // rescue theater), plays the relieved one-shot the moment the last
          // one falls. Seeded per beat, so each rescue keeps its civilian.
          // The robot stays only as the streaming fallback.
          <group rotation-y={anim.phase * 2}>
            <Suspense
              fallback={
                <group scale={0.82}>
                  <RobotAvatar anim={beat.fightPending ? 'crouch' : 'wave'} accent="#d8956b" />
                </group>
              }
            >
              <RescueCivilian beatId={beat.id} fightPending={beat.fightPending} />
            </Suspense>
            {beat.fightPending && (
              <mesh geometry={shared.cage} material={shared.cageMat} position={[0, 0.85, 0]} />
            )}
          </group>
        ) : (
          <group rotation-y={anim.phase * 2}>
            {/* far/pending rescue — the cheap huddle placeholder */}
            <mesh geometry={shared.body} material={shared.citizenMat} position={[0, 0.52, 0]} castShadow />
            <mesh geometry={shared.head} material={shared.citizenSkinMat} position={[0, 1.12, 0]} castShadow />
            {beat.fightPending && (
              <mesh geometry={shared.cage} material={shared.cageMat} position={[0, 0.85, 0]} />
            )}
          </group>
        ))}

      {beat.kind === 'bounty' && (
        <mesh
          ref={(m) => {
            anim.shard = m
          }}
          geometry={shared.shard}
          position={[0, 1.5, 0]}
        >
          <meshStandardMaterial
            color={beat.fightPending ? '#ff5b6e' : '#ffd65c'}
            emissive={beat.fightPending ? '#ff2d4d' : '#ffb52d'}
            emissiveIntensity={locked ? 0.3 : 1.6}
            roughness={0.3}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* objective beacon — the guide's current target reads across blocks */}
      {beat.active && (
        <mesh geometry={shared.beacon} position={[0, 24, 0]}>
          <meshBasicMaterial
            ref={(m) => {
              anim.beaconMat = m
            }}
            color={color}
            transparent
            opacity={0.16}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      )}
    </group>
  )
}

function useSharedBeatAssets() {
  const assets = useMemo(() => {
    const console_ = new THREE.BoxGeometry(0.9, 1.4, 0.5)
    const screen = new THREE.PlaneGeometry(0.66, 0.5)
    const ring = new THREE.RingGeometry(1.35, 1.7, 36)
    const pylon = new THREE.ConeGeometry(0.34, 1.1, 6)
    const body = new THREE.CapsuleGeometry(0.28, 0.55, 4, 10)
    const head = new THREE.SphereGeometry(0.2, 12, 12)
    const cage = new THREE.TorusGeometry(0.85, 0.05, 8, 22)
    const shard = new THREE.OctahedronGeometry(0.42, 0)
    const beacon = new THREE.CylinderGeometry(1.4, 1.4, 48, 18, 1, true)
    const consoleMat = new THREE.MeshStandardMaterial({
      color: '#1b2b3f',
      roughness: 0.55,
      metalness: 0.35,
    })
    const clearedMat = new THREE.MeshStandardMaterial({
      color: '#1e3a2a',
      emissive: CLEARED_COLOR,
      emissiveIntensity: 0.7,
      roughness: 0.5,
      toneMapped: false,
    })
    const clearedRingMat = new THREE.MeshBasicMaterial({
      color: CLEARED_COLOR,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    const citizenMat = new THREE.MeshStandardMaterial({
      color: '#d8956b',
      roughness: 0.8,
    })
    const citizenSkinMat = new THREE.MeshStandardMaterial({
      color: '#e8b48a',
      roughness: 0.7,
    })
    const cageMat = new THREE.MeshStandardMaterial({
      color: '#b6ff3a',
      emissive: '#7dff1a',
      emissiveIntensity: 1.1,
      roughness: 0.4,
      toneMapped: false,
    })
    return {
      console: console_,
      screen,
      ring,
      pylon,
      body,
      head,
      cage,
      shard,
      beacon,
      consoleMat,
      clearedMat,
      clearedRingMat,
      citizenMat,
      citizenSkinMat,
      cageMat,
    }
  }, [])
  useEffect(
    () => () => {
      for (const value of Object.values(assets)) value.dispose()
    },
    [assets],
  )
  return assets
}

export const EncounterBeatField = memo(function EncounterBeatField({
  beats,
}: {
  beats: readonly BeatVisual[]
}) {
  const shared = useSharedBeatAssets()
  const animsRef = useRef(new Map<string, BeatAnim>())

  // Solid beat props: the corrupted-terminal console (0.9×0.5 box, yawed by
  // its seeded phase) and the small restored pylon every cleared beat leaves
  // behind. Rescue civilians and floating bounty shards stay walk-through —
  // they're people / pickups, not street furniture.
  useEffect(() => {
    const colliders: Collider[] = []
    for (const beat of beats) {
      if (beat.status === 'cleared') {
        colliders.push({ x: beat.x, z: beat.z, hw: 0.34, hd: 0.34 })
      } else if (beat.kind === 'terminal') {
        const yaw = (beat.x * 13.37 + beat.z * 7.77) % Math.PI
        colliders.push(rotatedFootprint(beat.x, beat.z, 0.45, 0.25, yaw))
      }
    }
    setDynamicColliders('encounter-beats', colliders)
  }, [beats])
  useEffect(() => () => setDynamicColliders('encounter-beats', []), [])

  const tick = useRef(0)
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime
    // Re-check marker proximity every few frames; far markers hide + freeze.
    tick.current++
    const checkVis = tick.current % 8 === 0
    const cx = camera.position.x
    const cz = camera.position.z
    const r2 = BEAT_ACTIVE_RADIUS * BEAT_ACTIVE_RADIUS
    for (const anim of animsRef.current.values()) {
      if (checkVis) {
        const dx = anim.x - cx
        const dz = anim.z - cz
        anim.near = dx * dx + dz * dz <= r2
        if (anim.group && anim.group.visible !== anim.near) anim.group.visible = anim.near
      }
      if (!anim.near) continue
      const wave = Math.sin(t * 3 + anim.phase)
      if (anim.shard) {
        anim.shard.position.y = 1.5 + wave * 0.16
        anim.shard.rotation.y = t * 1.8 + anim.phase
      }
      if (anim.dim) continue // locked markers hold their dim look
      if (anim.ringMat) anim.ringMat.opacity = 0.4 + wave * 0.18
      if (anim.screenMat) {
        // Glitchy flicker: mostly lit, with stuttering dips.
        const flick = Math.sin(t * 17 + anim.phase * 5) > 0.82 ? 0.3 : 1.4
        anim.screenMat.emissiveIntensity = flick
      }
      if (anim.beaconMat) anim.beaconMat.opacity = 0.13 + (wave + 1) * 0.05
    }
  })

  return (
    <>
      {/* Boot warmer: every rescue-civilian GLB decodes behind the loading
          veil (this suspends the canvas Suspense during boot), so activating
          a rescue later never decodes mid-play. */}
      <Suspense fallback={null}>
        <RescueCivilianWarmup />
      </Suspense>
      {beats.map((beat) => (
        <BeatMarker
          key={beat.id}
          beat={beat}
          shared={shared}
          anims={animsRef.current}
        />
      ))}
    </>
  )
})
