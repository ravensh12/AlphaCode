import { describe, it, expect } from 'vitest'
import {
  mergeInProgress,
  mergeCompleted,
  reconcileLessonProgress,
  mergeProgressStates,
} from './progressMerge'
import { emptyState } from './localProgress'
import type { LessonProgress } from '../types/progress'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId, TrackId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  isRealmCleared,
  recordMissionPractice,
  recordMissionRetention,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
} from './academyProgress'

/** Fully-specified lesson snapshot so merge tests are deterministic. */
function lp(over: Partial<LessonProgress> = {}): LessonProgress {
  return {
    lessonId: 'lesson-1',
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
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  }
}

function academyMission(
  state: AcademyProgressState,
  problemId: ProblemId,
  completedAt: string,
  eventSuffix: string,
): AcademyProgressState {
  const acquiredAt = new Date(
    Date.parse(completedAt) - 24 * 60 * 60 * 1000,
  ).toISOString()
  const practiced = recordMissionPractice(state, {
    problemId,
    acquiredAt,
    practicedAt: acquiredAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:acquisition:${eventSuffix}`],
    transferEventIds: [`event:python:${eventSuffix}`],
    codeTestEventIds: [`event:python:${eventSuffix}`],
  })
  return recordMissionRetention(practiced, {
    problemId,
    retainedAt: completedAt,
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: [`event:retention:${eventSuffix}`],
  })
}

describe('mergeInProgress', () => {
  it('keeps the furthest step and unions completed step ids', () => {
    const merged = mergeInProgress(
      lp({ currentStepIndex: 5, completedStepIds: ['a', 'b'], correctCount: 4 }),
      lp({ currentStepIndex: 3, completedStepIds: ['b', 'c'], correctCount: 2 }),
    )
    expect(merged.currentStepIndex).toBe(5)
    expect(merged.completedStepIds.sort()).toEqual(['a', 'b', 'c'])
    expect(merged.correctCount).toBe(4)
  })

  it('never loses the learnCompleted latch', () => {
    const merged = mergeInProgress(lp({ learnCompleted: true }), lp({ learnCompleted: undefined }))
    expect(merged.learnCompleted).toBe(true)
  })

  it('takes step and frame from one coherent section position', () => {
    const merged = mergeInProgress(
      lp({
        learnStepIndex: 5,
        learnFrameIndex: 2,
        quizStepIndex: 4,
        quizFrameIndex: 1,
      }),
      lp({
        learnStepIndex: 3,
        learnFrameIndex: 99,
        quizStepIndex: 2,
        quizFrameIndex: 99,
      }),
    )
    expect([merged.learnStepIndex, merged.learnFrameIndex]).toEqual([5, 2])
    expect([merged.quizStepIndex, merged.quizFrameIndex]).toEqual([4, 1])
  })
})

describe('mergeCompleted', () => {
  it('keeps best metrics and the earliest completion timestamp', () => {
    const merged = mergeCompleted(
      lp({
        status: 'completed',
        masteryScore: 80,
        accuracy: 90,
        completedAt: '2026-06-01T00:00:00.000Z',
      }),
      lp({
        status: 'completed',
        masteryScore: 60,
        accuracy: 95,
        completedAt: '2026-06-15T00:00:00.000Z',
      }),
    )
    expect(merged.status).toBe('completed')
    expect(merged.masteryScore).toBe(80)
    expect(merged.accuracy).toBe(95)
    expect(merged.completedAt).toBe('2026-06-01T00:00:00.000Z')
    expect(
      mergeCompleted(
        lp({
          status: 'completed',
          completedAt: '2026-06-15T00:00:00.000Z',
        }),
        lp({
          status: 'completed',
          completedAt: '2026-06-01T00:00:00.000Z',
        }),
      ).completedAt,
    ).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('reconcileLessonProgress', () => {
  it('a completed copy always beats an in-progress copy', () => {
    const done = lp({ status: 'completed', masteryScore: 75, unlockNextLesson: true })
    const wip = lp({ status: 'inProgress', currentStepIndex: 9 })
    for (const [a, b] of [
      [done, wip],
      [wip, done],
    ] as const) {
      const rec = reconcileLessonProgress(a, b)
      expect(rec.status).toBe('completed')
      expect(rec.unlockNextLesson).toBe(true)
      expect(rec.currentStepIndex).toBe(9)
    }
  })

  it('is commutative, associative, and idempotent', () => {
    const a = lp({
      currentStepIndex: 2,
      learnStepIndex: 2,
      learnFrameIndex: 4,
      completedStepIds: ['a'],
    })
    const b = lp({
      currentStepIndex: 5,
      learnStepIndex: 5,
      learnFrameIndex: 1,
      completedStepIds: ['b'],
      wrongCount: 2,
    })
    const c = lp({
      status: 'completed',
      masteryScore: 80,
      completedAt: '2026-06-01T00:00:00.000Z',
      completedStepIds: ['c'],
    })

    expect(reconcileLessonProgress(a, b)).toEqual(
      reconcileLessonProgress(b, a),
    )
    expect(
      reconcileLessonProgress(reconcileLessonProgress(a, b), c),
    ).toEqual(reconcileLessonProgress(a, reconcileLessonProgress(b, c)))
    expect(reconcileLessonProgress(a, a)).toEqual(a)
  })
})

describe('mergeProgressStates (cloud ⇄ local)', () => {
  it('unions lessons and never drops local-only progress', () => {
    const cloud = emptyState()
    cloud.lessons['a'] = lp({ lessonId: 'a', status: 'completed', masteryScore: 70 })
    const local = emptyState()
    local.lessons['a'] = lp({ lessonId: 'a', currentStepIndex: 4 })
    local.lessons['b'] = lp({ lessonId: 'b', currentStepIndex: 2 })

    const merged = mergeProgressStates(cloud, local)
    expect(merged.lessons['a'].status).toBe('completed')
    expect(merged.lessons['b'].currentStepIndex).toBe(2)
  })

  it('keeps the one-way Threshold latch with the earliest timestamp', () => {
    const cloud = emptyState()
    const local = emptyState()
    local.interZoneComplete = true
    local.interZoneCompletedAt = '2026-06-20T00:00:00.000Z'
    const merged = mergeProgressStates(cloud, local)
    expect(merged.interZoneComplete).toBe(true)
    expect(merged.interZoneCompletedAt).toBe('2026-06-20T00:00:00.000Z')
  })

  it('reconciles streaks by most recent activity date', () => {
    const cloud = emptyState()
    cloud.streak = { current: 3, longest: 8, lastActivityDate: '2026-06-28' }
    const local = emptyState()
    local.streak = { current: 5, longest: 5, lastActivityDate: '2026-07-01' }
    const merged = mergeProgressStates(cloud, local)
    expect(merged.streak.current).toBe(5)
    expect(merged.streak.longest).toBe(8)
    expect(merged.streak.lastActivityDate).toBe('2026-07-01')
  })

  it('badge snapshot merge is idempotent (max per badge wins)', () => {
    const cloud = emptyState()
    cloud.badgeCounts = { lightning: 6, quick: 0, 'speed-demon': 1, flawless: 0 }
    const local = emptyState()
    local.badgeCounts = { lightning: 2, quick: 3, 'speed-demon': 0, flawless: 1 }
    const merged = mergeProgressStates(cloud, local)
    expect(merged.badgeCounts).toEqual({
      lightning: 6,
      quick: 3,
      'speed-demon': 1,
      flawless: 1,
    })
    expect(mergeProgressStates(cloud, merged).badgeCounts).toEqual(
      merged.badgeCounts,
    )
  })

  it('merges academy facts idempotently and commutatively', () => {
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    const cloud = emptyState()
    let cloudAcademy = academyMission(
      emptyAcademyProgressState(),
      problemId,
      '2026-07-12T12:00:00.000Z',
      'cloud',
    )
    cloudAcademy = recordRealmQuizAttempt(cloudAcademy, {
      realmId: 'realm1',
      attemptId: 'quiz:cloud',
      attemptedAt: '2026-07-12T12:00:00.000Z',
      score: 75,
      openEndedTransferPassed: false,
      learningEventIds: ['event:quiz:cloud'],
    })
    cloudAcademy = recordRealmBossDefeat(cloudAcademy, {
      realmId: 'realm1',
      defeatId: 'boss:cloud',
      defeatedAt: '2026-07-12T12:00:00.000Z',
      learningEventIds: ['event:boss:cloud'],
    })
    cloud.academyProgress = cloudAcademy

    const local = emptyState()
    let localAcademy = academyMission(
      emptyAcademyProgressState(),
      problemId,
      '2026-07-10T12:00:00.000Z',
      'local',
    )
    localAcademy = recordRealmQuizAttempt(localAcademy, {
      realmId: 'realm1',
      attemptId: 'quiz:local',
      attemptedAt: '2026-07-10T12:00:00.000Z',
      score: 85,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz:local'],
    })
    localAcademy = recordRealmBossDefeat(localAcademy, {
      realmId: 'realm1',
      defeatId: 'boss:local',
      defeatedAt: '2026-07-09T12:00:00.000Z',
      learningEventIds: ['event:boss:local'],
    })
    local.academyProgress = localAcademy

    const cloudLocal = mergeProgressStates(cloud, local)
    const localCloud = mergeProgressStates(local, cloud)
    expect(cloudLocal.academyProgress).toEqual(localCloud.academyProgress)
    expect(
      mergeProgressStates(cloudLocal, cloudLocal).academyProgress,
    ).toEqual(cloudLocal.academyProgress)
    expect(
      cloudLocal.academyProgress?.missionCompletions[problemId]?.completedAt,
    ).toBe('2026-07-10T12:00:00.000Z')
    expect(
      cloudLocal.academyProgress?.missionCompletions[problemId]
        ?.acquisitionEventIds,
    ).toEqual(['event:acquisition:cloud', 'event:acquisition:local'])
    expect(cloudLocal.academyProgress?.realmQuizzes.realm1).toMatchObject({
      bestScore: 85,
      attemptCount: 2,
      openEndedTransferPassed: true,
    })
    expect(cloudLocal.academyProgress?.bossDefeats.realm1).toMatchObject({
      defeatedAt: '2026-07-09T12:00:00.000Z',
      defeatIds: ['boss:cloud', 'boss:local'],
    })
  })

  it('uses a safe max for unidentified quiz attempts', () => {
    const cloud = emptyState()
    const local = emptyState()
    const cloudAcademy = emptyAcademyProgressState()
    const localAcademy = emptyAcademyProgressState()
    cloud.academyProgress = {
      ...cloudAcademy,
      realmQuizzes: {
        realm1: {
          evidenceVersion: 1,
          realmId: 'realm1',
          bestScore: 70,
          attemptCount: 4,
          openEndedTransferPassed: false,
          attempts: {},
        },
      },
    }
    local.academyProgress = {
      ...localAcademy,
      realmQuizzes: {
        realm1: {
          evidenceVersion: 1,
          realmId: 'realm1',
          bestScore: 75,
          attemptCount: 3,
          openEndedTransferPassed: false,
          attempts: {},
        },
      },
    }

    expect(
      mergeProgressStates(cloud, local).academyProgress?.realmQuizzes.realm1
        ?.attemptCount,
    ).toBe(4)
  })

  it('does not allow merged low-score quiz and boss evidence to bypass knowledge', () => {
    const cloud = emptyState()
    let academy = emptyAcademyProgressState()
    const realm = NEETCODE_150_MANIFEST.realms[0]
    const realmTrackIds = new Set<TrackId>(realm.trackIds)
    const realmProblemIds = NEETCODE_150_MANIFEST.tracks
      .filter(({ id }) => realmTrackIds.has(id))
      .flatMap(({ problemIds }) => problemIds)
    for (const problemId of realmProblemIds) {
      academy = academyMission(
        academy,
        problemId,
        '2026-07-10T12:00:00.000Z',
        problemId,
      )
    }
    academy = recordRealmQuizAttempt(academy, {
      realmId: 'realm1',
      attemptId: 'quiz:79',
      attemptedAt: '2026-07-10T12:00:00.000Z',
      score: 79,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz:79'],
    })
    cloud.academyProgress = academy

    const local = emptyState()
    local.academyProgress = recordRealmBossDefeat(
      emptyAcademyProgressState(),
      {
        realmId: 'realm1',
        defeatId: 'boss:win',
        defeatedAt: '2026-07-11T12:00:00.000Z',
        learningEventIds: ['event:boss:win'],
      },
    )
    const merged = mergeProgressStates(cloud, local)
    expect(merged.academyProgress).toBeDefined()
    expect(isRealmCleared(merged.academyProgress!, 'realm1')).toBe(false)
  })

  it('does not translate completed legacy lessons into academy completions', () => {
    const cloud = emptyState()
    const local = emptyState()
    for (let index = 1; index <= 6; index += 1) {
      local.lessons[`legacy-${index}`] = lp({
        lessonId: `legacy-${index}`,
        status: 'completed',
      })
    }
    const merged = mergeProgressStates(cloud, local)
    expect(merged.academyProgress).toBeUndefined()
  })
})
