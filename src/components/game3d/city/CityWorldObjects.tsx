import { memo, useEffect, useMemo, type MutableRefObject } from 'react'
import type { PlacedCrystal } from '../../../lib/crystalPlacement'
import type { QualityProfile } from '../../../lib/graphicsQuality'
import {
  CHECKPOINTS_3D,
  LANDMARKS,
  START_3D,
  rotatedFootprint,
  setDynamicColliders,
  type Collider,
} from '../layout'
import { DISTRICT_THEMES } from '../districtTheme'
import type { CityInteractable } from './interactables'
import {
  buildCityRenderPlan,
  meshyUpgradeTier,
  resolveCityQuality,
  type CityObjectsQuality,
} from './cityWorldObjectsCore'
import { MemoryCrystals } from './MemoryCrystals'
import { ArcadeCabinet } from './ArcadeCabinet'
import { NpcCitizen } from './NpcCitizen'
import { BitCollectibles } from './BitCollectibles'
import { CourierBeacon } from './CourierBeacon'
import { Hoverboard } from './Hoverboard'
import { PhotoSpot } from './PhotoSpot'
import type { Vec2Like } from './courierBeaconCore'
import type { HoverboardPose } from './hoverboardCore'

/* ============================================================================
   CityWorldObjects — the single mount point for the Living Code City's
   world-object layer. The integration agent mounts JUST this component inside
   the overworld <Canvas> and feeds it the registry output plus a handful of
   progress-derived props; every child stays pure presentation (no evidence,
   progress, or XP APIs anywhere below this line).
   ========================================================================== */

/**
 * Exact prop contract for the integration layer.
 *
 * Registry-driven placement (positions come from `interactables`):
 * - `interactables` — `buildCityInteractables(...)` output, verbatim. This
 *   component renders the city-life kinds (`npc`, `arcade`, `courier`,
 *   `vehicle`, `photo`) at their target positions. `dojo`/`boss` doors stay
 *   with the existing checkpoint renderer, and `memoryCrystal` entries are
 *   ignored here in favour of the full `crystals` list below (the registry
 *   only carries harvestable crystals; the world also shows growing/cleared
 *   scenery ones). Guests (dojo+boss-only registries) therefore render no
 *   city-life objects, matching the gating table.
 *
 * Progress-derived display state (computed by the host, never in here):
 * - `crystals` — full `placeMemoryCrystals(...)` output, ALL states.
 * - `arcadeDueCount` — review patterns currently due (the cabinet screen
 *   number; the `arcade` payload's `empty` flag picks the standby copy).
 * - `npcChainDistricts` — district indices whose NPC currently has a quiz
 *   chain available (drives the floating chat glyph).
 * - `bitWeekAnchor` — any moment inside the ISO week whose bit field should
 *   render (pass a stable Date; the field reseeds only when the week flips).
 * - `collectedBitIds` — bit ids already collected this week. Grow this set
 *   (new identity) when the controller reports pickups via the exported
 *   `collectBitsNear` helper; newly added ids play the sparkle burst.
 * - `courierDestination` — active delivery drop point, or null between runs
 *   (aims the depot arrow ring, raises the destination beacon, and hides the
 *   depot parcel while the hero carries it).
 * - `courierBurstKey` — increment once per completed delivery to replay the
 *   delivery-complete burst (a lifetime counter works perfectly).
 * - `hoverboardMounted` + `hoverboardPoseRef` — while mounted the controller
 *    writes a {@link HoverboardPose} into the ref each frame and the board
 *    follows it (speed drives tilt/dust/trail). The speed profile to
 *    integrate lives in hoverboardCore (cruise 15 → boost 24 m/s).
 * - `activePhotoSpotIndex` — spot currently open in the photo overlay (its
 *   marker pulses), or null.
 *
 * Tier gating:
 * - `quality` — a full unified {@link QualityProfile} OR the minimal
 *   {@link CityObjectsQuality} booleans; omitted = everything on. See
 *   `resolveCityQuality` for the profile → switches mapping.
 */
export interface CityWorldObjectsProps {
  interactables: readonly CityInteractable[]
  crystals: readonly PlacedCrystal[]
  arcadeDueCount: number
  npcChainDistricts: ReadonlySet<number>
  bitWeekAnchor: Date
  collectedBitIds: ReadonlySet<string>
  courierDestination?: Vec2Like | null
  courierBurstKey?: number
  hoverboardMounted?: boolean
  hoverboardPoseRef?: MutableRefObject<HoverboardPose>
  activePhotoSpotIndex?: number | null
  quality?: QualityProfile | CityObjectsQuality
}

