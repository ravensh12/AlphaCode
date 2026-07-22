import type {
  CityInteractable,
  CityInteractablePayload,
} from '../game3d/city/interactables'
import type { ProblemId, RealmId, TrackId } from '../../types/curriculum'

/* ============================================================================
   City interaction routing — the pure core behind the overworld's E key.

   One resolver turns "the player pressed E near this interactable, in this
   state" into a typed decision the page executes (navigate, open an overlay,
   start a courier run, toggle the hoverboard…). Alongside it live the courier
   run state machine helpers and the photo-capture filename rule. Everything
   here is render-free and Node-tested; the page owns the side effects.
   ========================================================================== */

/* ------------------------------------------------------------ E-press router */

export interface CityInteractContext {
  /** The hero is currently riding the hoverboard. */
  hoverboardMounted: boolean
  /** A courier delivery run is under way. */
  courierRunActive: boolean
}

export type CityInteractDecision =
  /** Nothing to do (no target, not mounted). */
  | { action: 'none' }
  /** Target is locked — the prompt already explains why. */
  | { action: 'blocked' }
  /** Mounted with nothing else nearby: E just steps off the board. */
  | { action: 'dismountOnly' }
  | {
      action: 'enterDojo'
      realmId: RealmId
      trackId: TrackId
      worldIndex: number
      part: number
      mode: 'active' | 'revisit'
    }
  | { action: 'enterBoss'; realmId: RealmId; worldIndex: number }
  | {
      action: 'harvestCrystal'
      /** Most urgent member first (placement already sorted clusters). */
      problemId: ProblemId
      /** Completed-awaiting-cloud: kick a sync alongside the review flow. */
      cloudCheck: boolean
    }
  | { action: 'openArcade' }
  | {
      action: 'openNpc'
      districtIndex: number
      trackId: TrackId
      npcName: string
    }
  | { action: 'startCourier' }
  | { action: 'cancelCourier' }
  | { action: 'mountBoard' }
  | { action: 'dismountBoard' }
  | { action: 'openPhoto'; spotIndex: number }
  /** Encounter beat: one street-side academy mission (terminal/rescue/bounty). */
  | {
      action: 'openBeat'
      beatId: string
      beatKind: 'terminal' | 'rescue' | 'bounty'
      realmId: RealmId
      trackId: TrackId
      problemId: ProblemId
      problemSlug: string
      problemTitle: string
      /** Bounty/rescue: the fight around this beat is already won. */
      encounterCleared: boolean
    }

export interface CityInteractResolution {
  decision: CityInteractDecision
  /** Step off the hoverboard before (or as part of) executing the action. */
  dismount: boolean
}

function decisionFor(
  payload: CityInteractablePayload,
  ctx: CityInteractContext,
): CityInteractDecision {
  switch (payload.kind) {
    case 'dojo':
      return {
        action: 'enterDojo',
        realmId: payload.realmId,
        trackId: payload.trackId,
        worldIndex: payload.worldIndex,
        part: payload.part,
        mode: payload.mode,
      }
    case 'boss':
      return {
        action: 'enterBoss',
        realmId: payload.realmId,
        worldIndex: payload.worldIndex,
      }
    case 'memoryCrystal':
      return {
        action: 'harvestCrystal',
        problemId: payload.crystal.problemIds[0],
        cloudCheck: payload.crystal.state === 'pendingCloud',
      }
    case 'arcade':
      return { action: 'openArcade' }
    case 'npc':
      return {
        action: 'openNpc',
        districtIndex: payload.districtIndex,
        trackId: payload.trackId,
        npcName: payload.npcName,
      }
    case 'courier':
      return ctx.courierRunActive
        ? { action: 'cancelCourier' }
        : { action: 'startCourier' }
    case 'vehicle':
      return ctx.hoverboardMounted
        ? { action: 'dismountBoard' }
        : { action: 'mountBoard' }
    case 'photo':
      return { action: 'openPhoto', spotIndex: payload.spotIndex }
    case 'beat':
      return {
        action: 'openBeat',
        beatId: payload.beatId,
        beatKind: payload.beatKind,
        realmId: payload.realmId,
        trackId: payload.trackId,
        problemId: payload.problemId,
        problemSlug: payload.problemSlug,
        problemTitle: payload.problemTitle,
        encounterCleared: payload.encounterCleared,
      }
  }
}

