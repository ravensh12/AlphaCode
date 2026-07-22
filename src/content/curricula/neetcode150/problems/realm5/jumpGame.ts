import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const jumpGameMissionSeed = buildRealm5Mission({
  slug: 'jump-game',
  estimatedMinutes: 19,
  mission: {
    title: 'The Launch-Pad Reach Test',
    context:
      'A rover stands on the first pad of a line. Each pad number is the greatest distance the rover may jump forward from that pad, and shorter jumps are allowed.',
    prompt:
      'Return whether the rover can reach the final pad.',
  },
  objective:
    'Maintain the farthest reachable frontier while scanning only positions inside that frontier.',
  priorKnowledge: [
    'Landing on a reachable pad makes every shorter destination up to its jump limit reachable.',
    'A position beyond the current frontier cannot be used.',
  ],
  recognitionCue:
    'Each position expands a forward reach interval, and the question asks only whether the goal is reachable.',
  misconception:
    'Always taking the longest possible jump can land on a dead pad even when a shorter jump keeps progress alive.',
  algorithmSteps: [
    {
      id: 'seed-start-frontier',
      instruction: 'Initialize the farthest reachable index to 0.',
    },
    {
      id: 'scan-pad-indices',
      instruction: 'Visit pad indices from left to right.',
    },
    {
      id: 'stop-at-gap',
      instruction: 'If an index is beyond the frontier, return false.',
    },
    {
      id: 'extend-reach',
      instruction: 'Extend the frontier with index plus that pad’s jump limit.',
    },
    {
      id: 'confirm-last-pad',
      instruction: 'Return true once the frontier reaches the final index.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each pad is inspected at most once and one frontier index is stored.',
  },
  diagram: {
    kind: 'array',
    values: [2, 0, 3, 0, 1],
    highlight: 2,
    pointers: [
      { index: 2, label: 'current' },
      { index: 4, label: 'frontier reaches goal' },
    ],
    visited: [0, 1],
  },
  workedExample: {
    prompt:
      'For pads [2, 0, 3, 0, 1], pad 0 reaches index 2. Pad 2 then extends the frontier beyond the final index, so the rover succeeds.',
    code: [
      'farthest = 0',
      'for index, boost in enumerate([2, 0, 3, 0, 1]):',
      '    if index > farthest: return False',
      '    farthest = max(farthest, index + boost)',
      '    if farthest >= 4: return True',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The start frontier is index 0.',
      'Pad 0 has boost 2, expanding the frontier through index 2.',
      'Pad 1 adds nothing but remains reachable.',
      'Pad 2 reaches index 5, which covers the goal at index 4.',
    ],
  },
  patternCheck: {
    prompt:
      'Which summary is enough to decide reachability without choosing one exact jump path?',
    correct:
      'Track the farthest index reachable from any pad scanned so far.',
    distractors: [
      'Always jump the full distance shown on the current pad.',
      'Remember only whether the previous pad was reachable.',
      'Generate every sequence of allowed jump lengths.',
    ],
    hint: 'Reachability from all scanned pads forms one covered prefix.',
  },
  retrievalCheck: {
    prompt:
      'What condition proves the scan has reached an impossible gap?',
    acceptedAnswers: [
      'index > farthest',
      'index>farthest',
      'i > farthest',
      'i>farthest',
      'the current index is beyond the farthest reachable index',
      'the index is greater than farthest',
      'current position exceeds the frontier',
      'the current index is past the frontier',
    ],
    placeholder: 'Type the gap condition',
    hint: 'A pad cannot extend the frontier unless the rover can land on it.',
  },
  reconstructionPrompt:
    'Order the frontier scan from the start index through gap detection and goal confirmation.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains boosts, a nonempty list of nonnegative jump limits. Return true when index 0 can reach the final index.',
    starterCode: `def solve(data):
    boosts = data["boosts"]
    farthest = 0

    for index, boost in enumerate(boosts):
        if index > farthest:
            return False
        # Extend the reachable frontier.
        pass
        if farthest >= len(boosts) - 1:
            return True

    return True`,
    cases: {
      visibleExample: {
        input: { boosts: [2, 0, 3, 0, 1] },
        expected: true,
      },
      hiddenBoundary: { input: { boosts: [0] }, expected: true },
      hiddenAdversarial: {
        input: { boosts: [2, 1, 0, 1, 3] },
        expected: false,
      },
    },
    hints: [
      'Use farthest = max(farthest, index + boost).',
      'Only reachable indices may extend the frontier.',
      'Success occurs when farthest covers len(boosts) - 1.',
    ],
  },
})

export const problemLesson = createProblemMission(jumpGameMissionSeed)

export default problemLesson
