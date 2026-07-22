import { describe, expect, it } from 'vitest'
import {
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  EXPECTED_PRACTICE_INPUT,
  EXPECTED_RETENTION_INPUT,
} from '../hooks/useAcademyMissionFlow.fixtures'
import type { AcademyProgressState } from '../types/academy'
import {
  academyMissionStatus,
  type AcademyMissionStatusInput,
} from './academyMissionStatus'
import {
  emptyAcademyProgressState,
  missionRetentionAvailableAt,
  recordMissionPractice,
  recordMissionRetention,
} from './academyProgress'
import { academyMissionPath } from './academyQuest'

/* ============================================================================
   Status-ladder pin: AcademyTrackPage's mission list consumes
   academyMissionStatus; this suite locks the ladder's exact outputs across
   the five mission states plus the guest and Code City locks. (It formerly
   also cross-checked the Data Dojo's plinth surface — retired with the dojo.)
   ========================================================================== */

const REALM_ID = 'realm1' as const
const TRACK_ID = 'arrays-hashing' as const
const track = NEETCODE_150_TRACK_BY_ID.get(TRACK_ID)!
const problems = track.problemIds.map(
  (id) => NEETCODE_150_PROBLEM_BY_ID.get(id)!,
)
const missionOne = problems[0]

function practicedState(): AcademyProgressState {
  return recordMissionPractice(
    emptyAcademyProgressState(),
    EXPECTED_PRACTICE_INPUT,
  )
}

function retainedState(): AcademyProgressState {
  return recordMissionRetention(practicedState(), EXPECTED_RETENTION_INPUT)
}

interface Scenario {
  name: string
  academyProgress: AcademyProgressState
  cloudEnabled: boolean
  retentionNow: number
  isGuest: boolean
  physicalEntry: boolean
  /** Which mission to inspect (index into trackOrder order). */
  index: number
  expected: {
    label: string
    tone: string
    locked: boolean
    replace: boolean
    /** Destination with a `{path}` placeholder for the surface's route. */
    destination: string
  }
}

const NOW = Date.parse('2026-07-11T18:10:00.000Z')

function scenarios(): Scenario[] {
  const practiced = practicedState()
  const availableAt = Date.parse(
    missionRetentionAvailableAt(practiced.missionPractices[missionOne.id]!),
  )
  return [
    {
      name: 'open (untouched, physical entry held)',
      academyProgress: emptyAcademyProgressState(),
      cloudEnabled: false,
      retentionNow: NOW,
      isGuest: false,
      physicalEntry: true,
      index: 0,
      expected: {
        label: 'Start mission',
        tone: 'is-open',
        locked: false,
        replace: false,
        destination: '{path}',
      },
    },
    {
      name: 'practiced (retention not yet due)',
      academyProgress: practiced,
      cloudEnabled: false,
      retentionNow: availableAt - 1_000,
      isGuest: false,
      physicalEntry: true,
      index: 0,
      expected: {
        label: 'Practice complete',
        tone: 'is-practiced',
        locked: false,
        replace: false,
        destination: '{path}',
      },
    },
    {
      name: 'retention due',
      academyProgress: practiced,
      cloudEnabled: false,
      retentionNow: availableAt + 1_000,
      isGuest: false,
      physicalEntry: true,
      index: 0,
      expected: {
        label: 'Retention check ready',
        tone: 'is-due',
        locked: false,
        replace: true,
        destination: '{path}?mode=retention',
      },
    },
    {
      name: 'retained (local, cloud off)',
      academyProgress: retainedState(),
      cloudEnabled: false,
      retentionNow: NOW,
      isGuest: false,
      physicalEntry: true,
      index: 0,
      expected: {
        label: 'Retained',
        tone: 'is-retained',
        locked: false,
        replace: false,
        destination: '{path}',
      },
    },
    {
      name: 'retained locally, cloud check pending',
      academyProgress: retainedState(),
      cloudEnabled: true,
      retentionNow: NOW,
      isGuest: false,
      physicalEntry: true,
      index: 0,
      expected: {
        label: 'Retained locally · cloud check needed',
        tone: 'is-pending',
        locked: false,
        replace: true,
        destination: '{path}?mode=retention',
      },
    },
    {
      name: 'guest lock (mission 2 as a guest)',
      academyProgress: emptyAcademyProgressState(),
      cloudEnabled: false,
      retentionNow: NOW,
      isGuest: true,
      physicalEntry: false,
      index: 1,
      expected: {
        label: 'Sign in to unlock',
        tone: 'is-guest',
        locked: true,
        replace: false,
        destination: '/auth',
      },
    },
    {
      name: 'Code City lock (no physical entry)',
      academyProgress: emptyAcademyProgressState(),
      cloudEnabled: false,
      retentionNow: NOW,
      isGuest: false,
      physicalEntry: false,
      index: 0,
      expected: {
        label: 'Enter Code City',
        tone: 'is-city',
        locked: true,
        replace: false,
        destination: '/quest',
      },
    },
  ]
}

function academyStatusFor(scenario: Scenario) {
  const problem = problems[scenario.index]
  const input: AcademyMissionStatusInput = {
    problemId: problem.id,
    globalOrder: problem.globalOrder,
    academyProgress: scenario.academyProgress,
    cloudEnabled: scenario.cloudEnabled,
    retentionNow: scenario.retentionNow,
    isGuest: scenario.isGuest,
    physicalEntry: scenario.physicalEntry,
    missionPath: academyMissionPath(REALM_ID, TRACK_ID, problem.leetcodeSlug),
  }
  return academyMissionStatus(input)
}

describe('academy mission status ladder', () => {
  for (const scenario of scenarios()) {
    it(`pins the exact output: ${scenario.name}`, () => {
      const problem = problems[scenario.index]
      const academy = academyStatusFor(scenario)

      // Exact pinned outputs (any ladder change fails here).
      expect(academy.status).toEqual({
        label: scenario.expected.label,
        tone: scenario.expected.tone,
      })
      expect(academy.locked).toBe(scenario.expected.locked)
      expect(academy.replace).toBe(scenario.expected.replace)
      expect(academy.destination).toBe(
        scenario.expected.destination.replace(
          '{path}',
          academyMissionPath(REALM_ID, TRACK_ID, problem.leetcodeSlug),
        ),
      )
    })
  }

  it('exposes the retention unlock moment only while practiced and incomplete', () => {
    const practiced = practicedState()
    const availableAt = missionRetentionAvailableAt(
      practiced.missionPractices[missionOne.id]!,
    )
    const beforeDue = academyStatusFor({
      ...scenarios()[1],
      academyProgress: practiced,
    })
    expect(beforeDue.retentionAvailableAt).toBe(availableAt)

    const retained = academyStatusFor({
      ...scenarios()[3],
      academyProgress: retainedState(),
    })
    expect(retained.retentionAvailableAt).toBeNull()
  })
})
