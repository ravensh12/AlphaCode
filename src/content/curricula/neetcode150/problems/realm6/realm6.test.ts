import { describe, expect, it } from 'vitest'
import type { AssessmentV1 } from '../../../../../types/assessment'
import type { ProblemId } from '../../../../../types/curriculum'
import type { ProblemLessonSpecV1 } from '../../../../../types/problemLesson'
import {
  createPythonJudgePlan,
  validatePythonJudgePlan,
  validatePythonJudgeSubmission,
} from '../../../../../lib/pythonJudgeHarness'
import { validateProblemLesson } from '../../../problemLessonCompiler'
import {
  PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT,
  PROBLEM_MISSION_PYTHON_CASE_CLASSES,
  PROBLEM_MISSION_STAGE_ORDER,
  resolveProblemMissionManifestContext,
} from '../../problemMissionFactory'
import { NEETCODE_150_MANIFEST } from '../../manifest'
import type {
  ProblemLessonLoader,
  ProblemLessonLoaderResult,
} from '../../problemRegistry'
import { REALM_6_PROBLEM_LESSON_LOADERS } from './index'

const EXPECTED_PROBLEM_IDS = [
  'problem:insert-interval',
  'problem:merge-intervals',
  'problem:non-overlapping-intervals',
  'problem:meeting-rooms',
  'problem:meeting-rooms-ii',
  'problem:minimum-interval-to-include-each-query',
  'problem:rotate-image',
  'problem:spiral-matrix',
  'problem:set-matrix-zeroes',
  'problem:happy-number',
  'problem:plus-one',
  'problem:powx-n',
  'problem:multiply-strings',
  'problem:detect-squares',
  'problem:single-number',
  'problem:number-of-1-bits',
  'problem:counting-bits',
  'problem:reverse-bits',
  'problem:missing-number',
  'problem:sum-of-two-integers',
  'problem:reverse-integer',
] as const satisfies readonly ProblemId[]

type MissionData = Record<string, unknown>
type Interval = { start: number; end: number }
type Point = { x: number; y: number }
type GeometryEvent = { op: 'add' | 'count'; point: Point }
type ReferenceSolver = (data: MissionData) => unknown

function value<T>(data: MissionData, key: string): T {
  return data[key] as T
}

function unwrapLesson(result: ProblemLessonLoaderResult): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

async function loadRealmLessons(): Promise<
  readonly [ProblemId, ProblemLessonSpecV1][]
> {
  const entries = Object.entries(REALM_6_PROBLEM_LESSON_LOADERS) as [
    ProblemId,
    ProblemLessonLoader,
  ][]
  return Promise.all(
    entries.map(async ([problemId, loader]) => [
      problemId,
      unwrapLesson(await loader()),
    ]),
  )
}

function assessmentLearnerText(assessment: AssessmentV1): readonly string[] {
  switch (assessment.kind) {
    case 'singleChoice':
      return [assessment.prompt, ...assessment.options.map(({ label }) => label)]
    case 'order':
      return [assessment.prompt, ...assessment.items.map(({ label }) => label)]
    case 'predict':
    case 'trace':
      return [assessment.prompt, ...assessment.code]
    case 'pythonCode':
      return [assessment.prompt, assessment.starterCode]
    case 'shortAnswer':
      return [assessment.prompt, assessment.placeholder ?? '']
  }
}

function learnerText(spec: ProblemLessonSpecV1): readonly string[] {
  const variant = spec.variants[0]
  return [
    spec.description,
    variant.explanation.hook ?? '',
    variant.explanation.prompt,
    ...(variant.explanation.bullets ?? []),
    variant.explanation.callout ?? '',
    variant.workedExample.prompt,
    ...variant.workedExample.code,
    ...(variant.workedExample.bullets ?? []),
    variant.quizIntro.prompt,
    ...variant.assessments.flatMap((step) => [
      step.prompt,
      step.feedback.correct,
      step.feedback.incorrect,
      step.feedback.secondIncorrect ?? '',
      ...(step.hints ?? []),
      ...assessmentLearnerText(step.assessment),
    ]),
  ].filter((item) => item.length > 0)
}

