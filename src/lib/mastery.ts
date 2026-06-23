import { MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'

export type MasteryBand = 'strong' | 'ready' | 'review' | 'struggling'

/**
 * MVP mastery formula from the PRD:
 * mastery = min(100, 50 + correctFirstTry*10 + completedSteps*5 - wrongAttempts*3)
 */
export function computeMastery(input: {
  correctFirstTry: number
  completedSteps: number
  wrongAttempts: number
}): number {
  const raw =
    50 +
    input.correctFirstTry * 10 +
    input.completedSteps * 5 -
    input.wrongAttempts * 3
  return Math.max(0, Math.min(100, Math.round(raw)))
}

export function masteryBand(score: number): MasteryBand {
  if (score >= 90) return 'strong'
  if (score >= MASTERY_UNLOCK_THRESHOLD) return 'ready'
  if (score >= 50) return 'review'
  return 'struggling'
}

export function bandLabel(band: MasteryBand): string {
  switch (band) {
    case 'strong':
      return 'Strong mastery'
    case 'ready':
      return 'Ready to continue'
    case 'review':
      return 'Needs review'
    case 'struggling':
      return 'Keep practicing'
  }
}

export function meetsUnlockThreshold(score: number): boolean {
  return score >= MASTERY_UNLOCK_THRESHOLD
}
