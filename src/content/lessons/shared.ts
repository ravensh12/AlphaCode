import type {
  ConceptId,
  DiagramSpec,
  Lesson,
  LessonStep,
} from '../../types/lesson'
import { shuffle } from '../../lib/random'

type FB = { correct: string; incorrect: string; secondIncorrect?: string }

export function fb(
  correct: string,
  incorrect: string,
  secondIncorrect?: string,
): FB {
  return { correct, incorrect, secondIncorrect }
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
  // The correct answer + any explicit extras must ALWAYS be present. We build the
  // distractor pool separately, trim it to fit, then add the required values back
  // so a shuffle/slice can never drop the right answer.
  const required = [...new Set<number>([correct, ...(extras ?? [])])]
  const distractors = new Set<number>()
  let k = 1
  while (required.length + distractors.size < 8) {
    const up = correct + k
    const down = correct - k
    if (!required.includes(up)) distractors.add(up)
    if (down >= 0 && !required.includes(down)) distractors.add(down)
    k++
    if (k > 50) break
  }
  const fill = shuffle([...distractors]).slice(0, Math.max(0, 8 - required.length))
  return shuffle([...required, ...fill])
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

export { shuffle }
