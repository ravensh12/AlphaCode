import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AttemptRecord,
  ExperienceLevel,
  LessonProgress,
  LessonReview,
  ProgressState,
  StreakState,
} from '../types/progress'
import type { LessonSummary } from '../types/lesson'
import { FIRST_LESSON_ID, LESSON_CATALOG } from '../content/catalog'
import {
  badgesUnlockedCount,
  emptyBadgeCounts,
  mergeBadgeCounts,
  totalBadgeCount,
  type BadgeCounts,
} from '../content/badges'
import { generateLesson } from '../content/lessons'
import {
  interactiveStepsForSection,
  isLearnComplete,
  normalizeLessonProgress,
  withLearnCompletedFlag,
} from '../lib/lessonSections'
import { canUnlockNextLesson, hasEverMastered, markUnlockAchieved } from '../lib/mastery'
import { mergeCompleted, mergeInProgress, mergeProgressStates } from '../lib/progressMerge'
import { daysBetween, todayKey } from '../lib/dates'
import { emptyState, loadLocal, removeLocal, saveLocal } from '../lib/localProgress'
import {
  deleteLessonCloud,
  ensureProfile,
  insertAttemptCloud,
  loadCloud,
  saveBadgesCloud,
  saveExperienceCloud,
  saveStreakCloud,
  upsertLessonCloud,
} from '../lib/cloudProgress'
import { useAuth } from './AuthContext'

type ProgressContextValue = {
  ready: boolean
  syncing: boolean
  cloudEnabled: boolean
  experienceLevel?: ExperienceLevel
  setExperienceLevel: (level: ExperienceLevel) => void
  streak: StreakState
  lessons: Record<string, LessonProgress>
  getLessonProgress: (lessonId: string) => LessonProgress | undefined
  variablesMastery: number
  averageMastery: number
  completedLessonsCount: number
  totalLessonsCount: number
  allLessonsComplete: boolean
  activeLessonId: string | null
  badgeCounts: BadgeCounts
  totalBadgeCount: number
  badgesUnlockedCount: number
  isLessonUnlocked: (lesson: LessonSummary) => boolean
  recordDailyActivity: () => void
  saveLessonProgress: (progress: LessonProgress) => void
  saveLessonReview: (lessonId: string, review: LessonReview) => void
  logAttempt: (attempt: AttemptRecord) => void
  awardBadges: (counts: Partial<BadgeCounts>) => void
  resetLesson: (lessonId: string) => void
  restartQuizProgress: (lessonId: string) => void
}

const ProgressContext = createContext<ProgressContextValue | null>(null)

const warn = (e: unknown) => console.warn('[progress] cloud write failed', e)

function backfillLearnCompleted(state: ProgressState): ProgressState {
  const lessons: ProgressState['lessons'] = {}
  for (const [lessonId, progress] of Object.entries(state.lessons)) {
    const normalized = normalizeLessonProgress(progress)
    const lesson = generateLesson(lessonId)
    if (!lesson) {
      lessons[lessonId] = normalized
      continue
    }
    lessons[lessonId] =
      !normalized.learnCompleted && isLearnComplete(normalized, lesson)
        ? { ...normalized, learnCompleted: true }
        : normalized
  }
  return { ...state, lessons }
}

/** Merge any quiz runs that saved badges before totals were updated. */
function applyPendingLessonBadges(state: ProgressState): ProgressState {
  let badgeCounts = state.badgeCounts ?? emptyBadgeCounts()
  let changed = false
  const lessons: ProgressState['lessons'] = {}
  for (const [lessonId, progress] of Object.entries(state.lessons)) {
    const pending = progress.pendingBadgeCounts
    if (pending && totalBadgeCount(pending) > 0) {
      badgeCounts = mergeBadgeCounts(badgeCounts, pending)
      lessons[lessonId] = { ...progress, pendingBadgeCounts: undefined }
      changed = true
    } else {
      lessons[lessonId] = progress
    }
  }
  return changed ? { ...state, badgeCounts, lessons } : state
}

function hydrateProgressState(
  state: ProgressState,
  localBackup?: ProgressState,
): ProgressState {
  const next = localBackup ? mergeProgressStates(state, localBackup) : state
  return applyPendingLessonBadges(backfillLearnCompleted(next))
}

