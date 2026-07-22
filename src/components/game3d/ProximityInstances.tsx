import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  CULL_REBUILD_STEP,
  compactInRadius,
  writeAllInstances,
  type InstancePack,
} from './proximityCulling'

/** Flag a partial GPU upload covering the first `count` floats. */
function markRange(attr: THREE.BufferAttribute | THREE.InstancedBufferAttribute, count: number) {
  attr.needsUpdate = true
  attr.updateRanges.length = 0
  // Always push a range: with none registered, three falls back to
  // re-uploading the ENTIRE capacity buffer.
  attr.addUpdateRange(0, Math.max(1, count))
}

/**
 * Drive an InstancedMesh from a precomputed {@link InstancePack}, uploading
 * only the instances inside the player bubble (`radius` around the camera).
 * With `radius` undefined the full set uploads once — identical to the old
 * mount-time useEffect path (arenas / non-overworld callers).
 *
 * Rebuilds are positional: only after the camera has moved a few meters from
 * the last rebuild point (staggered per set), so standing still — and every
 * frame in between — costs nothing.
 */
/** Global rebuild rate-limiter: at most one positional set-compaction per
 *  this many ms across ALL proximity sets. The per-set random stagger keeps
 *  sets from sharing a rebuild POINT, but while sprinting several sets can
 *  still cross their thresholds within one frame — each compaction is an
 *  O(set) rewrite + upload, and a handful together is a visible hitch. A
 *  deferred set simply retries next frame (it keeps rendering its previous
 *  compaction, which the bubble slack tolerates for a few frames). */
const REBUILD_MIN_GAP_MS = 24
let lastRebuildWallClock = 0

export function useProximityInstances(
  ref: RefObject<THREE.InstancedMesh | null>,
  pack: InstancePack,
  radius?: number,
): void {
  // Per-set stagger so dozens of sets never rebuild on the same frame.
  const step = useMemo(() => CULL_REBUILD_STEP * (0.8 + Math.random() * 0.7), [])
  const last = useRef<{ x: number; z: number; radius: number } | null>(null)
  // R3F reconstructs the InstancedMesh whenever its args change (geometry /
  // material / capacity swaps on a governor notch flip) — track identity so
  // a fresh mesh always gets primed buffers.
  const primed = useRef<{ mesh: THREE.InstancedMesh; pack: InstancePack } | null>(null)

  const prime = (m: THREE.InstancedMesh) => {
    // Per-instance color rides a manually-created attribute so the compact
    // path can rewrite it (setColorAt would lazily create it post-mount).
    // Sized to the mesh CAPACITY (instanceMatrix count), which may exceed
    // the current pack now that callers keep grow-only capacities.
    if (pack.colors && !m.instanceColor) {
      m.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(m.instanceMatrix.count * 3),
        3,
      )
    }
    if (radius !== undefined) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      m.instanceColor?.setUsage(THREE.DynamicDrawUsage)
      for (const e of pack.extras) {
        const attr = m.geometry.getAttribute(e.name) as
          | THREE.InstancedBufferAttribute
          | undefined
        attr?.setUsage(THREE.DynamicDrawUsage)
      }
      // The bubble follows the player, so a whole-mesh frustum test can only
      // produce false negatives on stale bounds — skip it. Per-instance
      // savings come from the compaction itself.
      m.frustumCulled = false
    }
    primed.current = { mesh: m, pack }
    last.current = null
  }

  const rebuild = (m: THREE.InstancedMesh, cx: number, cz: number, r?: number) => {
    const outMat = m.instanceMatrix.array as Float32Array
    const outCol = (m.instanceColor?.array as Float32Array | undefined) ?? null
    const extraAttrs = pack.extras.map((e) => {
      const attr = m.geometry.getAttribute(e.name) as THREE.InstancedBufferAttribute | undefined
      return attr ? (attr.array as Float32Array) : null
    })
    const visible =
      r === undefined
        ? writeAllInstances(pack, outMat, outCol, extraAttrs)
        : compactInRadius(pack, cx, cz, r, outMat, outCol, extraAttrs)
    m.count = visible
    // Only the compacted head of each buffer is live — upload just that
    // range instead of the full-capacity array (a lamp set is ~8k instances;
    // re-sending 512KB per rebuild per set is exactly the kind of mid-walk
    // hitch this system exists to remove).
    markRange(m.instanceMatrix, visible * 16)
    if (m.instanceColor) markRange(m.instanceColor, visible * 3)
    for (let e = 0; e < pack.extras.length; e++) {
      const attr = m.geometry.getAttribute(pack.extras[e].name) as
        | THREE.InstancedBufferAttribute
        | undefined
      if (attr) markRange(attr, visible * pack.extras[e].size)
    }
  }

  // Uncapped path: write the full set once per mesh/pack identity (no
  // per-frame work at all — matches the old mount-time useEffect behavior).
  useEffect(() => {
    if (radius !== undefined) return
    const m = ref.current
    if (!m) return
    prime(m)
    rebuild(m, 0, 0, undefined)
    m.computeBoundingSphere()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack, radius])

  useFrame(({ camera }) => {
    if (radius === undefined) return
    const m = ref.current
    if (!m) return
    const fresh =
      !primed.current || primed.current.mesh !== m || primed.current.pack !== pack
    const cx = camera.position.x
    const cz = camera.position.z
    const prev = fresh ? null : last.current
    if (prev && prev.radius === radius) {
      const dx = cx - prev.x
      const dz = cz - prev.z
      if (dx * dx + dz * dz < step * step) return
    }
    // Rate-limit: one compaction per frame across all sets (fresh packs are
    // exempt — a swapped kept-list must not render stale instances).
    const now = performance.now()
    if (!fresh && now - lastRebuildWallClock < REBUILD_MIN_GAP_MS) return
    lastRebuildWallClock = now
    if (fresh) prime(m)
    rebuild(m, cx, cz, radius)
    last.current = { x: cx, z: cz, radius }
  })
}

/**
 * Hides its subtree when the camera is farther than `radius` from (x, z).
 * Checked every few frames — far quest sites, landmarks and street objects
 * stop rendering (camera AND shadow passes) entirely.
 */
export function DistanceGate({
  x,
  z,
  radius,
  children,
}: {
  x: number
  z: number
  radius: number
  children: ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  const tick = useRef(Math.floor(Math.random() * 8))
  useFrame(({ camera }) => {
    tick.current++
    if (tick.current % 8 !== 0) return
    const g = group.current
    if (!g) return
    const dx = camera.position.x - x
    const dz = camera.position.z - z
    const on = dx * dx + dz * dz <= radius * radius
    if (g.visible !== on) g.visible = on
  })
  return <group ref={group}>{children}</group>
}
