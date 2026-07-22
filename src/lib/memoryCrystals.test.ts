import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  isMissionRetentionDue,
  markMissionRetentionCloudVerified,
  missionRetentionAvailableAt,
  recordMissionPractice,
  recordMissionRetention,
} from './academyProgress'
import {
  crystalRenderProfile,
  crystalRetentionAvailableAt,
  crystalStateForProblem,
  isCrystalInteractable,
  projectMemoryCrystal,
} from './memoryCrystals'

const PROBLEM: ProblemId = NEETCODE_150_MANIFEST.problems[0].id
const ACQUIRED_AT = '2026-07-11T12:00:00.000Z'
const RETENTION_HOURS =
  NEETCODE_150_MANIFEST.masteryPolicy.delayedRetrievalMinimumHours
const RETENTION_MS = RETENTION_HOURS * 60 * 60 * 1000
const DUE_AT = Date.parse(ACQUIRED_AT) + RETENTION_MS

function practiced(
  problemId: ProblemId = PROBLEM,
  acquiredAt = ACQUIRED_AT,
): AcademyProgressState {
  return recordMissionPractice(emptyAcademyProgressState(), {
    problemId,
    acquiredAt,
    practicedAt: acquiredAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:${problemId}:acquisition`],
    transferEventIds: [`event:${problemId}:python`],
    codeTestEventIds: [`event:${problemId}:python`],
  })
}

function completed(problemId: ProblemId = PROBLEM): AcademyProgressState {
  return recordMissionRetention(practiced(problemId), {
    problemId,
    retainedAt: new Date(DUE_AT).toISOString(),
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: [`event:${problemId}:retention`],
  })
}

describe('crystalStateForProblem', () => {
  it('has no crystal for a never-practiced problem', () => {
    const clock = { now: DUE_AT, cloudEnabled: false }
    expect(
      crystalStateForProblem(emptyAcademyProgressState(), PROBLEM, clock),
    ).toBeNull()
    expect(
      projectMemoryCrystal(emptyAcademyProgressState(), PROBLEM, clock),
    ).toBeNull()
  })

  it('grows until the exact retention-due moment, then ripens', () => {
    const state = practiced()
    expect(
      crystalStateForProblem(state, PROBLEM, {
        now: DUE_AT - 1,
        cloudEnabled: false,
      }),
    ).toBe('growing')
    expect(
      crystalStateForProblem(state, PROBLEM, {
        now: DUE_AT,
        cloudEnabled: false,
      }),
    ).toBe('ripe')
  })

  it('is NEVER interactable before isMissionRetentionDue says so', () => {
    const state = practiced()
    // Sweep the whole pre-due window (start, mid, last ms): projection stays
    // non-interactable exactly while the academy selector says "not due".
    for (const now of [
      Date.parse(ACQUIRED_AT),
      Date.parse(ACQUIRED_AT) + RETENTION_MS / 2,
      DUE_AT - 1,
    ]) {
      expect(isMissionRetentionDue(state, PROBLEM, now)).toBe(false)
      const projection = projectMemoryCrystal(state, PROBLEM, {
        now,
        cloudEnabled: true,
      })
      expect(projection?.state).toBe('growing')
      expect(projection?.interactable).toBe(false)
    }
    // The moment the selector flips, the crystal becomes harvestable.
    expect(isMissionRetentionDue(state, PROBLEM, DUE_AT)).toBe(true)
    expect(
      projectMemoryCrystal(state, PROBLEM, { now: DUE_AT, cloudEnabled: true })
        ?.interactable,
    ).toBe(true)
  })

  it('completed + cloud on + no receipt → pendingCloud (still harvestable)', () => {
    const state = completed()
    expect(
      crystalStateForProblem(state, PROBLEM, {
        now: DUE_AT + 1,
        cloudEnabled: true,
      }),
    ).toBe('pendingCloud')
    expect(isCrystalInteractable('pendingCloud')).toBe(true)
  })

  it('completed clears once cloud-verified, or when cloud is off entirely', () => {
    const verified = markMissionRetentionCloudVerified(
      completed(),
      PROBLEM,
      new Date(DUE_AT + 60_000).toISOString(),
    )
    expect(
      crystalStateForProblem(verified, PROBLEM, {
        now: DUE_AT + 120_000,
        cloudEnabled: true,
      }),
    ).toBe('cleared')
    expect(
      crystalStateForProblem(completed(), PROBLEM, {
        now: DUE_AT + 1,
        cloudEnabled: false,
      }),
    ).toBe('cleared')
    expect(isCrystalInteractable('cleared')).toBe(false)
    expect(isCrystalInteractable('growing')).toBe(false)
  })
})

describe('crystalRenderProfile', () => {
  it('renders pendingCloud as a ripe body with the cloud glyph', () => {
    expect(crystalRenderProfile('pendingCloud')).toEqual({
      body: 'ripe',
      cloudGlyph: true,
    })
  })

  it('renders the plain states without a glyph', () => {
    expect(crystalRenderProfile('growing')).toEqual({
      body: 'growing',
      cloudGlyph: false,
    })
    expect(crystalRenderProfile('ripe')).toEqual({
      body: 'ripe',
      cloudGlyph: false,
    })
    expect(crystalRenderProfile('cleared')).toEqual({
      body: 'cleared',
      cloudGlyph: false,
    })
  })
})

describe('crystalRetentionAvailableAt', () => {
  it('mirrors the mission retention availability while growing', () => {
    const state = practiced()
    const evidence = state.missionPractices[PROBLEM]!
    expect(crystalRetentionAvailableAt(state, PROBLEM)).toBe(
      missionRetentionAvailableAt(evidence),
    )
  })

  it('is null once completed and for never-practiced problems', () => {
    expect(crystalRetentionAvailableAt(completed(), PROBLEM)).toBeNull()
    expect(
      crystalRetentionAvailableAt(emptyAcademyProgressState(), PROBLEM),
    ).toBeNull()
  })

  it('is surfaced on the projection for world-side countdowns', () => {
    const state = practiced()
    const projection = projectMemoryCrystal(state, PROBLEM, {
      now: Date.parse(ACQUIRED_AT),
      cloudEnabled: false,
    })
    expect(projection?.retentionAvailableAt).toBe(
      new Date(DUE_AT).toISOString(),
    )
  })
})
