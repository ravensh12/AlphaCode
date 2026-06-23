export type ConceptId =
  | 'variables'
  | 'assignment'
  | 'reassignment'
  | 'arithmetic'
  | 'output'
  | 'conditionals'
  | 'loops'
  | 'debugging'

export type LessonStepType =
  | 'intro'
  | 'traceVariables'
  | 'finalState'
  | 'reviewPuzzle'

export type VariableValue = number | string

export type LessonStep = {
  id: string
  type: LessonStepType
  prompt: string
  /** Full code snippet shown, one string per line. */
  code: string[]
  /** Index into `code` of the line being executed/highlighted (0-based). */
  currentLineIndex?: number
  /** Variables that should have boxes shown for this step. */
  variables: string[]
  /** The variable(s) the learner must fill in for this step. */
  targetVariables: string[]
  /** The full expected program state after this step runs. */
  expectedState: Record<string, VariableValue>
  feedback: {
    correct: string
    incorrect: string
    secondIncorrect?: string
  }
  conceptTags: ConceptId[]
}

export type Lesson = {
  id: string
  title: string
  description: string
  estimatedMinutes: number
  conceptTags: ConceptId[]
  unlockRequirements: {
    previousLessonId?: string
    minimumMastery?: number
  }
  steps: LessonStep[]
}

/** Static metadata for lessons shown on the course path (incl. locked ones). */
export type LessonSummary = {
  id: string
  title: string
  subtitle: string
  conceptTags: ConceptId[]
  /** Whether the full lesson is implemented and playable in the MVP. */
  playable: boolean
  unlockRequirements: {
    previousLessonId?: string
    minimumMastery?: number
  }
}
