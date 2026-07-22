import {
  CHECKPOINTS_3D,
  GATES_PER_WORLD,
  START_3D,
  WORLD_GATES,
  questDoor,
} from '../components/game3d/layout'
import { clearAcademyEntryTokens } from './gameAccess'

/** Session keys for the 3D quest run (tour position, not lesson mastery). */
export const TOUR_KEY = 'alphacode.tour'
export const POS_KEY = 'alphacode.quest.pos'
export const PART_DONE_KEY = 'alphacode.partDone'
/** Durable academy track completed; consumed when returning to Code City. */
export const ACADEMY_RETURN_KEY = 'alphacode.academyReturn'
export const INTRO_KEY = 'alphacode.quest.introSeen'
/** Set when the player beats the boss fight THIS run (so the tour advances). */
export const BOSS_DONE_KEY = 'alphacode.bossDone'
/** Snapshot of live zombies, so the horde survives a trip to the list view. */
export const COMBAT_SNAP_KEY = 'alphacode.combat.snapshot'
/** Legacy placement marker; cleared by current reconciliation code. */
export const SKIP_SPAWN_KEY = 'alphacode.quest.skipSpawn'
/**
 * Stores the level index (0-based) the player jumped to from the LIST view, so
 * the overworld greets them with a "Welcome to Level N" popup instead of the
 * full how-to-play intro (which is reserved for a fresh start / placement quiz).
 */
export const LEVEL_WELCOME_KEY = 'alphacode.quest.levelWelcome'
/**
 * Set when the player enters an academy mission FROM an encounter beat in the
 * 3D city (street terminal / rescue / bounty, or the death-revive offer), so
 * the overworld can settle the outcome on return. `revive: true` marks the
 * study-to-revive path — completing the mission revives in place; bailing
 * applies the normal death penalty.
 */
export const BEAT_RETURN_KEY = 'alphacode.beatReturn'
/** Bounty elites / rescue rings already fought and won this session. */
export const ENCOUNTERS_CLEARED_KEY = 'alphacode.encounters.cleared'
/** Revives spent on the current level: `{ world, used }`. A different world
 *  index means a new level began, so the budget silently resets. */
export const REVIVES_KEY = 'alphacode.quest.revives'
/**
 * Fresh-run state, set by the "Reset run" control. While present it holds the
 * replay run's own tour position AND its per-mission ledger, and OVERRIDES the
 * durable-progress objective — so a progressed (or fully completed) account
 * restarts the physical run at Level 1 exactly like a brand-new player: the
 * street-mission beats present as unplayed and re-clear one by one. Durable
 * academy evidence is never touched — closing the tab ends the fresh run and
 * durable progress resumes authority.
 */
export const FRESH_RUN_KEY = 'alphacode.quest.freshRun'

export type SpawnSave = { x: number; z: number; h: number }
export type QuestTour = { world: number; stage: number }
export type QuestResume = { tour: QuestTour; spawn: SpawnSave }
export type AcademyCheckpointReturn = {
  realmId: string
  trackId: string
}

function finiteInteger(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback
}

export function normalizeQuestTour(value: QuestTour): QuestTour {
  const worldCount = WORLD_GATES.length
  const world = Math.max(
    0,
    Math.min(worldCount, finiteInteger(value.world)),
  )
  if (world >= worldCount) return { world: worldCount, stage: 0 }
  return {
    world,
    stage: Math.max(
      0,
      Math.min(GATES_PER_WORLD, finiteInteger(value.stage)),
    ),
  }
}

function spawnFacing(here: { x: number; z: number }, next: { x: number; z: number } | null): SpawnSave {
  return {
    x: here.x,
    z: here.z,
    h: next ? Math.atan2(next.x - here.x, next.z - here.z) : 0,
  }
}

/**
 * Canonical spawn for the first incomplete durable objective. A fresh/refresh
 * resume starts at the immediately preceding physical objective, never at the
 * city origin for a progressed learner.
 */
export function spawnForQuestObjective(value: QuestTour): SpawnSave {
  const tour = normalizeQuestTour(value)
  const worldCount = WORLD_GATES.length
  if (tour.world >= worldCount) {
    const finalBoss = CHECKPOINTS_3D[worldCount - 1]?.boss ?? START_3D
    return spawnFacing(questDoor(finalBoss, 6.5), null)
  }

  const next =
    tour.stage >= GATES_PER_WORLD
      ? questDoor(CHECKPOINTS_3D[tour.world].boss, 6)
      : questDoor(WORLD_GATES[tour.world][tour.stage])
  if (tour.stage > 0) {
    return spawnFacing(
      questDoor(WORLD_GATES[tour.world][tour.stage - 1], 6.5),
      next,
    )
  }
  if (tour.world === 0) return spawnFacing(START_3D, next)
  return spawnFacing(
    questDoor(CHECKPOINTS_3D[tour.world - 1].boss, 6.5),
    next,
  )
}

