import type { LessonProgress } from '../types/progress'
import { generateLesson } from '../content/lessons'
import {
  hasEverMastered,
  hasPendingMissedReview,
  meetsUnlockThreshold,
} from './mastery'
import { hasQuizActivity, isLearnComplete } from './lessonSections'

/**
 * Game-facing status for a world node, derived entirely from real lesson
 * progress. No new persistence — this is a read-only projection.
 */
export type WorldStatus =
  | 'locked' // prerequisite not met
  | 'new' // unlocked, nothing started
  | 'training' // learn section in progress
  | 'bossReady' // learn done, boss (quiz) not yet beaten
  | 'bossFight' // quiz started but not mastered
  | 'review' // quiz below threshold with missed questions to redo
  | 'cleared' // mastered — power earned

export type WorldState = {
  status: WorldStatus
  unlocked: boolean
  learnDone: boolean
  quizStarted: boolean
  mastered: boolean
  /** 0–100 boss-health-style mastery value. */
  mastery: number
  needsReview: boolean
}

export function getWorldState(
  lessonId: string,
  progress: LessonProgress | undefined,
  unlocked: boolean,
): WorldState {
  const lesson = generateLesson(lessonId)
  const learnDone = lesson ? isLearnComplete(progress, lesson) : false
  const quizStarted = hasQuizActivity(progress)
  const mastered = hasEverMastered(progress)
  const mastery = quizStarted ? progress?.masteryScore ?? 0 : 0
  const needsReview = hasPendingMissedReview(progress)

  let status: WorldStatus
  if (!unlocked) {
    status = 'locked'
  } else if (mastered && meetsUnlockThreshold(mastery)) {
    status = 'cleared'
  } else if (mastered) {
    // Flagged as ever-mastered but current run dipped — treat as cleared so the
    // power stays earned.
    status = 'cleared'
  } else if (!learnDone) {
    status = progress && (progress.learnStepIndex ?? 0) > 0 ? 'training' : 'new'
  } else if (needsReview) {
    status = 'review'
  } else if (quizStarted) {
    status = 'bossFight'
  } else {
    status = 'bossReady'
  }

  return {
    status,
    unlocked,
    learnDone,
    quizStarted,
    mastered,
    mastery,
    needsReview,
  }
}

export type QuestStatus = WorldStatus
