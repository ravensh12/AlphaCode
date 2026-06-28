import type { User } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type {
  AttemptRecord,
  ExperienceLevel,
  LessonProgress,
  LessonReview,
  LessonStatus,
  ProgressState,
  StreakState,
} from '../types/progress'
import { emptyState } from './localProgress'
import { generateLesson } from '../content/lessons'
import { isLearnComplete, normalizeLessonProgress, withLearnCompletedFlag } from './lessonSections'
import type { ConceptSkill } from './learnerModel'
import type { ConceptId } from '../types/lesson'
import {
  badgeCountsFromEarnedList,
  normalizeBadgeCounts,
  type BadgeCounts,
} from '../content/badges'

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
  last_review?: LessonReview | null
  learn_completed?: boolean | null
  learn_step_index?: number | null
  quiz_step_index?: number | null
  learn_frame_index?: number | null
  quiz_frame_index?: number | null
}

type ConceptMasteryRow = {
  concept_id: string
  ability: number
  confidence: number
  seen: number
  correct_first_try: number
  box: number
  due_at: string | null
  last_seen_at: string | null
  recent_results: boolean[]
}

/** Columns guaranteed to exist in the original schema. */
const CORE_LESSON_COLUMNS =
  'lesson_id, status, current_step_index, completed_step_ids, correct_count, wrong_count, total_attempts, correct_first_try, accuracy, mastery_score, unlock_next_lesson, completed_at, updated_at'

const SECTION_LESSON_COLUMNS =
  `${CORE_LESSON_COLUMNS}, learn_completed, learn_step_index, quiz_step_index, learn_frame_index, quiz_frame_index`

