import type { ProblemId } from '../../../../../types/curriculum'
import type { ProblemLessonLoader } from '../../problemRegistry'

/**
 * Realm-owned lazy imports. Importing this table does not evaluate mission
 * content until its loader is called.
 */
export const REALM_3_PROBLEM_LESSON_LOADERS = {
  'problem:invert-binary-tree': () => import('./invertBinaryTree'),
  'problem:maximum-depth-of-binary-tree': () =>
    import('./maximumDepthOfBinaryTree'),
  'problem:diameter-of-binary-tree': () => import('./diameterOfBinaryTree'),
  'problem:balanced-binary-tree': () => import('./balancedBinaryTree'),
  'problem:same-tree': () => import('./sameTree'),
  'problem:subtree-of-another-tree': () => import('./subtreeOfAnotherTree'),
  'problem:lowest-common-ancestor-of-a-binary-search-tree': () =>
    import('./lowestCommonAncestorOfABinarySearchTree'),
  'problem:binary-tree-level-order-traversal': () =>
    import('./binaryTreeLevelOrderTraversal'),
  'problem:binary-tree-right-side-view': () =>
    import('./binaryTreeRightSideView'),
  'problem:count-good-nodes-in-binary-tree': () =>
    import('./countGoodNodesInBinaryTree'),
  'problem:validate-binary-search-tree': () =>
    import('./validateBinarySearchTree'),
  'problem:kth-smallest-element-in-a-bst': () =>
    import('./kthSmallestElementInABst'),
  'problem:construct-binary-tree-from-preorder-and-inorder-traversal': () =>
    import('./constructBinaryTreeFromPreorderAndInorderTraversal'),
  'problem:binary-tree-maximum-path-sum': () =>
    import('./binaryTreeMaximumPathSum'),
  'problem:serialize-and-deserialize-binary-tree': () =>
    import('./serializeAndDeserializeBinaryTree'),
  'problem:implement-trie-prefix-tree': () => import('./implementTriePrefixTree'),
  'problem:design-add-and-search-words-data-structure': () =>
    import('./designAddAndSearchWordsDataStructure'),
  'problem:word-search-ii': () => import('./wordSearchIi'),
  'problem:kth-largest-element-in-a-stream': () =>
    import('./kthLargestElementInAStream'),
  'problem:last-stone-weight': () => import('./lastStoneWeight'),
  'problem:k-closest-points-to-origin': () => import('./kClosestPointsToOrigin'),
  'problem:kth-largest-element-in-an-array': () =>
    import('./kthLargestElementInAnArray'),
  'problem:task-scheduler': () => import('./taskScheduler'),
  'problem:design-twitter': () => import('./designTwitter'),
  'problem:find-median-from-data-stream': () =>
    import('./findMedianFromDataStream'),
} satisfies Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>

export type Realm3ProblemId = keyof typeof REALM_3_PROBLEM_LESSON_LOADERS
