import { MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'
import type { LessonProgress } from '../types/progress'

export type MasteryBand = 'strong' | 'ready' | 'review' | 'struggling'

/**
 * Legacy formula (kept for reference). Quiz scoring uses {@link computeQuizMastery}.
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

/**
 * Quiz mastery = percent of interactive questions you got right on the first try.
 * No free base points for finishing a question you missed — review raises the score.
 */
export function computeQuizMastery(
  correctFirstTry: number,
  interactiveTotal: number,
): number {
  if (interactiveTotal <= 0) return 0
  return Math.round((correctFirstTry / interactiveTotal) * 100)
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

/** Quiz finished below 75% with missed questions still to review. */
export function hasPendingMissedReview(
  progress: LessonProgress | undefined,
): boolean {
  if (!progress) return false
  if (meetsUnlockThreshold(progress.masteryScore)) return false
  return (progress.lastReview?.missedStepIds.length ?? 0) > 0
}

/** Points added when a missed question is answered correctly in review. */
export function masteryBoostForClear(
  currentMastery: number,
  remainingMissedCount: number,
): number {
  if (remainingMissedCount <= 0) return 0
  const gap = Math.max(0, MASTERY_UNLOCK_THRESHOLD - currentMastery)
  if (gap === 0) return 0
  return Math.max(1, Math.ceil(gap / remainingMissedCount))
}

/** New mastery after clearing one missed question in review. */
export function applyReviewClear(
  currentMastery: number,
  remainingMissedCount: number,
): number {
  return Math.min(
    100,
    currentMastery + masteryBoostForClear(currentMastery, remainingMissedCount),
  )
}

/** Next lesson unlocks once this lesson reaches 75% mastery — flag persists after restart. */
export function canUnlockNextLesson(
  progress: LessonProgress | undefined,
): boolean {
  if (!progress) return false
  return progress.unlockNextLesson === true
}

/** Permanent mastered state — survives quiz restart. */
export function hasEverMastered(
  progress: LessonProgress | undefined,
): boolean {
  return progress?.unlockNextLesson === true
}

/** Set unlock flag when threshold is met; never clears once true. */
export function markUnlockAchieved(
  progress: LessonProgress,
  masteryScore?: number,
): boolean {
  return (
    progress.unlockNextLesson ||
    meetsUnlockThreshold(masteryScore ?? progress.masteryScore)
  )
}