const referenceSolvers: Readonly<Record<string, ReferenceSolver>> = {
  'problem:insert-interval': (data) => {
    const intervals = value<Interval[]>(data, 'intervals')
    const incoming = { ...value<Interval>(data, 'newInterval') }
    const result: Interval[] = []
    let placed = false
    for (const interval of intervals) {
      if (interval.end < incoming.start) {
        result.push({ ...interval })
      } else if (incoming.end < interval.start) {
        if (!placed) result.push({ ...incoming })
        placed = true
        result.push({ ...interval })
      } else {
        incoming.start = Math.min(incoming.start, interval.start)
        incoming.end = Math.max(incoming.end, interval.end)
      }
    }
    if (!placed) result.push(incoming)
    return result
  },
  'problem:merge-intervals': (data) => {
    const ordered = value<Interval[]>(data, 'intervals')
      .map((interval) => ({ ...interval }))
      .sort((a, b) => a.start - b.start)
    const merged: Interval[] = []
    for (const interval of ordered) {
      const last = merged.at(-1)
      if (!last || interval.start > last.end) merged.push(interval)
      else last.end = Math.max(last.end, interval.end)
    }
    return merged
  },
  'problem:non-overlapping-intervals': (data) => {
    const ordered = [...value<Interval[]>(data, 'requests')].sort(
      (a, b) => a.end - b.end,
    )
    let stageEnd = Number.NEGATIVE_INFINITY
    let removals = 0
    for (const request of ordered) {
      if (request.start >= stageEnd) stageEnd = request.end
      else removals += 1
    }
    return removals
  },
  'problem:meeting-rooms': (data) => {
    const bookings = [...value<Interval[]>(data, 'bookings')].sort(
      (a, b) => a.start - b.start,
    )
    return bookings
      .slice(1)
      .every((booking, index) => booking.start >= bookings[index].end)
  },
  'problem:meeting-rooms-ii': (data) => {
    const events = value<Interval[]>(data, 'sessions')
      .flatMap(({ start, end }) => [
        { time: start, change: 1 },
        { time: end, change: -1 },
      ])
      .sort((a, b) => a.time - b.time || a.change - b.change)
    let active = 0
    let peak = 0
    for (const event of events) {
      active += event.change
      peak = Math.max(peak, active)
    }
    return peak
  },
  'problem:minimum-interval-to-include-each-query': (data) => {
    const intervals = value<Interval[]>(data, 'intervals')
    return value<number[]>(data, 'queries').map((query) => {
      let shortest = Number.POSITIVE_INFINITY
      for (const interval of intervals) {
        if (interval.start <= query && query <= interval.end) {
          shortest = Math.min(shortest, interval.end - interval.start + 1)
        }
      }
      return Number.isFinite(shortest) ? shortest : -1
    })
  },
  'problem:rotate-image': (data) => {
    const matrix = value<number[][]>(data, 'matrix')
    const size = matrix.length
    return Array.from({ length: size }, (_, row) =>
      Array.from(
        { length: size },
        (_, column) => matrix[size - 1 - column][row],
      ),
    )
  },
  'problem:spiral-matrix': (data) => {
    const matrix = value<number[][]>(data, 'matrix')
    let top = 0
    let bottom = matrix.length - 1
    let left = 0
    let right = matrix[0].length - 1
    const order: number[] = []
    while (top <= bottom && left <= right) {
      for (let column = left; column <= right; column += 1) {
        order.push(matrix[top][column])
      }
      top += 1
      for (let row = top; row <= bottom; row += 1) {
        order.push(matrix[row][right])
      }
      right -= 1
      if (top <= bottom) {
        for (let column = right; column >= left; column -= 1) {
          order.push(matrix[bottom][column])
        }
        bottom -= 1
      }
      if (left <= right) {
        for (let row = bottom; row >= top; row -= 1) {
          order.push(matrix[row][left])
        }
        left += 1
      }
    }
    return order
  },
  'problem:set-matrix-zeroes': (data) => {
    const matrix = value<number[][]>(data, 'matrix')
    const zeroRows = new Set<number>()
    const zeroColumns = new Set<number>()
    matrix.forEach((row, rowIndex) =>
      row.forEach((cell, columnIndex) => {
        if (cell === 0) {
          zeroRows.add(rowIndex)
          zeroColumns.add(columnIndex)
        }
      }),
    )
    return matrix.map((row, rowIndex) =>
      row.map((cell, columnIndex) =>
        zeroRows.has(rowIndex) || zeroColumns.has(columnIndex) ? 0 : cell,
      ),
    )
  },
  'problem:happy-number': (data) => {
    let number = value<number>(data, 'number')
    const seen = new Set<number>()
    while (number !== 1 && !seen.has(number)) {
      seen.add(number)
      let next = 0
      while (number > 0) {
        const digit = number % 10
        next += digit * digit
        number = Math.floor(number / 10)
      }
      number = next
    }
    return number === 1
  },
  'problem:plus-one': (data) => {
    const digits = [...value<number[]>(data, 'digits')]
    for (let index = digits.length - 1; index >= 0; index -= 1) {
      if (digits[index] < 9) {
        digits[index] += 1
        return digits
      }
      digits[index] = 0
    }
    return [1, ...digits]
  },
  'problem:powx-n': (data) =>
    value<number>(data, 'base') ** value<number>(data, 'exponent'),
  'problem:multiply-strings': (data) =>
    (
      BigInt(value<string>(data, 'left')) *
      BigInt(value<string>(data, 'right'))
    ).toString(),
  'problem:detect-squares': (data) => {
    const frequencies = new Map<string, number>()
    const ysByX = new Map<number, Set<number>>()
    const key = (x: number, y: number) => `${x},${y}`
    const frequency = (x: number, y: number) =>
      frequencies.get(key(x, y)) ?? 0
    const answers: number[] = []
    for (const event of value<GeometryEvent[]>(data, 'events')) {
      const { x, y } = event.point
      if (event.op === 'add') {
        frequencies.set(key(x, y), frequency(x, y) + 1)
        const ys = ysByX.get(x) ?? new Set<number>()
        ys.add(y)
        ysByX.set(x, ys)
        continue
      }
      let total = 0
      for (const otherY of ysByX.get(x) ?? []) {
        if (otherY === y) continue
        const side = Math.abs(otherY - y)
        for (const direction of [-1, 1]) {
          const otherX = x + direction * side
          total +=
            frequency(x, otherY) *
            frequency(otherX, y) *
            frequency(otherX, otherY)
        }
      }
      answers.push(total)
    }
    return answers
  },
  'problem:single-number': (data) =>
    value<number[]>(data, 'values').reduce(
      (answer, current) => answer ^ current,
      0,
    ),
  'problem:number-of-1-bits': (data) => {
    const width = BigInt(value<number>(data, 'bitWidth'))
    let bits = BigInt(value<number>(data, 'value')) & ((1n << width) - 1n)
    let count = 0
    while (bits !== 0n) {
      bits &= bits - 1n
      count += 1
    }
    return count
  },
  'problem:counting-bits': (data) => {
    const limit = value<number>(data, 'limit')
    const counts = Array.from({ length: limit + 1 }, () => 0)
    for (let current = 1; current <= limit; current += 1) {
      counts[current] = counts[current >> 1] + (current & 1)
    }
    return counts
  },
  'problem:reverse-bits': (data) => {
    const width = BigInt(value<number>(data, 'bitWidth'))
    let bits = BigInt(value<number>(data, 'value')) & ((1n << width) - 1n)
    let reversed = 0n
    for (let index = 0n; index < width; index += 1n) {
      reversed = (reversed << 1n) | (bits & 1n)
      bits >>= 1n
    }
    return Number(reversed)
  },
  'problem:missing-number': (data) => {
    const values = value<number[]>(data, 'values')
    let answer = value<{ end: number }>(data, 'domain').end
    values.forEach((current, index) => {
      answer ^= index ^ current
    })
    return answer
  },
  'problem:sum-of-two-integers': (data) => {
    const width = BigInt(value<number>(data, 'bitWidth'))
    const modulus = 1n << width
    const mask = modulus - 1n
    let result =
      (BigInt(value<number>(data, 'left')) +
        BigInt(value<number>(data, 'right'))) &
      mask
    if (value<boolean>(data, 'signed') && result >= modulus >> 1n) {
      result -= modulus
    }
    return Number(result)
  },
  'problem:reverse-integer': (data) => {
    const input = value<number>(data, 'value')
    const width = value<number>(data, 'bitWidth')
    const sign = input < 0 ? -1 : 1
    let remaining = Math.abs(input)
    let reversed = 0
    while (remaining > 0) {
      reversed = reversed * 10 + (remaining % 10)
      remaining = Math.floor(remaining / 10)
    }
    reversed *= sign
    const minimum = -(2 ** (width - 1))
    const maximum = 2 ** (width - 1) - 1
    return reversed < minimum || reversed > maximum ? 0 : reversed
  },
}

