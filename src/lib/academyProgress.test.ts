import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId, RealmId, TrackId } from '../types/curriculum'
import type { ProblemMasteryRecord } from '../types/learning'
import {
  ACADEMY_REALM_QUIZ_PASS_SCORE,
  emptyAcademyProgressState,
  isAcademyCampaignComplete,
  isMissionCompleted,
  isRealmCleared,
  isRealmKnowledgePassed,
  isRealmQuizPassed,
  isTrackComplete,
  normalizeAcademyProgressState,
  isMissionRetentionDue,
  missionRetentionAvailableAt,
  recordMissionPractice,
  recordMissionRetention,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
  selectAcademyProblemProgress,
  selectAcademyProgressCounts,
  selectActiveAcademyProblemId,
  selectFirstIncompleteProblem,
  selectFirstIncompleteRealm,
  selectFirstIncompleteTrack,
  selectRealmProgress,
  selectTrackProgress,
} from './academyProgress'

const BASE_TIME = '2026-07-11T12:00:00.000Z'

function completeProblem(
  state: AcademyProgressState,
  problemId: ProblemId,
  completedAt = BASE_TIME,
): AcademyProgressState {
  const practiced = recordMissionPractice(state, {
    problemId,
    acquiredAt: completedAt,
    practicedAt: completedAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:${problemId}:acquisition`],
    transferEventIds: [`event:${problemId}:python`],
    codeTestEventIds: [`event:${problemId}:python`],
  })
  const retainedAt = new Date(
    Date.parse(completedAt) +
      NEETCODE_150_MANIFEST.masteryPolicy.delayedRetrievalMinimumHours *
        60 *
        60 *
        1000,
  ).toISOString()
  return recordMissionRetention(practiced, {
    problemId,
    retainedAt,
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: [`event:${problemId}:retention`],
  })
}

function completeTrack(
  state: AcademyProgressState,
  trackId: TrackId,
): AcademyProgressState {
  const track = NEETCODE_150_MANIFEST.tracks.find(({ id }) => id === trackId)
  if (!track) throw new Error(`Missing test track ${trackId}`)
  return track.problemIds.reduce(
    (next, problemId) => completeProblem(next, problemId),
    state,
  )
}

function completeRealmProblems(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  const realm = NEETCODE_150_MANIFEST.realms.find(({ id }) => id === realmId)
  if (!realm) throw new Error(`Missing test realm ${realmId}`)
  return realm.trackIds.reduce(completeTrack, state)
}

function passRealmQuiz(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  return recordRealmQuizAttempt(state, {
    realmId,
    attemptId: `quiz:${realmId}:pass`,
    attemptedAt: BASE_TIME,
    score: ACADEMY_REALM_QUIZ_PASS_SCORE,
    openEndedTransferPassed: true,
    learningEventIds: [`event:quiz:${realmId}`],
  })
}

function defeatRealmBoss(
  state: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  return recordRealmBossDefeat(state, {
    realmId,
    defeatId: `battle:${realmId}:win`,
    defeatedAt: BASE_TIME,
    learningEventIds: [`event:battle:${realmId}`],
  })
}

describe('academy manifest selectors', () => {
  it('uses exactly 150 problems, 18 tracks, and six three-track realms', () => {
    const state = emptyAcademyProgressState()
    const counts = selectAcademyProgressCounts(state)

    expect(counts).toEqual({
      practicedProblems: 0,
      completedProblems: 0,
      totalProblems: 150,
      practicedTracks: 0,
      completedTracks: 0,
      totalTracks: 18,
      knowledgePassedRealms: 0,
      clearedRealms: 0,
      totalRealms: 6,
    })
    expect(NEETCODE_150_MANIFEST.realms).toHaveLength(6)
    for (const realm of NEETCODE_150_MANIFEST.realms) {
      expect(realm.trackIds).toHaveLength(3)
      expect(selectRealmProgress(state, realm.id).totalTracks).toBe(3)
    }
    for (const track of NEETCODE_150_MANIFEST.tracks) {
      expect(selectTrackProgress(state, track.id).totalProblems).toBe(
        track.problemCount,
      )
    }
    expect(selectFirstIncompleteRealm(state)).toBe('realm1')
    expect(selectFirstIncompleteTrack(state)).toBe('arrays-hashing')
    expect(selectFirstIncompleteProblem(state)).toBe(
      'problem:contains-duplicate',
    )
    expect(selectActiveAcademyProblemId(state)).toBe(
      'problem:contains-duplicate',
    )
  })

  it('completes a track only after every exact manifest problem is complete', () => {
    for (const track of NEETCODE_150_MANIFEST.tracks) {
      let state = emptyAcademyProgressState()
      const last = track.problemIds.at(-1)
      if (!last) throw new Error(`Empty track ${track.id}`)
      for (const problemId of track.problemIds.slice(0, -1)) {
        state = completeProblem(state, problemId)
      }
      expect(isTrackComplete(state, track.id)).toBe(false)
      expect(selectTrackProgress(state, track.id).firstIncompleteProblemId).toBe(
        last,
      )
      state = completeProblem(state, last)
      expect(isTrackComplete(state, track.id)).toBe(true)
    }
  })
})

describe('academy transitions', () => {
  it('records practice only with nonempty atomic event evidence', () => {
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    const empty = emptyAcademyProgressState()
    const incomplete = recordMissionPractice(empty, {
      problemId,
      acquiredAt: '2026-07-12T12:00:00.000Z',
      practicedAt: '2026-07-12T12:01:00.000Z',
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: [],
      transferEventIds: ['event:transfer'],
      codeTestEventIds: ['event:code'],
    })
    expect(incomplete.missionPractices[problemId]).toBeUndefined()
    expect(isMissionCompleted(incomplete, problemId)).toBe(false)

    const practiced = recordMissionPractice(empty, {
      problemId,
      acquiredAt: '2026-07-12T12:00:00.000Z',
      practicedAt: '2026-07-12T12:01:00.000Z',
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: ['event:acquisition'],
      transferEventIds: ['event:python'],
      codeTestEventIds: ['event:python'],
    })
    expect(practiced.missionPractices[problemId]).toBeDefined()
    expect(practiced.missionCompletions[problemId]).toBeUndefined()
    expect(selectAcademyProgressCounts(practiced)).toMatchObject({
      practicedProblems: 1,
      completedProblems: 0,
    })
  })

  it('opens delayed retrieval at 24:00, not 23:59', () => {
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    const acquiredAt = '2026-07-11T12:00:00.000Z'
    const practiced = recordMissionPractice(emptyAcademyProgressState(), {
      problemId,
      acquiredAt,
      practicedAt: acquiredAt,
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: ['event:acquisition'],
      transferEventIds: ['event:python'],
      codeTestEventIds: ['event:python'],
    })
    expect(missionRetentionAvailableAt(practiced.missionPractices[problemId]!))
      .toBe('2026-07-12T12:00:00.000Z')
    expect(
      isMissionRetentionDue(
        practiced,
        problemId,
        '2026-07-12T11:59:00.000Z',
      ),
    ).toBe(false)
    expect(
      isMissionRetentionDue(
        practiced,
        problemId,
        '2026-07-12T12:00:00.000Z',
      ),
    ).toBe(true)
    const retained = recordMissionRetention(practiced, {
      problemId,
      retainedAt: '2026-07-12T12:00:00.000Z',
      delayedRetrievalPassed: true,
      delayedRetrievalEventIds: ['event:retention'],
    })
    expect(isMissionCompleted(retained, problemId)).toBe(true)
  })

  it('deduplicates stable quiz attempts while retaining best evidence', () => {
    let state = recordRealmQuizAttempt(emptyAcademyProgressState(), {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:1',
      attemptedAt: '2026-07-12T12:00:00.000Z',
      score: 70,
      openEndedTransferPassed: false,
      learningEventIds: ['event:quiz:1'],
    })
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:1',
      attemptedAt: '2026-07-11T12:00:00.000Z',
      score: 80,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz:1-transfer'],
    })
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:2',
      attemptedAt: '2026-07-13T12:00:00.000Z',
      score: 50,
      openEndedTransferPassed: false,
      learningEventIds: ['event:quiz:2'],
    })

    expect(state.realmQuizzes.realm1).toMatchObject({
      bestScore: 80,
      attemptCount: 2,
      openEndedTransferPassed: true,
      firstAttemptedAt: '2026-07-11T12:00:00.000Z',
      lastAttemptedAt: '2026-07-13T12:00:00.000Z',
    })
    expect(Object.keys(state.realmQuizzes.realm1?.attempts ?? {})).toHaveLength(2)
  })

  it('keeps mission completion distinct from current mastery', () => {
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    const mastery: ProblemMasteryRecord = {
      entityKind: 'problem',
      entityId: problemId,
      submissionCount: 4,
      reviewCount: 4,
      correctCount: 4,
      firstTryCorrectCount: 4,
      ability: 0.95,
      recentResults: [true],
      schedule: {
        schedulerVersion: 1,
        phase: 'review',
        stabilityDays: 3,
        difficulty: 3,
        dueAt: '2026-07-14T12:00:00.000Z',
        reps: 4,
        lapses: 0,
      },
      revision: 4,
      projectionVersion: 1,
    }
    const view = selectAcademyProblemProgress(
      emptyAcademyProgressState(),
      problemId,
      mastery,
    )
    expect(view.missionCompleted).toBe(false)
    expect(view.currentMastery?.ability).toBe(0.95)
    expect(view).not.toHaveProperty('mastered')
  })
})

describe('realm and campaign gates', () => {
  it('does not let a 79% quiz and combat victory bypass knowledge', () => {
    let state = completeRealmProblems(emptyAcademyProgressState(), 'realm1')
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:79',
      attemptedAt: BASE_TIME,
      score: 79,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz:79'],
    })
    state = defeatRealmBoss(state, 'realm1')

    expect(isRealmQuizPassed(state, 'realm1')).toBe(false)
    expect(isRealmKnowledgePassed(state, 'realm1')).toBe(false)
    expect(isRealmCleared(state, 'realm1')).toBe(false)
    expect(selectRealmProgress(state, 'realm1')).toMatchObject({
      completedTracks: 3,
      quizBestScore: 79,
      bossDefeated: true,
      cleared: false,
    })
  })

  it('requires open-ended transfer even at the 80% threshold', () => {
    let state = completeRealmProblems(emptyAcademyProgressState(), 'realm1')
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:no-transfer',
      attemptedAt: BASE_TIME,
      score: 80,
      openEndedTransferPassed: false,
      learningEventIds: ['event:quiz:no-transfer'],
    })
    state = defeatRealmBoss(state, 'realm1')
    expect(isRealmQuizPassed(state, 'realm1')).toBe(false)
    expect(isRealmCleared(state, 'realm1')).toBe(false)
  })

  it('does not combine score and transfer from different quiz attempts', () => {
    let state = completeRealmProblems(emptyAcademyProgressState(), 'realm1')
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:score-only',
      attemptedAt: '2026-07-11T12:00:00.000Z',
      score: 80,
      openEndedTransferPassed: false,
      learningEventIds: ['event:quiz:score-only'],
    })
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:transfer-only',
      attemptedAt: '2026-07-11T12:05:00.000Z',
      score: 79,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz:transfer-only'],
    })
    state = defeatRealmBoss(state, 'realm1')

    expect(state.realmQuizzes.realm1).toMatchObject({
      bestScore: 80,
      openEndedTransferPassed: true,
    })
    expect(isRealmQuizPassed(state, 'realm1')).toBe(false)
    expect(isRealmKnowledgePassed(state, 'realm1')).toBe(false)
    expect(isRealmCleared(state, 'realm1')).toBe(false)

    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: 'quiz:realm1:qualifying',
      attemptedAt: '2026-07-11T12:10:00.000Z',
      score: 80,
      openEndedTransferPassed: true,
      learningEventIds: ['event:quiz:qualifying'],
    })
    expect(isRealmQuizPassed(state, 'realm1')).toBe(true)
    expect(isRealmCleared(state, 'realm1')).toBe(true)
  })

  it('does not clear a realm when its boss is beaten before knowledge passes', () => {
    let state = defeatRealmBoss(emptyAcademyProgressState(), 'realm1')
    expect(selectRealmProgress(state, 'realm1')).toMatchObject({
      bossDefeated: true,
      knowledgePassed: false,
      cleared: false,
    })

    state = passRealmQuiz(completeRealmProblems(state, 'realm1'), 'realm1')
    expect(isRealmKnowledgePassed(state, 'realm1')).toBe(true)
    expect(isRealmCleared(state, 'realm1')).toBe(true)
  })

  it('completes the campaign only after all 150 missions and six realm gates', () => {
    let state = NEETCODE_150_MANIFEST.problems.reduce(
      (next, problem) => completeProblem(next, problem.id),
      emptyAcademyProgressState(),
    )
    expect(selectAcademyProgressCounts(state)).toMatchObject({
      completedProblems: 150,
      completedTracks: 18,
    })
    expect(selectFirstIncompleteProblem(state)).toBeNull()
    expect(selectFirstIncompleteTrack(state)).toBeNull()
    expect(selectActiveAcademyProblemId(state)).toBeNull()
    expect(isAcademyCampaignComplete(state)).toBe(false)

    for (const realm of NEETCODE_150_MANIFEST.realms) {
      state = passRealmQuiz(state, realm.id)
      state = defeatRealmBoss(state, realm.id)
    }

    expect(selectAcademyProgressCounts(state)).toEqual({
      practicedProblems: 150,
      completedProblems: 150,
      totalProblems: 150,
      practicedTracks: 18,
      completedTracks: 18,
      totalTracks: 18,
      knowledgePassedRealms: 6,
      clearedRealms: 6,
      totalRealms: 6,
    })
    expect(isAcademyCampaignComplete(state)).toBe(true)
    expect(selectFirstIncompleteRealm(state)).toBeNull()
  })
})

describe('academy normalization', () => {
  it('upgrades snapshots, preserves safe summaries, and drops non-manifest IDs', () => {
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    const normalized = normalizeAcademyProgressState({
      schemaVersion: 0,
      curriculumId: 'curriculum:legacy',
      curriculumVersion: 'v0.0.1',
      contentVersion: 'v0.0.1',
      missionCompletions: {
        [problemId]: {
          problemId,
          completedAt: BASE_TIME,
          acquisitionPassed: true,
          transferPassed: true,
          codeTestsPassed: true,
          acquisitionEventIds: ['event:a', 'event:a'],
          transferEventIds: ['event:python'],
          codeTestEventIds: ['event:python'],
        },
        'problem:not-in-manifest': {
          problemId: 'problem:not-in-manifest',
          completedAt: BASE_TIME,
          acquisitionPassed: true,
          transferPassed: true,
          codeTestsPassed: true,
        },
      },
      realmQuizzes: {
        realm1: {
          realmId: 'realm1',
          bestScore: 85,
          attemptCount: 3,
          openEndedTransferPassed: true,
          firstAttemptedAt: BASE_TIME,
          lastAttemptedAt: BASE_TIME,
          attempts: {},
        },
      },
      lessons: {
        'legacy-lesson-1': { status: 'completed' },
      },
    })

    expect(normalized).toMatchObject({
      schemaVersion: 1,
      curriculumId: NEETCODE_150_MANIFEST.id,
      curriculumVersion: NEETCODE_150_MANIFEST.version.schema,
      contentVersion: NEETCODE_150_MANIFEST.version.content,
    })
    expect(Object.keys(normalized.missionPractices)).toEqual([problemId])
    expect(Object.keys(normalized.missionCompletions)).toEqual([])
    expect(
      normalized.missionPractices[problemId]?.acquisitionEventIds,
    ).toEqual(['event:a'])
    expect(normalized.realmQuizzes.realm1?.attemptCount).toBe(3)
    expect(isRealmQuizPassed(normalized, 'realm1')).toBe(false)
    expect(selectAcademyProgressCounts(normalized)).toMatchObject({
      practicedProblems: 1,
      completedProblems: 0,
    })
  })
})
