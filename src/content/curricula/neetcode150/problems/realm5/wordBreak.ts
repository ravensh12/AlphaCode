import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const wordBreakMissionSeed = buildRealm5Mission({
  slug: 'word-break',
  estimatedMinutes: 23,
  mission: {
    title: 'The Run-Together Radio Phrase',
    context:
      'A compact radio drops spaces from a message. Its onboard glossary lists the allowed code words, and a glossary word may be reused.',
    prompt:
      'Return whether the entire message can be split completely into glossary words with no leftover characters.',
  },
  objective:
    'Mark reachable prefix boundaries by extending earlier reachable boundaries with glossary words.',
  priorKnowledge: [
    'A split point separates a solved prefix from a candidate final word.',
    'A set can test glossary membership quickly.',
  ],
  recognitionCue:
    'A string must be segmented completely using reusable pieces from a fixed collection.',
  misconception:
    'Taking the longest matching word first can strand a suffix even when a different earlier split succeeds.',
  algorithmSteps: [
    {
      id: 'seed-empty-message',
      instruction: 'Mark the empty prefix boundary as reachable.',
    },
    {
      id: 'scan-prefix-ends',
      instruction: 'Process each possible ending boundary from left to right.',
    },
    {
      id: 'try-earlier-boundaries',
      instruction: 'Try every earlier boundary that is already reachable.',
    },
    {
      id: 'mark-valid-extension',
      instruction:
        'If the slice between the boundaries is in the glossary, mark the new ending reachable.',
    },
    {
      id: 'return-final-boundary',
      instruction: 'Return whether the boundary after the final character is reachable.',
    },
  ],
  complexity: {
    time: 'O(n^3) with ordinary slicing',
    space: 'O(n)',
    explanation:
      'There are O(n²) boundary pairs and building a slice can cost O(n); the reachability table has n + 1 entries.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [['T', 'F', 'F', 'T', 'F', 'F', 'F', 'T', 'F', 'F', 'T']],
    rowLabels: ['reachable'],
    columnLabels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    highlightedCells: [
      { row: 0, column: 3, label: 'sun' },
      { row: 0, column: 7, label: 'rise' },
      { row: 0, column: 10, label: 'sun' },
    ],
    dependencyCells: [
      { row: 0, column: 0 },
      { row: 0, column: 7 },
    ],
  },
  workedExample: {
    prompt:
      'For "sunrisesun" with glossary {"sun", "rise"}, boundaries 0, 3, 7, and 10 become reachable, so the whole message can be spaced.',
    code: [
      'reachable = [True] + [False] * len(message)',
      'for end in range(1, len(message) + 1):',
      '    for start in range(end):',
      '        if reachable[start] and message[start:end] in glossary:',
      '            reachable[end] = True',
      '            break',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Boundary 0 is reachable before reading characters.',
      'Slice message[0:3] is "sun", so boundary 3 becomes reachable.',
      'Slice message[3:7] is "rise", so boundary 7 becomes reachable.',
      'The last "sun" reaches boundary 10, making the answer true.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan can recover from a glossary word that looks useful now but leaves an impossible suffix?',
    correct:
      'Record every reachable prefix boundary and test words extending from those boundaries.',
    distractors: [
      'Always remove the longest glossary prefix.',
      'Remember only whether the previous character ended a word.',
      'Generate every possible placement of spaces before checking words.',
    ],
    hint: 'A successful split may need a shorter word at an earlier boundary.',
  },
  retrievalCheck: {
    prompt:
      'When may reachable[end] become true using an earlier boundary start?',
    acceptedAnswers: [
      'reachable[start] is true and message[start:end] is in the glossary',
      'reachable[start] and message[start:end] in glossary',
      'reachable[start] and message[start:end] in tokens',
      'reachable[start] is true and message[start:end] is a glossary word',
      'the prefix to start is reachable and the slice start to end is a word',
      'reachable start plus a glossary slice',
    ],
    placeholder: 'Type both conditions',
    hint: 'Both the old prefix and the new final piece must be valid.',
  },
  reconstructionPrompt:
    'Put the prefix-boundary segmentation scan back in order.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains message and tokens, a list of nonempty strings. Return true when message can be fully segmented using tokens any number of times.',
    starterCode: `def solve(data):
    message = data["message"]
    tokens = set(data["tokens"])
    reachable = [True] + [False] * len(message)

    for end in range(1, len(message) + 1):
        for start in range(end):
            if reachable[start] and message[start:end] in tokens:
                # Mark this boundary and stop trying earlier starts.
                pass

    return reachable[len(message)]`,
    cases: {
      visibleExample: {
        input: { message: 'sunrisesun', tokens: ['sun', 'rise'] },
        expected: true,
      },
      hiddenBoundary: {
        input: { message: '', tokens: ['echo'] },
        expected: true,
      },
      hiddenAdversarial: {
        input: { message: 'trailtrailx', tokens: ['trail', 'tr', 'ail'] },
        expected: false,
      },
    },
    hints: [
      'The empty prefix is reachable.',
      'Set reachable[end] = True when both conditions hold.',
      'Break the inner loop once an ending is known reachable.',
    ],
  },
})

export const problemLesson = createProblemMission(wordBreakMissionSeed)

export default problemLesson
