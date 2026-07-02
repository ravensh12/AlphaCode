import { useEffect, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  SIM,
  FOG_DAY,
  FOG_NIGHT,
  FOG_NEAR_DAY,
  FOG_FAR_DAY,
  FOG_NEAR_NIGHT,
  FOG_FAR_NIGHT,
} from './simulation'
import type { QualityTier } from './cinematic/quality'

// Module-level scratch — the fog lerp endpoints never change.
const FOG_DAY_C = new THREE.Color(FOG_DAY)
const FOG_NIGHT_C = new THREE.Color(FOG_NIGHT)

/**
 * The single writer for the shared simulation uniforms. Mount ONE per canvas
 * that uses the Living Simulation shaders: it advances the clock uniform and
 * eases the day↔night "corruption" blend — every patched material reads the
 * same uniform objects, so this is the only per-frame CPU cost of the whole
 * shader suite (two float writes; zero allocations, zero setState).
 */
export function SimulationDriver({
  nightRef,
  tier = 'high',
  driveFog = false,
}: {
  /** Overworld night flag (mirrors the day/night cycle). Omit = always day. */
  nightRef?: MutableRefObject<boolean>
  /** Quality tier gate: LOW disables the hologram resolve + sky flourishes. */
  tier?: QualityTier
  /** Lerp the scene fog between the day/corruption palettes (overworld only —
   *  arenas own their fog color). */
  driveFog?: boolean
}): null {
  useEffect(() => {
    SIM.holo.value = tier === 'low' ? 0 : 1
    SIM.fx.value = tier === 'low' ? 0 : tier === 'med' ? 0.6 : 1
  }, [tier])

  useFrame((state, dt) => {
    SIM.time.value = state.clock.elapsedTime
    // Ease toward the current phase — nightfall "corrupts" the palette over a
    // couple of seconds instead of snapping. Reuses the page's night flag; no
    // second clock.
    const target = nightRef?.current ? 1 : 0
    SIM.night.value += (target - SIM.night.value) * Math.min(1, dt * 1.1)
    // M6: the scene fog rides the same corruption blend, so the fog wall, the
    // sky horizon and the shader tints always agree on what "night" looks like.
    // Distances breathe with it too: clear day haze, closing night wall.
    if (driveFog) {
      const fog = state.scene.fog
      if (fog instanceof THREE.Fog) {
        const n = SIM.night.value
        fog.color.lerpColors(FOG_DAY_C, FOG_NIGHT_C, n)
        fog.near = FOG_NEAR_DAY + (FOG_NEAR_NIGHT - FOG_NEAR_DAY) * n
        fog.far = FOG_FAR_DAY + (FOG_FAR_NIGHT - FOG_FAR_DAY) * n
      }
    }
  })
  return null
}
