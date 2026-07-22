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
import type {
  AcademyMissionPracticeInput,
  AcademyMissionRetentionInput,
  AcademyProgressState,
  AcademyRealmBossDefeatInput,
  AcademyRealmProgress,
  AcademyRealmQuizAttemptInput,
  AcademyTrackProgress,
} from '../types/academy'
import type {
  AttemptEvent,
  LearningAttemptInput,
  LearningCache,
  LearningProblemId,
} from '../types/learning'
import type {
  MasteryEvidenceKind,
  ProblemId,
  RealmId,
  TrackId,
} from '../types/curriculum'
import type { ConceptId, LessonSummary } from '../types/lesson'
import {
  emptyLearnerModel,
  updateConcept,
  type LearnerModel,
} from '../lib/learnerModel'
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
import { lessonUnlockedWithShowcase } from '../lib/showcaseOverride'
import {
  mergeAcademyProgressStates,
  mergeCompleted,
  mergeInProgress,
  mergeProgressStates,
} from '../lib/progressMerge'
import {
  reconcileUnverifiedRetentions,
  selectUnverifiedRetainedMissions,
} from '../lib/academyRetentionReconcile'
import {
  emptyAcademyProgressState,
  isAcademyCampaignComplete,
  isAcademyFinalGauntletReady,
  markMissionRetentionCloudVerified,
  normalizeAcademyProgressState,
  recordMissionPractice as applyMissionPractice,
  recordMissionRetention as applyMissionRetention,
  recordRealmBossDefeat as applyRealmBossDefeat,
  recordRealmQuizAttempt as applyRealmQuizAttempt,
  selectActiveAcademyProblemId,
  selectRealmProgress,
  selectTrackProgress,
} from '../lib/academyProgress'
import { daysBetween, todayKey } from '../lib/dates'
import {
  emptyState,
  loadLocalResult,
  saveLocal,
} from '../lib/localProgress'
import {
  emptyLearningCache,
  selectDueProblemIds,
} from '../lib/masteryProjection'
import { localLearningStore } from '../lib/localLearning'
import { loadCloudLearning } from '../lib/cloudLearning'
import { syncLearningOutbox } from '../lib/syncOutbox'
import {
  deleteLessonCloud,
  ensureProfile,
  insertAttemptCloud,
  loadCloud,
  saveBadgesCloud,
  saveConceptMasteryCloud,
  saveExperienceCloud,
  saveInterZoneCloud,
  saveAcademyProgressCloud,
  saveStreakCloud,
  upsertAcademyMissionCloud,
  upsertAcademyRealmCloud,
  upsertLessonCloud,
} from '../lib/cloudProgress'
import { useAuth } from './AuthContext'

