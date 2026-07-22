import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import {
  buildCertificationAssessment,
  evaluateCertificationGate,
} from '../content/curricula/neetcode150/certificationAssessment'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId, RealmId } from '../types/curriculum'
import type {
  AttemptEvent,
  FsrsRating,
  LearningSkillId,
} from '../types/learning'
import type {
  DemoGuaranteeEvaluationInput,
  DemoGuaranteeScenario,
  DemoGuaranteeSimulation,
} from '../types/demoGuarantee'
import {
  emptyAcademyProgressState,
  mergeAcademyProgressStates,
  recordMissionCompletion,
  recordMissionRetention,
  recordRealmBossDefeat,
  recordRealmQuizAttempt,
  selectAcademyProgressCounts,
} from './academyProgress'
import {
  containsForbiddenDemoGuaranteeKey,
  createDemoGuaranteeSimulation,
  decideDemoGuaranteeSimulation,
  isDemoGuaranteeSimulation,
  mergeDemoGuaranteeSimulations,
} from './demoGuarantee'
import {
  createFsrsState,
  retrievability,
  scheduleReview,
} from './fsrsScheduler'
import {
  applyAttemptEvent,
  emptyMasteryProjection,
  rebuildMastery,
} from './masteryProjection'

const BASE_MS = Date.parse('2026-01-01T00:00:00.000Z')
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
const asIso = (offsetMinutes: number): string =>
  new Date(BASE_MS + offsetMinutes * MINUTE_MS).toISOString()

const problemIds = NEETCODE_150_MANIFEST.problems.map(({ id }) => id)
const realmIds = NEETCODE_150_MANIFEST.realms.map(({ id }) => id)
const skillIds = NEETCODE_150_MANIFEST.skills.map(({ id }) => id)

const problemIdArbitrary = fc.constantFrom(...problemIds)
const realmIdArbitrary = fc.constantFrom(...realmIds)
const skillIdArbitrary = fc.constantFrom(...skillIds)

const attemptEventArbitrary: fc.Arbitrary<AttemptEvent> = fc
  .record({
    idNumber: fc.integer({ min: 0, max: 1_000_000 }),
    interactionNumber: fc.integer({ min: 0, max: 10_000 }),
    deviceNumber: fc.integer({ min: 0, max: 20 }),
    deviceSeq: fc.integer({ min: 0, max: 10_000 }),
    occurredMinute: fc.integer({ min: 0, max: 1_000_000 }),
    problemId: problemIdArbitrary,
    skillIds: fc.uniqueArray(skillIdArbitrary, {
      minLength: 1,
      maxLength: 4,
    }),
    attemptNumber: fc.integer({ min: 1, max: 10 }),
    isCorrect: fc.boolean(),
    resolved: fc.boolean(),
    usedHint: fc.boolean(),
    revealed: fc.boolean(),
    responseMs: fc.integer({ min: 0, max: 120_000 }),
  })
  .map(
    ({
      idNumber,
      interactionNumber,
      deviceNumber,
      deviceSeq,
      occurredMinute,
      problemId,
      skillIds: eventSkillIds,
      attemptNumber,
      isCorrect,
      resolved,
      usedHint,
      revealed,
      responseMs,
    }): AttemptEvent => ({
      schemaVersion: 1,
      id: `event:${idNumber}`,
      interactionId: `interaction:${interactionNumber}`,
      sessionId: 'property-session',
      deviceId: `device:${deviceNumber}`,
      deviceSeq,
      source: 'lesson-quiz',
      problemId,
      skillIds: eventSkillIds,
      attemptNumber,
      isCorrect,
      resolved,
      firstTryCorrect: isCorrect && attemptNumber === 1 && !revealed,
      usedHint,
      revealed,
      responseMs,
      occurredAt: asIso(occurredMinute),
    }),
  )

type AcademyOperation =
  | {
      readonly kind: 'mission'
      readonly problemId: ProblemId
      readonly minute: number
      readonly eventNumber: number
    }
  | {
      readonly kind: 'quiz'
      readonly realmId: RealmId
      readonly minute: number
      readonly eventNumber: number
      readonly score: number
      readonly transfer: boolean
    }
  | {
      readonly kind: 'boss'
      readonly realmId: RealmId
      readonly minute: number
      readonly eventNumber: number
    }

