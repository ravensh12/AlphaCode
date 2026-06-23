import {
  createContext,
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
import { meetsUnlockThreshold } from '../lib/mastery'
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
  earnedBadges: string[]
  isLessonUnlocked: (lesson: LessonSummary) => boolean
  recordDailyActivity: () => void
  saveLessonProgress: (progress: LessonProgress) => void
  saveLessonReview: (lessonId: string, review: LessonReview) => void
  logAttempt: (attempt: AttemptRecord) => void
  awardBadges: (badgeIds: string[]) => void
  resetLesson: (lessonId: string) => void
}

const ProgressContext = createContext<ProgressContextValue | null>(null)

const warn = (e: unknown) => console.warn('[progress] cloud write failed', e)

/**
 * Merge a new attempt into an already-completed lesson so reviewing/replaying
 * can only improve (or hold) progress — never lose it. Best metrics win.
 */
function mergeCompleted(
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
    unlockNextLesson: existing.unlockNextLesson || next.unlockNextLesson,
    completedAt: existing.completedAt ?? next.completedAt,
    wrongCount: existing.wrongCount + next.wrongCount,
    totalAttempts: existing.totalAttempts + next.totalAttempts,
    currentStepIndex: existing.currentStepIndex,
    updatedAt: next.updatedAt ?? new Date().toISOString(),
    // Keep the stored review snapshot unless a newer one is supplied.
    lastReview: next.lastReview ?? existing.lastReview,
  }
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
          if (!cancelled) {
            setState(cloud)
            setReady(true)
          }
        } catch (e) {
          warn(e)
          if (!cancelled) {
            setCloudFailed(true)
            setState(loadLocal(identityId))
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
        setState(loadLocal(identityId))
        setReady(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [identityId, wantsCloud, user])

  const value = useMemo<ProgressContextValue>(() => {
    function commit(next: ProgressState) {
      stateRef.current = next
      setState(next)
      if (!cloudActive && identityId) saveLocal(identityId, next)
    }

    const variablesMastery = state.lessons[FIRST_LESSON_ID]?.masteryScore ?? 0
    const completedLessons = Object.values(state.lessons).filter(
      (l) => l.status === 'completed',
    )
    const completedLessonsCount = completedLessons.length
    const averageMastery = completedLessonsCount
      ? Math.round(
          completedLessons.reduce((sum, l) => sum + l.masteryScore, 0) /
            completedLessonsCount,
        )
      : 0
    const totalLessonsCount = LESSON_CATALOG.length
    const allLessonsComplete = completedLessonsCount >= totalLessonsCount

    // Guests get a single-level preview; everything past lesson one needs an
    // account, regardless of how well they did.
    const isGuest = identityId === 'guest'

    const isUnlocked = (lesson: LessonSummary): boolean => {
      const req = lesson.unlockRequirements
      if (!req.previousLessonId) return true
      if (isGuest) return false
      const prev = state.lessons[req.previousLessonId]
      if (!prev || prev.status !== 'completed') return false
      if (req.minimumMastery == null) return true
      return meetsUnlockThreshold(prev.masteryScore)
    }

    const activeLessonId =
      LESSON_CATALOG.find(
        (l) =>
          l.playable &&
          isUnlocked(l) &&
          state.lessons[l.id]?.status !== 'completed',
      )?.id ?? null

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
      earnedBadges: state.earnedBadges ?? [],
      getLessonProgress: (lessonId) => state.lessons[lessonId],
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
        const existing = prev.lessons[progress.lessonId]
        // Once a lesson is completed, a later attempt (e.g. a review) can only
        // raise its stats, never lower them.
        const merged =
          existing?.status === 'completed'
            ? mergeCompleted(existing, progress)
            : progress
        const streak = nextStreak(prev.streak)
        commit({
          ...prev,
          streak,
          lessons: { ...prev.lessons, [progress.lessonId]: merged },
        })
        if (cloudActive && userId) {
          upsertLessonCloud(userId, merged).catch(warn)
          saveStreakCloud(userId, streak).catch(warn)
        }
      },

      saveLessonReview: (lessonId, review) => {
        const prev = stateRef.current
        const existing = prev.lessons[lessonId]
        if (!existing) return
        const updated = { ...existing, lastReview: review }
        commit({
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: updated },
        })
        if (cloudActive && userId) upsertLessonCloud(userId, updated).catch(warn)
      },

      logAttempt: (attempt) => {
        if (cloudActive && userId) insertAttemptCloud(userId, attempt).catch(warn)
      },

      awardBadges: (badgeIds) => {
        if (!badgeIds.length) return
        const prev = stateRef.current
        const existing = prev.earnedBadges ?? []
        const merged = [...new Set([...existing, ...badgeIds])]
        if (merged.length === existing.length) return
        commit({ ...prev, earnedBadges: merged })
        if (cloudActive && userId) saveBadgesCloud(userId, merged).catch(warn)
      },

      resetLesson: (lessonId) => {
        const prev = stateRef.current
        const lessons = { ...prev.lessons }
        delete lessons[lessonId]
        commit({ ...prev, lessons })
        if (cloudActive && userId) deleteLessonCloud(userId, lessonId).catch(warn)
      },
    }
  }, [state, ready, syncing, cloudActive, userId, identityId])

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
