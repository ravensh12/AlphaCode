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
  isLessonUnlocked: (lesson: LessonSummary) => boolean
  recordDailyActivity: () => void
  saveLessonProgress: (progress: LessonProgress) => void
  logAttempt: (attempt: AttemptRecord) => void
  resetLesson: (lessonId: string) => void
}

const ProgressContext = createContext<ProgressContextValue | null>(null)

const warn = (e: unknown) => console.warn('[progress] cloud write failed', e)

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

    const isUnlocked = (lesson: LessonSummary): boolean => {
      const req = lesson.unlockRequirements
      if (!req.previousLessonId) return true
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
        const streak = nextStreak(prev.streak)
        commit({
          ...prev,
          streak,
          lessons: { ...prev.lessons, [progress.lessonId]: progress },
        })
        if (cloudActive && userId) {
          upsertLessonCloud(userId, progress).catch(warn)
          saveStreakCloud(userId, streak).catch(warn)
        }
      },

      logAttempt: (attempt) => {
        if (cloudActive && userId) insertAttemptCloud(userId, attempt).catch(warn)
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
