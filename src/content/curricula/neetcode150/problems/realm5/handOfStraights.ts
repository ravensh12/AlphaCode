import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const handOfStraightsMissionSeed = buildRealm5Mission({
  slug: 'hand-of-straights',
  estimatedMinutes: 24,
  mission: {
    title: 'The Consecutive Badge Bundles',
    context:
      'A camp sorts numbered activity badges into equal-size bundles. Every bundle must contain consecutive numbers, and every physical badge must be used once.',
    prompt:
      'Return whether all badge numbers can be divided into valid consecutive bundles of the requested size.',
  },
  objective:
    'Consume counts from the smallest remaining badge, which is forced to begin every bundle containing it.',
  priorKnowledge: [
    'Duplicate badge numbers represent separate physical badges.',
    'The smallest remaining number cannot appear in the middle of a bundle whose earlier numbers are absent.',
  ],
  recognitionCue:
    'A multiset must be partitioned into fixed-size groups of consecutive values.',
  misconception:
    'Checking that every distinct value has a next value ignores duplicate counts and bundle boundaries.',
  algorithmSteps: [
    {
      id: 'check-bundle-divisibility',
      instruction: 'Reject when the badge count is not divisible by the bundle size.',
    },
    {
      id: 'count-badge-values',
      instruction: 'Build a frequency map and visit its keys in increasing order.',
    },
    {
      id: 'read-smallest-copies',
      instruction: 'At each key, let its remaining count be the number of bundles forced to start there.',
    },
    {
      id: 'consume-consecutive-run',
      instruction:
        'Subtract that count from every value across the next bundle-size consecutive numbers.',
    },
    {
      id: 'return-all-consumed',
      instruction: 'Return false on any shortage; otherwise return true.',
    },
  ],
  complexity: {
    time: 'O(n + u log u + u × g)',
    space: 'O(u)',
    explanation:
      'Counting n badges is linear, sorting u distinct values costs O(u log u), each nonempty start checks g consecutive counts, and the map stores u counts.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [1, 2, 3, 4],
      [1, 2, 2, 1],
      [0, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    rowLabels: ['badge', 'start counts', 'after 1-3', 'after 2-4'],
    columnLabels: ['value 1', 'value 2', 'value 3', 'value 4'],
    highlightedCells: [
      { row: 2, column: 0, label: 'first bundle done' },
      { row: 3, column: 3, label: 'all used' },
    ],
    dependencyCells: [
      { row: 1, column: 0 },
      { row: 1, column: 1 },
      { row: 1, column: 2 },
    ],
  },
  workedExample: {
    prompt:
      'Cards [1, 2, 2, 3, 3, 4] with bundle size 3 form [1, 2, 3] and [2, 3, 4]. Smallest-first consumption proves both bundles.',
    code: [
      'counts = Counter(cards)',
      'for start in sorted(counts):',
      '    copies = counts[start]',
      '    for value in range(start, start + group_size):',
      '        if counts[value] < copies: return False',
      '        counts[value] -= copies',
      'return True',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'The one copy of smallest badge 1 must start one bundle.',
      'Consuming 1, 2, 3 leaves one copy each of 2, 3, and 4.',
      'The remaining smallest badge 2 starts the second bundle.',
      'Consuming 2, 3, 4 leaves every count at zero.',
    ],
  },
  patternCheck: {
    prompt:
      'Which choice is forced whenever the smallest remaining badge has c copies?',
    correct:
      'Start c bundles there and consume c copies of every next consecutive value in each bundle.',
    distractors: [
      'Pair each badge only with the next larger distinct badge.',
      'Ignore frequencies after sorting the unique values.',
      'Generate every partition of physical badges into bundles.',
    ],
    hint: 'No smaller unused badge exists that could start a bundle containing this value later.',
  },
  retrievalCheck: {
    prompt:
      'What does counts[start] mean when start is the smallest remaining value?',
    acceptedAnswers: [
      'the number of groups that must start there',
      'the number of bundles that must start there',
      'the number of bundles forced to start there',
      'how many bundles must begin at start',
      'how many groups must begin at start',
      'the copies to subtract across the consecutive run',
    ],
    placeholder: 'State the greedy invariant',
    hint: 'Every copy must belong to a bundle, and none can have a smaller beginning.',
  },
  reconstructionPrompt:
    'Order the smallest-first bundle check from divisibility through count consumption.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains cards, an integer list, and positive groupSize. Return true when every card can be used in a consecutive group of that size.',
    starterCode: `def solve(data):
    from collections import Counter

    cards = data["cards"]
    group_size = data["groupSize"]
    if len(cards) % group_size != 0:
        return False

    counts = Counter(cards)
    for start in sorted(counts):
        copies = counts[start]
        if copies == 0:
            continue
        for value in range(start, start + group_size):
            # Require and consume copies from this consecutive value.
            pass

    return True`,
    cases: {
      visibleExample: {
        input: { cards: [1, 2, 2, 3, 3, 4], groupSize: 3 },
        expected: true,
      },
      hiddenBoundary: {
        input: { cards: [], groupSize: 4 },
        expected: true,
      },
      hiddenAdversarial: {
        input: { cards: [1, 2, 3, 5, 6, 7, 7, 8], groupSize: 4 },
        expected: false,
      },
    },
    hints: [
      'Set copies = counts[start] before consuming.',
      'If counts[value] < copies, return False.',
      'Otherwise subtract copies from counts[value].',
    ],
  },
})

export const problemLesson = createProblemMission(handOfStraightsMissionSeed)

export default problemLesson
