import { describe, expect, it } from 'vitest'
import type { AssessmentV1 } from '../../../../../types/assessment'
import type { JsonValue } from '../../../../../types/learning'
import type { ProblemLessonSpecV1 } from '../../../../../types/problemLesson'
import {
  createPythonJudgePlan,
  validatePythonJudgePlan,
} from '../../../../../lib/pythonJudgeHarness'
import {
  compileProblemLesson,
  validateProblemLesson,
} from '../../../problemLessonCompiler'
import {
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
  resolveProblemMissionManifestContext,
} from '../../problemMissionFactory'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import type {
  ProblemLessonLoader,
  ProblemLessonLoaderResult,
} from '../../problemRegistry'
import {
  REALM_3_PROBLEM_LESSON_LOADERS,
  type Realm3ProblemId,
} from './index'

const REALM_3_PROBLEMS = NEETCODE_150_MANIFEST.problems.filter(
  ({ realmId }) => realmId === 'realm3',
)

type JsonObject = { readonly [key: string]: JsonValue }
type ReferenceSolver = (data: JsonObject) => JsonValue
type TreeNode = {
  value: number
  left: TreeNode | null
  right: TreeNode | null
}

function asObject(value: JsonValue): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Expected a JSON object')
  }
  return value as JsonObject
}

function asArray(value: JsonValue): readonly JsonValue[] {
  if (!Array.isArray(value)) throw new Error('Expected a JSON array')
  return value
}

function asNumber(value: JsonValue): number {
  if (typeof value !== 'number') throw new Error('Expected a JSON number')
  return value
}

function asString(value: JsonValue): string {
  if (typeof value !== 'string') throw new Error('Expected a JSON string')
  return value
}

function numbers(data: JsonObject, key: string): number[] {
  return asArray(data[key]).map(asNumber)
}

function strings(data: JsonObject, key: string): string[] {
  return asArray(data[key]).map(asString)
}

function buildTree(value: JsonValue): TreeNode | null {
  const values = asArray(value)
  if (values.length === 0 || values[0] === null) return null
  const root: TreeNode = {
    value: asNumber(values[0]),
    left: null,
    right: null,
  }
  const queue = [root]
  let cursor = 1
  while (queue.length > 0 && cursor < values.length) {
    const parent = queue.shift()
    if (!parent) break
    const leftValue = values[cursor]
    cursor += 1
    if (leftValue !== null && leftValue !== undefined) {
      parent.left = {
        value: asNumber(leftValue),
        left: null,
        right: null,
      }
      queue.push(parent.left)
    }
    if (cursor >= values.length) break
    const rightValue = values[cursor]
    cursor += 1
    if (rightValue !== null && rightValue !== undefined) {
      parent.right = {
        value: asNumber(rightValue),
        left: null,
        right: null,
      }
      queue.push(parent.right)
    }
  }
  return root
}

function tree(data: JsonObject, key = 'tree'): TreeNode | null {
  return buildTree(data[key])
}

function serializeTree(root: TreeNode | null): JsonValue[] {
  if (!root) return []
  const output: JsonValue[] = []
  const queue: (TreeNode | null)[] = [root]
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) {
      output.push(null)
      continue
    }
    output.push(node.value)
    queue.push(node.left, node.right)
  }
  while (output.at(-1) === null) output.pop()
  return output
}

function sameTree(first: TreeNode | null, second: TreeNode | null): boolean {
  if (!first || !second) return first === second
  return (
    first.value === second.value &&
    sameTree(first.left, second.left) &&
    sameTree(first.right, second.right)
  )
}

