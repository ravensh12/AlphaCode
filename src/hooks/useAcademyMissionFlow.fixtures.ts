import { emptyBadgeCounts } from '../content/badges'
import { NEETCODE_150_MANIFEST } from '../content/curricula/neetcode150'
import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentEvidenceKinds,
  type AssessmentV1,
  type PythonCodeAssessmentV1,
  type ShortAnswerAssessmentV1,
} from '../types/assessment'
import type {
  AcademyMissionPracticeInput,
  AcademyMissionRetentionInput,
} from '../types/academy'
import { PROBLEM_LESSON_SCHEMA_VERSION } from '../types/problemLesson'
import type { Lesson, LessonStep } from '../types/lesson'
import type {
  LessonResult,
  PersistedAssessmentEvidence,
} from './useLessonEngine'

/**
 * Parity fixtures (PR2): the literal AcademyMissionPracticeInput /
 * AcademyMissionRetentionInput values below encode what the pre-refactor
 * AcademyMissionPage produced at its missionPracticeFromResult /
 * missionRetentionFromResult call sites for these LessonResults. The extracted
 * flow must keep producing them byte-for-byte (useAcademyMissionFlow.test.ts),
 * and the academy page, which hosts the flow's LessonRunner bundle, pins its
 * prop-bundle parity against the same fixtures.
 */

export function shortAnswer(
  id: string,
  evidenceKind: ShortAnswerAssessmentV1['evidenceKind'],
): ShortAnswerAssessmentV1 {
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    id: `assessment:${id}`,
    kind: 'shortAnswer',
    evidenceKind,
    prompt: 'Name the structure.',
    matcher: { mode: 'normalized', acceptedAnswers: ['hash set'] },
  }
}

export const pythonAssessment: PythonCodeAssessmentV1 = {
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  id: 'assessment:python-transfer',
  kind: 'pythonCode',
  evidenceKind: 'independent-transfer',
  evidenceKinds: ['independent-transfer', 'code-tests'],
  prompt: 'Implement containsDuplicate.',
  starterCode: 'def contains_duplicate(nums):\n    pass',
  entrypoint: { kind: 'function', name: 'contains_duplicate' },
  codecs: {
    arguments: [{ kind: 'list', item: { kind: 'integer' } }],
    result: { kind: 'boolean' },
  },
  cases: [],
  comparator: { kind: 'deepEqual' },
  limits: {
    timeoutMs: 1_000,
    memoryMb: 64,
    maxOutputBytes: 4_096,
    maxSourceBytes: 20_000,
  },
}

export function assessmentStep(
  id: string,
  assessment: AssessmentV1,
): LessonStep {
  return {
    id,
    type: 'practice',
    section: 'quiz',
    prompt: assessment.prompt,
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer: 'hash set' },
    feedback: { correct: 'Correct.', incorrect: 'Try again.' },
    conceptTags: [],
    assessment,
    masteryId: assessment.id,
  }
}

export const missionLesson: Lesson = {
  id: 'problem:contains-duplicate',
  title: 'Contains Duplicate',
  description: 'Parity fixture mission.',
  pattern: 'hash-set',
  estimatedMinutes: 8,
  conceptTags: [],
  unlockRequirements: {},
  contentRef: {
    schemaVersion: PROBLEM_LESSON_SCHEMA_VERSION,
    curriculumId: NEETCODE_150_MANIFEST.id,
    manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
    problemId: 'problem:contains-duplicate',
    problemContentVersion: 'v1.0.0',
    variantId: 'variant:parity-fixture',
  },
  steps: [
    assessmentStep('step-acquisition-check', shortAnswer('acquisition-check', 'acquisition')),
    assessmentStep('step-warmup-recall', shortAnswer('warmup-recall', 'acquisition')),
    assessmentStep('step-python-transfer', pythonAssessment),
    assessmentStep('step-retention', shortAnswer('retention', 'delayed-retrieval')),
  ],
}

export function evidenceEvent(input: {
  eventId: string
  occurredAt: string
  stepId: string
  assessmentId: AssessmentV1['id']
  assessmentKind: AssessmentV1['kind']
  evidenceKinds: AssessmentEvidenceKinds
  firstTry?: boolean
  usedHint?: boolean
}): PersistedAssessmentEvidence {
  return {
    eventId: input.eventId,
    interactionId: `interaction:${input.eventId}`,
    occurredAt: input.occurredAt,
    assessmentId: input.assessmentId,
    assessmentKind: input.assessmentKind,
    stepId: input.stepId,
    evidenceKinds: input.evidenceKinds,
    isCorrect: true,
    resolved: true,
    firstTry: input.firstTry ?? true,
    usedHint: input.usedHint ?? false,
    revealed: false,
  }
}

export function acquisitionEvents(options: { usedHint?: boolean } = {}) {
  // Deliberately out of chronological order: acquiredAt must come from the
  // earliest timestamp while event IDs keep evidence-array order.
  return [
    evidenceEvent({
      eventId: 'event:acquisition-check',
      occurredAt: '2026-07-11T18:04:00.000Z',
      stepId: 'step-acquisition-check',
      assessmentId: 'assessment:acquisition-check',
      assessmentKind: 'shortAnswer',
      evidenceKinds: ['acquisition'],
      usedHint: options.usedHint,
    }),
    evidenceEvent({
      eventId: 'event:warmup-recall',
      occurredAt: '2026-07-11T18:00:00.000Z',
      stepId: 'step-warmup-recall',
      assessmentId: 'assessment:warmup-recall',
      assessmentKind: 'shortAnswer',
      evidenceKinds: ['acquisition'],
      usedHint: options.usedHint,
    }),
  ]
}

