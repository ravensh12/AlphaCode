import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const longestConsecutiveSequenceMissionSeed = {
  slug: 'longest-consecutive-sequence',
  estimatedMinutes: 22,
  mission: {
    title: 'The Floating Stepstone Trail',
    context:
      'An explorer receives unsorted integer coordinates for safe floating stones. A trail is a run of coordinates that rise by exactly 1, and duplicate reports do not add stones.',
    prompt:
      'Return the length of the longest trail without sorting the coordinate report.',
  },
  objective:
    'Find consecutive runs by expanding only from values that have no predecessor.',
  priorKnowledge: [
    'A set removes duplicates and supports expected O(1) membership.',
    'A run starts where the previous integer is absent.',
    'A counter can grow while the next integer exists.',
  ],
  recognitionCue:
    'You need the longest +1 chain in unsorted values, and only membership—not original order—matters.',
  misconception:
    'Expanding forward from every value repeats work across the same long trail and can become quadratic.',
  algorithmSteps: [
    { id: 'build-stones', instruction: 'Put all reported coordinates into a set.' },
    { id: 'start-best', instruction: 'Initialize the best trail length to 0.' },
    { id: 'find-starts', instruction: 'Consider only a coordinate whose value minus 1 is absent.' },
    { id: 'walk-forward', instruction: 'From each start, advance while the next integer is in the set.' },
    { id: 'update-best', instruction: 'Compare that trail length with the best length.' },
    { id: 'return-best', instruction: 'Return the best length after all starts are checked.' },
  ],
  complexity: {
    time: 'O(n) expected',
    space: 'O(n)',
    explanation:
      'Set creation is linear, and each distinct coordinate is advanced through only as part of its one trail.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [-2, -1, 0, 1, 2, 5],
      highlight: 0,
      pointers: [
        { index: 0, label: 'start' },
        { index: 4, label: 'length 5' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Coordinates [9, 1, 4, 7, 3, 2, 6] contain starts 1, 6, and 9. Starting at 1 reaches 2, 3, and 4 for length 4.',
    code: [
      'def longest_trail(coords):',
      '    stones = set(coords)',
      '    best = 0',
      '    for value in stones:',
      '        if value - 1 not in stones:',
      '            length = 1',
      '            while value + length in stones:',
      '                length += 1',
      '            best = max(best, length)',
      '    return best',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'Value 3 is not a start because 2 exists.',
      'Value 1 is a start because 0 is absent.',
      'The membership walk finds 1, 2, 3, 4 and records best = 4.',
    ],
    diagram: { kind: 'array', values: [1, 2, 3, 4, 6, 7, 9], highlight: 0, visited: [0, 1, 2, 3] },
  },
  patternCheck: {
    prompt:
      'Which coordinate should begin an expansion?',
    options: [
      { id: 'no-predecessor', label: 'A coordinate x for which x - 1 is not in the set.' },
      { id: 'no-successor', label: 'A coordinate x for which x + 1 is not in the set.' },
      { id: 'largest-value', label: 'Only the largest coordinate in the report.' },
      { id: 'every-value', label: 'Every coordinate, including middle stones in a known trail.' },
    ],
    correctOptionId: 'no-predecessor',
    feedback: {
      correct: 'Yes. That coordinate is the unique left edge of its trail.',
      incorrect: 'That choice either starts at the end or repeats expansion work.',
      secondIncorrect: 'A true start has no stone immediately before it.',
    },
    hints: ['A middle value has a predecessor.', 'Each trail should be walked once.'],
    diagram: { kind: 'array', values: [3, 4, 5, 8], highlight: 0, pointers: [{ index: 0, label: '3 has no 2' }] },
  },
  retrievalCheck: {
    prompt:
      'Complete the start test for value x: begin a trail only if ______.',
    acceptedAnswers: [
      'x - 1 not in stones',
      'x-1 is not in the set',
      'the predecessor is absent',
      'x minus 1 is absent',
      'x-1 not in stones',
      'x - 1 is not in the set',
      'x-1 not in the set',
      'x - 1 not in the set',
      'x-1 is not in stones',
      'x - 1 is not in stones',
      'x minus 1 is not in the set',
      'x minus 1 is not in stones',
    ],
    placeholder: 'Type the start condition',
    feedback: {
      correct: 'Correct. The missing predecessor proves x is the left boundary.',
      incorrect: 'State the membership test involving the integer immediately before x.',
      secondIncorrect: 'Use “x - 1 not in stones.”',
    },
    hints: ['Look one step backward.', 'Absence, not presence, marks the start.'],
  },
  reconstructionCheck: {
    prompt:
      'Rebuild the trail finder so no consecutive run is scanned from its middle.',
    feedback: {
      correct: 'Trail finder restored. One boundary check prevents repeated work.',
      incorrect: 'Search for starts before walking forward.',
      secondIncorrect: 'Build set, start best, find a no-predecessor value, walk, update, return.',
    },
    hints: ['The set comes before every membership test.', 'Best updates after one complete trail.'],
    diagram: { kind: 'array', values: [1, 2, 3, 4], highlight: 0, pointers: [{ index: 0, label: 'only start' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read integer data["stones"] and return the longest number of distinct coordinates forming a +1 trail. Do not sort.',
    starterCode: `def solve(data):
    stones = set(data["stones"])
    best = 0

    for value in stones:
        # Expand only from a value with no predecessor.
        pass

    return best`,
    cases: {
      visibleExample: { input: { stones: [30, 8, 12, 9, 10, 11, 50] }, expected: 5 },
      hiddenBoundary: { input: { stones: [] }, expected: 0 },
      hiddenAdversarial: { input: { stones: [0, -1, 1, 2, -2, 2, 5] }, expected: 5 },
    },
    feedback: {
      correct: 'Trail mapped! Boundary starts handle negatives, duplicates, and empty reports.',
      incorrect: 'The longest length is off. Check the predecessor test and forward counter.',
      secondIncorrect: 'When value-1 is absent, start length 1 and grow while value+length exists.',
    },
    hints: [
      'Duplicates disappear when you build the set.',
      'Initialize each new trail with length = 1.',
      'Update best after the while loop.',
    ],
    diagram: { kind: 'array', values: [-2, -1, 0, 1, 2, 5], highlight: 0, pointers: [{ index: 4, label: 'five stones' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(longestConsecutiveSequenceMissionSeed)
export default problemLesson
