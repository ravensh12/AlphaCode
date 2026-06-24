import type {
  ConceptId,
  DiagramSpec,
  Lesson,
  LessonSection,
  LessonStep,
  VariableValue,
} from '../../types/lesson'
import { randInt, shuffle } from '../../lib/random'

type FB = { correct: string; incorrect: string; secondIncorrect?: string }

export function fb(
  correct: string,
  incorrect: string,
  secondIncorrect?: string,
): FB {
  return { correct, incorrect, secondIncorrect }
}

function textMode(expected: Record<string, VariableValue>): boolean {
  return Object.values(expected).some(
    (v) => typeof v === 'string' && Number.isNaN(Number(v)),
  )
}

export function exploreStep(
  id: string,
  hook: string,
  prompt: string,
  tags: ConceptId[],
  diagram: DiagramSpec,
  bullets?: string[],
  diagramSequence?: DiagramSpec[],
): LessonStep {
  return {
    id,
    type: 'explore',
    section: 'teach',
    phaseLabel: 'Explore',
    hook,
    prompt,
    code: [],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: fb('', ''),
    conceptTags: tags,
    diagram,
    diagramSequence,
    bullets,
  }
}

export function conceptStep(
  id: string,
  hook: string,
  prompt: string,
  tags: ConceptId[],
  diagram?: DiagramSpec,
  diagramSequence?: DiagramSpec[],
): LessonStep {
  return {
    id,
    type: 'concept',
    section: 'teach',
    phaseLabel: 'Learn',
    hook,
    prompt,
    code: [],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: fb('', ''),
    conceptTags: tags,
    diagram,
    diagramSequence,
  }
}

/** Passive code walkthrough — watch and read, no scored answers. */
export function demonstrationStep(
  id: string,
  hook: string,
  prompt: string,
  tags: ConceptId[],
  opts: {
    code?: string[]
    currentLineIndex?: number
    diagram?: DiagramSpec
    diagramSequence?: DiagramSpec[]
    bullets?: string[]
    callout?: string
    phaseLabel?: LessonStep['phaseLabel']
  } = {},
): LessonStep {
  return {
    id,
    type: 'demonstration',
    section: 'teach',
    phaseLabel: opts.phaseLabel ?? 'Walkthrough',
    hook,
    prompt,
    code: opts.code ?? [],
    currentLineIndex: opts.currentLineIndex,
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: fb('', ''),
    conceptTags: tags,
    diagram: opts.diagram,
    diagramSequence: opts.diagramSequence,
    bullets: opts.bullets,
    callout: opts.callout,
  }
}

/** Optional comprehension check — reveal the answer, not tracked for mastery. */
export function thinkCheckStep(
  id: string,
  question: string,
  answer: string,
  explanation: string,
  tags: ConceptId[],
  diagram?: DiagramSpec,
): LessonStep {
  return {
    id,
    type: 'thinkCheck',
    section: 'teach',
    phaseLabel: 'Think',
    hook: 'Quick check — no pressure',
    prompt: question,
    code: [],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: fb('', ''),
    conceptTags: tags,
    diagram,
    reveal: answer,
    callout: explanation,
  }
}

export function quizIntroStep(
  hook: string,
  prompt: string,
  tags: ConceptId[],
): LessonStep {
  return {
    id: 'quiz-intro',
    type: 'quizIntro',
    section: 'quiz',
    phaseLabel: 'Quiz',
    hook,
    prompt,
    code: [],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: fb('', ''),
    conceptTags: tags,
  }
}

export function visualStep(
  id: string,
  prompt: string,
  code: string[],
  line: number,
  vars: string[],
  targets: string[],
  expected: Record<string, VariableValue>,
  feedback: FB,
  tags: ConceptId[],
  diagram?: DiagramSpec,
  tiles?: (number | string)[],
): LessonStep {
  return {
    id,
    type: 'visualExample',
    section: 'teach',
    phaseLabel: 'Visual',
    prompt,
    code,
    currentLineIndex: line,
    variables: vars,
    targetVariables: targets,
    expectedState: expected,
    answerTiles: tiles,
    inputMode: textMode(expected) ? 'text' : 'numeric',
    feedback,
    conceptTags: tags,
    diagram,
  }
}

