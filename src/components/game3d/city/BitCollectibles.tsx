import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isoWeekKey, placeBitCollectibles, type BitSpawn } from '../../../lib/cityLife'
import { bitTint, dateFromIsoWeekKey } from './bitCollectiblesCore'

/* ============================================================================
   BitCollectibles — the weekly field of glittering pocket change.

   One InstancedMesh renders every bit of the ISO week's deterministic layout
   (lib/cityLife.placeBitCollectibles); collected ids collapse to scale-zero.
   Pickups flash through a POOLED sparkle burst: a fixed pool of burst slots ×
   sparks lives in one more InstancedMesh, recycled round-robin, all ref-
   driven. The auto-collect MATH lives in bitCollectiblesCore
   (collectBitsNear + BIT_COLLECT_RADIUS) for the integration agent's
   controller loop — this component never reads input and never grants XP.
   ========================================================================== */

export interface BitCollectiblesProps {
  /** Any moment inside the ISO week to render (the weekly placement seed). */
  weekAnchor: Date
  /** Ids already collected — these render collapsed and never re-burst. */
  collected: ReadonlySet<string>
  /** Pickup sparkle bursts (tier gate for the particle pool). */
  sparkles?: boolean
}

const BURST_SLOTS = 4
const SPARKS_PER_BURST = 10
const BURST_SECONDS = 0.55
/** Bits farther than this from the camera park at zero scale (a 16cm
 *  octahedron is sub-pixel long before 140m; pickup math is untouched). */
const BIT_ACTIVE_RADIUS = 140

interface BurstSlot {
  active: boolean
  t: number
  x: number
  y: number
  z: number
}

/** Deterministic outward spark directions, shared by every burst. */
const SPARK_DIRS: readonly { x: number; y: number; z: number }[] = Array.from(
  { length: SPARKS_PER_BURST },
  (_, i) => {
    const golden = i * 2.399963229728653
    return {
      x: Math.cos(golden) * 0.85,
      y: 0.9 + (i % 3) * 0.45,
      z: Math.sin(golden) * 0.85,
    }
  },
)

