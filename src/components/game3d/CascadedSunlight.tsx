import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM, SUN_DIR } from './simulation'
import { cascadeSpecs, snapToShadowTexel, type CascadeSpec } from './shadowCascades'

/* ============================================================================
   Phase 2 — CascadedSunlight: the overworld's sun/moon key light, now a
   1–3 cascade ladder of player-following shadow boxes (see shadowCascades.ts
   for the partition scheme + why not three's addons CSM). With one cascade
   this reproduces the pre-Phase-2 FollowLight exactly.

   Per frame, per cascade: snap the follow point to whole shadow texels (kills
   edge shimmer while running), place light + target, and ride the shared
   day/night blend for color/intensity. Lightning (SIM.flash, written by the
   weather system) momentarily re-colors and boosts every cascade — the bloom
   pass picks the pulse up for free. Zero allocations on the hot path.
   ========================================================================== */

// Sun color across the corruption blend: warm daylight → cold moonlight.
const SUN_DAY = new THREE.Color('#ffe6b8')
const SUN_NIGHT = new THREE.Color('#8fa5e8')
// Lightning spectrum — pale blue-white strike light.
const FLASH_COLOR = new THREE.Color('#dfe9ff')

// Total sun intensity envelope (pre-Phase-2 values, partitioned per cascade).
const SUN_INTENSITY_DAY = 2.3
const SUN_INTENSITY_NIGHT_DROP = 1.65
// Realism rebuild (MEDIUM+): a hotter key light for crisp, defined daytime
// shadows, and a slightly stronger moon so night geometry keeps its form.
const SUN_INTENSITY_DAY_CRISP = 2.6
const SUN_INTENSITY_NIGHT_DROP_CRISP = 1.78
/** Extra light a full lightning flash adds on top of the sun total. */
const FLASH_INTENSITY = 2.6

const _snap = new THREE.Vector3()

/** Clamp a scaled shadow-map edge to sane powers-friendly bounds. */
function scaledMapSize(base: number, scale: number): number {
  return Math.max(256, Math.round((base * scale) / 2) * 2)
}

function CascadeLight({
  spec,
  playerPosRef,
  crisp = false,
  nearHordeShadows = false,
  mapScale = 1,
}: {
  spec: CascadeSpec
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  crisp?: boolean
  /** Cascade 0 only: include the horde's shadow layer (see ZombieHorde). */
  nearHordeShadows?: boolean
  /** Live shadow-map resolution multiplier (the governor's recompile-free
   *  heavy-GPU lever — resizing the target never changes the light count). */
  mapScale?: number
}) {
  const light = useRef<THREE.DirectionalLight>(null)

  useEffect(() => {
    const l = light.current
    if (!l) return
    // Outer cascades are tagged so heavy skinned casters (the horde) can
    // skip their depth passes via onBeforeShadow — see ZombieHorde.
    l.shadow.camera.userData.outerCascade = !nearHordeShadows
  }, [nearHordeShadows])

  // Live-resize the shadow render target when the governor changes the scale.
  // The light count is untouched, so no lit shader recompiles; three simply
  // reallocates the depth map at the new resolution on the next shadow pass.
  useEffect(() => {
    const l = light.current
    if (!l) return
    const size = scaledMapSize(spec.mapSize, mapScale)
    if (l.shadow.mapSize.width === size) return
    l.shadow.mapSize.set(size, size)
    if (l.shadow.map) {
      l.shadow.map.dispose()
      l.shadow.map = null as unknown as THREE.WebGLRenderTarget
    }
    l.shadow.needsUpdate = true
  }, [spec.mapSize, mapScale])

  useFrame(() => {
    const l = light.current
    if (!l) return
    const p = playerPosRef.current
    snapToShadowTexel(p.x, p.z, spec, _snap)
    l.position.set(
      _snap.x + SUN_DIR.x * spec.dist,
      _snap.y + SUN_DIR.y * spec.dist,
      _snap.z + SUN_DIR.z * spec.dist,
    )
    l.target.position.copy(_snap)
    l.target.updateMatrixWorld()
    // Nightfall (M6): the key light cools and dims into moonlight with the
    // shared blend; a lightning flash briefly overrides both.
    const n = SIM.night.value
    const flash = SIM.flash.value
    l.color.lerpColors(SUN_DAY, SUN_NIGHT, n)
    if (flash > 0.01) l.color.lerp(FLASH_COLOR, Math.min(1, flash))
    // Rain dims the direct sun a touch (overcast), never below moonlight.
    const overcast = 1 - SIM.rain.value * 0.35 * (1 - n)
    const day = crisp ? SUN_INTENSITY_DAY_CRISP : SUN_INTENSITY_DAY
    const drop = crisp ? SUN_INTENSITY_NIGHT_DROP_CRISP : SUN_INTENSITY_NIGHT_DROP
    l.intensity =
      (day - n * drop) * overcast * spec.intensityShare +
      flash * FLASH_INTENSITY * spec.intensityShare
  })

  return (
    <directionalLight
      ref={light}
      intensity={SUN_INTENSITY_DAY * spec.intensityShare}
      color="#ffe6b8"
      castShadow
      shadow-mapSize-width={scaledMapSize(spec.mapSize, mapScale)}
      shadow-mapSize-height={scaledMapSize(spec.mapSize, mapScale)}
      shadow-radius={spec.radius}
      shadow-camera-left={-spec.halfExtent}
      shadow-camera-right={spec.halfExtent}
      shadow-camera-top={spec.halfExtent}
      shadow-camera-bottom={-spec.halfExtent}
      shadow-camera-near={spec.near}
      shadow-camera-far={spec.far}
      shadow-bias={spec.bias}
      shadow-normalBias={spec.normalBias}
    />
  )
}

/**
 * Mount ONE per overworld canvas. `cascades` comes from the unified quality
 * profile and is fixed for the life of the canvas (changing it re-mounts the
 * lights and recompiles lit shaders — that's a tier change, which already
 * remounts the page).
 */
export const CascadedSunlight = memo(function CascadedSunlight({
  cascades,
  playerPosRef,
  crisp = false,
  mapScale = 1,
}: {
  cascades: 1 | 2 | 3
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  /** Realism-rebuild sun envelope (MEDIUM+). LOW keeps the original numbers. */
  crisp?: boolean
  /** Governor-driven shadow-map resolution multiplier (live, no recompile). */
  mapScale?: number
}) {
  const specs = useMemo(() => cascadeSpecs(cascades), [cascades])
  return (
    <>
      {specs.map((spec, i) => (
        <CascadeLight
          key={`cascade-${i}-${spec.halfExtent}`}
          spec={spec}
          playerPosRef={playerPosRef}
          crisp={crisp}
          nearHordeShadows={i === 0}
          mapScale={mapScale}
        />
      ))}
    </>
  )
})
