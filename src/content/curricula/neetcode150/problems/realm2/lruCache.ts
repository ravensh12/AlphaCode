import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const lruCacheMissionSeed = createRealm2MissionSeed({
  slug: 'lru-cache',
  estimatedMinutes: 30,
  mission: {
    title: 'The Tiny Robot Parts Locker',
    context:
      'A repair robot keeps only a few labeled parts in a fast locker. Reading or replacing a part makes it recently used; when full, the locker must discard the part untouched for the longest time.',
    prompt:
      'Process get and put operations with constant-time average work. Return each get result, using -1 when a key is absent.',
  },
  objective:
    'Combine a key-to-node map with a doubly linked recency list for O(1) lookup, movement, and eviction.',
  priorKnowledge: [
    'A hash map provides expected constant-time key lookup.',
    'A doubly linked node can be removed when its identity is known.',
    'Sentinel nodes remove empty-list edge cases.',
  ],
  recognitionCue:
    'The structure needs both direct key access and an ordering that changes after every successful access.',
  misconception:
    'A successful get must move its node to most-recent position; returning the value alone leaves eviction order stale.',
  keyRule:
    'Keep least-recent nodes beside the left sentinel and most-recent beside the right; every get or put moves its node right, and overflow removes left.next.',
  algorithmSteps: [
    {
      id: 'initialize-cache',
      instruction:
        'Create a node map and linked left/right sentinels for recency order.',
    },
    {
      id: 'handle-cache-get',
      instruction:
        'On get, return -1 if missing; otherwise remove the node, insert it most-recent, and record its value.',
    },
    {
      id: 'remove-existing-put',
      instruction: 'On put of an existing key, remove its old node.',
    },
    {
      id: 'insert-recent-put',
      instruction:
        'Create or update the node, map it, and insert it beside the right sentinel.',
    },
    {
      id: 'evict-overflow',
      instruction:
        'If size exceeds capacity, remove left.next and delete its map entry.',
    },
    {
      id: 'return-get-results',
      instruction: 'Return all get results in operation order.',
    },
  ],
  complexity: {
    time: 'O(1) expected per operation',
    space: 'O(capacity)',
    explanation:
      'The map finds nodes directly and the doubly linked list moves or removes known nodes with constant pointer updates.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'linkedList',
      head: 'k2',
      nodes: [
        { id: 'k2', value: '2:B (LRU)', next: 'k1' },
        { id: 'k1', value: '1:A (MRU)', next: null },
      ],
      pointers: [
        { nodeId: 'k2', label: 'left.next' },
        { nodeId: 'k1', label: 'right.prev' },
      ],
    },
  },
  workedExample: {
    prompt:
      'At capacity 2, put 1:A and 2:B. Getting 1 moves it to the recent end. Putting 3:C then evicts key 2, not key 1.',
    code: [
      'put 1:A -> order [1]',
      'put 2:B -> order [1, 2]',
      'get 1 -> A; order [2, 1]',
      'put 3:C -> temporary order [2, 1, 3]',
      'evict leftmost key 2 -> order [1, 3]',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The linked order runs from least recent to most recent.',
      'The map finds key 1 without scanning.',
      'Removing and reinserting node 1 records its access.',
      'Overflow always evicts the real node immediately after the left sentinel.',
    ],
    diagram: {
      kind: 'linkedList',
      head: 'k1',
      nodes: [
        { id: 'k1', value: '1:A (LRU)', next: 'k3' },
        { id: 'k3', value: '3:C (MRU)', next: null },
      ],
      pointers: [
        { nodeId: 'k1', label: 'left.next' },
        { nodeId: 'k3', label: 'right.prev' },
      ],
      highlightedNodeIds: ['k3'],
    },
  },
  patternCheck: {
    prompt:
      'Why are both a hash map and a doubly linked list needed?',
    options: [
      {
        id: 'lookup-and-order',
        label:
          'The map finds a key directly; the list updates and evicts by recency.',
      },
      {
        id: 'duplicate-storage',
        label: 'Both structures do the same job, but duplication prevents errors.',
      },
      {
        id: 'sort-values',
        label: 'The map sorts values while the list sorts keys.',
      },
      {
        id: 'count-only',
        label: 'The map stores only capacity and the list stores only size.',
      },
    ],
    correctOptionId: 'lookup-and-order',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 'oldest', next: 'b' },
        { id: 'b', value: 'newest', next: null },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'After a successful get, where must that node move in the recency list?',
    acceptedAnswers: [
      'to the most recent end',
      'beside the right sentinel',
      'to the MRU position',
      'the most recent end',
      'the most recent position',
      'to the most recent position',
      'the mru position',
      'next to the right sentinel',
    ],
    placeholder: 'Type the destination',
    diagram: {
      kind: 'linkedList',
      head: 'old',
      nodes: [
        { id: 'old', value: 'LRU', next: 'new' },
        { id: 'new', value: 'MRU', next: null },
      ],
    },
  },
  reconstructionCheck: {
    prompt:
      'Rebuild cache behavior from sentinels and map through get movement, put replacement, recent insertion, overflow eviction, and outputs.',
    diagram: {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 'least recent', next: 'b' },
        { id: 'b', value: 'most recent', next: null },
      ],
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). data["capacity"] is positive. Operations are ["put", key, value] or ["get", key]. Return one value per get, using -1 for misses.',
    starterCode: `class Node:
    def __init__(self, key=None, value=None):
        self.key = key
        self.value = value
        self.prev = None
        self.next = None

def solve(data):
    capacity = data["capacity"]
    nodes = {}
    left, right = Node(), Node()
    left.next, right.prev = right, left
    answers = []

    def remove(node):
        # Unlink one known node.
        pass

    def insert_recent(node):
        # Insert just before the right sentinel.
        pass

    for operation in data["operations"]:
        # Process get or put and evict left.next after overflow.
        pass

    return answers`,
    cases: {
      visibleExample: {
        input: {
          capacity: 2,
          operations: [
            ['put', 1, 'A'],
            ['put', 2, 'B'],
            ['get', 1],
            ['put', 3, 'C'],
            ['get', 2],
            ['get', 3],
          ],
        },
        expected: ['A', -1, 'C'],
      },
      hiddenBoundary: {
        input: {
          capacity: 1,
          operations: [
            ['put', 'x', 7],
            ['get', 'x'],
            ['put', 'y', 8],
            ['get', 'x'],
            ['get', 'y'],
          ],
        },
        expected: [7, -1, 8],
      },
      hiddenAdversarial: {
        input: {
          capacity: 2,
          operations: [
            ['put', 'a', 1],
            ['put', 'b', 2],
            ['put', 'a', 9],
            ['put', 'c', 3],
            ['get', 'a'],
            ['get', 'b'],
            ['get', 'c'],
          ],
        },
        expected: [9, -1, 3],
      },
    },
    diagram: {
      kind: 'linkedList',
      head: 'k1',
      nodes: [
        { id: 'k1', value: '1:A', next: 'k3' },
        { id: 'k3', value: '3:C', next: null },
      ],
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(lruCacheMissionSeed)

export default problemLesson