const SECTION_BASE_COLUMNS =
  `${CORE_LESSON_COLUMNS}, learn_completed, learn_step_index, quiz_step_index`

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
    lastReview: row.last_review ?? undefined,
    learnCompleted: row.learn_completed ?? undefined,
    learnStepIndex: row.learn_step_index ?? undefined,
    quizStepIndex: row.quiz_step_index ?? undefined,
    learnFrameIndex: row.learn_frame_index ?? undefined,
    quizFrameIndex: row.quiz_frame_index ?? undefined,
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

  // Core load — must succeed. Errors here trigger a local fallback upstream.
  const profileRes = await sb
    .from('profiles')
    .select('experience_level, streak_current, streak_longest, last_activity_date')
    .eq('id', userId)
    .maybeSingle()
  if (profileRes.error) throw profileRes.error

  const state: ProgressState = emptyState()

  const profile = profileRes.data
  if (profile) {
    state.experienceLevel =
      (profile.experience_level as ExperienceLevel | null) ?? undefined
    state.streak = {
      current: profile.streak_current ?? 0,
      longest: profile.streak_longest ?? 0,
      lastActivityDate: profile.last_activity_date ?? undefined,
    }
  }

  // Best-effort: "The Threshold" gate state. These columns may not exist on
  // older databases, so a failure here must never break core progress loading.
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('inter_zone_complete, inter_zone_completed_at')
      .eq('id', userId)
      .maybeSingle()
    if (!error && data) {
      const row = data as {
        inter_zone_complete?: boolean | null
        inter_zone_completed_at?: string | null
      }
      if (row.inter_zone_complete) {
        state.interZoneComplete = true
        state.interZoneCompletedAt = row.inter_zone_completed_at ?? undefined
      }
    }
  } catch {
    /* inter-zone columns not present yet */
  }

  const rowsRes = await sb
    .from('lesson_progress')
    .select(SECTION_LESSON_COLUMNS)
    .eq('user_id', userId)
  if (rowsRes.error) {
    const sectionRes = await sb
      .from('lesson_progress')
      .select(SECTION_BASE_COLUMNS)
      .eq('user_id', userId)
    if (sectionRes.error) {
      const fallback = await sb
        .from('lesson_progress')
        .select(CORE_LESSON_COLUMNS)
        .eq('user_id', userId)
      if (fallback.error) throw fallback.error
      for (const row of (fallback.data ?? []) as LessonProgressRow[]) {
        state.lessons[row.lesson_id] = rowToLessonProgress(row)
      }
    } else {
      for (const row of (sectionRes.data ?? []) as LessonProgressRow[]) {
        state.lessons[row.lesson_id] = rowToLessonProgress(row)
      }
    }
  } else {
    for (const row of (rowsRes.data ?? []) as LessonProgressRow[]) {
      state.lessons[row.lesson_id] = rowToLessonProgress(row)
    }
  }

  // Best-effort extras — these columns may not exist on older databases, so a
  // failure here must never break core progress loading.
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('badges, badge_counts')
      .eq('id', userId)
      .maybeSingle()
    if (!error && data) {
      const row = data as { badges?: string[] | null; badge_counts?: BadgeCounts | null }
      if (row.badge_counts && typeof row.badge_counts === 'object') {
        state.badgeCounts = normalizeBadgeCounts(row.badge_counts)
      } else if (Array.isArray(row.badges)) {
        state.badgeCounts = badgeCountsFromEarnedList(row.badges)
      }
    }
  } catch {
    /* badge columns not present yet */
  }

  try {
    const { data, error } = await sb
      .from('lesson_progress')
      .select('lesson_id, last_review')
      .eq('user_id', userId)
    if (!error && data) {
      for (const r of data as { lesson_id: string; last_review: LessonReview | null }[]) {
        const lp = state.lessons[r.lesson_id]
        if (lp && r.last_review) lp.lastReview = r.last_review
      }
    }
  } catch {
    /* last_review column not present yet */
  }

  // Best-effort: per-concept learner model. The table may not exist on older
  // databases, so a failure here must never break core progress loading.
  try {
    const { data, error } = await sb
      .from('concept_mastery')
      .select(
        'concept_id, ability, confidence, seen, correct_first_try, box, due_at, last_seen_at, recent_results',
      )
      .eq('user_id', userId)
    if (!error && Array.isArray(data) && data.length > 0) {
      const concepts: Partial<Record<ConceptId, ConceptSkill>> = {}
      let latest = 0
      for (const r of data as ConceptMasteryRow[]) {
        const dueAt = r.due_at ? Date.parse(r.due_at) : 0
        const lastSeenAt = r.last_seen_at ? Date.parse(r.last_seen_at) : 0
        latest = Math.max(latest, lastSeenAt)
        concepts[r.concept_id as ConceptId] = {
          conceptId: r.concept_id as ConceptId,
          ability: r.ability ?? 0.5,
          confidence: r.confidence ?? 0,
          seen: r.seen ?? 0,
          correctFirstTry: r.correct_first_try ?? 0,
          box: r.box ?? 1,
          dueAt,
          lastSeenAt,
          recentResults: Array.isArray(r.recent_results) ? r.recent_results : [],
        }
      }
      state.learnerModel = {
        concepts,
        updatedAt: new Date(latest || Date.now()).toISOString(),
      }
    }
  } catch {
    /* concept_mastery table not present yet */
  }

  // Backfill learnCompleted for rows saved before section flags existed.
  for (const lessonId of Object.keys(state.lessons)) {
    const lesson = generateLesson(lessonId)
    if (!lesson) continue
    const progress = normalizeLessonProgress(state.lessons[lessonId])
    if (!progress.learnCompleted && isLearnComplete(progress, lesson)) {
      state.lessons[lessonId] = { ...progress, learnCompleted: true }
    } else {
      state.lessons[lessonId] = progress
    }
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

/**
 * Persist "The Threshold" completion. Best-effort: if the columns don't exist
 * yet on an older database the write fails silently so the local flag still
 * holds and the app keeps working.
 */
export async function saveInterZoneCloud(
  userId: string,
  completedAt: string,
): Promise<void> {
  await client()
    .from('profiles')
    .update({
      inter_zone_complete: true,
      inter_zone_completed_at: completedAt,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

export async function saveBadgesCloud(
  userId: string,
  counts: BadgeCounts,
): Promise<void> {
  const normalized = normalizeBadgeCounts(counts)
  const { error } = await client()
    .from('profiles')
    .update({
      badge_counts: normalized,
      last_active_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    // Fallback for databases without badge_counts column yet.
    const legacyIds = (Object.entries(normalized) as [keyof BadgeCounts, number][])
      .flatMap(([id, n]) => Array.from({ length: n }, () => id))
    await client()
      .from('profiles')
      .update({ badges: legacyIds, last_active_at: new Date().toISOString() })
      .eq('id', userId)
  }
}

export async function upsertLessonCloud(
  userId: string,
  p: LessonProgress,
): Promise<void> {
  const lesson = generateLesson(p.lessonId)
  const normalized = lesson ? withLearnCompletedFlag(p, lesson) : p

  const payload = {
    user_id: userId,
    lesson_id: normalized.lessonId,
    status: normalized.status,
    current_step_index: normalized.currentStepIndex,
    completed_step_ids: normalized.completedStepIds,
    correct_count: normalized.correctCount,
    wrong_count: normalized.wrongCount,
    total_attempts: normalized.totalAttempts,
    correct_first_try: normalized.correctFirstTry,
    accuracy: normalized.accuracy,
    mastery_score: normalized.masteryScore,
    unlock_next_lesson: normalized.unlockNextLesson,
    completed_at: normalized.completedAt ?? null,
    updated_at: new Date().toISOString(),
    learn_completed: normalized.learnCompleted === true,
    learn_step_index: normalized.learnStepIndex ?? null,
    quiz_step_index: normalized.quizStepIndex ?? null,
    learn_frame_index: normalized.learnFrameIndex ?? null,
    quiz_frame_index: normalized.quizFrameIndex ?? null,
  }

  // Core write — must succeed for progress to persist.
  let { error } = await client()
    .from('lesson_progress')
    .upsert(payload, { onConflict: 'user_id,lesson_id' })

  if (error) {
    const { learn_frame_index, quiz_frame_index, ...withoutFrames } = payload
    void learn_frame_index
    void quiz_frame_index
    ;({ error } = await client()
      .from('lesson_progress')
      .upsert(withoutFrames, { onConflict: 'user_id,lesson_id' }))
  }

  if (error) {
    // Older databases may not have section columns yet — still save core progress.
    const {
      learn_completed,
      learn_step_index,
      quiz_step_index,
      learn_frame_index,
      quiz_frame_index,
      ...core
    } = payload
    void learn_completed
    void learn_step_index
    void quiz_step_index
    void learn_frame_index
    void quiz_frame_index
    ;({ error } = await client()
      .from('lesson_progress')
      .upsert(core, { onConflict: 'user_id,lesson_id' }))
  }

  if (error) throw error

  // Best-effort: store the review snapshot if the column exists. A missing
  // column returns an error object (not a throw), which we intentionally ignore.
  if (p.lastReview) {
    await client()
      .from('lesson_progress')
      .update({ last_review: p.lastReview })
      .eq('user_id', userId)
      .eq('lesson_id', p.lessonId)
  }
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

/**
 * Persist the touched concept skills. Best-effort: if the table doesn't exist
 * yet the write fails silently so the local model still holds.
 */
export async function saveConceptMasteryCloud(
  userId: string,
  skills: ConceptSkill[],
): Promise<void> {
  if (skills.length === 0) return
  const rows = skills.map((s) => ({
    user_id: userId,
    concept_id: s.conceptId,
    ability: s.ability,
    confidence: s.confidence,
    seen: s.seen,
    correct_first_try: s.correctFirstTry,
    box: s.box,
    due_at: new Date(s.dueAt).toISOString(),
    last_seen_at: new Date(s.lastSeenAt).toISOString(),
    recent_results: s.recentResults,
    updated_at: new Date().toISOString(),
  }))
  await client()
    .from('concept_mastery')
    .upsert(rows, { onConflict: 'user_id,concept_id' })
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
