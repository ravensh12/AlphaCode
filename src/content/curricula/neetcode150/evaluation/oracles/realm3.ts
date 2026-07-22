import type { JsonValue } from '../../../../../types/learning'
import {
  defineProblemMissionOracle,
  defineProblemMissionOracleRegistry,
} from '../oracleContract'

type JsonObject = { readonly [key: string]: JsonValue }
type TreeNode = {
  value: number
  left: TreeNode | null
  right: TreeNode | null
}
type TrieNode = {
  readonly children: Map<string, TrieNode>
  terminal: boolean
}

function asObject(
  value: JsonValue | undefined,
  path: string,
): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`${path} must be a JSON object`)
  }
  return value as JsonObject
}

function asArray(
  value: JsonValue | undefined,
  path: string,
): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be a JSON array`)
  }
  return value
}

function asFiniteNumber(
  value: JsonValue | undefined,
  path: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`)
  }
  return value
}

function asInteger(
  value: JsonValue | undefined,
  path: string,
): number {
  const result = asFiniteNumber(value, path)
  if (!Number.isInteger(result)) {
    throw new TypeError(`${path} must be an integer`)
  }
  return result
}

function asNonNegativeInteger(
  value: JsonValue | undefined,
  path: string,
): number {
  const result = asInteger(value, path)
  if (result < 0) {
    throw new TypeError(`${path} must be non-negative`)
  }
  return result
}

