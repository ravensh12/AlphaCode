import type { ProgressState } from '../types/progress'
import type { BadgeCounts } from '../content/badges'
import {
  badgeCountsFromEarnedList,
  emptyBadgeCounts,
  normalizeBadgeCounts,
} from '../content/badges'

export function emptyState(): ProgressState {
  return { streak: { current: 0, longest: 0 }, lessons: {}, badgeCounts: emptyBadgeCounts() }
}

function normalizeState(parsed: Partial<ProgressState> & { earnedBadges?: string[] }): ProgressState {
  const base = emptyState()
  let badgeCounts: BadgeCounts = base.badgeCounts
  if (parsed.badgeCounts) {
    badgeCounts = normalizeBadgeCounts(parsed.badgeCounts)
  } else if (Array.isArray(parsed.earnedBadges)) {
    badgeCounts = badgeCountsFromEarnedList(parsed.earnedBadges)
  }
  return {
    ...base,
    ...parsed,
    streak: { ...base.streak, ...parsed.streak },
    lessons: parsed.lessons ?? {},
    badgeCounts,
  }
}

const keyFor = (identityId: string) => `alphacode.progress.${identityId}`

export function loadLocal(identityId: string): ProgressState {
  try {
    const raw = localStorage.getItem(keyFor(identityId))
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<ProgressState> & { earnedBadges?: string[] }
    return normalizeState(parsed)
  } catch {
    return emptyState()
  }
}

export function saveLocal(identityId: string, state: ProgressState): void {
  try {
    localStorage.setItem(keyFor(identityId), JSON.stringify(state))
  } catch {
    // ignore quota / availability errors in the MVP
  }
}

export function removeLocal(identityId: string): void {
  try {
    localStorage.removeItem(keyFor(identityId))
  } catch {
    // ignore availability errors in the MVP
  }
}