export function guidedStep(
  id: string,
  prompt: string,
  code: string[],
  targets: string[],
  expected: Record<string, VariableValue>,
  tiles: (number | string)[],
  feedback: FB,
  tags: ConceptId[],
): LessonStep {
  return {
    id,
    type: 'guidedCode',
    section: 'teach',
    phaseLabel: 'Try it',
    prompt,
    code,
    variables: targets,
    targetVariables: targets,
    expectedState: expected,
    answerTiles: tiles,
    inputMode: textMode(expected) ? 'text' : 'numeric',
    feedback,
    conceptTags: tags,
  }
}

/** Quick comprehension check during the teach section. */
export function teachCheckStep(
  id: string,
  prompt: string,
  answer: string,
  options: string[],
  feedback: FB,
  tags: ConceptId[],
  diagram?: DiagramSpec,
): LessonStep {
  return {
    id,
    type: 'teachCheck',
    section: 'teach',
    phaseLabel: 'Check',
    prompt,
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer },
    answerTiles: shuffle([...new Set([answer, ...options])]),
    inputMode: 'text',
    feedback,
    conceptTags: tags,
    diagram,
  }
}

/** Gated practice check during learn — 2 tries, no hints; rewind block on failure. */
export function lessonPracticeStep(
  id: string,
  prompt: string,
  answer: string,
  options: string[],
  feedback: FB,
  tags: ConceptId[],
  checkpointStartStepId: string,
  diagram?: DiagramSpec,
): LessonStep {
  return {
    id,
    type: 'lessonPractice',
    section: 'teach',
    phaseLabel: 'Practice',
    prompt,
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer },
    answerTiles: shuffle([...new Set([answer, ...options])]),
    inputMode: 'text',
    feedback,
    conceptTags: tags,
    diagram,
    checkpointStartStepId,
  }
}

export function quizStep(
  id: string,
  prompt: string,
  code: string[],
  targets: string[],
  expected: Record<string, VariableValue>,
  hints: string[],
  feedback: FB,
  tags: ConceptId[],
  diagram?: DiagramSpec,
  tiles?: (number | string)[],
): LessonStep {
  return {
    id,
    type: 'practice',
    section: 'quiz',
    phaseLabel: 'Quiz',
    prompt,
    code,
    variables: targets,
    targetVariables: targets,
    expectedState: expected,
    hints,
    answerTiles: tiles,
    inputMode: textMode(expected) ? 'text' : 'numeric',
    feedback,
    conceptTags: tags,
    diagram,
  }
}

/** Final quiz question — usually a big-picture pattern check. */
export function quizCheckStep(
  id: string,
  prompt: string,
  answer: string,
  options: string[],
  feedback: FB,
  tags: ConceptId[],
): LessonStep {
  return {
    id,
    type: 'reflection',
    section: 'quiz',
    phaseLabel: 'Quiz',
    prompt,
    code: [],
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer },
    answerTiles: shuffle([...new Set([answer, ...options])]),
    inputMode: 'text',
    feedback,
    conceptTags: tags,
  }
}

/** @deprecated use quizStep */
export const practiceStep = quizStep
/** @deprecated use quizCheckStep */
export const reflectionStep = quizCheckStep

export function lessonShell(
  id: string,
  title: string,
  description: string,
  pattern: string,
  tags: ConceptId[],
  steps: LessonStep[],
  unlock: Lesson['unlockRequirements'] = {},
): Lesson {
  return {
    id,
    title,
    description,
    pattern,
    estimatedMinutes: 10,
    conceptTags: tags,
    unlockRequirements: unlock,
    steps,
  }
}

export function numTiles(correct: number, extras?: number[]): number[] {
  const set = new Set<number>([correct, ...(extras ?? [])])
  let k = 1
  while (set.size < 8) {
    set.add(Math.max(0, correct + k))
    set.add(Math.max(0, correct - k))
    k++
  }
  return shuffle([...set]).slice(0, 8)
}

export function isPassiveType(type: LessonStep['type']): boolean {
  return (
    type === 'intro' ||
    type === 'concept' ||
    type === 'explore' ||
    type === 'demonstration' ||
    type === 'thinkCheck' ||
    type === 'quizIntro'
  )
}

export function isInteractiveType(type: LessonStep['type']): boolean {
  return !isPassiveType(type)
}

export function sectionLabel(section: LessonSection): string {
  return section === 'teach' ? 'Learn' : 'Quiz'
}

export { randInt, shuffle }