function validSpawn(value: SpawnSave | null): value is SpawnSave {
  return (
    !!value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.h)
  )
}

/**
 * Durable progress always owns the objective after hydration. A saved position
 * is reusable only when its session tour names that exact objective; placement
 * or stale-tab coordinates from another realm are otherwise discarded.
 */
export function resolveQuestResume(
  durableTour: QuestTour,
  sessionTour: QuestTour | null,
  savedPosition: SpawnSave | null,
): QuestResume {
  const tour = normalizeQuestTour(durableTour)
  const session = sessionTour ? normalizeQuestTour(sessionTour) : null
  const sessionMatches =
    session?.world === tour.world && session.stage === tour.stage
  return {
    tour,
    spawn:
      sessionMatches && validSpawn(savedPosition)
        ? savedPosition
        : spawnForQuestObjective(tour),
  }
}

/**
 * Position saved when entering the current target. The target's own world
 * index is authoritative, so a stale render closure cannot save another
 * realm's gate or boss coordinates.
 */
export function spawnAfterQuestEntry(
  worldIndex: number,
  enteredStage: number,
): SpawnSave {
  const worldCount = WORLD_GATES.length
  const world = Math.max(
    0,
    Math.min(worldCount - 1, finiteInteger(worldIndex)),
  )
  const stage = Math.max(
    0,
    Math.min(GATES_PER_WORLD, finiteInteger(enteredStage)),
  )
  if (stage >= GATES_PER_WORLD) {
    const here = questDoor(CHECKPOINTS_3D[world].boss, 6.5)
    const next =
      world + 1 < worldCount
        ? questDoor(WORLD_GATES[world + 1][0])
        : null
    return spawnFacing(here, next)
  }

  const here = questDoor(WORLD_GATES[world][stage], 6.5)
  const next =
    stage + 1 >= GATES_PER_WORLD
      ? questDoor(CHECKPOINTS_3D[world].boss, 6)
      : questDoor(WORLD_GATES[world][stage + 1])
  return spawnFacing(here, next)
}

export function markAcademyCheckpointReturn(
  realmId: string,
  trackId: string,
): void {
  try {
    sessionStorage.setItem(
      ACADEMY_RETURN_KEY,
      JSON.stringify({ realmId, trackId }),
    )
  } catch {
    /* ignore */
  }
}

export type BeatReturn = { problemId: string; revive: boolean }

export function markBeatReturn(problemId: string, revive: boolean): void {
  try {
    sessionStorage.setItem(
      BEAT_RETURN_KEY,
      JSON.stringify({ problemId, revive }),
    )
  } catch {
    /* ignore */
  }
}

