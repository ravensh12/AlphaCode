import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm4MissionSeed,
  type Realm4MissionSeedInput,
} from './missionSupport'

export const courseScheduleMissionSeed = createRealm4MissionSeed({
  slug: 'course-schedule',
  estimatedMinutes: 23,
  mission: {
    title: 'The Workshop Badge Plan',
    context:
      'A youth workshop numbers its skill badges from 0 upward. Some badges require another badge first, and the director needs to know whether every badge can eventually be earned.',
    prompt:
      'Given the badge count and [badge, requiredBadge] pairs, return whether the requirements contain no impossible cycle.',
  },
  objective:
    'Detect directed dependency cycles with three-state DFS.',
  priorKnowledge: [
    'A directed edge can represent a prerequisite relationship.',
    'A DFS path tracks the chain currently being explored.',
    'A completed node does not need to be searched again.',
  ],
  recognitionCue:
    'Tasks depend on other tasks, and the question asks whether all can be completed rather than requesting an order.',
  misconception:
    'Treating every previously visited node as a cycle incorrectly rejects two branches that safely merge.',
  keyRule:
    'Reaching a visiting node means a cycle; reaching a done node is safe, and a node becomes done only after all outgoing dependencies finish.',
  algorithmSteps: [
    { id: 'build-requirement-graph', instruction: 'Build a directed adjacency list for all badge numbers.' },
    { id: 'open-three-states', instruction: 'Mark every badge unvisited initially.' },
    { id: 'reject-active-return', instruction: 'During DFS, reject a badge already marked visiting.' },
    { id: 'reuse-done', instruction: 'Accept immediately when a badge is already done.' },
    { id: 'mark-visiting', instruction: 'Mark a new badge visiting before exploring its neighbors.' },
    { id: 'search-neighbors', instruction: 'Recursively check every badge that depends on it.' },
    { id: 'mark-done', instruction: 'Mark the badge done after all neighbors are safe.' },
    { id: 'check-all-badges', instruction: 'Run DFS from every badge and return false on any cycle; otherwise true.' },
  ],
  complexity: {
    time: 'O(v + e)',
    space: 'O(v + e)',
    explanation:
      'Each badge and requirement edge is explored once; adjacency, state, and recursion can store the graph and one path.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'b0', label: '0' },
        { id: 'b1', label: '1' },
        { id: 'b2', label: '2' },
        { id: 'b3', label: '3' },
        { id: 'b4', label: '4' },
      ],
      edges: [
        { id: 'e01', from: 'b0', to: 'b1' },
        { id: 'e02', from: 'b0', to: 'b2' },
        { id: 'e13', from: 'b1', to: 'b3' },
        { id: 'e23', from: 'b2', to: 'b3' },
        { id: 'e34', from: 'b3', to: 'b4' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Badge 0 unlocks 1 and 2; both feed badge 3, which unlocks 4. DFS finishes each branch without returning to an active badge.',
    code: [
      'visit 0 -> mark visiting',
      'visit 1 -> visit 3 -> visit 4 -> mark each done',
      'return to 0; visit 2',
      '2 reaches done badge 3, which is safe',
      'mark 2 and 0 done -> all badges possible',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The chain 0→1→3→4 ends, so those frames become done.',
      'The second branch 0→2 also points to 3.',
      'Because 3 is done rather than visiting, the merged branch is not a cycle.',
      'Every badge finishes safely, so the plan is possible.',
    ],
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'n0', label: '0 active' },
        { id: 'n2', label: '2 active' },
        { id: 'n3', label: '3 done' },
      ],
      edges: [
        { id: 'a', from: 'n0', to: 'n2' },
        { id: 'b', from: 'n2', to: 'n3' },
      ],
      highlightedNodeIds: ['n3'],
    },
  },
  patternCheck: {
    prompt:
      'DFS reaches a badge seen earlier. Which state proves there is a cycle?',
    options: [
      { id: 'visiting-state', label: 'The badge is visiting on the current DFS path.' },
      { id: 'done-state', label: 'The badge finished in an earlier branch.' },
      { id: 'unvisited-state', label: 'The badge has never been entered.' },
      { id: 'zero-number', label: 'The badge happens to be numbered zero.' },
    ],
    correctOptionId: 'visiting-state',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A visiting' },
        { id: 'b', label: 'B visiting' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'ba', from: 'b', to: 'a', label: 'back edge' },
      ],
      highlightedEdgeIds: ['ba'],
    },
  },
  retrievalCheck: {
    prompt:
      'When may a visiting badge change to done?',
    acceptedAnswers: [
      'after all of its neighbors finish safely',
      'after every outgoing dependency is checked',
      'when its DFS descendants contain no cycle',
      'after all its neighbors finish safely',
      'when all of its neighbors are done',
      'after all its neighbors are done',
      'when all its neighbors finish safely',
      'after all of its neighbors are checked',
    ],
    placeholder: 'State the completion rule',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'p', label: 'parent' },
        { id: 'c', label: 'child done' },
      ],
      edges: [{ id: 'pc', from: 'p', to: 'c' }],
      highlightedNodeIds: ['c'],
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the badge check: build graph, initialize states, reject visiting, reuse done, mark visiting, search neighbors, mark done, check all.',
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'x', label: 'requirement' },
        { id: 'y', label: 'badge' },
      ],
      edges: [{ id: 'xy', from: 'x', to: 'y' }],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["badgeCount"] and data["requirements"] pairs [badge, requiredBadge]. Return true exactly when every badge can be completed.',
    starterCode: `def solve(data):
    count = data["badgeCount"]
    requirements = data["requirements"]
    graph = [[] for _ in range(count)]
    state = [0] * count  # 0 unvisited, 1 visiting, 2 done

    # Build requiredBadge -> badge edges.
    def safe(badge):
        # Apply the three-state DFS rules.
        pass

    return all(safe(badge) for badge in range(count))`,
    cases: {
      visibleExample: {
        input: {
          badgeCount: 5,
          requirements: [
            [1, 0],
            [2, 0],
            [3, 1],
            [3, 2],
            [4, 3],
          ],
        },
        expected: true,
      },
      hiddenBoundary: {
        input: { badgeCount: 0, requirements: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: {
          badgeCount: 3,
          requirements: [
            [1, 0],
            [2, 1],
            [0, 2],
          ],
        },
        expected: false,
      },
    },
    diagram: {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'b0', label: '0' },
        { id: 'b1', label: '1' },
        { id: 'b2', label: '2' },
      ],
      edges: [
        { id: 'e01', from: 'b0', to: 'b1' },
        { id: 'e12', from: 'b1', to: 'b2' },
        { id: 'e20', from: 'b2', to: 'b0' },
      ],
      highlightedEdgeIds: ['e20'],
    },
  },
} as const satisfies Realm4MissionSeedInput)

export const problemLesson = createProblemMission(courseScheduleMissionSeed)

export default problemLesson
