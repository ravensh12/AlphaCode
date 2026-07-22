import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const houseRobberIiMissionSeed = buildRealm5Mission({
  slug: 'house-robber-ii',
  estimatedMinutes: 24,
  mission: {
    title: 'The Ring of Moonlight Lockers',
    context:
      'Supply lockers now form a ring around a lunar landing pad. Neighboring lockers share alarms, so the first and last lockers also conflict.',
    prompt:
      'Return the greatest credit total that can be collected from the circular row without opening two neighboring lockers.',
  },
  objective:
    'Break one circular conflict into two linear take-or-skip problems and keep the better result.',
  priorKnowledge: [
    'A straight row can be solved with rolling take-or-skip totals.',
    'Any valid choice must omit at least one of the first and last lockers.',
  ],
  recognitionCue:
    'A linear recurrence almost fits, but the two endpoints have one extra conflict because the input is circular.',
  misconception:
    'Running the straight-row algorithm once can choose both endpoints even though they are neighbors on the ring.',
  algorithmSteps: [
    {
      id: 'handle-short-ring',
      instruction: 'Return zero for no lockers and the lone value for one locker.',
    },
    {
      id: 'exclude-last-locker',
      instruction: 'Solve the straight row that includes the first locker but omits the last.',
    },
    {
      id: 'exclude-first-locker',
      instruction: 'Solve the straight row that omits the first locker but includes the last.',
    },
    {
      id: 'compare-ring-plans',
      instruction: 'Compare the best totals from the two valid linear plans.',
    },
    {
      id: 'return-ring-best',
      instruction: 'Return the larger circular-safe total.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Two linear scans each visit at most n lockers and each keeps two totals.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      [8, 2, 9, 3, 7],
      [8, 2, 9, 3, 'omit'],
      ['omit', 2, 9, 3, 7],
    ],
    rowLabels: ['ring', 'plan A', 'plan B'],
    columnLabels: ['0', '1', '2', '3', '4'],
    highlightedCells: [
      { row: 1, column: 4, label: 'no last' },
      { row: 2, column: 0, label: 'no first' },
    ],
    dependencyCells: [
      { row: 0, column: 0 },
      { row: 0, column: 4 },
    ],
  },
  workedExample: {
    prompt:
      'For ring [8, 2, 9, 3, 7], omitting the last locker gives 17, while omitting the first gives 16. The circular answer is 17.',
    code: [
      'def line_best(values):',
      '    two_back = one_back = 0',
      '    for value in values:',
      '        two_back, one_back = one_back, max(one_back, two_back + value)',
      '    return one_back',
      'return max(line_best(ring[:-1]), line_best(ring[1:]))',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'Plan A scans [8, 2, 9, 3] and safely chooses 8 + 9 = 17.',
      'Plan B scans [2, 9, 3, 7] and reaches 9 + 7 = 16.',
      'Every circular-safe set belongs to at least one of these plans.',
      'The larger plan total is 17.',
    ],
  },
  patternCheck: {
    prompt:
      'What is the smallest change that makes the straight-row recurrence safe for a ring?',
    correct:
      'Solve once without the last locker and once without the first, then take the larger total.',
    distractors: [
      'Solve the whole row and subtract the smaller endpoint only if both endpoints were chosen.',
      'Forget the endpoint conflict and keep the same single linear scan.',
      'Enumerate every circular subset before checking whether neighbors conflict.',
    ],
    hint: 'A valid solution cannot contain both endpoints.',
  },
  retrievalCheck: {
    prompt:
      'Name the two linear ranges whose answers must be compared for a ring.',
    acceptedAnswers: [
      'all but the last and all but the first',
      'all but the first and all but the last',
      'ring[:-1] and ring[1:]',
      'ring[1:] and ring[:-1]',
      'credits[:-1] and credits[1:]',
      'credits[1:] and credits[:-1]',
      'exclude last and exclude first',
      'exclude first and exclude last',
      'exclude the last and exclude the first',
    ],
    placeholder: 'Type both ranges',
    hint: 'Each range removes one side of the endpoint conflict.',
  },
  reconstructionPrompt:
    'Order the circular reduction from short-ring handling through the two linear scans.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains credits, a circular list of nonnegative locker values. Return the largest sum from positions that are not neighbors on the ring.',
    starterCode: `def solve(data):
    credits = data["credits"]
    if not credits:
        return 0
    if len(credits) == 1:
        return credits[0]

    def line_best(values):
        two_back = one_back = 0
        for value in values:
            # Apply the linear take-or-skip transition.
            pass
        return one_back

    return max(line_best(credits[:-1]), line_best(credits[1:]))`,
    cases: {
      visibleExample: { input: { credits: [8, 2, 9, 3, 7] }, expected: 17 },
      hiddenBoundary: { input: { credits: [6] }, expected: 6 },
      hiddenAdversarial: { input: { credits: [5, 1, 1, 5] }, expected: 6 },
    },
    hints: [
      'Keep the empty and one-locker cases separate.',
      'The helper uses current = max(one_back, two_back + value).',
      'Compare the helper on credits[:-1] and credits[1:].',
    ],
  },
})

export const problemLesson = createProblemMission(houseRobberIiMissionSeed)

export default problemLesson