function nextStreak(streak: StreakState): StreakState {
  const today = todayKey()
  if (streak.lastActivityDate === today) return streak
  let current = 1
  if (streak.lastActivityDate && daysBetween(streak.lastActivityDate, today) === 1) {
    current = streak.current + 1
  }
  return {
    current,
    longest: Math.max(streak.longest, current),
    lastActivityDate: today,
  }
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { status, user, identityId, hasBackend } = useAuth()

  const [state, setState] = useState<ProgressState>(emptyState)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [cloudFailed, setCloudFailed] = useState(false)

  const stateRef = useRef(state)
  stateRef.current = state

  const wantsCloud = status === 'authenticated' && hasBackend && !!user
  const cloudActive = wantsCloud && !cloudFailed
  const userId = user?.id ?? null

  // Load state whenever the identity changes.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setCloudFailed(false)

    async function load() {
      if (!identityId) {
        setState(emptyState())
        return
      }

      if (wantsCloud && user) {
        setSyncing(true)
        try {
          await ensureProfile(user)
          const cloud = await loadCloud(user.id)
          const localBackup = loadLocal(user.id)
          const hydrated = hydrateProgressState(cloud, localBackup)
          if (!cancelled) {
            setState(hydrated)
            setReady(true)
            if (
              totalBadgeCount(hydrated.badgeCounts) >
              totalBadgeCount(cloud.badgeCounts)
            ) {
              saveBadgesCloud(user.id, hydrated.badgeCounts).catch(warn)
            }
          }
        } catch (e) {
          warn(e)
          if (!cancelled) {
            setCloudFailed(true)
            setState(hydrateProgressState(loadLocal(identityId)))
            setReady(true)
          }
        } finally {
          if (!cancelled) setSyncing(false)
        }
      } else if (identityId === 'guest') {
        // Guests are in "preview" mode: every page load starts from a clean
        // slate, so a refresh wipes the course page too.
        removeLocal(identityId)
        setState(emptyState())
        setReady(true)
      } else {
        setState(hydrateProgressState(loadLocal(identityId)))
        setReady(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [identityId, wantsCloud, user])

  const getLessonProgress = useCallback(
    (lessonId: string) => stateRef.current.lessons[lessonId],
    [],
  )

  const value = useMemo<ProgressContextValue>(() => {
    function commit(next: ProgressState) {
      stateRef.current = next
      setState(next)
      if (identityId) saveLocal(identityId, next)
    }

    const variablesMastery = state.lessons[FIRST_LESSON_ID]?.masteryScore ?? 0
    const masteredLessons = LESSON_CATALOG.map((l) => state.lessons[l.id]).filter(
      (p): p is LessonProgress => !!p && hasEverMastered(p),
    )
    const completedLessonsCount = masteredLessons.length
    const averageMastery = completedLessonsCount
      ? Math.round(
          masteredLessons.reduce((sum, l) => sum + l.masteryScore, 0) /
            completedLessonsCount,
        )
      : 0
    const totalLessonsCount = LESSON_CATALOG.length
    const allLessonsComplete = completedLessonsCount >= totalLessonsCount

    // Guests preview the first lesson's interactive section only; quiz and
    // later lessons require an account.
    const isGuest = identityId === 'guest'

    const isUnlocked = (lesson: LessonSummary): boolean => {
      const req = lesson.unlockRequirements
      if (!req.previousLessonId) return true
      if (isGuest) return false
      const prev = state.lessons[req.previousLessonId]
      if (!prev) return false
      const prevLesson = generateLesson(req.previousLessonId)
      if (prevLesson && !isLearnComplete(prev, prevLesson)) return false
      if (req.minimumMastery == null) return true
      return canUnlockNextLesson(prev)
    }

    const activeLessonId =
      LESSON_CATALOG.find((l) => {
        if (!l.playable || !isUnlocked(l)) return false
        const p = state.lessons[l.id]
        const generated = generateLesson(l.id)
        if (!generated) return false
        if (!isLearnComplete(p, generated)) return true
        return p?.status !== 'completed'
      })?.id ?? null

    return {
      ready,
      syncing,
      cloudEnabled: cloudActive,
      experienceLevel: state.experienceLevel,
      streak: state.streak,
      lessons: state.lessons,
      variablesMastery,
      averageMastery,
      completedLessonsCount,
      totalLessonsCount,
      allLessonsComplete,
      activeLessonId,
      badgeCounts: state.badgeCounts ?? emptyState().badgeCounts,
      totalBadgeCount: totalBadgeCount(state.badgeCounts ?? emptyState().badgeCounts),
      badgesUnlockedCount: badgesUnlockedCount(state.badgeCounts ?? emptyState().badgeCounts),
      getLessonProgress,
      isLessonUnlocked: isUnlocked,

      setExperienceLevel: (level) => {
        const next = { ...stateRef.current, experienceLevel: level }
        commit(next)
        if (cloudActive && userId) saveExperienceCloud(userId, level).catch(warn)
      },

      recordDailyActivity: () => {
        const prev = stateRef.current
        const streak = nextStreak(prev.streak)
        if (streak === prev.streak) return
        commit({ ...prev, streak })
        if (cloudActive && userId) saveStreakCloud(userId, streak).catch(warn)
      },

      saveLessonProgress: (progress) => {
        const prev = stateRef.current
        let progressToSave = progress
        let badgeCounts = prev.badgeCounts ?? emptyBadgeCounts()
        let badgesChanged = false

        if (
          progress.pendingBadgeCounts &&
          totalBadgeCount(progress.pendingBadgeCounts) > 0
        ) {
          badgeCounts = mergeBadgeCounts(badgeCounts, progress.pendingBadgeCounts)
          badgesChanged = true
          const { pendingBadgeCounts: _pending, ...rest } = progress
          progressToSave = rest as LessonProgress
        }

        const existing = prev.lessons[progressToSave.lessonId]
        // Once a lesson is completed, a later attempt (e.g. a review) can only
        // raise its stats, never lower them.
        const mergedRaw =
          existing?.status === 'completed'
            ? mergeCompleted(existing, progressToSave)
            : existing
              ? mergeInProgress(existing, progressToSave)
              : progressToSave
        const lesson = generateLesson(progressToSave.lessonId)
        const merged = lesson
          ? withLearnCompletedFlag(normalizeLessonProgress(mergedRaw), lesson)
          : normalizeLessonProgress(mergedRaw)
        const streak = nextStreak(prev.streak)
        commit({
          ...prev,
          badgeCounts,
          streak,
          lessons: { ...prev.lessons, [progressToSave.lessonId]: merged },
        })
        if (cloudActive && userId) {
          upsertLessonCloud(userId, merged).catch(warn)
          saveStreakCloud(userId, streak).catch(warn)
          if (badgesChanged) saveBadgesCloud(userId, badgeCounts).catch(warn)
        }
      },

      saveLessonReview: (lessonId, review) => {
        const prev = stateRef.current
        const existing = prev.lessons[lessonId]
        const lesson = generateLesson(lessonId)
        if (!existing) return
        const withReview: LessonProgress = {
          ...existing,
          lastReview: review,
          unlockNextLesson: markUnlockAchieved(existing),
        }
        const updated = lesson
          ? withLearnCompletedFlag(withReview, lesson)
          : withReview
        commit({
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: updated },
        })
        if (cloudActive && userId) upsertLessonCloud(userId, updated).catch(warn)
      },

      logAttempt: (attempt) => {
        if (cloudActive && userId) insertAttemptCloud(userId, attempt).catch(warn)
      },

      awardBadges: (counts) => {
        const add = mergeBadgeCounts(emptyState().badgeCounts, counts)
        if (totalBadgeCount(add) === 0) return
        const prev = stateRef.current
        const merged = mergeBadgeCounts(prev.badgeCounts ?? emptyState().badgeCounts, counts)
        commit({ ...prev, badgeCounts: merged })
        if (cloudActive && userId) saveBadgesCloud(userId, merged).catch(warn)
      },

      resetLesson: (lessonId) => {
        const prev = stateRef.current
        const lessons = { ...prev.lessons }
        delete lessons[lessonId]
        commit({ ...prev, lessons })
        if (cloudActive && userId) deleteLessonCloud(userId, lessonId).catch(warn)
      },

      restartQuizProgress: (lessonId) => {
        const prev = stateRef.current
        const existing = prev.lessons[lessonId]
        const lesson = generateLesson(lessonId)
        if (!existing || !lesson || !isLearnComplete(existing, lesson)) return

        const learnStepIds = new Set(
          interactiveStepsForSection(lesson.steps, 'learn').map((s) => s.id),
        )

        const everMastered = markUnlockAchieved(existing)

        const reset: LessonProgress = {
          ...existing,
          learnCompleted: true,
          status: 'inProgress',
          currentStepIndex: 0,
          completedStepIds: existing.completedStepIds.filter((id) =>
            learnStepIds.has(id),
          ),
          correctCount: 0,
          wrongCount: 0,
          totalAttempts: 0,
          correctFirstTry: 0,
          accuracy: 0,
          masteryScore: 0,
          unlockNextLesson: everMastered,
          completedAt: undefined,
          lastReview: undefined,
          pendingBadgeCounts: undefined,
          quizStepIndex: 0,
          quizFrameIndex: 0,
          updatedAt: new Date().toISOString(),
        }

        commit({
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: reset },
        })
        if (cloudActive && userId) upsertLessonCloud(userId, reset).catch(warn)
      },
    }
  }, [state, ready, syncing, cloudActive, userId, identityId, getLessonProgress])

  return (
    <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress must be used within a ProgressProvider')
  return ctx
}
