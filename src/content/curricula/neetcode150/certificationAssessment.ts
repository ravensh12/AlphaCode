import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentId,
  type PythonCaseV1,
  type PythonComparatorV1,
} from '../../../types/assessment'
import type { SkillId, TrackId } from '../../../types/curriculum'
import type { Lesson, LessonStep } from '../../../types/lesson'
import type { LessonResult } from '../../../hooks/useLessonEngine'
import { EXAM_PASS_PERCENT } from '../../../lib/gauntletProgress'
import { NEETCODE_150_TRACKS } from './manifest'

type CertificationItemCommon = {
  id: string
  assessmentId: AssessmentId
  trackId: TrackId
  skillId: SkillId
  prompt: string
  code?: readonly string[]
  hint: string
  explanation: string
}

/** Typed free recall of the pattern or structure name — no options shown. */
export type CertificationRecognitionItem = CertificationItemCommon & {
  kind: 'pattern-recognition'
  acceptedAnswers: readonly [string, ...string[]]
  placeholder: string
}

export type CertificationTransferItem = CertificationItemCommon & {
  kind: 'open-transfer'
  acceptedAnswers: readonly [string, ...string[]]
  placeholder: string
}

/** A real full-problem Python solve graded by the in-browser judge. */
export type CertificationCodeItem = CertificationItemCommon & {
  kind: 'code-transfer'
  starterCode: string
  cases: readonly PythonCaseV1[]
  comparator?: PythonComparatorV1
}

export type CertificationBankItem =
  | CertificationRecognitionItem
  | CertificationTransferItem
  | CertificationCodeItem

type CertificationTrackBank = {
  trackId: TrackId
  recognition: CertificationRecognitionItem
  transfer: CertificationTransferItem
}

const itemIds = (trackId: TrackId) => ({
  recognition: `certification:${trackId}:recognition`,
  transfer: `certification:${trackId}:open-transfer`,
  code: `certification:${trackId}:code-transfer`,
  recognitionAssessment:
    `assessment:certification:${trackId}:recognition` as AssessmentId,
  transferAssessment:
    `assessment:certification:${trackId}:open-transfer` as AssessmentId,
  codeAssessment:
    `assessment:certification:${trackId}:code-transfer` as AssessmentId,
})

