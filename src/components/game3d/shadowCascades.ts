import * as THREE from 'three'
import { SUN_DIR } from './simulation'

/* ============================================================================
   Phase 2 — cascaded sun shadows for the overworld (pure math half).

   Design: N concentric player-following ortho boxes sharing ONE sun direction,
   each backed by its own directional light + shadow map, with the sun's total
   intensity PARTITIONED across the cascades. Where boxes overlap (the near
   field the camera actually lives in) the shares sum back to full-depth
   shadows with the crisp 2048 cascade dominating the edge; regions only the
   wide cascades cover get proportionally lighter shadows, which reads as
   shadows washing out into the haze with distance.

   Why not true depth-sliced CSM (three's addons/csm):
   - it must patch EVERY lit material via `setupMaterial` (this scene creates
     dozens of materials inline in JSX and mounts them dynamically — any missed
     material renders N× overlit),
   - `setupMaterial` overwrites `onBeforeCompile`, colliding with the Living
     Simulation patches (simulation.ts),
   - it globally mutates ShaderChunk for every canvas in the app (arenas/dojo).
   The concentric partition needs none of that: it is plain three lights, so
   it works with every material automatically, survives WebGL context loss,
   and costs the same (N depth passes + N shadow taps).

   Everything here is pure/deterministic so the split + snapping math can be
   unit-tested in Node. The component half lives in CascadedSunlight.tsx.
   ========================================================================== */

export interface CascadeSpec {
  /** Half-extent of the square ortho shadow box, meters. */
  halfExtent: number
  /** Square shadow map resolution. */
  mapSize: number
  /** Fraction of the sun's total intensity carried by this cascade (sums to 1). */
  intensityShare: number
  /** Light position distance from the follow point along SUN_DIR. */
  dist: number
  /** Shadow camera near/far along the light axis. */
  near: number
  far: number
  /** Depth bias / slope bias tuned to this cascade's texel size. */
  bias: number
  normalBias: number
  /** PCF blur radius (bigger texels need less). */
  radius: number
}

/**
 * Cascade 0 everywhere reproduces the pre-Phase-2 FollowLight exactly:
 * ±34m box, 1024 map (2048 on HIGH/ULTRA), near 16 / far 130, bias -0.0004,
 * normalBias 0.02, radius 4, light 62m out along SUN_DIR.
 */
const CASCADE_0: Omit<CascadeSpec, 'intensityShare' | 'mapSize'> = {
  halfExtent: 34,
  dist: 62,
  near: 16,
  far: 130,
  bias: -0.0004,
  normalBias: 0.02,
  radius: 4,
}

/** Derive sane light distance / clip planes for a wider follow box. */
function outerCascade(halfExtent: number): Omit<CascadeSpec, 'intensityShare' | 'mapSize'> {
  // Scale the authored cascade-0 geometry (62/34 ≈ 1.8× half-extent) and pad
  // the far plane for tall towers (~100m) entering the box edge-on.
  const dist = Math.round(halfExtent * 1.8)
  return {
    halfExtent,
    dist,
    near: Math.max(1, Math.round(dist - halfExtent * 1.15)),
    far: Math.round(dist + halfExtent * 1.3 + 60),
    bias: -0.0004,
    // Slope bias grows with texel footprint (set per tier below).
    normalBias: 0.02,
    radius: 3,
  }
}

/**
 * Cascade ladders per unified profile count:
 * - 3 (ULTRA): 2048/1024/1024 over ±34/±80/±160m — full-depth crisp near
 *   shadows, mid shadows at 58%, far silhouettes at 24%.
 * - 2 (HIGH): 2048/1024 over ±34/±110m — near 100%, distance 42%.
 * - 1 (MEDIUM/LOW): today's single 1024 ±34m map, byte-for-byte.
 */
export function cascadeSpecs(count: 1 | 2 | 3): CascadeSpec[] {
  switch (count) {
    case 3:
      return [
        { ...CASCADE_0, mapSize: 2048, intensityShare: 0.42 },
        { ...outerCascade(80), mapSize: 1024, normalBias: 0.09, intensityShare: 0.34 },
        { ...outerCascade(160), mapSize: 1024, normalBias: 0.2, radius: 2, intensityShare: 0.24 },
      ]
    case 2:
      return [
        // 1536 near / 768 mid (was 2048/1024): the depth passes cost ~half the
        // fragment + memory bandwidth. Near shadows stay crisp under the player
        // (±34m → ~0.044m/texel); the mid box is distant and softens into fog.
        { ...CASCADE_0, mapSize: 1536, intensityShare: 0.58 },
        { ...outerCascade(110), mapSize: 768, normalBias: 0.13, radius: 2, intensityShare: 0.42 },
      ]
    case 1:
    default:
      return [{ ...CASCADE_0, mapSize: 1024, intensityShare: 1 }]
  }
}

/* ------------------------------------------------------- texel snapping ---- */

// Orthonormal basis perpendicular to the (fixed) sun direction — the shadow
// camera's right/up axes. three's DirectionalLight shadow camera looks down
// SUN_DIR with +Y-ish up, but any fixed basis works for snapping as long as
// the same basis quantizes every frame.
const SNAP_RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize()
const SNAP_UP = new THREE.Vector3().crossVectors(SUN_DIR, SNAP_RIGHT).normalize()

// The follow point always lives on the ground plane (y = 0), so snapping is a
// 2×2 linear problem: (x, z) → light-plane (px, py), quantize, invert back.
// Precompute the inverse of [[R.x, R.z], [U.x, U.z]] once (R is horizontal).
const SNAP_DET = SNAP_RIGHT.x * SNAP_UP.z - SNAP_RIGHT.z * SNAP_UP.x

/**
 * Quantize a ground-plane follow point to whole shadow-map texels in light
 * space so the box translates in texel steps as the player runs — otherwise
 * every sub-texel slide re-rasterizes each shadow edge and the whole map
 * shimmers. The result stays ON the ground plane (y = 0) and is idempotent:
 * re-snapping a snapped point is a no-op. Writes into `out`, no allocation.
 */
export function snapToShadowTexel(
  x: number,
  z: number,
  spec: Pick<CascadeSpec, 'halfExtent' | 'mapSize'>,
  out: THREE.Vector3,
): THREE.Vector3 {
  const texel = (2 * spec.halfExtent) / spec.mapSize
  // Ground point → light-plane coordinates.
  const px = SNAP_RIGHT.x * x + SNAP_RIGHT.z * z
  const py = SNAP_UP.x * x + SNAP_UP.z * z
  // Quantize to the texel grid.
  const sx = Math.round(px / texel) * texel
  const sy = Math.round(py / texel) * texel
  // Back to the ground plane (invert the 2×2 map).
  out.set(
    (sx * SNAP_UP.z - sy * SNAP_RIGHT.z) / SNAP_DET,
    0,
    (sy * SNAP_RIGHT.x - sx * SNAP_UP.x) / SNAP_DET,
  )
  return out
}

/** World-space size of one texel for a cascade (used by tests + snapping). */
export function texelWorldSize(spec: Pick<CascadeSpec, 'halfExtent' | 'mapSize'>): number {
  return (2 * spec.halfExtent) / spec.mapSize
}
