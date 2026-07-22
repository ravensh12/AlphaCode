import type { World } from '../../../content/adventure'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../../../content/curricula/neetcode150'
import {
  isAcademyRealmUnlocked,
  realmIdForWorldIndex,
  trackIdForCheckpoint,
} from '../../../lib/academyQuest'
import {
  normalizeAcademyProgressState,
  selectRealmProgress,
  selectTrackProgress,
} from '../../../lib/academyProgress'
import {
  canEnterAcademyBossWithShowcase,
  canEnterAcademyCheckpointWithShowcase,
} from '../../../lib/showcaseOverride'
import { COURIER_ROUTES } from '../../../lib/cityLife'
import {
  placeMemoryCrystals,
  type PlacedCrystal,
} from '../../../lib/crystalPlacement'
import { isCrystalInteractable } from '../../../lib/memoryCrystals'
import type { AcademyProgressState } from '../../../types/academy'
import type { ProblemId, RealmId, TrackId } from '../../../types/curriculum'
import {
  CHECKPOINTS_3D,
  GATES_PER_WORLD,
  LANDMARKS,
  START_3D,
  WORLD_GATES,
  questDoor,
  type Vec2,
} from '../layout'

/* ============================================================================
   City interactable registry (Living Code City PR4-6 prep).

   One pure function — buildCityInteractables — projects the whole city's
   pressable things from the existing progress facts. It implements the spec's
   gating table:

   | kind          | gate                                                    |
   |---------------|---------------------------------------------------------|
   | dojo          | active checkpoint (entry gate) OR revisit (practice     |
   |               | complete); showcase always open                          |
   | boss          | unchanged boss entry gate; showcase always open          |
   | memoryCrystal | emitted ONLY when harvestable: retention due (ripe) or  |
   |               | completed-awaiting-cloud (pendingCloud); never locked    |
   | arcade        | never locked — with no review history it opens onto the |
   |               | overlay's empty copy                                     |
   | npc           | one per UNLOCKED district (showcase: all six)           |
   | courier/photo | always present, never locked                             |
   | vehicle       | locked until the first courier delivery                  |
   | guests        | see dojo + boss ONLY                                     |

   The target shape is a structurally compatible SUPERSET of today's
   ThirdPersonController Target ('lesson' | 'boss' kinds still exist; radius
   and priority are additive) — the integration PR lifts it into the
   controller without touching this module. Overworld wiring is deliberately
   out of scope here.
   ========================================================================== */

export type InteractableKind =
  | 'dojo'
  | 'boss'
  | 'memoryCrystal'
  | 'arcade'
  | 'npc'
  | 'courier'
  | 'vehicle'
  | 'photo'
  | 'beat'

/** Superset of the controller's Target kinds (legacy 'lesson' included). */
export type CityTargetKind = 'lesson' | InteractableKind

/**
 * Extended target — every field of ThirdPersonController's Target plus the
 * interaction radius/priority the city needs. radius/priority stay optional
 * in the TYPE so today's controller targets remain assignable when the
 * integration PR lifts this shape in; buildCityInteractables always sets
 * both.
 */
export interface CityTarget {
  key: string
  world: World
  kind: CityTargetKind
  x: number
  z: number
  locked: boolean
  cleared: boolean
  /** For split lessons / dojo gates: which checkpoint part (0-based). */
  part?: number
  /** Interaction radius in metres (always set by buildCityInteractables). */
  radius?: number
  /** Higher wins when several targets overlap; ties go to the nearest. */
  priority?: number
}

export type CityInteractablePayload =
  | {
      kind: 'dojo'
      realmId: RealmId
      trackId: TrackId
      worldIndex: number
      part: number
      /** 'revisit' once the track's practice is complete. */
      mode: 'active' | 'revisit'
    }
  | { kind: 'boss'; realmId: RealmId; worldIndex: number }
  | { kind: 'memoryCrystal'; crystal: PlacedCrystal }
  | { kind: 'arcade'; empty: boolean }
  | {
      kind: 'npc'
      districtIndex: number
      realmId: RealmId
      /** Track the NPC quizzes on — the district's first incomplete one. */
      trackId: TrackId
      npcName: string
    }
  | { kind: 'courier'; routeIds: readonly string[] }
  | { kind: 'vehicle'; vehicleId: 'hover-scooter' }
  | { kind: 'photo'; spotIndex: number }
  /**
   * Encounter beat — one academy mission delivered as an in-world event on
   * the road between checkpoints (see lib/encounterBeats.ts, which builds
   * these). Field shapes stay primitive here to avoid an import cycle.
   */
  | {
      kind: 'beat'
      beatId: string
      worldIndex: number
      part: number
      beatIndex: number
      beatKind: 'terminal' | 'rescue' | 'bounty'
      problemId: ProblemId
      realmId: RealmId
      trackId: TrackId
      problemSlug: string
      problemTitle: string
      /** Bounty/rescue: the combat around this beat is already won. */
      encounterCleared: boolean
    }