const CERTIFICATION_TRACK_BANK = [
  {
    trackId: 'arrays-hashing',
    recognition: {
      id: itemIds('arrays-hashing').recognition,
      assessmentId: itemIds('arrays-hashing').recognitionAssessment,
      trackId: 'arrays-hashing',
      skillId: 'skill:hash-membership',
      kind: 'pattern-recognition',
      prompt:
        'A museum scans wristband codes and must stop as soon as a code appears for the second time. Type the name of the data structure that answers "seen before?" in expected constant time.',
      acceptedAnswers: [
        'hash set',
        'set',
        'hashset',
        'a set',
        'a hash set',
        'hash table',
        'hashtable',
        'hash map',
        'hashmap',
        'dictionary',
        'dict',
      ],
      placeholder: 'structure name',
      hint:
        'The museum needs fast membership checks for everything already scanned.',
      explanation:
        'A hash set reports whether the current code was seen before in expected constant time.',
    },
    transfer: {
      id: itemIds('arrays-hashing').transfer,
      assessmentId: itemIds('arrays-hashing').transferAssessment,
      trackId: 'arrays-hashing',
      skillId: 'skill:frequency-map',
      kind: 'open-transfer',
      prompt:
        'After this complete scan, what number is stored for "teal"? Type the number.',
      code: [
        'colors = ["teal", "gold", "teal", "coral", "teal", "gold"]',
        'counts = {}',
        'for color in colors:',
        '    counts[color] = counts.get(color, 0) + 1',
      ],
      acceptedAnswers: ['3', 'three'],
      placeholder: 'teal count',
      hint: 'Add one each time teal appears in the list.',
      explanation:
        'Teal appears three times, so its frequency-map entry ends at 3.',
    },
  },
  {
    trackId: 'two-pointers',
    recognition: {
      id: itemIds('two-pointers').recognition,
      assessmentId: itemIds('two-pointers').recognitionAssessment,
      trackId: 'two-pointers',
      skillId: 'skill:inward-two-pointers',
      kind: 'pattern-recognition',
      prompt:
        'A ranger checks whether a trail call sign reads the same forward and backward by comparing the two ends and moving both marks toward the middle. Type the name of this pattern.',
      acceptedAnswers: [
        'two pointers',
        'two pointer',
        'two-pointers',
        'two-pointer',
        '2 pointers',
        '2 pointer',
        'inward two pointers',
        'opposite two pointers',
        'converging pointers',
        'left and right pointers',
        'two pointers from both ends',
      ],
      placeholder: 'pattern name',
      hint:
        'The first character must match the last, then the next pair must match.',
      explanation:
        'Inward two pointers compare mirrored positions once, giving a linear scan.',
    },
    transfer: {
      id: itemIds('two-pointers').transfer,
      assessmentId: itemIds('two-pointers').transferAssessment,
      trackId: 'two-pointers',
      skillId: 'skill:sorted-two-pointers',
      kind: 'open-transfer',
      prompt:
        'The current pair is 9 and 25, totaling 34, but the target is 31. After one correct pointer move, what pair is checked next? Type it as two numbers.',
      code: ['widths = [4, 9, 13, 18, 25]', 'target = 31'],
      acceptedAnswers: [
        '9, 18',
        '9,18',
        '9 and 18',
        '9 18',
        '(9, 18)',
        '(9,18)',
        '[9, 18]',
        '[9,18]',
        '18, 9',
        '18,9',
        '18 and 9',
        '18 9',
      ],
      placeholder: 'left value, right value',
      hint:
        'The sum is too high, so replace the larger end with the next smaller value.',
      explanation:
        'Moving the right pointer left changes 25 to 18, so the next pair is 9 and 18.',
    },
  },
  {
    trackId: 'sliding-window',
    recognition: {
      id: itemIds('sliding-window').recognition,
      assessmentId: itemIds('sliding-window').recognitionAssessment,
      trackId: 'sliding-window',
      skillId: 'skill:window-frequency',
      kind: 'pattern-recognition',
      prompt:
        'A sensor scans a fixed-length span of readings that shifts one position at a time, updating counts as one value enters and one leaves. Type the name of this pattern.',
      acceptedAnswers: [
        'sliding window',
        'sliding-window',
        'fixed sliding window',
        'fixed-size sliding window',
        'fixed window',
        'window',
        'rolling window',
        'moving window',
        'a sliding window',
      ],
      placeholder: 'pattern name',
      hint:
        'Neighboring fixed spans differ by exactly one outgoing and one incoming value.',
      explanation:
        'A fixed sliding window updates its counts in constant work per shift instead of recounting from scratch.',
    },
    transfer: {
      id: itemIds('sliding-window').transfer,
      assessmentId: itemIds('sliding-window').transferAssessment,
      trackId: 'sliding-window',
      skillId: 'skill:variable-window',
      kind: 'open-transfer',
      prompt:
        'The window holds [2, 5, 1] for a total of 8, above the limit of 7. After removing one value from the left, what is the new total?',
      code: ['packets = [2, 5, 1, 3, 2]', 'limit = 7'],
      acceptedAnswers: ['6', 'six'],
      placeholder: 'new window total',
      hint: 'A shrinking window removes the leftmost value, which is 2.',
      explanation:
        'Removing the leftmost 2 changes the running total from 8 to 6, making the window valid.',
    },
  },
  {
    trackId: 'stack',
    recognition: {
      id: itemIds('stack').recognition,
      assessmentId: itemIds('stack').recognitionAssessment,
      trackId: 'stack',
      skillId: 'skill:stack-matching',
      kind: 'pattern-recognition',
      prompt:
        'A stage manager must undo lighting changes in the exact reverse order they were made — the newest change is always removed first. Type the name of the data structure that matches this rule.',
      acceptedAnswers: [
        'stack',
        'a stack',
        'lifo',
        'a lifo',
        'lifo stack',
        'last in first out',
        'last-in first-out',
        'last in, first out',
        'last in first out stack',
      ],
      placeholder: 'structure name',
      hint: 'Undo takes the most recent action first.',
      explanation:
        'A stack is last in, first out, so the newest lighting change is the first one undone.',
    },
    transfer: {
      id: itemIds('stack').transfer,
      assessmentId: itemIds('stack').transferAssessment,
      trackId: 'stack',
      skillId: 'skill:augmented-stack',
      kind: 'open-transfer',
      prompt:
        'A minimum stack stores values 5, 2, and 4 in that order. After popping 4, what minimum should it report?',
      code: [
        'push(5)  # minimum 5',
        'push(2)  # minimum 2',
        'push(4)  # minimum 2',
        'pop()    # removes 4',
      ],
      acceptedAnswers: ['2', 'two'],
      placeholder: 'minimum value',
      hint: 'Popping 4 reveals the earlier stack level whose stored minimum is 2.',
      explanation:
        'Each stack level preserves its minimum, so removing 4 restores the minimum 2.',
    },
  },
  {
    trackId: 'binary-search',
    recognition: {
      id: itemIds('binary-search').recognition,
      assessmentId: itemIds('binary-search').recognitionAssessment,
      trackId: 'binary-search',
      skillId: 'skill:answer-search',
      kind: 'pattern-recognition',
      prompt:
        'A warehouse needs the smallest conveyor speed that finishes all crates before closing. It can test any chosen speed, and each test discards half of the remaining speed range. Type the name of this search technique.',
      acceptedAnswers: [
        'binary search',
        'binary-search',
        'binary search on the answer',
        'binary search over the answer',
        'binary search the answer',
        'answer binary search',
        'bisect',
        'bisection',
        'bisection search',
        'a binary search',
      ],
      placeholder: 'technique name',
      hint: 'If one speed works, every faster speed works too.',
      explanation:
        'Binary search on the answer uses a monotonic feasibility test to discard half the speed range each round.',
    },
    transfer: {
      id: itemIds('binary-search').transfer,
      assessmentId: itemIds('binary-search').transferAssessment,
      trackId: 'binary-search',
      skillId: 'skill:binary-search',
      kind: 'open-transfer',
      prompt:
        'The target is 45. With low = 0 and high = 6, the middle index is 3 and holds 31. What should low become next?',
      code: ['codes = [6, 14, 23, 31, 45, 58, 72]', 'target = 45'],
      acceptedAnswers: ['4', 'four', 'index 4', 'low = 4', 'mid + 1', 'mid+1'],
      placeholder: 'new low index',
      hint: '31 is below the target, so discard the middle and everything left of it.',
      explanation:
        'Because 31 is too small, low moves to mid + 1, which is index 4.',
    },
  },
  {
    trackId: 'linked-list',
    recognition: {
      id: itemIds('linked-list').recognition,
      assessmentId: itemIds('linked-list').recognitionAssessment,
      trackId: 'linked-list',
      skillId: 'skill:pointer-reversal',
      kind: 'pattern-recognition',
      prompt:
        'A chain of parade floats stores only a link to the next float. The route must be flipped in place by turning each next link around while saving the untouched remainder. Type the name of this technique.',
      acceptedAnswers: [
        'pointer reversal',
        'reverse pointers',
        'reverse the pointers',
        'reversing pointers',
        'link reversal',
        'reverse the links',
        'reverse the next pointers',
        'linked list reversal',
        'reverse a linked list',
        'reversing a linked list',
        'in-place reversal',
        'in place reversal',
        'iterative reversal',
        'reverse next pointers',
        'reversing the links',
        'list reversal',
      ],
      placeholder: 'technique name',
      hint: 'Changing a link too early can lose the rest of the chain.',
      explanation:
        'Pointer reversal saves the next node, flips the current link, and then advances.',
    },
    transfer: {
      id: itemIds('linked-list').transfer,
      assessmentId: itemIds('linked-list').transferAssessment,
      trackId: 'linked-list',
      skillId: 'skill:fast-slow-pointer',
      kind: 'open-transfer',
      prompt:
        'Slow moves one link while fast moves two. Starting together at A in A→B→C→D→E, where is slow after fast reaches E?',
      code: [
        'slow = A; fast = A',
        'round 1: slow = B; fast = C',
        'round 2: slow = C; fast = E',
      ],
      acceptedAnswers: ['C', 'node C', 'C node'],
      placeholder: 'node label',
      hint: 'After two rounds, slow has moved from A to B to C.',
      explanation:
        'Fast reaches E in two rounds while slow reaches C, demonstrating the midpoint pace.',
    },
  },
  {
    trackId: 'trees',
    recognition: {
      id: itemIds('trees').recognition,
      assessmentId: itemIds('trees').recognitionAssessment,
      trackId: 'trees',
      skillId: 'skill:level-order-bfs',
      kind: 'pattern-recognition',
      prompt:
        'A display must list all tree nodes one depth at a time from left to right, using a queue that drains one layer before the next. Type the name of this traversal.',
      acceptedAnswers: [
        'breadth first search',
        'breadth-first search',
        'bfs',
        'level order',
        'level-order',
        'level order traversal',
        'level-order traversal',
        'level order bfs',
        'level-order bfs',
        'breadth first traversal',
        'breadth-first traversal',
      ],
      placeholder: 'traversal name',
      hint: 'A queue keeps every node at the current depth together.',
      explanation:
        'Level-order breadth-first search drains one queue layer before visiting the next depth.',
    },
    transfer: {
      id: itemIds('trees').transfer,
      assessmentId: itemIds('trees').transferAssessment,
      trackId: 'trees',
      skillId: 'skill:recursive-tree-dfs',
      kind: 'open-transfer',
      prompt:
        'A preorder walk visits node, then left subtree, then right subtree. What are the first three values visited in this tree?',
      code: ['        18', '       /  \\', '      7    25', '     / \\', '    3  10'],
      acceptedAnswers: [
        '18, 7, 3',
        '18,7,3',
        '18 7 3',
        '18 -> 7 -> 3',
        '18 → 7 → 3',
        '18-7-3',
        '[18, 7, 3]',
        '[18,7,3]',
        '18 then 7 then 3',
      ],
      placeholder: 'first three values',
      hint: 'Visit 18 first, then enter the entire left side before going right.',
      explanation:
        'Preorder starts at 18, moves to its left child 7, then to 7’s left child 3.',
    },
  },
  {
    trackId: 'tries',
    recognition: {
      id: itemIds('tries').recognition,
      assessmentId: itemIds('tries').recognitionAssessment,
      trackId: 'tries',
      skillId: 'skill:wildcard-trie',
      kind: 'pattern-recognition',
      prompt:
        'A word search stores a dictionary in a tree of shared letter prefixes, so lookups walk one letter edge at a time instead of scanning full words. Type the name of this data structure.',
      acceptedAnswers: [
        'trie',
        'a trie',
        'prefix tree',
        'a prefix tree',
        'prefix trie',
        'digital tree',
        'retrieval tree',
      ],
      placeholder: 'structure name',
      hint: 'Literal letters choose one edge; shared prefixes share nodes.',
      explanation:
        'A trie shares stored word prefixes, so search walks letter edges and branches only where needed.',
    },
    transfer: {
      id: itemIds('tries').transfer,
      assessmentId: itemIds('tries').transferAssessment,
      trackId: 'tries',
      skillId: 'skill:trie-operations',
      kind: 'open-transfer',
      prompt:
        'A trie contains "solar", "solid", and "song". How many stored words continue from the prefix "sol"?',
      code: ['words = ["solar", "solid", "song"]', 'prefix = "sol"'],
      acceptedAnswers: ['2', 'two'],
      placeholder: 'matching word count',
      hint: 'Check the first three letters of each stored word.',
      explanation:
        'Solar and solid begin with sol, while song branches after so, so the count is 2.',
    },
  },
  {
    trackId: 'heap-priority-queue',
    recognition: {
      id: itemIds('heap-priority-queue').recognition,
      assessmentId: itemIds('heap-priority-queue').recognitionAssessment,
      trackId: 'heap-priority-queue',
      skillId: 'skill:heap-selection',
      kind: 'pattern-recognition',
      prompt:
        'A repair desk repeatedly takes the waiting job with the smallest urgency number, even as new jobs keep arriving. Type the name of the data structure that keeps the smallest key on top.',
      acceptedAnswers: [
        'min heap',
        'min-heap',
        'minheap',
        'a min heap',
        'a min-heap',
        'heap',
        'a heap',
        'binary heap',
        'priority queue',
        'a priority queue',
        'min priority queue',
        'min-priority queue',
      ],
      placeholder: 'structure name',
      hint: 'The desk needs fast access to the current smallest key after every update.',
      explanation:
        'A priority queue backed by a min-heap keeps the smallest urgency value at the top while supporting new arrivals.',
    },
    transfer: {
      id: itemIds('heap-priority-queue').transfer,
      assessmentId: itemIds('heap-priority-queue').transferAssessment,
      trackId: 'heap-priority-queue',
      skillId: 'skill:streaming-heap',
      kind: 'open-transfer',
      prompt:
        'A size-3 min-heap stores the three largest scores seen: [4, 6, 9]. Score 5 arrives. After adding it and removing the smallest to restore size 3, what is the heap root?',
      code: ['heap = [4, 6, 9]', 'push(heap, 5)', 'pop_min(heap)'],
      acceptedAnswers: ['5', 'five'],
      placeholder: 'third-largest score',
      hint: 'The retained scores become 5, 6, and 9.',
      explanation:
        'Removing 4 leaves 5 as the smallest retained top-three score, so the root is 5.',
    },
  },
  {
    trackId: 'backtracking',
    recognition: {
      id: itemIds('backtracking').recognition,
      assessmentId: itemIds('backtracking').recognitionAssessment,
      trackId: 'backtracking',
      skillId: 'skill:subset-backtracking',
      kind: 'pattern-recognition',
      prompt:
        'A costume tool must list every allowed outfit by choosing an item, exploring that choice, then undoing it to try another. Type the name of this pattern.',
      acceptedAnswers: [
        'backtracking',
        'back tracking',
        'back-tracking',
        'recursive backtracking',
        'backtracking search',
        'backtrack',
        'dfs with undo',
        'depth first search with undo',
      ],
      placeholder: 'pattern name',
      hint: 'The key move is choose, explore, and undo.',
      explanation:
        'Backtracking explores one decision path and then removes the choice before exploring the next path.',
    },
    transfer: {
      id: itemIds('backtracking').transfer,
      assessmentId: itemIds('backtracking').transferAssessment,
      trackId: 'backtracking',
      skillId: 'skill:subset-backtracking',
      kind: 'open-transfer',
      prompt:
        'A backtracking tree makes an include-or-skip choice for each of three charms: M, N, and P. How many different subsets reach the leaves?',
      code: ['charms = ["M", "N", "P"]'],
      acceptedAnswers: ['8', 'eight'],
      placeholder: 'subset count',
      hint: 'Each of the three charms doubles the number of choice paths.',
      explanation:
        'Three independent include-or-skip choices create 2 × 2 × 2 = 8 subsets.',
    },
  },
  {
    trackId: 'graphs',
    recognition: {
      id: itemIds('graphs').recognition,
      assessmentId: itemIds('graphs').recognitionAssessment,
      trackId: 'graphs',
      skillId: 'skill:graph-bfs',
      kind: 'pattern-recognition',
      prompt:
        'Every hallway takes one minute to cross. A student needs the route with the fewest hallways between two rooms, so the map is searched one distance layer at a time. Type the name of this search.',
      acceptedAnswers: [
        'breadth first search',
        'breadth-first search',
        'bfs',
        'a breadth first search',
        'breadth first',
        'breadth-first',
        'layered bfs',
        'level order search',
        'breadth first search by layers',
      ],
      placeholder: 'search name',
      hint: 'In an unweighted map, the first reached layer gives the fewest edges.',
      explanation:
        'Breadth-first search visits all rooms one hallway away, then two away, so it finds the shortest unweighted route.',
    },
    transfer: {
      id: itemIds('graphs').transfer,
      assessmentId: itemIds('graphs').transferAssessment,
      trackId: 'graphs',
      skillId: 'skill:graph-bfs',
      kind: 'open-transfer',
      prompt:
        'Hallways connect P-Q, P-R, Q-S, and R-T. In a breadth-first search from P, which two rooms form the first layer after P? Type both labels.',
      code: ['P: Q, R', 'Q: P, S', 'R: P, T'],
      acceptedAnswers: [
        'Q, R',
        'Q,R',
        'Q R',
        'Q and R',
        'R, Q',
        'R,Q',
        'R Q',
        'R and Q',
      ],
      placeholder: 'two room labels',
      hint: 'The first layer contains every direct neighbor of P.',
      explanation:
        'P connects directly to Q and R, so those two rooms make the first BFS layer.',
    },
  },
  {
    trackId: 'advanced-graphs',
    recognition: {
      id: itemIds('advanced-graphs').recognition,
      assessmentId: itemIds('advanced-graphs').recognitionAssessment,
      trackId: 'advanced-graphs',
      skillId: 'skill:dijkstra',
      kind: 'pattern-recognition',
      prompt:
        'Bike paths have different nonnegative travel times. The planner repeatedly settles the cheapest unsettled station and relaxes its outgoing edges to find the least total time to every station. Type the name of this algorithm.',
      acceptedAnswers: [
        'dijkstra',
        'dijkstras',
        "dijkstra's",
        'dijkstra’s',
        'dijkstra algorithm',
        'dijkstras algorithm',
        "dijkstra's algorithm",
        'dijkstra’s algorithm',
        'dijkstra with a min-heap',
        'dijkstra with a min heap',
      ],
      placeholder: 'algorithm name',
      hint: 'The path costs differ, so the next station should be the cheapest unsettled one.',
      explanation:
        'Dijkstra’s algorithm repeatedly settles the lowest known distance and relaxes outgoing weighted edges.',
    },
    transfer: {
      id: itemIds('advanced-graphs').transfer,
      assessmentId: itemIds('advanced-graphs').transferAssessment,
      trackId: 'advanced-graphs',
      skillId: 'skill:dijkstra',
      kind: 'open-transfer',
      prompt:
        'Using these directed travel times, what is the cheapest total cost from A to D?',
      code: ['A -> B: 4', 'A -> C: 1', 'C -> B: 2', 'B -> D: 3', 'C -> D: 8'],
      acceptedAnswers: ['6', 'six', 'cost 6'],
      placeholder: 'minimum cost',
      hint: 'Compare A→B→D, A→C→D, and A→C→B→D.',
      explanation:
        'A→C→B→D costs 1 + 2 + 3 = 6, which beats the other available routes.',
    },
  },
  {
    trackId: '1d-dp',
    recognition: {
      id: itemIds('1d-dp').recognition,
      assessmentId: itemIds('1d-dp').recognitionAssessment,
      trackId: '1d-dp',
      skillId: 'skill:take-skip-dp',
      kind: 'pattern-recognition',
      prompt:
        'A fundraiser chooses donation booths in one row but cannot choose neighboring booths. The best total through each position is stored and reused instead of being recomputed. Type the name of this technique.',
      acceptedAnswers: [
        'dynamic programming',
        'dp',
        '1d dynamic programming',
        '1d dp',
        '1-d dynamic programming',
        '1-d dp',
        'one dimensional dynamic programming',
        'one-dimensional dynamic programming',
        'one dimensional dp',
        'one-dimensional dp',
        'take or skip dp',
        'take-or-skip dynamic programming',
        'memoization',
        'tabulation',
      ],
      placeholder: 'technique name',
      hint: 'At each booth, compare skipping it with taking it plus the best total from two spots back.',
      explanation:
        'A one-dimensional DP stores the best total through each position and reuses earlier results.',
    },
    transfer: {
      id: itemIds('1d-dp').transfer,
      assessmentId: itemIds('1d-dp').transferAssessment,
      trackId: '1d-dp',
      skillId: 'skill:take-skip-dp',
      kind: 'open-transfer',
      prompt:
        'Use the shown take-or-skip recurrence. What is best[3] for these booth points?',
      code: [
        'points = [5, 1, 8, 4]',
        'best[0] = 5',
        'best[1] = 5',
        'best[i] = max(best[i - 1], best[i - 2] + points[i])',
      ],
      acceptedAnswers: ['13', 'thirteen'],
      placeholder: 'best[3]',
      hint: 'First find best[2], then compare best[2] with best[1] + 4.',
      explanation:
        'best[2] is 13, and best[1] + 4 is 9, so best[3] remains 13.',
    },
  },
  {
    trackId: '2d-dp',
    recognition: {
      id: itemIds('2d-dp').recognition,
      assessmentId: itemIds('2d-dp').recognitionAssessment,
      trackId: '2d-dp',
      skillId: 'skill:grid-dp',
      kind: 'pattern-recognition',
      prompt:
        'A rover moves only right or down through a tile map and must count routes around blocked tiles. Each tile combines the already-solved answers from the tile above and the tile to its left. Type the name of this technique.',
      acceptedAnswers: [
        'grid dp',
        'grid dynamic programming',
        '2d dp',
        '2d dynamic programming',
        '2-d dp',
        '2-d dynamic programming',
        'two dimensional dynamic programming',
        'two-dimensional dynamic programming',
        'two dimensional dp',
        'two-dimensional dp',
        'dp table',
        'dynamic programming table',
        'dynamic programming',
        'dp',
        'tabulation',
      ],
      placeholder: 'technique name',
      hint: 'A route into a tile can come from the tile above or the tile to its left.',
      explanation:
        'A two-dimensional grid DP stores route counts per tile and combines already solved neighboring states.',
    },
    transfer: {
      id: itemIds('2d-dp').transfer,
      assessmentId: itemIds('2d-dp').transferAssessment,
      trackId: '2d-dp',
      skillId: 'skill:grid-dp',
      kind: 'open-transfer',
      prompt:
        'For an open tile, routes[row][col] equals the value above plus the value on the left. If those values are 7 and 5, what is stored in this tile?',
      code: ['routes[row][col] = routes[row - 1][col] + routes[row][col - 1]'],
      acceptedAnswers: ['12', 'twelve'],
      placeholder: 'route count',
      hint: 'Add the two ways of entering the tile.',
      explanation:
        'The tile receives 7 routes from above and 5 from the left, for 12 total routes.',
    },
  },
  {
    trackId: 'greedy',
    recognition: {
      id: itemIds('greedy').recognition,
      assessmentId: itemIds('greedy').recognitionAssessment,
      trackId: 'greedy',
      skillId: 'skill:reachability-greedy',
      kind: 'pattern-recognition',
      prompt:
        'A robot crosses numbered pads while tracking only one number: the farthest pad reachable so far. It never revisits earlier route details. Type the name of this strategy family.',
      acceptedAnswers: [
        'greedy',
        'a greedy algorithm',
        'greedy algorithm',
        'greedy strategy',
        'greedy approach',
        'greedy frontier',
        'greedy reach',
        'greedy reachability',
        'farthest reach greedy',
      ],
      placeholder: 'strategy name',
      hint: 'Earlier route details do not matter once a farther reachable boundary is known.',
      explanation:
        'A greedy frontier keeps the best reach seen so far and fails only when the scan moves beyond it.',
    },
    transfer: {
      id: itemIds('greedy').transfer,
      assessmentId: itemIds('greedy').transferAssessment,
      trackId: 'greedy',
      skillId: 'skill:reachability-greedy',
      kind: 'open-transfer',
      prompt:
        'The current farthest reachable index is 3. At index 2, the robot can jump 2 pads. What does the farthest index become?',
      code: ['jumps = [3, 1, 2, 0, 4, 1]', 'farthest = max(farthest, index + jumps[index])'],
      acceptedAnswers: ['4', 'four', 'index 4'],
      placeholder: 'new farthest index',
      hint: 'The new candidate is the current index 2 plus its jump length 2.',
      explanation:
        'Index 2 can reach index 4, which is farther than 3, so the frontier becomes 4.',
    },
  },
  {
    trackId: 'intervals',
    recognition: {
      id: itemIds('intervals').recognition,
      assessmentId: itemIds('intervals').recognitionAssessment,
      trackId: 'intervals',
      skillId: 'skill:interval-merge',
      kind: 'pattern-recognition',
      prompt:
        'A theater wants one clean schedule from lighting windows that may overlap. After sorting by start time, each window is folded into the current one whenever their times touch. Type the name of this pattern.',
      acceptedAnswers: [
        'merge intervals',
        'interval merge',
        'interval merging',
        'merging intervals',
        'merge overlapping intervals',
        'merging overlapping intervals',
        'sorted interval merge',
        'interval merge after sorting',
      ],
      placeholder: 'pattern name',
      hint: 'Compare the next start with the current ending time.',
      explanation:
        'A sorted interval merge extends the current end on overlap and starts a new window only after a gap.',
    },
    transfer: {
      id: itemIds('intervals').transfer,
      assessmentId: itemIds('intervals').transferAssessment,
      trackId: 'intervals',
      skillId: 'skill:interval-merge',
      kind: 'open-transfer',
      prompt:
        'Two lighting windows are [14, 19] and [18, 24]. What single window results after merging them? Type the two endpoints.',
      code: ['windows = [[14, 19], [18, 24]]'],
      acceptedAnswers: [
        '[14, 24]',
        '[14,24]',
        '14, 24',
        '14,24',
        '14 24',
        '14 to 24',
        '14 - 24',
        '14-24',
        '(14, 24)',
        '(14,24)',
        '14 and 24',
      ],
      placeholder: 'start, end',
      hint: 'They overlap because 18 begins before 19 ends.',
      explanation:
        'The merged window keeps the earliest start, 14, and the latest end, 24.',
    },
  },
  {
    trackId: 'math-geometry',
    recognition: {
      id: itemIds('math-geometry').recognition,
      assessmentId: itemIds('math-geometry').recognitionAssessment,
      trackId: 'math-geometry',
      skillId: 'skill:matrix-rotation',
      kind: 'pattern-recognition',
      prompt:
        'A pixel editor rotates a square board 90 degrees clockwise in place: first it flips the board across its main diagonal so rows become columns, then it mirrors every row left to right. Type the name of that first diagonal-flip step.',
      acceptedAnswers: [
        'transpose',
        'a transpose',
        'the transpose',
        'transposing',
        'transposition',
        'matrix transpose',
        'transpose the matrix',
        'matrix transposition',
        'transposing the matrix',
      ],
      placeholder: 'step name',
      hint: 'The flip swaps each cell at [row][column] with the cell at [column][row].',
      explanation:
        'Transposing reflects the board across its main diagonal; reversing every row afterward completes the clockwise rotation in place.',
    },
    transfer: {
      id: itemIds('math-geometry').transfer,
      assessmentId: itemIds('math-geometry').transferAssessment,
      trackId: 'math-geometry',
      skillId: 'skill:matrix-rotation',
      kind: 'open-transfer',
      prompt:
        'This 2 by 2 board rotates 90 degrees clockwise. What is the new top row? Type both values.',
      code: ['board = [[2, 7],', '         [5, 9]]'],
      acceptedAnswers: [
        '[5, 2]',
        '[5,2]',
        '5, 2',
        '5,2',
        '5 2',
        '5 and 2',
        '(5, 2)',
        '(5,2)',
      ],
      placeholder: 'new top row',
      hint: 'The old left column moves to the top row from bottom to top.',
      explanation:
        'The old left column is 2 above 5, so after a clockwise turn the new top row is 5, 2.',
    },
  },
  {
    trackId: 'bit-manipulation',
    recognition: {
      id: itemIds('bit-manipulation').recognition,
      assessmentId: itemIds('bit-manipulation').recognitionAssessment,
      trackId: 'bit-manipulation',
      skillId: 'skill:xor-cancellation',
      kind: 'pattern-recognition',
      prompt:
        'Every radio tag ID appears exactly twice except one ID. One bitwise operation folded across all IDs cancels each matching pair in constant extra space. Type the name of that operation.',
      acceptedAnswers: [
        'xor',
        'bitwise xor',
        'exclusive or',
        'exclusive-or',
        'bitwise exclusive or',
        'xor cancellation',
        'cumulative xor',
        'xor fold',
        'xor everything',
        'xor all ids',
      ],
      placeholder: 'operation name',
      hint: 'A number XOR itself becomes zero, and zero XOR another number leaves that number.',
      explanation:
        'XOR removes every equal pair because x XOR x is 0, leaving only the unpaired ID.',
    },
    transfer: {
      id: itemIds('bit-manipulation').transfer,
      assessmentId: itemIds('bit-manipulation').transferAssessment,
      trackId: 'bit-manipulation',
      skillId: 'skill:xor-cancellation',
      kind: 'open-transfer',
      prompt:
        'XOR every ID in this list. Which unpaired ID remains?',
      code: ['ids = [12, 5, 12, 9, 5]'],
      acceptedAnswers: ['9', 'nine'],
      placeholder: 'remaining ID',
      hint: 'The two 12s cancel, and the two 5s cancel.',
      explanation:
        'Both repeated pairs cancel under XOR, leaving the unpaired value 9.',
    },
  },
] as const satisfies readonly CertificationTrackBank[]