/** Decisions that leave the world for a page or a modal overlay. */
const LEAVES_WORLD: ReadonlySet<CityInteractDecision['action']> = new Set([
  'enterDojo',
  'enterBoss',
  'harvestCrystal',
  'openArcade',
  'openNpc',
  'openPhoto',
  'openBeat',
])

/**
 * Resolve one E press. The dismount rule: riding ends whenever the press
 * routes into a dojo/boss/mission/overlay interaction, when the vehicle
 * toggle itself fires, or when E is pressed with nothing nearby (step off
 * anywhere). Courier starts/cancels and locked targets keep you riding —
 * the board is the delivery vehicle.
 */
export function resolveCityInteraction(
  interactable: CityInteractable | null,
  ctx: CityInteractContext,
): CityInteractResolution {
  if (!interactable) {
    return ctx.hoverboardMounted
      ? { decision: { action: 'dismountOnly' }, dismount: true }
      : { decision: { action: 'none' }, dismount: false }
  }
  if (interactable.target.locked) {
    return { decision: { action: 'blocked' }, dismount: false }
  }
  const decision = decisionFor(interactable.payload, ctx)
  const dismount =
    decision.action === 'dismountBoard' ||
    (ctx.hoverboardMounted && LEAVES_WORLD.has(decision.action))
  return { decision, dismount }
}

/* ------------------------------------------------------- courier run machine */

/** Horizontal arrival radius at the destination beacon (metres). */
export const COURIER_ARRIVE_RADIUS = 4.5

export interface CourierRun {
  routeId: string
  /** Epoch ms the run was accepted (drives the soft-timer XP scale). */
  startedAt: number
}

/**
 * Which route the next run takes: a stable rotation over the board so every
 * plaza pair comes up, keyed to how many deliveries this identity has ever
 * finished. Empty boards yield null (nothing to accept).
 */
export function chooseCourierRoute(
  routeIds: readonly string[],
  lifetimeDeliveries: number,
): string | null {
  if (routeIds.length === 0) return null
  const index =
    ((lifetimeDeliveries % routeIds.length) + routeIds.length) %
    routeIds.length
  return routeIds[index]
}

export function startCourierRun(
  routeIds: readonly string[],
  lifetimeDeliveries: number,
  now: number,
): CourierRun | null {
  const routeId = chooseCourierRoute(routeIds, lifetimeDeliveries)
  return routeId ? { routeId, startedAt: now } : null
}

/** Whole seconds since the run was accepted (never negative). */
export function courierElapsedSeconds(run: CourierRun, now: number): number {
  return Math.max(0, (now - run.startedAt) / 1000)
}

/** True once the hero stands inside the destination beacon's arrival ring. */
export function courierArrived(
  destination: { x: number; z: number },
  x: number,
  z: number,
  radius: number = COURIER_ARRIVE_RADIUS,
): boolean {
  const dx = destination.x - x
  const dz = destination.z - z
  return dx * dx + dz * dz <= radius * radius
}

/* -------------------------------------------------------------- photo mode */

/**
 * Deterministic download name for a captured photo:
 * `alphacode-photo-spot3-neon-grid-20260712-014205.png` (frame omitted when
 * none is selected). Local time, zero-padded, filesystem-safe.
 */
export function photoFileName(
  spotIndex: number,
  frameId: string | null,
  when: Date,
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`
  const frame = frameId ? `-${frameId.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '')}` : ''
  return `alphacode-photo-spot${spotIndex + 1}${frame}-${stamp}.png`
}