const REFERENCE_SOLVERS: Record<Realm3ProblemId, ReferenceSolver> = {
  'problem:invert-binary-tree': (data) => {
    const root = tree(data)
    const mirror = (node: TreeNode | null): void => {
      if (!node) return
      ;[node.left, node.right] = [node.right, node.left]
      mirror(node.left)
      mirror(node.right)
    }
    mirror(root)
    return serializeTree(root)
  },
  'problem:maximum-depth-of-binary-tree': (data) => {
    const depth = (node: TreeNode | null): number =>
      node ? 1 + Math.max(depth(node.left), depth(node.right)) : 0
    return depth(tree(data))
  },
  'problem:diameter-of-binary-tree': (data) => {
    let best = 0
    const height = (node: TreeNode | null): number => {
      if (!node) return 0
      const left = height(node.left)
      const right = height(node.right)
      best = Math.max(best, left + right)
      return 1 + Math.max(left, right)
    }
    height(tree(data))
    return best
  },
  'problem:balanced-binary-tree': (data) => {
    const checkedHeight = (node: TreeNode | null): number => {
      if (!node) return 0
      const left = checkedHeight(node.left)
      const right = checkedHeight(node.right)
      if (left < 0 || right < 0 || Math.abs(left - right) > 1) return -1
      return 1 + Math.max(left, right)
    }
    return checkedHeight(tree(data)) >= 0
  },
  'problem:same-tree': (data) =>
    sameTree(buildTree(data.firstTree), buildTree(data.secondTree)),
  'problem:subtree-of-another-tree': (data) => {
    const root = tree(data)
    const candidate = buildTree(data.candidate)
    const contains = (node: TreeNode | null): boolean => {
      if (!candidate) return true
      if (!node) return false
      return sameTree(node, candidate) || contains(node.left) || contains(node.right)
    }
    return contains(root)
  },
  'problem:lowest-common-ancestor-of-a-binary-search-tree': (data) => {
    const first = asNumber(data.p)
    const second = asNumber(data.q)
    let node = tree(data)
    while (node) {
      if (first < node.value && second < node.value) node = node.left
      else if (first > node.value && second > node.value) node = node.right
      else return node.value
    }
    throw new Error('Missing ancestor fixture')
  },
  'problem:binary-tree-level-order-traversal': (data) => {
    const root = tree(data)
    if (!root) return []
    const queue = [root]
    const levels: number[][] = []
    while (queue.length > 0) {
      const level: number[] = []
      const size = queue.length
      for (let index = 0; index < size; index += 1) {
        const node = queue.shift()
        if (!node) break
        level.push(node.value)
        if (node.left) queue.push(node.left)
        if (node.right) queue.push(node.right)
      }
      levels.push(level)
    }
    return levels
  },
  'problem:binary-tree-right-side-view': (data) => {
    const root = tree(data)
    if (!root) return []
    const queue = [root]
    const view: number[] = []
    while (queue.length > 0) {
      const size = queue.length
      for (let index = 0; index < size; index += 1) {
        const node = queue.shift()
        if (!node) break
        if (index === size - 1) view.push(node.value)
        if (node.left) queue.push(node.left)
        if (node.right) queue.push(node.right)
      }
    }
    return view
  },
  'problem:count-good-nodes-in-binary-tree': (data) => {
    const count = (node: TreeNode | null, pathMaximum: number): number => {
      if (!node) return 0
      const earned = node.value >= pathMaximum ? 1 : 0
      const nextMaximum = Math.max(pathMaximum, node.value)
      return earned + count(node.left, nextMaximum) + count(node.right, nextMaximum)
    }
    const root = tree(data)
    return root ? count(root, root.value) : 0
  },
  'problem:validate-binary-search-tree': (data) => {
    const valid = (
      node: TreeNode | null,
      low: number,
      high: number,
    ): boolean =>
      !node ||
      (low < node.value &&
        node.value < high &&
        valid(node.left, low, node.value) &&
        valid(node.right, node.value, high))
    return valid(tree(data), -Infinity, Infinity)
  },
  'problem:kth-smallest-element-in-a-bst': (data) => {
    const stack: TreeNode[] = []
    let node = tree(data)
    let rank = asNumber(data.k)
    while (stack.length > 0 || node) {
      while (node) {
        stack.push(node)
        node = node.left
      }
      const next = stack.pop()
      if (!next) break
      rank -= 1
      if (rank === 0) return next.value
      node = next.right
    }
    throw new Error('Invalid rank fixture')
  },
  'problem:construct-binary-tree-from-preorder-and-inorder-traversal': (
    data,
  ) => {
    const preorder = numbers(data, 'preorder')
    const inorder = numbers(data, 'inorder')
    const positions = new Map(inorder.map((value, index) => [value, index]))
    let preorderIndex = 0
    const build = (left: number, right: number): TreeNode | null => {
      if (left > right) return null
      const value = preorder[preorderIndex]
      preorderIndex += 1
      const split = positions.get(value)
      if (split === undefined) throw new Error('Invalid traversal fixture')
      return {
        value,
        left: build(left, split - 1),
        right: build(split + 1, right),
      }
    }
    return serializeTree(build(0, inorder.length - 1))
  },
  'problem:binary-tree-maximum-path-sum': (data) => {
    let best = -Infinity
    const gain = (node: TreeNode | null): number => {
      if (!node) return 0
      const left = Math.max(0, gain(node.left))
      const right = Math.max(0, gain(node.right))
      best = Math.max(best, node.value + left + right)
      return node.value + Math.max(left, right)
    }
    gain(tree(data))
    return best
  },
  'problem:serialize-and-deserialize-binary-tree': (data) => {
    const root = tree(data)
    const tokens: string[] = []
    const encode = (node: TreeNode | null): void => {
      if (!node) {
        tokens.push('#')
        return
      }
      tokens.push(String(node.value))
      encode(node.left)
      encode(node.right)
    }
    encode(root)
    return { encoded: tokens.join(','), roundTrip: serializeTree(root) }
  },
  'problem:implement-trie-prefix-tree': (data) => {
    type TrieNode = {
      children: Record<string, TrieNode>
      terminal: boolean
    }
    const root: TrieNode = { children: {}, terminal: false }
    const answers: boolean[] = []
    for (const entry of asArray(data.operations)) {
      const event = asObject(entry)
      const operation = asString(event.op)
      const text =
        operation === 'startsWith'
          ? asString(event.prefix)
          : asString(event.word)
      let node = root
      let pathExists = true
      for (const character of text) {
        if (operation === 'insert') {
          node.children[character] ??= { children: {}, terminal: false }
        } else if (!node.children[character]) {
          pathExists = false
          break
        }
        node = node.children[character]
      }
      if (operation === 'insert') node.terminal = true
      if (operation === 'search') answers.push(pathExists && node.terminal)
      if (operation === 'startsWith') answers.push(pathExists)
    }
    return answers
  },
  'problem:design-add-and-search-words-data-structure': (data) => {
    type TrieNode = {
      children: Record<string, TrieNode>
      terminal: boolean
    }
    const root: TrieNode = { children: {}, terminal: false }
    const answers: boolean[] = []
    const matches = (
      pattern: string,
      index: number,
      node: TrieNode,
    ): boolean => {
      if (index === pattern.length) return node.terminal
      const character = pattern[index]
      if (character === '.') {
        return Object.values(node.children).some((child) =>
          matches(pattern, index + 1, child),
        )
      }
      const child = node.children[character]
      return child ? matches(pattern, index + 1, child) : false
    }
    for (const entry of asArray(data.operations)) {
      const event = asObject(entry)
      if (asString(event.op) === 'add') {
        let node = root
        for (const character of asString(event.word)) {
          node.children[character] ??= { children: {}, terminal: false }
          node = node.children[character]
        }
        node.terminal = true
      } else {
        answers.push(matches(asString(event.pattern), 0, root))
      }
    }
    return answers
  },
  'problem:word-search-ii': (data) => {
    const board = asArray(data.board).map((row) =>
      asArray(row).map(asString),
    )
    const words = strings(data, 'words')
    const rows = board.length
    const columns = board[0]?.length ?? 0
    const exists = (word: string): boolean => {
      const used = Array.from({ length: rows }, () =>
        Array<boolean>(columns).fill(false),
      )
      const visit = (row: number, column: number, index: number): boolean => {
        if (index === word.length) return true
        if (
          row < 0 ||
          row >= rows ||
          column < 0 ||
          column >= columns ||
          used[row][column] ||
          board[row][column] !== word[index]
        ) {
          return false
        }
        used[row][column] = true
        const found =
          visit(row - 1, column, index + 1) ||
          visit(row + 1, column, index + 1) ||
          visit(row, column - 1, index + 1) ||
          visit(row, column + 1, index + 1)
        used[row][column] = false
        return found
      }
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          if (visit(row, column, 0)) return true
        }
      }
      return false
    }
    return words.filter(exists)
  },
  'problem:kth-largest-element-in-a-stream': (data) => {
    const rank = asNumber(data.k)
    const seen = numbers(data, 'initial')
    return numbers(data, 'events').map((value) => {
      seen.push(value)
      return [...seen].sort((left, right) => right - left)[rank - 1]
    })
  },
  'problem:last-stone-weight': (data) => {
    const weights = numbers(data, 'weights')
    while (weights.length > 1) {
      weights.sort((left, right) => right - left)
      const first = weights.shift()
      const second = weights.shift()
      if (first === undefined || second === undefined) break
      if (first !== second) weights.push(first - second)
    }
    return weights[0] ?? 0
  },
  'problem:k-closest-points-to-origin': (data) => {
    const points = asArray(data.points).map((point) => {
      const [xValue, yValue] = asArray(point)
      return [asNumber(xValue), asNumber(yValue)] as const
    })
    return points
      .sort((left, right) => {
        const leftDistance = left[0] ** 2 + left[1] ** 2
        const rightDistance = right[0] ** 2 + right[1] ** 2
        return (
          leftDistance - rightDistance ||
          left[0] - right[0] ||
          left[1] - right[1]
        )
      })
      .slice(0, asNumber(data.k))
      .map(([x, y]) => [x, y])
  },
  'problem:kth-largest-element-in-an-array': (data) =>
    numbers(data, 'scores').sort((left, right) => right - left)[
      asNumber(data.k) - 1
    ],
  'problem:task-scheduler': (data) => {
    const tasks = strings(data, 'tasks')
    if (tasks.length === 0) return 0
    const counts = new Map<string, number>()
    tasks.forEach((task) => counts.set(task, (counts.get(task) ?? 0) + 1))
    const greatest = Math.max(...counts.values())
    const tied = [...counts.values()].filter((count) => count === greatest).length
    return Math.max(
      tasks.length,
      (greatest - 1) * (asNumber(data.cooldown) + 1) + tied,
    )
  },
  'problem:design-twitter': (data) => {
    type Post = { timestamp: number; postId: number }
    const timelines = new Map<number, Post[]>()
    const follows = new Map<number, Set<number>>()
    const answers: number[][] = []
    let timestamp = 0
    for (const entry of asArray(data.events)) {
      const event = asObject(entry)
      const operation = asString(event.op)
      const user = asNumber(event.user)
      if (operation === 'post') {
        timestamp += 1
        const posts = timelines.get(user) ?? []
        posts.push({ timestamp, postId: asNumber(event.postId) })
        timelines.set(user, posts)
      } else if (operation === 'follow' && user !== asNumber(event.target)) {
        const followed = follows.get(user) ?? new Set<number>()
        followed.add(asNumber(event.target))
        follows.set(user, followed)
      } else if (
        operation === 'unfollow' &&
        user !== asNumber(event.target)
      ) {
        follows.get(user)?.delete(asNumber(event.target))
      } else if (operation === 'feed') {
        const visibleUsers = new Set([user, ...(follows.get(user) ?? [])])
        const visiblePosts = [...visibleUsers].flatMap(
          (visibleUser) => timelines.get(visibleUser) ?? [],
        )
        answers.push(
          visiblePosts
            .sort((left, right) => right.timestamp - left.timestamp)
            .slice(0, 10)
            .map(({ postId }) => postId),
        )
      }
    }
    return answers
  },
  'problem:find-median-from-data-stream': (data) => {
    const values: number[] = []
    const answers: number[] = []
    for (const entry of asArray(data.events)) {
      const event = asObject(entry)
      if (asString(event.op) === 'add') {
        values.push(asNumber(event.value))
      } else {
        const ordered = [...values].sort((left, right) => left - right)
        const middle = Math.floor(ordered.length / 2)
        answers.push(
          ordered.length % 2 === 1
            ? ordered[middle]
            : (ordered[middle - 1] + ordered[middle]) / 2,
        )
      }
    }
    return answers
  },
}

