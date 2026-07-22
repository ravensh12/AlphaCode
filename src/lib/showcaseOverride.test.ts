import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import type { RealmId, TrackId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  recordMissionPractice,
  recordRealmQuizAttempt,
  selectRealmProgress,
  selectTrackProgress,
} from './academyProgress'
import type { GameAccessStorage } from './gameAccess'
import {
  academyCampaignCompleteWithShowcase,
  academyWorldStateWithShowcase,
  bossKnowledgeGateOpenWithShowcase,
  bypassesOverworldSiege,
  canAccessAcademyBossEntryWithShowcase,
  canAccessAcademyMissionEntryWithShowcase,
  canEnterAcademyBossWithShowcase,
  canEnterAcademyCheckpointWithShowcase,
  finalBossSealOpenWithShowcase,
  hasAcademyTrackEntryWithShowcase,
  lessonUnlockedWithShowcase,
  readyForFinalGauntletWithShowcase,
  resolveFinalGauntletAccessWithShowcase,
  resolveThresholdAccessWithShowcase,
} from './showcaseOverride'

function emptySessionStorage(): GameAccessStorage {
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
}

const empty = emptyAcademyProgressState()

describe('showcase override — showcase unlocks every gate with empty progress', () => {
  it('opens every academy checkpoint across all realms', () => {
    NEETCODE_150_MANIFEST.realms.forEach((realm, worldIndex) => {
      realm.trackIds.forEach((_, checkpointIndex) => {
        expect(
          canEnterAcademyCheckpointWithShowcase(
            true,
            empty,
            worldIndex,
            checkpointIndex,
          ),
        ).toBe(true)
      })
    })
  })

  it('still rejects checkpoints that do not exist', () => {
    expect(canEnterAcademyCheckpointWithShowcase(true, empty, -1, 0)).toBe(
      false,
    )
    expect(canEnterAcademyCheckpointWithShowcase(true, empty, 99, 0)).toBe(
      false,
    )
    expect(canEnterAcademyCheckpointWithShowcase(true, empty, 0, 3)).toBe(
      false,
    )
    expect(canEnterAcademyCheckpointWithShowcase(true, empty, 0, -1)).toBe(
      false,
    )
  })

  it('opens every realm boss but rejects unknown realms', () => {
    for (const realm of NEETCODE_150_MANIFEST.realms) {
      expect(canEnterAcademyBossWithShowcase(true, empty, realm.id)).toBe(true)
    }
    expect(
      canEnterAcademyBossWithShowcase(true, empty, 'realm99' as RealmId),
    ).toBe(false)
  })

  it('renders every world unlocked with real (empty) progress facts', () => {
    NEETCODE_150_MANIFEST.realms.forEach((_, worldIndex) => {
      const state = academyWorldStateWithShowcase(true, empty, worldIndex)
      expect(state.unlocked).toBe(true)
      expect(state.status).not.toBe('locked')
      // No fabricated mastery: everything reads as truly untouched.
      expect(state.mastered).toBe(false)
      expect(state.learnDone).toBe(false)
      expect(state.quizStarted).toBe(false)
      expect(state.mastery).toBe(0)
      expect(state.status).toBe('new')
    })
  })

  it('grants physical entry tokens without any Code City walk-in', () => {
    const storage = emptySessionStorage()
    expect(
      hasAcademyTrackEntryWithShowcase(
        true,
        'realm6',
        'bit-manipulation',
        storage,
      ),
    ).toBe(true)
    expect(
      canAccessAcademyMissionEntryWithShowcase(
        true,
        'realm6',
        'bit-manipulation',
        { completed: false, guestPreview: false },
        storage,
      ),
    ).toBe(true)
    expect(
      canAccessAcademyBossEntryWithShowcase(true, 'realm2', false, storage),
    ).toBe(true)
  })

  it('passes the Threshold and Final Gauntlet route gates pre-completion', () => {
    expect(resolveThresholdAccessWithShowcase(true, true, false)).toEqual({
      status: 'allowed',
    })
    expect(
      resolveFinalGauntletAccessWithShowcase(true, true, false, false),
    ).toEqual({ status: 'allowed' })
    // Hydration still wins: never route before durable progress is known.
    expect(resolveThresholdAccessWithShowcase(true, false, false)).toEqual({
      status: 'loading',
    })
    expect(
      resolveFinalGauntletAccessWithShowcase(true, false, false, false),
    ).toEqual({ status: 'loading' })
  })

  it('treats showcase as ready in banner/seal/skip gates', () => {
    expect(readyForFinalGauntletWithShowcase(true, false)).toBe(true)
    expect(academyCampaignCompleteWithShowcase(true, false)).toBe(true)
    expect(bossKnowledgeGateOpenWithShowcase(true, false)).toBe(true)
    expect(finalBossSealOpenWithShowcase(true, false)).toBe(true)
    expect(bypassesOverworldSiege(true)).toBe(true)
    expect(lessonUnlockedWithShowcase(true, false)).toBe(true)
  })
})

