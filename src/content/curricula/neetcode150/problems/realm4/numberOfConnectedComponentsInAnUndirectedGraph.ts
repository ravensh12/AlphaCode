import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const numberOfConnectedComponentsInAnUndirectedGraphMissionSeed =
  createRealm4MissionSeed({
    slug: 'number-of-connected-components-in-an-undirected-graph',
    estimatedMinutes: 23,
    mission: {
      title: 'The Radio Club Circles',
      context:
        'Students have numbered radios and two-way links. Any radios joined directly or through other students belong to one communication circle.',
      prompt:
        'Count the separate communication circles, including radios with no links.',
    },
    objective:
      'Count undirected components by starting with one per node and decrementing after each successful union.',
    priorKnowledge: [
      'Union-find represents each connected component by one root.',
      'A union changes the component count only when roots differ.',
      'Isolated nodes begin and remain their own components.',
    ],
    recognitionCue:
      'The task asks how many groups remain after undirected links merge nodes transitively.',
    misconception:
      'Subtracting one for every listed link fails on duplicate links, self-links, and links inside an existing component.',
    keyRule:
      'Initialize components to n and decrement only when a link joins two different roots.',
    algorithmSteps: [
      { id: 'open-components', instruction: 'Initialize each radio as its own root and set components to the radio count.' },
      { id: 'find-first-root', instruction: 'Find the compressed root of the link’s first endpoint.' },
      { id: 'find-second-root', instruction: 'Find the compressed root of the second endpoint.' },
      { id: 'skip-same-root', instruction: 'Do nothing when both endpoints already share a root.' },
      { id: 'union-roots', instruction: 'Join different roots using size or rank.' },
      { id: 'decrement-components', instruction: 'Decrease the component count once for that successful merge.' },
      { id: 'return-components', instruction: 'Return the final component count.' },
    ],
    complexity: {
      time: 'O((v + e) α(v))',
      space: 'O(v)',
      explanation:
        'Each link performs nearly constant amortized find and union operations; parent and size arrays use one entry per radio.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'r0', label: '0', parentId: 'r0', size: 3 },
          { id: 'r1', label: '1', parentId: 'r0' },
          { id: 'r2', label: '2', parentId: 'r0' },
          { id: 'r3', label: '3', parentId: 'r3', size: 4 },
          { id: 'r4', label: '4', parentId: 'r3' },
          { id: 'r5', label: '5', parentId: 'r3' },
          { id: 'r6', label: '6', parentId: 'r3' },
        ],
        highlightedNodeIds: ['r0', 'r3'],
      },
    },
    workedExample: {
      prompt:
        'Seven radios start as seven circles. Five useful links merge 0-1-2 into one circle and 3-4-5-6 into another, leaving two.',
      code: [
        'components = 7',
        'union 0-1 and 1-2 -> components 5',
        'union 3-4 and 5-6 -> components 3',
        'union 4-5 joins those two groups -> components 2',
        'return 2',
      ],
      currentLineIndex: 3,
      walkthrough: [
        'Each successful union reduces the number of roots by one.',
        'Transitive links place 0, 1, and 2 under one root.',
        'The link 4-5 connects two previously separate pairs.',
        'Two distinct roots remain after all links are processed.',
      ],
      diagram: {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'a', label: 'circle A', parentId: 'a', size: 3 },
          { id: 'a1', label: '1', parentId: 'a' },
          { id: 'a2', label: '2', parentId: 'a' },
          { id: 'b', label: 'circle B', parentId: 'b', size: 4 },
          { id: 'b1', label: '4', parentId: 'b' },
          { id: 'b2', label: '5', parentId: 'b' },
          { id: 'b3', label: '6', parentId: 'b' },
        ],
        highlightedNodeIds: ['a', 'b'],
      },
    },
    patternCheck: {
      prompt:
        'A duplicate radio link connects two endpoints already under one root. How should the component count change?',
      options: [
        { id: 'no-change', label: 'Do not change it because no components were merged.' },
        { id: 'subtract-one', label: 'Subtract one for every listed link.' },
        { id: 'add-one', label: 'Add one because the link is duplicated.' },
        { id: 'reset-count', label: 'Reset the count to the number of roots before processing.' },
      ],
      correctOptionId: 'no-change',
      diagram: {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'a', label: 'A', parentId: 'r' },
          { id: 'b', label: 'B', parentId: 'r' },
          { id: 'r', label: 'shared root', parentId: 'r' },
        ],
        highlightedNodeIds: ['a', 'b'],
      },
    },
    retrievalCheck: {
      prompt:
        'Complete the counting rule: decrement components only when ______.',
      acceptedAnswers: [
        'two different roots are joined',
        'a union successfully merges separate components',
        'the endpoint roots differ',
        'the roots differ',
        'the two roots are different',
        'a link joins two different roots',
        'the union merges two different components',
        'the roots are different',
      ],
      placeholder: 'Type the successful-merge condition',
      diagram: {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'a', label: 'root A', parentId: 'a' },
          { id: 'b', label: 'root B', parentId: 'b' },
        ],
        highlightedNodeIds: ['a', 'b'],
      },
    },
    reconstructionCheck: {
      prompt:
        'Restore the circle counter: initialize roots and count, find both roots, skip equal roots, union different roots, decrement, return.',
      diagram: {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'x', label: 'X', parentId: 'x' },
          { id: 'y', label: 'Y', parentId: 'y' },
        ],
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read data["radios"] and undirected data["links"] pairs. Return the number of connected components, counting isolated radios.',
      starterCode: `def solve(data):
    count = data["radios"]
    parent = list(range(count))
    size = [1] * count
    components = count

    def find(node):
        # Return a path-compressed root.
        pass

    # Union links and decrement only on a real merge.
    return components`,
      cases: {
        visibleExample: {
          input: {
            radios: 7,
            links: [
              [0, 1],
              [1, 2],
              [3, 4],
              [5, 6],
              [4, 5],
            ],
          },
          expected: 2,
        },
        hiddenBoundary: {
          input: { radios: 0, links: [] },
          expected: 0,
        },
        hiddenAdversarial: {
          input: {
            radios: 4,
            links: [
              [0, 1],
              [1, 0],
              [2, 2],
            ],
          },
          expected: 3,
        },
      },
      diagram: {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'r0', label: '0', parentId: 'r0', size: 2 },
          { id: 'r1', label: '1', parentId: 'r0' },
          { id: 'r2', label: '2 alone', parentId: 'r2' },
          { id: 'r3', label: '3 alone', parentId: 'r3' },
        ],
        highlightedNodeIds: ['r2', 'r3'],
      },
    },
  } as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(
  numberOfConnectedComponentsInAnUndirectedGraphMissionSeed,
)

export default problemLesson
