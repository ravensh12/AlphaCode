import { toProblemId, type ProblemId } from '../types/curriculum'
import type {
  InternalProblemId,
  InternalSkillId,
} from '../types/learning'

const VERSION = 'v1'

function segment(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} must not be empty`)
  return encodeURIComponent(normalized)
}

function frame(value: number | undefined): number {
  const normalized = value ?? 0
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new RangeError('frameIndex must be a non-negative integer')
  }
  return normalized
}

export type LessonProblemIdInput = {
  readonly lessonId: string
  readonly stepId: string
  /** Original id retained by review/adaptive copies. */
  readonly masteryId?: string
  readonly frameIndex?: number
}

export function lessonProblemId(input: LessonProblemIdInput): InternalProblemId
export function lessonProblemId(
  lessonId: string,
  stepId: string,
  frameIndex?: number,
  masteryId?: string,
): InternalProblemId
export function lessonProblemId(
  inputOrLessonId: LessonProblemIdInput | string,
  positionalStepId?: string,
  positionalFrameIndex?: number,
  positionalMasteryId?: string,
): InternalProblemId {
  const input =
    typeof inputOrLessonId === 'string'
      ? {
          lessonId: inputOrLessonId,
          stepId: positionalStepId ?? '',
          frameIndex: positionalFrameIndex,
          masteryId: positionalMasteryId,
        }
      : inputOrLessonId
  const stableStepId = input.masteryId ?? input.stepId
  return `lesson:${segment(input.lessonId, 'lessonId')}:${segment(
    stableStepId,
    'stepId',
  )}:frame:${frame(input.frameIndex)}:${VERSION}`
}

export function microProblemId(questionId: string): InternalProblemId {
  return `micro:${segment(questionId, 'questionId')}:${VERSION}`
}

export function gauntletProblemId(questionId: string): InternalProblemId {
  return `gauntlet:${segment(questionId, 'questionId')}:${VERSION}`
}

export function legacyProblemId(
  namespace: string,
  itemId: string,
): InternalProblemId {
  return `legacy:${segment(namespace, 'namespace')}:${segment(
    itemId,
    'itemId',
  )}:${VERSION}`
}

export function legacySkillId(
  namespace: string,
  itemId?: string,
): InternalSkillId {
  const value =
    itemId == null
      ? segment(namespace, 'skillId')
      : `${segment(namespace, 'namespace')}:${segment(itemId, 'skillId')}`
  return `legacy-skill:${value}`
}

export function curriculumProblemId(leetcodeSlug: string): ProblemId {
  return toProblemId(decodeURIComponent(segment(leetcodeSlug, 'leetcodeSlug')))
}

export function isCurriculumProblemId(value: string): value is ProblemId {
  return value.startsWith('problem:') && value.length > 'problem:'.length
}