/**
 * Tracks are intentionally round-robined across realms. Each recognition item
 * is followed by a transfer item from a distant track, so neither topic nor
 * response mode forms a block. This order is stable across attempts.
 */
export const CERTIFICATION_TRACK_INTERLEAVE_ORDER = [
  'arrays-hashing',
  'stack',
  'trees',
  'backtracking',
  '1d-dp',
  'intervals',
  'two-pointers',
  'binary-search',
  'tries',
  'graphs',
  '2d-dp',
  'math-geometry',
  'sliding-window',
  'linked-list',
  'heap-priority-queue',
  'advanced-graphs',
  'greedy',
  'bit-manipulation',
] as const satisfies readonly TrackId[]

/**
 * The closing coding gauntlet: six original full-problem Python solves graded
 * by the in-browser judge — the "actual LeetCode test" portion of the trial.
 * Every solve uses the shared `def solve(data):` JSON boundary from missions.
 */
const CERTIFICATION_CODE_BANK = [
  {
    id: itemIds('arrays-hashing').code,
    assessmentId: itemIds('arrays-hashing').codeAssessment,
    trackId: 'arrays-hashing',
    skillId: 'skill:hash-membership',
    kind: 'code-transfer',
    prompt:
      'Cargo bay scanners log container codes in arrival order. Write solve(data): data holds a "codes" list. Scanning left to right, return the first code seen for a second time. Return -1 when every code is unique.',
    starterCode: `def solve(data):
    codes = data["codes"]
    seen = set()

    # Return the first code that repeats; return -1 if none do.
    pass`,
    cases: [
      {
        id: 'case:certification:arrays-hashing:visible-repeat',
        arguments: [{ codes: [7, 3, 9, 3, 7] }],
        expected: 3,
        visibility: 'example',
      },
      {
        id: 'case:certification:arrays-hashing:empty',
        arguments: [{ codes: [] }],
        expected: -1,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:arrays-hashing:immediate-pair',
        arguments: [{ codes: [5, 5] }],
        expected: 5,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:arrays-hashing:all-unique',
        arguments: [{ codes: [1, 2, 3, 4] }],
        expected: -1,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:arrays-hashing:negative-codes',
        arguments: [{ codes: [4, -2, 4, -2] }],
        expected: 4,
        visibility: 'hidden',
      },
    ],
    hint: 'Check membership in a seen set before adding the current code.',
    explanation:
      'A hash set remembers earlier codes, so the first repeated code is caught the moment its membership test succeeds.',
  },
  {
    id: itemIds('two-pointers').code,
    assessmentId: itemIds('two-pointers').codeAssessment,
    trackId: 'two-pointers',
    skillId: 'skill:sorted-two-pointers',
    kind: 'code-transfer',
    prompt:
      'A rig shop must span a gap exactly using two cables from a sorted rack. Write solve(data): data holds an ascending "lengths" list and a "target" span. Exactly one pair of positions sums to the target. Return that pair as a list, shorter cable first.',
    starterCode: `def solve(data):
    lengths = data["lengths"]
    target = data["target"]
    left = 0
    right = len(lengths) - 1

    # Move one pointer per step until the pair sums to target.
    pass`,
    cases: [
      {
        id: 'case:certification:two-pointers:visible-span',
        arguments: [{ lengths: [2, 5, 8, 11], target: 19 }],
        expected: [8, 11],
        visibility: 'example',
      },
      {
        id: 'case:certification:two-pointers:middle-pair',
        arguments: [{ lengths: [1, 4, 6, 9], target: 15 }],
        expected: [6, 9],
        visibility: 'hidden',
      },
      {
        id: 'case:certification:two-pointers:twin-values',
        arguments: [{ lengths: [3, 3], target: 6 }],
        expected: [3, 3],
        visibility: 'hidden',
      },
      {
        id: 'case:certification:two-pointers:negative-length',
        arguments: [{ lengths: [-4, 0, 5, 12], target: 8 }],
        expected: [-4, 12],
        visibility: 'hidden',
      },
    ],
    hint: 'Too small a sum moves the left pointer right; too large moves the right pointer left.',
    explanation:
      'Because the rack is sorted, each comparison safely discards one end, finding the unique pair in one linear pass.',
  },
  {
    id: itemIds('sliding-window').code,
    assessmentId: itemIds('sliding-window').codeAssessment,
    trackId: 'sliding-window',
    skillId: 'skill:variable-window',
    kind: 'code-transfer',
    prompt:
      'A freight drone loads consecutive crates from a conveyor without exceeding its weight limit. Write solve(data): data holds a "weights" list of positive integers and a "limit". Return the length of the longest contiguous run whose total stays at or under the limit; return 0 when no crate fits.',
    starterCode: `def solve(data):
    weights = data["weights"]
    limit = data["limit"]
    left = 0
    total = 0
    best = 0

    # Grow the window right; shrink from the left while too heavy.
    pass`,
    cases: [
      {
        id: 'case:certification:sliding-window:visible-run',
        arguments: [{ weights: [1, 2, 1, 1, 3], limit: 5 }],
        expected: 4,
        visibility: 'example',
      },
      {
        id: 'case:certification:sliding-window:empty-belt',
        arguments: [{ weights: [], limit: 5 }],
        expected: 0,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:sliding-window:nothing-fits',
        arguments: [{ weights: [6], limit: 5 }],
        expected: 0,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:sliding-window:uniform-weights',
        arguments: [{ weights: [2, 2, 2, 2], limit: 4 }],
        expected: 2,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:sliding-window:front-heavy',
        arguments: [{ weights: [3, 1, 1, 1, 4], limit: 6 }],
        expected: 4,
        visibility: 'hidden',
      },
    ],
    hint: 'Keep a running total; while it exceeds the limit, remove the leftmost weight.',
    explanation:
      'A variable window grows on the right and shrinks on the left, so every crate enters and leaves the total at most once.',
  },
  {
    id: itemIds('stack').code,
    assessmentId: itemIds('stack').codeAssessment,
    trackId: 'stack',
    skillId: 'skill:stack-matching',
    kind: 'code-transfer',
    prompt:
      'A blueprint validator checks that (), [], and {} sections nest cleanly. Write solve(data): data holds a "blueprint" string made only of those six characters. Return true when every bracket closes its matching opener in order; otherwise return false. An empty blueprint is valid.',
    starterCode: `def solve(data):
    blueprint = data["blueprint"]
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []

    # Push openers; each closer must match the newest opener.
    pass`,
    cases: [
      {
        id: 'case:certification:stack:visible-nested',
        arguments: [{ blueprint: '{[()]}' }],
        expected: true,
        visibility: 'example',
      },
      {
        id: 'case:certification:stack:empty',
        arguments: [{ blueprint: '' }],
        expected: true,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:stack:crossed',
        arguments: [{ blueprint: '([)]' }],
        expected: false,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:stack:closer-first',
        arguments: [{ blueprint: ')(' }],
        expected: false,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:stack:unclosed',
        arguments: [{ blueprint: '(((' }],
        expected: false,
        visibility: 'hidden',
      },
    ],
    hint: 'A closer is valid only when the top of the stack is its opener; the stack must end empty.',
    explanation:
      'A stack mirrors nesting: openers wait in last-in-first-out order, and each closer must match the newest unclosed opener.',
  },
  {
    id: itemIds('binary-search').code,
    assessmentId: itemIds('binary-search').codeAssessment,
    trackId: 'binary-search',
    skillId: 'skill:binary-search',
    kind: 'code-transfer',
    prompt:
      'Dock sensors store depth markers in ascending order. Write solve(data): data holds an ascending "depths" list and a "target" depth. Return the index of the first marker at least as deep as the target, or the list length when no marker qualifies. Use a halving search, not a full scan.',
    starterCode: `def solve(data):
    depths = data["depths"]
    target = data["target"]
    low = 0
    high = len(depths)

    # Halve [low, high) until low is the first qualifying index.
    pass`,
    cases: [
      {
        id: 'case:certification:binary-search:visible-mid',
        arguments: [{ depths: [4, 9, 15, 22], target: 10 }],
        expected: 2,
        visibility: 'example',
      },
      {
        id: 'case:certification:binary-search:empty',
        arguments: [{ depths: [], target: 3 }],
        expected: 0,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:binary-search:duplicate-target',
        arguments: [{ depths: [5, 8, 8, 11], target: 8 }],
        expected: 1,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:binary-search:beyond-all',
        arguments: [{ depths: [2, 4, 6], target: 9 }],
        expected: 3,
        visibility: 'hidden',
      },
    ],
    hint: 'When the middle marker is deep enough, keep it in range by moving high to mid; otherwise move low past mid.',
    explanation:
      'Lower-bound binary search keeps the invariant that everything left of low is too shallow, converging on the first qualifying index.',
  },
  {
    id: itemIds('1d-dp').code,
    assessmentId: itemIds('1d-dp').codeAssessment,
    trackId: '1d-dp',
    skillId: 'skill:take-skip-dp',
    kind: 'code-transfer',
    prompt:
      'A courier collects energy caches along one corridor but opening a cache seals both of its direct neighbors. Write solve(data): data holds a "caches" list of non-negative integers. Return the maximum total energy the courier can collect without opening two adjacent caches.',
    starterCode: `def solve(data):
    caches = data["caches"]
    take = 0
    skip = 0

    # For each cache, choose max(skip + cache, take-or-skip so far).
    pass`,
    cases: [
      {
        id: 'case:certification:1d-dp:visible-corridor',
        arguments: [{ caches: [4, 1, 6, 3] }],
        expected: 10,
        visibility: 'example',
      },
      {
        id: 'case:certification:1d-dp:empty',
        arguments: [{ caches: [] }],
        expected: 0,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:1d-dp:single',
        arguments: [{ caches: [9] }],
        expected: 9,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:1d-dp:alternating',
        arguments: [{ caches: [5, 10, 5, 10, 5] }],
        expected: 20,
        visibility: 'hidden',
      },
      {
        id: 'case:certification:1d-dp:edges-win',
        arguments: [{ caches: [10, 2, 2, 10] }],
        expected: 20,
        visibility: 'hidden',
      },
    ],
    hint: 'Track two running values: best total taking the current cache and best total skipping it.',
    explanation:
      'The take-or-skip recurrence reuses the best totals from one and two caches back, solving the corridor in one pass.',
  },
] as const satisfies readonly CertificationCodeItem[]

