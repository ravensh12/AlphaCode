import { isInteractiveType } from '../content/lessons/shared'
import { hasPendingMissedReview, meetsUnlockThreshold } from './mastery'
import type { Lesson, LessonStep } from '../types/lesson'
import type { LessonProgress } from '../types/progress'

export type CourseSection = 'learn' | 'quiz'

export function stepsForSection(
  steps: LessonStep[],
  section: CourseSection,
): LessonStep[] {
  return steps.filter((s) =>
    section === 'learn' ? s.section === 'teach' : s.section === 'quiz',
  )
}

export function interactiveStepsForSection(
  steps: LessonStep[],
  section: CourseSection,
): LessonStep[] {
  return stepsForSection(steps, section).filter((s) => isInteractiveType(s.type))
}

export function isLearnComplete(
  progress: LessonProgress | undefined,
  lesson: Lesson,
): boolean {
  if (!progress) return false
  if (progress.learnCompleted) return true

  // Quiz progress is only reachable after learn — don't re-lock the quiz on refresh.
  if (progress.status === 'completed' || progress.quizStepIndex != null) {
    return true
  }

  const teachSteps = stepsForSection(lesson.steps, 'learn')
  if (teachSteps.length === 0) return false

  const interactive = interactiveStepsForSection(lesson.steps, 'learn')
  if (interactive.length === 0) {
    return (progress.learnStepIndex ?? 0) >= teachSteps.length - 1
  }

  return interactive.every((s) => progress.completedStepIds.includes(s.id))
}

/** Persist learnCompleted when we can infer it from saved progress. */
export function withLearnCompletedFlag(
  progress: LessonProgress,
  lesson: Lesson,
): LessonProgress {
  if (progress.learnCompleted || !isLearnComplete(progress, lesson)) {
    return progress
  }
  return { ...progress, learnCompleted: true }
}

export function sectionResumeIndex(
  progress: LessonProgress | undefined,
  section: CourseSection,
  lesson: Lesson,
): number | undefined {
  if (!progress) return undefined

  if (section === 'learn') {
    const teachSteps = stepsForSection(lesson.steps, 'learn')
    const lastIdx = Math.max(0, teachSteps.length - 1)
    const idx = progress.learnStepIndex ?? progress.currentStepIndex
    if (idx == null) return undefined
    // Finished the learn section — completion UI handles the end state.
    if (progress.learnCompleted && idx >= lastIdx) return undefined
    return Math.min(Math.max(0, idx), lastIdx)
  }

  if (!isLearnComplete(progress, lesson)) return undefined
  if (hasPendingMissedReview(progress) && progress.lastReview) {
    return progress.lastReview.reviewStepIndex ?? 0
  }
  if (progress.status === 'completed') return undefined
  if (progress.quizStepIndex != null) return progress.quizStepIndex
  // Legacy rows may only have current_step_index from an in-progress quiz.
  if (progress.learnCompleted && (progress.currentStepIndex ?? 0) > 0) {
    return progress.currentStepIndex
  }
  return undefined
}

/** Minimal row when a learner opens a section before any save has occurred. */
export function freshLessonProgress(
  lessonId: string,
  section: CourseSection,
): LessonProgress {
  const now = new Date().toISOString()
  return {
    lessonId,
    status: 'inProgress',
    currentStepIndex: 0,
    completedStepIds: [],
    correctCount: 0,
    wrongCount: 0,
    totalAttempts: 0,
    correctFirstTry: 0,
    accuracy: 0,
    masteryScore: 0,
    unlockNextLesson: false,
    updatedAt: now,
    ...(section === 'learn'
      ? { learnStepIndex: 0, learnFrameIndex: 0 }
      : { learnCompleted: true, quizStepIndex: 0, quizFrameIndex: 0 }),
  }
}

export function sectionResumeFrameIndex(
  progress: LessonProgress | undefined,
  section: CourseSection,
): number {
  if (!progress) return 0
  if (section === 'learn') return progress.learnFrameIndex ?? 0
  if (progress.lastReview?.reviewFrameIndex != null && hasPendingMissedReview(progress)) {
    return progress.lastReview.reviewFrameIndex
  }
  return progress.quizFrameIndex ?? 0
}

/** Frame index when resuming a review session. */
export function reviewResumeFrameIndex(
  progress: LessonProgress | undefined,
): number {
  return progress?.lastReview?.reviewFrameIndex ?? 0
}


/** True once the learner has started or finished the quiz section. */
export function hasQuizActivity(progress: LessonProgress | undefined): boolean {
  if (!progress) return false
  return progress.status === 'completed' || progress.quizStepIndex != null
}

/**
 * masteryScore is quiz-only. Clear stale scores saved from learn checkpoints.
 */
export function normalizeLessonProgress(progress: LessonProgress): LessonProgress {
  let normalized = progress

  if (
    hasQuizActivity(normalized) &&
    meetsUnlockThreshold(normalized.masteryScore) &&
    !normalized.unlockNextLesson
  ) {
    normalized = { ...normalized, unlockNextLesson: true }
  }

  if (hasQuizActivity(normalized)) return normalized

  if (normalized.masteryScore === 0 && !normalized.lastReview) {
    return normalized
  }

  return {
    ...normalized,
    masteryScore: 0,
    lastReview: undefined,
  }
}
