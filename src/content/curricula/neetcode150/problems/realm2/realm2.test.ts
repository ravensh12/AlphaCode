import { describe, expect, it } from 'vitest'
import type { JsonValue } from '../../../../../types/learning'
import type { ProblemLessonSpecV1 } from '../../../../../types/problemLesson'
import {
  createPythonJudgePlan,
  validatePythonJudgePlan,
} from '../../../../../lib/pythonJudgeHarness'
import { validateProblemLesson } from '../../../problemLessonCompiler'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import {
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
} from '../../problemMissionFactory'
import type {
  ProblemLessonLoader,
  ProblemLessonLoaderResult,
} from '../../problemRegistry'
import {
  REALM_2_PROBLEM_LESSON_LOADERS,
  type Realm2ProblemId,
} from './index'

type JsonObject = { readonly [key: string]: JsonValue }
type ReferenceSolver = (data: JsonObject) => JsonValue

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

function operationLog(data: JsonObject): readonly (readonly JsonValue[])[] {
  return asArray(data.operations).map(asArray)
}

function unwrapLesson(result: ProblemLessonLoaderResult): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

const REFERENCE_SOLVERS = {
  'problem:valid-parentheses': (data) => {
    const pairs: Readonly<Record<string, string>> = {
      ')': '(',
      ']': '[',
      '}': '{',
    }
    const stack: string[] = []
    for (const symbol of asString(data.brackets)) {
      if (!(symbol in pairs)) {
        stack.push(symbol)
      } else if (stack.pop() !== pairs[symbol]) {
        return false
      }
    }
    return stack.length === 0
  },
  'problem:min-stack': (data) => {
    const stack: { value: number; minimum: number }[] = []
    const answers: number[] = []
    for (const operation of operationLog(data)) {
      const command = asString(operation[0])
      if (command === 'push') {
        const value = asNumber(operation[1])
        stack.push({
          value,
          minimum: Math.min(value, stack.at(-1)?.minimum ?? value),
        })
      } else if (command === 'pop') {
        stack.pop()
      } else if (command === 'top') {
        answers.push(stack.at(-1)?.value ?? 0)
      } else {
        answers.push(stack.at(-1)?.minimum ?? 0)
      }
    }
    return answers
  },
  'problem:evaluate-reverse-polish-notation': (data) => {
    const stack: number[] = []
    for (const token of strings(data, 'tokens')) {
      if (!['+', '-', '*', '/'].includes(token)) {
        stack.push(Number(token))
        continue
      }
      const right = stack.pop()
      const left = stack.pop()
      if (left === undefined || right === undefined) {
        throw new Error('Invalid postfix fixture')
      }
      if (token === '+') stack.push(left + right)
      if (token === '-') stack.push(left - right)
      if (token === '*') stack.push(left * right)
      if (token === '/') stack.push(Math.trunc(left / right))
    }
    return stack[0]
  },
  'problem:generate-parentheses': (data) => {
    const pairCount = asNumber(data.pairs)
    const results: string[] = []
    const build = (path: string, opened: number, closed: number): void => {
      if (path.length === pairCount * 2) {
        results.push(path)
        return
      }
      if (opened < pairCount) build(`${path}(`, opened + 1, closed)
      if (closed < opened) build(`${path})`, opened, closed + 1)
    }
    build('', 0, 0)
    return results
  },
  'problem:daily-temperatures': (data) => {
    const temperatures = numbers(data, 'temperatures')
    const waits = Array<number>(temperatures.length).fill(0)
    const stack: number[] = []
    temperatures.forEach((temperature, day) => {
      while (
        stack.length > 0 &&
        temperature > temperatures[stack[stack.length - 1]]
      ) {
        const colderDay = stack.pop()
        if (colderDay !== undefined) waits[colderDay] = day - colderDay
      }
      stack.push(day)
    })
    return waits
  },
  'problem:car-fleet': (data) => {
    const target = asNumber(data.target)
    const positions = numbers(data, 'position')
    const speeds = numbers(data, 'speed')
    const rovers = positions
      .map((position, index) => ({ position, speed: speeds[index] }))
      .sort((left, right) => right.position - left.position)
    let fleets = 0
    let lastFleetTime = -Infinity
    for (const rover of rovers) {
      const arrival = (target - rover.position) / rover.speed
      if (arrival > lastFleetTime) {
        fleets += 1
        lastFleetTime = arrival
      }
    }
    return fleets
  },
  'problem:largest-rectangle-in-histogram': (data) => {
    const heights = [...numbers(data, 'heights'), 0]
    const stack: { start: number; height: number }[] = []
    let best = 0
    heights.forEach((height, index) => {
      let start = index
      while (stack.length > 0 && stack[stack.length - 1].height > height) {
        const ended = stack.pop()
        if (!ended) break
        best = Math.max(best, ended.height * (index - ended.start))
        start = ended.start
      }
      stack.push({ start, height })
    })
    return best
  },
  'problem:binary-search': (data) => {
    const values = numbers(data, 'nums')
    const target = asNumber(data.target)
    let low = 0
    let high = values.length - 1
    while (low <= high) {
      const mid = low + Math.floor((high - low) / 2)
      if (values[mid] === target) return mid
      if (values[mid] < target) low = mid + 1
      else high = mid - 1
    }
    return -1
  },
  'problem:search-a-2d-matrix': (data) => {
    const matrix = asArray(data.matrix).map((row) => asArray(row).map(asNumber))
    const target = asNumber(data.target)
    if (matrix.length === 0 || matrix[0].length === 0) return false
    const columnCount = matrix[0].length
    let low = 0
    let high = matrix.length * columnCount - 1
    while (low <= high) {
      const mid = low + Math.floor((high - low) / 2)
      const value = matrix[Math.floor(mid / columnCount)][mid % columnCount]
      if (value === target) return true
      if (value < target) low = mid + 1
      else high = mid - 1
    }
    return false
  },
  'problem:koko-eating-bananas': (data) => {
    const piles = numbers(data, 'piles')
    const hours = asNumber(data.hours)
    let low = 1
    let high = Math.max(...piles)
    while (low < high) {
      const speed = low + Math.floor((high - low) / 2)
      const needed = piles.reduce(
        (total, pile) => total + Math.ceil(pile / speed),
        0,
      )
      if (needed <= hours) high = speed
      else low = speed + 1
    }
    return low
  },
  'problem:find-minimum-in-rotated-sorted-array': (data) => {
    const values = numbers(data, 'nums')
    let low = 0
    let high = values.length - 1
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2)
      if (values[mid] > values[high]) low = mid + 1
      else high = mid
    }
    return values[low]
  },
  'problem:search-in-rotated-sorted-array': (data) => {
    const values = numbers(data, 'nums')
    const target = asNumber(data.target)
    let low = 0
    let high = values.length - 1
    while (low <= high) {
      const mid = low + Math.floor((high - low) / 2)
      if (values[mid] === target) return mid
      if (values[low] <= values[mid]) {
        if (values[low] <= target && target < values[mid]) high = mid - 1
        else low = mid + 1
      } else if (values[mid] < target && target <= values[high]) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return -1
  },
  'problem:time-based-key-value-store': (data) => {
    const histories = new Map<string, { time: number; value: string }[]>()
    const answers: string[] = []
    for (const operation of operationLog(data)) {
      const command = asString(operation[0])
      const key = asString(operation[1])
      if (command === 'set') {
        const versions = histories.get(key) ?? []
        versions.push({
          value: asString(operation[2]),
          time: asNumber(operation[3]),
        })
        histories.set(key, versions)
        continue
      }
      const queryTime = asNumber(operation[2])
      const versions = histories.get(key) ?? []
      let low = 0
      let high = versions.length - 1
      let answer = ''
      while (low <= high) {
        const mid = low + Math.floor((high - low) / 2)
        if (versions[mid].time <= queryTime) {
          answer = versions[mid].value
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      answers.push(answer)
    }
    return answers
  },
  'problem:median-of-two-sorted-arrays': (data) => {
    let a = numbers(data, 'a')
    let b = numbers(data, 'b')
    if (a.length > b.length) [a, b] = [b, a]
    const total = a.length + b.length
    const half = Math.floor(total / 2)
    let low = 0
    let high = a.length
    while (low <= high) {
      const cutA = low + Math.floor((high - low) / 2)
      const cutB = half - cutA
      const leftA = cutA > 0 ? a[cutA - 1] : -Infinity
      const rightA = cutA < a.length ? a[cutA] : Infinity
      const leftB = cutB > 0 ? b[cutB - 1] : -Infinity
      const rightB = cutB < b.length ? b[cutB] : Infinity
      if (leftA <= rightB && leftB <= rightA) {
        if (total % 2 === 1) return Math.min(rightA, rightB)
        return (Math.max(leftA, leftB) + Math.min(rightA, rightB)) / 2
      }
      if (leftA > rightB) high = cutA - 1
      else low = cutA + 1
    }
    throw new Error('Invalid sorted median fixture')
  },
  'problem:reverse-linked-list': (data) =>
    numbers(data, 'values').reverse(),
  'problem:merge-two-sorted-lists': (data) => {
    const left = numbers(data, 'left')
    const right = numbers(data, 'right')
    const merged: number[] = []
    let i = 0
    let j = 0
    while (i < left.length && j < right.length) {
      if (left[i] <= right[j]) merged.push(left[i++])
      else merged.push(right[j++])
    }
    return [...merged, ...left.slice(i), ...right.slice(j)]
  },
  'problem:reorder-list': (data) => {
    const values = numbers(data, 'values')
    const reordered: number[] = []
    let left = 0
    let right = values.length - 1
    while (left <= right) {
      reordered.push(values[left++])
      if (left <= right) reordered.push(values[right--])
    }
    return reordered
  },
  'problem:remove-nth-node-from-end-of-list': (data) => {
    const values = numbers(data, 'values')
    values.splice(values.length - asNumber(data.n), 1)
    return values
  },
  'problem:copy-list-with-random-pointer': (data) => ({
    values: [...numbers(data, 'values')],
    random: [...asArray(data.random)],
  }),
  'problem:add-two-numbers': (data) => {
    const left = numbers(data, 'leftDigits')
    const right = numbers(data, 'rightDigits')
    const result: number[] = []
    let carry = 0
    let index = 0
    while (index < left.length || index < right.length || carry > 0) {
      const total = (left[index] ?? 0) + (right[index] ?? 0) + carry
      result.push(total % 10)
      carry = Math.floor(total / 10)
      index += 1
    }
    return result
  },
  'problem:linked-list-cycle': (data) =>
    numbers(data, 'values').length > 0 && asNumber(data.pos) >= 0,
  'problem:find-the-duplicate-number': (data) => {
    const values = numbers(data, 'nums')
    let slow = 0
    let fast = 0
    do {
      slow = values[slow]
      fast = values[values[fast]]
    } while (slow !== fast)
    let finder = 0
    while (finder !== slow) {
      finder = values[finder]
      slow = values[slow]
    }
    return finder
  },
  'problem:lru-cache': (data) => {
    type CacheKey = string | number
    const capacity = asNumber(data.capacity)
    const cache = new Map<CacheKey, JsonValue>()
    const answers: JsonValue[] = []
    for (const operation of operationLog(data)) {
      const command = asString(operation[0])
      const keyValue = operation[1]
      if (typeof keyValue !== 'string' && typeof keyValue !== 'number') {
        throw new Error('Invalid cache key fixture')
      }
      const key: CacheKey = keyValue
      if (command === 'get') {
        const value = cache.get(key)
        if (value === undefined) {
          answers.push(-1)
        } else {
          cache.delete(key)
          cache.set(key, value)
          answers.push(value)
        }
        continue
      }
      cache.delete(key)
      cache.set(key, operation[2])
      if (cache.size > capacity) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
    }
    return answers
  },
  'problem:merge-k-sorted-lists': (data) =>
    asArray(data.lists)
      .flatMap((list) => asArray(list).map(asNumber))
      .sort((left, right) => left - right),
  'problem:reverse-nodes-in-k-group': (data) => {
    const values = numbers(data, 'values')
    const groupSize = asNumber(data.k)
    for (let start = 0; start + groupSize <= values.length; start += groupSize) {
      const reversed = values.slice(start, start + groupSize).reverse()
      values.splice(start, groupSize, ...reversed)
    }
    return values
  },
} satisfies Record<Realm2ProblemId, ReferenceSolver>

const LOADER_ENTRIES = Object.entries(
  REALM_2_PROBLEM_LESSON_LOADERS,
) as [Realm2ProblemId, ProblemLessonLoader][]

describe('NeetCode 150 Realm 2 missions', () => {
  it('covers exactly the 25 manifest missions across all three tracks', () => {
    const realmProblems = NEETCODE_150_MANIFEST.problems.filter(
      ({ realmId }) => realmId === 'realm2',
    )
    const expectedIds = realmProblems.map(({ id }) => id).sort()
    const loaderIds = LOADER_ENTRIES.map(([id]) => id).sort()

    expect(realmProblems).toHaveLength(25)
    expect(loaderIds).toEqual(expectedIds)
    expect(
      realmProblems.filter(({ trackId }) => trackId === 'stack'),
    ).toHaveLength(7)
    expect(
      realmProblems.filter(({ trackId }) => trackId === 'binary-search'),
    ).toHaveLength(7)
    expect(
      realmProblems.filter(({ trackId }) => trackId === 'linked-list'),
    ).toHaveLength(11)
  })

  it('loads, validates, and preserves the full mission evidence arc', async () => {
    for (const [problemId, loader] of LOADER_ENTRIES) {
      const lesson = unwrapLesson(await loader())
      const manifestProblem = NEETCODE_150_MANIFEST.problems.find(
        ({ id }) => id === problemId,
      )
      expect(manifestProblem).toBeDefined()
      expect(lesson).toMatchObject({
        problemId,
        curriculumId: NEETCODE_150_MANIFEST.id,
        manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
        problemContentVersion: manifestProblem?.contentVersion,
        skillIds: manifestProblem?.skillIds,
      })
      expect(validateProblemLesson(lesson, NEETCODE_150_MANIFEST)).toEqual({
        valid: true,
        issues: [],
      })
      expect(JSON.parse(JSON.stringify(lesson))).toEqual(lesson)

      const variant = lesson.variants[0]
      const stageOrder = [
        variant.explanation.id,
        variant.workedExample.id,
        variant.quizIntro.id,
        ...variant.assessments.map(({ id }) => id),
      ].map((id) => id.replace(`step:${manifestProblem?.leetcodeSlug}:`, ''))
      expect(stageOrder).toEqual(PROBLEM_MISSION_STAGE_ORDER)
      expect(
        variant.assessments.map(({ assessment }) => assessment.kind),
      ).toEqual(['singleChoice', 'shortAnswer', 'predict', 'pythonCode'])

      const expectedDiagramKind =
        manifestProblem?.trackId === 'stack'
          ? 'stack'
          : manifestProblem?.trackId === 'binary-search'
            ? 'binarySearch'
            : 'linkedList'
      expect(variant.explanation.diagram?.kind).toBe(expectedDiagramKind)
      expect(variant.workedExample.diagram?.kind).toBe(expectedDiagramKind)

      const pattern = variant.assessments[0].assessment
      const retrieval = variant.assessments[1].assessment
      const reconstruction = variant.assessments[2].assessment
      expect(pattern.kind).toBe('singleChoice')
      if (pattern.kind === 'singleChoice') {
        expect(pattern.options).toHaveLength(4)
        expect(new Set(pattern.options.map(({ id }) => id)).size).toBe(4)
        expect(pattern.options.some(({ id }) => id === pattern.correctOptionId)).toBe(
          true,
        )
      }
      expect(retrieval.kind).toBe('shortAnswer')
      if (retrieval.kind === 'shortAnswer') {
        expect(retrieval.matcher.mode).toBe('normalized')
        if (retrieval.matcher.mode === 'normalized') {
          expect(retrieval.matcher.acceptedAnswers.length).toBeGreaterThanOrEqual(2)
        }
      }
      expect(reconstruction.kind).toBe('predict')
      if (reconstruction.kind === 'predict') {
        expect(reconstruction.code.length).toBeGreaterThanOrEqual(5)
        expect(reconstruction.matcher.mode).toBe('normalized')
        if (reconstruction.matcher.mode === 'normalized') {
          expect(
            reconstruction.matcher.acceptedAnswers.length,
          ).toBeGreaterThanOrEqual(5)
        }
      }
    }
  })

  it('provides valid JSON challenges with 75 independently verified cases', async () => {
    let verifiedCaseCount = 0
    for (const [problemId, loader] of LOADER_ENTRIES) {
      const lesson = unwrapLesson(await loader())
      const python = lesson.variants[0].assessments.find(
        ({ assessment }) => assessment.kind === 'pythonCode',
      )?.assessment
      if (python?.kind !== 'pythonCode') {
        throw new Error(`Python challenge missing for ${problemId}`)
      }

      expect(python.entrypoint).toEqual({ kind: 'function', name: 'solve' })
      expect(python.codecs).toEqual({
        arguments: [{ kind: 'json' }],
        result: { kind: 'json' },
      })
      expect(python.starterCode.split('\n')).toContain('def solve(data):')
      expect(python.starterCode).toContain('pass')
      expect(
        validatePythonJudgePlan(createPythonJudgePlan(python)),
      ).toMatchObject({ valid: true })
      expect(python.cases.map(({ id }) => id)).toEqual(
        PROBLEM_MISSION_PYTHON_CASE_CLASSES.map(
          (caseClass) =>
            `case:${problemId.slice('problem:'.length)}:${caseClass}`,
        ),
      )

      for (const testCase of python.cases) {
        expect(testCase.arguments).toHaveLength(1)
        const input = asObject(testCase.arguments[0])
        const verified = REFERENCE_SOLVERS[problemId](input)
        expect(verified, testCase.id).toEqual(testCase.expected)
        verifiedCaseCount += 1
      }
    }
    expect(verifiedCaseCount).toBe(75)
  })

  it('keeps learner-facing copy original and source-marker free', async () => {
    const copiedSourceMarker =
      /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu

    for (const [, loader] of LOADER_ENTRIES) {
      const lesson = unwrapLesson(await loader())
      const variant = lesson.variants[0]
      const learnerText = [
        lesson.description,
        variant.explanation.hook ?? '',
        variant.explanation.prompt,
        ...(variant.explanation.bullets ?? []),
        variant.explanation.callout ?? '',
        variant.workedExample.prompt,
        ...variant.workedExample.code,
        ...(variant.workedExample.bullets ?? []),
        ...variant.assessments.flatMap((step) => [
          step.prompt,
          step.feedback.correct,
          step.feedback.incorrect,
          step.feedback.secondIncorrect ?? '',
          ...(step.hints ?? []),
        ]),
      ].join('\n')

      expect(learnerText).not.toMatch(copiedSourceMarker)
    }
  })
})