describe('showcase override — normal accounts with empty progress stay locked', () => {
  it('keeps sequential academy checkpoints locked', () => {
    // Only the very first checkpoint of realm 1 is open on a fresh account.
    expect(canEnterAcademyCheckpointWithShowcase(false, empty, 0, 0)).toBe(
      true,
    )
    expect(canEnterAcademyCheckpointWithShowcase(false, empty, 0, 1)).toBe(
      false,
    )
    expect(canEnterAcademyCheckpointWithShowcase(false, empty, 1, 0)).toBe(
      false,
    )
    expect(canEnterAcademyCheckpointWithShowcase(false, empty, 5, 2)).toBe(
      false,
    )
  })

  it('keeps every realm boss locked', () => {
    for (const realm of NEETCODE_150_MANIFEST.realms) {
      expect(canEnterAcademyBossWithShowcase(false, empty, realm.id)).toBe(
        false,
      )
    }
  })

  it('keeps later worlds locked on the map', () => {
    expect(academyWorldStateWithShowcase(false, empty, 0).unlocked).toBe(true)
    for (let worldIndex = 1; worldIndex < 6; worldIndex++) {
      const state = academyWorldStateWithShowcase(false, empty, worldIndex)
      expect(state.unlocked).toBe(false)
      expect(state.status).toBe('locked')
    }
  })

  it('still requires physical entry tokens', () => {
    const storage = emptySessionStorage()
    expect(
      hasAcademyTrackEntryWithShowcase(
        false,
        'realm1',
        'arrays-hashing',
        storage,
      ),
    ).toBe(false)
    expect(
      canAccessAcademyMissionEntryWithShowcase(
        false,
        'realm1',
        'arrays-hashing',
        { completed: false, guestPreview: false },
        storage,
      ),
    ).toBe(false)
    expect(
      canAccessAcademyBossEntryWithShowcase(false, 'realm1', false, storage),
    ).toBe(false)
  })

  it('keeps the final flow sealed', () => {
    expect(resolveThresholdAccessWithShowcase(false, true, false)).toEqual({
      status: 'redirect',
      to: '/quest',
    })
    expect(
      resolveFinalGauntletAccessWithShowcase(false, true, false, false),
    ).toEqual({ status: 'redirect', to: '/quest' })
    expect(
      resolveFinalGauntletAccessWithShowcase(false, true, true, false),
    ).toEqual({ status: 'redirect', to: '/threshold' })
    expect(readyForFinalGauntletWithShowcase(false, false)).toBe(false)
    expect(academyCampaignCompleteWithShowcase(false, false)).toBe(false)
    expect(bossKnowledgeGateOpenWithShowcase(false, false)).toBe(false)
    expect(finalBossSealOpenWithShowcase(false, false)).toBe(false)
    expect(bypassesOverworldSiege(false)).toBe(false)
    expect(lessonUnlockedWithShowcase(false, false)).toBe(false)
  })
})

describe('showcase override — real progress still records and displays', () => {
  it('never mutates the academy progress state it reads', () => {
    const before = structuredClone(empty)
    NEETCODE_150_MANIFEST.realms.forEach((realm, worldIndex) => {
      canEnterAcademyCheckpointWithShowcase(true, empty, worldIndex, 0)
      canEnterAcademyBossWithShowcase(true, empty, realm.id)
      academyWorldStateWithShowcase(true, empty, worldIndex)
    })
    expect(empty).toEqual(before)
  })

  it('records real mission practice identically for showcase sessions', () => {
    // The override layer has no write path: recording flows through the same
    // evidence-validated reducers regardless of account.
    const problemId = NEETCODE_150_MANIFEST.problems[0].id
    const trackId = NEETCODE_150_MANIFEST.tracks[0].id as TrackId
    const recorded = recordMissionPractice(emptyAcademyProgressState(), {
      problemId,
      acquiredAt: '2026-07-11T10:00:00.000Z',
      practicedAt: '2026-07-11T10:20:00.000Z',
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
      acquisitionEventIds: ['evt-acq-1'],
      transferEventIds: ['evt-py-1'],
      codeTestEventIds: ['evt-py-1'],
    })
    expect(recorded.missionPractices[problemId]).toBeDefined()
    expect(
      selectTrackProgress(recorded, trackId).practicedProblems,
    ).toBe(1)
    // The showcase projection surfaces only the real recorded progress: one
    // practiced mission does not finish a track, master anything, or start a
    // quiz — the world reads as unlocked but honestly untouched otherwise.
    const state = academyWorldStateWithShowcase(true, recorded, 0)
    expect(state.unlocked).toBe(true)
    expect(state.learnDone).toBe(false)
    expect(state.quizStarted).toBe(false)
    expect(state.mastered).toBe(false)
  })

  it('shows a low realm quiz score honestly while entry stays open', () => {
    const recorded = recordRealmQuizAttempt(emptyAcademyProgressState(), {
      realmId: 'realm1',
      attemptId: 'attempt-1',
      attemptedAt: '2026-07-11T11:00:00.000Z',
      score: 40,
      openEndedTransferPassed: false,
      learningEventIds: ['evt-quiz-1'],
    })
    const progress = selectRealmProgress(recorded, 'realm1')
    expect(progress.quizBestScore).toBe(40)
    expect(progress.quizPassed).toBe(false)
    expect(progress.knowledgePassed).toBe(false)
    // The fight is not blocked for showcase, but nothing was marked passed.
    expect(
      bossKnowledgeGateOpenWithShowcase(true, progress.knowledgePassed),
    ).toBe(true)
    expect(
      bossKnowledgeGateOpenWithShowcase(false, progress.knowledgePassed),
    ).toBe(false)
  })
})
