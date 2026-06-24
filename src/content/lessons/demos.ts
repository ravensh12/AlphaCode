import type { ConceptId, LessonStep } from '../../types/lesson'
import { tailDiagramSequence } from '../../lib/diagramSequences'
import { demonstrationStep, thinkCheckStep } from './shared'
import {
  buildBinarySearchTrace,
  buildBracketTrace,
  buildFindMaxTrace,
  buildPalindromeTrace,
  buildTwoSumTrace,
  buildVowelCountTrace,
} from './traces'

function formatState(state: Record<string, number | string>): string {
  return Object.entries(state)
    .map(([k, v]) => `${k} = ${v}`)
    .join(', ')
}

/** Turn a scored trace into passive walkthrough slides (teach section only). */
function traceToDemonstrations(
  trace: LessonStep,
  idPrefix: string,
  intro: { hook: string; prompt: string; bullets?: string[] },
  outro: { hook: string; prompt: string; callout: string; bullets?: string[] },
): LessonStep[] {
  const frames = trace.traceFrames ?? []
  const slides: LessonStep[] = [
    demonstrationStep(`${idPrefix}-intro`, intro.hook, intro.prompt, trace.conceptTags, {
      code: trace.code,
      diagram: frames[0]?.diagram ?? trace.diagram,
      diagramSequence: tailDiagramSequence(frames, 0, 3),
      bullets: intro.bullets,
      callout: 'Follow each slide — the highlighted line is what runs next.',
    }),
  ]

  frames.forEach((frame, i) => {
    const frameDiagram = frame.diagram ?? trace.diagram
    const diagramSequence = tailDiagramSequence(frames, i, 4)

    slides.push(
      demonstrationStep(
        `${idPrefix}-step-${i}`,
        `Line ${(frame.currentLineIndex ?? 0) + 1}`,
        frame.prompt.replace(/^Run line \d+: /, 'This line runs: ').replace(/\?$/, '.'),
        trace.conceptTags,
        {
          code: trace.code,
          currentLineIndex: frame.currentLineIndex,
          diagram: frameDiagram,
          diagramSequence,
          callout: formatState(frame.expectedState),
          bullets: [frame.feedback.correct],
        },
      ),
    )
  })

  slides.push(
    demonstrationStep(`${idPrefix}-outro`, outro.hook, outro.prompt, trace.conceptTags, {
      code: trace.code,
      diagram: frames[frames.length - 1]?.diagram ?? trace.diagram,
      diagramSequence: tailDiagramSequence(frames, frames.length - 1, 3),
      callout: outro.callout,
      bullets: outro.bullets,
    }),
  )

  return slides
}

export function buildFindMaxDemo(nums: number[], idPrefix = 'demo-max'): LessonStep[] {
  const trace = buildFindMaxTrace(nums, `${idPrefix}-trace`, 'teach')
  const max = Math.max(...nums)
  return traceToDemonstrations(
    trace,
    idPrefix,
    {
      hook: 'Find the maximum — full scan',
      prompt:
        'We keep a running “largest so far” and visit every index once. Watch how the array and variables change at each line.',
      bullets: [
        'Start with nums[0] as your first guess for largest.',
        'Each loop step compares the current number to largest.',
        'Update largest only when you find something bigger.',
      ],
    },
    {
      hook: 'Pattern locked in',
      prompt:
        'That loop is the basic array scan — NeetCode uses this idea in dozens of problems.',
      callout: `Final answer: largest = ${max}`,
      bullets: [
        'One pass through the list — O(n) time.',
        'You will practice this for real in the quiz.',
      ],
    },
  )
}

export function buildVowelCountDemo(word: string, idPrefix = 'demo-vowels'): LessonStep[] {
  const trace = buildVowelCountTrace(word, `${idPrefix}-trace`, 'teach')
  const vowels = [...word].filter((c) => 'aeiou'.includes(c)).length
  return traceToDemonstrations(
    trace,
    idPrefix,
    {
      hook: 'Count vowels — character scan',
      prompt: `We walk "${word}" one letter at a time. When a letter is in "aeiou", bump the counter.`,
      bullets: [
        'Strings behave like arrays of characters — s[i] or for ch in s.',
        'The test ch in "aeiou" is True for vowels only.',
      ],
    },
    {
      hook: 'Same idea as array scanning',
      prompt: 'Replace “num” with “ch” and you get the string version of the scan pattern.',
      callout: `Total vowels in "${word}": ${vowels}`,
      bullets: ['Left-to-right loop, update a running count.'],
    },
  )
}

