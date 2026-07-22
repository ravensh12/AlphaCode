import type {
  AnswerMatcherV1,
  PythonComparatorV1,
  PythonObservationV1,
} from '../../../types/assessment'
import type { ProblemLessonFeedbackV1 } from '../../../types/problemLesson'
import type { DiagramSpec } from '../../../types/diagram'
import type { JsonValue } from '../../../types/learning'
import type { NonEmptyReadonlyArray } from '../../../types/curriculum'

/**
 * Author-owned semantic key. The factory namespaces it with the manifest slug
 * when it creates public option, item, and case IDs.
 */
export type ProblemMissionSeedKey = string

export type ProblemMissionVisualSeed = {
  diagram?: DiagramSpec
  diagramSequence?: readonly DiagramSpec[]
}

export type ProblemMissionGuidanceSeed = {
  feedback: ProblemLessonFeedbackV1
  hints: NonEmptyReadonlyArray<string>
}

export type ProblemMissionAlgorithmStepSeed = {
  id: ProblemMissionSeedKey
  instruction: string
}

export type ProblemMissionChoiceOptionSeed = {
  id: ProblemMissionSeedKey
  label: string
}

export type ProblemMissionPythonCaseSeed = {
  input: JsonValue
  expected: JsonValue
}

export type ProblemMissionAdditionalPythonCaseSeed =
  ProblemMissionPythonCaseSeed & {
    id: ProblemMissionSeedKey
    visibility: 'example' | 'hidden'
  }

/**
 * The three named case classes are mandatory for every mission. Keeping the
 * input as one JSON value lets arrays, linked structures, trees, graphs, and
 * stateful operation logs all use the same `solve(data)` boundary.
 */
export type ProblemMissionPythonCasesSeed = {
  visibleExample: ProblemMissionPythonCaseSeed
  hiddenBoundary: ProblemMissionPythonCaseSeed
  hiddenAdversarial: ProblemMissionPythonCaseSeed
  additional?: readonly ProblemMissionAdditionalPythonCaseSeed[]
}

/**
 * Compact, serializable authoring input for the standard problem-mission arc.
 * Manifest-owned identity, versions, skills, pattern labels, and provenance
 * are deliberately absent: the factory resolves those from `slug`.
 */
export type ProblemMissionSeed = {
  slug: string
  estimatedMinutes: number
  mission: {
    title: string
    context: string
    prompt: string
  }
  objective: string
  priorKnowledge: NonEmptyReadonlyArray<string>
  recognitionCue: string
  misconception: string
  algorithmSteps: readonly [
    ProblemMissionAlgorithmStepSeed,
    ProblemMissionAlgorithmStepSeed,
    ...ProblemMissionAlgorithmStepSeed[],
  ]
  complexity: {
    time: string
    space: string
    explanation: string
  }
  explanationVisuals?: ProblemMissionVisualSeed
  workedExample: ProblemMissionVisualSeed & {
    prompt: string
    code: NonEmptyReadonlyArray<string>
    walkthrough: NonEmptyReadonlyArray<string>
    currentLineIndex?: number
  }
  patternCheck: ProblemMissionVisualSeed &
    ProblemMissionGuidanceSeed & {
      prompt: string
      options: readonly [
        ProblemMissionChoiceOptionSeed,
        ProblemMissionChoiceOptionSeed,
        ...ProblemMissionChoiceOptionSeed[],
      ]
      correctOptionId: ProblemMissionSeedKey
    }
  retrievalCheck: ProblemMissionVisualSeed &
    ProblemMissionGuidanceSeed & {
      prompt: string
      acceptedAnswers: NonEmptyReadonlyArray<string>
      /** Optional semantic matcher; acceptedAnswers remains reveal/feedback copy. */
      matcher?: AnswerMatcherV1
      placeholder?: string
    }
  reconstructionCheck: ProblemMissionVisualSeed &
    ProblemMissionGuidanceSeed & {
      prompt: string
    }
  pythonChallenge: ProblemMissionVisualSeed &
    ProblemMissionGuidanceSeed & {
      prompt: string
      /** Must declare the shared, exact `def solve(data):` entrypoint. */
      starterCode: string
      cases: ProblemMissionPythonCasesSeed
      comparator?: PythonComparatorV1
      observation?: PythonObservationV1
      verificationNotes?: readonly string[]
    }
}
