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
  FOG_CLEAR_NEAR_DAY,
  FOG_CLEAR_FAR_DAY,
  FOG_CLEAR_NEAR_NIGHT,
  FOG_CLEAR_FAR_NIGHT,
} from './simulation'
import { CHECKPOINTS_3D } from './layout'
import { districtIndexAt } from './districtTheme'
import { easeRain } from './weather/weatherCore'
import type { QualityTier } from './cinematic/quality'

// Module-level scratch — the fog lerp endpoints never change.
const FOG_DAY_C = new THREE.Color(FOG_DAY)
const FOG_NIGHT_C = new THREE.Color(FOG_NIGHT)
// Deep-night (horde) corruption fog: the EXACT transform the sky dome applies
// to its below-horizon band (hor * (1.5, .55, 1.05) + (.022, .002, .016), in
// the linear working space), so sky and fog never split at the horizon.
const FOG_DEEP_C = new THREE.Color(FOG_NIGHT)
  .multiply(new THREE.Color().setRGB(1.5, 0.55, 1.05))
  .add(new THREE.Color().setRGB(0.022, 0.002, 0.016))
// District accent colors for the (subtle) local fog tint on clear-air tiers.
const DISTRICT_FOG_C = CHECKPOINTS_3D.map((c) => new THREE.Color(c.world.theme.accent))
const _fogTint = new THREE.Color()

/**
 * The single writer for the shared simulation uniforms. Mount ONE per canvas
 * that uses the Living Simulation shaders: it advances the clock uniform and
 * eases the day↔night "corruption" blend — every patched material reads the
 * same uniform objects, so this is the only per-frame CPU cost of the whole
 * shader suite (two float writes; zero allocations, zero setState).
 */
export function SimulationDriver({
  nightRef,
  rainTargetRef,
  tier = 'high',
  driveFog = false,
  clearAir = false,
  playerPosRef,
  fogFarCap,
  nightFloor = 0,
}: {
  /** Overworld night flag (mirrors the day/night cycle). Omit = always day. */
  nightRef?: MutableRefObject<boolean>
  /** Weather front target (0..1) from the scheduler. Omit = always dry. */
  rainTargetRef?: MutableRefObject<number>
  /** Quality tier gate: LOW disables the hologram resolve + sky flourishes. */
  tier?: QualityTier
  /** Lerp the scene fog between the day/corruption palettes (overworld only —
   *  arenas own their fog color). */
  driveFog?: boolean
  /** Realism rebuild: MEDIUM+ profiles run the clear-air fog distances (the
   *  skyline reads to the horizon). LOW keeps the legacy wall — pinned look.
   *  Driven by the PROFILE tier, never the adaptive sim tier, so dpr dips
   *  don't pop the fog wall in and out. */
  clearAir?: boolean
  /** Player position for the subtle district fog tint (clear-air only). */
  playerPosRef?: MutableRefObject<THREE.Vector3>
  /** Proximity-cull bubble radius: the fog far-plane never exceeds it, so
   *  the cull boundary always hides behind full fog (reads as atmosphere). */
  fogFarCap?: number
  /** NYC-at-night ambient floor (overworld passes NIGHT_AMBIENT_FLOOR): the
   *  calm gameplay phase idles at this blend instead of full daylight, so the
   *  world always reads as a neon night city. Arenas/cinematics keep 0. */
  nightFloor?: number
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
    const target = nightRef?.current ? 1 : nightFloor
    SIM.night.value += (target - SIM.night.value) * Math.min(1, dt * 1.1)
    // Phase 2: rain fronts roll in / clear out over ~6s (easeRain is the
    // tested pure twin of this update — keep the two in sync).
    SIM.rain.value = easeRain(SIM.rain.value, rainTargetRef?.current ?? 0, dt)
    // M6: the scene fog rides the same corruption blend, so the fog wall, the
    // sky horizon and the shader tints always agree on what "night" looks like.
    // Distances breathe with it too: clear day haze, closing night wall.
    if (driveFog) {
      const fog = state.scene.fog
      if (fog instanceof THREE.Fog) {
        const n = SIM.night.value
        const r = SIM.rain.value
        // The fog palette rides the same remapped blend as the sky dome
        // (floor counts as full night), so the horizon seam never shows.
        const nf = THREE.MathUtils.smoothstep(n, 0, 0.6)
        fog.color.lerpColors(FOG_DAY_C, FOG_NIGHT_C, nf)
        // Horde-night corruption tint (matches the sky's deep-night shift).
        const deep = THREE.MathUtils.smoothstep(n, 0.78, 1)
        if (deep > 0) fog.color.lerp(FOG_DEEP_C, deep * 0.6)
        if (clearAir && playerPosRef) {
          // Whisper of the local district accent in the air — enough to feel
          // the neighborhoods change, never enough to re-soup the scene. The
          // night fog is nearly black, so the same absolute lerp that read as
          // 3% by day dominated its hue — scale the whisper down with night.
          const p = playerPosRef.current
          _fogTint.copy(DISTRICT_FOG_C[districtIndexAt(p.x, p.z)])
          fog.color.lerp(_fogTint, 0.03 * (1 - nf * 0.65))
        }
        // Rain closes the fog wall in a little — storms read as thick air.
        const rainPull = 1 - r * 0.22
        const nearDay = clearAir ? FOG_CLEAR_NEAR_DAY : FOG_NEAR_DAY
        const farDay = clearAir ? FOG_CLEAR_FAR_DAY : FOG_FAR_DAY
        const nearNight = clearAir ? FOG_CLEAR_NEAR_NIGHT : FOG_NEAR_NIGHT
        const farNight = clearAir ? FOG_CLEAR_FAR_NIGHT : FOG_FAR_NIGHT
        let near = (nearDay + (nearNight - nearDay) * nf) * rainPull
        let far = (farDay + (farNight - farDay) * nf) * rainPull
        if (fogFarCap !== undefined && far > fogFarCap) {
          // Compress the fog band into the cull bubble, preserving the
          // near/far ratio so the gradient keeps its character.
          near *= fogFarCap / far
          far = fogFarCap
        }
        fog.near = near
        fog.far = far
      }
    }
  })
  return null
}
