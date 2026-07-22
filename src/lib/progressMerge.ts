import { reconcileBadgeCounts } from '../content/badges'
import type { BadgeCounts } from '../content/badges'
import type {
  ExperienceLevel,
  LessonProgress,
  LessonReview,
  ProgressState,
  StreakState,
} from '../types/progress'
import { meetsUnlockThreshold } from './mastery'
import { mergeLearnerModels } from './learnerModel'
import { mergeAcademyProgressStates } from './academyProgress'

export { mergeAcademyProgressStates } from './academyProgress'

type SectionPosition = {
  readonly stepIndex?: number
  readonly frameIndex?: number
}

function furthestPosition(
  aStep: number | undefined,
  aFrame: number | undefined,
  bStep: number | undefined,
  bFrame: number | undefined,
): SectionPosition {
  if (
    aStep === undefined &&
    aFrame === undefined &&
    bStep === undefined &&
    bFrame === undefined
  ) {
    return {}
  }
  const a: readonly [number, number] = [aStep ?? 0, aFrame ?? 0]
  const b: readonly [number, number] = [bStep ?? 0, bFrame ?? 0]
  const selected = a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]) ? a : b
  return { stepIndex: selected[0], frameIndex: selected[1] }
}

const earliest = (
  ...values: readonly (string | undefined)[]
): string | undefined =>
  values.filter((value): value is string => !!value).sort()[0]

const latest = (
  ...values: readonly (string | undefined)[]
): string | undefined =>
  values
    .filter((value): value is string => !!value)
    .sort()
    .at(-1)

function latestReview(
  a: LessonReview | undefined,
  b: LessonReview | undefined,
): LessonReview | undefined {
  if (!a) return b
  if (!b) return a
  const parsedA = Date.parse(a.recordedAt)
  const parsedB = Date.parse(b.recordedAt)
  const aTime = Number.isFinite(parsedA) ? parsedA : Number.NEGATIVE_INFINITY
  const bTime = Number.isFinite(parsedB) ? parsedB : Number.NEGATIVE_INFINITY
  if (aTime !== bTime) return aTime > bTime ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

function optionalBadgeCounts(
  a: BadgeCounts | undefined,
  b: BadgeCounts | undefined,
): BadgeCounts | undefined {
  if (!a) return b
  if (!b) return a
  return reconcileBadgeCounts(a, b)
}

function joinedLessonProgress(
  a: LessonProgress,
  b: LessonProgress,
  forceCompleted = false,
): LessonProgress {
  if (a.lessonId !== b.lessonId) {
    throw new Error('Cannot reconcile different lessons')
  }
  const completed =
    forceCompleted || a.status === 'completed' || b.status === 'completed'
  const status = completed
    ? 'completed'
    : a.status === 'inProgress' || b.status === 'inProgress'
      ? 'inProgress'
      : 'notStarted'
  const masteryScore = Math.max(a.masteryScore, b.masteryScore)
  const learn = furthestPosition(
    a.learnStepIndex,
    a.learnFrameIndex,
    b.learnStepIndex,
    b.learnFrameIndex,
  )
  const quiz = furthestPosition(
    a.quizStepIndex,
    a.quizFrameIndex,
    b.quizStepIndex,
    b.quizFrameIndex,
  )
  return {
    lessonId: a.lessonId,
    status,
    currentStepIndex: Math.max(a.currentStepIndex, b.currentStepIndex),
    completedStepIds: [...new Set([...a.completedStepIds, ...b.completedStepIds])]
      .sort(),
    correctCount: Math.max(a.correctCount, b.correctCount),
    wrongCount: Math.max(a.wrongCount, b.wrongCount),
    totalAttempts: Math.max(a.totalAttempts, b.totalAttempts),
    correctFirstTry: Math.max(a.correctFirstTry, b.correctFirstTry),
    accuracy: Math.max(a.accuracy, b.accuracy),
    masteryScore,
    unlockNextLesson:
      a.unlockNextLesson ||
      b.unlockNextLesson ||
      (completed && meetsUnlockThreshold(masteryScore)),
    completedAt: completed ? earliest(a.completedAt, b.completedAt) : undefined,
    updatedAt: latest(a.updatedAt, b.updatedAt),
    lastReview: latestReview(a.lastReview, b.lastReview),
    learnCompleted: a.learnCompleted || b.learnCompleted,
    learnStepIndex: learn.stepIndex,
    learnFrameIndex: learn.frameIndex,
    quizStepIndex: quiz.stepIndex,
    quizFrameIndex: quiz.frameIndex,
    lastQuizBadgeCounts: optionalBadgeCounts(
      a.lastQuizBadgeCounts,
      b.lastQuizBadgeCounts,
    ),
    pendingBadgeCounts: optionalBadgeCounts(
      a.pendingBadgeCounts,
      b.pendingBadgeCounts,
    ),
  }
}

/** Merge a new in-progress save without splitting section step/frame tuples. */
export function mergeInProgress(
  existing: LessonProgress,
  next: LessonProgress,
): LessonProgress {
  return joinedLessonProgress(existing, next)
}

/** Merge completed snapshots as a commutative, idempotent best-known view. */
export function mergeCompleted(
  existing: LessonProgress,
  next: LessonProgress,
): LessonProgress {
  return joinedLessonProgress(existing, next, true)
}

/** Pick the furthest-along snapshot from two copies of the same lesson. */
export function reconcileLessonProgress(
  a: LessonProgress,
  b: LessonProgress,
): LessonProgress {
  return joinedLessonProgress(a, b)
}

export function reconcileStreak(a: StreakState, b: StreakState): StreakState {
  const aDate = a.lastActivityDate ?? ''
  const bDate = b.lastActivityDate ?? ''
  const newest = aDate === bDate ? null : aDate > bDate ? a : b
  return {
    current: newest ? newest.current : Math.max(a.current, b.current),
    longest: Math.max(a.longest, b.longest),
    lastActivityDate: latest(a.lastActivityDate, b.lastActivityDate),
  }
}

function reconcileExperienceLevel(
  a: ExperienceLevel | undefined,
  b: ExperienceLevel | undefined,
): ExperienceLevel | undefined {
  const rank: Record<ExperienceLevel, number> = {
    new: 0,
    some: 1,
    class: 2,
  }
  if (!a) return b
  if (!b) return a
  return rank[a] >= rank[b] ? a : b
}

function reconcileOptionalString(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

/** Merge cloud and local snapshots — never drop the furthest lesson progress. */
export function mergeProgressStates(
  cloud: ProgressState,
  local: ProgressState,
): ProgressState {
  const lessons: ProgressState['lessons'] = { ...cloud.lessons }
  const academyProgress =
    cloud.academyProgress !== undefined || local.academyProgress !== undefined
      ? mergeAcademyProgressStates(
          cloud.academyProgress,
          local.academyProgress,
        )
      : undefined

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
    experienceLevel: reconcileExperienceLevel(
      cloud.experienceLevel,
      local.experienceLevel,
    ),
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
    recommendedLessonId: reconcileOptionalString(
      cloud.recommendedLessonId,
      local.recommendedLessonId,
    ),
    streak: reconcileStreak(cloud.streak, local.streak),
    // Counts are snapshots, not deltas. Adding before reconciling duplicated
    // badges every time the same cloud/local pair was hydrated.
    badgeCounts: reconcileBadgeCounts(cloud.badgeCounts, local.badgeCounts),
    interZoneComplete,
    interZoneCompletedAt,
    learnerModel: mergeLearnerModels(cloud.learnerModel, local.learnerModel),
    ...(academyProgress ? { academyProgress } : {}),
    lessons,
  }
}
