import type { ProblemId } from '../../../../../types/curriculum'
import type { ProblemLessonLoader } from '../../problemRegistry'

/**
 * Realm-local lazy imports keep all 28 Search and Networks missions split into
 * independent chunks. The shared registry can merge this map when enabled.
 */
export const REALM_4_PROBLEM_LESSON_LOADERS = {
  'problem:subsets': () => import('./subsets'),
  'problem:combination-sum': () => import('./combinationSum'),
  'problem:permutations': () => import('./permutations'),
  'problem:subsets-ii': () => import('./subsetsIi'),
  'problem:combination-sum-ii': () => import('./combinationSumIi'),
  'problem:word-search': () => import('./wordSearch'),
  'problem:palindrome-partitioning': () => import('./palindromePartitioning'),
  'problem:letter-combinations-of-a-phone-number': () =>
    import('./letterCombinationsOfAPhoneNumber'),
  'problem:n-queens': () => import('./nQueens'),
  'problem:number-of-islands': () => import('./numberOfIslands'),
  'problem:max-area-of-island': () => import('./maxAreaOfIsland'),
  'problem:clone-graph': () => import('./cloneGraph'),
  'problem:walls-and-gates': () => import('./wallsAndGates'),
  'problem:rotting-oranges': () => import('./rottingOranges'),
  'problem:pacific-atlantic-water-flow': () =>
    import('./pacificAtlanticWaterFlow'),
  'problem:surrounded-regions': () => import('./surroundedRegions'),
  'problem:course-schedule': () => import('./courseSchedule'),
  'problem:course-schedule-ii': () => import('./courseScheduleIi'),
  'problem:graph-valid-tree': () => import('./graphValidTree'),
  'problem:number-of-connected-components-in-an-undirected-graph': () =>
    import('./numberOfConnectedComponentsInAnUndirectedGraph'),
  'problem:redundant-connection': () => import('./redundantConnection'),
  'problem:word-ladder': () => import('./wordLadder'),
  'problem:reconstruct-itinerary': () => import('./reconstructItinerary'),
  'problem:min-cost-to-connect-all-points': () =>
    import('./minCostToConnectAllPoints'),
  'problem:network-delay-time': () => import('./networkDelayTime'),
  'problem:swim-in-rising-water': () => import('./swimInRisingWater'),
  'problem:alien-dictionary': () => import('./alienDictionary'),
  'problem:cheapest-flights-within-k-stops': () =>
    import('./cheapestFlightsWithinKStops'),
} satisfies Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>