const trackBankById = new Map(
  CERTIFICATION_TRACK_BANK.map((entry) => [entry.trackId, entry]),
)

function requireTrackBank(trackId: TrackId): CertificationTrackBank {
  const entry = trackBankById.get(trackId)
  if (!entry) throw new Error(`Missing certification items for "${trackId}"`)
  return entry
}

export const CERTIFICATION_ITEM_BANK: readonly CertificationBankItem[] = [
  ...CERTIFICATION_TRACK_INTERLEAVE_ORDER.flatMap((trackId, index) => {
    const recognition = requireTrackBank(trackId).recognition
    const transferTrackId =
      CERTIFICATION_TRACK_INTERLEAVE_ORDER[
        (index + CERTIFICATION_TRACK_INTERLEAVE_ORDER.length / 2) %
          CERTIFICATION_TRACK_INTERLEAVE_ORDER.length
      ]
    const transfer = requireTrackBank(transferTrackId).transfer
    return [recognition, transfer] as const
  }),
  // The trial closes with the coding gauntlet — real problems, real judge.
  ...CERTIFICATION_CODE_BANK,
]

export type CertificationStepMetadata = {
  stepId: string
  assessmentId: AssessmentId
  trackId: TrackId
  trackTitle: string
  skillIds: readonly SkillId[]
  itemKind: CertificationBankItem['kind']
  requiredOpenEnded: boolean
  prompt: string
  hint: string
  explanation: string
  answerLabel: string
}