export function consumeBeatReturn(): BeatReturn | null {
  try {
    const raw = sessionStorage.getItem(BEAT_RETURN_KEY)
    sessionStorage.removeItem(BEAT_RETURN_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<BeatReturn>
    return typeof value.problemId === 'string'
      ? { problemId: value.problemId, revive: value.revive === true }
      : null
  } catch {
    return null
  }
}

export function loadClearedEncounters(): string[] {
  try {
    const raw = sessionStorage.getItem(ENCOUNTERS_CLEARED_KEY)
    if (!raw) return []
    const value = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

export function persistClearedEncounters(ids: readonly string[]): void {
  try {
    sessionStorage.setItem(ENCOUNTERS_CLEARED_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------- revive cap */

/** Per-level revive budget — study-to-revive + Knowledge Surge combined.
 *  Once it's spent, death applies the normal restart penalty. */
export const REVIVES_PER_LEVEL = 3

/** Revives still available on the given level (fresh levels start at 3). */
export function revivesLeft(worldIndex: number): number {
  try {
    const raw = sessionStorage.getItem(REVIVES_KEY)
    if (!raw) return REVIVES_PER_LEVEL
    const value = JSON.parse(raw) as { world?: unknown; used?: unknown }
    if (value.world !== worldIndex || typeof value.used !== 'number') {
      return REVIVES_PER_LEVEL
    }
    return Math.max(0, REVIVES_PER_LEVEL - Math.max(0, Math.trunc(value.used)))
  } catch {
    return REVIVES_PER_LEVEL
  }
}

/** Spend one revive on the given level; returns how many remain. */
export function recordReviveUsed(worldIndex: number): number {
  const used = REVIVES_PER_LEVEL - revivesLeft(worldIndex) + 1
  try {
    sessionStorage.setItem(
      REVIVES_KEY,
      JSON.stringify({ world: worldIndex, used }),
    )
  } catch {
    /* ignore */
  }
  return Math.max(0, REVIVES_PER_LEVEL - used)
}

/**
 * Set when a review-mode (non-recording) replay of a mission ends with a
 * cleanly passed full quiz. Review runs write no durable evidence, so this
 * marker is the ONLY signal the overworld's fresh-run trail can consume to
 * advance the replay run one checkpoint.
 */
export const ACADEMY_REVIEW_RETURN_KEY = 'alphacode.academyReviewReturn'

export type AcademyReviewReturn = {
  realmId: string
  trackId: string
}

export function markAcademyReviewReturn(
  realmId: string,
  trackId: string,
): void {
  try {
    sessionStorage.setItem(
      ACADEMY_REVIEW_RETURN_KEY,
      JSON.stringify({ realmId, trackId }),
    )
  } catch {
    /* ignore */
  }
}

export function consumeAcademyReviewReturn(): AcademyReviewReturn | null {
  try {
    const raw = sessionStorage.getItem(ACADEMY_REVIEW_RETURN_KEY)
    sessionStorage.removeItem(ACADEMY_REVIEW_RETURN_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<AcademyReviewReturn>
    return typeof value.realmId === 'string' && typeof value.trackId === 'string'
      ? { realmId: value.realmId, trackId: value.trackId }
      : null
  } catch {
    return null
  }
}

export function consumeAcademyCheckpointReturn(): AcademyCheckpointReturn | null {
  try {
    const raw = sessionStorage.getItem(ACADEMY_RETURN_KEY)
    sessionStorage.removeItem(ACADEMY_RETURN_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<AcademyCheckpointReturn>
    return typeof value.realmId === 'string' && typeof value.trackId === 'string'
      ? { realmId: value.realmId, trackId: value.trackId }
      : null
  } catch {
    return null
  }
}

/**
 * Everything the fresh (post-reset replay) run remembers about itself:
 * - `tour`: the replay trail's own objective (overrides the durable tour).
 * - `startedAt`: when the reset happened — durable practice recorded AFTER
 *   this moment is NEW work done during the run (frontier content) and counts
 *   toward the replay trail automatically.
 * - `missions`: problem IDs whose lesson+quiz were cleanly REPLAYED this run
 *   (review mode records no durable evidence, so the run keeps its own ledger).
 */
export type FreshRunState = {
  tour: QuestTour
  startedAt: string
  missions: readonly string[]
}

function parseFreshRunState(raw: string | null): FreshRunState | null {
  if (!raw) return null
  const value = JSON.parse(raw) as {
    world?: unknown
    stage?: unknown
    startedAt?: unknown
    missions?: unknown
  }
  if (typeof value.world !== 'number' || typeof value.stage !== 'number') {
    return null
  }
  return {
    tour: normalizeQuestTour({ world: value.world, stage: value.stage }),
    // A missing timestamp (legacy anchor) counts nothing as run work yet —
    // the ledger alone drives the trail until real timestamps accumulate.
    startedAt:
      typeof value.startedAt === 'string' &&
      Number.isFinite(Date.parse(value.startedAt))
        ? value.startedAt
        : new Date().toISOString(),
    missions: Array.isArray(value.missions)
      ? value.missions.filter((id): id is string => typeof id === 'string')
      : [],
  }
}

/** The full fresh-run state, if a fresh run is active. */
export function loadFreshRunState(): FreshRunState | null {
  try {
    return parseFreshRunState(sessionStorage.getItem(FRESH_RUN_KEY))
  } catch {
    return null
  }
}

/** The fresh-run (post-reset replay) tour anchor, if a fresh run is active. */
export function loadFreshRunTour(): QuestTour | null {
  return loadFreshRunState()?.tour ?? null
}

function persistFreshRunState(state: FreshRunState): void {
  try {
    const tour = normalizeQuestTour(state.tour)
    sessionStorage.setItem(
      FRESH_RUN_KEY,
      JSON.stringify({
        world: tour.world,
        stage: tour.stage,
        startedAt: state.startedAt,
        missions: state.missions,
      }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Keeps the fresh-run anchor at the replay run's current objective. An active
 * run keeps its mission ledger and start time; when no run is active a new
 * anchor is started at the given tour (the "Skip to realm" entry point).
 */
export function saveFreshRunTour(tour: QuestTour): void {
  const state = loadFreshRunState()
  persistFreshRunState(
    state
      ? { ...state, tour }
      : { tour, startedAt: new Date().toISOString(), missions: [] },
  )
}

/**
 * Logs a cleanly replayed mission into the fresh run's ledger (no-op when no
 * fresh run is active). The overworld's replay trail treats ledger missions
 * as re-cleared beats, so the street trail advances mission by mission
 * exactly like a first playthrough — without writing durable evidence.
 */
export function recordFreshRunMissionCleared(problemId: string): void {
  const state = loadFreshRunState()
  if (!state || state.missions.includes(problemId)) return
  persistFreshRunState({
    ...state,
    missions: [...state.missions, problemId],
  })
}

/**
 * The "Reset run" control: start over at Level 1 exactly like a brand-new
 * player — intro shown, spawn plaza, street mission 1 of the first leg — while
 * every piece of durable academy evidence (practices, retentions, quiz and
 * boss records) stays untouched. Auth/session is unaffected.
 */
export function startFreshQuestRun(): void {
  clearQuestRun()
  persistFreshRunState({
    tour: { world: 0, stage: 0 },
    startedAt: new Date().toISOString(),
    missions: [],
  })
}

/**
 * Where to physically spawn when the quest jumps to a given level (0-based).
 *
 * - Level 1 (index 0): start at the spawn plaza, facing its first checkpoint.
 * - Any later level N: stand outside the PREVIOUS realm's boss,
 *   facing THIS level's FIRST checkpoint (which is the new objective once the
 *   tour stage is 0).
 */
export function spawnAtLevel(worldIndex: number): SpawnSave {
  const world = Math.max(
    0,
    Math.min(WORLD_GATES.length - 1, finiteInteger(worldIndex)),
  )
  return spawnForQuestObjective({ world, stage: 0 })
}

/**
 * Jump the guided tour to a level's Checkpoint 1 (for players who already
 * cleared earlier levels). Keeps lesson mastery; only moves the run forward.
 *
 * `welcome` distinguishes the two entry points:
 * - From the LIST view ("Skip to Level N") → the player already knows how to
 *   play, so greet them with the "Welcome to Level N" popup (intro suppressed).
 * - From the placement quiz / fresh start → show the full how-to-play intro.
 */
export function skipToLevel(worldIndex: number, opts: { welcome?: boolean } = {}) {
  const world = Math.max(
    0,
    Math.min(WORLD_GATES.length - 1, finiteInteger(worldIndex)),
  )
  const spawn = spawnAtLevel(world)
  try {
    sessionStorage.setItem(TOUR_KEY, JSON.stringify({ world, stage: 0 }))
    sessionStorage.setItem(POS_KEY, JSON.stringify(spawn))
    sessionStorage.removeItem(SKIP_SPAWN_KEY)
    clearAcademyEntryTokens()
    sessionStorage.removeItem(PART_DONE_KEY)
    sessionStorage.removeItem(ACADEMY_RETURN_KEY)
    sessionStorage.removeItem(ACADEMY_REVIEW_RETURN_KEY)
    sessionStorage.removeItem(BEAT_RETURN_KEY)
    sessionStorage.removeItem(BOSS_DONE_KEY)
    sessionStorage.removeItem(COMBAT_SNAP_KEY)
    sessionStorage.removeItem(REVIVES_KEY)
    if (opts.welcome) {
      // Suppress the how-to-play intro and queue the level-welcome popup instead.
      sessionStorage.setItem(INTRO_KEY, '1')
      sessionStorage.setItem(LEVEL_WELCOME_KEY, String(world))
    } else {
      sessionStorage.removeItem(INTRO_KEY)
      sessionStorage.removeItem(LEVEL_WELCOME_KEY)
    }
  } catch {
    /* ignore */
  }
}

/** Clears transient run state; durable academy progress chooses the next objective. */
export function clearQuestRun() {
  try {
    clearAcademyEntryTokens()
    sessionStorage.removeItem(TOUR_KEY)
    sessionStorage.removeItem(POS_KEY)
    sessionStorage.removeItem(PART_DONE_KEY)
    sessionStorage.removeItem(ACADEMY_RETURN_KEY)
    sessionStorage.removeItem(ACADEMY_REVIEW_RETURN_KEY)
    sessionStorage.removeItem(BEAT_RETURN_KEY)
    sessionStorage.removeItem(ENCOUNTERS_CLEARED_KEY)
    sessionStorage.removeItem(INTRO_KEY)
    sessionStorage.removeItem(BOSS_DONE_KEY)
    sessionStorage.removeItem(COMBAT_SNAP_KEY)
    sessionStorage.removeItem(SKIP_SPAWN_KEY)
    sessionStorage.removeItem(LEVEL_WELCOME_KEY)
    sessionStorage.removeItem(FRESH_RUN_KEY)
    sessionStorage.removeItem(REVIVES_KEY)
  } catch {
    /* ignore */
  }
}
