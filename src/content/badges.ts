import type { ComponentType } from 'react'
import { IconBolt, IconGauge, IconFlame, IconTrophy } from '../components/icons'

export type BadgeId = 'lightning' | 'quick' | 'speed-demon' | 'flawless'

export type BadgeTone = 'yellow' | 'cyan' | 'violet' | 'lime'

export type Badge = {
  id: BadgeId
  label: string
  description: string
  Icon: ComponentType<{ size?: number; className?: string }>
  tone: BadgeTone
}

/** Speed thresholds (ms) measured from when the answer UI appears. */
export const LIGHTNING_MS = 3500
export const QUICK_MS = 8000

/** Lightning answers in a single lesson needed for the Speed Demon badge. */
export const SPEED_DEMON_THRESHOLD = 3

export const BADGES: Record<BadgeId, Badge> = {
  lightning: {
    id: 'lightning',
    label: 'Lightning',
    description: 'Answered a question correctly in under 3.5 seconds.',
    Icon: IconBolt,
    tone: 'yellow',
  },
  quick: {
    id: 'quick',
    label: 'Quick Thinker',
    description: 'Answered a question correctly in under 8 seconds.',
    Icon: IconGauge,
    tone: 'cyan',
  },
  'speed-demon': {
    id: 'speed-demon',
    label: 'Speed Demon',
    description: `Earned ${SPEED_DEMON_THRESHOLD}+ Lightning answers in one lesson.`,
    Icon: IconFlame,
    tone: 'violet',
  },
  flawless: {
    id: 'flawless',
    label: 'Flawless Run',
    description: 'Completed a lesson with every answer correct on the first try.',
    Icon: IconTrophy,
    tone: 'lime',
  },
}

/** Display order for badge collections. */
export const BADGE_ORDER: BadgeId[] = ['lightning', 'quick', 'speed-demon', 'flawless']

/** Total times each badge type has been earned. */
export type BadgeCounts = Record<BadgeId, number>

export function emptyBadgeCounts(): BadgeCounts {
  return { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 }
}

export function isBadgeId(id: string): id is BadgeId {
  return id in BADGES
}

/** Merge legacy earned-id list into counts (each id += 1). */
export function badgeCountsFromEarnedList(ids: string[]): BadgeCounts {
  const counts = emptyBadgeCounts()
  for (const id of ids) {
    if (isBadgeId(id)) counts[id] += 1
  }
  return counts
}

/** Hard ceiling per badge count — protects every consumer (UI totals, the
 *  legacy cloud fallback that expands counts into an array) from corrupted
 *  values like Infinity/NaN/absurd numbers picked up from storage or a bad
 *  merge. `Array.from({ length: Infinity })` throws RangeError and used to
 *  take the whole cloud write down with it. */
const MAX_BADGE_COUNT = 100000

export function normalizeBadgeCounts(raw: Partial<BadgeCounts> | null | undefined): BadgeCounts {
  const counts = emptyBadgeCounts()
  if (!raw) return counts
  for (const id of BADGE_ORDER) {
    const n = raw[id]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      counts[id] = Math.min(MAX_BADGE_COUNT, Math.floor(n))
    }
  }
  return counts
}

export function mergeBadgeCounts(base: BadgeCounts, add: Partial<BadgeCounts>): BadgeCounts {
  const next = { ...base }
  for (const id of BADGE_ORDER) {
    const n = add[id]
    if (typeof n === 'number' && n > 0) next[id] += n
  }
  return next
}

/** Keep the higher count per badge — recovers from partial cloud/local sync. */
export function reconcileBadgeCounts(a: BadgeCounts, b: BadgeCounts): BadgeCounts {
  const next = emptyBadgeCounts()
  for (const id of BADGE_ORDER) {
    next[id] = Math.max(a[id] ?? 0, b[id] ?? 0)
  }
  return next
}

export function totalBadgeCount(counts: BadgeCounts): number {
  return BADGE_ORDER.reduce((sum, id) => sum + counts[id], 0)
}

export function badgesUnlockedCount(counts: BadgeCounts): number {
  return BADGE_ORDER.filter((id) => counts[id] > 0).length
}

/** Count badges earned in a single lesson run. */
export function computeBadgeCounts(
  a: { lightningCount: number; quickCount: number; correctFirstTry: number },
  interactiveTotal: number,
): BadgeCounts {
  const counts = emptyBadgeCounts()
  if (a.lightningCount > 0) counts.lightning = a.lightningCount
  if (a.quickCount > 0) counts.quick = a.quickCount
  if (a.lightningCount >= SPEED_DEMON_THRESHOLD) counts['speed-demon'] = 1
  if (interactiveTotal > 0 && a.correctFirstTry >= interactiveTotal) counts.flawless = 1
  return counts
}

export type SpeedTier = 'lightning' | 'quick' | null

/** Classify a single correct answer's response time. */
export function speedTier(elapsedMs: number): SpeedTier {
  if (elapsedMs <= LIGHTNING_MS) return 'lightning'
  if (elapsedMs <= QUICK_MS) return 'quick'
  return null
}

export function getBadge(id: string): Badge | undefined {
  return BADGES[id as BadgeId]
}
