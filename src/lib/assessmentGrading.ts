import {
  ASSESSMENT_SCHEMA_VERSION,
  type AnswerMatcherV1,
  type AssessmentResponseV1,
  type AssessmentResultV1,
  type AssessmentV1,
  type SerializedAssessmentAttemptV1,
  type TraceInnerAssessmentResponseV1,
  type TraceInnerAssessmentV1,
} from '../types/assessment'

export type ResponseCompleteness =
  | { complete: true }
  | { complete: false; reason: string }

export function normalizeCasefoldWhitespace(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\u00df/gu, 'ss')
    .replace(/\u03c2/gu, '\u03c3')
    .trim()
    .replace(/\s+/gu, ' ')
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, '\n')
}

/**
 * Lenient normalization for the 'normalized' text matcher only.
 *
 * On top of case/width/whitespace folding, clause separators (commas,
 * semicolons, and '&&') are treated as whitespace, and one leading
 * "because "/"since " is dropped, so learner phrasings such as
 * "left, node, right" or "because mid might be the minimum" grade the same
 * as their canonical accepted forms. Applied symmetrically to submissions
 * and accepted answers.
 *
 * Digit-grouping commas are safe here: "1,000" folds to "1 000", which never
 * collides with "1000" (numeric answers should use the numericTolerance
 * matcher anyway, whose parsing is deliberately left unchanged).
 */