export type CertificationAssessment = {
  lesson: Lesson
  items: readonly CertificationBankItem[]
  trackIds: readonly TrackId[]
  stepMetadata: readonly CertificationStepMetadata[]
  stepMetadataById: Readonly<Record<string, CertificationStepMetadata>>
  trackIdByStepId: Readonly<Record<string, TrackId>>
  stepIdsByTrack: Readonly<Record<TrackId, readonly string[]>>
  requiredOpenEndedStepIds: readonly string[]
}

function itemAnswerLabel(item: CertificationBankItem): string {
  return item.kind === 'code-transfer'
    ? 'A working Python solution that passes every test case'
    : item.acceptedAnswers[0]
}

function lessonStepFor(item: CertificationBankItem): LessonStep {
  const common = {
    id: item.id,
    type: 'lessonPractice' as const,
    section: 'quiz' as const,
    phaseLabel: 'Quiz' as const,
    prompt: item.prompt,
    code: [...(item.code ?? [])],
    variables: [],
    targetVariables: [],
    expectedState: {},
    feedback: {
      correct: item.explanation,
      incorrect: item.hint,
      secondIncorrect: `${item.hint} The explanation will appear after this try.`,
    },
    conceptTags: [],
    skillIds: [item.skillId],
    masteryId: item.assessmentId,
    hints: [item.hint],
    hintPolicy: { availableAfterAttempts: 1 },
  }

  if (item.kind === 'code-transfer') {
    return {
      ...common,
      assessment: {
        schemaVersion: ASSESSMENT_SCHEMA_VERSION,
        id: item.assessmentId,
        kind: 'pythonCode',
        prompt: item.prompt,
        evidenceKind: 'independent-transfer',
        evidenceKinds: ['independent-transfer', 'code-tests'],
        skillIds: [item.skillId],
        starterCode: item.starterCode,
        entrypoint: { kind: 'function', name: 'solve' },
        codecs: {
          arguments: [{ kind: 'json' }],
          result: { kind: 'json' },
        },
        cases: [...item.cases],
        comparator: item.comparator ?? { kind: 'deepEqual' },
        limits: {
          timeoutMs: 2_000,
          memoryMb: 128,
          maxOutputBytes: 8_192,
          maxSourceBytes: 20_000,
        },
        failurePolicy: { kind: 'retry', maxAttempts: 8 },
      },
    }
  }

  return {
    ...common,
    assessment: {
      schemaVersion: ASSESSMENT_SCHEMA_VERSION,
      id: item.assessmentId,
      kind: 'shortAnswer',
      prompt: item.prompt,
      evidenceKind:
        item.kind === 'pattern-recognition'
          ? 'delayed-retrieval'
          : 'independent-transfer',
      skillIds: [item.skillId],
      matcher: {
        mode: 'normalized',
        acceptedAnswers: item.acceptedAnswers,
      },
      placeholder: item.placeholder,
      failurePolicy: { kind: 'reveal', maxAttempts: 2 },
    },
  }
}