function asString(
  value: JsonValue | undefined,
  path: string,
): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be a string`)
  }
  return value
}

function readInput(input: JsonValue, problem: string): JsonObject {
  return asObject(input, `${problem} input`)
}

function readNumberArray(
  data: JsonObject,
  key: string,
  problem: string,
): number[] {
  return asArray(data[key], `${problem}.${key}`).map((value, index) =>
    asFiniteNumber(value, `${problem}.${key}[${index}]`),
  )
}

function readStringArray(
  data: JsonObject,
  key: string,
  problem: string,
): string[] {
  return asArray(data[key], `${problem}.${key}`).map((value, index) =>
    asString(value, `${problem}.${key}[${index}]`),
  )
}

function readLog(
  data: JsonObject,
  key: string,
  problem: string,
): JsonObject[] {
  return asArray(data[key], `${problem}.${key}`).map((value, index) =>
    asObject(value, `${problem}.${key}[${index}]`),
  )
}

function buildTree(
  data: JsonObject,
  key: string,
  problem: string,
): TreeNode | null {
  const rawValues = asArray(data[key], `${problem}.${key}`)
  const values = rawValues.map((value, index): number | null => {
    if (value === null) return null
    return asFiniteNumber(value, `${problem}.${key}[${index}]`)
  })
  if (values.length === 0) return null

  const rootValue = values[0]
  if (rootValue === null || rootValue === undefined) {
    if (values.some((value) => value !== null)) {
      throw new TypeError(`${problem}.${key} contains a node below a null root`)
    }
    return null
  }

  const root: TreeNode = { value: rootValue, left: null, right: null }
  const parents: TreeNode[] = [root]
  let parentIndex = 0
  let valueIndex = 1

  while (parentIndex < parents.length && valueIndex < values.length) {
    const parent = parents[parentIndex]
    parentIndex += 1
    if (!parent) break

    const leftValue = values[valueIndex]
    valueIndex += 1
    if (leftValue !== null && leftValue !== undefined) {
      parent.left = { value: leftValue, left: null, right: null }
      parents.push(parent.left)
    }

    if (valueIndex >= values.length) break
    const rightValue = values[valueIndex]
    valueIndex += 1
    if (rightValue !== null && rightValue !== undefined) {
      parent.right = { value: rightValue, left: null, right: null }
      parents.push(parent.right)
    }
  }

  if (values.slice(valueIndex).some((value) => value !== null)) {
    throw new TypeError(`${problem}.${key} contains an unreachable node`)
  }
  return root
}

function serializeTree(root: TreeNode | null): JsonValue[] {
  if (!root) return []
  const output: JsonValue[] = []
  const queue: (TreeNode | null)[] = [root]
  let cursor = 0
  while (cursor < queue.length) {
    const node = queue[cursor]
    cursor += 1
    if (!node) {
      output.push(null)
      continue
    }
    output.push(node.value)
    queue.push(node.left, node.right)
  }
  while (output[output.length - 1] === null) output.pop()
  return output
}

function sameTrees(
  first: TreeNode | null,
  second: TreeNode | null,
): boolean {
  if (!first || !second) return first === second
  return (
    first.value === second.value &&
    sameTrees(first.left, second.left) &&
    sameTrees(first.right, second.right)
  )
}

function createTrieNode(): TrieNode {
  return { children: new Map<string, TrieNode>(), terminal: false }
}

function solveInvertBinaryTree(
  input: JsonValue,
  rootOnly = false,
  leftBranchOnly = false,
): JsonValue {
  const problem = 'invert-binary-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  const mirror = (node: TreeNode | null): void => {
    if (!node) return
    ;[node.left, node.right] = [node.right, node.left]
    mirror(node.left)
    if (!leftBranchOnly) mirror(node.right)
  }
  if (rootOnly) {
    if (root) [root.left, root.right] = [root.right, root.left]
  } else {
    mirror(root)
  }
  return serializeTree(root)
}

function solveMaximumDepth(
  input: JsonValue,
  chooseShorterBranch = false,
  countEdgesInsteadOfNodes = false,
): JsonValue {
  const problem = 'maximum-depth-of-binary-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  const depth = (node: TreeNode | null): number => {
    if (!node) return 0
    const left = depth(node.left)
    const right = depth(node.right)
    return (
      1 +
      (chooseShorterBranch
        ? Math.min(left, right)
        : Math.max(left, right))
    )
  }
  const result = depth(root)
  return root && countEdgesInsteadOfNodes ? result - 1 : result
}

function solveDiameter(
  input: JsonValue,
  countNodesInsteadOfEdges = false,
  returnTreeHeight = false,
): JsonValue {
  const problem = 'diameter-of-binary-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  let best = 0
  const height = (node: TreeNode | null): number => {
    if (!node) return 0
    const left = height(node.left)
    const right = height(node.right)
    best = Math.max(best, left + right)
    return 1 + Math.max(left, right)
  }
  const rootHeight = height(root)
  if (returnTreeHeight) return rootHeight
  return root && countNodesInsteadOfEdges ? best + 1 : best
}

function solveBalancedTree(
  input: JsonValue,
  requireEqualHeights = false,
  compareNodeCounts = false,
): JsonValue {
  const problem = 'balanced-binary-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  const checkedHeight = (node: TreeNode | null): number => {
    if (!node) return 0
    const left = checkedHeight(node.left)
    const right = checkedHeight(node.right)
    const invalidDifference = requireEqualHeights
      ? left !== right
      : Math.abs(left - right) > 1
    if (left < 0 || right < 0 || invalidDifference) return -1
    return 1 + (compareNodeCounts ? left + right : Math.max(left, right))
  }
  return checkedHeight(root) >= 0
}

function flattenedValues(root: TreeNode | null): number[] {
  if (!root) return []
  return [
    root.value,
    ...flattenedValues(root.left),
    ...flattenedValues(root.right),
  ]
}

function solveSameTree(
  input: JsonValue,
  ignoreShape = false,
  crossChildDirections = false,
): JsonValue {
  const problem = 'same-tree'
  const data = readInput(input, problem)
  const first = buildTree(data, 'firstTree', problem)
  const second = buildTree(data, 'secondTree', problem)
  if (ignoreShape) {
    const firstValues = flattenedValues(first)
    const secondValues = flattenedValues(second)
    return (
      firstValues.length === secondValues.length &&
      firstValues.every((value, index) => value === secondValues[index])
    )
  }
  if (crossChildDirections) {
    const crossedSame = (
      leftTree: TreeNode | null,
      rightTree: TreeNode | null,
    ): boolean => {
      if (!leftTree || !rightTree) return leftTree === rightTree
      return (
        leftTree.value === rightTree.value &&
        crossedSame(leftTree.left, rightTree.right) &&
        crossedSame(leftTree.right, rightTree.left)
      )
    }
    return crossedSame(first, second)
  }
  return sameTrees(first, second)
}

function solveSubtree(
  input: JsonValue,
  ignoreExtraMainDescendants = false,
  testMainRootOnly = false,
): JsonValue {
  const problem = 'subtree-of-another-tree'
  const data = readInput(input, problem)
  const root = buildTree(data, 'tree', problem)
  const candidate = buildTree(data, 'candidate', problem)
  const relaxedMatch = (
    main: TreeNode | null,
    small: TreeNode | null,
  ): boolean => {
    if (!small) return true
    if (!main || main.value !== small.value) return false
    return (
      relaxedMatch(main.left, small.left) &&
      relaxedMatch(main.right, small.right)
    )
  }
  const matches = ignoreExtraMainDescendants ? relaxedMatch : sameTrees
  if (testMainRootOnly) {
    return candidate ? matches(root, candidate) : true
  }
  const contains = (node: TreeNode | null): boolean => {
    if (!candidate) return true
    if (!node) return false
    return (
      matches(node, candidate) ||
      contains(node.left) ||
      contains(node.right)
    )
  }
  return contains(root)
}

function solveLowestCommonAncestor(
  input: JsonValue,
  returnRootOnly = false,
  reverseDirections = false,
): JsonValue {
  const problem = 'lowest-common-ancestor-of-a-binary-search-tree'
  const data = readInput(input, problem)
  let node = buildTree(data, 'tree', problem)
  const first = asFiniteNumber(data.p, `${problem}.p`)
  const second = asFiniteNumber(data.q, `${problem}.q`)
  if (!node) throw new TypeError(`${problem}.tree must be non-empty`)
  if (returnRootOnly) return node.value
  while (node) {
    if (first < node.value && second < node.value) {
      node = reverseDirections ? node.right : node.left
    } else if (first > node.value && second > node.value) {
      node = reverseDirections ? node.left : node.right
    }
    else return node.value
  }
  throw new TypeError(`${problem} targets must be present in the tree`)
}

function solveLevelOrder(
  input: JsonValue,
  drainGrowingQueue = false,
  enqueueRightFirst = false,
): JsonValue {
  const problem = 'binary-tree-level-order-traversal'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  if (!root) return []
  const queue: TreeNode[] = [root]
  let cursor = 0
  if (drainGrowingQueue) {
    const flattened: number[] = []
    while (cursor < queue.length) {
      const node = queue[cursor]
      cursor += 1
      if (!node) break
      flattened.push(node.value)
      if (enqueueRightFirst) {
        if (node.right) queue.push(node.right)
        if (node.left) queue.push(node.left)
      } else {
        if (node.left) queue.push(node.left)
        if (node.right) queue.push(node.right)
      }
    }
    return [flattened]
  }

  const levels: number[][] = []
  while (cursor < queue.length) {
    const end = queue.length
    const level: number[] = []
    while (cursor < end) {
      const node = queue[cursor]
      cursor += 1
      if (!node) break
      level.push(node.value)
      if (enqueueRightFirst) {
        if (node.right) queue.push(node.right)
        if (node.left) queue.push(node.left)
      } else {
        if (node.left) queue.push(node.left)
        if (node.right) queue.push(node.right)
      }
    }
    levels.push(level)
  }
  return levels
}

function solveRightSideView(
  input: JsonValue,
  followRightChainOnly = false,
  chooseLeftmostNode = false,
): JsonValue {
  const problem = 'binary-tree-right-side-view'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  if (!root) return []
  if (followRightChainOnly) {
    const view: number[] = []
    let node: TreeNode | null = root
    while (node) {
      view.push(node.value)
      node = node.right
    }
    return view
  }

  const queue: TreeNode[] = [root]
  const view: number[] = []
  let cursor = 0
  while (cursor < queue.length) {
    const start = cursor
    const end = queue.length
    while (cursor < end) {
      const node = queue[cursor]
      cursor += 1
      if (!node) break
      if (
        chooseLeftmostNode ? cursor === start + 1 : cursor === end
      ) {
        view.push(node.value)
      }
      if (node.left) queue.push(node.left)
      if (node.right) queue.push(node.right)
    }
  }
  return view
}

function solveGoodNodes(
  input: JsonValue,
  requireStrictRecord = false,
  initializeMaximumAtZero = false,
): JsonValue {
  const problem = 'count-good-nodes-in-binary-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  if (!root) return 0
  const count = (
    node: TreeNode | null,
    pathMaximum: number,
    isRoot: boolean,
  ): number => {
    if (!node) return 0
    const good =
      isRoot ||
      (requireStrictRecord
        ? node.value > pathMaximum
        : node.value >= pathMaximum)
    const nextMaximum = Math.max(pathMaximum, node.value)
    return (
      (good ? 1 : 0) +
      count(node.left, nextMaximum, false) +
      count(node.right, nextMaximum, false)
    )
  }
  return initializeMaximumAtZero
    ? count(root, 0, false)
    : count(root, root.value, true)
}

function solveValidateBst(
  input: JsonValue,
  reverseRightBounds = false,
  reverseLeftBounds = false,
): JsonValue {
  const problem = 'validate-binary-search-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  const valid = (
    node: TreeNode | null,
    low: number,
    high: number,
  ): boolean => {
    if (!node) return true
    if (!(low < node.value && node.value < high)) return false
    const leftIsValid = reverseLeftBounds
      ? valid(node.left, node.value, high)
      : valid(node.left, low, node.value)
    return (
      leftIsValid &&
      (reverseRightBounds
        ? valid(node.right, low, node.value)
        : valid(node.right, node.value, high))
    )
  }
  return valid(root, -Infinity, Infinity)
}

function solveKthSmallest(
  input: JsonValue,
  usePreorder = false,
  useZeroBasedRank = false,
): JsonValue {
  const problem = 'kth-smallest-element-in-a-bst'
  const data = readInput(input, problem)
  const root = buildTree(data, 'tree', problem)
  const rank = asInteger(data.k, `${problem}.k`)
  if (rank < 1) throw new TypeError(`${problem}.k must be positive`)

  if (usePreorder) {
    const values = flattenedValues(root)
    const result = values[rank - 1]
    if (result === undefined) {
      throw new TypeError(`${problem}.k exceeds the node count`)
    }
    return result
  }

  const stack: TreeNode[] = []
  let node = root
  let remaining = useZeroBasedRank ? rank + 1 : rank
  while (stack.length > 0 || node) {
    while (node) {
      stack.push(node)
      node = node.left
    }
    const next = stack.pop()
    if (!next) break
    remaining -= 1
    if (remaining === 0) return next.value
    node = next.right
  }
  throw new TypeError(`${problem}.k exceeds the node count`)
}

function readTraversals(input: JsonValue): {
  readonly preorder: number[]
  readonly inorder: number[]
} {
  const problem = 'construct-binary-tree-from-preorder-and-inorder-traversal'
  const data = readInput(input, problem)
  const preorder = readNumberArray(data, 'preorder', problem)
  const inorder = readNumberArray(data, 'inorder', problem)
  if (preorder.length !== inorder.length) {
    throw new TypeError(`${problem} traversal lengths must match`)
  }
  const preorderSet = new Set(preorder)
  const inorderSet = new Set(inorder)
  if (
    preorderSet.size !== preorder.length ||
    inorderSet.size !== inorder.length ||
    preorder.some((value) => !inorderSet.has(value))
  ) {
    throw new TypeError(`${problem} traversals must contain the same unique values`)
  }
  return { preorder, inorder }
}

function solveConstructTree(
  input: JsonValue,
  treatPreorderAsLevelOrder = false,
  buildRightBeforeLeft = false,
): JsonValue {
  const problem = 'construct-binary-tree-from-preorder-and-inorder-traversal'
  const { preorder, inorder } = readTraversals(input)
  if (treatPreorderAsLevelOrder) return preorder
  const positions = new Map(
    inorder.map((value, index) => [value, index] as const),
  )
  let preorderIndex = 0
  const build = (left: number, right: number): TreeNode | null => {
    if (left > right) return null
    const value = preorder[preorderIndex]
    preorderIndex += 1
    if (value === undefined) {
      throw new TypeError(`${problem} preorder ended too early`)
    }
    const split = positions.get(value)
    if (split === undefined || split < left || split > right) {
      throw new TypeError(`${problem} traversals are inconsistent`)
    }
    if (buildRightBeforeLeft) {
      const rightNode = build(split + 1, right)
      const leftNode = build(left, split - 1)
      return { value, left: leftNode, right: rightNode }
    }
    return {
      value,
      left: build(left, split - 1),
      right: build(split + 1, right),
    }
  }
  const root = build(0, inorder.length - 1)
  if (preorderIndex !== preorder.length) {
    throw new TypeError(`${problem} preorder has unused values`)
  }
  return serializeTree(root)
}

function solveMaximumPathSum(
  input: JsonValue,
  startBestAtZero = false,
  returnRootGain = false,
): JsonValue {
  const problem = 'binary-tree-maximum-path-sum'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  if (!root) throw new TypeError(`${problem}.tree must be non-empty`)
  let best = startBestAtZero ? 0 : -Infinity
  const gain = (node: TreeNode | null): number => {
    if (!node) return 0
    const left = Math.max(0, gain(node.left))
    const right = Math.max(0, gain(node.right))
    best = Math.max(best, node.value + left + right)
    return node.value + Math.max(left, right)
  }
  const rootGain = gain(root)
  return returnRootGain ? rootGain : best
}

function encodeTree(
  root: TreeNode | null,
  includeNullMarkers: boolean,
): string {
  const tokens: string[] = []
  const visit = (node: TreeNode | null): void => {
    if (!node) {
      if (includeNullMarkers) tokens.push('#')
      return
    }
    tokens.push(String(node.value))
    visit(node.left)
    visit(node.right)
  }
  visit(root)
  return tokens.join(',')
}

function decodeTree(encoded: string): TreeNode | null {
  const tokens = encoded.split(',')
  let cursor = 0
  const build = (): TreeNode | null => {
    const token = tokens[cursor]
    cursor += 1
    if (token === '#') return null
    if (token === undefined || token === '') {
      throw new TypeError('serialized tree ended before all children')
    }
    const value = Number(token)
    if (!Number.isFinite(value)) {
      throw new TypeError(`serialized tree contains invalid token "${token}"`)
    }
    return { value, left: build(), right: build() }
  }
  const root = build()
  if (cursor !== tokens.length) {
    throw new TypeError('serialized tree contains unused tokens')
  }
  return root
}

function solveTreeCodec(
  input: JsonValue,
  omitNullMarkers = false,
  encodeBreadthFirst = false,
): JsonValue {
  const problem = 'serialize-and-deserialize-binary-tree'
  const root = buildTree(readInput(input, problem), 'tree', problem)
  const levelOrder = serializeTree(root)
  const encoded = encodeBreadthFirst
    ? levelOrder.length === 0
      ? '#'
      : levelOrder
          .map((value) => (value === null ? '#' : String(value)))
          .join(',')
    : encodeTree(root, !omitNullMarkers)
  return {
    encoded,
    roundTrip: omitNullMarkers || encodeBreadthFirst
      ? serializeTree(root)
      : serializeTree(decodeTree(encoded)),
  }
}

function solveTrie(
  input: JsonValue,
  treatPrefixesAsWords = false,
  requireTerminalForPrefix = false,
): JsonValue {
  const problem = 'implement-trie-prefix-tree'
  const data = readInput(input, problem)
  const root = createTrieNode()
  const answers: boolean[] = []

  for (const [index, event] of readLog(
    data,
    'operations',
    problem,
  ).entries()) {
    const operation = asString(
      event.op,
      `${problem}.operations[${index}].op`,
    )
    if (
      operation !== 'insert' &&
      operation !== 'search' &&
      operation !== 'startsWith'
    ) {
      throw new TypeError(`${problem} received unknown operation "${operation}"`)
    }
    const text =
      operation === 'startsWith'
        ? asString(
            event.prefix,
            `${problem}.operations[${index}].prefix`,
          )
        : asString(
            event.word,
            `${problem}.operations[${index}].word`,
          )
    let node = root
    let pathExists = true
    for (const character of text) {
      if (operation === 'insert') {
        let child = node.children.get(character)
        if (!child) {
          child = createTrieNode()
          node.children.set(character, child)
        }
        node = child
      } else {
        const child = node.children.get(character)
        if (!child) {
          pathExists = false
          break
        }
        node = child
      }
    }
    if (operation === 'insert') node.terminal = true
    else if (operation === 'search') {
      answers.push(
        pathExists && (treatPrefixesAsWords || node.terminal),
      )
    } else {
      answers.push(
        pathExists && (!requireTerminalForPrefix || node.terminal),
      )
    }
  }
  return answers
}

function solveWordDictionary(
  input: JsonValue,
  disableWildcardBranching = false,
  searchFirstWildcardBranchOnly = false,
): JsonValue {
  const problem = 'design-add-and-search-words-data-structure'
  const data = readInput(input, problem)
  const root = createTrieNode()
  const answers: boolean[] = []
  const matches = (
    pattern: string,
    index: number,
    node: TrieNode,
  ): boolean => {
    if (index === pattern.length) return node.terminal
    const character = pattern[index]
    if (character === '.' && !disableWildcardBranching) {
      if (searchFirstWildcardBranchOnly) {
        const firstChild = node.children.values().next().value
        return firstChild
          ? matches(pattern, index + 1, firstChild)
          : false
      }
      for (const child of node.children.values()) {
        if (matches(pattern, index + 1, child)) return true
      }
      return false
    }
    if (character === undefined) return false
    const child = node.children.get(character)
    return child ? matches(pattern, index + 1, child) : false
  }

  for (const [index, event] of readLog(
    data,
    'operations',
    problem,
  ).entries()) {
    const operation = asString(
      event.op,
      `${problem}.operations[${index}].op`,
    )
    if (operation === 'add') {
      const word = asString(
        event.word,
        `${problem}.operations[${index}].word`,
      )
      let node = root
      for (const character of word) {
        let child = node.children.get(character)
        if (!child) {
          child = createTrieNode()
          node.children.set(character, child)
        }
        node = child
      }
      node.terminal = true
    } else if (operation === 'search') {
      const pattern = asString(
        event.pattern,
        `${problem}.operations[${index}].pattern`,
      )
      answers.push(matches(pattern, 0, root))
    } else {
      throw new TypeError(`${problem} received unknown operation "${operation}"`)
    }
  }
  return answers
}

function readBoard(data: JsonObject, problem: string): string[][] {
  const rawRows = asArray(data.board, `${problem}.board`)
  let width: number | undefined
  return rawRows.map((rawRow, rowIndex) => {
    const row = asArray(rawRow, `${problem}.board[${rowIndex}]`)
    if (width === undefined) width = row.length
    else if (row.length !== width) {
      throw new TypeError(`${problem}.board must be rectangular`)
    }
    return row.map((value, columnIndex) => {
      const character = asString(
        value,
        `${problem}.board[${rowIndex}][${columnIndex}]`,
      )
      if (character.length !== 1) {
        throw new TypeError(
          `${problem}.board[${rowIndex}][${columnIndex}] must be one character`,
        )
      }
      return character
    })
  })
}

function solveWordSearch(
  input: JsonValue,
  allowDiagonalMoves = false,
  horizontalMovesOnly = false,
): JsonValue {
  const problem = 'word-search-ii'
  const data = readInput(input, problem)
  const board = readBoard(data, problem)
  const words = readStringArray(data, 'words', problem)
  const rows = board.length
  const columns = board[0]?.length ?? 0
  const directions = allowDiagonalMoves
    ? [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ]
    : horizontalMovesOnly
      ? [
          [0, -1],
          [0, 1],
        ]
      : [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]

  const exists = (word: string): boolean => {
    const used = Array.from({ length: rows }, () =>
      Array<boolean>(columns).fill(false),
    )
    const visit = (
      row: number,
      column: number,
      index: number,
    ): boolean => {
      if (index === word.length) return true
      if (
        row < 0 ||
        row >= rows ||
        column < 0 ||
        column >= columns ||
        used[row]?.[column] ||
        board[row]?.[column] !== word[index]
      ) {
        return false
      }
      const usedRow = used[row]
      if (!usedRow) return false
      usedRow[column] = true
      for (const direction of directions) {
        const rowOffset = direction[0]
        const columnOffset = direction[1]
        if (
          rowOffset !== undefined &&
          columnOffset !== undefined &&
          visit(row + rowOffset, column + columnOffset, index + 1)
        ) {
          usedRow[column] = false
          return true
        }
      }
      usedRow[column] = false
      return false
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (visit(row, column, 0)) return true
      }
    }
    return false
  }
  return words.filter(exists)
}

function solveKthLargestStream(
  input: JsonValue,
  keepSmallestValues = false,
  reportBeforeAddingEvent = false,
): JsonValue {
  const problem = 'kth-largest-element-in-a-stream'
  const data = readInput(input, problem)
  const rank = asInteger(data.k, `${problem}.k`)
  if (rank < 1) throw new TypeError(`${problem}.k must be positive`)
  const seen = readNumberArray(data, 'initial', problem)
  const events = readNumberArray(data, 'events', problem)
  return events.map((value) => {
    if (!reportBeforeAddingEvent) seen.push(value)
    if (seen.length < rank) {
      throw new TypeError(`${problem} has fewer than k observed values`)
    }
    const ordered = [...seen].sort((left, right) =>
      keepSmallestValues ? left - right : right - left,
    )
    const result = ordered[rank - 1]
    if (result === undefined) {
      throw new TypeError(`${problem} could not resolve rank k`)
    }
    if (reportBeforeAddingEvent) seen.push(value)
    return result
  })
}

function solveLastStoneWeight(
  input: JsonValue,
  smashSmallestFirst = false,
  combineByAddition = false,
): JsonValue {
  const problem = 'last-stone-weight'
  const data = readInput(input, problem)
  const weights = readNumberArray(data, 'weights', problem)
  while (weights.length > 1) {
    weights.sort((left, right) =>
      smashSmallestFirst ? left - right : right - left,
    )
    const first = weights.shift()
    const second = weights.shift()
    if (first === undefined || second === undefined) break
    const difference = combineByAddition
      ? first + second
      : Math.abs(first - second)
    if (difference !== 0) weights.push(difference)
  }
  return weights[0] ?? 0
}

type Point = readonly [number, number]

function readPoints(data: JsonObject, problem: string): Point[] {
  return asArray(data.points, `${problem}.points`).map((value, index) => {
    const coordinates = asArray(value, `${problem}.points[${index}]`)
    if (coordinates.length !== 2) {
      throw new TypeError(`${problem}.points[${index}] must have two coordinates`)
    }
    return [
      asFiniteNumber(
        coordinates[0],
        `${problem}.points[${index}][0]`,
      ),
      asFiniteNumber(
        coordinates[1],
        `${problem}.points[${index}][1]`,
      ),
    ]
  })
}

function solveKClosest(
  input: JsonValue,
  chooseFarthest = false,
  useManhattanDistance = false,
): JsonValue {
  const problem = 'k-closest-points-to-origin'
  const data = readInput(input, problem)
  const points = readPoints(data, problem)
  const count = asNonNegativeInteger(data.k, `${problem}.k`)
  if (count > points.length) {
    throw new TypeError(`${problem}.k exceeds the point count`)
  }
  return points
    .sort((left, right) => {
      const leftDistance = useManhattanDistance
        ? Math.abs(left[0]) + Math.abs(left[1])
        : left[0] ** 2 + left[1] ** 2
      const rightDistance = useManhattanDistance
        ? Math.abs(right[0]) + Math.abs(right[1])
        : right[0] ** 2 + right[1] ** 2
      return (
        (chooseFarthest
          ? rightDistance - leftDistance
          : leftDistance - rightDistance) ||
        left[0] - right[0] ||
        left[1] - right[1]
      )
    })
    .slice(0, count)
    .map(([xValue, yValue]) => [xValue, yValue])
}

function solveKthLargestArray(
  input: JsonValue,
  chooseKthSmallest = false,
  discardDuplicates = false,
): JsonValue {
  const problem = 'kth-largest-element-in-an-array'
  const data = readInput(input, problem)
  const allScores = readNumberArray(data, 'scores', problem)
  const scores = discardDuplicates
    ? [...new Set(allScores)]
    : allScores
  const rank = asInteger(data.k, `${problem}.k`)
  if (rank < 1 || rank > scores.length) {
    throw new TypeError(`${problem}.k must be within the score count`)
  }
  scores.sort((left, right) =>
    chooseKthSmallest ? left - right : right - left,
  )
  const result = scores[rank - 1]
  if (result === undefined) {
    throw new TypeError(`${problem} could not resolve rank k`)
  }
  return result
}

function solveTaskScheduler(
  input: JsonValue,
  ignoreIdleSlots = false,
  omitExecutionSlotFromCooldown = false,
): JsonValue {
  const problem = 'task-scheduler'
  const data = readInput(input, problem)
  const tasks = readStringArray(data, 'tasks', problem)
  const cooldown = asNonNegativeInteger(
    data.cooldown,
    `${problem}.cooldown`,
  )
  if (tasks.length === 0) return 0
  if (ignoreIdleSlots) return tasks.length
  const frequencies = new Map<string, number>()
  for (const task of tasks) {
    frequencies.set(task, (frequencies.get(task) ?? 0) + 1)
  }
  const greatest = Math.max(...frequencies.values())
  const tiedForGreatest = [...frequencies.values()].filter(
    (frequency) => frequency === greatest,
  ).length
  return Math.max(
    tasks.length,
    (greatest - 1) *
      (cooldown + (omitExecutionSlotFromCooldown ? 0 : 1)) +
      tiedForGreatest,
  )
}

function solveTwitter(
  input: JsonValue,
  ignoreUnfollow = false,
  oldestPostsFirst = false,
): JsonValue {
  const problem = 'design-twitter'
  const data = readInput(input, problem)
  type Post = { readonly time: number; readonly postId: number }
  const timelines = new Map<number, Post[]>()
  const follows = new Map<number, Set<number>>()
  const feeds: number[][] = []
  let time = 0

  for (const [index, event] of readLog(
    data,
    'events',
    problem,
  ).entries()) {
    const path = `${problem}.events[${index}]`
    const operation = asString(event.op, `${path}.op`)
    const user = asInteger(event.user, `${path}.user`)
    if (operation === 'post') {
      time += 1
      const posts = timelines.get(user) ?? []
      posts.push({
        time,
        postId: asInteger(event.postId, `${path}.postId`),
      })
      timelines.set(user, posts)
    } else if (operation === 'follow') {
      const target = asInteger(event.target, `${path}.target`)
      if (target !== user) {
        const followed = follows.get(user) ?? new Set<number>()
        followed.add(target)
        follows.set(user, followed)
      }
    } else if (operation === 'unfollow') {
      const target = asInteger(event.target, `${path}.target`)
      if (!ignoreUnfollow && target !== user) {
        follows.get(user)?.delete(target)
      }
    } else if (operation === 'feed') {
      const visibleUsers = new Set<number>([
        user,
        ...(follows.get(user) ?? []),
      ])
      const visiblePosts = [...visibleUsers].flatMap(
        (visibleUser) => timelines.get(visibleUser) ?? [],
      )
      feeds.push(
        visiblePosts
          .sort((left, right) =>
            oldestPostsFirst
              ? left.time - right.time
              : right.time - left.time,
          )
          .slice(0, 10)
          .map(({ postId }) => postId),
      )
    } else {
      throw new TypeError(`${problem} received unknown operation "${operation}"`)
    }
  }
  return feeds
}

function solveMedianStream(
  input: JsonValue,
  useLowerMiddleForEven = false,
  leaveValuesInInsertionOrder = false,
): JsonValue {
  const problem = 'find-median-from-data-stream'
  const data = readInput(input, problem)
  const values: number[] = []
  const medians: number[] = []
  for (const [index, event] of readLog(
    data,
    'events',
    problem,
  ).entries()) {
    const path = `${problem}.events[${index}]`
    const operation = asString(event.op, `${path}.op`)
    if (operation === 'add') {
      values.push(asFiniteNumber(event.value, `${path}.value`))
    } else if (operation === 'median') {
      if (values.length === 0) {
        throw new TypeError(`${problem} cannot query an empty stream`)
      }
      const ordered = leaveValuesInInsertionOrder
        ? [...values]
        : [...values].sort((left, right) => left - right)
      const middle = Math.floor(ordered.length / 2)
      const upper = ordered[middle]
      if (upper === undefined) {
        throw new TypeError(`${problem} could not resolve the median`)
      }
      if (ordered.length % 2 === 1) {
        medians.push(upper)
      } else {
        const lower = ordered[middle - 1]
        if (lower === undefined) {
          throw new TypeError(`${problem} could not resolve the median`)
        }
        medians.push(
          useLowerMiddleForEven ? lower : (lower + upper) / 2,
        )
      }
    } else {
      throw new TypeError(`${problem} received unknown operation "${operation}"`)
    }
  }
  return medians
}

const invertBinaryTreeOracle = defineProblemMissionOracle({
  problemId: 'problem:invert-binary-tree',
  solve: solveInvertBinaryTree,
  mutants: [
    {
      id: 'swap-root-only',
      description:
        'Swaps the root children but leaves every lower branch unchanged.',
      solve: (input) => solveInvertBinaryTree(input, true),
    },
    {
      id: 'recurse-left-branch-only',
      description:
        'Swaps each visited node but recursively follows only its left branch.',
      solve: (input) => solveInvertBinaryTree(input, false, true),
    },
  ],
})

const maximumDepthOracle = defineProblemMissionOracle({
  problemId: 'problem:maximum-depth-of-binary-tree',
  solve: solveMaximumDepth,
  mutants: [
    {
      id: 'choose-shorter-branch',
      description:
        'Uses the smaller child depth, measuring a shortest route instead.',
      solve: (input) => solveMaximumDepth(input, true),
    },
    {
      id: 'count-depth-in-edges',
      description:
        'Counts edges rather than the required number of nodes on the route.',
      solve: (input) => solveMaximumDepth(input, false, true),
    },
  ],
})

const diameterOracle = defineProblemMissionOracle({
  problemId: 'problem:diameter-of-binary-tree',
  solve: solveDiameter,
  mutants: [
    {
      id: 'count-nodes-not-edges',
      description:
        'Reports nodes on the longest route instead of the required edges.',
      solve: (input) => solveDiameter(input, true),
    },
    {
      id: 'return-height-not-diameter',
      description:
        'Returns the root-to-leaf height instead of the longest two-endpoint route.',
      solve: (input) => solveDiameter(input, false, true),
    },
  ],
})

const balancedTreeOracle = defineProblemMissionOracle({
  problemId: 'problem:balanced-binary-tree',
  solve: solveBalancedTree,
  mutants: [
    {
      id: 'require-equal-heights',
      description:
        'Rejects the valid one-level height difference by requiring equality.',
      solve: (input) => solveBalancedTree(input, true),
    },
    {
      id: 'compare-node-counts',
      description:
        'Compares subtree sizes instead of their heights at each node.',
      solve: (input) => solveBalancedTree(input, false, true),
    },
  ],
})

const sameTreeOracle = defineProblemMissionOracle({
  problemId: 'problem:same-tree',
  solve: solveSameTree,
  mutants: [
    {
      id: 'ignore-null-shape',
      description:
        'Compares traversal values while discarding missing-child positions.',
      solve: (input) => solveSameTree(input, true),
    },
    {
      id: 'cross-child-directions',
      description:
        'Pairs each left child with the other tree’s right child and vice versa.',
      solve: (input) => solveSameTree(input, false, true),
    },
  ],
})

const subtreeOracle = defineProblemMissionOracle({
  problemId: 'problem:subtree-of-another-tree',
  solve: solveSubtree,
  mutants: [
    {
      id: 'ignore-extra-descendants',
      description:
        'Accepts a candidate prefix even when the main tree continues below it.',
      solve: (input) => solveSubtree(input, true),
    },
    {
      id: 'test-main-root-only',
      description:
        'Checks only the main root and never searches lower candidate starts.',
      solve: (input) => solveSubtree(input, false, true),
    },
  ],
})

const lowestCommonAncestorOracle = defineProblemMissionOracle({
  problemId: 'problem:lowest-common-ancestor-of-a-binary-search-tree',
  solve: solveLowestCommonAncestor,
  mutants: [
    {
      id: 'return-root-without-descent',
      description:
        'Returns the root ancestor without descending to the lowest split.',
      solve: (input) => solveLowestCommonAncestor(input, true),
    },
    {
      id: 'reverse-bst-directions',
      description:
        'Moves right for smaller targets and left for larger targets.',
      solve: (input) => solveLowestCommonAncestor(input, false, true),
    },
  ],
})

const levelOrderOracle = defineProblemMissionOracle({
  problemId: 'problem:binary-tree-level-order-traversal',
  solve: solveLevelOrder,
  mutants: [
    {
      id: 'drain-growing-queue',
      description:
        'Drains newly enqueued children into the current level.',
      solve: (input) => solveLevelOrder(input, true),
    },
    {
      id: 'enqueue-right-before-left',
      description:
        'Traverses every level from right to left instead of left to right.',
      solve: (input) => solveLevelOrder(input, false, true),
    },
  ],
})

const rightSideViewOracle = defineProblemMissionOracle({
  problemId: 'problem:binary-tree-right-side-view',
  solve: solveRightSideView,
  mutants: [
    {
      id: 'follow-right-child-chain',
      description:
        'Follows right children only instead of taking each level’s last node.',
      solve: (input) => solveRightSideView(input, true),
    },
    {
      id: 'take-leftmost-per-level',
      description:
        'Records each level’s first node, producing the left-side view.',
      solve: (input) => solveRightSideView(input, false, true),
    },
  ],
})

const goodNodesOracle = defineProblemMissionOracle({
  problemId: 'problem:count-good-nodes-in-binary-tree',
  solve: solveGoodNodes,
  mutants: [
    {
      id: 'exclude-record-ties',
      description:
        'Requires a strict new record and fails to count equal path maxima.',
      solve: (input) => solveGoodNodes(input, true),
    },
    {
      id: 'initialize-path-maximum-at-zero',
      description:
        'Starts every tree against zero, so negative roots and paths are missed.',
      solve: (input) => solveGoodNodes(input, false, true),
    },
  ],
})

const validateBstOracle = defineProblemMissionOracle({
  problemId: 'problem:validate-binary-search-tree',
  solve: solveValidateBst,
  mutants: [
    {
      id: 'reverse-right-subtree-bound',
      description:
        'Propagates the parent value as an upper bound on the right subtree.',
      solve: (input) => solveValidateBst(input, true),
    },
    {
      id: 'reverse-left-subtree-bound',
      description:
        'Propagates the parent value as a lower bound on the left subtree.',
      solve: (input) => solveValidateBst(input, false, true),
    },
  ],
})

const kthSmallestOracle = defineProblemMissionOracle({
  problemId: 'problem:kth-smallest-element-in-a-bst',
  solve: solveKthSmallest,
  mutants: [
    {
      id: 'rank-preorder',
      description:
        'Counts preorder visits instead of sorted inorder visits.',
      solve: (input) => solveKthSmallest(input, true),
    },
    {
      id: 'treat-rank-as-zero-based',
      description:
        'Skips one extra inorder node by treating the one-based rank as zero-based.',
      solve: (input) => solveKthSmallest(input, false, true),
    },
  ],
})

const constructTreeOracle = defineProblemMissionOracle({
  problemId:
    'problem:construct-binary-tree-from-preorder-and-inorder-traversal',
  solve: solveConstructTree,
  mutants: [
    {
      id: 'preorder-is-level-order',
      description:
        'Returns preorder directly as though it were the level-order tree.',
      solve: (input) => solveConstructTree(input, true),
    },
    {
      id: 'build-right-before-left',
      description:
        'Consumes preorder while constructing the right subtree before the left.',
      solve: (input) => solveConstructTree(input, false, true),
    },
  ],
})

const maximumPathSumOracle = defineProblemMissionOracle({
  problemId: 'problem:binary-tree-maximum-path-sum',
  solve: solveMaximumPathSum,
  mutants: [
    {
      id: 'zero-floor-for-best',
      description:
        'Initializes the best path to zero, breaking all-negative trees.',
      solve: (input) => solveMaximumPathSum(input, true),
    },
    {
      id: 'return-root-downward-gain',
      description:
        'Returns the one-arm gain from the root instead of the global two-arm best.',
      solve: (input) => solveMaximumPathSum(input, false, true),
    },
  ],
})

const treeCodecOracle = defineProblemMissionOracle({
  problemId: 'problem:serialize-and-deserialize-binary-tree',
  solve: solveTreeCodec,
  mutants: [
    {
      id: 'omit-null-markers',
      description:
        'Serializes only values, losing the shape encoded by null markers.',
      solve: (input) => solveTreeCodec(input, true),
    },
    {
      id: 'encode-in-level-order',
      description:
        'Writes breadth-first tokens instead of the required preorder codec.',
      solve: (input) => solveTreeCodec(input, false, true),
    },
  ],
})

const trieOracle = defineProblemMissionOracle({
  problemId: 'problem:implement-trie-prefix-tree',
  solve: solveTrie,
  mutants: [
    {
      id: 'prefix-counts-as-word',
      description:
        'Makes exact search succeed for a path without a terminal marker.',
      solve: (input) => solveTrie(input, true),
    },
    {
      id: 'prefix-requires-terminal',
      description:
        'Makes startsWith require a complete inserted word at the prefix endpoint.',
      solve: (input) => solveTrie(input, false, true),
    },
  ],
})

const wordDictionaryOracle = defineProblemMissionOracle({
  problemId: 'problem:design-add-and-search-words-data-structure',
  solve: solveWordDictionary,
  mutants: [
    {
      id: 'dot-is-literal',
      description:
        'Treats the wildcard dot as a literal edge instead of branching.',
      solve: (input) => solveWordDictionary(input, true),
    },
    {
      id: 'wildcard-first-branch-only',
      description:
        'Explores only the first trie child for a wildcard instead of every branch.',
      solve: (input) => solveWordDictionary(input, false, true),
    },
  ],
})

const wordSearchOracle = defineProblemMissionOracle({
  problemId: 'problem:word-search-ii',
  solve: solveWordSearch,
  mutants: [
    {
      id: 'allow-diagonal-moves',
      description:
        'Searches diagonal neighbors even though only four directions are valid.',
      solve: (input) => solveWordSearch(input, true),
    },
    {
      id: 'horizontal-moves-only',
      description:
        'Searches left and right but accidentally omits vertical neighbors.',
      solve: (input) => solveWordSearch(input, false, true),
    },
  ],
})

const kthLargestStreamOracle = defineProblemMissionOracle({
  problemId: 'problem:kth-largest-element-in-a-stream',
  solve: solveKthLargestStream,
  mutants: [
    {
      id: 'keep-smallest-side',
      description:
        'Uses the opposite heap direction and reports the kth smallest value.',
      solve: (input) => solveKthLargestStream(input, true),
    },
    {
      id: 'report-before-adding-event',
      description:
        'Reports the old cutoff before inserting each incoming stream value.',
      solve: (input) => solveKthLargestStream(input, false, true),
    },
  ],
})

const lastStoneWeightOracle = defineProblemMissionOracle({
  problemId: 'problem:last-stone-weight',
  solve: solveLastStoneWeight,
  mutants: [
    {
      id: 'smash-smallest-first',
      description:
        'Repeatedly smashes the two lightest stones instead of the heaviest.',
      solve: (input) => solveLastStoneWeight(input, true),
    },
    {
      id: 'combine-weights-by-addition',
      description:
        'Adds colliding weights instead of reinserting their positive difference.',
      solve: (input) => solveLastStoneWeight(input, false, true),
    },
  ],
})

const kClosestOracle = defineProblemMissionOracle({
  problemId: 'problem:k-closest-points-to-origin',
  solve: solveKClosest,
  mutants: [
    {
      id: 'max-heap-direction',
      description:
        'Selects the farthest points by reversing the distance priority.',
      solve: (input) => solveKClosest(input, true),
    },
    {
      id: 'use-manhattan-distance',
      description:
        'Ranks points by Manhattan distance instead of squared Euclidean distance.',
      solve: (input) => solveKClosest(input, false, true),
    },
  ],
})

const kthLargestArrayOracle = defineProblemMissionOracle({
  problemId: 'problem:kth-largest-element-in-an-array',
  solve: solveKthLargestArray,
  mutants: [
    {
      id: 'ascending-rank',
      description:
        'Sorts ascending and returns the kth smallest score instead.',
      solve: (input) => solveKthLargestArray(input, true),
    },
    {
      id: 'discard-duplicate-ranks',
      description:
        'Deduplicates equal scores even though duplicates occupy separate ranks.',
      solve: (input) => solveKthLargestArray(input, false, true),
    },
  ],
})

const taskSchedulerOracle = defineProblemMissionOracle({
  problemId: 'problem:task-scheduler',
  solve: solveTaskScheduler,
  mutants: [
    {
      id: 'ignore-idle-slots',
      description:
        'Returns the task count without accounting for forced cooldown idles.',
      solve: (input) => solveTaskScheduler(input, true),
    },
    {
      id: 'omit-execution-slot',
      description:
        'Uses cooldown instead of cooldown plus one between repeated task frames.',
      solve: (input) => solveTaskScheduler(input, false, true),
    },
  ],
})

const twitterOracle = defineProblemMissionOracle({
  problemId: 'problem:design-twitter',
  solve: solveTwitter,
  mutants: [
    {
      id: 'ignore-unfollow',
      description:
        'Leaves removed authors visible after an unfollow event.',
      solve: (input) => solveTwitter(input, true),
    },
    {
      id: 'oldest-posts-first',
      description:
        'Uses the opposite timestamp priority and returns oldest visible posts first.',
      solve: (input) => solveTwitter(input, false, true),
    },
  ],
})

const medianStreamOracle = defineProblemMissionOracle({
  problemId: 'problem:find-median-from-data-stream',
  solve: solveMedianStream,
  mutants: [
    {
      id: 'lower-middle-for-even',
      description:
        'Uses the lower middle value instead of averaging an even stream.',
      solve: (input) => solveMedianStream(input, true),
    },
    {
      id: 'use-insertion-order-middle',
      description:
        'Reads middle positions from insertion order without sorting or balancing.',
      solve: (input) => solveMedianStream(input, false, true),
    },
  ],
})

export const REALM_3_PROBLEM_MISSION_ORACLES =
  defineProblemMissionOracleRegistry({
    'problem:invert-binary-tree': invertBinaryTreeOracle,
    'problem:maximum-depth-of-binary-tree': maximumDepthOracle,
    'problem:diameter-of-binary-tree': diameterOracle,
    'problem:balanced-binary-tree': balancedTreeOracle,
    'problem:same-tree': sameTreeOracle,
    'problem:subtree-of-another-tree': subtreeOracle,
    'problem:lowest-common-ancestor-of-a-binary-search-tree':
      lowestCommonAncestorOracle,
    'problem:binary-tree-level-order-traversal': levelOrderOracle,
    'problem:binary-tree-right-side-view': rightSideViewOracle,
    'problem:count-good-nodes-in-binary-tree': goodNodesOracle,
    'problem:validate-binary-search-tree': validateBstOracle,
    'problem:kth-smallest-element-in-a-bst': kthSmallestOracle,
    'problem:construct-binary-tree-from-preorder-and-inorder-traversal':
      constructTreeOracle,
    'problem:binary-tree-maximum-path-sum': maximumPathSumOracle,
    'problem:serialize-and-deserialize-binary-tree': treeCodecOracle,
    'problem:implement-trie-prefix-tree': trieOracle,
    'problem:design-add-and-search-words-data-structure':
      wordDictionaryOracle,
    'problem:word-search-ii': wordSearchOracle,
    'problem:kth-largest-element-in-a-stream': kthLargestStreamOracle,
    'problem:last-stone-weight': lastStoneWeightOracle,
    'problem:k-closest-points-to-origin': kClosestOracle,
    'problem:kth-largest-element-in-an-array': kthLargestArrayOracle,
    'problem:task-scheduler': taskSchedulerOracle,
    'problem:design-twitter': twitterOracle,
    'problem:find-median-from-data-stream': medianStreamOracle,
  })
