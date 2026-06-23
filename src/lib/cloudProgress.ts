import type { User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type {
  AttemptRecord,
  ExperienceLevel,
  LessonProgress,
  LessonStatus,
  ProgressState,
  StreakState,
} from '../types/progress'
import { emptyState } from './localProgress'

type LessonProgressRow = {
  lesson_id: string
  status: string
  current_step_index: number
  completed_step_ids: string[]
  correct_count: number
  wrong_count: number
  total_attempts: number
  correct_first_try: number
  accuracy: number
  mastery_score: number
  unlock_next_lesson: boolean
  completed_at: string | null
  updated_at: string | null
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

function rowToLessonProgress(row: LessonProgressRow): LessonProgress {
  return {
    lessonId: row.lesson_id,
    status: row.status as LessonStatus,
    currentStepIndex: row.current_step_index,
    completedStepIds: Array.isArray(row.completed_step_ids)
      ? row.completed_step_ids
      : [],
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    totalAttempts: row.total_attempts,
    correctFirstTry: row.correct_first_try,
    accuracy: row.accuracy,
    masteryScore: row.mastery_score,
    unlockNextLesson: row.unlock_next_lesson,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }
}

/** Make sure a profile row exists for this user (RLS lets users insert their own). */
export async function ensureProfile(user: User): Promise<void> {
  const sb = client()
  const meta = user.user_metadata as { displayName?: string } | undefined
  await sb.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      display_name: meta?.displayName ?? null,
      last_active_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )
}

export async function loadCloud(userId: string): Promise<ProgressState> {
  const sb = client()

  const [{ data: profile }, { data: rows }] = await Promise.all([
    sb
      .from('profiles')
      .select('experience_level, streak_current, streak_longest, last_activity_date')
      .eq('id', userId)
      .maybeSingle(),
    sb
      .from('lesson_progress')
      .select(
        'lesson_id, status, current_step_index, completed_step_ids, correct_count, wrong_count, total_attempts, correct_first_try, accuracy, mastery_score, unlock_next_lesson, completed_at, updated_at',
      )
      .eq('user_id', userId),
  ])

  const state: ProgressState = emptyState()

  if (profile) {
    state.experienceLevel =
      (profile.experience_level as ExperienceLevel | null) ?? undefined
    state.streak = {
      current: profile.streak_current ?? 0,
      longest: profile.streak_longest ?? 0,
      lastActivityDate: profile.last_activity_date ?? undefined,
    }
  }

  for (const row of (rows ?? []) as LessonProgressRow[]) {
    state.lessons[row.lesson_id] = rowToLessonProgress(row)
  }

  return state
}

export async function saveExperienceCloud(
  userId: string,
  level: ExperienceLevel,
): Promise<void> {
  await client()
    .from('profiles')
    .update({ experience_level: level, last_active_at: new Date().toISOString() })
    .eq('id', userId)
}

export async function saveStreakCloud(
  userId: string,
  streak: StreakState,
): Promise<void> {
  await client()
    .from('profiles')
    .update({
      streak_current: streak.current,
      streak_longest: streak.longest,
      last_activity_date: streak.lastActivityDate ?? null,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

export async function upsertLessonCloud(
  userId: string,
  p: LessonProgress,
): Promise<void> {
  await client()
    .from('lesson_progress')
    .upsert(
      {
        user_id: userId,
        lesson_id: p.lessonId,
        status: p.status,
        current_step_index: p.currentStepIndex,
        completed_step_ids: p.completedStepIds,
        correct_count: p.correctCount,
        wrong_count: p.wrongCount,
        total_attempts: p.totalAttempts,
        correct_first_try: p.correctFirstTry,
        accuracy: p.accuracy,
        mastery_score: p.masteryScore,
        unlock_next_lesson: p.unlockNextLesson,
        completed_at: p.completedAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    )
}

export async function deleteLessonCloud(
  userId: string,
  lessonId: string,
): Promise<void> {
  await client()
    .from('lesson_progress')
    .delete()
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
}

export async function insertAttemptCloud(
  userId: string,
  a: AttemptRecord,
): Promise<void> {
  await client().from('attempts').insert({
    user_id: userId,
    lesson_id: a.lessonId,
    step_id: a.stepId,
    submitted_answer: a.submittedAnswer,
    expected_answer: a.expectedAnswer,
    is_correct: a.isCorrect,
    attempt_number: a.attemptNumber,
  })
}
