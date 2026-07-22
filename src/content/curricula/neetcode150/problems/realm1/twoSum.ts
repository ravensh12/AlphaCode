import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const twoSumMissionSeed = {
  slug: 'two-sum',
  estimatedMinutes: 20,
  mission: {
    title: 'The Twin Battery Launch',
    context:
      'A rover must choose two different battery cells whose charge levels add to an exact launch requirement. The cells stay in their recorded order.',
    prompt:
      'Return the zero-based positions of the matching pair. Each mission log is guaranteed to contain exactly one valid pair.',
  },
  objective:
    'Find a target pair in one scan by mapping earlier values to their indices.',
  priorKnowledge: [
    'A complement is target minus the current value.',
    'A dictionary can store a value and where it appeared.',
    'A pair must use two different positions.',
  ],
  recognitionCue:
    'You need two values that combine to a target and must return their original positions.',
  misconception:
    'Storing only values in a set can detect a pair, but it cannot return both required indices.',
  algorithmSteps: [
    { id: 'open-index-map', instruction: 'Create an empty map from charge value to earlier index.' },
    { id: 'scan-cell', instruction: 'Scan each cell with its index from left to right.' },
    { id: 'compute-needed', instruction: 'Compute needed = target minus the current charge.' },
    { id: 'return-pair', instruction: 'If needed is in the map, return its index and the current index.' },
    { id: 'store-current', instruction: 'Otherwise store the current charge with its index.' },
  ],
  complexity: {
    time: 'O(n) expected',
    space: 'O(n)',
    explanation:
      'Each of n cells uses one expected constant-time map lookup, and unmatched cells may all be stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [6, 14, 4, 9],
      highlight: 3,
      pointers: [{ index: 3, label: 'current' }],
      visited: [0, 1, 2],
    },
  },
  workedExample: {
    prompt:
      'For charges [6, 14, 4, 9] and target 13, the scan stores 6, 14, and 4. At 9, the needed charge is 4, already stored at index 2.',
    code: [
      'def launch_pair(charges, target):',
      '    earlier = {}',
      '    for index, charge in enumerate(charges):',
      '        needed = target - charge',
      '        if needed in earlier:',
      '            return [earlier[needed], index]',
      '        earlier[charge] = index',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'At index 0, needed is 7, so store 6 → 0.',
      'At index 2, needed is 9, which has not appeared yet; store 4 → 2.',
      'At index 3, needed is 4, so return [2, 3].',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: '6', value: 0 },
        { key: '14', value: 1 },
        { key: '4', value: 2 },
      ],
      lookup: '4',
    },
  },
  patternCheck: {
    prompt:
      'Which memory makes a one-pass answer possible while preserving positions?',
    options: [
      { id: 'value-to-index', label: 'Map each earlier charge value to its index, then look up the complement.' },
      { id: 'running-total', label: 'Keep one running total of every charge seen so far.' },
      { id: 'neighbor-only', label: 'Compare each charge only with the next cell.' },
      { id: 'sort-and-forget', label: 'Sort the charges and discard their original positions.' },
    ],
    correctOptionId: 'value-to-index',
    feedback: {
      correct: 'Exactly. The complement lookup finds the partner and the map preserves its position.',
      incorrect: 'That plan either misses distant partners or loses the indices the rover needs.',
      secondIncorrect: 'Store value → index and ask whether target - current was stored earlier.',
    },
    hints: ['The pair may be far apart.', 'The answer needs positions, not only values.'],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: '8', value: 0 },
        { key: '3', value: 1 },
        { key: '11', value: 2 },
      ],
      lookup: '3',
    },
  },
  retrievalCheck: {
    prompt:
      'Without looking back, write the expression for the partner charge needed by the current cell.',
    acceptedAnswers: [
      'target - charge',
      'target-charge',
      'target minus charge',
      'target - current',
      'target-current',
      'target minus current',
      'target minus the current charge',
      'target - current charge',
    ],
    placeholder: 'needed = ...',
    feedback: {
      correct: 'Yes. A stored value equal to that complement completes the target.',
      incorrect: 'Use the launch target and the current charge in one subtraction.',
      secondIncorrect: 'The expression is target - charge.',
    },
    hints: ['Rearrange earlier + current = target.', 'Solve that equation for earlier.'],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the rover scan so a cell is never paired with itself.',
    feedback: {
      correct: 'Launch sequence ready. Checking before storing guarantees two different indices.',
      incorrect: 'The complement lookup must happen before the current cell enters the map.',
      secondIncorrect: 'Open the map, scan, compute, check and return, then store only if unmatched.',
    },
    hints: ['The map represents earlier positions only.', 'Compute needed before testing membership.'],
    diagram: { kind: 'array', values: [8, 3, 11, 7], highlight: 3, visited: [0, 1, 2] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["charges"] and data["target"], then return the two zero-based indices whose charges add to the target.',
    starterCode: `def solve(data):
    charges = data["charges"]
    target = data["target"]
    earlier = {}

    for index, charge in enumerate(charges):
        needed = target - charge
        # Check earlier, then remember the current index.
        pass`,
    cases: {
      visibleExample: { input: { charges: [8, 3, 11, 7], target: 10 }, expected: [1, 3] },
      hiddenBoundary: { input: { charges: [4, 6], target: 10 }, expected: [0, 1] },
      hiddenAdversarial: { input: { charges: [5, -2, 9, 14, 1], target: 10 }, expected: [2, 4] },
    },
    feedback: {
      correct: 'Rover launched! Your map finds distant, negative, and edge-position partners.',
      incorrect: 'A pair or index was wrong. Check the complement and store order.',
      secondIncorrect: 'If needed is in earlier, return [earlier[needed], index]; otherwise store charge → index.',
    },
    hints: [
      'Use needed = target - charge.',
      'Check needed in earlier before assigning earlier[charge].',
      'Return a JSON-safe two-item list.',
    ],
    diagram: { kind: 'array', values: [8, 3, 11, 7], highlight: 3, pointers: [{ index: 3, label: '7 needs 3' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(twoSumMissionSeed)
export default problemLesson
