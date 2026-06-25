import type { WorldState } from './questState'

/** One-time tokens set when entering from the 3D overworld (E at a gate). */
export const LESSON_ENTRY_KEY = 'alphacode.game.lessonEntry'
export const BOSS_ENTRY_KEY = 'alphacode.game.bossEntry'

type LessonEntry = { world: number; part: number }

/** Cleared levels can open Train / Boss from the list view; in-progress levels cannot. */
export function canBrowseLevelInList(state: WorldState): boolean {
  return state.mastered
}

export function grantLessonEntry(worldIndex: number, part: number) {
  try {
    sessionStorage.setItem(LESSON_ENTRY_KEY, JSON.stringify({ world: worldIndex, part }))
  } catch {
    /* ignore */
  }
}

export function grantBossEntry(worldIndex: number) {
  try {
    sessionStorage.setItem(BOSS_ENTRY_KEY, String(worldIndex))
  } catch {
    /* ignore */
  }
}

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

/** Boss fights from the overworld also require a one-time token (unless rematching a cleared level). */
export function consumeBossEntry(worldIndex: number): boolean {
  try {
    const raw = sessionStorage.getItem(BOSS_ENTRY_KEY)
    sessionStorage.removeItem(BOSS_ENTRY_KEY)
    return raw != null && parseInt(raw, 10) === worldIndex
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

export function canAccessBossFight(worldIndex: number, mastered: boolean): boolean {
  if (mastered) return true
  return consumeBossEntry(worldIndex)
}