function unwrapLesson(result: ProblemLessonLoaderResult): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

async function loadAllRealm3Lessons(): Promise<
  readonly [Realm3ProblemId, ProblemLessonSpecV1][]
> {
  const entries = Object.entries(REALM_3_PROBLEM_LESSON_LOADERS) as [
    Realm3ProblemId,
    ProblemLessonLoader,
  ][]
  return Promise.all(
    entries.map(async ([problemId, loader]) => [
      problemId,
      unwrapLesson(await loader()),
    ]),
  )
}

function assessmentCopy(assessment: AssessmentV1): readonly string[] {
  switch (assessment.kind) {
    case 'singleChoice':
      return [assessment.prompt, ...assessment.options.map(({ label }) => label)]
    case 'order':
      return [assessment.prompt, ...assessment.items.map(({ label }) => label)]
    case 'shortAnswer':
      return [assessment.prompt, assessment.placeholder ?? '']
    case 'pythonCode':
      return [assessment.prompt, assessment.starterCode]
    case 'predict':
    case 'trace':
      return [assessment.prompt, ...assessment.code]
  }
}

function learnerCopy(spec: ProblemLessonSpecV1): string {
  const variant = spec.variants[0]
  return [
    spec.description,
    variant.explanation.hook ?? '',
    variant.explanation.prompt,
    variant.explanation.callout ?? '',
    ...(variant.explanation.bullets ?? []),
    variant.workedExample.prompt,
    ...(variant.workedExample.bullets ?? []),
    ...variant.workedExample.code,
    variant.quizIntro.prompt,
    ...variant.assessments.flatMap((step) => [
      step.prompt,
      step.feedback.correct,
      step.feedback.incorrect,
      step.feedback.secondIncorrect ?? '',
      ...(step.hints ?? []),
      ...assessmentCopy(step.assessment),
    ]),
  ].join('\n')
}

