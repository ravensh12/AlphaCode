import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const mergeTripletsToFormTargetTripletMissionSeed =
  buildRealm5Mission({
    slug: 'merge-triplets-to-form-target-triplet',
    estimatedMinutes: 21,
    mission: {
      title: 'The Three-Gauge Module Merge',
      context:
        'Each equipment module reports three gauge levels. Combining chosen modules keeps the maximum level seen on each gauge.',
      prompt:
        'Return whether some set of modules can combine to exactly the three requested target levels.',
    },
    objective:
      'Discard any module that overshoots a target coordinate, then merge all safe modules and check coordinate coverage.',
    priorKnowledge: [
      'Coordinatewise maximum never lowers a gauge.',
      'A module above the target in any coordinate can never be undone.',
    ],
    recognitionCue:
      'Any subset may be merged by coordinatewise maxima to reach one exact target tuple.',
    misconception:
      'A module that supplies one needed coordinate is still unusable if it overshoots another coordinate.',
    algorithmSteps: [
      {
        id: 'start-zero-gauges',
        instruction: 'Initialize three merged gauge levels to zero.',
      },
      {
        id: 'scan-modules',
        instruction: 'Inspect each three-value module.',
      },
      {
        id: 'discard-overshoot',
        instruction: 'Skip a module when any coordinate exceeds its target coordinate.',
      },
      {
        id: 'merge-safe-coordinates',
        instruction: 'For a safe module, take the coordinatewise maximum into the merged state.',
      },
      {
        id: 'compare-target-gauges',
        instruction: 'Return whether all three merged coordinates equal the target.',
      },
    ],
    complexity: {
      time: 'O(n)',
      space: 'O(1)',
      explanation:
        'Each module checks and merges three coordinates, and only three running maxima are stored.',
    },
    diagram: {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [5, 1, 2],
        [2, 4, 5],
        [3, 3, 6],
        [5, 4, 6],
      ],
      rowLabels: ['module A', 'module B', 'module C', 'merged target'],
      columnLabels: ['gauge x', 'gauge y', 'gauge z'],
      highlightedCells: [
        { row: 0, column: 0, label: 'supplies x' },
        { row: 1, column: 1, label: 'supplies y' },
        { row: 2, column: 2, label: 'supplies z' },
      ],
    },
    workedExample: {
      prompt:
        'Modules [5,1,2], [2,4,5], and [3,3,6] are all at or below target [5,4,6]. Their coordinatewise maximum equals the target.',
      code: [
        'merged = [0, 0, 0]',
        'for module in modules:',
        '    if any(module[i] > target[i] for i in range(3)):',
        '        continue',
        '    for i in range(3):',
        '        merged[i] = max(merged[i], module[i])',
        'return merged == target',
      ],
      currentLineIndex: 5,
      walkthrough: [
        'The first safe module raises gauge x to 5.',
        'The second raises gauge y to 4 and gauge z to 5.',
        'The third raises gauge z to 6.',
        'The merged gauges [5, 4, 6] exactly match the request.',
      ],
    },
    patternCheck: {
      prompt:
        'Which modules can be merged without risking an irreversible target overshoot?',
      correct:
        'Only modules whose every coordinate is at most the matching target coordinate.',
      distractors: [
        'Any module that matches at least one target coordinate.',
        'Only the single module with the largest coordinate sum.',
        'Generate every subset of modules and merge each subset.',
      ],
      hint: 'Coordinatewise maximum can increase a value but can never reduce it.',
    },
    retrievalCheck: {
      prompt:
        'State the safety test that a module (a, b, c) must pass before merging.',
      acceptedAnswers: [
        'a <= target[0] and b <= target[1] and c <= target[2]',
        'a<=target[0] and b<=target[1] and c<=target[2]',
        'every coordinate is less than or equal to the target',
        'every coordinate is at most the target',
        'each coordinate is at most its target coordinate',
        'no coordinate exceeds its target coordinate',
        'no coordinate is greater than its target coordinate',
      ],
      placeholder: 'Type the no-overshoot rule',
      hint: 'One excessive gauge makes the whole module unsafe.',
    },
    reconstructionPrompt:
      'Restore the module scan from zero gauges through overshoot filtering and target comparison.',
    pythonChallenge: {
      prompt:
        'Write solve(data). The JSON object contains pieces, a list of three-integer lists, and target, one three-integer list. Return true when a subset’s coordinatewise maximum equals target.',
      starterCode: `def solve(data):
    pieces = data["pieces"]
    target = data["target"]
    merged = [0, 0, 0]

    for piece in pieces:
        if any(piece[i] > target[i] for i in range(3)):
            continue
        # Merge all three safe coordinates.
        pass

    return merged == target`,
      cases: {
        visibleExample: {
          input: {
            pieces: [[5, 1, 2], [2, 4, 5], [3, 3, 6]],
            target: [5, 4, 6],
          },
          expected: true,
        },
        hiddenBoundary: {
          input: { pieces: [[1, 2, 3]], target: [1, 2, 3] },
          expected: true,
        },
        hiddenAdversarial: {
          input: {
            pieces: [[5, 5, 1], [4, 4, 6], [2, 3, 5]],
            target: [5, 4, 6],
          },
          expected: false,
        },
      },
      hints: [
        'Skip any piece with a coordinate above target.',
        'For safe pieces, update merged[i] = max(merged[i], piece[i]).',
        'All three merged coordinates must equal target at the end.',
      ],
    },
  })

export const problemLesson = createProblemMission(
  mergeTripletsToFormTargetTripletMissionSeed,
)

export default problemLesson