export interface InteractionPrompt {
  /** The press-E verb ("Enter", "Harvest", "Talk"…). */
  verb: string
  label: string
  /** Shown instead of `label` while the target is locked. */
  lockedLabel: string
}

export interface CityInteractable {
  target: CityTarget
  payload: CityInteractablePayload
  prompt: InteractionPrompt
}

export interface CityInteractablesInput {
  academyProgress: AcademyProgressState
  /** Signed-out visitors see dojo + boss only. */
  isGuest: boolean
  /** Showcase account: entry gates read open (progress facts stay real). */
  isShowcaseAccount: boolean
  /** Clock (epoch ms) for retention dueness / crystal states. */
  now: number
  /** Cloud sync on → completed-but-unverified crystals stay harvestable. */
  cloudEnabled: boolean
  /** Set once the player finishes their first courier delivery. */
  firstDeliveryDone: boolean
  /** Learner has practiced concepts (arcade empty copy when false). */
  hasReviewHistory: boolean
}

/** Interaction radii per kind (metres). Crystals are tight, doors roomy. */
export const INTERACT_RADIUS: Record<InteractableKind, number> = {
  dojo: 3.2,
  boss: 3.6,
  memoryCrystal: 2.0,
  arcade: 2.8,
  npc: 2.4,
  courier: 2.8,
  vehicle: 2.4,
  photo: 3.0,
  beat: 3.2,
}

/**
 * Priority when several targets overlap (higher wins, ties → nearest).
 * Crystals out-rank doors: their radius is small, so being inside it is a
 * clear statement of intent; doors keep priority over ambient life.
 */
export const INTERACT_PRIORITY: Record<InteractableKind, number> = {
  memoryCrystal: 12,
  dojo: 10,
  boss: 10,
  beat: 9,
  npc: 8,
  arcade: 8,
  vehicle: 8,
  courier: 7,
  photo: 5,
}

/** One friendly face per district, stable across sessions. */
export const NPC_NAMES: readonly string[] = [
  'Lumen',
  'Moss',
  'Pixel',
  'Juniper',
  'Volt',
  'Sable',
]

/** Fixed city-life sites around the spawn plaza (kept off the road grid). */
export const ARCADE_SITE: Vec2 = { x: START_3D.x + 10, z: START_3D.z - 8 }
export const COURIER_DEPOT_SITE: Vec2 = { x: START_3D.x - 10, z: START_3D.z + 8 }
export const VEHICLE_PAD_SITE: Vec2 = { x: START_3D.x + 13, z: START_3D.z + 9 }

/** NPC spot on a district plaza edge (clear of the academy footprint). */
export function npcSite(districtIndex: number): Vec2 {
  const flag = CHECKPOINTS_3D[districtIndex].flag
  return { x: flag.x + 9, z: flag.z + 7 }
}

/** Photo spots frame each district landmark, pulled toward the city centre. */
export function photoSite(spotIndex: number): Vec2 {
  return questDoor(LANDMARKS[spotIndex].pos, 9)
}

function crystalPrompt(crystal: PlacedCrystal): InteractionPrompt {
  const cloud = crystal.state === 'pendingCloud'
  if (crystal.kind === 'cluster') {
    return {
      verb: 'Harvest',
      label: `${crystal.count} Memory Crystals${cloud ? ' · cloud check' : ''}`,
      lockedLabel: 'Still growing — check back later',
    }
  }
  const problem = NEETCODE_150_PROBLEM_BY_ID.get(crystal.problemIds[0])
  return {
    verb: 'Harvest',
    label: `Memory Crystal — ${problem?.title ?? 'Mission'}${cloud ? ' · cloud check' : ''}`,
    lockedLabel: 'Still growing — check back later',
  }
}

/**
 * Build every interactable the city should surface for this player, purely
 * from the given facts. Deterministic: same input, same list, same order
 * (dojos, bosses, crystals, npcs, then the spawn-plaza city-life sites).
 */