function validateCertificationBank(): void {
  const manifestTrackIds = NEETCODE_150_TRACKS.map(({ id }) => id)
  const authoredTrackIds = CERTIFICATION_TRACK_BANK.map(({ trackId }) => trackId)
  if (
    authoredTrackIds.length !== manifestTrackIds.length ||
    new Set(authoredTrackIds).size !== manifestTrackIds.length ||
    manifestTrackIds.some((trackId) => !authoredTrackIds.includes(trackId))
  ) {
    throw new Error('Certification bank must cover every academy track once')
  }
  const codeBank: readonly CertificationCodeItem[] = CERTIFICATION_CODE_BANK
  if (codeBank.length === 0) {
    throw new Error('Certification must include at least one Python solve')
  }

  const stableIds = new Set<string>()
  const codeTrackIds = new Set<TrackId>()
  const bankItems: readonly CertificationBankItem[] = [
    ...CERTIFICATION_TRACK_BANK.flatMap((entry) => [
      entry.recognition,
      entry.transfer,
    ]),
    ...CERTIFICATION_CODE_BANK,
  ]
  for (const item of bankItems) {
    const track = NEETCODE_150_TRACKS.find(({ id }) => id === item.trackId)
    if (!track) throw new Error(`Unknown certification track "${item.trackId}"`)
    if (!track.skillIds.includes(item.skillId)) {
      throw new Error(
        `Certification item "${item.id}" uses a skill outside "${item.trackId}"`,
      )
    }
    if (stableIds.has(item.id) || stableIds.has(item.assessmentId)) {
      throw new Error(`Duplicate certification id "${item.id}"`)
    }
    stableIds.add(item.id)
    stableIds.add(item.assessmentId)
    if (item.kind === 'code-transfer') {
      if (codeTrackIds.has(item.trackId)) {
        throw new Error(
          `Certification has more than one Python solve for "${item.trackId}"`,
        )
      }
      codeTrackIds.add(item.trackId)
      if (!item.starterCode.split('\n').includes('def solve(data):')) {
        throw new Error(
          `Certification solve "${item.id}" must declare def solve(data):`,
        )
      }
      if (
        item.cases.length < 3 ||
        item.cases[0].visibility !== 'example' ||
        !item.cases.slice(1).every(({ visibility }) => visibility === 'hidden')
      ) {
        throw new Error(
          `Certification solve "${item.id}" needs one example case and hidden cases`,
        )
      }
    }
  }
}

