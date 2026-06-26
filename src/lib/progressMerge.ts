import { mergeBadgeCounts, reconcileBadgeCounts } from '../content/badges'
import type { LessonProgress, ProgressState, StreakState } from '../types/progress'
import { hasQuizActivity } from './lessonSections'
import { meetsUnlockThreshold } from './mastery'

/**
 * Merge a new in-progress save without dropping section flags or step ids.
 */
export function mergeInProgress(
  existing: LessonProgress,
  next: LessonProgress,
): LessonProgress {
  return {
    ...next,
    status:
      existing.status === 'completed' || next.status === 'completed'
        ? next.status
        : 'inProgress',
    currentStepIndex: Math.max(
      existing.currentStepIndex ?? 0,
      next.currentStepIndex ?? 0,
    ),
    completedStepIds: [
      ...new Set([...existing.completedStepIds, ...next.completedStepIds]),
    ],
    correctCount: Math.max(existing.correctCount, next.correctCount),
    wrongCount: Math.max(existing.wrongCount, next.wrongCount),
    totalAttempts: Math.max(existing.totalAttempts, next.totalAttempts),
    correctFirstTry: Math.max(existing.correctFirstTry, next.correctFirstTry),
    accuracy: Math.max(existing.accuracy, next.accuracy),
    learnCompleted: existing.learnCompleted || next.learnCompleted,
    learnStepIndex: Math.max(
      existing.learnStepIndex ?? 0,
      next.learnStepIndex ?? 0,
    ),
    learnFrameIndex:
      (next.learnStepIndex ?? 0) !== (existing.learnStepIndex ?? 0)
        ? (next.learnFrameIndex ?? 0)
        : Math.max(existing.learnFrameIndex ?? 0, next.learnFrameIndex ?? 0),
    quizStepIndex: Math.max(
      existing.quizStepIndex ?? 0,
      next.quizStepIndex ?? 0,
    ),
    quizFrameIndex:
      (next.quizStepIndex ?? 0) !== (existing.quizStepIndex ?? 0)
        ? (next.quizFrameIndex ?? 0)
        : Math.max(existing.quizFrameIndex ?? 0, next.quizFrameIndex ?? 0),
    masteryScore: hasQuizActivity(next)
      ? Math.max(existing.masteryScore ?? 0, next.masteryScore ?? 0)
      : hasQuizActivity(existing)
        ? existing.masteryScore
        : Math.max(existing.masteryScore ?? 0, next.masteryScore ?? 0),
    unlockNextLesson: existing.unlockNextLesson || next.unlockNextLesson,
    lastReview: next.lastReview ?? existing.lastReview,
    lastQuizBadgeCounts: next.lastQuizBadgeCounts ?? existing.lastQuizBadgeCounts,
    pendingBadgeCounts: next.pendingBadgeCounts ?? existing.pendingBadgeCounts,
    updatedAt:
      [existing.updatedAt, next.updatedAt]
        .filter(Boolean)
        .sort()
        .at(-1) ?? next.updatedAt,
  }
}

/**
 * Merge a new attempt into an already-completed lesson so reviewing/replaying
 * can only improve (or hold) progress — never lose it. Best metrics win.
 */