export function buildCityInteractables(
  input: CityInteractablesInput,
): CityInteractable[] {
  const progress = normalizeAcademyProgressState(input.academyProgress)
  const out: CityInteractable[] = []

  /* -------------------------------------------------- dojo gates + bosses */
  for (
    let worldIndex = 0;
    worldIndex < NEETCODE_150_MANIFEST.realms.length;
    worldIndex++
  ) {
    const world = CHECKPOINTS_3D[worldIndex].world
    const realmId = realmIdForWorldIndex(worldIndex)
    if (!realmId) continue

    for (let part = 0; part < GATES_PER_WORLD; part++) {
      const trackId = trackIdForCheckpoint(worldIndex, part)
      if (!trackId) continue
      const track = NEETCODE_150_TRACK_BY_ID.get(trackId)
      const trackProgress = selectTrackProgress(progress, trackId)
      const entryOpen = canEnterAcademyCheckpointWithShowcase(
        input.isShowcaseAccount,
        progress,
        worldIndex,
        part,
      )
      const revisit = trackProgress.practiceComplete
      const locked = !entryOpen && !revisit
      const door = questDoor(WORLD_GATES[worldIndex][part])
      out.push({
        target: {
          key: `${world.id}-dojo-${part}`,
          world,
          kind: 'dojo',
          part,
          x: door.x,
          z: door.z,
          locked,
          cleared: trackProgress.complete,
          radius: INTERACT_RADIUS.dojo,
          priority: INTERACT_PRIORITY.dojo,
        },
        payload: {
          kind: 'dojo',
          realmId,
          trackId,
          worldIndex,
          part,
          mode: revisit ? 'revisit' : 'active',
        },
        prompt: {
          verb: 'Enter',
          label: `Data Dojo — ${track?.title ?? trackId}`,
          lockedLabel:
            input.isGuest && !entryOpen
              ? 'Sign in to train here'
              : 'Clear the earlier checkpoint first',
        },
      })
    }

    const realmProgress = selectRealmProgress(progress, realmId)
    const bossDoor = questDoor(CHECKPOINTS_3D[worldIndex].boss, 6)
    out.push({
      target: {
        key: `${world.id}-boss`,
        world,
        kind: 'boss',
        x: bossDoor.x,
        z: bossDoor.z,
        locked: !canEnterAcademyBossWithShowcase(
          input.isShowcaseAccount,
          progress,
          realmId,
        ),
        cleared: realmProgress.cleared,
        radius: INTERACT_RADIUS.boss,
        priority: INTERACT_PRIORITY.boss,
      },
      payload: { kind: 'boss', realmId, worldIndex },
      prompt: {
        // A defeated boss is an optional rematch, never a demand to redo —
        // the run advances on the first durable defeat.
        verb: realmProgress.bossDefeated ? 'Rematch' : 'Enter',
        label: realmProgress.bossDefeated
          ? `Boss Lair — ${world.name} · defeated`
          : `Boss Lair — ${world.name}`,
        lockedLabel: 'Complete all three district topics first',
      },
    })
  }

  // Guests interact with the campaign only: dojo + boss, nothing else.
  if (input.isGuest) return out

  /* ------------------------------------------------------ memory crystals */
  const crystals = placeMemoryCrystals({
    academyProgress: progress,
    now: input.now,
    cloudEnabled: input.cloudEnabled,
  })
  for (const crystal of crystals) {
    // Ripe-only rule: growing / cleared crystals are scenery, not targets.
    if (!isCrystalInteractable(crystal.state)) continue
    const world = CHECKPOINTS_3D[crystal.worldIndex].world
    out.push({
      target: {
        key: crystal.id,
        world,
        kind: 'memoryCrystal',
        part: crystal.part,
        x: crystal.x,
        z: crystal.z,
        locked: false,
        cleared: false,
        radius: INTERACT_RADIUS.memoryCrystal,
        priority: INTERACT_PRIORITY.memoryCrystal,
      },
      payload: { kind: 'memoryCrystal', crystal },
      prompt: crystalPrompt(crystal),
    })
  }

  /* ------------------------------------------------------- district NPCs */
  for (
    let districtIndex = 0;
    districtIndex < NEETCODE_150_MANIFEST.realms.length;
    districtIndex++
  ) {
    const realmId = realmIdForWorldIndex(districtIndex)
    if (!realmId) continue
    const unlocked =
      input.isShowcaseAccount || isAcademyRealmUnlocked(progress, realmId)
    if (!unlocked) continue
    const realm = NEETCODE_150_MANIFEST.realms[districtIndex]
    const realmProgress = selectRealmProgress(progress, realmId)
    const trackId = realmProgress.firstIncompleteTrackId ?? realm.trackIds[0]
    const world = CHECKPOINTS_3D[districtIndex].world
    const spot = npcSite(districtIndex)
    const npcName = NPC_NAMES[districtIndex % NPC_NAMES.length]
    out.push({
      target: {
        key: `${world.id}-npc`,
        world,
        kind: 'npc',
        x: spot.x,
        z: spot.z,
        locked: false,
        cleared: false,
        radius: INTERACT_RADIUS.npc,
        priority: INTERACT_PRIORITY.npc,
      },
      payload: { kind: 'npc', districtIndex, realmId, trackId, npcName },
      prompt: {
        verb: 'Talk',
        label: `${npcName} — ${world.name}`,
        lockedLabel: 'This district is still locked',
      },
    })
  }

  /* --------------------------------------------- spawn-plaza city life */
  const spawnWorld = CHECKPOINTS_3D[0].world

  out.push({
    target: {
      key: 'city-arcade',
      world: spawnWorld,
      kind: 'arcade',
      x: ARCADE_SITE.x,
      z: ARCADE_SITE.z,
      locked: false,
      cleared: false,
      radius: INTERACT_RADIUS.arcade,
      priority: INTERACT_PRIORITY.arcade,
    },
    payload: { kind: 'arcade', empty: !input.hasReviewHistory },
    prompt: {
      verb: 'Play',
      label: 'Pattern Arcade',
      lockedLabel: 'Back tomorrow — daily sessions spent',
    },
  })

  out.push({
    target: {
      key: 'city-courier',
      world: spawnWorld,
      kind: 'courier',
      x: COURIER_DEPOT_SITE.x,
      z: COURIER_DEPOT_SITE.z,
      locked: false,
      cleared: false,
      radius: INTERACT_RADIUS.courier,
      priority: INTERACT_PRIORITY.courier,
    },
    payload: {
      kind: 'courier',
      routeIds: COURIER_ROUTES.map(({ id }) => id),
    },
    prompt: {
      verb: 'Accept',
      label: 'Courier Board',
      lockedLabel: 'Deliveries resume tomorrow',
    },
  })

  out.push({
    target: {
      key: 'city-vehicle',
      world: spawnWorld,
      kind: 'vehicle',
      x: VEHICLE_PAD_SITE.x,
      z: VEHICLE_PAD_SITE.z,
      locked: !input.firstDeliveryDone,
      cleared: false,
      radius: INTERACT_RADIUS.vehicle,
      priority: INTERACT_PRIORITY.vehicle,
    },
    payload: { kind: 'vehicle', vehicleId: 'hover-scooter' },
    prompt: {
      verb: 'Ride',
      label: 'Hover Scooter',
      lockedLabel: 'Finish your first delivery to unlock',
    },
  })

  for (let spotIndex = 0; spotIndex < LANDMARKS.length; spotIndex++) {
    const world = LANDMARKS[spotIndex].world
    const spot = photoSite(spotIndex)
    out.push({
      target: {
        key: `city-photo-${spotIndex}`,
        world,
        kind: 'photo',
        x: spot.x,
        z: spot.z,
        locked: false,
        cleared: false,
        radius: INTERACT_RADIUS.photo,
        priority: INTERACT_PRIORITY.photo,
      },
      payload: { kind: 'photo', spotIndex },
      prompt: {
        verb: 'Frame',
        label: `Photo Spot — ${world.name}`,
        lockedLabel: 'Always open',
      },
    })
  }

  return out
}

/**
 * The interactable the hero can act on from (x, z): inside its radius,
 * highest priority first, nearest breaking ties. This is the tie-break
 * contract the controller adopts when the integration PR lifts the target
 * shape in.
 */
export function nearestInteractable(
  interactables: readonly CityInteractable[],
  x: number,
  z: number,
): CityInteractable | null {
  let best: CityInteractable | null = null
  let bestPriority = -Infinity
  let bestDistance = Infinity
  for (const interactable of interactables) {
    const { target } = interactable
    const distance = Math.hypot(target.x - x, target.z - z)
    const radius = target.radius ?? 3
    if (distance > radius) continue
    const priority = target.priority ?? 0
    if (
      priority > bestPriority ||
      (priority === bestPriority && distance < bestDistance)
    ) {
      best = interactable
      bestPriority = priority
      bestDistance = distance
    }
  }
  return best
}