const academyOperationArbitrary: fc.Arbitrary<AcademyOperation> = fc.oneof(
  fc
    .record({
      problemId: problemIdArbitrary,
      minute: fc.integer({ min: 0, max: 1_000_000 }),
      eventNumber: fc.integer({ min: 0, max: 50_000 }),
    })
    .map((value): AcademyOperation => ({ kind: 'mission', ...value })),
  fc
    .record({
      realmId: realmIdArbitrary,
      minute: fc.integer({ min: 0, max: 1_000_000 }),
      eventNumber: fc.integer({ min: 0, max: 50_000 }),
      score: fc.integer({ min: 0, max: 100 }),
      transfer: fc.boolean(),
    })
    .map((value): AcademyOperation => ({ kind: 'quiz', ...value })),
  fc
    .record({
      realmId: realmIdArbitrary,
      minute: fc.integer({ min: 0, max: 1_000_000 }),
      eventNumber: fc.integer({ min: 0, max: 50_000 }),
    })
    .map((value): AcademyOperation => ({ kind: 'boss', ...value })),
)

function academyStateFrom(
  operations: readonly AcademyOperation[],
): AcademyProgressState {
  return operations.reduce((state, operation) => {
    switch (operation.kind) {
      case 'mission':
        return recordMissionRetention(recordMissionCompletion(state, {
          problemId: operation.problemId,
          completedAt: asIso(operation.minute),
          acquisitionPassed: true,
          transferPassed: true,
          codeTestsPassed: true,
          acquisitionEventIds: [`event:a:${operation.eventNumber}`],
          transferEventIds: [`event:python:${operation.eventNumber}`],
          codeTestEventIds: [`event:python:${operation.eventNumber}`],
        }), {
          problemId: operation.problemId,
          retainedAt: asIso(operation.minute + 24 * 60),
          delayedRetrievalPassed: true,
          delayedRetrievalEventIds: [`event:r:${operation.eventNumber}`],
        })
      case 'quiz':
        return recordRealmQuizAttempt(state, {
          realmId: operation.realmId,
          attemptId: `quiz:${operation.eventNumber}`,
          attemptedAt: asIso(operation.minute),
          score: operation.score,
          openEndedTransferPassed: operation.transfer,
          learningEventIds: [`event:q:${operation.eventNumber}`],
        })
      case 'boss':
        return recordRealmBossDefeat(state, {
          realmId: operation.realmId,
          defeatId: `boss:${operation.eventNumber}`,
          defeatedAt: asIso(operation.minute),
          learningEventIds: [`event:b:${operation.eventNumber}`],
        })
    }
  }, emptyAcademyProgressState())
}

const academyStateArbitrary: fc.Arbitrary<AcademyProgressState> = fc
  .array(academyOperationArbitrary, { maxLength: 30 })
  .map(academyStateFrom)

function expectSortedUnique(values: readonly string[]): void {
  expect(values).toEqual([...new Set(values)].sort())
}

function expectAcademyInvariants(state: AcademyProgressState): void {
  expect(state).toMatchObject({
    schemaVersion: 1,
    curriculumId: NEETCODE_150_MANIFEST.id,
    curriculumVersion: NEETCODE_150_MANIFEST.version.schema,
    contentVersion: NEETCODE_150_MANIFEST.version.content,
  })
  const counts = selectAcademyProgressCounts(state)
  expect(counts.completedProblems).toBeGreaterThanOrEqual(0)
  expect(counts.completedProblems).toBeLessThanOrEqual(150)
  expect(counts.totalProblems).toBe(150)
  expect(counts.totalTracks).toBe(18)
  expect(counts.totalRealms).toBe(6)
  for (const [problemId, evidence] of Object.entries(
    state.missionCompletions,
  )) {
    expect(problemIds).toContain(problemId)
    expect(evidence?.problemId).toBe(problemId)
    expect(evidence).toMatchObject({
      acquisitionPassed: true,
      transferPassed: true,
      codeTestsPassed: true,
    })
    expectSortedUnique(evidence?.acquisitionEventIds ?? [])
    expectSortedUnique(evidence?.transferEventIds ?? [])
    expectSortedUnique(evidence?.codeTestEventIds ?? [])
  }
  for (const quiz of Object.values(state.realmQuizzes)) {
    if (!quiz) continue
    expect(quiz.bestScore).toBeGreaterThanOrEqual(0)
    expect(quiz.bestScore).toBeLessThanOrEqual(100)
    expect(quiz.attemptCount).toBeGreaterThanOrEqual(
      Object.keys(quiz.attempts).length,
    )
    for (const attempt of Object.values(quiz.attempts)) {
      expect(attempt.attemptId).toBeTruthy()
      expectSortedUnique(attempt.learningEventIds)
    }
  }
  for (const boss of Object.values(state.bossDefeats)) {
    if (!boss) continue
    expectSortedUnique(boss.defeatIds)
    expectSortedUnique(boss.learningEventIds)
  }
}