export function mergeCompleted(
  existing: LessonProgress,
  next: LessonProgress,
): LessonProgress {
  const completedStepIds = [
    ...new Set([...existing.completedStepIds, ...next.completedStepIds]),
  ]
  return {
    ...next,
    status: 'completed',
    completedStepIds,
    correctCount: Math.max(existing.correctCount, next.correctCount),
    correctFirstTry: Math.max(existing.correctFirstTry, next.correctFirstTry),
    accuracy: Math.max(existing.accuracy, next.accuracy),
    masteryScore: Math.max(existing.masteryScore, next.masteryScore),
    unlockNextLesson:
      existing.unlockNextLesson ||
      next.unlockNextLesson ||
      meetsUnlockThreshold(Math.max(existing.masteryScore, next.masteryScore)),
    completedAt: existing.completedAt ?? next.completedAt,
    wrongCount: Math.max(existing.wrongCount, next.wrongCount),
    totalAttempts: Math.max(existing.totalAttempts, next.totalAttempts),
    currentStepIndex: Math.max(
      existing.currentStepIndex ?? 0,
      next.currentStepIndex ?? 0,
    ),
    updatedAt:
      [existing.updatedAt, next.updatedAt]
        .filter(Boolean)
        .sort()
        .at(-1) ?? next.updatedAt ?? new Date().toISOString(),
    lastReview: next.lastReview ?? existing.lastReview,
    lastQuizBadgeCounts: next.lastQuizBadgeCounts ?? existing.lastQuizBadgeCounts,
    learnCompleted: existing.learnCompleted || next.learnCompleted,
    learnStepIndex: Math.max(
      existing.learnStepIndex ?? 0,
      next.learnStepIndex ?? 0,
    ),
    learnFrameIndex:
      (next.learnStepIndex ?? 0) !== (existing.learnStepIndex ?? 0)
        ? (next.learnFrameIndex ?? 0)
        : Math.max(existing.learnFrameIndex ?? 0, next.learnFrameIndex ?? 0),
    quizStepIndex: Math.max(
      existing.quizStepIndex ?? 0,
      next.quizStepIndex ?? 0,
    ),
    quizFrameIndex:
      (next.quizStepIndex ?? 0) !== (existing.quizStepIndex ?? 0)
        ? (next.quizFrameIndex ?? 0)
        : Math.max(existing.quizFrameIndex ?? 0, next.quizFrameIndex ?? 0),
  }
}

/** Pick the furthest-along snapshot from two copies of the same lesson. */
export function reconcileLessonProgress(
  a: LessonProgress,
  b: LessonProgress,
): LessonProgress {
  if (a.status === 'completed' && b.status === 'completed') {
    return mergeCompleted(a, b)
  }
  if (a.status === 'completed') {
    return mergeCompleted(a, mergeInProgress(a, b))
  }
  if (b.status === 'completed') {
    return mergeCompleted(b, mergeInProgress(b, a))
  }
  return mergeInProgress(b, mergeInProgress(a, b))
}

function reconcileStreak(a: StreakState, b: StreakState): StreakState {
  const aDate = a.lastActivityDate ?? ''
  const bDate = b.lastActivityDate ?? ''
  if (aDate === bDate) {
    return {
      current: Math.max(a.current, b.current),
      longest: Math.max(a.longest, b.longest),
      lastActivityDate: aDate || bDate || undefined,
    }
  }
  return aDate > bDate ? a : b
}

/** Merge cloud and local snapshots — never drop the furthest lesson progress. */
export function mergeProgressStates(
  cloud: ProgressState,
  local: ProgressState,
): ProgressState {
  const lessons: ProgressState['lessons'] = { ...cloud.lessons }

  for (const [lessonId, localLesson] of Object.entries(local.lessons)) {
    const cloudLesson = lessons[lessonId]
    lessons[lessonId] = cloudLesson
      ? reconcileLessonProgress(cloudLesson, localLesson)
      : localLesson
  }

  // "The Threshold" is a one-way latch: once either side has cleared it, the
  // merge must keep it cleared. Keep the earliest known completion timestamp.
  const interZoneComplete =
    (cloud.interZoneComplete ?? false) || (local.interZoneComplete ?? false)
  const interZoneCompletedAt = interZoneComplete
    ? ([cloud.interZoneCompletedAt, local.interZoneCompletedAt]
        .filter((t): t is string => !!t)
        .sort()[0] ?? undefined)
    : undefined

  return {
    experienceLevel: cloud.experienceLevel ?? local.experienceLevel,
    // Placement lives client-side (no cloud column yet); keep whichever side has
    // the further-reaching unlock so a device that ran the diagnostic wins.
    placementUnlockIndex:
      Math.max(
        cloud.placementUnlockIndex ?? -1,
        local.placementUnlockIndex ?? -1,
      ) >= 0
        ? Math.max(
            cloud.placementUnlockIndex ?? -1,
            local.placementUnlockIndex ?? -1,
          )
        : undefined,
    recommendedLessonId: cloud.recommendedLessonId ?? local.recommendedLessonId,
    streak: reconcileStreak(cloud.streak, local.streak),
    badgeCounts: reconcileBadgeCounts(
      cloud.badgeCounts,
      mergeBadgeCounts(cloud.badgeCounts, local.badgeCounts),
    ),
    interZoneComplete,
    interZoneCompletedAt,
    lessons,
  }
}