type ProgressContextValue = {
  ready: boolean
  syncing: boolean
  cloudEnabled: boolean
  progressError: string | null
  clearProgressError: () => void
  experienceLevel?: ExperienceLevel
  setExperienceLevel: (level: ExperienceLevel) => void
  /** Lesson the opening placement diagnostic recommends starting from. */
  recommendedLessonId?: string
  /** Whether the first-run intro + placement flow still needs to run. */
  needsPlacement: boolean
  /** Save the placement diagnostic result (experience + unlock-ahead point). */
  completePlacement: (level: ExperienceLevel, startLessonId: string) => void
  streak: StreakState
  lessons: Record<string, LessonProgress>
  getLessonProgress: (lessonId: string) => LessonProgress | undefined
  variablesMastery: number
  averageMastery: number
  completedLessonsCount: number
  totalLessonsCount: number
  allLessonsComplete: boolean
  /** "The Threshold" zone cleared (the gate before the Final Gauntlet). */
  interZoneComplete: boolean
  /** Mark "The Threshold" complete (idempotent; persists local + cloud). */
  completeInterZone: () => void
  /** True once the full academy campaign AND the Threshold are done. */
  readyForFinalGauntlet: boolean
  activeLessonId: string | null
  badgeCounts: BadgeCounts
  totalBadgeCount: number
  badgesUnlockedCount: number
  isLessonUnlocked: (lesson: LessonSummary) => boolean
  recordDailyActivity: () => void
  saveLessonProgress: (progress: LessonProgress) => void
  saveLessonReview: (lessonId: string, review: LessonReview) => void
  logAttempt: (attempt: AttemptRecord) => void
  /** Append a v1 immutable event locally before attempting cloud upload. */
  recordLearningAttempt: (input: LearningAttemptInput) => Promise<AttemptEvent>
  problemMastery: LearningCache['problemMastery']
  skillMastery: LearningCache['skillMastery']
  dueProblemIds: readonly LearningProblemId[]
  pendingLearningSyncCount: number
  syncLearningNow: () => Promise<void>
  /** Durable completion evidence for the exact NeetCode 150 manifest. */
  academyProgress: AcademyProgressState
  recordMissionPractice: (input: AcademyMissionPracticeInput) => Promise<void>
  recordMissionRetention: (
    input: AcademyMissionRetentionInput,
  ) => Promise<void>
  recordRealmQuizAttempt: (
    input: AcademyRealmQuizAttemptInput,
  ) => Promise<void>
  recordRealmBossDefeat: (
    input: AcademyRealmBossDefeatInput,
  ) => Promise<void>
  trackProgress: (trackId: TrackId) => AcademyTrackProgress
  realmProgress: (realmId: RealmId) => AcademyRealmProgress
  academyCampaignComplete: boolean
  activeAcademyProblemId: ProblemId | null
  /** Per-concept learner model — the personalization spine (may be empty). */
  learnerModel: LearnerModel
  /** Fold one resolved interactive question into the learner model. */
  recordConceptResult: (info: {
    conceptIds: ConceptId[]
    firstTry: boolean
    correct: boolean
    responseMs?: number
  }) => void
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
  const normalized =
    next.academyProgress === undefined
      ? next
      : {
          ...next,
          academyProgress: normalizeAcademyProgressState(next.academyProgress),
        }
  return applyPendingLessonBadges(backfillLearnCompleted(normalized))
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

function eventEvidenceKinds(event: AttemptEvent): readonly string[] {
  const value = event.metadata?.evidenceKinds
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/**
 * A linked event counts toward mission evidence when it was resolved by a
 * genuinely correct answer for this problem — not by a reveal. Retries and
 * hints are allowed: the authored failure policies grant multiple attempts
 * (10 on the Python challenge), so wrong tries are expected work, and this
 * gate must match missionPracticeFromResult in useAcademyMissionFlow.
 */
function isPassingLinkedEvent(
  event: AttemptEvent,
  problemId: ProblemId,
  evidenceKind: MasteryEvidenceKind,
): boolean {
  return (
    event.problemId === problemId &&
    event.resolved &&
    event.isCorrect &&
    !event.revealed &&
    eventEvidenceKinds(event).includes(evidenceKind)
  )
}

function linkedEvents(
  cache: LearningCache,
  eventIds: readonly string[] | undefined,
): AttemptEvent[] {
  const ids = [...new Set((eventIds ?? []).map((id) => id.trim()))].filter(
    Boolean,
  )
  if (ids.length === 0) throw new Error('Linked learning event IDs are required')
  const byId = new Map(cache.events.map((event) => [event.id, event] as const))
  return ids.map((id) => {
    const event = byId.get(id)
    if (!event) throw new Error(`Learning event "${id}" is not durable locally`)
    return event
  })
}

function validateMissionPracticeEvents(
  cache: LearningCache,
  input: AcademyMissionPracticeInput,
): void {
  const acquisition = linkedEvents(cache, input.acquisitionEventIds)
  const transfer = linkedEvents(cache, input.transferEventIds)
  const codeTests = linkedEvents(cache, input.codeTestEventIds)
  if (
    !acquisition.every((event) =>
      isPassingLinkedEvent(event, input.problemId, 'acquisition'),
    )
  ) {
    throw new Error('Mission acquisition evidence is not a clean linked event')
  }
  const codeById = new Map(codeTests.map((event) => [event.id, event] as const))
  const sharedPythonEvent = transfer.find((event) => {
    const codeEvent = codeById.get(event.id)
    return (
      codeEvent === event &&
      event.metadata?.assessmentKind === 'pythonCode' &&
      isPassingLinkedEvent(event, input.problemId, 'independent-transfer') &&
      isPassingLinkedEvent(event, input.problemId, 'code-tests')
    )
  })
  if (!sharedPythonEvent) {
    throw new Error(
      'Independent transfer and code tests must share one clean Python event',
    )
  }
  if (
    !transfer.every((event) =>
      isPassingLinkedEvent(event, input.problemId, 'independent-transfer'),
    ) ||
    !codeTests.every((event) =>
      isPassingLinkedEvent(event, input.problemId, 'code-tests'),
    )
  ) {
    throw new Error('Mission transfer evidence is not clean and linked')
  }
  const acquiredAt = [...acquisition]
    .map((event) => event.occurredAt)
    .sort()[0]
  if (acquiredAt !== input.acquiredAt) {
    throw new Error('Mission acquisition timestamp must come from its event')
  }
}

function validateMissionRetentionEvents(
  cache: LearningCache,
  input: AcademyMissionRetentionInput,
): void {
  const events = linkedEvents(cache, input.delayedRetrievalEventIds)
  if (
    !events.every(
      (event) =>
        isPassingLinkedEvent(event, input.problemId, 'delayed-retrieval') &&
        event.metadata?.academyMode === 'retention',
    )
  ) {
    throw new Error('Delayed retrieval must be a clean retention-mode event')
  }
  const retainedAt = [...events]
    .map((event) => event.occurredAt)
    .sort()
    .at(-1)
  if (retainedAt !== input.retainedAt) {
    throw new Error('Retention timestamp must come from its linked event')
  }
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const { status, user, identityId, hasBackend, isShowcaseAccount } = useAuth()

  const [state, setState] = useState<ProgressState>(emptyState)
  const [ready, setReady] = useState(false)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [learningSyncing, setLearningSyncing] = useState(false)
  const [learningCache, setLearningCache] = useState<LearningCache>(() =>
    emptyLearningCache('unscoped'),
  )
  const [pendingLearningSyncCount, setPendingLearningSyncCount] = useState(0)

  const stateRef = useRef(state)
  stateRef.current = state
  const learningCacheRef = useRef(learningCache)
  learningCacheRef.current = learningCache
  const identityRef = useRef(identityId)
  identityRef.current = identityId
  const readyRef = useRef(ready)
  readyRef.current = ready
  const pendingDailyActivityRef = useRef(false)

  const wantsCloud = status === 'authenticated' && hasBackend && !!user
  const cloudActive = wantsCloud
  const userId = user?.id ?? null

  const commit = useCallback(
    (next: ProgressState): boolean => {
      if (!readyRef.current || !identityId) {
        setProgressError('Progress is still loading; nothing was saved.')
        return false
      }
      const write = saveLocal(identityId, next)
      if (write.status === 'error') {
        setProgressError(write.error.message)
        return false
      }
      stateRef.current = next
      setState(next)
      setProgressError(null)
      return true
    },
    [identityId],
  )

  const syncLearningNow = useCallback(async (): Promise<void> => {
    if (!identityId || !wantsCloud || !userId) return
    setLearningSyncing(true)
    try {
      const result = await syncLearningOutbox({
        identityId,
        userId,
        store: localLearningStore,
      })
      if (result.status !== 'ok' || result.state.outbox.items.length > 0) {
        throw new Error(
          result.status === 'ok'
            ? 'Learning evidence is still queued for cloud sync'
            : `Learning cloud sync is unavailable: ${result.reason}`,
        )
      }
      if (identityRef.current === identityId) {
        learningCacheRef.current = result.state.cache
        setLearningCache(result.state.cache)
        setPendingLearningSyncCount(result.state.outbox.items.length)
      }
    } finally {
      if (identityRef.current === identityId) setLearningSyncing(false)
    }
  }, [identityId, userId, wantsCloud])

  // Re-submits locally-retained-but-unverified completions one mission at a
  // time (the bulk merge RPC is atomic, so one server-rejected mission must
  // not block the rest) and stamps cloudVerifiedAt on each acceptance.
  const retentionReconcileInFlightRef = useRef(false)
  const reconcileRetentionVerification = useCallback(
    async (uid: string): Promise<void> => {
      const academy = stateRef.current.academyProgress
      if (!academy || retentionReconcileInFlightRef.current) return
      if (selectUnverifiedRetainedMissions(academy).length === 0) return
      retentionReconcileInFlightRef.current = true
      try {
        const result = await reconcileUnverifiedRetentions({
          userId: uid,
          state: academy,
          onError: (problemId, error) =>
            console.warn(
              `[progress] cloud verification rejected for ${problemId}`,
              error,
            ),
        })
        if (result.verified.length === 0) return
        if (identityRef.current !== identityId) return
        const latest = stateRef.current
        commit({
          ...latest,
          academyProgress: mergeAcademyProgressStates(
            latest.academyProgress,
            result.state,
          ),
        })
      } finally {
        retentionReconcileInFlightRef.current = false
      }
    },
    [commit, identityId],
  )

  const recordLearningAttempt = useCallback(
    async (input: LearningAttemptInput): Promise<AttemptEvent> => {
      if (!readyRef.current) throw new Error('Progress is still loading')
      if (!identityId) throw new Error('No active identity for learning attempt')
      const result = await localLearningStore.recordAttempt(identityId, input)
      if (identityRef.current === identityId) {
        learningCacheRef.current = result.state.cache
        setLearningCache(result.state.cache)
        setPendingLearningSyncCount(result.state.outbox.items.length)
      }
      if (wantsCloud && userId) void syncLearningNow().catch(warn)
      return result.event
    },
    [identityId, syncLearningNow, userId, wantsCloud],
  )

  // The v1 event log is independent from legacy snapshot loading. A transient
  // cloud failure therefore cannot prevent local recording or clear its outbox.
  useEffect(() => {
    let cancelled = false
    const initial = emptyLearningCache(identityId ?? 'unscoped')
    learningCacheRef.current = initial
    setLearningCache(initial)
    setPendingLearningSyncCount(0)
    setLearningSyncing(false)

    async function loadLearning() {
      if (!identityId) {
        return
      }

      try {
        let local = await localLearningStore.load(identityId)
        if (wantsCloud && userId) {
          try {
            const cloud = await loadCloudLearning(userId)
            if (cloud.events.length > 0 || cloud.mastery.length > 0) {
              local = await localLearningStore.mergeCloudState(
                identityId,
                cloud.events,
                cloud.mastery,
              )
            }
          } catch (error) {
            warn(error)
          }
        }

        if (!cancelled && identityRef.current === identityId) {
          const current = learningCacheRef.current
          if (
            current.identityId !== identityId ||
            local.cache.revision >= current.revision
          ) {
            learningCacheRef.current = local.cache
            setLearningCache(local.cache)
            setPendingLearningSyncCount(local.outbox.items.length)
          }
        }
        if (wantsCloud && userId) void syncLearningNow().catch(warn)
      } catch (error) {
        // Storage parse/write errors preserve the original bytes. Keep the app
        // usable without replacing them with an empty envelope.
        warn(error)
        if (!cancelled && identityRef.current === identityId) {
          const empty = emptyLearningCache(identityId)
          learningCacheRef.current = empty
          setLearningCache(empty)
          setPendingLearningSyncCount(0)
        }
      }
    }

    void loadLearning()
    return () => {
      cancelled = true
    }
  }, [identityId, syncLearningNow, userId, wantsCloud])

  useEffect(() => {
    if (!wantsCloud || !userId) return
    const retry = () => {
      void syncLearningNow()
        .then(() => {
          const academy = stateRef.current.academyProgress
          return academy
            ? saveAcademyProgressCloud(userId, academy)
            : undefined
        })
        .catch(warn)
        .then(() => reconcileRetentionVerification(userId))
        .catch(warn)
    }
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') retry()
    }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retryWhenVisible)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retryWhenVisible)
    }
  }, [reconcileRetentionVerification, syncLearningNow, userId, wantsCloud])

  // Load state whenever the identity changes.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    setProgressError(null)

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
          const localResult = loadLocalResult(user.id)
          const localBackup = localResult.state
          if (localResult.status === 'error' && !cancelled) {
            setProgressError(localResult.error.message)
          }
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
            if (hydrated.academyProgress) {
              const academy = hydrated.academyProgress
              const hasLocalEvidence = !!localBackup.academyProgress
              void syncLearningNow()
                .then(() =>
                  hasLocalEvidence
                    ? saveAcademyProgressCloud(user.id, academy)
                    : undefined,
                )
                .catch(warn)
                // Runs even when the atomic bulk save above was rejected:
                // per-mission submission is what recovers stuck completions.
                .then(() => reconcileRetentionVerification(user.id))
                .catch(warn)
            }
          }
        } catch (e) {
          warn(e)
          if (!cancelled) {
            const localResult = loadLocalResult(identityId)
            if (localResult.status === 'error') {
              setProgressError(localResult.error.message)
            }
            setState(hydrateProgressState(localResult.state))
            setReady(true)
          }
        } finally {
          if (!cancelled) setSyncing(false)
        }
      } else {
        const localResult = loadLocalResult(identityId)
        if (localResult.status === 'error') {
          setProgressError(localResult.error.message)
        }
        setState(hydrateProgressState(localResult.state))
        setReady(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [
    identityId,
    reconcileRetentionVerification,
    syncLearningNow,
    wantsCloud,
    user,
  ])

  const getLessonProgress = useCallback(
    (lessonId: string) => stateRef.current.lessons[lessonId],
    [],
  )

  const value = useMemo<ProgressContextValue>(() => {
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
    const interZoneComplete = state.interZoneComplete === true
    const dueProblemIds = selectDueProblemIds(
      learningCache,
      new Date().toISOString(),
    )
    const academyProgress = normalizeAcademyProgressState(
      state.academyProgress,
    )
    const trackProgress = (trackId: TrackId): AcademyTrackProgress =>
      selectTrackProgress(academyProgress, trackId)
    const realmProgress = (realmId: RealmId): AcademyRealmProgress =>
      selectRealmProgress(academyProgress, realmId)
    const academyCampaignComplete =
      isAcademyCampaignComplete(academyProgress)
    const readyForFinalGauntlet = isAcademyFinalGauntletReady(
      academyProgress,
      interZoneComplete,
    )
    const activeAcademyProblemId =
      selectActiveAcademyProblemId(academyProgress)

    // Guests preview the first lesson's interactive section only; quiz and
    // later lessons require an account.
    const isGuest = identityId === 'guest'

    const placementUnlockIndex = state.placementUnlockIndex ?? -1

    const isSequentiallyUnlocked = (lesson: LessonSummary): boolean => {
      const req = lesson.unlockRequirements
      if (!req.previousLessonId) return true
      if (isGuest) return false
      // Placement diagnostic can open worlds ahead of normal sequential unlocks.
      const catalogIndex = LESSON_CATALOG.findIndex((l) => l.id === lesson.id)
      if (catalogIndex >= 0 && catalogIndex <= placementUnlockIndex) return true
      const prev = state.lessons[req.previousLessonId]
      if (!prev) return false
      const prevLesson = generateLesson(req.previousLessonId)
      if (prevLesson && !isLearnComplete(prev, prevLesson)) return false
      if (req.minimumMastery == null) return true
      return canUnlockNextLesson(prev)
    }

    // Virtual showcase override: entry only — no mastery is fabricated.
    const isUnlocked = (lesson: LessonSummary): boolean =>
      lessonUnlockedWithShowcase(isShowcaseAccount, isSequentiallyUnlocked(lesson))

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
      syncing: syncing || learningSyncing,
      cloudEnabled: cloudActive,
      progressError,
      clearProgressError: () => setProgressError(null),
      experienceLevel: state.experienceLevel,
      recommendedLessonId: state.recommendedLessonId,
      needsPlacement:
        !state.experienceLevel && Object.keys(state.lessons).length === 0,
      streak: state.streak,
      lessons: state.lessons,
      variablesMastery,
      averageMastery,
      completedLessonsCount,
      totalLessonsCount,
      allLessonsComplete,
      interZoneComplete,
      readyForFinalGauntlet,
      activeLessonId,
      badgeCounts: state.badgeCounts ?? emptyState().badgeCounts,
      totalBadgeCount: totalBadgeCount(state.badgeCounts ?? emptyState().badgeCounts),
      badgesUnlockedCount: badgesUnlockedCount(state.badgeCounts ?? emptyState().badgeCounts),
      learnerModel: state.learnerModel ?? emptyLearnerModel(),
      recordLearningAttempt,
      problemMastery: learningCache.problemMastery,
      skillMastery: learningCache.skillMastery,
      dueProblemIds,
      pendingLearningSyncCount,
      syncLearningNow,
      academyProgress,
      trackProgress,
      realmProgress,
      academyCampaignComplete,
      activeAcademyProblemId,
      getLessonProgress,
      isLessonUnlocked: isUnlocked,

      recordMissionPractice: async (input) => {
        if (!ready) throw new Error('Progress is still loading')
        validateMissionPracticeEvents(learningCacheRef.current, input)
        const prev = stateRef.current
        const academy = applyMissionPractice(
          prev.academyProgress ?? emptyAcademyProgressState(),
          input,
        )
        if (!academy.missionPractices[input.problemId]) {
          throw new Error('Mission practice evidence did not satisfy policy')
        }
        if (!commit({ ...prev, academyProgress: academy })) {
          throw new Error('Mission practice could not be saved locally')
        }
        if (cloudActive && userId) {
          try {
            await syncLearningNow()
            await upsertAcademyMissionCloud(userId, academy, input.problemId)
          } catch (error) {
            warn(error)
          }
        }
      },

      recordMissionRetention: async (input) => {
        if (!ready) throw new Error('Progress is still loading')
        validateMissionRetentionEvents(learningCacheRef.current, input)
        const prev = stateRef.current
        const academy = applyMissionRetention(
          prev.academyProgress ?? emptyAcademyProgressState(),
          input,
        )
        if (!academy.missionCompletions[input.problemId]) {
          throw new Error('Delayed retrieval is not due or did not satisfy policy')
        }
        if (!commit({ ...prev, academyProgress: academy })) {
          throw new Error('Mission retention could not be saved locally')
        }
        if (cloudActive && userId) {
          try {
            await syncLearningNow()
            const cloudWrite = await upsertAcademyMissionCloud(
              userId,
              academy,
              input.problemId,
            )
            if (cloudWrite.status === 'ok') {
              const latest = stateRef.current
              const verified = markMissionRetentionCloudVerified(
                latest.academyProgress ?? academy,
                input.problemId,
              )
              commit({ ...latest, academyProgress: verified })
            }
          } catch (error) {
            warn(error)
          }
        }
      },

      recordRealmQuizAttempt: async (input) => {
        if (!ready) throw new Error('Progress is still loading')
        const events = linkedEvents(
          learningCacheRef.current,
          input.learningEventIds,
        )
        if (
          events.some(
            (event) =>
              !event.resolved ||
              !event.isCorrect ||
              (event.metadata?.assessmentKind === 'shortAnswer' &&
                (!event.firstTryCorrect ||
                  event.usedHint ||
                  event.revealed)),
          )
        ) {
          throw new Error('Realm evidence contains an ineligible learning event')
        }
        const prev = stateRef.current
        const academy = applyRealmQuizAttempt(
          prev.academyProgress ?? emptyAcademyProgressState(),
          input,
        )
        if (!academy.realmQuizzes[input.realmId]?.attempts[input.attemptId.trim()]) {
          throw new Error('Realm quiz evidence did not satisfy policy')
        }
        if (!commit({ ...prev, academyProgress: academy })) {
          throw new Error('Realm quiz progress could not be saved locally')
        }
        if (cloudActive && userId) {
          void syncLearningNow()
            .then(() =>
              upsertAcademyRealmCloud(userId, academy, input.realmId),
            )
            .catch(warn)
        }
      },

      recordRealmBossDefeat: async (input) => {
        if (!ready) throw new Error('Progress is still loading')
        const bossEvents = linkedEvents(
          learningCacheRef.current,
          input.learningEventIds,
        )
        if (
          bossEvents.some(
            (event) =>
              !event.resolved ||
              !event.isCorrect ||
              event.metadata?.academyMode !== 'realm-boss' ||
              event.metadata?.realmId !== input.realmId,
          )
        ) {
          throw new Error('Realm boss evidence is not eligible')
        }
        const prev = stateRef.current
        const academy = applyRealmBossDefeat(
          prev.academyProgress ?? emptyAcademyProgressState(),
          input,
        )
        if (!academy.bossDefeats[input.realmId]) {
          throw new Error('Realm boss evidence did not satisfy policy')
        }
        if (!commit({ ...prev, academyProgress: academy })) {
          throw new Error('Realm victory could not be saved locally')
        }
        if (cloudActive && userId) {
          void syncLearningNow()
            .then(() =>
              upsertAcademyRealmCloud(userId, academy, input.realmId),
            )
            .catch(warn)
        }
      },

      setExperienceLevel: (level) => {
        if (!ready) return
        const next = { ...stateRef.current, experienceLevel: level }
        if (!commit(next)) return
        if (cloudActive && userId) saveExperienceCloud(userId, level).catch(warn)
      },

      completePlacement: (level, startLessonId) => {
        if (!ready) return
        const startIndex = LESSON_CATALOG.findIndex((l) => l.id === startLessonId)
        const next: ProgressState = {
          ...stateRef.current,
          experienceLevel: level,
          recommendedLessonId: startIndex >= 0 ? startLessonId : FIRST_LESSON_ID,
          // Unlock every world up to (and including) the recommended start.
          placementUnlockIndex: Math.max(0, startIndex),
        }
        if (!commit(next)) return
        if (cloudActive && userId) saveExperienceCloud(userId, level).catch(warn)
      },

      completeInterZone: () => {
        if (!ready) return
        const prev = stateRef.current
        // Idempotent: never overwrite an existing completion timestamp.
        if (prev.interZoneComplete) return
        const completedAt = new Date().toISOString()
        const next: ProgressState = {
          ...prev,
          interZoneComplete: true,
          interZoneCompletedAt: completedAt,
        }
        if (!commit(next)) return
        if (cloudActive && userId) saveInterZoneCloud(userId, completedAt).catch(warn)
      },

      recordDailyActivity: () => {
        if (!ready) {
          pendingDailyActivityRef.current = true
          return
        }
        pendingDailyActivityRef.current = false
        const prev = stateRef.current
        const streak = nextStreak(prev.streak)
        if (streak === prev.streak) return
        if (!commit({ ...prev, streak })) return
        if (cloudActive && userId) saveStreakCloud(userId, streak).catch(warn)
      },

      saveLessonProgress: (progress) => {
        if (!ready) return
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
        if (!commit({
          ...prev,
          badgeCounts,
          streak,
          lessons: { ...prev.lessons, [progressToSave.lessonId]: merged },
        })) return
        if (cloudActive && userId) {
          upsertLessonCloud(userId, merged).catch(warn)
          saveStreakCloud(userId, streak).catch(warn)
          if (badgesChanged) saveBadgesCloud(userId, badgeCounts).catch(warn)
        }
      },

      saveLessonReview: (lessonId, review) => {
        if (!ready) return
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
        if (!commit({
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: updated },
        })) return
        if (cloudActive && userId) upsertLessonCloud(userId, updated).catch(warn)
      },

      logAttempt: (attempt) => {
        if (!ready) return
        if (cloudActive && userId) insertAttemptCloud(userId, attempt).catch(warn)
      },

      recordConceptResult: ({ conceptIds, firstTry, correct, responseMs }) => {
        if (!ready) return
        if (!conceptIds || conceptIds.length === 0) return
        const prev = stateRef.current
        const now = Date.now()
        let model = prev.learnerModel ?? emptyLearnerModel()
        for (const cid of conceptIds) {
          model = updateConcept(model, cid, { firstTry, correct, responseMs }, now)
        }
        if (!commit({ ...prev, learnerModel: model })) return
        if (cloudActive && userId) {
          const touched = conceptIds
            .map((c) => model.concepts[c])
            .filter((s): s is NonNullable<typeof s> => !!s)
          saveConceptMasteryCloud(userId, touched).catch(warn)
        }
      },

      awardBadges: (counts) => {
        if (!ready) return
        const add = mergeBadgeCounts(emptyState().badgeCounts, counts)
        if (totalBadgeCount(add) === 0) return
        const prev = stateRef.current
        const merged = mergeBadgeCounts(prev.badgeCounts ?? emptyState().badgeCounts, counts)
        if (!commit({ ...prev, badgeCounts: merged })) return
        if (cloudActive && userId) saveBadgesCloud(userId, merged).catch(warn)
      },

      resetLesson: (lessonId) => {
        if (!ready) return
        const prev = stateRef.current
        const lessons = { ...prev.lessons }
        delete lessons[lessonId]
        if (!commit({ ...prev, lessons })) return
        if (cloudActive && userId) deleteLessonCloud(userId, lessonId).catch(warn)
      },

      restartQuizProgress: (lessonId) => {
        if (!ready) return
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

        if (!commit({
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: reset },
        })) return
        if (cloudActive && userId) upsertLessonCloud(userId, reset).catch(warn)
      },
    }
  }, [
    state,
    learningCache,
    pendingLearningSyncCount,
    ready,
    syncing,
    learningSyncing,
    cloudActive,
    userId,
    identityId,
    isShowcaseAccount,
    commit,
    progressError,
    getLessonProgress,
    recordLearningAttempt,
    syncLearningNow,
  ])

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