export function pythonEvent(options: { firstTry?: boolean } = {}) {
  return evidenceEvent({
    eventId: 'event:python-transfer',
    occurredAt: '2026-07-11T18:06:00.000Z',
    stepId: 'step-python-transfer',
    assessmentId: 'assessment:python-transfer',
    assessmentKind: 'pythonCode',
    evidenceKinds: ['independent-transfer', 'code-tests'],
    firstTry: options.firstTry,
  })
}

export function retentionEvents() {
  // Latest event supplies retainedAt; IDs keep evidence-array order.
  return [
    evidenceEvent({
      eventId: 'event:retention-final',
      occurredAt: '2026-07-12T18:30:00.000Z',
      stepId: 'step-retention',
      assessmentId: 'assessment:retention',
      assessmentKind: 'shortAnswer',
      evidenceKinds: ['delayed-retrieval'],
    }),
    evidenceEvent({
      eventId: 'event:retention-earlier',
      occurredAt: '2026-07-12T18:20:00.000Z',
      stepId: 'step-retention',
      assessmentId: 'assessment:retention',
      assessmentKind: 'shortAnswer',
      evidenceKinds: ['delayed-retrieval'],
    }),
  ]
}

export function lessonResult(input: {
  evidence: PersistedAssessmentEvidence[]
  missedStepIds?: readonly string[]
}): LessonResult {
  return {
    accuracy: 100,
    masteryScore: 100,
    totalAttempts: 4,
    correctFirstTry: 4,
    unlockNext: true,
    badgeCounts: emptyBadgeCounts(),
    badges: [],
    assessmentEvidence: input.evidence,
    stepReviews: missionLesson.steps.map((step) => ({
      id: step.id,
      prompt: step.prompt,
      code: step.code,
      targetVariables: step.targetVariables,
      expected: step.expectedState,
      assessmentAnswerLabel: step.assessment?.kind,
      missed: (input.missedStepIds ?? []).includes(step.id),
    })),
  }
}

export const cleanPassResult = lessonResult({
  evidence: [
    ...acquisitionEvents(),
    pythonEvent(),
    // A stray same-day delayed-retrieval event must not leak into practice
    // evidence or push practicedAt later — exactly as on the page.
    evidenceEvent({
      eventId: 'event:retention-early',
      occurredAt: '2026-07-11T18:07:00.000Z',
      stepId: 'step-retention',
      assessmentId: 'assessment:retention',
      assessmentKind: 'shortAnswer',
      evidenceKinds: ['delayed-retrieval'],
    }),
  ],
})

/** Hints are allowed: this must produce the same practice input as a clean pass. */
export const hintedResult = lessonResult({
  evidence: [...acquisitionEvents({ usedHint: true }), pythonEvent()],
})

/**
 * The python challenge failed once and passed on a retry (missed flag set,
 * firstTry lost). Retries are authored into the failure policy (10 attempts),
 * so this run still records practice.
 */
export const missedTransferResult = lessonResult({
  evidence: [...acquisitionEvents(), pythonEvent({ firstTry: false })],
  missedStepIds: ['step-python-transfer'],
})

/** A revealed answer resolves the step but proves nothing — never records. */
export const revealedTransferResult: LessonResult = {
  ...lessonResult({
    evidence: [...acquisitionEvents()],
    missedStepIds: ['step-python-transfer'],
  }),
  assessmentEvidence: [
    ...acquisitionEvents(),
    { ...pythonEvent({ firstTry: false }), isCorrect: false, revealed: true },
  ],
}

/**
 * A review-only rerun replays just the previously-missed step, so the other
 * required steps never appear in stepReviews. It must never record practice.
 */
export const reviewOnlyRerunResult: LessonResult = {
  ...lessonResult({ evidence: [pythonEvent()] }),
  stepReviews: lessonResult({ evidence: [] }).stepReviews.filter(
    ({ id }) => id === 'step-python-transfer',
  ),
}

export const retentionPassResult = lessonResult({ evidence: retentionEvents() })

/** Literal pre-refactor expectation from the page's recordMissionPractice call. */
export const EXPECTED_PRACTICE_INPUT: AcademyMissionPracticeInput = {
  problemId: 'problem:contains-duplicate',
  acquiredAt: '2026-07-11T18:00:00.000Z',
  practicedAt: '2026-07-11T18:06:00.000Z',
  acquisitionPassed: true,
  transferPassed: true,
  codeTestsPassed: true,
  acquisitionEventIds: ['event:acquisition-check', 'event:warmup-recall'],
  transferEventIds: ['event:python-transfer'],
  codeTestEventIds: ['event:python-transfer'],
}

/** Literal pre-refactor expectation from the page's recordMissionRetention call. */
export const EXPECTED_RETENTION_INPUT: AcademyMissionRetentionInput = {
  problemId: 'problem:contains-duplicate',
  retainedAt: '2026-07-12T18:30:00.000Z',
  delayedRetrievalPassed: true,
  delayedRetrievalEventIds: ['event:retention-final', 'event:retention-earlier'],
}

export const PRACTICE_GUARD_MESSAGE =
  'This mission still needs clean acquisition plus one Python event that passes transfer and code tests.'
export const RETENTION_GUARD_MESSAGE =
  'Pass the delayed-retrieval check cleanly before this mission can be retained.'