describe('Realm 3 problem missions', () => {
  it('provides one typed lazy loader for every Realm 3 manifest problem', () => {
    const manifestIds = REALM_3_PROBLEMS.map(({ id }) => id).sort()
    const loaderIds = Object.keys(REALM_3_PROBLEM_LESSON_LOADERS).sort()

    expect(REALM_3_PROBLEMS).toHaveLength(25)
    expect(loaderIds).toHaveLength(25)
    expect(loaderIds).toEqual(manifestIds)
  })

  it('loads, validates, compiles, and inherits manifest metadata for all missions', async () => {
    const lessons = await loadAllRealm3Lessons()

    for (const [problemId, lesson] of lessons) {
      const manifestProblem = REALM_3_PROBLEMS.find(({ id }) => id === problemId)
      expect(manifestProblem).toBeDefined()
      expect(validateProblemLesson(lesson, NEETCODE_150_MANIFEST)).toEqual({
        valid: true,
        issues: [],
      })
      expect(lesson).toMatchObject({
        problemId,
        curriculumId: NEETCODE_150_MANIFEST.id,
        manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
        problemContentVersion: manifestProblem?.contentVersion,
        skillIds: manifestProblem?.skillIds,
      })

      const slug = problemId.replace(/^problem:/u, '')
      const context = resolveProblemMissionManifestContext(slug)
      expect(context.problem.provenance).toMatchObject({
        promptsAndStatements: 'original',
        copiedSourceMaterial: false,
      })
      expect(context.provenanceSources.length).toBeGreaterThanOrEqual(4)

      const compiled = compileProblemLesson(lesson, NEETCODE_150_MANIFEST, {
        seed: `realm3-test:${problemId}`,
      })
      expect(compiled.id).toBe(problemId)
      expect(compiled.steps).toHaveLength(7)
      expect(JSON.parse(JSON.stringify(lesson))).toEqual(lesson)
    }
  })

  it('keeps the full arc and independently verifies all 75 judge cases', async () => {
    const lessons = await loadAllRealm3Lessons()
    let verifiedCaseCount = 0

    for (const [problemId, lesson] of lessons) {
      const slug = problemId.replace(/^problem:/u, '')
      const variant = lesson.variants[0]
      const stages = [
        variant.explanation.id,
        variant.workedExample.id,
        variant.quizIntro.id,
        ...variant.assessments.map(({ id }) => id),
      ].map((id) => id.replace(`step:${slug}:`, ''))
      expect(stages).toEqual(PROBLEM_MISSION_STAGE_ORDER)

      const [choiceStep, retrievalStep, reconstructionStep, pythonStep] =
        variant.assessments
      expect(
        variant.assessments.map(({ assessment }) => assessment.kind),
      ).toEqual(['singleChoice', 'shortAnswer', 'predict', 'pythonCode'])

      expect(choiceStep.assessment.kind).toBe('singleChoice')
      if (choiceStep.assessment.kind === 'singleChoice') {
        expect(choiceStep.assessment.options).toHaveLength(4)
        expect(
          new Set(choiceStep.assessment.options.map(({ label }) => label)).size,
        ).toBe(4)
      }

      expect(retrievalStep.assessment.kind).toBe('shortAnswer')
      if (retrievalStep.assessment.kind === 'shortAnswer') {
        expect([
          'normalized',
          'boolean',
          'numericTolerance',
        ]).toContain(retrievalStep.assessment.matcher.mode)
        if (retrievalStep.assessment.matcher.mode === 'normalized') {
          expect(
            retrievalStep.assessment.matcher.acceptedAnswers.length,
          ).toBeGreaterThan(0)
        }
      }

      expect(reconstructionStep.assessment.kind).toBe('predict')
      if (reconstructionStep.assessment.kind === 'predict') {
        expect(reconstructionStep.assessment.code.length).toBeGreaterThanOrEqual(
          4,
        )
        expect(reconstructionStep.assessment.matcher.mode).toBe('normalized')
      }

      expect(pythonStep.assessment.kind).toBe('pythonCode')
      if (pythonStep.assessment.kind !== 'pythonCode') {
        throw new Error(`Python challenge missing for ${problemId}`)
      }
      const python = pythonStep.assessment
      expect(python.entrypoint).toEqual({ kind: 'function', name: 'solve' })
      expect(python.starterCode.split('\n')).toContain('def solve(data):')
      expect(python.starterCode).toMatch(/TODO|pass/u)
      expect(validatePythonJudgePlan(createPythonJudgePlan(python))).toMatchObject(
        { valid: true },
      )
      expect(python.cases.length).toBeGreaterThanOrEqual(3)
      expect(python.cases.every(({ arguments: args }) => args.length === 1)).toBe(
        true,
      )
      const requiredIds = PROBLEM_MISSION_PYTHON_CASE_CLASSES.map(
        (caseClass) => `case:${slug}:${caseClass}`,
      )
      expect(python.cases.map(({ id }) => id)).toEqual(
        expect.arrayContaining(requiredIds),
      )
      expect(
        python.cases.find(({ id }) => id.endsWith('visible-example'))
          ?.visibility,
      ).toBe('example')
      expect(
        python.cases
          .filter(({ id }) => /hidden-(?:boundary|adversarial)$/u.test(id))
          .every(({ visibility }) => visibility === 'hidden'),
      ).toBe(true)
      for (const testCase of python.cases) {
        const input = testCase.arguments[0]
        expect(input).not.toBeNull()
        expect(Array.isArray(input)).toBe(false)
        expect(
          Object.values(input as Record<string, unknown>).some(Array.isArray),
        ).toBe(true)
        expect(
          REFERENCE_SOLVERS[problemId](asObject(input)),
          testCase.id,
        ).toEqual(testCase.expected)
        verifiedCaseCount += 1
      }
    }
    expect(verifiedCaseCount).toBeGreaterThanOrEqual(75)
  })

  it('uses track-specific diagrams and original learner-facing copy', async () => {
    const lessons = await loadAllRealm3Lessons()
    const copiedSourceMarker =
      /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu

    for (const [problemId, lesson] of lessons) {
      const manifestProblem = REALM_3_PROBLEMS.find(({ id }) => id === problemId)
      const expectedVariant =
        manifestProblem?.trackId === 'trees'
          ? 'binary'
          : manifestProblem?.trackId === 'tries'
            ? 'trie'
            : 'heap'
      expect(lesson.variants[0].explanation.diagram).toMatchObject({
        kind: 'tree',
        variant: expectedVariant,
      })
      expect(learnerCopy(lesson)).not.toMatch(copiedSourceMarker)
    }
  })
})
