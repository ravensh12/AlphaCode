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
