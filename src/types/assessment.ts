import type { MasteryEvidenceKind, SkillId } from './curriculum'
import type { DiagramSpec } from './diagram'
import type { JsonValue } from './learning'

export const ASSESSMENT_SCHEMA_VERSION = 1 as const

/** Stable content-owned identity; labels and display order may change. */
export type AssessmentId = `assessment:${string}`
export type AssessmentOptionId = `option:${string}`
export type AssessmentOrderItemId = `item:${string}`
export type AssessmentTraceFrameId = `frame:${string}`
export type PythonCaseId = `case:${string}`

export type AssessmentEvidenceKind = MasteryEvidenceKind

export type AssessmentEvidenceKinds = readonly [
  AssessmentEvidenceKind,
  ...AssessmentEvidenceKind[],
]

/**
 * Returns the authoritative evidence supplied by an assessment.
 *
 * `evidenceKind` remains required as the v1 compatibility projection. New
 * consumers, including academy completion gates, must use this helper so one
 * graded event can supply multiple kinds (for example independent transfer and
 * passing code tests).
 */
export function assessmentEvidenceKinds(
  assessment: Pick<AssessmentCommonV1, 'evidenceKind' | 'evidenceKinds'>,
): AssessmentEvidenceKinds {
  return assessment.evidenceKinds ?? [assessment.evidenceKind]
}

export type AssessmentFailurePolicyV1 =
  | {
      kind: 'retry'
      maxAttempts: number
    }
  | {
      kind: 'reveal'
      maxAttempts: number
    }
  | {
      kind: 'continue'
      maxAttempts: number
    }
  | {
      kind: 'rewind'
      maxAttempts: number
      checkpointStepId: string
    }

type AssessmentCommonV1 = {
  schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION
  id: AssessmentId
  prompt: string
  /** @deprecated Compatibility projection; use assessmentEvidenceKinds(). */
  evidenceKind: AssessmentEvidenceKind
  /** Authoritative evidence list when an assessment supplies multiple kinds. */
  evidenceKinds?: AssessmentEvidenceKinds
  skillIds?: readonly SkillId[]
  failurePolicy?: AssessmentFailurePolicyV1
  /** Optional copy override used by a future renderer's reveal action. */
  revealLabel?: string
}

export type NormalizedAnswerMatcherV1 = {
  mode: 'normalized'
  /** Compared after Unicode normalization, case folding, and whitespace collapse. */
  acceptedAnswers: readonly [string, ...string[]]
}

export type ExactLinesAnswerMatcherV1 = {
  mode: 'exactLines'
  /** Each entry is one accepted line-for-line response. */
  acceptedAnswers: readonly [
    readonly [string, ...string[]],
    ...(readonly [string, ...string[]])[],
  ]
}

export type NumericToleranceAnswerMatcherV1 = {
  mode: 'numericTolerance'
  expected: number
  absoluteTolerance: number
  relativeTolerance?: number
}

export type BooleanAnswerMatcherV1 = {
  mode: 'boolean'
  expected: boolean
}

export type AnswerMatcherV1 =
  | NormalizedAnswerMatcherV1
  | ExactLinesAnswerMatcherV1
  | NumericToleranceAnswerMatcherV1
  | BooleanAnswerMatcherV1

export type SingleChoiceAssessmentV1 = AssessmentCommonV1 & {
  kind: 'singleChoice'
  options: readonly {
    id: AssessmentOptionId
    label: string
  }[]
  correctOptionId: AssessmentOptionId
  shuffleOptions?: boolean
}

export type ShortAnswerAssessmentV1 = AssessmentCommonV1 & {
  kind: 'shortAnswer'
  matcher: AnswerMatcherV1
  placeholder?: string
}

export type PredictAssessmentV1 = AssessmentCommonV1 & {
  kind: 'predict'
  language: 'python'
  code: readonly string[]
  currentLineIndex?: number
  matcher: AnswerMatcherV1
}

export type OrderAssessmentV1 = AssessmentCommonV1 & {
  kind: 'order'
  items: readonly {
    id: AssessmentOrderItemId
    label: string
  }[]
  correctOrderIds: readonly AssessmentOrderItemId[]
  shuffleItems?: boolean
}

export type TraceInnerAssessmentV1 =
  | SingleChoiceAssessmentV1
  | ShortAnswerAssessmentV1
  | PredictAssessmentV1
  | OrderAssessmentV1

export type TraceAssessmentV1 = AssessmentCommonV1 & {
  kind: 'trace'
  language: 'python'
  code: readonly string[]
  frames: readonly {
    id: AssessmentTraceFrameId
    currentLineIndex: number
    assessment: TraceInnerAssessmentV1
    diagram?: DiagramSpec
  }[]
}

export type PythonEntrypointV1 =
  | {
      kind: 'function'
      name: string
    }
  | {
      kind: 'classMethod'
      className: string
      methodName: string
      constructorArguments?: readonly JsonValue[]
    }