function pythonAssessment(spec: ProblemLessonSpecV1) {
  const assessment = spec.variants[0].assessments.find(
    (step) => step.assessment.kind === 'pythonCode',
  )?.assessment
  if (assessment?.kind !== 'pythonCode') {
    throw new Error(`Python challenge missing for ${spec.problemId}`)
  }
  return assessment
}

describe('Realm 6 problem missions', () => {
  it('covers exactly the 21 Realm 6 manifest problems with typed lazy loaders', () => {
    const loaderIds = Object.keys(REALM_6_PROBLEM_LESSON_LOADERS).sort()
    const manifestIds = NEETCODE_150_MANIFEST.problems
      .filter(({ realmId }) => realmId === 'realm6')
      .map(({ id }) => id)
      .sort()

    expect(loaderIds).toHaveLength(21)
    expect(loaderIds).toEqual([...EXPECTED_PROBLEM_IDS].sort())
    expect(loaderIds).toEqual(manifestIds)
    expect(Object.keys(referenceSolvers).sort()).toEqual(loaderIds)
  })

  it('loads, validates, and preserves manifest-owned metadata and provenance', async () => {
    const lessons = await loadRealmLessons()
    for (const [problemId, lesson] of lessons) {
      expect(lesson.problemId).toBe(problemId)
      expect(validateProblemLesson(lesson, NEETCODE_150_MANIFEST)).toEqual({
        valid: true,
        issues: [],
      })
      const slug = problemId.replace('problem:', '')
      const context = resolveProblemMissionManifestContext(slug)
      expect(lesson).toMatchObject({
        curriculumId: NEETCODE_150_MANIFEST.id,
        manifestContentVersion: NEETCODE_150_MANIFEST.version.content,
        problemContentVersion: context.problem.contentVersion,
        skillIds: context.problem.skillIds,
      })
      expect(context.problem.provenance).toMatchObject({
        promptsAndStatements: 'original',
        copiedSourceMaterial: false,
      })
      expect(context.provenanceSources.map(({ id }) => id)).toEqual([
        context.problem.provenance.primaryReferenceSourceId,
        context.problem.provenance.curriculumVerificationSourceId,
        ...context.problem.provenance.pedagogySourceIds,
      ])
      expect(JSON.parse(JSON.stringify(lesson))).toEqual(lesson)
    }
  })

  it('provides every learning stage, evidence kind, and required assessment', async () => {
    const lessons = await loadRealmLessons()
    for (const [problemId, lesson] of lessons) {
      const slug = problemId.replace('problem:', '')
      const variant = lesson.variants[0]
      const stages = [
        variant.explanation,
        variant.workedExample,
        variant.quizIntro,
        ...variant.assessments,
      ].map(({ id }) => id.replace(`step:${slug}:`, ''))
      expect(stages).toEqual(PROBLEM_MISSION_STAGE_ORDER)
      expect(
        variant.assessments.map(({ assessment }) => assessment.kind),
      ).toEqual(['singleChoice', 'shortAnswer', 'predict', 'pythonCode'])
      expect(
        variant.assessments.map(
          ({ assessment }) => assessment.evidenceKind,
        ),
      ).toEqual([
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['pattern-check'],
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['typed-retrieval'],
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['algorithm-reconstruction'],
        PROBLEM_MISSION_EVIDENCE_BY_ASSESSMENT['python-transfer'],
      ])
      expect(variant.workedExample.code.length).toBeGreaterThan(0)
      expect(variant.workedExample.bullets?.length).toBeGreaterThan(2)

      const choice = variant.assessments[0].assessment
      const retrieval = variant.assessments[1].assessment
      const reconstruction = variant.assessments[2].assessment
      expect(choice.kind).toBe('singleChoice')
      if (choice.kind === 'singleChoice') {
        expect(choice.options.length).toBeGreaterThanOrEqual(3)
        expect(new Set(choice.options.map(({ label }) => label)).size).toBe(
          choice.options.length,
        )
      }
      expect(retrieval.kind).toBe('shortAnswer')
      if (retrieval.kind === 'shortAnswer') {
        expect(retrieval.matcher.mode).toBe('normalized')
        if (retrieval.matcher.mode === 'normalized') {
          expect(retrieval.matcher.acceptedAnswers.length).toBeGreaterThan(0)
        }
      }
      expect(reconstruction.kind).toBe('predict')
      if (reconstruction.kind === 'predict') {
        expect(reconstruction.code.length).toBeGreaterThanOrEqual(3)
        expect(reconstruction.matcher.mode).toBe('normalized')
      }
    }
  })

  it('uses suitable Realm 6 diagrams and original learner-facing stories', async () => {
    const lessons = await loadRealmLessons()
    const hooks = new Set<string>()
    const copiedSourceMarker =
      /\b(?:leetcode|neetcode)\b|(?:^|\n)\s*(?:example\s+\d+|constraints?)\s*:/iu

    for (const [problemId, lesson] of lessons) {
      const manifestProblem = NEETCODE_150_MANIFEST.problems.find(
        ({ id }) => id === problemId,
      )
      expect(manifestProblem).toBeDefined()
      const variant = lesson.variants[0]
      const hook = variant.explanation.hook ?? ''
      hooks.add(hook)
      expect(hook.trim().toLocaleLowerCase()).not.toBe(
        manifestProblem?.title.trim().toLocaleLowerCase(),
      )
      expect(variant.explanation.prompt.trim().toLocaleLowerCase()).not.toBe(
        manifestProblem?.title.trim().toLocaleLowerCase(),
      )
      expect(learnerText(lesson).join('\n')).not.toMatch(copiedSourceMarker)

      const expectedKind =
        manifestProblem?.trackId === 'intervals'
          ? 'intervals'
          : manifestProblem?.trackId === 'math-geometry'
            ? 'grid'
            : 'bits'
      expect(variant.explanation.diagram?.kind).toBe(expectedKind)
      expect(variant.workedExample.diagram).toBeDefined()
      expect(variant.assessments[0].diagram).toBeDefined()
      expect(variant.assessments[3].diagram).toBeDefined()
    }
    expect(hooks.size).toBe(21)
  })

  it('builds valid JSON solve challenges with all mandatory case classes', async () => {
    const lessons = await loadRealmLessons()
    for (const [problemId, lesson] of lessons) {
      const python = pythonAssessment(lesson)
      expect(python.entrypoint).toEqual({ kind: 'function', name: 'solve' })
      expect(python.codecs).toEqual({
        arguments: [{ kind: 'json' }],
        result: { kind: 'json' },
      })
      expect(python.starterCode.split('\n')).toContain('def solve(data):')
      expect(
        validatePythonJudgeSubmission(python, {
          kind: 'pythonCode',
          code: python.starterCode,
        }),
      ).toMatchObject({ valid: true })
      expect(validatePythonJudgePlan(createPythonJudgePlan(python))).toMatchObject(
        { valid: true },
      )
      expect(python.cases).toHaveLength(3)
      expect(python.cases.map(({ id }) => id)).toEqual(
        PROBLEM_MISSION_PYTHON_CASE_CLASSES.map(
          (caseClass) =>
            `case:${problemId.replace('problem:', '')}:${caseClass}`,
        ),
      )
      expect(python.cases.map(({ visibility }) => visibility)).toEqual([
        'example',
        'hidden',
        'hidden',
      ])
      expect(python.cases.every(({ arguments: args }) => args.length === 1)).toBe(
        true,
      )
      expect(
        python.cases.every(
          ({ arguments: [input] }) =>
            typeof input === 'object' &&
            input !== null &&
            !Array.isArray(input),
        ),
      ).toBe(true)
    }
  })

  it('matches all visible, boundary, and adversarial expectations', async () => {
    const lessons = await loadRealmLessons()
    for (const [problemId, lesson] of lessons) {
      const solveReference = referenceSolvers[problemId]
      expect(solveReference).toBeDefined()
      for (const testCase of pythonAssessment(lesson).cases) {
        const input = structuredClone(testCase.arguments[0]) as MissionData
        expect(
          solveReference(input),
          `${problemId} failed ${testCase.id}`,
        ).toEqual(testCase.expected)
      }
    }
  })

  it('represents intervals, matrices, geometry events, and bit modes explicitly', async () => {
    const lessons = new Map(await loadRealmLessons())
    const intervalFields: Readonly<Record<string, string>> = {
      'problem:insert-interval': 'intervals',
      'problem:merge-intervals': 'intervals',
      'problem:non-overlapping-intervals': 'requests',
      'problem:meeting-rooms': 'bookings',
      'problem:meeting-rooms-ii': 'sessions',
      'problem:minimum-interval-to-include-each-query': 'intervals',
    }
    for (const [problemId, field] of Object.entries(intervalFields)) {
      const lesson = lessons.get(problemId as ProblemId)
      expect(lesson).toBeDefined()
      for (const testCase of pythonAssessment(lesson as ProblemLessonSpecV1)
        .cases) {
        const data = testCase.arguments[0] as MissionData
        const intervals = value<Interval[]>(data, field)
        expect(
          intervals.every(
            (interval) =>
              typeof interval.start === 'number' &&
              typeof interval.end === 'number',
          ),
        ).toBe(true)
      }
    }

    for (const problemId of [
      'problem:rotate-image',
      'problem:spiral-matrix',
      'problem:set-matrix-zeroes',
    ] as const) {
      const lesson = lessons.get(problemId)
      expect(
        pythonAssessment(lesson as ProblemLessonSpecV1).cases.every(
          ({ arguments: [input] }) =>
            Array.isArray((input as MissionData).matrix),
        ),
      ).toBe(true)
    }

    const geometryLesson = lessons.get('problem:detect-squares')
    for (const testCase of pythonAssessment(
      geometryLesson as ProblemLessonSpecV1,
    ).cases) {
      const events = value<GeometryEvent[]>(
        testCase.arguments[0] as MissionData,
        'events',
      )
      expect(
        events.every(
          ({ op, point }) =>
            (op === 'add' || op === 'count') &&
            typeof point.x === 'number' &&
            typeof point.y === 'number',
        ),
      ).toBe(true)
    }

    for (const problemId of EXPECTED_PROBLEM_IDS.slice(14)) {
      const lesson = lessons.get(problemId)
      for (const testCase of pythonAssessment(
        lesson as ProblemLessonSpecV1,
      ).cases) {
        const data = testCase.arguments[0] as MissionData
        expect(typeof data.bitWidth).toBe('number')
        expect(typeof data.signed).toBe('boolean')
      }
    }
    for (const problemId of [
      'problem:sum-of-two-integers',
      'problem:reverse-integer',
    ] as const) {
      const lesson = lessons.get(problemId)
      expect(
        pythonAssessment(lesson as ProblemLessonSpecV1).cases.every(
          ({ arguments: [input] }) =>
            (input as MissionData).signed === true,
        ),
      ).toBe(true)
    }
  })
})
