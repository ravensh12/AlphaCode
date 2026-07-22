import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const partitionLabelsMissionSeed = buildRealm5Mission({
  slug: 'partition-labels',
  estimatedMinutes: 21,
  mission: {
    title: 'The One-Crate Symbol Rule',
    context:
      'A printer sends one string of package symbols. Workers must cut it into as many consecutive crates as possible, but every distinct symbol must appear in only one crate.',
    prompt:
      'Return the crate lengths in left-to-right order.',
  },
  objective:
    'Track the farthest last occurrence required by the current segment and cut exactly when the scan reaches it.',
  priorKnowledge: [
    'A segment containing a symbol must extend through that symbol’s final occurrence.',
    'Cutting at the earliest safe boundary maximizes the number of segments.',
  ],
  recognitionCue:
    'A string must be partitioned so all copies of each character stay together while producing as many parts as possible.',
  misconception:
    'Cutting after a character’s own last occurrence is unsafe if an earlier character extends farther.',
  algorithmSteps: [
    {
      id: 'record-last-positions',
      instruction: 'Map every symbol to its final index in the string.',
    },
    {
      id: 'start-first-segment',
      instruction: 'Initialize the current segment start and required end at zero.',
    },
    {
      id: 'scan-and-extend-end',
      instruction: 'At each index, extend required end to the symbol’s last position.',
    },
    {
      id: 'cut-at-required-end',
      instruction:
        'When the scan index equals required end, record the segment length and start a new segment.',
    },
    {
      id: 'return-segment-lengths',
      instruction: 'Return all recorded lengths.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(a)',
    explanation:
      'Two linear scans build last positions and form segments; the map stores a distinct symbols.',
  },
  diagram: {
    kind: 'grid',
    variant: 'grid',
    cells: [
      ['a', 'b', 'a', 'c', 'd', 'd', 'b', 'e'],
      [2, 6, 2, 3, 5, 5, 6, 7],
      [2, 6, 6, 6, 6, 6, 6, 7],
    ],
    rowLabels: ['symbol', 'its last index', 'segment end'],
    columnLabels: ['0', '1', '2', '3', '4', '5', '6', '7'],
    highlightedCells: [
      { row: 2, column: 6, label: 'cut length 7' },
      { row: 2, column: 7, label: 'cut length 1' },
    ],
  },
  workedExample: {
    prompt:
      'For "abacddbe", symbol b stretches the first crate through index 6. The final e stands alone, so the lengths are [7, 1].',
    code: [
      'last = {symbol: i for i, symbol in enumerate(text)}',
      'start = end = 0',
      'for i, symbol in enumerate(text):',
      '    end = max(end, last[symbol])',
      '    if i == end:',
      '        lengths.append(end - start + 1)',
      '        start = i + 1',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'At a, the required end is index 2.',
      'At b, the required end expands to index 6.',
      'No symbol before index 6 extends beyond it, so the first cut has length 7.',
      'Symbol e ends at index 7, creating a final length-1 segment.',
    ],
  },
  patternCheck: {
    prompt:
      'When is the earliest safe place to close the current symbol crate?',
    correct:
      'When the scan reaches the maximum last occurrence of every symbol seen in the segment.',
    distractors: [
      'Whenever the current symbol will not appear again.',
      'After every repeated symbol’s first pair.',
      'Generate every set of cut positions and validate all segments.',
    ],
    hint: 'The segment owns every symbol it has seen, not just the current one.',
  },
  retrievalCheck: {
    prompt:
      'Complete the frontier update at symbol ch: end = max(end, ______).',
    acceptedAnswers: [
      'last[ch]',
      'last[symbol]',
      'the last occurrence of ch',
      'the last index of ch',
      'last position of the current symbol',
      'the final index of the current symbol',
    ],
    placeholder: 'Type the last-position lookup',
    hint: 'The current segment must contain every later copy of ch.',
  },
  reconstructionPrompt:
    'Order the maximal-partition scan from last-position mapping through each safe cut.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains text, a lowercase string. Return the lengths of the maximum number of contiguous parts such that each character occurs in at most one part.',
    starterCode: `def solve(data):
    text = data["text"]
    last = {symbol: index for index, symbol in enumerate(text)}
    lengths = []
    start = 0
    end = 0

    for index, symbol in enumerate(text):
        end = max(end, last[symbol])
        if index == end:
            # Record this closed part and move start.
            pass

    return lengths`,
    cases: {
      visibleExample: { input: { text: 'abacddbe' }, expected: [7, 1] },
      hiddenBoundary: { input: { text: '' }, expected: [] },
      hiddenAdversarial: {
        input: { text: 'xyxzzwvuuw' },
        expected: [3, 2, 5],
      },
    },
    hints: [
      'Append end - start + 1 at a safe boundary.',
      'Then set start = index + 1.',
      'The running end is the maximum last occurrence seen in the current part.',
    ],
  },
})

export const problemLesson = createProblemMission(partitionLabelsMissionSeed)

export default problemLesson