export type PythonValueCodecV1 =
  | { kind: 'json' }
  | { kind: 'integer' }
  | { kind: 'float' }
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'list'; item: PythonValueCodecV1 }
  | { kind: 'tuple'; items: readonly PythonValueCodecV1[] }
  | { kind: 'linkedList'; item: PythonValueCodecV1 }
  | { kind: 'binaryTree'; item: PythonValueCodecV1 }
  | { kind: 'graph'; directed: boolean; item: PythonValueCodecV1 }

export type PythonCodecPlanV1 = {
  arguments: readonly PythonValueCodecV1[]
  result: PythonValueCodecV1
}

export type PythonCaseV1 = {
  id: PythonCaseId
  arguments: readonly JsonValue[]
  expected: JsonValue
  visibility: 'example' | 'hidden'
}

export type PythonComparatorV1 =
  | { kind: 'deepEqual' }
  | {
      kind: 'unordered'
      /** Recursive by default; false makes only the outer result unordered. */
      recursive?: boolean
    }
  | {
      kind: 'numericTolerance'
      absoluteTolerance: number
      relativeTolerance?: number
    }
  | {
      kind: 'semantic'
      validator:
        | 'courseScheduleOrder'
        | 'alienDictionaryOrder'
        | 'kClosestPoints'
    }

export type PythonObservationPathSegmentV1 = string | number

export type PythonObservationV1 =
  | { kind: 'return' }
  | {
      /** Observe a (possibly nested) argument after solve returns. */
      kind: 'argument'
      argumentIndex: number
      path?: readonly PythonObservationPathSegmentV1[]
      codec: PythonValueCodecV1
    }

export type PythonExecutionLimitsV1 = {
  timeoutMs: number
  memoryMb: number
  maxOutputBytes: number
  maxSourceBytes: number
}

export type PythonCodeAssessmentV1 = AssessmentCommonV1 & {
  kind: 'pythonCode'
  starterCode: string
  entrypoint: PythonEntrypointV1
  codecs: PythonCodecPlanV1
  cases: readonly PythonCaseV1[]
  comparator: PythonComparatorV1
  /** Defaults to observing the return value. */
  observation?: PythonObservationV1
  /** Honest learner/evaluator-facing limits of what this browser check proves. */
  verificationNotes?: readonly string[]
  limits: PythonExecutionLimitsV1
}

export type AssessmentV1 =
  | SingleChoiceAssessmentV1
  | ShortAnswerAssessmentV1
  | PredictAssessmentV1
  | OrderAssessmentV1
  | TraceAssessmentV1
  | PythonCodeAssessmentV1

export type SingleChoiceResponseV1 = {
  kind: 'singleChoice'
  optionId: AssessmentOptionId | ''
}

export type ShortAnswerResponseV1 = {
  kind: 'shortAnswer'
  answer: string
}

export type PredictResponseV1 = {
  kind: 'predict'
  answer: string
}

export type OrderResponseV1 = {
  kind: 'order'
  itemIds: readonly AssessmentOrderItemId[]
}

export type TraceInnerAssessmentResponseV1 =
  | SingleChoiceResponseV1
  | ShortAnswerResponseV1
  | PredictResponseV1
  | OrderResponseV1

export type TraceResponseV1 = {
  kind: 'trace'
  frames: readonly {
    frameId: AssessmentTraceFrameId
    response: TraceInnerAssessmentResponseV1
  }[]
}

export type PythonCodeResponseV1 = {
  kind: 'pythonCode'
  code: string
}

export type AssessmentResponseV1 =
  | SingleChoiceResponseV1
  | ShortAnswerResponseV1
  | PredictResponseV1
  | OrderResponseV1
  | TraceResponseV1
  | PythonCodeResponseV1

type AssessmentResultCommonV1 = {
  schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION
  assessmentId: AssessmentId
  assessmentKind: AssessmentV1['kind']
  revealLabel: string
}

export type GradedAssessmentResultV1 = AssessmentResultCommonV1 & {
  status: 'correct' | 'incorrect'
  complete: true
  isCorrect: boolean
  expectedResponse?: JsonValue
  frameResults?: readonly AssessmentResultV1[]
}

export type IncompleteAssessmentResultV1 = AssessmentResultCommonV1 & {
  status: 'incomplete'
  complete: false
  isCorrect: false
  reason: string
}

export type NotLocallyGradableAssessmentResultV1 =
  AssessmentResultCommonV1 & {
    status: 'notLocallyGradable'
    complete: true
    isCorrect: null
    reason: string
  }

export type AssessmentResultV1 =
  | GradedAssessmentResultV1
  | IncompleteAssessmentResultV1
  | NotLocallyGradableAssessmentResultV1

export type SerializedAssessmentAttemptV1 = {
  schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION
  assessmentId: AssessmentId
  assessmentKind: AssessmentV1['kind']
  attemptNumber: number
  revealed: boolean
  /** Optional for backward compatibility with persisted v1 attempts. */
  usedHint?: boolean
  response: AssessmentResponseV1
  result: AssessmentResultV1
}