export function buildTwoSumDemo(
  nums: number[],
  target: number,
  idPrefix = 'demo-twosum',
): LessonStep[] {
  const trace = buildTwoSumTrace(nums, target, `${idPrefix}-trace`, 'teach')
  return traceToDemonstrations(
    trace,
    idPrefix,
    {
      hook: 'Two Sum — store then lookup',
      prompt: `Find two numbers that add to ${target}. As we loop, store each value in a hash map, then check if the complement already exists.`,
      bullets: [
        'complement = target - num',
        'If complement is in the map, you found the pair.',
        'Otherwise store num → index and keep going.',
      ],
    },
    {
      hook: 'Hash map = instant memory',
      prompt: 'Without a map you would need nested loops. The map answers “have I seen this?” in one step.',
      callout: `Target ${target} — pair found by complement lookup.`,
      bullets: ['Store as you go, lookup in O(1).'],
    },
  )
}

export function buildPalindromeDemo(word: string, idPrefix = 'demo-palindrome'): LessonStep[] {
  const trace = buildPalindromeTrace(word, `${idPrefix}-trace`, 'teach')
  return traceToDemonstrations(
    trace,
    idPrefix,
    {
      hook: 'Palindrome check — two pointers',
      prompt: `"${word}" reads the same forward and backward. left starts at the first letter, right at the last — they walk toward the center.`,
      bullets: [
        'Compare s[left] and s[right] each step.',
        'If any pair differs, it is not a palindrome.',
        'Move both pointers inward after each match.',
      ],
    },
    {
      hook: 'Mirrored data → two pointers',
      prompt: 'When data has structure from both ends, start with two indices instead of one.',
      callout: `"${word}" is a palindrome — all pairs matched.`,
      bullets: ['Classic two-pointer use case on strings.'],
    },
  )
}

export function buildBracketDemo(input: string, idPrefix = 'demo-brackets'): LessonStep[] {
  const trace = buildBracketTrace(input, `${idPrefix}-trace`, 'teach')
  return traceToDemonstrations(
    trace,
    idPrefix,
    {
      hook: 'Valid parentheses — stack trace',
      prompt: `Each character in "${input}" is processed left to right. Openers push onto the stack; closers pop and must match the top opener.`,
      bullets: [
        'Stack = last unmatched opener waiting for a partner.',
        'Push on ( [ { — pop and compare on ) ] }.',
        'Valid if the stack is empty at the end.',
      ],
    },
    {
      hook: 'LIFO matching',
      prompt: 'The most recent opener must match the next closer — that is why a stack fits perfectly.',
      callout: `String "${input}" — stack empty means balanced.`,
      bullets: ['Push / pop is the whole algorithm.'],
    },
  )
}

export function buildBinarySearchDemo(
  sorted: number[],
  target: number,
  idPrefix = 'demo-bs',
): LessonStep[] {
  const trace = buildBinarySearchTrace(sorted, target, `${idPrefix}-trace`, 'teach')
  return traceToDemonstrations(
    trace,
    idPrefix,
    {
      hook: 'Binary search — halve the range',
      prompt: `Find ${target} in a sorted list. Each step picks mid between low and high, compares to the target, then discards half the indices.`,
      bullets: [
        'Requires sorted data — order tells you which half to keep.',
        'mid = (low + high) // 2',
        'Too small? low = mid + 1. Too big? high = mid - 1.',
      ],
    },
    {
      hook: 'Logarithmic speed',
      prompt: 'Each comparison eliminates half the remaining search space — much faster than scanning every element.',
      callout: `Target ${target} found (or range exhausted).`,
      bullets: ['O(log n) vs O(n) for a linear scan.'],
    },
  )
}

export function thinkPatternCheck(
  id: string,
  question: string,
  answer: string,
  explanation: string,
  tags: ConceptId[],
) {
  return thinkCheckStep(id, question, answer, explanation, tags)
}
