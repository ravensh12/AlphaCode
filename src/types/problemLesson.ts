import type { AssessmentV1 } from './assessment'
import type {
  ContentVersion,
  CurriculumId,
  NonEmptyReadonlyArray,
  ProblemId,
  SkillId,
} from './curriculum'
import type { DiagramSpec } from './diagram'

export const PROBLEM_LESSON_SCHEMA_VERSION = 1 as const

export type ProblemLessonVariantId = `variant:${string}`

export type ProblemLessonContentRef = {
  schemaVersion: typeof PROBLEM_LESSON_SCHEMA_VERSION
  curriculumId: CurriculumId
  manifestContentVersion: ContentVersion
  problemId: ProblemId
  problemContentVersion: ContentVersion
  variantId: ProblemLessonVariantId
}

export type ProblemLessonFeedbackV1 = {
  correct: string
  incorrect: string
  secondIncorrect?: string
}

type ProblemLessonStepCommonV1 = {
  id: string
  prompt: string
  hook?: string
  skillIds?: readonly SkillId[]
  diagram?: DiagramSpec
  diagramSequence?: readonly DiagramSpec[]
  bullets?: readonly string[]
  callout?: string
}

export type ProblemLessonExplanationStepV1 = ProblemLessonStepCommonV1 & {
  kind: 'explanation'
}

export type ProblemLessonWorkedExampleStepV1 =
  ProblemLessonStepCommonV1 & {
    kind: 'workedExample'
    code: readonly string[]
    currentLineIndex?: number
  }

export type ProblemLessonQuizIntroStepV1 = ProblemLessonStepCommonV1 & {
  kind: 'quizIntro'
}

export type ProblemLessonAssessmentStepV1 = ProblemLessonStepCommonV1 & {
  kind: 'assessment'
  assessment: AssessmentV1
  feedback: ProblemLessonFeedbackV1
  hints?: readonly string[]
}

export type ProblemLessonStepV1 =
  | ProblemLessonExplanationStepV1
  | ProblemLessonWorkedExampleStepV1
  | ProblemLessonQuizIntroStepV1
  | ProblemLessonAssessmentStepV1

/**
 * Variants may change copy and values, but their step/assessment identities and
 * kinds must have identical topology. The compiler enforces that invariant.
 */
export type ProblemLessonVariantV1 = {
  id: ProblemLessonVariantId
  explanation: ProblemLessonExplanationStepV1
  workedExample: ProblemLessonWorkedExampleStepV1
  quizIntro: ProblemLessonQuizIntroStepV1
  assessments: NonEmptyReadonlyArray<ProblemLessonAssessmentStepV1>
}

export type ProblemLessonSpecV1 = {
  schemaVersion: typeof PROBLEM_LESSON_SCHEMA_VERSION
  curriculumId: CurriculumId
  manifestContentVersion: ContentVersion
  problemId: ProblemId
  problemContentVersion: ContentVersion
  description: string
  pattern: string
  estimatedMinutes: number
  skillIds: NonEmptyReadonlyArray<SkillId>
  variants: NonEmptyReadonlyArray<ProblemLessonVariantV1>
}
