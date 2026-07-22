import { describe, expect, it } from 'vitest'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_SLUG,
} from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { RealmId, TrackId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  isAcademyFinalGauntletReady,
  recordMissionPractice,
  recordMissionRetention,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
  selectRealmProgress,
} from './academyProgress'
import {
  academyTourPosition,
  canEnterAcademyBoss,
  canEnterAcademyCheckpoint,
  isAcademyRealmUnlocked,
  realmBossFollowUp,
  realmIdForWorldIndex,
  resolveAcademyMissionRoute,
  resolveAcademyTrackRoute,
  trackIdForCheckpoint,
} from './academyQuest'

const NOW = '2026-07-11T18:00:00.000Z'
const RETAINED = '2026-07-12T18:00:00.000Z'

function practiceTrack(
  initial: AcademyProgressState,
  trackId: TrackId,
): AcademyProgressState {
  const track = NEETCODE_150_MANIFEST.tracks.find(({ id }) => id === trackId)!
  return track.problemIds.reduce(
    (state, problemId) =>
      recordMissionPractice(state, {
        problemId,
        acquiredAt: NOW,
        practicedAt: NOW,
        acquisitionPassed: true,
        transferPassed: true,
        codeTestsPassed: true,
        acquisitionEventIds: [`acquisition:${problemId}`],
        transferEventIds: [`python:${problemId}`],
        codeTestEventIds: [`python:${problemId}`],
      }),
    initial,
  )
}

function completeTrack(
  initial: AcademyProgressState,
  trackId: TrackId,
): AcademyProgressState {
  const practiced = practiceTrack(initial, trackId)
  const track = NEETCODE_150_MANIFEST.tracks.find(({ id }) => id === trackId)!
  return track.problemIds.reduce(
    (state, problemId) =>
      recordMissionRetention(state, {
        problemId,
        retainedAt: RETAINED,
        delayedRetrievalPassed: true,
        delayedRetrievalEventIds: [`retention:${problemId}`],
      }),
    practiced,
  )
}

function completeRealmTracks(
  initial: AcademyProgressState,
  realmId: RealmId,
): AcademyProgressState {
  const realm = NEETCODE_150_MANIFEST.realms.find(({ id }) => id === realmId)!
  return realm.trackIds.reduce(completeTrack, initial)
}

describe('academy route mapping', () => {
  it('maps six physical worlds and their three checkpoints in manifest order', () => {
    expect(realmIdForWorldIndex(0)).toBe('realm1')
    expect(realmIdForWorldIndex(5)).toBe('realm6')
    expect(realmIdForWorldIndex(6)).toBeNull()
    expect(trackIdForCheckpoint(0, 0)).toBe('arrays-hashing')
    expect(trackIdForCheckpoint(0, 1)).toBe('two-pointers')
    expect(trackIdForCheckpoint(0, 2)).toBe('sliding-window')
  })

  it('canonicalizes mismatched realm, track, and mission relationships', () => {
    expect(resolveAcademyTrackRoute('realm1', 'stack')).toMatchObject({
      kind: 'redirect',
      to: '/academy/realm2/stack',
    })
    expect(
      resolveAcademyMissionRoute(
        'realm1',
        'two-pointers',
        'contains-duplicate',
      ),
    ).toMatchObject({
      kind: 'redirect',
      to: '/academy/realm1/arrays-hashing/contains-duplicate',
    })
    expect(
      resolveAcademyMissionRoute(
        'realm1',
        'arrays-hashing',
        'contains-duplicate',
      ),
    ).toMatchObject({
      kind: 'valid',
      problem: NEETCODE_150_PROBLEM_BY_SLUG.get('contains-duplicate'),
    })
  })
})

describe('durable checkpoint and realm progression', () => {
  it('advances the trail only after every mission in the active track', () => {
    let state = emptyAcademyProgressState()
    expect(canEnterAcademyCheckpoint(state, 0, 0)).toBe(true)
    expect(canEnterAcademyCheckpoint(state, 0, 1)).toBe(false)
    expect(academyTourPosition(state)).toEqual({ world: 0, stage: 0 })

    state = practiceTrack(state, 'arrays-hashing')
    expect(canEnterAcademyCheckpoint(state, 0, 1)).toBe(true)
    expect(academyTourPosition(state)).toEqual({ world: 0, stage: 1 })

    state = practiceTrack(state, 'two-pointers')
    state = practiceTrack(state, 'sliding-window')
    expect(academyTourPosition(state)).toEqual({ world: 0, stage: 3 })
  })

  it('opens the boss lair on practiced tracks — retention never blocks the fight', () => {
    let state = emptyAcademyProgressState()
    expect(canEnterAcademyBoss(state, 'realm1')).toBe(false)
    const realm = NEETCODE_150_MANIFEST.realms.find(
      ({ id }) => id === 'realm1',
    )!
    // Practice-only (24h delayed retrieval still pending on every mission).
    state = realm.trackIds.reduce(practiceTrack, state)
    expect(canEnterAcademyBoss(state, 'realm1')).toBe(true)
    expect(canEnterAcademyBoss(state, 'realm2')).toBe(false)
  })

  it('advances the RUN on the boss defeat; the mastery claim stays pending', () => {
    let state = completeRealmTracks(emptyAcademyProgressState(), 'realm1')
    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: '00000000-0000-4000-8000-000000000079',
      attemptedAt: NOW,
      score: 79,
      openEndedTransferPassed: true,
      learningEventIds: ['quiz:79:event'],
    })
    // Low quiz alone never advances anything.
    expect(academyTourPosition(state)).toEqual({ world: 0, stage: 3 })
    expect(isAcademyRealmUnlocked(state, 'realm2')).toBe(false)

    state = recordRealmBossDefeat(state, {
      realmId: 'realm1',
      defeatId: '00000000-0000-4000-8000-000000000001',
      defeatedAt: NOW,
      learningEventIds: ['boss:event'],
    })
    // The defeat moves the run to the next realm even though the quiz gate
    // is still open — mastery ("cleared") remains a pending side objective.
    expect(selectRealmProgress(state, 'realm1').cleared).toBe(false)
    expect(isAcademyRealmUnlocked(state, 'realm2')).toBe(true)
    expect(academyTourPosition(state)).toEqual({ world: 1, stage: 0 })

    state = recordRealmQuizAttempt(state, {
      realmId: 'realm1',
      attemptId: '00000000-0000-4000-8000-000000000080',
      attemptedAt: NOW,
      score: 80,
      openEndedTransferPassed: true,
      learningEventIds: ['quiz:80:event'],
    })
    expect(selectRealmProgress(state, 'realm1').cleared).toBe(true)
    expect(academyTourPosition(state)).toEqual({ world: 1, stage: 0 })
  })
})

