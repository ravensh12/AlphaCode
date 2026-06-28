export type ConceptId =
  | 'arrays'
  | 'strings'
  | 'hashMaps'
  | 'twoPointers'
  | 'stacks'
  | 'binarySearch'
  | 'loops'
  | 'variables'

export type LessonSection = 'teach' | 'quiz'

export type LessonPhaseLabel =
  | 'Learn'
  | 'Explore'
  | 'Visual'
  | 'Try it'
  | 'Check'
  | 'Practice'
  | 'Walkthrough'
  | 'Think'
  | 'Quiz'

export type LessonStepType =
  | 'intro'
  | 'concept'
  | 'explore'
  | 'demonstration'
  | 'thinkCheck'
  | 'quizIntro'
  | 'visualExample'
  | 'guidedCode'
  | 'teachCheck'
  | 'lessonPractice'
  | 'practice'
  | 'reflection'
  /** Legacy aliases kept for engine compatibility */
  | 'traceVariables'
  | 'finalState'
  | 'reviewPuzzle'

export type VariableValue = number | string

/** One frame in a line-by-line code trace — run the line, then answer. */
export type TraceFrame = {
  prompt: string
  currentLineIndex: number
  diagram?: DiagramSpec
  variables: string[]
  targetVariables: string[]
  expectedState: Record<string, VariableValue>
  feedback: {
    correct: string
    incorrect: string
    secondIncorrect?: string
  }
  answerTiles?: (number | string)[]
  runLabel?: string
}

export type DiagramSpec =
  | {
      kind: 'array'
      values: (number | string)[]
      highlight?: number
      pointers?: { index: number; label: string }[]
      /** Indices already visited by the loop — shown dimmed. */
      visited?: number[]
    }
  | {
      kind: 'string'
      chars: string
      pointers?: { index: number; label: string }[]
      visited?: number[]
    }
  | {
      kind: 'hashmap'
      entries: { key: string; value: string | number }[]
      lookup?: string
    }
  | { kind: 'stack'; items: string[] }
  | {
      kind: 'binarySearch'
      values: number[]
      low?: number
      high?: number
      mid?: number
    }

export type LessonStep = {
  id: string
  type: LessonStepType
  /** Teach = learn the pattern. Quiz = prove you got it. */
  section: LessonSection
  phaseLabel?: LessonPhaseLabel
  prompt: string
  hook?: string
  code: string[]
  currentLineIndex?: number
  variables: string[]
  targetVariables: string[]
  expectedState: Record<string, VariableValue>
  feedback: {
    correct: string
    incorrect: string
    secondIncorrect?: string
  }
  conceptTags: ConceptId[]
  diagram?: DiagramSpec
  /** In-slide animation beats — pointers move, swaps, etc. on one slide. */
  diagramSequence?: DiagramSpec[]
  hints?: string[]
  answerTiles?: (number | string)[]
  inputMode?: 'numeric' | 'text'
  /** Multi-frame line-by-line trace. When set, each frame is run → answer → continue. */
  traceFrames?: TraceFrame[]
  /** Bullet points for passive demonstration slides. */
  bullets?: string[]
  /** Highlight box — key insight or revealed answer on teach slides. */
  callout?: string
  /** Optional comprehension question (thinkCheck) — answer shown on reveal. */
  reveal?: string
  /** First slide id in the block — learner rewinds here after two wrong tries. */
  checkpointStartStepId?: string
}

export type Lesson = {
  id: string
  title: string
  description: string
  pattern: string
  estimatedMinutes: number
  conceptTags: ConceptId[]
  unlockRequirements: {
    previousLessonId?: string
    minimumMastery?: number
  }
  steps: LessonStep[]
  /**
   * Set when the quiz was personalized to the learner: 'lightened' = fewer
   * questions for a strong learner, 'reinforced' = extra practice for a weak one.
   */
  adapted?: 'lightened' | 'reinforced'
}

export type LessonSummary = {
  id: string
  title: string
  subtitle: string
  pattern: string
  /** What the quiz practices — NeetCode-style but simplified. */
  practiceGoal: string
  conceptTags: ConceptId[]
  playable: boolean
  unlockRequirements: {
    previousLessonId?: string
    minimumMastery?: number
  }
}
