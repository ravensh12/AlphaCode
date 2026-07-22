/** One-time token set when entering from the 3D overworld (E at a gate). */
export const LESSON_ENTRY_KEY = 'alphacode.game.lessonEntry'
/** Stable for the full academy visit so a track can advance across many missions. */
export const ACADEMY_TRACK_ENTRY_KEY = 'alphacode.game.academyTrackEntry'
/** Stable through the realm assessment and every retry of its physical fight. */
export const ACADEMY_BOSS_ENTRY_KEY = 'alphacode.game.academyBossEntry'

type LessonEntry = { world: number; part: number }
type AcademyTrackEntry = { realmId: string; trackId: string }
type AcademyBossEntry = { realmId: string }
export type GameAccessStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const accessStorage = (storage?: GameAccessStorage): GameAccessStorage =>
  storage ?? globalThis.sessionStorage

/** Consume the overworld token — valid only once, right after pressing E at a gate. */
export function consumeLessonEntry(worldIndex: number, part: number): boolean {
  try {
    const raw = sessionStorage.getItem(LESSON_ENTRY_KEY)
    sessionStorage.removeItem(LESSON_ENTRY_KEY)
    if (!raw) return false
    const entry = JSON.parse(raw) as LessonEntry
    return entry.world === worldIndex && entry.part === part
  } catch {
    return false
  }
}

export function canAccessLessonPart(
  worldIndex: number,
  part: number | null,
  mastered: boolean,
): boolean {
  if (mastered) return true
  if (part == null) return false
  return consumeLessonEntry(worldIndex, part)
}

/**
 * Grant one physical academy checkpoint. Unlike the historical lesson token,
 * this is intentionally stable: a track contains several mission routes and
 * replacing/consuming the token on the first mission would strand the learner.
 */
export function grantAcademyTrackEntry(
  realmId: string,
  trackId: string,
  storage?: GameAccessStorage,
): void {
  try {
    const store = accessStorage(storage)
    store.setItem(
      ACADEMY_TRACK_ENTRY_KEY,
      JSON.stringify({ realmId, trackId } satisfies AcademyTrackEntry),
    )
    store.removeItem(ACADEMY_BOSS_ENTRY_KEY)
  } catch {
    /* ignore unavailable session storage */
  }
}

export function hasAcademyTrackEntry(
  realmId: string,
  trackId: string,
  storage?: GameAccessStorage,
): boolean {
  try {
    const raw = accessStorage(storage).getItem(ACADEMY_TRACK_ENTRY_KEY)
    if (!raw) return false
    const entry = JSON.parse(raw) as Partial<AcademyTrackEntry>
    return entry.realmId === realmId && entry.trackId === trackId
  } catch {
    return false
  }
}

export function grantAcademyBossEntry(
  realmId: string,
  storage?: GameAccessStorage,
): void {
  try {
    const store = accessStorage(storage)
    store.setItem(
      ACADEMY_BOSS_ENTRY_KEY,
      JSON.stringify({ realmId } satisfies AcademyBossEntry),
    )
    store.removeItem(ACADEMY_TRACK_ENTRY_KEY)
  } catch {
    /* ignore unavailable session storage */
  }
}

export function hasAcademyBossEntry(
  realmId: string,
  storage?: GameAccessStorage,
): boolean {
  try {
    const raw = accessStorage(storage).getItem(ACADEMY_BOSS_ENTRY_KEY)
    if (!raw) return false
    const entry = JSON.parse(raw) as Partial<AcademyBossEntry>
    return entry.realmId === realmId
  } catch {
    return false
  }
}

export function canAccessAcademyMissionEntry(
  realmId: string,
  trackId: string,
  options: { completed: boolean; guestPreview: boolean },
  storage?: GameAccessStorage,
): boolean {
  return (
    options.completed ||
    options.guestPreview ||
    hasAcademyTrackEntry(realmId, trackId, storage)
  )
}

export function canAccessAcademyBossEntry(
  realmId: string,
  realmCleared: boolean,
  storage?: GameAccessStorage,
): boolean {
  return realmCleared || hasAcademyBossEntry(realmId, storage)
}

export function clearAcademyEntryTokens(storage?: GameAccessStorage): void {
  try {
    const store = accessStorage(storage)
    store.removeItem(ACADEMY_TRACK_ENTRY_KEY)
    store.removeItem(ACADEMY_BOSS_ENTRY_KEY)
  } catch {
    /* ignore unavailable session storage */
  }
}