describe('realm-boss follow-up (optional mastery claim)', () => {
  const quizAttempt = (score: number) => ({
    realmId: 'realm1' as RealmId,
    attemptId: `00000000-0000-4000-8000-0000000000${score}`,
    attemptedAt: NOW,
    score,
    openEndedTransferPassed: true,
    learningEventIds: [`quiz:${score}:event`],
  })
  const bossDefeat = {
    realmId: 'realm1' as RealmId,
    defeatId: '00000000-0000-4000-8000-0000000000bb',
    defeatedAt: NOW,
    learningEventIds: ['boss:event'],
  }

  it('asks for the fight while no durable defeat exists', () => {
    const state = completeRealmTracks(emptyAcademyProgressState(), 'realm1')
    expect(
      realmBossFollowUp(selectRealmProgress(state, 'realm1')),
    ).toEqual({ kind: 'fight' })
  })

  it('offers the assessment retake as the claim after a defeat with the quiz gate open', () => {
    let state = completeRealmTracks(emptyAcademyProgressState(), 'realm1')
    state = recordRealmQuizAttempt(state, quizAttempt(79))
    state = recordRealmBossDefeat(state, bossDefeat)
    expect(selectRealmProgress(state, 'realm1').cleared).toBe(false)
    expect(
      realmBossFollowUp(selectRealmProgress(state, 'realm1')),
    ).toEqual({ kind: 'retakeQuiz' })
    // The claim is optional: the run has already moved on.
    expect(academyTourPosition(state)).toEqual({ world: 1, stage: 0 })
  })

  it('offers the memory-crystal missions as the claim while retention is pending', () => {
    const realm = NEETCODE_150_MANIFEST.realms.find(
      ({ id }) => id === 'realm1',
    )!
    // Practice-only tracks: acquisition done, 24h delayed retrieval pending.
    let state = realm.trackIds.reduce(
      practiceTrack,
      emptyAcademyProgressState(),
    )
    state = recordRealmQuizAttempt(state, quizAttempt(90))
    state = recordRealmBossDefeat(state, bossDefeat)
    const progress = selectRealmProgress(state, 'realm1')
    expect(progress.cleared).toBe(false)
    expect(realmBossFollowUp(progress)).toEqual({
      kind: 'retention',
      missionsRemaining: progress.totalProblems,
    })
    // The claim is optional: the run has already moved on.
    expect(academyTourPosition(state)).toEqual({ world: 1, stage: 0 })
  })

  it('reports cleared once both gates are durably passed', () => {
    let state = completeRealmTracks(emptyAcademyProgressState(), 'realm1')
    state = recordRealmQuizAttempt(state, quizAttempt(80))
    state = recordRealmBossDefeat(state, bossDefeat)
    expect(
      realmBossFollowUp(selectRealmProgress(state, 'realm1')),
    ).toEqual({ kind: 'cleared' })
    expect(academyTourPosition(state)).toEqual({ world: 1, stage: 0 })
  })
})

describe('all-academy final gate', () => {
  it('requires all 150 missions, six knowledge passes, six bosses, and the inter-zone', () => {
    let state = NEETCODE_150_MANIFEST.tracks.reduce(
      (current, track) => completeTrack(current, track.id),
      emptyAcademyProgressState(),
    )
    for (const realm of NEETCODE_150_MANIFEST.realms) {
      state = recordRealmQuizAttempt(state, {
        realmId: realm.id,
        attemptId: `quiz-${realm.id}`,
        attemptedAt: NOW,
        score: 80,
        openEndedTransferPassed: true,
        learningEventIds: [`quiz:${realm.id}:event`],
      })
      state = recordRealmBossDefeat(state, {
        realmId: realm.id,
        defeatId: `boss-${realm.id}`,
        defeatedAt: NOW,
        learningEventIds: [`boss:${realm.id}:event`],
      })
    }

    expect(isAcademyFinalGauntletReady(state, false)).toBe(false)
    expect(isAcademyFinalGauntletReady(state, true)).toBe(true)
  })
})
