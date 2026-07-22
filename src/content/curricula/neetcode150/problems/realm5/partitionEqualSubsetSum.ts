import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const partitionEqualSubsetSumMissionSeed = buildRealm5Mission({
  slug: 'partition-equal-subset-sum',
  estimatedMinutes: 24,
  mission: {
    title: 'The Balanced Cargo Sleds',
    context:
      'A polar team must divide supply crates between two sleds. Every crate goes on exactly one sled, and the two total weights must match.',
    prompt:
      'Return whether the list of nonnegative crate weights can be split into two groups with equal total weight.',
  },
  objective:
    'Reduce equal partitioning to a subset-sum target and track which partial sums are reachable.',
  priorKnowledge: [
    'Equal groups must each hold half of the total weight.',
    'Each crate can contribute to a chosen subset at most once.',
  ],
  recognitionCue:
    'A collection must be divided into two equal totals, which is equivalent to finding one subset worth half the sum.',
  misconception:
    'Updating sums from low to high in one array can reuse the same crate multiple times.',
  algorithmSteps: [
    {
      id: 'reject-odd-total',
      instruction: 'Add all weights and return false immediately when the total is odd.',
    },
    {
      id: 'set-half-target',
      instruction: 'Set the subset target to half of the even total.',
    },
    {
      id: 'seed-zero-sum',
      instruction: 'Mark sum zero reachable before processing crates.',
    },
    {
      id: 'extend-with-each-crate',
      instruction:
        'For each crate, add it to sums reachable before that crate, keeping results at most the target.',
    },
    {
      id: 'return-target-reachability',
      instruction: 'Return whether the half-total target is reachable.',
    },
  ],
  complexity: {
    time: 'O(n × target)',
    space: 'O(target)',
    explanation:
      'Each weight can update at most target + 1 reachability states, which are stored once.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      ['T', 'F', 'T', 'F', 'T', 'T', 'T', 'T', 'F', 'T'],
    ],
    rowLabels: ['sum', 'reachable'],
    columnLabels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    highlightedCells: [{ row: 1, column: 9, label: '2 + 7' }],
    dependencyCells: [
      { row: 1, column: 2 },
      { row: 1, column: 7 },
    ],
  },
  workedExample: {
    prompt:
      'Weights [2, 7, 4, 5] total 18, so the target is 9. After processing 2 and 7, sum 9 is reachable, proving the remaining crates also total 9.',
    code: [
      'target = sum(weights) // 2',
      'reachable = {0}',
      'for weight in weights:',
      '    additions = {old + weight for old in reachable if old + weight <= target}',
      '    reachable |= additions',
      'return target in reachable',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The even total 18 creates half-target 9.',
      'Crate 2 changes reachable sums from {0} to {0, 2}.',
      'Crate 7 adds sums 7 and 9 using the old states.',
      'Because 9 is reachable, the crates can be split evenly.',
    ],
  },
  patternCheck: {
    prompt:
      'Which plan uses each crate at most once while searching for half the total?',
    correct:
      'Extend a snapshot of earlier reachable sums with each crate, then merge the new sums.',
    distractors: [
      'Place each next crate on the currently lighter sled.',
      'Update low sums in place and allow newly made sums to reuse the same crate.',
      'Generate every division of crates into two labeled groups.',
    ],
    hint: 'New sums for one crate must come only from states that existed before that crate.',
  },
  retrievalCheck: {
    prompt:
      'After confirming an even total, what single target must the reachable-sum state find?',
    acceptedAnswers: [
      'total // 2',
      'total / 2',
      'total//2',
      'total/2',
      'half the total',
      'half of the total',
      'half the total weight',
      'sum(weights) / 2',
      'sum(weights) // 2',
    ],
    placeholder: 'Type the target',
    hint: 'If one group has this weight, the remaining group has the same weight.',
  },
  reconstructionPrompt:
    'Rebuild the equal-sled check from parity rejection through one-use subset updates.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains weights, a list of nonnegative integers. Return true when all weights can be divided into two equal-sum groups.',
    starterCode: `def solve(data):
    weights = data["weights"]
    total = sum(weights)
    if total % 2 == 1:
        return False

    target = total // 2
    reachable = {0}
    for weight in weights:
        # Add this weight to a snapshot of prior sums.
        pass

    return target in reachable`,
    cases: {
      visibleExample: {
        input: { weights: [2, 7, 4, 5] },
        expected: true,
      },
      hiddenBoundary: { input: { weights: [] }, expected: true },
      hiddenAdversarial: {
        input: { weights: [2, 2, 3, 5] },
        expected: false,
      },
    },
    hints: [
      'An odd total cannot split evenly.',
      'Build additions from the current reachable set before merging.',
      'Ignore sums greater than target.',
    ],
  },
})

export const problemLesson = createProblemMission(
  partitionEqualSubsetSumMissionSeed,
)

export default problemLesson
