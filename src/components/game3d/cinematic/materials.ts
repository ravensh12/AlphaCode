import * as THREE from 'three'

/* ============================================================================
   Reusable PBR material presets — pure parameter objects, zero assets.

   Each helper returns a plain params object you can spread straight onto the
   matching R3F material element:

     <meshPhysicalMaterial {...armorMaterial('#1b1622')} />
     <meshStandardMaterial {...moltenCore('#ff6a2a', 5)} />

   They lean on the IBL set up by <CinematicStage> (envMapIntensity) so metals
   and glass actually reflect the lightformer mood instead of reading flat.
   ========================================================================== */

/** Obsidian / brushed-metal body armour: dark, very metallic, faint clearcoat. */
export function armorMaterial(color = '#16131d'): THREE.MeshPhysicalMaterialParameters {
  return {
    color,
    metalness: 0.92,
    roughness: 0.44,
    clearcoat: 0.35,
    clearcoatRoughness: 0.55,
    envMapIntensity: 1.0,
    flatShading: false,
  }
}

/** Polished chrome for edges, trim and blades — near-perfect mirror. */
export function chromeMaterial(color = '#dfe6f2'): THREE.MeshPhysicalMaterialParameters {
  return {
    color,
    metalness: 1.0,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.25,
  }
}

/** Tinted visor / glass: physical transmission so the IBL refracts through it. */
export function glassMaterial(color = '#9fd4ff'): THREE.MeshPhysicalMaterialParameters {
  return {
    color,
    metalness: 0,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 0.6,
    ior: 1.42,
    transparent: true,
    envMapIntensity: 1.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  }
}

/**
 * Strong emissive for a cracked, glowing core. `toneMapped` stays true so the
 * value passes through ACES; pushing `intensity` well above 1 makes it clear
 * the bloom pass's luminance threshold.
 */
export function moltenCore(color: string, intensity = 4): THREE.MeshStandardMaterialParameters {
  return {
    color: '#120402',
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.6,
    metalness: 0.1,
    toneMapped: true,
  }
}

/**
 * Params for a rain-slicked reflective floor, intended to be spread onto drei's
 * <MeshReflectorMaterial>. `resolution` is the reflection render-target size —
 * callers SHOULD lower it (or drop blur) on the 'low' tier, e.g.:
 *
 *   const q = useQuality()
 *   <MeshReflectorMaterial {...wetFloorProps}
 *     resolution={q === 'low' ? 256 : wetFloorProps.resolution} />
 */
export interface WetFloorParams {
  color: string
  /** [horizontal, vertical] blur kernel for the reflection. */
  blur: [number, number]
  /** Reflection render-target resolution. Lower this on weak GPUs. */
  resolution: number
  mixBlur: number
  mixStrength: number
  roughness: number
  metalness: number
  depthScale: number
  minDepthThreshold: number
  maxDepthThreshold: number
}

export const wetFloorProps: WetFloorParams = {
  color: '#0a0b12',
  // Higher blur hides a modest reflection resolution — callers should cap the
  // reflector resolution to ~256-384 on HIGH and use a plain glossy floor below.
  blur: [600, 180],
  resolution: 384,
  mixBlur: 2.2,
  mixStrength: 22,
  roughness: 0.82,
  metalness: 0.6,
  depthScale: 1.1,
  minDepthThreshold: 0.4,
  maxDepthThreshold: 1.4,
}

/**
 * A cheap, real-time-reflection-FREE glossy floor for MED/LOW tiers. Spread onto
 * a plain <meshStandardMaterial>; it fakes wet-floor sheen with envMap (IBL)
 * reflections only — no scene re-render like MeshReflectorMaterial. Pair with a
 * tier check: use <MeshReflectorMaterial {...wetFloorProps}/> only on HIGH.
 */
export const glossyFloorProps: THREE.MeshStandardMaterialParameters = {
  color: '#0a0b12',
  roughness: 0.32,
  metalness: 0.85,
  envMapIntensity: 1.1,
}
