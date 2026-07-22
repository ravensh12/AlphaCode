import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const jumpGameIiMissionSeed = buildRealm5Mission({
  slug: 'jump-game-ii',
  estimatedMinutes: 22,
  mission: {
    title: 'The Fewest Launches Route',
    context:
      'A rover crosses numbered launch pads. A pad allows any forward jump up to its printed limit, and the final pad is guaranteed reachable.',
    prompt:
      'Return the minimum number of jumps needed to reach the final pad.',
  },
  objective:
    'Scan reachable pads in greedy jump layers, committing a jump only when the current layer ends.',
  priorKnowledge: [
    'All positions reachable with the same number of jumps form a scan interval.',
    'The next jump layer ends at the farthest reach from any position in the current layer.',
  ],
  recognitionCue:
    'Forward jump ranges are guaranteed to reach the goal, and the task minimizes the number of jumps.',
  misconception:
    'Jumping immediately from the pad with the largest printed number ignores that pad’s position and may not maximize actual reach.',
  algorithmSteps: [
    {
      id: 'seed-first-layer',
      instruction: 'Initialize jumps, current-layer end, and farthest next reach to zero.',
    },
    {
      id: 'scan-before-goal',
      instruction: 'Scan indices only through the position before the goal.',
    },
    {
      id: 'extend-next-layer',
      instruction: 'Update the farthest next reach with index plus its jump limit.',
    },
    {
      id: 'commit-at-layer-end',
      instruction:
        'When the scan reaches the current-layer end, count one jump and move the layer end to farthest.',
    },
    {
      id: 'return-jump-count',
      instruction: 'Return the committed jump count.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'The layer scan visits each pre-goal pad once and stores three integers.',
  },
  diagram: {
    kind: 'array',
    values: [3, 1, 2, 1, 1, 2],
    highlight: 3,
    pointers: [
      { index: 3, label: 'layer 1 ends' },
      { index: 4, label: 'layer 2 reaches' },
      { index: 5, label: 'goal' },
    ],
    visited: [0, 1, 2],
  },
  workedExample: {
    prompt:
      'For boosts [3, 1, 2, 1, 1, 2], jump layers end at indices 3, 4, and 5. Reaching those three boundaries takes three jumps.',
    code: [
      'jumps = layer_end = farthest = 0',
      'for index in range(len(boosts) - 1):',
      '    farthest = max(farthest, index + boosts[index])',
      '    if index == layer_end:',
      '        jumps += 1',
      '        layer_end = farthest',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'Index 0 defines the first layer, whose farthest reach is 3.',
      'Scanning indices 1 through 3 finds the next farthest reach, 4.',
      'The next layer reaches index 5.',
      'Three layer commitments reach the goal, so three jumps are minimum.',
    ],
  },
  patternCheck: {
    prompt:
      'Which greedy rule is equivalent to a breadth-first search over jump counts?',
    correct:
      'Scan every pad in the current reachable interval, then commit one jump to its farthest combined reach.',
    distractors: [
      'Jump from the current pad to the next pad with the largest boost value.',
      'Remember only the farthest reach and increment jumps at every scanned pad.',
      'Generate every reachable jump sequence and compare lengths.',
    ],
    hint: 'Do not choose the next landing pad; summarize the whole next layer.',
  },
  retrievalCheck: {
    prompt:
      'When exactly should the greedy scan increase the jump count?',
    acceptedAnswers: [
      'when index == layer_end',
      'index == layer_end',
      'index==layer_end',
      'when i == layer_end',
      'i == layer_end',
      'i==layer_end',
      'when index equals layer_end',
      'when index equals the layer end',
      'when the index equals the layer end',
      'when the scan reaches the current layer end',
      'at the end of each reachable jump layer',
    ],
    placeholder: 'Type the layer-boundary rule',
    hint: 'One jump advances from the current interval to the next interval.',
  },
  reconstructionPrompt:
    'Restore the jump-layer scan from zeroed boundaries through each committed frontier.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains boosts, a nonempty list of nonnegative jump limits whose last index is reachable. Return the minimum jump count.',
    starterCode: `def solve(data):
    boosts = data["boosts"]
    jumps = 0
    layer_end = 0
    farthest = 0

    for index in range(len(boosts) - 1):
        farthest = max(farthest, index + boosts[index])
        if index == layer_end:
            # Commit one jump to the completed layer's farthest reach.
            pass

    return jumps`,
    cases: {
      visibleExample: {
        input: { boosts: [3, 1, 2, 1, 1, 2] },
        expected: 3,
      },
      hiddenBoundary: { input: { boosts: [0] }, expected: 0 },
      hiddenAdversarial: {
        input: { boosts: [1, 1, 1, 1, 1] },
        expected: 4,
      },
    },
    hints: [
      'Increment jumps at a completed layer boundary.',
      'Then set layer_end = farthest.',
      'The loop stops before the goal so arrival does not count an extra jump.',
    ],
  },
})

export const problemLesson = createProblemMission(jumpGameIiMissionSeed)

export default problemLesson