/** Yaw at `from` that faces `to` (the city's atan2(dx, dz) convention). */
function faceToward(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

export const CityWorldObjects = memo(function CityWorldObjects({
  interactables,
  crystals,
  arcadeDueCount,
  npcChainDistricts,
  bitWeekAnchor,
  collectedBitIds,
  courierDestination = null,
  courierBurstKey = 0,
  hoverboardMounted = false,
  hoverboardPoseRef,
  activePhotoSpotIndex = null,
  quality,
}: CityWorldObjectsProps) {
  const q = useMemo(() => resolveCityQuality(quality), [quality])
  const meshy = useMemo(() => meshyUpgradeTier(quality), [quality])
  const meshyProps = meshy !== 'none'
  const plan = useMemo(() => buildCityRenderPlan(interactables), [interactables])

  // Solid interactable shells: the arcade cabinet, photo tripods and the
  // courier depot parcel all read as street furniture, so they block like
  // it. NPCs, the hoverboard deck and crystals stay walk-through (people /
  // rideable / pickups). Footprints hug the mesh so press-E radii (≥2.5m)
  // are unaffected.
  useEffect(() => {
    const colliders: Collider[] = []
    if (plan.arcade) {
      const yaw = faceToward(plan.arcade, START_3D)
      // top 1.9m: the cabinet is a wall for the vault, not a hurdle.
      colliders.push(rotatedFootprint(plan.arcade.x, plan.arcade.z, 0.65, 0.55, yaw, 1, 1.9))
    }
    for (const photo of plan.photos) {
      colliders.push({ x: photo.x, z: photo.z, hw: 0.3, hd: 0.3 })
    }
    if (plan.courier) {
      colliders.push({ x: plan.courier.x, z: plan.courier.z, hw: 0.4, hd: 0.4 })
    }
    setDynamicColliders('city-objects', colliders)
  }, [plan])
  useEffect(() => () => setDynamicColliders('city-objects', []), [])

  return (
    <group>
      <MemoryCrystals crystals={crystals} labels={q.labels} />

      {plan.npcs.map((npc) => (
        <NpcCitizen
          key={npc.key}
          x={npc.x}
          z={npc.z}
          rotationY={faceToward(npc, CHECKPOINTS_3D[npc.districtIndex].flag)}
          accent={DISTRICT_THEMES[npc.districtIndex].accent}
          chainAvailable={npcChainDistricts.has(npc.districtIndex)}
          rig={q.gltfNpc}
          meshyRig={meshy === 'high'}
        />
      ))}

      {plan.arcade && (
        <ArcadeCabinet
          x={plan.arcade.x}
          z={plan.arcade.z}
          rotationY={faceToward(plan.arcade, START_3D)}
          dueCount={arcadeDueCount}
          empty={plan.arcade.empty}
          attractGlow={q.particles}
          meshyShell={meshyProps}
        />
      )}

      {plan.courier && (
        <CourierBeacon
          depot={plan.courier}
          destination={courierDestination}
          columns="night"
          burstKey={courierBurstKey}
          burst={q.particles}
          meshyKit={meshyProps}
        />
      )}

      {plan.vehicle && (
        <Hoverboard
          parked={plan.vehicle}
          parkedYaw={faceToward(plan.vehicle, START_3D)}
          mounted={hoverboardMounted}
          poseRef={hoverboardPoseRef}
          unlocked={!plan.vehicle.locked}
          trail={q.particles}
          dust={q.particles}
          meshyDeck={meshyProps}
        />
      )}

      {plan.photos.map((photo) => (
        <PhotoSpot
          key={photo.key}
          x={photo.x}
          z={photo.z}
          rotationY={faceToward(photo, LANDMARKS[photo.spotIndex].pos)}
          active={activePhotoSpotIndex === photo.spotIndex}
          accent={LANDMARKS[photo.spotIndex].color}
          meshyTripod={meshyProps}
        />
      ))}

      {plan.cityLifePresent && (
        <BitCollectibles
          weekAnchor={bitWeekAnchor}
          collected={collectedBitIds}
          sparkles={q.particles}
        />
      )}
    </group>
  )
})