export const BitCollectibles = memo(function BitCollectibles({
  weekAnchor,
  collected,
  sparkles = true,
}: BitCollectiblesProps) {
  // Recompute the field only when the ISO week actually changes: the anchor
  // collapses to its week key and back to a canonical mid-week Date, so an
  // unstable Date prop inside one week can never reshuffle the instances.
  const weekKey = isoWeekKey(weekAnchor)
  const spawns = useMemo<BitSpawn[]>(
    () => placeBitCollectibles(dateFromIsoWeekKey(weekKey)),
    [weekKey],
  )

  const assets = useMemo(() => {
    const bitGeo = new THREE.OctahedronGeometry(0.16, 0)
    const bitMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      toneMapped: false,
    })
    const sparkGeo = new THREE.OctahedronGeometry(0.05, 0)
    const sparkMat = new THREE.MeshBasicMaterial({
      color: '#ffe9a8',
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    return { bitGeo, bitMat, sparkGeo, sparkMat }
  }, [])
  useEffect(
    () => () => {
      assets.bitGeo.dispose()
      assets.bitMat.dispose()
      assets.sparkGeo.dispose()
      assets.sparkMat.dispose()
    },
    [assets],
  )

  const bitsRef = useRef<THREE.InstancedMesh>(null)
  const sparksRef = useRef<THREE.InstancedMesh>(null)

  // Per-slot collected flags + the burst pool, all refs (no per-frame state).
  const hiddenFlags = useRef<Uint8Array>(new Uint8Array(0))
  const seenIds = useRef<Set<string>>(new Set())
  const bursts = useRef<BurstSlot[]>(
    Array.from({ length: BURST_SLOTS }, () => ({
      active: false,
      t: 0,
      x: 0,
      y: 0,
      z: 0,
    })),
  )
  const nextBurst = useRef(0)
  const sparksIdle = useRef(false)
  // 1 = this bit's instance currently sits parked at zero scale (collected or
  // outside the proximity bubble) — its matrix needs no per-frame writes.
  const parkedFlags = useRef(new Uint8Array(0))

  // New week → reset flags; a fresh mount treats pre-collected bits silently.
  // (Keyed on the field only — later `collected` growth is the diff effect's
  // job, so it can burst; this one just snapshots the starting state.)
  const collectedRef = useRef(collected)
  collectedRef.current = collected
  useLayoutEffect(() => {
    hiddenFlags.current = new Uint8Array(spawns.length)
    parkedFlags.current = new Uint8Array(spawns.length)
    seenIds.current = new Set()
    spawns.forEach((spawn, i) => {
      if (collectedRef.current.has(spawn.id)) {
        hiddenFlags.current[i] = 1
        seenIds.current.add(spawn.id)
      }
    })
  }, [spawns])

  // Diff the collected set on identity change: hide newly collected bits and
  // fire a pooled burst where each one stood.
  useEffect(() => {
    spawns.forEach((spawn, i) => {
      if (!collected.has(spawn.id) || seenIds.current.has(spawn.id)) return
      seenIds.current.add(spawn.id)
      hiddenFlags.current[i] = 1
      if (!sparkles) return
      const slot = bursts.current[nextBurst.current]
      nextBurst.current = (nextBurst.current + 1) % BURST_SLOTS
      slot.active = true
      slot.t = 0
      slot.x = spawn.x
      slot.y = spawn.y
      slot.z = spawn.z
      sparksIdle.current = false
    })
  }, [collected, spawns, sparkles])

  // Per-instance tints, set once per field.
  useLayoutEffect(() => {
    const mesh = bitsRef.current
    if (!mesh) return
    const tint = new THREE.Color()
    spawns.forEach((_, i) => {
      tint.set(bitTint(i))
      mesh.setColorAt(i, tint)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [spawns])

  const scratch = useRef(new THREE.Object3D())

  useFrame((state, dtRaw) => {
    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const d = scratch.current

    const bits = bitsRef.current
    if (bits) {
      const flags = hiddenFlags.current
      const parked = parkedFlags.current
      const camX = state.camera.position.x
      const camZ = state.camera.position.z
      const r2 = BIT_ACTIVE_RADIUS * BIT_ACTIVE_RADIUS
      let wrote = false
      for (let i = 0; i < spawns.length; i++) {
        const spawn = spawns[i]
        const dx = spawn.x - camX
        const dz = spawn.z - camZ
        // Collected OR out of range: park a zero-scale matrix ONCE, then the
        // slot costs nothing per frame (pickup logic is elsewhere, untouched).
        if (flags[i] || dx * dx + dz * dz > r2) {
          if (!parked[i]) {
            parked[i] = 1
            d.position.set(spawn.x, -10, spawn.z)
            d.scale.setScalar(0.0001)
            d.rotation.set(0, 0, 0)
            d.updateMatrix()
            bits.setMatrixAt(i, d.matrix)
            wrote = true
          }
          continue
        }
        parked[i] = 0
        d.position.set(spawn.x, spawn.y + Math.sin(t * 2.4 + i * 0.61) * 0.08, spawn.z)
        d.rotation.set(0, t * 1.8 + i * 0.61, 0)
        d.scale.setScalar(1)
        d.updateMatrix()
        bits.setMatrixAt(i, d.matrix)
        wrote = true
      }
      if (wrote) bits.instanceMatrix.needsUpdate = true
    }

    const sparks = sparksRef.current
    if (sparks) {
      let anyActive = false
      for (let slot = 0; slot < BURST_SLOTS; slot++) {
        const burst = bursts.current[slot]
        if (burst.active) {
          burst.t += dt
          if (burst.t >= BURST_SECONDS) burst.active = false
          else anyActive = true
        }
        const progress = burst.active ? burst.t / BURST_SECONDS : 1
        const spread = 0.25 + progress * 1.1
        const fade = burst.active ? 1 - progress : 0
        for (let p = 0; p < SPARKS_PER_BURST; p++) {
          const dir = SPARK_DIRS[p]
          d.position.set(
            burst.x + dir.x * spread,
            burst.y + dir.y * spread - progress * progress * 0.9,
            burst.z + dir.z * spread,
          )
          d.rotation.set(0, progress * 7 + p, 0)
          d.scale.setScalar(Math.max(0.0001, fade))
          d.updateMatrix()
          sparks.setMatrixAt(slot * SPARKS_PER_BURST + p, d.matrix)
        }
      }
      // One trailing write zeroes everything, then the pool sleeps for free.
      if (anyActive || !sparksIdle.current) {
        sparks.instanceMatrix.needsUpdate = true
        sparksIdle.current = !anyActive
      }
    }
  })

  if (spawns.length === 0) return null
  return (
    <group>
      <instancedMesh
        key={spawns.length}
        ref={bitsRef}
        args={[assets.bitGeo, assets.bitMat, spawns.length]}
        frustumCulled={false}
      />
      {sparkles && (
        <instancedMesh
          ref={sparksRef}
          args={[assets.sparkGeo, assets.sparkMat, BURST_SLOTS * SPARKS_PER_BURST]}
          frustumCulled={false}
          renderOrder={2}
        />
      )}
    </group>
  )
})
