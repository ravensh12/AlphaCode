/**
 * Lightweight XP / level model shared by the open world (zombie kills) and the
 * lessons (fast correct answers). Persisted per-identity in localStorage.
 */

/** XP needed to advance FROM `level` to the next level. Ramps up gently. */
export function costForLevel(level: number): number {
  return 100 + (Math.max(1, level) - 1) * 60
}

export type LevelInfo = {
  level: number
  /** XP accumulated within the current level. */
  intoLevel: number
  /** XP required to clear the current level. */
  needed: number
  /** 0..1 progress through the current level. */
  fraction: number
  /** Total lifetime XP. */
  xp: number
}

export function levelInfo(xpRaw: number): LevelInfo {
  const total = Math.max(0, Math.floor(xpRaw || 0))
  let remaining = total
  let level = 1
  let needed = costForLevel(level)
  while (remaining >= needed) {
    remaining -= needed
    level += 1
    needed = costForLevel(level)
  }
  return {
    level,
    intoLevel: remaining,
    needed,
    fraction: needed > 0 ? remaining / needed : 0,
    xp: total,
  }
}

const TITLES = [
  'Sprout',
  'Scout',
  'Pathfinder',
  'Trailblazer',
  'Adventurer',
  'Ranger',
  'Champion',
  'Hero',
  'Legend',
  'Mythic',
]

export function levelTitle(level: number): string {
  return TITLES[Math.min(Math.max(0, level - 1), TITLES.length - 1)]
}

/** XP for clearing a question — faster first-try answers earn more. */
export function answerXp(correct: boolean, firstTry: boolean, responseMs: number): number {
  if (!correct) return 0
  if (!firstTry) return 3
  const seconds = responseMs / 1000
  if (seconds <= 3) return 18
  if (seconds <= 6) return 12
  if (seconds <= 12) return 7
  return 4
}

/** XP for taking down a zombie. */
export const KILL_XP = 14