const guaranteeScenarioArbitrary = fc.constantFrom<DemoGuaranteeScenario>(
  'eligible-path',
  'delayed-review-not-met',
  'remediation-not-complete',
  'outside-window',
)

const guaranteeSimulationArbitrary: fc.Arbitrary<DemoGuaranteeSimulation> = fc
  .record({
    runNumber: fc.integer({ min: 0, max: 1_000_000 }),
    startDay: fc.integer({ min: 0, max: 365 }),
    evaluatedDay: fc.integer({ min: -5, max: 40 }),
    completedMissions: fc.integer({ min: 0, max: 200 }),
    delayedReviewAdherenceMet: fc.boolean(),
    remediationComplete: fc.boolean(),
    certificationAchieved: fc.boolean(),
    scenario: guaranteeScenarioArbitrary,
    terminal: fc.boolean(),
  })
  .map(
    ({
      runNumber,
      startDay,
      evaluatedDay,
      completedMissions,
      delayedReviewAdherenceMet,
      remediationComplete,
      certificationAchieved,
      scenario,
      terminal,
    }): DemoGuaranteeSimulation => {
      const startsAt = new Date(BASE_MS + startDay * DAY_MS).toISOString()
      const evaluatedAt = new Date(
        BASE_MS + (startDay + evaluatedDay) * DAY_MS,
      ).toISOString()
      const recordedAt = new Date(
        BASE_MS + (startDay + 45) * DAY_MS,
      ).toISOString()
      const input: DemoGuaranteeEvaluationInput = {
        simulationRunId: `run:${runNumber}`,
        scenario,
        completedMissions,
        delayedReviewAdherenceMet,
        remediationComplete,
        certificationAchieved,
        windowStartsAt: startsAt,
        evaluatedAt,
        recordedAt,
      }
      const pending = createDemoGuaranteeSimulation(input)
      return terminal
        ? decideDemoGuaranteeSimulation(
            pending,
            new Date(Date.parse(recordedAt) + MINUTE_MS).toISOString(),
          )
        : pending
    },
  )

function expectGuaranteeInvariants(
  simulation: DemoGuaranteeSimulation,
): void {
  expect(isDemoGuaranteeSimulation(simulation)).toBe(true)
  expect(containsForbiddenDemoGuaranteeKey(simulation)).toBe(false)
  expect(simulation.isSimulation).toBe(true)
  expect(simulation.criteria.missionCompletion.met).toBe(
    simulation.criteria.missionCompletion.completedMissions >= 150,
  )
  expect(simulation.criteria.certificationNotAchieved.met).toBe(
    !simulation.criteria.certificationNotAchieved.certificationAchieved,
  )
  expect(simulation.eligible).toBe(
    Object.values(simulation.criteria).every(({ met }) => met),
  )
  expect(
    isDemoGuaranteeSimulation(
      JSON.parse(JSON.stringify(simulation)) as unknown,
    ),
  ).toBe(true)
  if (simulation.status === 'approved') {
    expect(simulation.eligible).toBe(true)
  }
  if (simulation.status === 'denied') {
    expect(simulation.eligible).toBe(false)
  }
}