export function normalizeTypedAnswer(value: string): string {
  const base = normalizeCasefoldWhitespace(value)
  const separatorsFolded = base
    .replace(/&&/gu, ' ')
    .replace(/[,;]/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
  // Fall back when folding would erase the whole answer (e.g. ",," or "&&"),
  // so degenerate submissions can never match a real accepted answer.
  const folded = separatorsFolded || base
  const withoutJustification = folded.replace(/^(?:because|since)\s+/u, '')
  return withoutJustification || folded
}

function numericValue(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

function booleanValue(value: string): boolean | undefined {
  switch (normalizeCasefoldWhitespace(value)) {
    case 'true':
    case 'yes':
    case '1':
      return true
    case 'false':
    case 'no':
    case '0':
      return false
    default:
      return undefined
  }
}

export function answerMatches(
  matcher: AnswerMatcherV1,
  answer: string,
): boolean {
  switch (matcher.mode) {
    case 'normalized': {
      const normalized = normalizeTypedAnswer(answer)
      return matcher.acceptedAnswers.some(
        (accepted) => normalizeTypedAnswer(accepted) === normalized,
      )
    }
    case 'exactLines': {
      const actual = normalizeLineEndings(answer).split('\n')
      return matcher.acceptedAnswers.some(
        (accepted) =>
          accepted.length === actual.length &&
          accepted.every((line, index) => line === actual[index]),
      )
    }
    case 'numericTolerance': {
      const actual = numericValue(answer)
      if (actual == null) return false
      const relative = matcher.relativeTolerance ?? 0
      const tolerance =
        matcher.absoluteTolerance + relative * Math.abs(matcher.expected)
      return Math.abs(actual - matcher.expected) <= tolerance
    }
    case 'boolean':
      return booleanValue(answer) === matcher.expected
  }
}

function completeText(answer: string): ResponseCompleteness {
  return answer.trim()
    ? { complete: true }
    : { complete: false, reason: 'An answer is required.' }
}

function innerCompleteness(
  assessment: TraceInnerAssessmentV1,
  response: TraceInnerAssessmentResponseV1,
): ResponseCompleteness {
  return responseCompleteness(assessment, response)
}

export function responseCompleteness(
  assessment: AssessmentV1,
  response: AssessmentResponseV1,
): ResponseCompleteness {
  if (assessment.kind !== response.kind) {
    return {
      complete: false,
      reason: `Expected a ${assessment.kind} response, received ${response.kind}.`,
    }
  }

  switch (assessment.kind) {
    case 'singleChoice':
      return response.kind === 'singleChoice' && response.optionId
        ? { complete: true }
        : { complete: false, reason: 'Choose an option before submitting.' }
    case 'shortAnswer':
      return response.kind === 'shortAnswer'
        ? completeText(response.answer)
        : { complete: false, reason: 'A short answer is required.' }
    case 'predict':
      return response.kind === 'predict'
        ? completeText(response.answer)
        : { complete: false, reason: 'A prediction is required.' }
    case 'order': {
      if (response.kind !== 'order') {
        return { complete: false, reason: 'An ordered response is required.' }
      }
      const expectedIds = new Set(assessment.items.map(({ id }) => id))
      const submittedIds = new Set(response.itemIds)
      if (
        response.itemIds.length !== assessment.items.length ||
        submittedIds.size !== response.itemIds.length ||
        response.itemIds.some((id) => !expectedIds.has(id))
      ) {
        return {
          complete: false,
          reason: 'Place every item exactly once before submitting.',
        }
      }
      return { complete: true }
    }
    case 'trace': {
      if (response.kind !== 'trace') {
        return { complete: false, reason: 'A trace response is required.' }
      }
      const responseByFrame = new Map(
        response.frames.map((frame) => [frame.frameId, frame.response]),
      )
      if (
        response.frames.length !== assessment.frames.length ||
        responseByFrame.size !== response.frames.length
      ) {
        return {
          complete: false,
          reason: 'Answer every trace frame exactly once.',
        }
      }
      for (const frame of assessment.frames) {
        const frameResponse = responseByFrame.get(frame.id)
        if (!frameResponse) {
          return {
            complete: false,
            reason: `Trace frame ${frame.id} is unanswered.`,
          }
        }
        const completeness = innerCompleteness(frame.assessment, frameResponse)
        if (!completeness.complete) {
          return {
            complete: false,
            reason: `Trace frame ${frame.id}: ${completeness.reason}`,
          }
        }
      }
      return { complete: true }
    }
    case 'pythonCode':
      return response.kind === 'pythonCode'
        ? completeText(response.code)
        : { complete: false, reason: 'Python code is required.' }
  }
}

export function isAssessmentResponseComplete(
  assessment: AssessmentV1,
  response: AssessmentResponseV1,
): boolean {
  return responseCompleteness(assessment, response).complete
}

export function assessmentRevealLabel(assessment: AssessmentV1): string {
  if (assessment.revealLabel?.trim()) return assessment.revealLabel
  switch (assessment.kind) {
    case 'singleChoice':
      return 'Show correct choice'
    case 'shortAnswer':
      return 'Show accepted answer'
    case 'predict':
      return 'Show prediction'
    case 'order':
      return 'Show correct order'
    case 'trace':
      return 'Show trace answers'
    case 'pythonCode':
      return 'Show test expectations'
  }
}

function expectedForMatcher(matcher: AnswerMatcherV1): string | number {
  switch (matcher.mode) {
    case 'normalized':
      return matcher.acceptedAnswers[0]
    case 'exactLines':
      return matcher.acceptedAnswers[0].join('\n')
    case 'numericTolerance':
      return matcher.expected
    case 'boolean':
      return String(matcher.expected)
  }
}

function resultBase(assessment: AssessmentV1) {
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    assessmentId: assessment.id,
    assessmentKind: assessment.kind,
    revealLabel: assessmentRevealLabel(assessment),
  } as const
}

function gradedResult(
  assessment: AssessmentV1,
  isCorrect: boolean,
  expectedResponse?: string | number | readonly string[],
  frameResults?: readonly AssessmentResultV1[],
): AssessmentResultV1 {
  return {
    ...resultBase(assessment),
    status: isCorrect ? 'correct' : 'incorrect',
    complete: true,
    isCorrect,
    expectedResponse,
    frameResults,
  }
}

export function gradeAssessment(
  assessment: AssessmentV1,
  response: AssessmentResponseV1,
): AssessmentResultV1 {
  const completeness = responseCompleteness(assessment, response)
  if (!completeness.complete) {
    return {
      ...resultBase(assessment),
      status: 'incomplete',
      complete: false,
      isCorrect: false,
      reason: completeness.reason,
    }
  }

  switch (assessment.kind) {
    case 'singleChoice': {
      const optionId =
        response.kind === 'singleChoice' ? response.optionId : ''
      return gradedResult(
        assessment,
        optionId === assessment.correctOptionId,
        assessment.correctOptionId,
      )
    }
    case 'shortAnswer': {
      const answer = response.kind === 'shortAnswer' ? response.answer : ''
      return gradedResult(
        assessment,
        answerMatches(assessment.matcher, answer),
        expectedForMatcher(assessment.matcher),
      )
    }
    case 'predict': {
      const answer = response.kind === 'predict' ? response.answer : ''
      return gradedResult(
        assessment,
        answerMatches(assessment.matcher, answer),
        expectedForMatcher(assessment.matcher),
      )
    }
    case 'order': {
      const itemIds = response.kind === 'order' ? response.itemIds : []
      const correct =
        itemIds.length === assessment.correctOrderIds.length &&
        assessment.correctOrderIds.every((id, index) => id === itemIds[index])
      return gradedResult(assessment, correct, assessment.correctOrderIds)
    }
    case 'trace': {
      const submitted =
        response.kind === 'trace'
          ? new Map(
              response.frames.map((frame) => [frame.frameId, frame.response]),
            )
          : new Map()
      const frameResults = assessment.frames.map((frame) =>
        gradeAssessment(frame.assessment, submitted.get(frame.id)!),
      )
      return gradedResult(
        assessment,
        frameResults.every((result) => result.status === 'correct'),
        undefined,
        frameResults,
      )
    }
    case 'pythonCode':
      return {
        ...resultBase(assessment),
        status: 'notLocallyGradable',
        complete: true,
        isCorrect: null,
        reason: 'Python submissions require the isolated grading worker.',
      }
  }
}

export function serializeAssessmentAttempt(
  assessment: AssessmentV1,
  response: AssessmentResponseV1,
  result: AssessmentResultV1,
  options: {
    attemptNumber: number
    revealed?: boolean
    usedHint?: boolean
  },
): SerializedAssessmentAttemptV1 {
  if (!Number.isSafeInteger(options.attemptNumber) || options.attemptNumber < 1) {
    throw new RangeError('attemptNumber must be a positive safe integer')
  }
  if (
    result.assessmentId !== assessment.id ||
    result.assessmentKind !== assessment.kind
  ) {
    throw new Error('result does not belong to the supplied assessment')
  }

  const attempt: SerializedAssessmentAttemptV1 = {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    assessmentId: assessment.id,
    assessmentKind: assessment.kind,
    attemptNumber: options.attemptNumber,
    revealed: options.revealed ?? false,
    usedHint: options.usedHint ?? false,
    response,
    result,
  }

  return JSON.parse(JSON.stringify(attempt)) as SerializedAssessmentAttemptV1
}
