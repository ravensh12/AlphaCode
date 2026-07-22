import type { ProblemId } from '../../../../../types/curriculum'
import type { JsonValue } from '../../../../../types/learning'
import {
  defineProblemMissionOracle,
  defineProblemMissionOracleRegistry,
  type ProblemMissionMutant,
  type PureJsonProblemSolver,
} from '../oracleContract'

type JsonObject = Readonly<Record<string, JsonValue>>
type CacheKey = string | number

function readObject(input: JsonValue, label: string): JsonObject {
  if (input === null || Array.isArray(input) || typeof input !== 'object') {
    throw new TypeError(`${label} must be a JSON object`)
  }
  return input as JsonObject
}

function readField(
  object: JsonObject,
  key: string,
  label: string,
): JsonValue {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    throw new TypeError(`${label}.${key} is required`)
  }
  return object[key] as JsonValue
}

function readArray(value: JsonValue, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`)
  }
  return value
}

function readString(value: JsonValue, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`)
  }
  return value
}

function readNumber(value: JsonValue, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`)
  }
  return value
}

function readInteger(value: JsonValue, label: string): number {
  const number = readNumber(value, label)
  if (!Number.isSafeInteger(number)) {
    throw new TypeError(`${label} must be a safe integer`)
  }
  return number
}

function readNonNegativeInteger(value: JsonValue, label: string): number {
  const integer = readInteger(value, label)
  if (integer < 0) {
    throw new TypeError(`${label} must be nonnegative`)
  }
  return integer
}

function readPositiveInteger(value: JsonValue, label: string): number {
  const integer = readInteger(value, label)
  if (integer <= 0) {
    throw new TypeError(`${label} must be positive`)
  }
  return integer
}

function readNumberArray(value: JsonValue, label: string): readonly number[] {
  return readArray(value, label).map((entry, index) =>
    readNumber(entry, `${label}[${index}]`),
  )
}

function readIntegerArray(value: JsonValue, label: string): readonly number[] {
  return readArray(value, label).map((entry, index) =>
    readInteger(entry, `${label}[${index}]`),
  )
}

function readStringArray(value: JsonValue, label: string): readonly string[] {
  return readArray(value, label).map((entry, index) =>
    readString(entry, `${label}[${index}]`),
  )
}

function assertSorted(values: readonly number[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]! > values[index]!) {
      throw new TypeError(`${label} must be sorted in nondecreasing order`)
    }
  }
}

function readCacheKey(value: JsonValue, label: string): CacheKey {
  if (typeof value === 'string') return value
  return readNumber(value, label)
}

function readOperation(
  value: JsonValue,
  label: string,
): readonly JsonValue[] {
  const operation = readArray(value, label)
  if (operation.length === 0) {
    throw new TypeError(`${label} must include a command`)
  }
  return operation
}

function requireLength(
  operation: readonly JsonValue[],
  expected: number,
  label: string,
): void {
  if (operation.length !== expected) {
    throw new TypeError(`${label} must contain ${expected} items`)
  }
}

function defineTwoMutantOracle(
  problemId: ProblemId,
  solve: PureJsonProblemSolver,
  firstMutant: ProblemMissionMutant,
  secondMutant: ProblemMissionMutant,
) {
  return defineProblemMissionOracle({
    problemId,
    solve,
    mutants: [firstMutant, secondMutant],
  })
}

function readBrackets(input: JsonValue): string {
  const object = readObject(input, 'Valid Parentheses input')
  return readString(
    readField(object, 'brackets', 'Valid Parentheses input'),
    'Valid Parentheses input.brackets',
  )
}

function solveValidParentheses(input: JsonValue): JsonValue {
  const stack: string[] = []
  const closerToOpener: Readonly<Record<string, string>> = {
    ')': '(',
    ']': '[',
    '}': '{',
  }

  for (const symbol of readBrackets(input)) {
    if (symbol === '(' || symbol === '[' || symbol === '{') {
      stack.push(symbol)
      continue
    }
    const opener = closerToOpener[symbol]
    if (opener === undefined || stack.pop() !== opener) return false
  }
  return stack.length === 0
}

function solveValidParenthesesIgnoringOrder(input: JsonValue): JsonValue {
  const counts = new Map<string, number>()
  const matching: Readonly<Record<string, string>> = {
    ')': '(',
    ']': '[',
    '}': '{',
  }

  for (const symbol of readBrackets(input)) {
    if (symbol === '(' || symbol === '[' || symbol === '{') {
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
      continue
    }
    const opener = matching[symbol]
    if (opener === undefined || (counts.get(opener) ?? 0) === 0) return false
    counts.set(opener, counts.get(opener)! - 1)
  }
  return [...counts.values()].every((count) => count === 0)
}

function solveValidParenthesesIgnoringTypes(input: JsonValue): JsonValue {
  const stack: string[] = []
  const closers = new Set([')', ']', '}'])

  for (const symbol of readBrackets(input)) {
    if (symbol === '(' || symbol === '[' || symbol === '{') {
      stack.push(symbol)
    } else if (!closers.has(symbol) || stack.pop() === undefined) {
      return false
    }
  }
  return stack.length === 0
}

type MinStackOperation =
  | { readonly command: 'push'; readonly value: number }
  | { readonly command: 'pop' | 'top' | 'min' }

function readMinStackOperations(input: JsonValue): readonly MinStackOperation[] {
  const object = readObject(input, 'Min Stack input')
  const operations = readArray(
    readField(object, 'operations', 'Min Stack input'),
    'Min Stack input.operations',
  )

  return operations.map((entry, index) => {
    const label = `Min Stack input.operations[${index}]`
    const operation = readOperation(entry, label)
    const command = readString(operation[0] as JsonValue, `${label}[0]`)
    if (command === 'push') {
      requireLength(operation, 2, label)
      return {
        command,
        value: readNumber(operation[1] as JsonValue, `${label}[1]`),
      }
    }
    if (command === 'pop' || command === 'top' || command === 'min') {
      requireLength(operation, 1, label)
      return { command }
    }
    throw new TypeError(`${label}[0] has an unknown command`)
  })
}

function solveMinStack(input: JsonValue): JsonValue {
  const stack: Array<readonly [number, number]> = []
  const answers: number[] = []

  for (const operation of readMinStackOperations(input)) {
    if (operation.command === 'push') {
      const priorMinimum = stack.at(-1)?.[1]
      stack.push([
        operation.value,
        priorMinimum === undefined
          ? operation.value
          : Math.min(operation.value, priorMinimum),
      ])
    } else if (operation.command === 'pop') {
      if (stack.pop() === undefined) {
        throw new TypeError('Min Stack cannot pop an empty stack')
      }
    } else {
      const top = stack.at(-1)
      if (top === undefined) {
        throw new TypeError(`Min Stack cannot ${operation.command} an empty stack`)
      }
      answers.push(operation.command === 'top' ? top[0] : top[1])
    }
  }
  return answers
}

function solveMinStackDroppingDuplicateMinimum(input: JsonValue): JsonValue {
  const values: number[] = []
  const minimums: number[] = []
  const answers: Array<number | null> = []

  for (const operation of readMinStackOperations(input)) {
    if (operation.command === 'push') {
      values.push(operation.value)
      const minimum = minimums.at(-1)
      if (minimum === undefined || operation.value < minimum) {
        minimums.push(operation.value)
      }
    } else if (operation.command === 'pop') {
      const removed = values.pop()
      if (removed === undefined) {
        throw new TypeError('Min Stack cannot pop an empty stack')
      }
      if (removed === minimums.at(-1)) minimums.pop()
    } else if (operation.command === 'top') {
      answers.push(values.at(-1) ?? null)
    } else {
      answers.push(minimums.at(-1) ?? null)
    }
  }
  return answers
}

function solveMinStackWithStaleMinimum(input: JsonValue): JsonValue {
  const values: number[] = []
  const minimums: number[] = []
  const answers: number[] = []

  for (const operation of readMinStackOperations(input)) {
    if (operation.command === 'push') {
      values.push(operation.value)
      minimums.push(
        Math.min(operation.value, minimums.at(-1) ?? operation.value),
      )
    } else if (operation.command === 'pop') {
      if (values.pop() === undefined) {
        throw new TypeError('Min Stack cannot pop an empty stack')
      }
    } else if (operation.command === 'top') {
      const top = values.at(-1)
      if (top === undefined) {
        throw new TypeError('Min Stack cannot top an empty stack')
      }
      answers.push(top)
    } else {
      const minimum = minimums.at(-1)
      if (minimum === undefined) {
        throw new TypeError('Min Stack cannot min an empty stack')
      }
      answers.push(minimum)
    }
  }
  return answers
}

function readRpnTokens(input: JsonValue): readonly string[] {
  const object = readObject(input, 'RPN input')
  return readStringArray(
    readField(object, 'tokens', 'RPN input'),
    'RPN input.tokens',
  )
}

function evaluateRpn(
  input: JsonValue,
  reverseOperands: boolean,
  floorDivision = false,
): JsonValue {
  const stack: number[] = []

  for (const token of readRpnTokens(input)) {
    if (token !== '+' && token !== '-' && token !== '*' && token !== '/') {
      if (!/^-?\d+$/.test(token)) {
        throw new TypeError(`RPN token "${token}" is not an integer`)
      }
      const value = Number(token)
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`RPN token "${token}" is outside the safe range`)
      }
      stack.push(value)
      continue
    }

    const right = stack.pop()
    const left = stack.pop()
    if (left === undefined || right === undefined) {
      throw new TypeError('RPN expression has too few operands')
    }
    const first = reverseOperands ? right : left
    const second = reverseOperands ? left : right
    let result: number
    if (token === '+') result = first + second
    else if (token === '-') result = first - second
    else if (token === '*') result = first * second
    else {
      if (second === 0) throw new TypeError('RPN division by zero')
      result = floorDivision
        ? Math.floor(first / second)
        : Math.trunc(first / second)
    }
    if (!Number.isFinite(result)) {
      throw new TypeError('RPN result is not finite')
    }
    stack.push(result)
  }

  if (stack.length !== 1) {
    throw new TypeError('RPN expression must leave exactly one result')
  }
  return stack[0]!
}

function solveRpn(input: JsonValue): JsonValue {
  return evaluateRpn(input, false)
}

function solveRpnReversedOperands(input: JsonValue): JsonValue {
  return evaluateRpn(input, true)
}

function solveRpnFloorDivision(input: JsonValue): JsonValue {
  return evaluateRpn(input, false, true)
}

function readPairs(input: JsonValue): number {
  const object = readObject(input, 'Generate Parentheses input')
  return readNonNegativeInteger(
    readField(object, 'pairs', 'Generate Parentheses input'),
    'Generate Parentheses input.pairs',
  )
}

function generateParentheses(
  input: JsonValue,
  allowPrematureClose: boolean,
  closeFirst = false,
): JsonValue {
  const pairs = readPairs(input)
  const results: string[] = []
  const path: string[] = []

  function build(opened: number, closed: number): void {
    if (opened === pairs && closed === pairs) {
      results.push(path.join(''))
      return
    }
    const open = () => {
      if (opened < pairs) {
        path.push('(')
        build(opened + 1, closed)
        path.pop()
      }
    }
    const close = () => {
      if (closed < (allowPrematureClose ? pairs : opened)) {
        path.push(')')
        build(opened, closed + 1)
        path.pop()
      }
    }
    if (closeFirst) {
      close()
      open()
    } else {
      open()
      close()
    }
  }

  build(0, 0)
  return results
}

function solveGenerateParentheses(input: JsonValue): JsonValue {
  return generateParentheses(input, false)
}

function solveGenerateParenthesesWithPrematureClose(input: JsonValue): JsonValue {
  return generateParentheses(input, true)
}

function solveGenerateParenthesesLeakingPath(input: JsonValue): JsonValue {
  const pairs = readPairs(input)
  const results: string[] = []
  const path: string[] = []

  function build(opened: number, closed: number): void {
    if (opened === pairs && closed === pairs) {
      results.push(path.join(''))
      return
    }
    if (opened < pairs) {
      path.push('(')
      build(opened + 1, closed)
    }
    if (closed < opened) {
      path.push(')')
      build(opened, closed + 1)
      path.pop()
    }
  }

  build(0, 0)
  return results
}

function readTemperatures(input: JsonValue): readonly number[] {
  const object = readObject(input, 'Daily Temperatures input')
  return readNumberArray(
    readField(object, 'temperatures', 'Daily Temperatures input'),
    'Daily Temperatures input.temperatures',
  )
}

function solveDailyTemperatures(input: JsonValue): JsonValue {
  const temperatures = readTemperatures(input)
  const waits = Array<number>(temperatures.length).fill(0)
  const unresolved: number[] = []

  for (let day = 0; day < temperatures.length; day += 1) {
    while (
      unresolved.length > 0 &&
      temperatures[day]! > temperatures[unresolved.at(-1)!]!
    ) {
      const priorDay = unresolved.pop()!
      waits[priorDay] = day - priorDay
    }
    unresolved.push(day)
  }
  return waits
}

function solveDailyTemperaturesSinglePop(input: JsonValue): JsonValue {
  const temperatures = readTemperatures(input)
  const waits = Array<number>(temperatures.length).fill(0)
  const unresolved: number[] = []

  for (let day = 0; day < temperatures.length; day += 1) {
    const priorDay = unresolved.at(-1)
    if (
      priorDay !== undefined &&
      temperatures[day]! > temperatures[priorDay]!
    ) {
      unresolved.pop()
      waits[priorDay] = day - priorDay
    }
    unresolved.push(day)
  }
  return waits
}

function solveDailyTemperaturesOneDayWait(input: JsonValue): JsonValue {
  const temperatures = readTemperatures(input)
  const waits = Array<number>(temperatures.length).fill(0)
  const unresolved: number[] = []

  for (let day = 0; day < temperatures.length; day += 1) {
    while (
      unresolved.length > 0 &&
      temperatures[day]! > temperatures[unresolved.at(-1)!]!
    ) {
      waits[unresolved.pop()!] = 1
    }
    unresolved.push(day)
  }
  return waits
}

type CarFleetInput = {
  readonly target: number
  readonly rovers: readonly {
    readonly position: number
    readonly speed: number
  }[]
}

function readCarFleetInput(input: JsonValue): CarFleetInput {
  const object = readObject(input, 'Car Fleet input')
  const target = readNumber(
    readField(object, 'target', 'Car Fleet input'),
    'Car Fleet input.target',
  )
  const positions = readNumberArray(
    readField(object, 'position', 'Car Fleet input'),
    'Car Fleet input.position',
  )
  const speeds = readNumberArray(
    readField(object, 'speed', 'Car Fleet input'),
    'Car Fleet input.speed',
  )
  if (positions.length !== speeds.length) {
    throw new TypeError('Car Fleet position and speed lengths must match')
  }
  return {
    target,
    rovers: positions.map((position, index) => {
      const speed = speeds[index]!
      if (speed <= 0) throw new TypeError('Car Fleet speeds must be positive')
      if (position >= target) {
        throw new TypeError('Car Fleet positions must be before target')
      }
      return { position, speed }
    }),
  }
}

function countCarFleets(input: JsonValue, splitEqualArrivals: boolean): JsonValue {
  const { target, rovers } = readCarFleetInput(input)
  const arrivalTimes: number[] = []
  const sorted = [...rovers].sort((left, right) => right.position - left.position)

  for (const { position, speed } of sorted) {
    const arrival = (target - position) / speed
    const fleetAhead = arrivalTimes.at(-1)
    if (
      fleetAhead === undefined ||
      (splitEqualArrivals ? arrival >= fleetAhead : arrival > fleetAhead)
    ) {
      arrivalTimes.push(arrival)
    }
  }
  return arrivalTimes.length
}

function solveCarFleet(input: JsonValue): JsonValue {
  return countCarFleets(input, false)
}

function solveCarFleetSplittingTies(input: JsonValue): JsonValue {
  return countCarFleets(input, true)
}

function solveCarFleetAscendingPositions(input: JsonValue): JsonValue {
  const { target, rovers } = readCarFleetInput(input)
  const arrivalTimes: number[] = []
  const sorted = [...rovers].sort((left, right) => left.position - right.position)

  for (const { position, speed } of sorted) {
    const arrival = (target - position) / speed
    if (arrivalTimes.length === 0 || arrival > arrivalTimes.at(-1)!) {
      arrivalTimes.push(arrival)
    }
  }
  return arrivalTimes.length
}

function readHeights(input: JsonValue): readonly number[] {
  const object = readObject(input, 'Histogram input')
  const heights = readNumberArray(
    readField(object, 'heights', 'Histogram input'),
    'Histogram input.heights',
  )
  if (heights.some((height) => height < 0)) {
    throw new TypeError('Histogram heights must be nonnegative')
  }
  return heights
}

function largestRectangle(input: JsonValue, flushStack: boolean): JsonValue {
  const heights = readHeights(input)
  const scan = flushStack ? [...heights, 0] : [...heights]
  const stack: Array<readonly [start: number, height: number]> = []
  let best = 0

  for (let index = 0; index < scan.length; index += 1) {
    const height = scan[index]!
    let start = index
    while (stack.length > 0 && stack.at(-1)![1] > height) {
      const [priorStart, priorHeight] = stack.pop()!
      best = Math.max(best, priorHeight * (index - priorStart))
      start = priorStart
    }
    stack.push([start, height])
  }
  return best
}

function solveLargestRectangle(input: JsonValue): JsonValue {
  return largestRectangle(input, true)
}

function solveLargestRectangleWithoutFlush(input: JsonValue): JsonValue {
  return largestRectangle(input, false)
}

function solveLargestRectangleOffByOneWidth(input: JsonValue): JsonValue {
  const heights = [...readHeights(input), 0]
  const stack: Array<readonly [start: number, height: number]> = []
  let best = 0

  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index]!
    let start = index
    while (stack.length > 0 && stack.at(-1)![1] > height) {
      const [priorStart, priorHeight] = stack.pop()!
      best = Math.max(best, priorHeight * Math.max(0, index - priorStart - 1))
      start = priorStart
    }
    stack.push([start, height])
  }
  return best
}

type NumsAndTarget = {
  readonly nums: readonly number[]
  readonly target: number
}

function readNumsAndTarget(input: JsonValue, label: string): NumsAndTarget {
  const object = readObject(input, `${label} input`)
  return {
    nums: readNumberArray(
      readField(object, 'nums', `${label} input`),
      `${label} input.nums`,
    ),
    target: readNumber(
      readField(object, 'target', `${label} input`),
      `${label} input.target`,
    ),
  }
}

function solveBinarySearch(input: JsonValue): JsonValue {
  const { nums, target } = readNumsAndTarget(input, 'Binary Search')
  assertSorted(nums, 'Binary Search input.nums')
  let low = 0
  let high = nums.length - 1

  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    const value = nums[mid]!
    if (value === target) return mid
    if (value < target) low = mid + 1
    else high = mid - 1
  }
  return -1
}

function solveBinarySearchReturningInsertionPoint(input: JsonValue): JsonValue {
  const { nums, target } = readNumsAndTarget(input, 'Binary Search')
  assertSorted(nums, 'Binary Search input.nums')
  let low = 0
  let high = nums.length - 1

  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    const value = nums[mid]!
    if (value === target) return mid
    if (value < target) low = mid + 1
    else high = mid - 1
  }
  return low
}

function solveBinarySearchDiscardingTargetHalf(input: JsonValue): JsonValue {
  const { nums, target } = readNumsAndTarget(input, 'Binary Search')
  assertSorted(nums, 'Binary Search input.nums')
  let low = 0
  let high = nums.length - 1

  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    const value = nums[mid]!
    if (value === target) return mid
    if (value < target) high = mid - 1
    else low = mid + 1
  }
  return -1
}

type MatrixSearchInput = {
  readonly matrix: readonly (readonly number[])[]
  readonly target: number
}

function readMatrixSearchInput(input: JsonValue): MatrixSearchInput {
  const object = readObject(input, 'Matrix Search input')
  const rows = readArray(
    readField(object, 'matrix', 'Matrix Search input'),
    'Matrix Search input.matrix',
  ).map((row, index) =>
    readNumberArray(row, `Matrix Search input.matrix[${index}]`),
  )
  const columns = rows[0]?.length ?? 0
  if (rows.some((row) => row.length !== columns)) {
    throw new TypeError('Matrix Search input.matrix must be rectangular')
  }
  const flattened = rows.flat()
  assertSorted(flattened, 'Matrix Search input.matrix')
  return {
    matrix: rows,
    target: readNumber(
      readField(object, 'target', 'Matrix Search input'),
      'Matrix Search input.target',
    ),
  }
}

function solveMatrixSearch(input: JsonValue): JsonValue {
  const { matrix, target } = readMatrixSearchInput(input)
  if (matrix.length === 0 || matrix[0]!.length === 0) return false
  const columns = matrix[0]!.length
  let low = 0
  let high = matrix.length * columns - 1

  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    const value = matrix[Math.floor(mid / columns)]![mid % columns]!
    if (value === target) return true
    if (value < target) low = mid + 1
    else high = mid - 1
  }
  return false
}

function solveMatrixSearchFirstRowOnly(input: JsonValue): JsonValue {
  const { matrix, target } = readMatrixSearchInput(input)
  return matrix[0]?.includes(target) ?? false
}

function solveMatrixSearchCheckingUpperBound(input: JsonValue): JsonValue {
  const { matrix, target } = readMatrixSearchInput(input)
  const flattened = matrix.flat()
  let low = 0
  let high = flattened.length - 1

  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    if (flattened[mid]! <= target) low = mid + 1
    else high = mid - 1
  }
  return low < flattened.length && flattened[low] === target
}

type KokoInput = {
  readonly piles: readonly number[]
  readonly hours: number
}

function readKokoInput(input: JsonValue): KokoInput {
  const object = readObject(input, 'Koko input')
  const piles = readIntegerArray(
    readField(object, 'piles', 'Koko input'),
    'Koko input.piles',
  )
  if (piles.length === 0 || piles.some((pile) => pile <= 0)) {
    throw new TypeError('Koko input.piles must contain positive integers')
  }
  const hours = readPositiveInteger(
    readField(object, 'hours', 'Koko input'),
    'Koko input.hours',
  )
  if (hours < piles.length) {
    throw new TypeError('Koko input.hours cannot be less than pile count')
  }
  return { piles, hours }
}

function minimumEatingSpeed(input: JsonValue, roundDown: boolean): JsonValue {
  const { piles, hours } = readKokoInput(input)
  let low = 1
  let high = Math.max(...piles)

  while (low < high) {
    const speed = low + Math.floor((high - low) / 2)
    const needed = piles.reduce(
      (total, pile) =>
        total + (roundDown ? Math.floor(pile / speed) : Math.ceil(pile / speed)),
      0,
    )
    if (needed <= hours) high = speed
    else low = speed + 1
  }
  return low
}

function solveKoko(input: JsonValue): JsonValue {
  return minimumEatingSpeed(input, false)
}

function solveKokoRoundingDown(input: JsonValue): JsonValue {
  return minimumEatingSpeed(input, true)
}

function solveKokoReturningFirstFeasibleSpeed(input: JsonValue): JsonValue {
  const { piles, hours } = readKokoInput(input)
  let low = 1
  let high = Math.max(...piles)

  while (low < high) {
    const speed = low + Math.floor((high - low) / 2)
    const needed = piles.reduce(
      (total, pile) => total + Math.ceil(pile / speed),
      0,
    )
    if (needed <= hours) return speed
    low = speed + 1
  }
  return low
}

function readRotatedNumbers(input: JsonValue, label: string): readonly number[] {
  const object = readObject(input, `${label} input`)
  const nums = readNumberArray(
    readField(object, 'nums', `${label} input`),
    `${label} input.nums`,
  )
  if (nums.length === 0) {
    throw new TypeError(`${label} input.nums must be nonempty`)
  }
  if (new Set(nums).size !== nums.length) {
    throw new TypeError(`${label} input.nums must contain distinct values`)
  }
  return nums
}

function solveFindRotatedMinimum(input: JsonValue): JsonValue {
  const nums = readRotatedNumbers(input, 'Rotated Minimum')
  let low = 0
  let high = nums.length - 1
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (nums[mid]! > nums[high]!) low = mid + 1
    else high = mid
  }
  return nums[low]!
}

function solveFindRotatedMinimumAssumingUnrotated(input: JsonValue): JsonValue {
  return readRotatedNumbers(input, 'Rotated Minimum')[0]!
}

function solveFindRotatedMinimumDiscardingSortedLeft(input: JsonValue): JsonValue {
  const nums = readRotatedNumbers(input, 'Rotated Minimum')
  let low = 0
  let high = nums.length - 1

  while (low < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (nums[mid]! >= nums[low]!) low = mid + 1
    else high = mid
  }
  return nums[low]!
}

function readRotatedSearchInput(input: JsonValue): NumsAndTarget {
  const parsed = readNumsAndTarget(input, 'Rotated Search')
  if (new Set(parsed.nums).size !== parsed.nums.length) {
    throw new TypeError('Rotated Search input.nums must contain distinct values')
  }
  return parsed
}

function solveRotatedSearch(input: JsonValue): JsonValue {
  const { nums, target } = readRotatedSearchInput(input)
  let low = 0
  let high = nums.length - 1

  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    const value = nums[mid]!
    if (value === target) return mid
    if (nums[low]! <= value) {
      if (nums[low]! <= target && target < value) high = mid - 1
      else low = mid + 1
    } else if (value < target && target <= nums[high]!) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return -1
}

function solveRotatedSearchAsSorted(input: JsonValue): JsonValue {
  const { nums, target } = readRotatedSearchInput(input)
  let low = 0
  let high = nums.length - 1
  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    if (nums[mid] === target) return mid
    if (nums[mid]! < target) low = mid + 1
    else high = mid - 1
  }
  return -1
}

function solveRotatedSearchReturningLocalOffset(input: JsonValue): JsonValue {
  const { nums, target } = readRotatedSearchInput(input)
  if (nums.length === 0) return -1
  let pivot = 0
  for (let index = 1; index < nums.length; index += 1) {
    if (nums[index]! < nums[index - 1]!) {
      pivot = index
      break
    }
  }
  const unrotated = [...nums.slice(pivot), ...nums.slice(0, pivot)]
  let low = 0
  let high = unrotated.length - 1
  while (low <= high) {
    const mid = low + Math.floor((high - low) / 2)
    if (unrotated[mid] === target) return mid
    if (unrotated[mid]! < target) low = mid + 1
    else high = mid - 1
  }
  return -1
}

type TimeMapOperation =
  | {
      readonly command: 'set'
      readonly key: string
      readonly value: string
      readonly timestamp: number
    }
  | {
      readonly command: 'get'
      readonly key: string
      readonly timestamp: number
    }

function readTimeMapOperations(input: JsonValue): readonly TimeMapOperation[] {
  const object = readObject(input, 'Time Map input')
  const operations = readArray(
    readField(object, 'operations', 'Time Map input'),
    'Time Map input.operations',
  )
  return operations.map((entry, index) => {
    const label = `Time Map input.operations[${index}]`
    const operation = readOperation(entry, label)
    const command = readString(operation[0] as JsonValue, `${label}[0]`)
    if (command === 'set') {
      requireLength(operation, 4, label)
      return {
        command,
        key: readString(operation[1] as JsonValue, `${label}[1]`),
        value: readString(operation[2] as JsonValue, `${label}[2]`),
        timestamp: readNonNegativeInteger(
          operation[3] as JsonValue,
          `${label}[3]`,
        ),
      }
    }
    if (command === 'get') {
      requireLength(operation, 3, label)
      return {
        command,
        key: readString(operation[1] as JsonValue, `${label}[1]`),
        timestamp: readNonNegativeInteger(
          operation[2] as JsonValue,
          `${label}[2]`,
        ),
      }
    }
    throw new TypeError(`${label}[0] has an unknown command`)
  })
}

function runTimeMap(input: JsonValue, exactTimestampOnly: boolean): JsonValue {
  const histories = new Map<
    string,
    Array<readonly [timestamp: number, value: string]>
  >()
  const answers: string[] = []

  for (const operation of readTimeMapOperations(input)) {
    if (operation.command === 'set') {
      const history = histories.get(operation.key) ?? []
      if (
        history.length > 0 &&
        operation.timestamp <= history.at(-1)![0]
      ) {
        throw new TypeError('Time Map set timestamps must increase per key')
      }
      history.push([operation.timestamp, operation.value])
      histories.set(operation.key, history)
      continue
    }

    const history = histories.get(operation.key) ?? []
    if (exactTimestampOnly) {
      answers.push(
        history.find(([timestamp]) => timestamp === operation.timestamp)?.[1] ??
          '',
      )
      continue
    }
    let low = 0
    let high = history.length - 1
    let answer = ''
    while (low <= high) {
      const mid = low + Math.floor((high - low) / 2)
      if (history[mid]![0] <= operation.timestamp) {
        answer = history[mid]![1]
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    answers.push(answer)
  }
  return answers
}

function solveTimeMap(input: JsonValue): JsonValue {
  return runTimeMap(input, false)
}

function solveTimeMapExactOnly(input: JsonValue): JsonValue {
  return runTimeMap(input, true)
}

function solveTimeMapOverwritingHistory(input: JsonValue): JsonValue {
  const latest = new Map<string, string>()
  const answers: string[] = []

  for (const operation of readTimeMapOperations(input)) {
    if (operation.command === 'set') {
      latest.set(operation.key, operation.value)
    } else {
      answers.push(latest.get(operation.key) ?? '')
    }
  }
  return answers
}

type MedianInput = {
  readonly a: readonly number[]
  readonly b: readonly number[]
}

function readMedianInput(input: JsonValue): MedianInput {
  const object = readObject(input, 'Median input')
  const a = readNumberArray(
    readField(object, 'a', 'Median input'),
    'Median input.a',
  )
  const b = readNumberArray(
    readField(object, 'b', 'Median input'),
    'Median input.b',
  )
  if (a.length + b.length === 0) {
    throw new TypeError('Median input must contain at least one value')
  }
  assertSorted(a, 'Median input.a')
  assertSorted(b, 'Median input.b')
  return { a, b }
}

function solveMedian(input: JsonValue): JsonValue {
  let { a, b } = readMedianInput(input)
  if (a.length > b.length) [a, b] = [b, a]
  const total = a.length + b.length
  const half = Math.floor(total / 2)
  let low = 0
  let high = a.length

  while (low <= high) {
    const cutA = low + Math.floor((high - low) / 2)
    const cutB = half - cutA
    const leftA = cutA === 0 ? Number.NEGATIVE_INFINITY : a[cutA - 1]!
    const rightA = cutA === a.length ? Number.POSITIVE_INFINITY : a[cutA]!
    const leftB = cutB === 0 ? Number.NEGATIVE_INFINITY : b[cutB - 1]!
    const rightB = cutB === b.length ? Number.POSITIVE_INFINITY : b[cutB]!

    if (leftA <= rightB && leftB <= rightA) {
      if (total % 2 === 1) return Math.min(rightA, rightB)
      return (Math.max(leftA, leftB) + Math.min(rightA, rightB)) / 2
    }
    if (leftA > rightB) high = cutA - 1
    else low = cutA + 1
  }
  throw new TypeError('Median input does not admit a valid partition')
}

function solveMedianUsingLowerMiddle(input: JsonValue): JsonValue {
  const { a, b } = readMedianInput(input)
  const merged = [...a, ...b].sort((left, right) => left - right)
  return merged[Math.floor((merged.length - 1) / 2)]!
}

function solveMedianAveragingArrayMedians(input: JsonValue): JsonValue {
  const { a, b } = readMedianInput(input)
  const medianOf = (values: readonly number[]): number => {
    const middle = Math.floor(values.length / 2)
    return values.length % 2 === 1
      ? values[middle]!
      : (values[middle - 1]! + values[middle]!) / 2
  }
  if (a.length === 0) return medianOf(b)
  if (b.length === 0) return medianOf(a)
  return (medianOf(a) + medianOf(b)) / 2
}

function readValues(input: JsonValue, label: string): readonly number[] {
  const object = readObject(input, `${label} input`)
  return readNumberArray(
    readField(object, 'values', `${label} input`),
    `${label} input.values`,
  )
}

function solveReverseLinkedList(input: JsonValue): JsonValue {
  return [...readValues(input, 'Reverse Linked List')].reverse()
}

function solveReverseLinkedListDroppingTail(input: JsonValue): JsonValue {
  return [...readValues(input, 'Reverse Linked List').slice(0, -1)].reverse()
}

function solveReverseLinkedListReturningOldHead(input: JsonValue): JsonValue {
  return [...readValues(input, 'Reverse Linked List')]
}

type TwoSortedListsInput = {
  readonly left: readonly number[]
  readonly right: readonly number[]
}

function readTwoSortedLists(input: JsonValue): TwoSortedListsInput {
  const object = readObject(input, 'Merge Two Lists input')
  const left = readNumberArray(
    readField(object, 'left', 'Merge Two Lists input'),
    'Merge Two Lists input.left',
  )
  const right = readNumberArray(
    readField(object, 'right', 'Merge Two Lists input'),
    'Merge Two Lists input.right',
  )
  assertSorted(left, 'Merge Two Lists input.left')
  assertSorted(right, 'Merge Two Lists input.right')
  return { left, right }
}

function mergeSorted(
  left: readonly number[],
  right: readonly number[],
  includeSuffix = true,
): number[] {
  const merged: number[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex]! <= right[rightIndex]!) {
      merged.push(left[leftIndex]!)
      leftIndex += 1
    } else {
      merged.push(right[rightIndex]!)
      rightIndex += 1
    }
  }
  if (includeSuffix) {
    merged.push(...left.slice(leftIndex), ...right.slice(rightIndex))
  }
  return merged
}

function solveMergeTwoLists(input: JsonValue): JsonValue {
  const { left, right } = readTwoSortedLists(input)
  return mergeSorted(left, right)
}

function solveMergeTwoListsDroppingSuffix(input: JsonValue): JsonValue {
  const { left, right } = readTwoSortedLists(input)
  return mergeSorted(left, right, false)
}

function solveMergeTwoListsChoosingLarger(input: JsonValue): JsonValue {
  const { left, right } = readTwoSortedLists(input)
  const merged: number[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex]! >= right[rightIndex]!) {
      merged.push(left[leftIndex]!)
      leftIndex += 1
    } else {
      merged.push(right[rightIndex]!)
      rightIndex += 1
    }
  }
  merged.push(...left.slice(leftIndex), ...right.slice(rightIndex))
  return merged
}

function reorderValues(input: JsonValue, keepMiddle: boolean): JsonValue {
  const values = readValues(input, 'Reorder List')
  const reordered: number[] = []
  let left = 0
  let right = values.length - 1
  while (left < right) {
    reordered.push(values[left]!, values[right]!)
    left += 1
    right -= 1
  }
  if (keepMiddle && left === right) reordered.push(values[left]!)
  return reordered
}

function solveReorderList(input: JsonValue): JsonValue {
  return reorderValues(input, true)
}

function solveReorderListDroppingMiddle(input: JsonValue): JsonValue {
  return reorderValues(input, false)
}

function solveReorderListWithoutReversingSecondHalf(input: JsonValue): JsonValue {
  const values = readValues(input, 'Reorder List')
  const firstLength = Math.ceil(values.length / 2)
  const first = values.slice(0, firstLength)
  const second = values.slice(firstLength)
  const reordered: number[] = []

  for (let index = 0; index < first.length; index += 1) {
    reordered.push(first[index]!)
    if (index < second.length) reordered.push(second[index]!)
  }
  return reordered
}

type RemoveNthInput = {
  readonly values: readonly number[]
  readonly n: number
}

function readRemoveNthInput(input: JsonValue): RemoveNthInput {
  const object = readObject(input, 'Remove Nth input')
  const values = readNumberArray(
    readField(object, 'values', 'Remove Nth input'),
    'Remove Nth input.values',
  )
  const n = readPositiveInteger(
    readField(object, 'n', 'Remove Nth input'),
    'Remove Nth input.n',
  )
  if (n > values.length) {
    throw new TypeError('Remove Nth input.n cannot exceed list length')
  }
  return { values, n }
}

function removeNth(input: JsonValue, offByOne: boolean): JsonValue {
  const { values, n } = readRemoveNthInput(input)
  const result = [...values]
  const index = values.length - n - (offByOne ? 1 : 0)
  if (index >= 0 && index < result.length) result.splice(index, 1)
  return result
}

function solveRemoveNth(input: JsonValue): JsonValue {
  return removeNth(input, false)
}

function solveRemoveNthOffByOne(input: JsonValue): JsonValue {
  return removeNth(input, true)
}

function solveRemoveNthWithoutDummyHead(input: JsonValue): JsonValue {
  const { values, n } = readRemoveNthInput(input)
  if (n === values.length) return [...values]
  const result = [...values]
  result.splice(values.length - n, 1)
  return result
}

type RandomListInput = {
  readonly values: readonly number[]
  readonly random: readonly (number | null)[]
}

function readRandomListInput(input: JsonValue): RandomListInput {
  const object = readObject(input, 'Random List input')
  const values = readNumberArray(
    readField(object, 'values', 'Random List input'),
    'Random List input.values',
  )
  const random = readArray(
    readField(object, 'random', 'Random List input'),
    'Random List input.random',
  ).map((target, index) => {
    if (target === null) return null
    const targetIndex = readNonNegativeInteger(
      target,
      `Random List input.random[${index}]`,
    )
    if (targetIndex >= values.length) {
      throw new TypeError(
        `Random List input.random[${index}] is outside the list`,
      )
    }
    return targetIndex
  })
  if (random.length !== values.length) {
    throw new TypeError('Random List values and random lengths must match')
  }
  return { values, random }
}

function solveCopyRandomList(input: JsonValue): JsonValue {
  const { values, random } = readRandomListInput(input)
  return { values: [...values], random: [...random] }
}

function solveCopyRandomListKeyedByValue(input: JsonValue): JsonValue {
  const { values, random } = readRandomListInput(input)
  return {
    values: [...values],
    random: random.map((target) =>
      target === null ? null : values.indexOf(values[target]!),
    ),
  }
}

function solveCopyRandomListWithoutRandomLinks(input: JsonValue): JsonValue {
  const { values } = readRandomListInput(input)
  return {
    values: [...values],
    random: Array<null>(values.length).fill(null),
  }
}

type AddDigitsInput = {
  readonly left: readonly number[]
  readonly right: readonly number[]
}

function readAddDigitsInput(input: JsonValue): AddDigitsInput {
  const object = readObject(input, 'Add Two Numbers input')
  const readDigits = (key: 'leftDigits' | 'rightDigits') => {
    const digits = readIntegerArray(
      readField(object, key, 'Add Two Numbers input'),
      `Add Two Numbers input.${key}`,
    )
    if (digits.length === 0 || digits.some((digit) => digit < 0 || digit > 9)) {
      throw new TypeError(
        `Add Two Numbers input.${key} must contain decimal digits`,
      )
    }
    return digits
  }
  return { left: readDigits('leftDigits'), right: readDigits('rightDigits') }
}

function addDigits(input: JsonValue, keepFinalCarry: boolean): JsonValue {
  const { left, right } = readAddDigitsInput(input)
  const result: number[] = []
  let index = 0
  let carry = 0
  while (
    index < left.length ||
    index < right.length ||
    (keepFinalCarry && carry > 0)
  ) {
    const total = (left[index] ?? 0) + (right[index] ?? 0) + carry
    result.push(total % 10)
    carry = Math.floor(total / 10)
    index += 1
  }
  return result
}

function solveAddTwoNumbers(input: JsonValue): JsonValue {
  return addDigits(input, true)
}

function solveAddTwoNumbersDroppingCarry(input: JsonValue): JsonValue {
  return addDigits(input, false)
}

function solveAddTwoNumbersWithoutCarryPropagation(input: JsonValue): JsonValue {
  const { left, right } = readAddDigitsInput(input)
  const length = Math.max(left.length, right.length)
  return Array.from(
    { length },
    (_, index) => ((left[index] ?? 0) + (right[index] ?? 0)) % 10,
  )
}

type CycleInput = {
  readonly values: readonly number[]
  readonly pos: number
}

function readCycleInput(input: JsonValue): CycleInput {
  const object = readObject(input, 'Linked List Cycle input')
  const values = readNumberArray(
    readField(object, 'values', 'Linked List Cycle input'),
    'Linked List Cycle input.values',
  )
  const pos = readInteger(
    readField(object, 'pos', 'Linked List Cycle input'),
    'Linked List Cycle input.pos',
  )
  if (pos < -1 || pos >= values.length || (values.length === 0 && pos !== -1)) {
    throw new TypeError('Linked List Cycle input.pos is invalid')
  }
  return { values, pos }
}

function solveLinkedListCycle(input: JsonValue): JsonValue {
  const { values, pos } = readCycleInput(input)
  return values.length > 0 && pos >= 0
}

function solveLinkedListCycleMissingSelfLoop(input: JsonValue): JsonValue {
  const { values, pos } = readCycleInput(input)
  return values.length > 1 && pos >= 0
}

function solveLinkedListCycleCheckingHeadOnly(input: JsonValue): JsonValue {
  const { values, pos } = readCycleInput(input)
  return values.length > 0 && pos === 0
}

function readDuplicateNumbers(input: JsonValue): readonly number[] {
  const object = readObject(input, 'Find Duplicate input')
  const nums = readIntegerArray(
    readField(object, 'nums', 'Find Duplicate input'),
    'Find Duplicate input.nums',
  )
  if (nums.length < 2) {
    throw new TypeError('Find Duplicate input.nums must have length at least 2')
  }
  const maximum = nums.length - 1
  if (nums.some((number) => number < 1 || number > maximum)) {
    throw new TypeError('Find Duplicate values must be between 1 and n')
  }
  return nums
}

function findDuplicate(input: JsonValue, returnMeetingPoint: boolean): JsonValue {
  const nums = readDuplicateNumbers(input)
  let slow = 0
  let fast = 0
  do {
    slow = nums[slow]!
    fast = nums[nums[fast]!]!
  } while (slow !== fast)
  if (returnMeetingPoint) return slow

  let finder = 0
  while (finder !== slow) {
    finder = nums[finder]!
    slow = nums[slow]!
  }
  return finder
}

function solveFindDuplicate(input: JsonValue): JsonValue {
  return findDuplicate(input, false)
}

function solveFindDuplicateReturningMeetingPoint(input: JsonValue): JsonValue {
  return findDuplicate(input, true)
}

function solveFindDuplicateMovingFastOneStep(input: JsonValue): JsonValue {
  const nums = readDuplicateNumbers(input)
  let slow = 0
  let fast = 0
  do {
    slow = nums[slow]!
    fast = nums[fast]!
  } while (slow !== fast)
  return slow
}

type LruOperation =
  | {
      readonly command: 'put'
      readonly key: CacheKey
      readonly value: JsonValue
    }
  | { readonly command: 'get'; readonly key: CacheKey }

type LruInput = {
  readonly capacity: number
  readonly operations: readonly LruOperation[]
}

function readLruInput(input: JsonValue): LruInput {
  const object = readObject(input, 'LRU input')
  const capacity = readPositiveInteger(
    readField(object, 'capacity', 'LRU input'),
    'LRU input.capacity',
  )
  const operations: LruOperation[] = readArray(
    readField(object, 'operations', 'LRU input'),
    'LRU input.operations',
  ).map((entry, index): LruOperation => {
    const label = `LRU input.operations[${index}]`
    const operation = readOperation(entry, label)
    const command = readString(operation[0] as JsonValue, `${label}[0]`)
    if (command === 'put') {
      requireLength(operation, 3, label)
      return {
        command,
        key: readCacheKey(operation[1] as JsonValue, `${label}[1]`),
        value: operation[2] as JsonValue,
      }
    }
    if (command === 'get') {
      requireLength(operation, 2, label)
      return {
        command,
        key: readCacheKey(operation[1] as JsonValue, `${label}[1]`),
      }
    }
    throw new TypeError(`${label}[0] has an unknown command`)
  })
  return { capacity, operations }
}

function runLru(
  input: JsonValue,
  refreshUpdatedKeys: boolean,
  refreshReadKeys = true,
): JsonValue {
  const { capacity, operations } = readLruInput(input)
  const cache = new Map<CacheKey, JsonValue>()
  const answers: JsonValue[] = []

  for (const operation of operations) {
    if (operation.command === 'get') {
      if (!cache.has(operation.key)) {
        answers.push(-1)
        continue
      }
      const value = cache.get(operation.key) as JsonValue
      if (refreshReadKeys) {
        cache.delete(operation.key)
        cache.set(operation.key, value)
      }
      answers.push(value)
      continue
    }

    if (cache.has(operation.key) && refreshUpdatedKeys) {
      cache.delete(operation.key)
    }
    cache.set(operation.key, operation.value)
    if (cache.size > capacity) {
      const leastRecent = cache.keys().next().value as CacheKey | undefined
      if (leastRecent === undefined) {
        throw new TypeError('LRU eviction could not find a key')
      }
      cache.delete(leastRecent)
    }
  }
  return answers
}

function solveLru(input: JsonValue): JsonValue {
  return runLru(input, true)
}

function solveLruWithoutPutRefresh(input: JsonValue): JsonValue {
  return runLru(input, false)
}

function solveLruWithoutGetRefresh(input: JsonValue): JsonValue {
  return runLru(input, true, false)
}

function readSortedLists(input: JsonValue): readonly (readonly number[])[] {
  const object = readObject(input, 'Merge K Lists input')
  return readArray(
    readField(object, 'lists', 'Merge K Lists input'),
    'Merge K Lists input.lists',
  ).map((entry, index) => {
    const list = readNumberArray(entry, `Merge K Lists input.lists[${index}]`)
    assertSorted(list, `Merge K Lists input.lists[${index}]`)
    return list
  })
}

function solveMergeKLists(input: JsonValue): JsonValue {
  let lists = readSortedLists(input).map((list) => [...list])
  while (lists.length > 1) {
    const next: number[][] = []
    for (let index = 0; index < lists.length; index += 2) {
      const left = lists[index]!
      const right = lists[index + 1]
      next.push(right === undefined ? left : mergeSorted(left, right))
    }
    lists = next
  }
  return lists[0] ?? []
}

function solveMergeKListsStoppingAfterFirstPair(input: JsonValue): JsonValue {
  const lists = readSortedLists(input)
  if (lists.length === 0) return []
  return mergeSorted(lists[0]!, lists[1] ?? [])
}

function mergeSortedAdvancingBoth(
  left: readonly number[],
  right: readonly number[],
): number[] {
  const merged: number[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    merged.push(
      left[leftIndex]! <= right[rightIndex]!
        ? left[leftIndex]!
        : right[rightIndex]!,
    )
    leftIndex += 1
    rightIndex += 1
  }
  merged.push(...left.slice(leftIndex), ...right.slice(rightIndex))
  return merged
}

function solveMergeKListsAdvancingBothPointers(input: JsonValue): JsonValue {
  let lists = readSortedLists(input).map((list) => [...list])
  while (lists.length > 1) {
    const next: number[][] = []
    for (let index = 0; index < lists.length; index += 2) {
      const left = lists[index]!
      const right = lists[index + 1]
      next.push(
        right === undefined ? left : mergeSortedAdvancingBoth(left, right),
      )
    }
    lists = next
  }
  return lists[0] ?? []
}

type KGroupInput = {
  readonly values: readonly number[]
  readonly k: number
}

function readKGroupInput(input: JsonValue): KGroupInput {
  const object = readObject(input, 'Reverse K Group input')
  return {
    values: readNumberArray(
      readField(object, 'values', 'Reverse K Group input'),
      'Reverse K Group input.values',
    ),
    k: readPositiveInteger(
      readField(object, 'k', 'Reverse K Group input'),
      'Reverse K Group input.k',
    ),
  }
}

function solveReverseKGroup(input: JsonValue): JsonValue {
  const { values, k } = readKGroupInput(input)
  const result: number[] = []
  for (let index = 0; index < values.length; index += k) {
    const group = values.slice(index, index + k)
    if (group.length === k) result.push(...group.reverse())
    else result.push(...group)
  }
  return result
}

function solveReverseKGroupFirstGroupOnly(input: JsonValue): JsonValue {
  const { values, k } = readKGroupInput(input)
  if (values.length < k) return [...values]
  return [...values.slice(0, k)].reverse().concat(values.slice(k))
}

function solveReverseKGroupUsingKMinusOne(input: JsonValue): JsonValue {
  const { values, k } = readKGroupInput(input)
  if (k === 1) return [...values]
  const groupSize = k - 1
  const result: number[] = []
  for (let index = 0; index < values.length; index += groupSize) {
    const group = values.slice(index, index + groupSize)
    if (group.length === groupSize) result.push(...group.reverse())
    else result.push(...group)
  }
  return result
}

const validParenthesesOracle = defineTwoMutantOracle(
  'problem:valid-parentheses',
  solveValidParentheses,
  {
    id: 'counts-without-stack-order',
    description:
      'Counts bracket types without enforcing the stack nesting order.',
    solve: solveValidParenthesesIgnoringOrder,
  },
  {
    id: 'ignores-bracket-types',
    description:
      'Pops the stack for every closer without checking the opener type.',
    solve: solveValidParenthesesIgnoringTypes,
  },
)

const minStackOracle = defineTwoMutantOracle(
  'problem:min-stack',
  solveMinStack,
  {
    id: 'drops-duplicate-minimum',
    description:
      'Tracks only strictly smaller minima, then removes the shared minimum too early.',
    solve: solveMinStackDroppingDuplicateMinimum,
  },
  {
    id: 'leaves-minimum-on-pop',
    description:
      'Pops the value stack without synchronizing its parallel minimum history.',
    solve: solveMinStackWithStaleMinimum,
  },
)

const rpnOracle = defineTwoMutantOracle(
  'problem:evaluate-reverse-polish-notation',
  solveRpn,
  {
    id: 'reverses-operator-operands',
    description:
      'Pops operands in stack order instead of restoring left-right order.',
    solve: solveRpnReversedOperands,
  },
  {
    id: 'floors-negative-division',
    description:
      'Uses mathematical floor instead of truncating division toward zero.',
    solve: solveRpnFloorDivision,
  },
)

const generateParenthesesOracle = defineTwoMutantOracle(
  'problem:generate-parentheses',
  solveGenerateParentheses,
  {
    id: 'allows-premature-close',
    description:
      'Allows a close whenever closers remain, even without an unmatched opener.',
    solve: solveGenerateParenthesesWithPrematureClose,
  },
  {
    id: 'leaks-backtracking-path',
    description:
      'Forgets to pop an opening choice, contaminating later DFS sibling paths.',
    solve: solveGenerateParenthesesLeakingPath,
  },
)

const dailyTemperaturesOracle = defineTwoMutantOracle(
  'problem:daily-temperatures',
  solveDailyTemperatures,
  {
    id: 'resolves-one-day-only',
    description:
      'Pops only one colder day instead of every exposed monotonic-stack entry.',
    solve: solveDailyTemperaturesSinglePop,
  },
  {
    id: 'records-one-day-waits',
    description:
      'Resolves the correct stack entries but records 1 instead of index distance.',
    solve: solveDailyTemperaturesOneDayWait,
  },
)

const carFleetOracle = defineTwoMutantOracle(
  'problem:car-fleet',
  solveCarFleet,
  {
    id: 'splits-equal-arrivals',
    description:
      'Treats equal arrival times as separate fleets instead of one merged fleet.',
    solve: solveCarFleetSplittingTies,
  },
  {
    id: 'traverses-positions-ascending',
    description:
      'Scans rear rovers before front rovers, reversing the fleet stack invariant.',
    solve: solveCarFleetAscendingPositions,
  },
)

const largestRectangleOracle = defineTwoMutantOracle(
  'problem:largest-rectangle-in-histogram',
  solveLargestRectangle,
  {
    id: 'forgets-final-stack-flush',
    description:
      'Never appends a zero boundary, leaving nondecreasing bars unscored.',
    solve: solveLargestRectangleWithoutFlush,
  },
  {
    id: 'subtracts-one-from-width',
    description:
      'Treats histogram spans as exclusive on both ends and loses one column.',
    solve: solveLargestRectangleOffByOneWidth,
  },
)

const binarySearchOracle = defineTwoMutantOracle(
  'problem:binary-search',
  solveBinarySearch,
  {
    id: 'returns-insertion-point-on-miss',
    description:
      'Returns the collapsed search boundary instead of -1 after a miss.',
    solve: solveBinarySearchReturningInsertionPoint,
  },
  {
    id: 'reverses-search-direction',
    description:
      'Moves high left when the midpoint is too small and discards the target half.',
    solve: solveBinarySearchDiscardingTargetHalf,
  },
)

const matrixSearchOracle = defineTwoMutantOracle(
  'problem:search-a-2d-matrix',
  solveMatrixSearch,
  {
    id: 'searches-first-row-only',
    description:
      'Uses one row as the search range instead of the flattened matrix.',
    solve: solveMatrixSearchFirstRowOnly,
  },
  {
    id: 'checks-upper-bound-index',
    description:
      'Computes the first greater cell but checks that index for target equality.',
    solve: solveMatrixSearchCheckingUpperBound,
  },
)

const kokoOracle = defineTwoMutantOracle(
  'problem:koko-eating-bananas',
  solveKoko,
  {
    id: 'rounds-hours-down',
    description:
      'Uses floor division for partial piles and accepts speeds that are too slow.',
    solve: solveKokoRoundingDown,
  },
  {
    id: 'returns-first-feasible-speed',
    description:
      'Returns on a feasible midpoint instead of continuing toward the minimum.',
    solve: solveKokoReturningFirstFeasibleSpeed,
  },
)

const findRotatedMinimumOracle = defineTwoMutantOracle(
  'problem:find-minimum-in-rotated-sorted-array',
  solveFindRotatedMinimum,
  {
    id: 'assumes-first-is-minimum',
    description: 'Ignores the rotated search boundary and returns the first item.',
    solve: solveFindRotatedMinimumAssumingUnrotated,
  },
  {
    id: 'discards-sorted-left-half',
    description:
      'Treats every sorted left interval as rotated and skips its minimum.',
    solve: solveFindRotatedMinimumDiscardingSortedLeft,
  },
)

const rotatedSearchOracle = defineTwoMutantOracle(
  'problem:search-in-rotated-sorted-array',
  solveRotatedSearch,
  {
    id: 'treats-rotation-as-sorted',
    description:
      'Applies ordinary binary-search range updates across the rotation pivot.',
    solve: solveRotatedSearchAsSorted,
  },
  {
    id: 'returns-unrotated-offset',
    description:
      'Finds the target after pivot normalization but forgets to restore its index.',
    solve: solveRotatedSearchReturningLocalOffset,
  },
)

const timeMapOracle = defineTwoMutantOracle(
  'problem:time-based-key-value-store',
  solveTimeMap,
  {
    id: 'requires-exact-timestamp',
    description:
      'Returns a value only for an exact timestamp instead of the latest prior set.',
    solve: solveTimeMapExactOnly,
  },
  {
    id: 'overwrites-key-history',
    description:
      'Stores only the newest value per key, destroying earlier timestamp states.',
    solve: solveTimeMapOverwritingHistory,
  },
)

const medianOracle = defineTwoMutantOracle(
  'problem:median-of-two-sorted-arrays',
  solveMedian,
  {
    id: 'uses-lower-middle-for-even-total',
    description:
      'Returns the lower partition boundary without averaging an even total.',
    solve: solveMedianUsingLowerMiddle,
  },
  {
    id: 'averages-array-medians',
    description:
      'Averages each input median instead of balancing the combined partitions.',
    solve: solveMedianAveragingArrayMedians,
  },
)

const reverseLinkedListOracle = defineTwoMutantOracle(
  'problem:reverse-linked-list',
  solveReverseLinkedList,
  {
    id: 'drops-original-tail',
    description:
      'Advances during pointer reversal without preserving the final node.',
    solve: solveReverseLinkedListDroppingTail,
  },
  {
    id: 'returns-original-head',
    description:
      'Reverses conceptually but returns the old head rather than the new one.',
    solve: solveReverseLinkedListReturningOldHead,
  },
)

const mergeTwoListsOracle = defineTwoMutantOracle(
  'problem:merge-two-sorted-lists',
  solveMergeTwoLists,
  {
    id: 'drops-remaining-suffix',
    description:
      'Stops when either list ends without attaching the other chain.',
    solve: solveMergeTwoListsDroppingSuffix,
  },
  {
    id: 'chooses-larger-head',
    description:
      'Splices the larger current node first, breaking sorted list order.',
    solve: solveMergeTwoListsChoosingLarger,
  },
)

const reorderListOracle = defineTwoMutantOracle(
  'problem:reorder-list',
  solveReorderList,
  {
    id: 'drops-odd-middle-node',
    description:
      'Stops weaving when pointers meet and loses the odd-length midpoint.',
    solve: solveReorderListDroppingMiddle,
  },
  {
    id: 'skips-second-half-reversal',
    description:
      'Splits and weaves the list but leaves the second half in forward order.',
    solve: solveReorderListWithoutReversingSecondHalf,
  },
)

const removeNthOracle = defineTwoMutantOracle(
  'problem:remove-nth-node-from-end-of-list',
  solveRemoveNth,
  {
    id: 'opens-n-gap-not-n-plus-one',
    description:
      'Uses an off-by-one pointer gap and unlinks the node before the target.',
    solve: solveRemoveNthOffByOne,
  },
  {
    id: 'cannot-remove-head',
    description:
      'Starts from the real head without a dummy node and cannot unlink it.',
    solve: solveRemoveNthWithoutDummyHead,
  },
)

const copyRandomListOracle = defineTwoMutantOracle(
  'problem:copy-list-with-random-pointer',
  solveCopyRandomList,
  {
    id: 'keys-clones-by-value',
    description:
      'Maps clones by repeated node value instead of original node identity.',
    solve: solveCopyRandomListKeyedByValue,
  },
  {
    id: 'omits-random-links',
    description:
      'Copies the next chain but never performs the random-pointer wiring pass.',
    solve: solveCopyRandomListWithoutRandomLinks,
  },
)

const addTwoNumbersOracle = defineTwoMutantOracle(
  'problem:add-two-numbers',
  solveAddTwoNumbers,
  {
    id: 'drops-final-carry',
    description:
      'Stops after both input chains end without emitting the remaining carry.',
    solve: solveAddTwoNumbersDroppingCarry,
  },
  {
    id: 'does-not-propagate-carry',
    description:
      'Reduces each digit sum modulo ten without carrying into the next node.',
    solve: solveAddTwoNumbersWithoutCarryPropagation,
  },
)

const linkedListCycleOracle = defineTwoMutantOracle(
  'problem:linked-list-cycle',
  solveLinkedListCycle,
  {
    id: 'misses-single-node-self-loop',
    description:
      'Requires two nodes before advancing fast and slow pointers.',
    solve: solveLinkedListCycleMissingSelfLoop,
  },
  {
    id: 'checks-tail-to-head-only',
    description:
      'Recognizes only cycles whose tail points to the head, missing interior loops.',
    solve: solveLinkedListCycleCheckingHeadOnly,
  },
)

const findDuplicateOracle = defineTwoMutantOracle(
  'problem:find-the-duplicate-number',
  solveFindDuplicate,
  {
    id: 'returns-phase-one-meeting',
    description:
      'Returns Floyd pointers’ first meeting point instead of finding the entrance.',
    solve: solveFindDuplicateReturningMeetingPoint,
  },
  {
    id: 'fast-moves-one-step',
    description:
      'Advances both Floyd pointers once, so phase one stops at the first edge.',
    solve: solveFindDuplicateMovingFastOneStep,
  },
)

const lruOracle = defineTwoMutantOracle(
  'problem:lru-cache',
  solveLru,
  {
    id: 'put-update-keeps-old-recency',
    description:
      'Updates an existing value without moving its node to most recent.',
    solve: solveLruWithoutPutRefresh,
  },
  {
    id: 'get-does-not-refresh',
    description:
      'Returns cache hits without moving their nodes to most-recent position.',
    solve: solveLruWithoutGetRefresh,
  },
)

const mergeKListsOracle = defineTwoMutantOracle(
  'problem:merge-k-sorted-lists',
  solveMergeKLists,
  {
    id: 'stops-after-first-pair',
    description:
      'Completes one pair merge but never advances through later merge rounds.',
    solve: solveMergeKListsStoppingAfterFirstPair,
  },
  {
    id: 'advances-both-merge-pointers',
    description:
      'Moves both list pointers after choosing one node and skips the other node.',
    solve: solveMergeKListsAdvancingBothPointers,
  },
)

const reverseKGroupOracle = defineTwoMutantOracle(
  'problem:reverse-nodes-in-k-group',
  solveReverseKGroup,
  {
    id: 'reverses-first-group-only',
    description:
      'Reconnects the first group but fails to advance to later complete groups.',
    solve: solveReverseKGroupFirstGroupOnly,
  },
  {
    id: 'uses-k-minus-one-boundary',
    description:
      'Checks and reverses groups at k minus one nodes instead of k nodes.',
    solve: solveReverseKGroupUsingKMinusOne,
  },
)

export const REALM_2_PROBLEM_MISSION_ORACLES =
  defineProblemMissionOracleRegistry({
    'problem:valid-parentheses': validParenthesesOracle,
    'problem:min-stack': minStackOracle,
    'problem:evaluate-reverse-polish-notation': rpnOracle,
    'problem:generate-parentheses': generateParenthesesOracle,
    'problem:daily-temperatures': dailyTemperaturesOracle,
    'problem:car-fleet': carFleetOracle,
    'problem:largest-rectangle-in-histogram': largestRectangleOracle,
    'problem:binary-search': binarySearchOracle,
    'problem:search-a-2d-matrix': matrixSearchOracle,
    'problem:koko-eating-bananas': kokoOracle,
    'problem:find-minimum-in-rotated-sorted-array':
      findRotatedMinimumOracle,
    'problem:search-in-rotated-sorted-array': rotatedSearchOracle,
    'problem:time-based-key-value-store': timeMapOracle,
    'problem:median-of-two-sorted-arrays': medianOracle,
    'problem:reverse-linked-list': reverseLinkedListOracle,
    'problem:merge-two-sorted-lists': mergeTwoListsOracle,
    'problem:reorder-list': reorderListOracle,
    'problem:remove-nth-node-from-end-of-list': removeNthOracle,
    'problem:copy-list-with-random-pointer': copyRandomListOracle,
    'problem:add-two-numbers': addTwoNumbersOracle,
    'problem:linked-list-cycle': linkedListCycleOracle,
    'problem:find-the-duplicate-number': findDuplicateOracle,
    'problem:lru-cache': lruOracle,
    'problem:merge-k-sorted-lists': mergeKListsOracle,
    'problem:reverse-nodes-in-k-group': reverseKGroupOracle,
  })
