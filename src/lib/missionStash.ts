import type { AssessmentResponseV1 } from '../types/assessment'

/* ============================================================================
   Mission stash — per-mission IN-FLIGHT state that survives a tab close.

   The durable evidence contract (missionPractices/completions) and the saved
   LessonProgress (step index, aggregates) are untouched; this layer only
   stashes what those deliberately don't hold:
   - the current step's in-progress answer (critically: the Python editor
     code, which otherwise vanishes on refresh),
   - the tutor chat for this mission.

   Keys are versioned and identity-scoped (postgame.ts / realmSkip.ts
   convention) so a second account on the device never inherits drafts. A
   stash is cleared when the mission records practice/retention evidence or
   when a finished run is rejected and restarts fresh — completed missions
   restart clean. Unknown schema versions and malformed JSON read as null.
   ========================================================================== */

export const MISSION_STASH_VERSION = 1
/** Versioned base key; identity id + lesson id are appended. */
export const MISSION_STASH_KEY = 'alphacode.mission.stash.v1'

const GUEST_IDENTITY = 'guest'

export type TutorChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type MissionStash = {
  v: typeof MISSION_STASH_VERSION
  savedAt: string
  section: 'learn' | 'quiz'
  /** Engine step index the stashed response belongs to. */
  stepIndex: number
  /** In-flight answer for that step (editor code, choice draft, …). */
  response: AssessmentResponseV1 | null
  /** Session tutor chat for this mission. */
  tutor: TutorChatMessage[]
}

export type MissionStashDraft = Omit<MissionStash, 'v' | 'savedAt'>

/** Storage seam for tests (mirrors PostgameStorage in postgame.ts). */
export type MissionStashStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

function defaultStorage(): MissionStashStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function missionStashKey(
  lessonId: string,
  identityId?: string | null,
): string {
  const id = identityId && identityId.length > 0 ? identityId : GUEST_IDENTITY
  return `${MISSION_STASH_KEY}.${id}.${lessonId}`
}

function isTutorMessage(value: unknown): value is TutorChatMessage {
  if (!value || typeof value !== 'object') return false
  const msg = value as Record<string, unknown>
  return (
    (msg.role === 'user' || msg.role === 'assistant') &&
    typeof msg.content === 'string'
  )
}

export function loadMissionStash(
  lessonId: string,
  identityId?: string | null,
  storage?: MissionStashStorage,
): MissionStash | null {
  const store = storage ?? defaultStorage()
  if (!store) return null
  try {
    const raw = store.getItem(missionStashKey(lessonId, identityId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const stash = parsed as Record<string, unknown>
    // Future schema versions are ignored rather than misread.
    if (stash.v !== MISSION_STASH_VERSION) return null
    if (stash.section !== 'learn' && stash.section !== 'quiz') return null
    if (
      typeof stash.stepIndex !== 'number' ||
      !Number.isInteger(stash.stepIndex) ||
      stash.stepIndex < 0
    ) {
      return null
    }
    return {
      v: MISSION_STASH_VERSION,
      savedAt: typeof stash.savedAt === 'string' ? stash.savedAt : '',
      section: stash.section,
      stepIndex: stash.stepIndex,
      response:
        stash.response && typeof stash.response === 'object'
          ? (stash.response as AssessmentResponseV1)
          : null,
      tutor: Array.isArray(stash.tutor)
        ? stash.tutor.filter(isTutorMessage)
        : [],
    }
  } catch {
    return null
  }
}

export function saveMissionStash(
  lessonId: string,
  draft: MissionStashDraft,
  identityId?: string | null,
  storage?: MissionStashStorage,
): void {
  const store = storage ?? defaultStorage()
  if (!store) return
  try {
    const stash: MissionStash = {
      v: MISSION_STASH_VERSION,
      savedAt: new Date().toISOString(),
      ...draft,
    }
    store.setItem(missionStashKey(lessonId, identityId), JSON.stringify(stash))
  } catch {
    /* storage unavailable / quota — the stash is best-effort */
  }
}

export function clearMissionStash(
  lessonId: string,
  identityId?: string | null,
  storage?: MissionStashStorage,
): void {
  const store = storage ?? defaultStorage()
  if (!store) return
  try {
    store.removeItem(missionStashKey(lessonId, identityId))
  } catch {
    /* ignore */
  }
}

/**
 * Bound handle so UI layers never learn about keys or identity — the mission
 * flow builds one per mission and the lesson runner just calls it.
 */
export type MissionStashHandle = {
  load: () => MissionStash | null
  save: (draft: MissionStashDraft) => void
  clear: () => void
}

export function makeMissionStashHandle(
  lessonId: string,
  identityId?: string | null,
  storage?: MissionStashStorage,
): MissionStashHandle {
  return {
    load: () => loadMissionStash(lessonId, identityId, storage),
    save: (draft) => saveMissionStash(lessonId, draft, identityId, storage),
    clear: () => clearMissionStash(lessonId, identityId, storage),
  }
}
