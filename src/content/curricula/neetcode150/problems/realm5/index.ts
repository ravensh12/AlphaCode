import type { ProblemId } from '../../../../../types/curriculum'
import type { ProblemLessonLoader } from '../../problemRegistry'

export const REALM_5_PROBLEM_LESSON_LOADERS = {
  'problem:climbing-stairs': () => import('./climbingStairs'),
  'problem:min-cost-climbing-stairs': () => import('./minCostClimbingStairs'),
  'problem:house-robber': () => import('./houseRobber'),
  'problem:house-robber-ii': () => import('./houseRobberIi'),
  'problem:longest-palindromic-substring': () =>
    import('./longestPalindromicSubstring'),
  'problem:palindromic-substrings': () => import('./palindromicSubstrings'),
  'problem:decode-ways': () => import('./decodeWays'),
  'problem:coin-change': () => import('./coinChange'),
  'problem:maximum-product-subarray': () => import('./maximumProductSubarray'),
  'problem:word-break': () => import('./wordBreak'),
  'problem:longest-increasing-subsequence': () =>
    import('./longestIncreasingSubsequence'),
  'problem:partition-equal-subset-sum': () =>
    import('./partitionEqualSubsetSum'),
  'problem:unique-paths': () => import('./uniquePaths'),
  'problem:longest-common-subsequence': () =>
    import('./longestCommonSubsequence'),
  'problem:best-time-to-buy-and-sell-stock-with-cooldown': () =>
    import('./bestTimeToBuyAndSellStockWithCooldown'),
  'problem:coin-change-ii': () => import('./coinChangeIi'),
  'problem:target-sum': () => import('./targetSum'),
  'problem:interleaving-string': () => import('./interleavingString'),
  'problem:longest-increasing-path-in-a-matrix': () =>
    import('./longestIncreasingPathInAMatrix'),
  'problem:distinct-subsequences': () => import('./distinctSubsequences'),
  'problem:edit-distance': () => import('./editDistance'),
  'problem:burst-balloons': () => import('./burstBalloons'),
  'problem:regular-expression-matching': () =>
    import('./regularExpressionMatching'),
  'problem:maximum-subarray': () => import('./maximumSubarray'),
  'problem:jump-game': () => import('./jumpGame'),
  'problem:jump-game-ii': () => import('./jumpGameIi'),
  'problem:gas-station': () => import('./gasStation'),
  'problem:hand-of-straights': () => import('./handOfStraights'),
  'problem:merge-triplets-to-form-target-triplet': () =>
    import('./mergeTripletsToFormTargetTriplet'),
  'problem:partition-labels': () => import('./partitionLabels'),
  'problem:valid-parenthesis-string': () =>
    import('./validParenthesisString'),
} satisfies Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>