describe('scheduler and mastery properties', () => {
  it('applies an event id at most once for every projection', () => {
    fc.assert(
      fc.property(
        fc.array(attemptEventArbitrary, { maxLength: 25 }),
        attemptEventArbitrary,
        (events, nextEvent) => {
          const before = rebuildMastery(events)
          const once = applyAttemptEvent(before, nextEvent)
          const twice = applyAttemptEvent(once, nextEvent)

          expect(twice).toBe(once)
          expect(rebuildMastery([...events, ...events])).toEqual(
            rebuildMastery(events),
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  it('keeps scheduler state bounded for arbitrary rating histories', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<FsrsRating>('again', 'hard', 'good', 'easy'),
          { minLength: 1, maxLength: 80 },
        ),
        (ratings) => {
          let state = createFsrsState(asIso(0))
          ratings.forEach((rating, index) => {
            state = scheduleReview(state, rating, asIso((index + 1) * 1_440))
          })

          expect(state.reps).toBe(ratings.length)
          expect(state.lapses).toBe(
            ratings.filter((rating) => rating === 'again').length,
          )
          expect(state.stabilityDays).toBeGreaterThan(0)
          expect(state.stabilityDays).toBeLessThanOrEqual(3_650)
          expect(state.difficulty).toBeGreaterThanOrEqual(1)
          expect(state.difficulty).toBeLessThanOrEqual(10)
          expect(Number.isFinite(Date.parse(state.dueAt))).toBe(true)
          expect(
            retrievability(state, asIso((ratings.length + 2) * 1_440)),
          ).toBeGreaterThanOrEqual(0)
          expect(
            retrievability(state, asIso((ratings.length + 2) * 1_440)),
          ).toBeLessThanOrEqual(1)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('lets every resolved lapse lower current mastery', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (successCount) => {
        let projection = emptyMasteryProjection()
        for (let index = 0; index < successCount; index += 1) {
          projection = applyAttemptEvent(projection, {
            schemaVersion: 1,
            id: `success:${index}`,
            interactionId: `success:${index}`,
            sessionId: 'lapse-law',
            deviceId: 'device:law',
            deviceSeq: index,
            source: 'lesson-quiz',
            problemId: 'problem:contains-duplicate',
            skillIds: ['skill:hash-membership' as LearningSkillId],
            attemptNumber: 1,
            isCorrect: true,
            resolved: true,
            firstTryCorrect: true,
            usedHint: false,
            revealed: false,
            responseMs: 2_000,
            occurredAt: asIso(index * 1_440),
          })
        }
        const before =
          projection.problemMastery['problem:contains-duplicate']!
        const lapsed = applyAttemptEvent(projection, {
          schemaVersion: 1,
          id: 'lapse',
          interactionId: 'lapse',
          sessionId: 'lapse-law',
          deviceId: 'device:law',
          deviceSeq: successCount,
          source: 'lesson-quiz',
          problemId: 'problem:contains-duplicate',
          skillIds: ['skill:hash-membership' as LearningSkillId],
          attemptNumber: 1,
          isCorrect: false,
          resolved: true,
          firstTryCorrect: false,
          usedHint: false,
          revealed: false,
          occurredAt: asIso((successCount + 1) * 1_440),
        })
        const after =
          lapsed.problemMastery['problem:contains-duplicate']!

        expect(after.ability).toBeLessThan(before.ability)
        expect(after.schedule.stabilityDays).toBeLessThan(
          before.schedule.stabilityDays,
        )
        expect(after.schedule.lapses).toBe(before.schedule.lapses + 1)
      }),
      { numRuns: 100 },
    )
  })
})

describe('academy and certification properties', () => {
  it('merges academy facts commutatively and idempotently', () => {
    fc.assert(
      fc.property(
        academyStateArbitrary,
        academyStateArbitrary,
        (left, right) => {
          const leftRight = mergeAcademyProgressStates(left, right)
          const rightLeft = mergeAcademyProgressStates(right, left)

          expect(leftRight).toEqual(rightLeft)
          expect(mergeAcademyProgressStates(left, left)).toEqual(left)
          expect(mergeAcademyProgressStates(leftRight, leftRight)).toEqual(
            leftRight,
          )
          expectAcademyInvariants(leftRight)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('preserves the exact 79/80 certification boundary', () => {
    const allTracks = buildCertificationAssessment().trackIds
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
        expect(
          evaluateCertificationGate(score, allTracks, true).scorePassed,
        ).toBe(score >= 80)
      }),
      { numRuns: 100 },
    )
    expect(evaluateCertificationGate(79, allTracks, true).passed).toBe(false)
    expect(evaluateCertificationGate(80, allTracks, true).passed).toBe(true)
  })
})

describe('demo guarantee merge properties', () => {
  it('obeys merge laws and preserves the exact simulation-only state', () => {
    fc.assert(
      fc.property(
        guaranteeSimulationArbitrary,
        guaranteeSimulationArbitrary,
        guaranteeSimulationArbitrary,
        (a, b, c) => {
          const ab = mergeDemoGuaranteeSimulations(a, b)
          const ba = mergeDemoGuaranteeSimulations(b, a)
          const leftAssociated = mergeDemoGuaranteeSimulations(ab, c)
          const rightAssociated = mergeDemoGuaranteeSimulations(
            a,
            mergeDemoGuaranteeSimulations(b, c),
          )

          expect(mergeDemoGuaranteeSimulations(a, a)).toEqual(a)
          expect(ab).toEqual(ba)
          expect(leftAssociated).toEqual(rightAssociated)
          expectGuaranteeInvariants(leftAssociated)
        },
      ),
      { numRuns: 100 },
    )
  })
})