export function buildCertificationAssessment(): CertificationAssessment {
  validateCertificationBank()

  const steps = CERTIFICATION_ITEM_BANK.map(lessonStepFor)
  const trackIds = NEETCODE_150_TRACKS.map(({ id }) => id)
  const titleByTrack = new Map(
    NEETCODE_150_TRACKS.map(({ id, title }) => [id, title]),
  )
  const stepMetadata = CERTIFICATION_ITEM_BANK.map(
    (item): CertificationStepMetadata => ({
      stepId: item.id,
      assessmentId: item.assessmentId,
      trackId: item.trackId,
      trackTitle: titleByTrack.get(item.trackId) ?? item.trackId,
      skillIds: [item.skillId],
      itemKind: item.kind,
      requiredOpenEnded: item.kind === 'open-transfer',
      prompt: item.prompt,
      hint: item.hint,
      explanation: item.explanation,
      answerLabel: itemAnswerLabel(item),
    }),
  )
  const stepMetadataById = Object.fromEntries(
    stepMetadata.map((metadata) => [metadata.stepId, metadata]),
  )
  const trackIdByStepId = Object.fromEntries(
    stepMetadata.map(({ stepId, trackId }) => [stepId, trackId]),
  )
  const stepIdsByTrack = {} as Record<TrackId, readonly string[]>
  for (const trackId of trackIds) {
    stepIdsByTrack[trackId] = stepMetadata
      .filter((metadata) => metadata.trackId === trackId)
      .map(({ stepId }) => stepId)
  }
  const requiredOpenEndedStepIds = stepMetadata
    .filter(({ requiredOpenEnded }) => requiredOpenEnded)
    .map(({ stepId }) => stepId)

  return {
    lesson: {
      id: 'academy:neetcode150:certification',
      title: 'NeetCode 150 Certification Trial',
      description:
        'A typed recognition and transfer trial across all 18 academy topics, closed by a real Python coding gauntlet.',
      pattern: 'Full-campaign synthesis',
      estimatedMinutes: 60,
      conceptTags: [],
      skillIds: [...new Set(CERTIFICATION_ITEM_BANK.map(({ skillId }) => skillId))],
      unlockRequirements: {},
      steps,
    },
    items: CERTIFICATION_ITEM_BANK,
    trackIds,
    stepMetadata,
    stepMetadataById,
    trackIdByStepId,
    stepIdsByTrack,
    requiredOpenEndedStepIds,
  }
}

