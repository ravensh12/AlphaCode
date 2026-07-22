import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const threeSumMissionSeed = {
  slug: '3sum',
  estimatedMinutes: 27,
  mission: {
    title: 'The Three-Crystal Balance',
    context:
      'Crystal charges can be negative, positive, or zero. A stabilizer needs groups of three different crystal positions whose charges balance to zero.',
    prompt:
      'Return every unique charge triplet once, with each triplet in ascending order.',
  },
  objective:
    'Find unique zero-sum triplets by sorting, fixing one value, and sweeping two pointers.',
  priorKnowledge: [
    'Sorted order tells which pointer move raises or lowers a sum.',
    'Fixing one value turns a three-value target into a two-value target.',
    'Equal neighboring values can create duplicate results.',
  ],
  recognitionCue:
    'You need unique triples meeting a sum target, so one fixed value plus a two-pointer search reduces a loop.',
  misconception:
    'Using a set of output triplets hides duplicates after doing extra work; skipping duplicate choices during the scan is cleaner.',
  algorithmSteps: [
    { id: 'sort-charges', instruction: 'Sort all crystal charges in ascending order.' },
    { id: 'fix-charge', instruction: 'Scan a fixed index, skipping it when its value equals the previous fixed value.' },
    { id: 'place-pair', instruction: 'Place left just after the fixed index and right at the end.' },
    { id: 'measure-total', instruction: 'Add the fixed, left, and right charges.' },
    { id: 'adjust-pair', instruction: 'Move left for a small total or right for a large total.' },
    { id: 'record-balance', instruction: 'On zero, record the triplet and move both pointers inward.' },
    { id: 'skip-pair-duplicates', instruction: 'After recording, skip repeated left and right values before continuing.' },
  ],
  complexity: {
    time: 'O(n²)',
    space: 'O(n) extra',
    explanation:
      'The starter copies the input with sorted(), which uses O(n) extra space; each fixed value then runs one linear sweep.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [-5, 0, 1, 2, 3, 4],
      pointers: [
        { index: 0, label: 'fixed' },
        { index: 2, label: 'left' },
        { index: 5, label: 'right' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Sorted charges [-5, 0, 1, 2, 3, 4] fix -5. The inward scan finds -5+1+4 and -5+2+3, both equal to zero.',
    code: [
      'def balances(charges):',
      '    charges.sort(); answer = []',
      '    for i in range(len(charges) - 2):',
      '        if i > 0 and charges[i] == charges[i - 1]: continue',
      '        left, right = i + 1, len(charges) - 1',
      '        while left < right:',
      '            total = charges[i] + charges[left] + charges[right]',
      '            if total < 0: left += 1',
      '            elif total > 0: right -= 1',
      '            else:',
      '                answer.append([charges[i], charges[left], charges[right]])',
      '                left += 1; right -= 1',
      '                while left < right and charges[left] == charges[left - 1]: left += 1',
      '                while left < right and charges[right] == charges[right + 1]: right -= 1',
      '    return answer',
    ],
    currentLineIndex: 10,
    walkthrough: [
      'With -5 fixed, 0+4 is still too small, so left moves to 1.',
      'The triplet [-5, 1, 4] balances; both pair pointers move.',
      'The next pair 2 and 3 also balances, producing [-5, 2, 3].',
    ],
    diagram: { kind: 'array', values: [-5, 0, 1, 2, 3, 4], highlight: 0, pointers: [{ index: 3, label: '2' }, { index: 4, label: '3' }] },
  },
  patternCheck: {
    prompt:
      'After recording a balanced triplet, what prevents the same charge triple from appearing again?',
    options: [
      { id: 'skip-equal-values', label: 'Move both pair pointers and skip equal neighboring values.' },
      { id: 'move-fixed-only', label: 'Leave both pair pointers still and move only the fixed index.' },
      { id: 'reverse-result', label: 'Reverse the triplet before adding it again.' },
      { id: 'stop-all-search', label: 'End the entire algorithm after the first triplet.' },
    ],
    correctOptionId: 'skip-equal-values',
    feedback: {
      correct: 'Exactly. Duplicate values at the same decision level would recreate the same triplet.',
      incorrect: 'That either repeats the same state or misses other unique balances.',
      secondIncorrect: 'Move inward after a match and step over repeated pair values.',
    },
    hints: ['The answer needs all unique triples.', 'Equal sorted neighbors make equal choices.'],
    diagram: { kind: 'array', values: [-2, 0, 0, 2, 2], pointers: [{ index: 1, label: 'equal lefts' }, { index: 4, label: 'equal rights' }] },
  },
  retrievalCheck: {
    prompt:
      'Complete the duplicate rule for the fixed index: skip it when its value ______.',
    acceptedAnswers: [
      'equals the previous value',
      'is the same as the previous value',
      'matches charges[i - 1]',
      'equals charges[i-1]',
      'equals charges[i - 1]',
      'matches charges[i-1]',
      'matches the previous value',
      'equals the previous fixed value',
      'is equal to the previous value',
      'equals the value before it',
    ],
    placeholder: 'Type the comparison',
    feedback: {
      correct: 'Right. The same fixed value would launch an equivalent pair search.',
      incorrect: 'Compare the sorted fixed value with the fixed value immediately before it.',
      secondIncorrect: 'Skip when charges[i] == charges[i - 1].',
    },
    hints: ['This rule applies only when i > 0.', 'Sorting places duplicate fixed choices together.'],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the crystal search from sorting through duplicate-safe pair scanning.',
    feedback: {
      correct: 'Stabilizer restored. The fixed choice and inward scan cover every unique balance.',
      incorrect: 'The pair pointers are placed only after choosing a nonduplicate fixed value.',
      secondIncorrect: 'Sort, fix, place pair, measure, adjust, record, then skip pair duplicates.',
    },
    hints: ['Sorting enables both pointer moves and duplicate checks.', 'A zero total moves both pair pointers.'],
    diagram: { kind: 'array', values: [-4, -1, -1, 0, 1, 2], highlight: 1, pointers: [{ index: 2, label: 'duplicate fixed' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read integer data["charges"] and return all unique charge triplets that total zero. Triplet and result order do not matter.',
    starterCode: `def solve(data):
    charges = sorted(data["charges"])
    answer = []

    for i in range(len(charges) - 2):
        # Skip duplicate fixed values, then run an inward pair scan.
        pass

    return answer`,
    cases: {
      visibleExample: {
        input: { charges: [5, -6, 2, 7, 1, 4, -2] },
        expected: [[-6, 1, 5], [-6, 2, 4]],
      },
      hiddenBoundary: { input: { charges: [2, -2] }, expected: [] },
      hiddenAdversarial: {
        input: { charges: [-2, 0, 1, 1, 2, -2, 4] },
        expected: [[-2, -2, 4], [-2, 0, 2], [-2, 1, 1]],
      },
    },
    comparator: { kind: 'unordered' },
    feedback: {
      correct: 'Crystals balanced! Sorting and duplicate skips produce each valid charge triple once.',
      incorrect: 'A balance is missing, repeated, or out of order. Recheck pointer moves and duplicate skips.',
      secondIncorrect: 'Skip repeated i; sweep left/right; on zero append, move both, then skip equal neighbors.',
    },
    hints: [
      'A negative total needs a larger left value.',
      'A positive total needs a smaller right value.',
      'Skip duplicate fixed values and duplicate pair values.',
    ],
    diagram: { kind: 'array', values: [-4, -1, -1, 0, 1, 2], pointers: [{ index: 1, label: 'fixed -1' }, { index: 2, label: 'left -1' }, { index: 5, label: 'right 2' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(threeSumMissionSeed)
export default problemLesson