export const buildNeetcode150CertificationAssessment =
  buildCertificationAssessment

export type CertificationGate = {
  scorePassed: boolean
  trackCoveragePassed: boolean
  openEndedTransferPassed: boolean
  requirementsPassed: boolean
  passed: boolean
  representedTrackIds: readonly TrackId[]
  missingTrackIds: readonly TrackId[]
}

export function evaluateCertificationGate(
  score: number,
  representedTrackIds: readonly TrackId[],
  openEndedTransferPassed: boolean,
): CertificationGate {
  const represented = new Set(representedTrackIds)
  const expectedTrackIds = NEETCODE_150_TRACKS.map(({ id }) => id)
  const missingTrackIds = expectedTrackIds.filter(
    (trackId) => !represented.has(trackId),
  )
  const trackCoveragePassed = missingTrackIds.length === 0
  const scorePassed = score >= EXAM_PASS_PERCENT
  const requirementsPassed =
    trackCoveragePassed && openEndedTransferPassed

  return {
    scorePassed,
    trackCoveragePassed,
    openEndedTransferPassed,
    requirementsPassed,
    passed: scorePassed && requirementsPassed,
    representedTrackIds: expectedTrackIds.filter((trackId) =>
      represented.has(trackId),
    ),
    missingTrackIds,
  }
}

export type CertificationTrackResult = {
  trackId: TrackId
  trackTitle: string
  represented: boolean
  cleanFirstTryCount: number
  itemCount: number
  openEndedTransferPassed: boolean
}

export type CertificationOutcome = CertificationGate & {
  score: number
  trackResults: readonly CertificationTrackResult[]
}

export function certificationAssessmentOutcome(
  result: LessonResult,
  assessment: CertificationAssessment,
): CertificationOutcome {
  const reviewById = new Map(
    result.stepReviews.map((review) => [review.id, review]),
  )
  const representedTrackIds = assessment.trackIds.filter((trackId) =>
    assessment.stepIdsByTrack[trackId].some((stepId) =>
      reviewById.has(stepId),
    ),
  )
  const openEndedTransferPassed =
    assessment.requiredOpenEndedStepIds.length > 0 &&
    assessment.requiredOpenEndedStepIds.every(
      (stepId) => reviewById.get(stepId)?.missed === false,
    )
  const trackResults = assessment.trackIds.map(
    (trackId): CertificationTrackResult => {
      const metadata = assessment.stepMetadata.filter(
        (item) => item.trackId === trackId,
      )
      const reviews = metadata
        .map(({ stepId }) => reviewById.get(stepId))
        .filter((review) => review !== undefined)
      const requiredOpenEnded = metadata.filter(
        ({ requiredOpenEnded }) => requiredOpenEnded,
      )
      return {
        trackId,
        trackTitle: metadata[0]?.trackTitle ?? trackId,
        represented: reviews.length > 0,
        cleanFirstTryCount: reviews.filter(({ missed }) => !missed).length,
        itemCount: metadata.length,
        openEndedTransferPassed:
          requiredOpenEnded.length > 0 &&
          requiredOpenEnded.every(
            ({ stepId }) => reviewById.get(stepId)?.missed === false,
          ),
      }
    },
  )

  return {
    score: result.masteryScore,
    ...evaluateCertificationGate(
      result.masteryScore,
      representedTrackIds,
      openEndedTransferPassed,
    ),
    trackResults,
  }
}
