import type { JsonValue } from '../../../../../types/learning'
import {
  defineProblemMissionOracle,
  defineProblemMissionOracleRegistry,
} from '../oracleContract'

type JsonObject = { readonly [key: string]: JsonValue }
type Interval = { readonly start: number; readonly end: number }
type Point = { readonly x: number; readonly y: number }

function readExactObject(
  value: JsonValue,
  label: string,
  keys: readonly string[],
): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`${label} must be a JSON object`)
  }
  const object = value as JsonObject
  const actualKeys = Object.keys(object)
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(object, key))
  ) {
    throw new TypeError(`${label} must contain exactly: ${keys.join(', ')}`)
  }
  return object
}

function readArray(value: JsonValue, label: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be a JSON array`)
  }
  return value
}

function readSafeInteger(value: JsonValue, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`)
  }
  return value
}

function readPositiveInteger(value: JsonValue, label: string): number {
  const integer = readSafeInteger(value, label)
  if (integer <= 0) {
    throw new RangeError(`${label} must be positive`)
  }
  return integer
}

function readFiniteNumber(value: JsonValue, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`)
  }
  return value
}

function readBoolean(value: JsonValue, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean`)
  }
  return value
}

function readExpectedBoolean(
  value: JsonValue,
  expected: boolean,
  label: string,
): boolean {
  const result = readBoolean(value, label)
  if (result !== expected) {
    throw new RangeError(`${label} must be ${String(expected)}`)
  }
  return result
}

function readString(value: JsonValue, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`)
  }
  return value
}

function readInterval(value: JsonValue, label: string): Interval {
  const object = readExactObject(value, label, ['start', 'end'])
  const start = readSafeInteger(object.start, `${label}.start`)
  const end = readSafeInteger(object.end, `${label}.end`)
  if (start > end) {
    throw new RangeError(`${label}.start must not exceed its end`)
  }
  return { start, end }
}

function readIntervals(value: JsonValue, label: string): readonly Interval[] {
  return readArray(value, label).map((interval, index) =>
    readInterval(interval, `${label}[${index}]`),
  )
}

function assertSortedDisjoint(
  intervals: readonly Interval[],
  label: string,
): void {
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index - 1].end >= intervals[index].start) {
      throw new RangeError(`${label} must be sorted and non-overlapping`)
    }
  }
}

function solveInsertInterval(input: JsonValue): JsonValue {
  const object = readExactObject(input, 'Insert Interval input', [
    'intervals',
    'newInterval',
  ])
  const intervals = readIntervals(object.intervals, 'intervals')
  assertSortedDisjoint(intervals, 'intervals')
  const supplied = readInterval(object.newInterval, 'newInterval')
  const incoming = { start: supplied.start, end: supplied.end }
  const result: Interval[] = []
  let index = 0

  while (
    index < intervals.length &&
    intervals[index].end < incoming.start
  ) {
    result.push(intervals[index])
    index += 1
  }
  while (
    index < intervals.length &&
    intervals[index].start <= incoming.end
  ) {
    incoming.start = Math.min(incoming.start, intervals[index].start)
    incoming.end = Math.max(incoming.end, intervals[index].end)
    index += 1
  }
  result.push(incoming)
  while (index < intervals.length) {
    result.push(intervals[index])
    index += 1
  }
  return result
}

function solveInsertIntervalFirstOverlapOnly(input: JsonValue): JsonValue {
  const object = readExactObject(input, 'Insert Interval input', [
    'intervals',
    'newInterval',
  ])
  const intervals = readIntervals(object.intervals, 'intervals')
  assertSortedDisjoint(intervals, 'intervals')
  const supplied = readInterval(object.newInterval, 'newInterval')
  const incoming = { start: supplied.start, end: supplied.end }
  const result: Interval[] = []
  let index = 0

  while (
    index < intervals.length &&
    intervals[index].end < incoming.start
  ) {
    result.push(intervals[index])
    index += 1
  }
  if (
    index < intervals.length &&
    intervals[index].start <= incoming.end
  ) {
    incoming.start = Math.min(incoming.start, intervals[index].start)
    incoming.end = Math.max(incoming.end, intervals[index].end)
    index += 1
  }
  result.push(incoming, ...intervals.slice(index))
  return result
}

function solveInsertIntervalWithoutTrailingPlacement(input: JsonValue): JsonValue {
  const object = readExactObject(input, 'Insert Interval input', [
    'intervals',
    'newInterval',
  ])
  const intervals = readIntervals(object.intervals, 'intervals')
  assertSortedDisjoint(intervals, 'intervals')
  const supplied = readInterval(object.newInterval, 'newInterval')
  const incoming = { start: supplied.start, end: supplied.end }
  const result: Interval[] = []
  let placed = false

  for (const interval of intervals) {
    if (interval.end < incoming.start) {
      result.push(interval)
    } else if (incoming.end < interval.start) {
      if (!placed) {
        result.push({ start: incoming.start, end: incoming.end })
        placed = true
      }
      result.push(interval)
    } else {
      incoming.start = Math.min(incoming.start, interval.start)
      incoming.end = Math.max(incoming.end, interval.end)
    }
  }
  return result
}

function solveMergeIntervalsWithRule(
  input: JsonValue,
  mergeTouching: boolean,
): JsonValue {
  const object = readExactObject(input, 'Merge Intervals input', ['intervals'])
  const ordered = [...readIntervals(object.intervals, 'intervals')].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  )
  const merged: { start: number; end: number }[] = []

  for (const interval of ordered) {
    const previous = merged[merged.length - 1]
    const overlaps =
      previous !== undefined &&
      (mergeTouching
        ? interval.start <= previous.end
        : interval.start < previous.end)
    if (!overlaps) {
      merged.push({ start: interval.start, end: interval.end })
    } else {
      previous.end = Math.max(previous.end, interval.end)
    }
  }
  return merged
}

function solveMergeIntervals(input: JsonValue): JsonValue {
  return solveMergeIntervalsWithRule(input, true)
}

function solveMergeIntervalsAssumingSorted(input: JsonValue): JsonValue {
  const object = readExactObject(input, 'Merge Intervals input', ['intervals'])
  const intervals = readIntervals(object.intervals, 'intervals')
  const merged: { start: number; end: number }[] = []

  for (const interval of intervals) {
    const previous = merged[merged.length - 1]
    if (previous === undefined || interval.start > previous.end) {
      merged.push({ start: interval.start, end: interval.end })
    } else {
      previous.end = Math.max(previous.end, interval.end)
    }
  }
  return merged
}

function solveMinimumRemovals(
  input: JsonValue,
  sortByEnd: boolean,
): JsonValue {
  const object = readExactObject(input, 'Non-overlapping Intervals input', [
    'requests',
  ])
  const requests = [...readIntervals(object.requests, 'requests')].sort(
    sortByEnd
      ? (left, right) => left.end - right.end || left.start - right.start
      : (left, right) => left.start - right.start || left.end - right.end,
  )
  let stageEnd: number | undefined
  let removals = 0

  for (const request of requests) {
    if (stageEnd === undefined || request.start >= stageEnd) {
      stageEnd = request.end
    } else {
      removals += 1
    }
  }
  return removals
}

function solveMinimumRemovalsTreatingTouchAsOverlap(
  input: JsonValue,
): JsonValue {
  const object = readExactObject(input, 'Non-overlapping Intervals input', [
    'requests',
  ])
  const requests = [...readIntervals(object.requests, 'requests')].sort(
    (left, right) => left.end - right.end || left.start - right.start,
  )
  let stageEnd: number | undefined
  let removals = 0

  for (const request of requests) {
    if (stageEnd === undefined || request.start > stageEnd) {
      stageEnd = request.end
    } else {
      removals += 1
    }
  }
  return removals
}

function solveMeetingRoomsWithTouchRule(
  input: JsonValue,
  touchingConflicts: boolean,
): JsonValue {
  const object = readExactObject(input, 'Meeting Rooms input', ['bookings'])
  const bookings = [...readIntervals(object.bookings, 'bookings')].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  )

  for (let index = 1; index < bookings.length; index += 1) {
    const overlaps = touchingConflicts
      ? bookings[index].start <= bookings[index - 1].end
      : bookings[index].start < bookings[index - 1].end
    if (overlaps) return false
  }
  return true
}

function solveMeetingRooms(input: JsonValue): JsonValue {
  return solveMeetingRoomsWithTouchRule(input, false)
}

function solveMeetingRoomsInInputOrder(input: JsonValue): JsonValue {
  const object = readExactObject(input, 'Meeting Rooms input', ['bookings'])
  const bookings = readIntervals(object.bookings, 'bookings')
  for (let index = 1; index < bookings.length; index += 1) {
    if (bookings[index].start < bookings[index - 1].end) return false
  }
  return true
}

function solveMeetingRoomsIIWithReleaseRule(
  input: JsonValue,
  strictRelease: boolean,
): JsonValue {
  const object = readExactObject(input, 'Meeting Rooms II input', ['sessions'])
  const sessions = [...readIntervals(object.sessions, 'sessions')].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  )
  const allocatedEndTimes: number[] = []

  for (const session of sessions) {
    allocatedEndTimes.sort((left, right) => left - right)
    const earliestEnd = allocatedEndTimes[0]
    if (
      earliestEnd !== undefined &&
      (strictRelease
        ? earliestEnd < session.start
        : earliestEnd <= session.start)
    ) {
      allocatedEndTimes.shift()
    }
    allocatedEndTimes.push(session.end)
  }
  return allocatedEndTimes.length
}

function solveMeetingRoomsIIInInputOrder(input: JsonValue): JsonValue {
  const object = readExactObject(input, 'Meeting Rooms II input', ['sessions'])
  const sessions = readIntervals(object.sessions, 'sessions')
  const allocatedEndTimes: number[] = []

  for (const session of sessions) {
    allocatedEndTimes.sort((left, right) => left - right)
    if (
      allocatedEndTimes[0] !== undefined &&
      allocatedEndTimes[0] <= session.start
    ) {
      allocatedEndTimes.shift()
    }
    allocatedEndTimes.push(session.end)
  }
  return allocatedEndTimes.length
}

function solveMinimumIntervalLengths(
  input: JsonValue,
  inclusiveLength: boolean,
  inclusiveCoverage = true,
): JsonValue {
  const object = readExactObject(
    input,
    'Minimum Interval to Include Each Query input',
    ['intervals', 'queries'],
  )
  const intervals = readIntervals(object.intervals, 'intervals')
  const queries = readArray(object.queries, 'queries').map((query, index) =>
    readSafeInteger(query, `queries[${index}]`),
  )

  return queries.map((query) => {
    let best = Number.POSITIVE_INFINITY
    for (const interval of intervals) {
      const covers = inclusiveCoverage
        ? interval.start <= query && query <= interval.end
        : interval.start < query && query < interval.end
      if (covers) {
        const length =
          interval.end - interval.start + (inclusiveLength ? 1 : 0)
        best = Math.min(best, length)
      }
    }
    return Number.isFinite(best) ? best : -1
  })
}

function readMatrix(
  input: JsonValue,
  label: string,
  requireSquare: boolean,
): number[][] {
  const object = readExactObject(input, `${label} input`, ['matrix'])
  const rows = readArray(object.matrix, 'matrix')
  if (rows.length === 0) {
    throw new RangeError('matrix must be non-empty')
  }
  const firstRow = readArray(rows[0], 'matrix[0]')
  if (firstRow.length === 0) {
    throw new RangeError('matrix rows must be non-empty')
  }
  const columnCount = firstRow.length
  const matrix = rows.map((row, rowIndex) => {
    const cells = readArray(row, `matrix[${rowIndex}]`)
    if (cells.length !== columnCount) {
      throw new RangeError('matrix must be rectangular')
    }
    return cells.map((cell, columnIndex) =>
      readSafeInteger(cell, `matrix[${rowIndex}][${columnIndex}]`),
    )
  })
  if (requireSquare && matrix.length !== columnCount) {
    throw new RangeError('matrix must be square')
  }
  return matrix
}

function solveRotateImage(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Rotate Image', true)
  const size = matrix.length
  return Array.from({ length: size }, (_, row) =>
    Array.from(
      { length: size },
      (_, column) => matrix[size - 1 - column][row],
    ),
  )
}

function solveRotateImageCounterclockwise(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Rotate Image', true)
  const size = matrix.length
  return Array.from({ length: size }, (_, row) =>
    Array.from(
      { length: size },
      (_, column) => matrix[column][size - 1 - row],
    ),
  )
}

function solveRotateImageTransposeOnly(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Rotate Image', true)
  return matrix.map((_, row) =>
    matrix.map((_, column) => matrix[column][row]),
  )
}

function solveSpiralMatrix(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Spiral Matrix', false)
  const order: number[] = []
  let top = 0
  let bottom = matrix.length - 1
  let left = 0
  let right = matrix[0].length - 1

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
}

function solveSpiralMatrixRowMajor(input: JsonValue): JsonValue {
  return readMatrix(input, 'Spiral Matrix', false).flat()
}

function solveSpiralMatrixWithoutInnerGuards(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Spiral Matrix', false)
  const order: number[] = []
  let top = 0
  let bottom = matrix.length - 1
  let left = 0
  let right = matrix[0].length - 1

  while (top <= bottom && left <= right) {
    for (let column = left; column <= right; column += 1) {
      order.push(matrix[top][column])
    }
    top += 1
    for (let row = top; row <= bottom; row += 1) {
      order.push(matrix[row][right])
    }
    right -= 1
    for (let column = right; column >= left; column -= 1) {
      order.push(matrix[bottom][column])
    }
    bottom -= 1
    for (let row = bottom; row >= top; row -= 1) {
      order.push(matrix[row][left])
    }
    left += 1
  }
  return order
}

function solveSetMatrixZeroes(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Set Matrix Zeroes', false)
  const zeroRows = new Set<number>()
  const zeroColumns = new Set<number>()

  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[0].length; column += 1) {
      if (matrix[row][column] === 0) {
        zeroRows.add(row)
        zeroColumns.add(column)
      }
    }
  }
  return matrix.map((row, rowIndex) =>
    row.map((value, columnIndex) =>
      zeroRows.has(rowIndex) || zeroColumns.has(columnIndex) ? 0 : value,
    ),
  )
}

function solveSetMatrixZeroesRowsOnly(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Set Matrix Zeroes', false)
  const zeroRows = new Set<number>()
  matrix.forEach((row, rowIndex) => {
    if (row.includes(0)) zeroRows.add(rowIndex)
  })
  return matrix.map((row, rowIndex) =>
    row.map((value) => (zeroRows.has(rowIndex) ? 0 : value)),
  )
}

function solveSetMatrixZeroesWithCascadingDiscovery(input: JsonValue): JsonValue {
  const matrix = readMatrix(input, 'Set Matrix Zeroes', false)
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[0].length; column += 1) {
      if (matrix[row][column] !== 0) continue
      for (let otherColumn = 0; otherColumn < matrix[0].length; otherColumn += 1) {
        matrix[row][otherColumn] = 0
      }
      for (let otherRow = 0; otherRow < matrix.length; otherRow += 1) {
        matrix[otherRow][column] = 0
      }
    }
  }
  return matrix
}

function readHappyNumber(input: JsonValue): number {
  const object = readExactObject(input, 'Happy Number input', ['number'])
  return readPositiveInteger(object.number, 'number')
}

function digitSquareSum(value: number): number {
  let remaining = value
  let sum = 0
  while (remaining > 0) {
    const digit = remaining % 10
    sum += digit * digit
    remaining = Math.floor(remaining / 10)
  }
  return sum
}

function solveHappyNumber(input: JsonValue): JsonValue {
  let number = readHappyNumber(input)
  const seen = new Set<number>()
  while (number !== 1 && !seen.has(number)) {
    seen.add(number)
    number = digitSquareSum(number)
  }
  return number === 1
}

function solveHappyNumberOneTransform(input: JsonValue): JsonValue {
  const number = readHappyNumber(input)
  return number === 1 || digitSquareSum(number) === 1
}

function solveHappyNumberWithDigitCubes(input: JsonValue): JsonValue {
  let number = readHappyNumber(input)
  const seen = new Set<number>()
  while (number !== 1 && !seen.has(number)) {
    seen.add(number)
    let remaining = number
    let next = 0
    while (remaining > 0) {
      const digit = remaining % 10
      next += digit * digit * digit
      remaining = Math.floor(remaining / 10)
    }
    number = next
  }
  return number === 1
}

function readDigits(input: JsonValue): number[] {
  const object = readExactObject(input, 'Plus One input', ['digits'])
  const digits = readArray(object.digits, 'digits').map((digit, index) => {
    const value = readSafeInteger(digit, `digits[${index}]`)
    if (value < 0 || value > 9) {
      throw new RangeError(`digits[${index}] must be between 0 and 9`)
    }
    return value
  })
  if (digits.length === 0 || (digits.length > 1 && digits[0] === 0)) {
    throw new RangeError('digits must be non-empty and have no leading zero')
  }
  return digits
}

function solvePlusOne(input: JsonValue): JsonValue {
  const digits = readDigits(input)
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] < 9) {
      digits[index] += 1
      return digits
    }
    digits[index] = 0
  }
  return [1, ...digits]
}

function solvePlusOneWithoutLeadingCarry(input: JsonValue): JsonValue {
  const digits = readDigits(input)
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] < 9) {
      digits[index] += 1
      return digits
    }
    digits[index] = 0
  }
  return digits
}

function solvePlusOneLeftToRight(input: JsonValue): JsonValue {
  const digits = readDigits(input)
  for (let index = 0; index < digits.length; index += 1) {
    if (digits[index] < 9) {
      digits[index] += 1
      return digits
    }
    digits[index] = 0
  }
  return [1, ...digits]
}

function readPowerInput(
  input: JsonValue,
): { readonly base: number; readonly exponent: number } {
  const object = readExactObject(input, 'Pow(x, n) input', [
    'base',
    'exponent',
  ])
  return {
    base: readFiniteNumber(object.base, 'base'),
    exponent: readSafeInteger(object.exponent, 'exponent'),
  }
}

function binaryPower(base: number, exponent: number): number {
  let result = 1
  let power = base
  let remaining = exponent
  while (remaining > 0) {
    if (remaining % 2 === 1) result *= power
    power *= power
    remaining = Math.floor(remaining / 2)
  }
  if (!Number.isFinite(result)) {
    throw new RangeError('power result must be a finite JSON number')
  }
  return result
}

function solvePowXN(input: JsonValue): JsonValue {
  const supplied = readPowerInput(input)
  const base = supplied.exponent < 0 ? 1 / supplied.base : supplied.base
  if (!Number.isFinite(base)) {
    throw new RangeError('negative exponent requires a nonzero finite base')
  }
  return binaryPower(base, Math.abs(supplied.exponent))
}

function solvePowXNWithoutReciprocal(input: JsonValue): JsonValue {
  const { base, exponent } = readPowerInput(input)
  return binaryPower(base, Math.abs(exponent))
}

function solvePowXNSquaringBeforeOddBit(input: JsonValue): JsonValue {
  const supplied = readPowerInput(input)
  let power = supplied.exponent < 0 ? 1 / supplied.base : supplied.base
  if (!Number.isFinite(power)) {
    throw new RangeError('negative exponent requires a nonzero finite base')
  }
  let result = 1
  let remaining = Math.abs(supplied.exponent)
  while (remaining > 0) {
    power *= power
    if (remaining % 2 === 1) result *= power
    remaining = Math.floor(remaining / 2)
  }
  if (!Number.isFinite(result)) {
    throw new RangeError('power result must be a finite JSON number')
  }
  return result
}

function readMultiplicationInput(
  input: JsonValue,
): { readonly left: string; readonly right: string } {
  const object = readExactObject(input, 'Multiply Strings input', [
    'left',
    'right',
  ])
  const normalize = (value: JsonValue, label: string): string => {
    const digits = readString(value, label)
    if (!/^\d+$/u.test(digits)) {
      throw new TypeError(`${label} must contain decimal digits only`)
    }
    return digits.replace(/^0+(?=\d)/u, '')
  }
  return {
    left: normalize(object.left, 'left'),
    right: normalize(object.right, 'right'),
  }
}

function solveMultiplyStrings(input: JsonValue): string {
  const { left, right } = readMultiplicationInput(input)
  if (left === '0' || right === '0') return '0'
  const places = Array<number>(left.length + right.length).fill(0)

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    const leftDigit = left.charCodeAt(leftIndex) - 48
    for (
      let rightIndex = right.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      const rightDigit = right.charCodeAt(rightIndex) - 48
      const low = leftIndex + rightIndex + 1
      const total = places[low] + leftDigit * rightDigit
      places[low] = total % 10
      places[low - 1] += Math.floor(total / 10)
    }
  }
  let firstDigit = 0
  while (firstDigit < places.length - 1 && places[firstDigit] === 0) {
    firstDigit += 1
  }
  return places.slice(firstDigit).join('')
}

function solveMultiplyStringsDroppingCarry(input: JsonValue): JsonValue {
  const { left, right } = readMultiplicationInput(input)
  const product = solveMultiplyStrings(input)
  const operandLength = Math.max(left.length, right.length)
  return product.length > operandLength ? product.slice(1) : product
}

function solveMultiplyStringsOverwritingPartials(input: JsonValue): JsonValue {
  const { left, right } = readMultiplicationInput(input)
  if (left === '0' || right === '0') return '0'
  const places = Array<number>(left.length + right.length).fill(0)

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    const leftDigit = left.charCodeAt(leftIndex) - 48
    for (
      let rightIndex = right.length - 1;
      rightIndex >= 0;
      rightIndex -= 1
    ) {
      const product =
        leftDigit * (right.charCodeAt(rightIndex) - 48)
      const low = leftIndex + rightIndex + 1
      places[low] = product % 10
      places[low - 1] = Math.floor(product / 10)
    }
  }
  let firstDigit = 0
  while (firstDigit < places.length - 1 && places[firstDigit] === 0) {
    firstDigit += 1
  }
  return places.slice(firstDigit).join('')
}

type SquareEvent = {
  readonly op: 'add' | 'count'
  readonly point: Point
}

function readPoint(value: JsonValue, label: string): Point {
  const object = readExactObject(value, label, ['x', 'y'])
  return {
    x: readSafeInteger(object.x, `${label}.x`),
    y: readSafeInteger(object.y, `${label}.y`),
  }
}

function readSquareEvents(input: JsonValue): readonly SquareEvent[] {
  const object = readExactObject(input, 'Detect Squares input', ['events'])
  return readArray(object.events, 'events').map((event, index) => {
    const label = `events[${index}]`
    const record = readExactObject(event, label, ['op', 'point'])
    const op = readString(record.op, `${label}.op`)
    if (op !== 'add' && op !== 'count') {
      throw new RangeError(`${label}.op must be "add" or "count"`)
    }
    return { op, point: readPoint(record.point, `${label}.point`) }
  })
}

function pointFrequency(
  points: ReadonlyMap<number, ReadonlyMap<number, number>>,
  point: Point,
): number {
  return points.get(point.x)?.get(point.y) ?? 0
}

function solveDetectSquaresWithDuplicateRule(
  input: JsonValue,
  preserveDuplicates: boolean,
  directions: readonly number[] = [-1, 1],
): JsonValue {
  const points = new Map<number, Map<number, number>>()
  const answers: number[] = []

  for (const event of readSquareEvents(input)) {
    const { x, y } = event.point
    if (event.op === 'add') {
      let column = points.get(x)
      if (!column) {
        column = new Map<number, number>()
        points.set(x, column)
      }
      column.set(y, preserveDuplicates ? (column.get(y) ?? 0) + 1 : 1)
      continue
    }

    let total = 0
    for (const [otherY, verticalFrequency] of points.get(x) ?? []) {
      if (otherY === y) continue
      const side = Math.abs(otherY - y)
      for (const direction of directions) {
        const otherX = x + direction * side
        if (!Number.isSafeInteger(otherX)) continue
        const contribution =
          verticalFrequency *
          pointFrequency(points, { x: otherX, y }) *
          pointFrequency(points, { x: otherX, y: otherY })
        total += contribution
        if (!Number.isSafeInteger(total)) {
          throw new RangeError('square count exceeds JSON safe-integer range')
        }
      }
    }
    answers.push(total)
  }
  return answers
}

function readBitWidth(value: JsonValue, label = 'bitWidth'): number {
  const width = readPositiveInteger(value, label)
  if (width > 1024) {
    throw new RangeError(`${label} must not exceed 1024`)
  }
  return width
}

function bitMask(width: number): bigint {
  return (1n << BigInt(width)) - 1n
}

function assertFitsWidth(
  value: number,
  width: number,
  signed: boolean,
  label: string,
): void {
  const integer = BigInt(value)
  const widthBits = BigInt(width)
  const minimum = signed ? -(1n << (widthBits - 1n)) : 0n
  const maximum = signed
    ? (1n << (widthBits - 1n)) - 1n
    : (1n << widthBits) - 1n
  if (integer < minimum || integer > maximum) {
    throw new RangeError(`${label} does not fit its declared bit width`)
  }
}

function decodeWidthBits(
  bits: bigint,
  width: number,
  signed: boolean,
): bigint {
  const normalized = bits & bitMask(width)
  if (!signed) return normalized
  const signBit = 1n << BigInt(width - 1)
  return (normalized & signBit) === 0n
    ? normalized
    : normalized - (1n << BigInt(width))
}

function jsonInteger(value: bigint, label: string): number {
  if (
    value < BigInt(Number.MIN_SAFE_INTEGER) ||
    value > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new RangeError(`${label} exceeds JSON safe-integer range`)
  }
  return Number(value)
}

function readIntegerArray(value: JsonValue, label: string): readonly number[] {
  return readArray(value, label).map((item, index) =>
    readSafeInteger(item, `${label}[${index}]`),
  )
}

type SingleNumberInput = {
  readonly values: readonly number[]
  readonly width: number
  readonly signed: boolean
}

function readSingleNumberInput(input: JsonValue): SingleNumberInput {
  const object = readExactObject(input, 'Single Number input', [
    'values',
    'bitWidth',
    'signed',
  ])
  const width = readBitWidth(object.bitWidth)
  const signed = readBoolean(object.signed, 'signed')
  const values = readIntegerArray(object.values, 'values')
  if (values.length === 0) {
    throw new RangeError('values must be non-empty')
  }
  const occurrences = new Map<number, number>()
  for (const value of values) {
    assertFitsWidth(value, width, signed, 'value')
    occurrences.set(value, (occurrences.get(value) ?? 0) + 1)
  }
  const singleCount = [...occurrences.values()].filter(
    (count) => count === 1,
  ).length
  if (
    singleCount !== 1 ||
    [...occurrences.values()].some((count) => count !== 1 && count !== 2)
  ) {
    throw new RangeError('values must contain one single and duplicate pairs')
  }
  return { values, width, signed }
}

function solveSingleNumber(input: JsonValue): JsonValue {
  const { values, width, signed } = readSingleNumberInput(input)
  const mask = bitMask(width)
  let answer = 0n
  for (const value of values) answer ^= BigInt(value) & mask
  return jsonInteger(decodeWidthBits(answer, width, signed), 'single number')
}

function solveSingleNumberAbsoluteXor(input: JsonValue): JsonValue {
  const { values, width, signed } = readSingleNumberInput(input)
  const mask = bitMask(width)
  let answer = 0n
  for (const value of values) answer ^= BigInt(Math.abs(value)) & mask
  return jsonInteger(decodeWidthBits(answer, width, signed), 'single number')
}

function solveSingleNumberWithOr(input: JsonValue): JsonValue {
  const { values, width, signed } = readSingleNumberInput(input)
  const mask = bitMask(width)
  let answer = 0n
  for (const value of values) answer |= BigInt(value) & mask
  return jsonInteger(decodeWidthBits(answer, width, signed), 'single number')
}

type FixedWidthValue = {
  readonly value: number
  readonly width: number
  readonly signed: boolean
}

function readFixedWidthValue(
  input: JsonValue,
  label: string,
): FixedWidthValue {
  const object = readExactObject(input, `${label} input`, [
    'value',
    'bitWidth',
    'signed',
  ])
  const value = readSafeInteger(object.value, 'value')
  const width = readBitWidth(object.bitWidth)
  const signed = readBoolean(object.signed, 'signed')
  assertFitsWidth(value, width, signed, 'value')
  return { value, width, signed }
}

function popcount(bits: bigint): number {
  let value = bits
  let count = 0
  while (value !== 0n) {
    value &= value - 1n
    count += 1
  }
  return count
}

function solveNumberOf1Bits(input: JsonValue): JsonValue {
  const { value, width } = readFixedWidthValue(input, 'Number of 1 Bits')
  return popcount(BigInt(value) & bitMask(width))
}

function solveNumberOf1BitsMagnitude(input: JsonValue): JsonValue {
  const { value } = readFixedWidthValue(input, 'Number of 1 Bits')
  return popcount(BigInt(Math.abs(value)))
}

function solveNumberOf1BitsWithShortMask(input: JsonValue): JsonValue {
  const { value, width } = readFixedWidthValue(input, 'Number of 1 Bits')
  return popcount(BigInt(value) & bitMask(width - 1))
}

type CountingBitsInput = {
  readonly limit: number
  readonly width: number
}

function readCountingBitsInput(input: JsonValue): CountingBitsInput {
  const object = readExactObject(input, 'Counting Bits input', [
    'limit',
    'bitWidth',
    'signed',
  ])
  const limit = readSafeInteger(object.limit, 'limit')
  if (limit < 0) throw new RangeError('limit must be nonnegative')
  const width = readBitWidth(object.bitWidth)
  readExpectedBoolean(object.signed, false, 'signed')
  assertFitsWidth(limit, width, false, 'limit')
  return { limit, width }
}

function buildBitCounts(limit: number, includeLimit: boolean): number[] {
  const counts = Array<number>(limit + 1).fill(0)
  const end = includeLimit ? limit : limit - 1
  for (let value = 1; value <= end; value += 1) {
    counts[value] = counts[Math.floor(value / 2)] + (value % 2)
  }
  return counts
}

function solveCountingBits(input: JsonValue): JsonValue {
  const { limit } = readCountingBitsInput(input)
  return buildBitCounts(limit, true)
}

function solveCountingBitsWithoutLimit(input: JsonValue): JsonValue {
  const { limit } = readCountingBitsInput(input)
  return buildBitCounts(limit, false)
}

function solveCountingBitsFromPrevious(input: JsonValue): JsonValue {
  const { limit } = readCountingBitsInput(input)
  const counts = Array<number>(limit + 1).fill(0)
  for (let value = 1; value <= limit; value += 1) {
    counts[value] = counts[value - 1] + (value % 2)
  }
  return counts
}

function solveReverseBits(input: JsonValue): JsonValue {
  const { value, width } = readFixedWidthValue(input, 'Reverse Bits')
  let source = BigInt(value) & bitMask(width)
  let reversed = 0n
  for (let index = 0; index < width; index += 1) {
    reversed = (reversed << 1n) | (source & 1n)
    source >>= 1n
  }
  return jsonInteger(reversed, 'reversed bits')
}

function solveReverseBitsUntilZero(input: JsonValue): JsonValue {
  const { value, width } = readFixedWidthValue(input, 'Reverse Bits')
  let source = BigInt(value) & bitMask(width)
  let reversed = 0n
  while (source !== 0n) {
    reversed = (reversed << 1n) | (source & 1n)
    source >>= 1n
  }
  return jsonInteger(reversed, 'reversed bits')
}

function solveReverseBitsOneBitShort(input: JsonValue): JsonValue {
  const { value, width } = readFixedWidthValue(input, 'Reverse Bits')
  let source = BigInt(value) & bitMask(width)
  let reversed = 0n
  for (let index = 0; index < width - 1; index += 1) {
    reversed = (reversed << 1n) | (source & 1n)
    source >>= 1n
  }
  return jsonInteger(reversed, 'reversed bits')
}

type MissingNumberInput = {
  readonly values: readonly number[]
  readonly end: number
  readonly width: number
}

function readMissingNumberInput(input: JsonValue): MissingNumberInput {
  const object = readExactObject(input, 'Missing Number input', [
    'values',
    'domain',
    'bitWidth',
    'signed',
  ])
  const domain = readExactObject(object.domain, 'domain', ['start', 'end'])
  const start = readSafeInteger(domain.start, 'domain.start')
  const end = readSafeInteger(domain.end, 'domain.end')
  const width = readBitWidth(object.bitWidth)
  readExpectedBoolean(object.signed, false, 'signed')
  const values = readIntegerArray(object.values, 'values')
  if (start !== 0 || end < 0 || end !== values.length) {
    throw new RangeError('domain must be exactly 0 through values.length')
  }
  assertFitsWidth(end, width, false, 'domain.end')
  const unique = new Set<number>()
  for (const value of values) {
    if (value < 0 || value > end || unique.has(value)) {
      throw new RangeError('values must be distinct members of the domain')
    }
    unique.add(value)
  }
  return { values, end, width }
}

function solveMissingNumberWithEndpoint(
  input: JsonValue,
  includeEndpoint: boolean,
): JsonValue {
  const { values, end, width } = readMissingNumberInput(input)
  let answer = includeEndpoint ? BigInt(end) : 0n
  for (let index = 0; index < values.length; index += 1) {
    answer ^= BigInt(index) ^ BigInt(values[index])
  }
  return jsonInteger(answer & bitMask(width), 'missing number')
}

function solveMissingNumberWithoutIndices(input: JsonValue): JsonValue {
  const { values, end, width } = readMissingNumberInput(input)
  let answer = BigInt(end)
  for (const value of values) answer ^= BigInt(value)
  return jsonInteger(answer & bitMask(width), 'missing number')
}

type SignedAdditionInput = {
  readonly left: number
  readonly right: number
  readonly width: number
}

function readSignedAdditionInput(input: JsonValue): SignedAdditionInput {
  const object = readExactObject(input, 'Sum of Two Integers input', [
    'left',
    'right',
    'bitWidth',
    'signed',
  ])
  const left = readSafeInteger(object.left, 'left')
  const right = readSafeInteger(object.right, 'right')
  const width = readBitWidth(object.bitWidth)
  readExpectedBoolean(object.signed, true, 'signed')
  assertFitsWidth(left, width, true, 'left')
  assertFitsWidth(right, width, true, 'right')
  return { left, right, width }
}

function addWidthBits(input: JsonValue): {
  readonly bits: bigint
  readonly width: number
} {
  const supplied = readSignedAdditionInput(input)
  const mask = bitMask(supplied.width)
  let left = BigInt(supplied.left) & mask
  let right = BigInt(supplied.right) & mask
  while (right !== 0n) {
    const partial = (left ^ right) & mask
    const carry = ((left & right) << 1n) & mask
    left = partial
    right = carry
  }
  return { bits: left, width: supplied.width }
}

function solveSumOfTwoIntegers(input: JsonValue): JsonValue {
  const { bits, width } = addWidthBits(input)
  return jsonInteger(decodeWidthBits(bits, width, true), 'signed sum')
}

function solveSumOfTwoIntegersUnsigned(input: JsonValue): JsonValue {
  const { bits } = addWidthBits(input)
  return jsonInteger(bits, 'unsigned sum')
}

function solveSumOfTwoIntegersWithoutCarry(input: JsonValue): JsonValue {
  const { left, right, width } = readSignedAdditionInput(input)
  const bits = (BigInt(left) ^ BigInt(right)) & bitMask(width)
  return jsonInteger(decodeWidthBits(bits, width, true), 'signed sum')
}

type ReverseIntegerInput = {
  readonly value: number
  readonly width: number
}

function readReverseIntegerInput(input: JsonValue): ReverseIntegerInput {
  const object = readExactObject(input, 'Reverse Integer input', [
    'value',
    'bitWidth',
    'signed',
  ])
  const value = readSafeInteger(object.value, 'value')
  const width = readBitWidth(object.bitWidth)
  readExpectedBoolean(object.signed, true, 'signed')
  assertFitsWidth(value, width, true, 'value')
  return { value, width }
}

function reverseIntegerMagnitude(value: number): bigint {
  let magnitude = BigInt(value)
  if (magnitude < 0n) magnitude = -magnitude
  let reversed = 0n
  while (magnitude !== 0n) {
    reversed = reversed * 10n + (magnitude % 10n)
    magnitude /= 10n
  }
  return reversed
}

function solveReverseInteger(input: JsonValue): JsonValue {
  const { value, width } = readReverseIntegerInput(input)
  const reversed = reverseIntegerMagnitude(value)
  const limit =
    value < 0
      ? 1n << BigInt(width - 1)
      : (1n << BigInt(width - 1)) - 1n
  if (reversed > limit) return 0
  return jsonInteger(value < 0 ? -reversed : reversed, 'reversed integer')
}

function solveReverseIntegerWithoutOverflow(input: JsonValue): JsonValue {
  const { value } = readReverseIntegerInput(input)
  const reversed = reverseIntegerMagnitude(value)
  return jsonInteger(value < 0 ? -reversed : reversed, 'reversed integer')
}

function solveReverseIntegerWithoutSign(input: JsonValue): JsonValue {
  const { value, width } = readReverseIntegerInput(input)
  const reversed = reverseIntegerMagnitude(value)
  const limit =
    value < 0
      ? 1n << BigInt(width - 1)
      : (1n << BigInt(width - 1)) - 1n
  if (reversed > limit) return 0
  return jsonInteger(reversed, 'reversed integer')
}

const insertIntervalOracle = defineProblemMissionOracle({
  problemId: 'problem:insert-interval',
  solve: solveInsertInterval,
  mutants: [
    {
      id: 'merge-first-overlap-only',
      description:
        'Merges only the first overlap, leaving later intervals bridged by the insertion unchanged.',
      solve: solveInsertIntervalFirstOverlapOnly,
    },
    {
      id: 'omit-trailing-placement',
      description:
        'Places the incoming interval only before a right-side interval, so an empty or trailing insertion disappears.',
      solve: solveInsertIntervalWithoutTrailingPlacement,
    },
  ],
})

const mergeIntervalsOracle = defineProblemMissionOracle({
  problemId: 'problem:merge-intervals',
  solve: solveMergeIntervals,
  mutants: [
    {
      id: 'strict-overlap-only',
      description:
        'Uses a strict overlap comparison, so intervals touching at an endpoint stay split.',
      solve(input: JsonValue): JsonValue {
        return solveMergeIntervalsWithRule(input, false)
      },
    },
    {
      id: 'assume-input-sorted',
      description:
        'Scans reports in arrival order without first sorting their start times.',
      solve: solveMergeIntervalsAssumingSorted,
    },
  ],
})

const nonOverlappingIntervalsOracle = defineProblemMissionOracle({
  problemId: 'problem:non-overlapping-intervals',
  solve(input: JsonValue): JsonValue {
    return solveMinimumRemovals(input, true)
  },
  mutants: [
    {
      id: 'sort-by-start',
      description:
        'Keeps earliest-starting requests instead of the requests that finish earliest.',
      solve(input: JsonValue): JsonValue {
        return solveMinimumRemovals(input, false)
      },
    },
    {
      id: 'touching-counts-as-overlap',
      description:
        'Requires a strict gap between kept requests and removes valid endpoint handoffs.',
      solve: solveMinimumRemovalsTreatingTouchAsOverlap,
    },
  ],
})

const meetingRoomsOracle = defineProblemMissionOracle({
  problemId: 'problem:meeting-rooms',
  solve: solveMeetingRooms,
  mutants: [
    {
      id: 'touching-conflicts',
      description:
        'Treats an exact end-to-start handoff as an overlapping booking.',
      solve(input: JsonValue): JsonValue {
        return solveMeetingRoomsWithTouchRule(input, true)
      },
    },
    {
      id: 'scan-input-order',
      description:
        'Checks adjacent bookings without sorting them into chronological order.',
      solve: solveMeetingRoomsInInputOrder,
    },
  ],
})

const meetingRoomsIIOracle = defineProblemMissionOracle({
  problemId: 'problem:meeting-rooms-ii',
  solve(input: JsonValue): JsonValue {
    return solveMeetingRoomsIIWithReleaseRule(input, false)
  },
  mutants: [
    {
      id: 'strict-bay-release',
      description:
        'Reuses a bay only after its end time, not at an exact-time handoff.',
      solve(input: JsonValue): JsonValue {
        return solveMeetingRoomsIIWithReleaseRule(input, true)
      },
    },
    {
      id: 'allocate-in-input-order',
      description:
        'Assigns bays in the supplied order, so later-listed early sessions inflate the allocation.',
      solve: solveMeetingRoomsIIInInputOrder,
    },
  ],
})

const minimumIntervalOracle = defineProblemMissionOracle({
  problemId: 'problem:minimum-interval-to-include-each-query',
  solve(input: JsonValue): JsonValue {
    return solveMinimumIntervalLengths(input, true)
  },
  mutants: [
    {
      id: 'exclusive-length',
      description:
        'Computes end minus start and omits one endpoint from every inclusive length.',
      solve(input: JsonValue): JsonValue {
        return solveMinimumIntervalLengths(input, false)
      },
    },
    {
      id: 'exclude-query-endpoints',
      description:
        'Uses strict containment and rejects intervals when a query equals either endpoint.',
      solve(input: JsonValue): JsonValue {
        return solveMinimumIntervalLengths(input, true, false)
      },
    },
  ],
})

const rotateImageOracle = defineProblemMissionOracle({
  problemId: 'problem:rotate-image',
  solve: solveRotateImage,
  mutants: [
    {
      id: 'counterclockwise',
      description:
        'Moves cells through a counterclockwise quarter-turn instead of clockwise.',
      solve: solveRotateImageCounterclockwise,
    },
    {
      id: 'transpose-only',
      description:
        'Swaps rows and columns but omits the row reversal needed for a clockwise turn.',
      solve: solveRotateImageTransposeOnly,
    },
  ],
})

const spiralMatrixOracle = defineProblemMissionOracle({
  problemId: 'problem:spiral-matrix',
  solve: solveSpiralMatrix,
  mutants: [
    {
      id: 'row-major',
      description:
        'Reads complete rows from left to right instead of shrinking clockwise boundaries.',
      solve: solveSpiralMatrixRowMajor,
    },
    {
      id: 'omit-collapsed-layer-guards',
      description:
        'Traverses bottom and left edges after a layer collapses, duplicating an inner row or column.',
      solve: solveSpiralMatrixWithoutInnerGuards,
    },
  ],
})

const setMatrixZeroesOracle = defineProblemMissionOracle({
  problemId: 'problem:set-matrix-zeroes',
  solve: solveSetMatrixZeroes,
  mutants: [
    {
      id: 'rows-only',
      description:
        'Clears rows containing an original zero but forgets the corresponding columns.',
      solve: solveSetMatrixZeroesRowsOnly,
    },
    {
      id: 'cascade-written-zeroes',
      description:
        'Discovers newly written zeroes as fresh triggers and clears unrelated rows and columns.',
      solve: solveSetMatrixZeroesWithCascadingDiscovery,
    },
  ],
})

const happyNumberOracle = defineProblemMissionOracle({
  problemId: 'problem:happy-number',
  solve: solveHappyNumber,
  mutants: [
    {
      id: 'one-transform-only',
      description:
        'Checks only the first digit-square transformation instead of following the sequence.',
      solve: solveHappyNumberOneTransform,
    },
    {
      id: 'cube-digits',
      description:
        'Cubes each decimal digit instead of squaring it during the repeated transformation.',
      solve: solveHappyNumberWithDigitCubes,
    },
  ],
})

const plusOneOracle = defineProblemMissionOracle({
  problemId: 'problem:plus-one',
  solve: solvePlusOne,
  mutants: [
    {
      id: 'no-leading-carry',
      description:
        'Turns every nine into zero but omits the new leading one after an all-nines input.',
      solve: solvePlusOneWithoutLeadingCarry,
    },
    {
      id: 'carry-left-to-right',
      description:
        'Starts at the most-significant digit, so the carry changes the wrong decimal place.',
      solve: solvePlusOneLeftToRight,
    },
  ],
})

const powXNOracle = defineProblemMissionOracle({
  problemId: 'problem:powx-n',
  solve: solvePowXN,
  mutants: [
    {
      id: 'negative-without-reciprocal',
      description:
        'Makes a negative exponent positive without first replacing the base by its reciprocal.',
      solve: solvePowXNWithoutReciprocal,
    },
    {
      id: 'square-before-odd-bit',
      description:
        'Squares the current power before consuming an odd exponent bit, shifting every selected power.',
      solve: solvePowXNSquaringBeforeOddBit,
    },
  ],
})

const multiplyStringsOracle = defineProblemMissionOracle({
  problemId: 'problem:multiply-strings',
  solve: solveMultiplyStrings,
  mutants: [
    {
      id: 'drop-leading-carry',
      description:
        'Drops the most-significant carry when the product grows beyond the longer operand.',
      solve: solveMultiplyStringsDroppingCarry,
    },
    {
      id: 'overwrite-partial-products',
      description:
        'Overwrites shared place values instead of accumulating aligned digit products.',
      solve: solveMultiplyStringsOverwritingPartials,
    },
  ],
})

const detectSquaresOracle = defineProblemMissionOracle({
  problemId: 'problem:detect-squares',
  solve(input: JsonValue): JsonValue {
    return solveDetectSquaresWithDuplicateRule(input, true)
  },
  mutants: [
    {
      id: 'deduplicate-points',
      description:
        'Stores coordinate presence only, losing duplicate-marker combinations.',
      solve(input: JsonValue): JsonValue {
        return solveDetectSquaresWithDuplicateRule(input, false)
      },
    },
    {
      id: 'positive-x-direction-only',
      description:
        'Checks squares to the right of the query but never checks matching corners to its left.',
      solve(input: JsonValue): JsonValue {
        return solveDetectSquaresWithDuplicateRule(input, true, [1])
      },
    },
  ],
})

const singleNumberOracle = defineProblemMissionOracle({
  problemId: 'problem:single-number',
  solve: solveSingleNumber,
  mutants: [
    {
      id: 'absolute-xor',
      description:
        'Removes signs before XOR, so a negative unpaired tag becomes a positive pattern.',
      solve: solveSingleNumberAbsoluteXor,
    },
    {
      id: 'or-instead-of-xor',
      description:
        'Combines tag patterns with OR, so duplicate pairs accumulate instead of canceling.',
      solve: solveSingleNumberWithOr,
    },
  ],
})

const numberOf1BitsOracle = defineProblemMissionOracle({
  problemId: 'problem:number-of-1-bits',
  solve: solveNumberOf1Bits,
  mutants: [
    {
      id: 'magnitude-only',
      description:
        'Counts bits in a negative value’s magnitude instead of its fixed-width two’s-complement pattern.',
      solve: solveNumberOf1BitsMagnitude,
    },
    {
      id: 'mask-one-bit-short',
      description:
        'Builds a mask with bitWidth minus one positions and drops the declared top bit.',
      solve: solveNumberOf1BitsWithShortMask,
    },
  ],
})

const countingBitsOracle = defineProblemMissionOracle({
  problemId: 'problem:counting-bits',
  solve: solveCountingBits,
  mutants: [
    {
      id: 'leaves-limit-unfilled',
      description:
        'Stops the dynamic-programming loop before filling the requested limit itself.',
      solve: solveCountingBitsWithoutLimit,
    },
    {
      id: 'reuse-previous-value',
      description:
        'Builds each count from value minus one instead of the shifted half-value.',
      solve: solveCountingBitsFromPrevious,
    },
  ],
})

const reverseBitsOracle = defineProblemMissionOracle({
  problemId: 'problem:reverse-bits',
  solve: solveReverseBits,
  mutants: [
    {
      id: 'stop-at-highest-one',
      description:
        'Stops when the source reaches zero and therefore drops fixed-width zero positions.',
      solve: solveReverseBitsUntilZero,
    },
    {
      id: 'reverse-one-bit-short',
      description:
        'Runs one fewer iteration than bitWidth and omits one register position.',
      solve: solveReverseBitsOneBitShort,
    },
  ],
})

const missingNumberOracle = defineProblemMissionOracle({
  problemId: 'problem:missing-number',
  solve(input: JsonValue): JsonValue {
    return solveMissingNumberWithEndpoint(input, true)
  },
  mutants: [
    {
      id: 'omit-domain-endpoint',
      description:
        'Starts XOR at zero and never contributes the extra domain label n.',
      solve(input: JsonValue): JsonValue {
        return solveMissingNumberWithEndpoint(input, false)
      },
    },
    {
      id: 'omit-domain-indices',
      description:
        'XORs the endpoint and supplied values but never contributes indices zero through n minus one.',
      solve: solveMissingNumberWithoutIndices,
    },
  ],
})

const sumOfTwoIntegersOracle = defineProblemMissionOracle({
  problemId: 'problem:sum-of-two-integers',
  solve: solveSumOfTwoIntegers,
  mutants: [
    {
      id: 'unsigned-result',
      description:
        'Returns the wrapped bit pattern as unsigned instead of decoding its sign bit.',
      solve: solveSumOfTwoIntegersUnsigned,
    },
    {
      id: 'xor-without-carry',
      description:
        'Returns only the no-carry XOR partial and never propagates shared one bits.',
      solve: solveSumOfTwoIntegersWithoutCarry,
    },
  ],
})

const reverseIntegerOracle = defineProblemMissionOracle({
  problemId: 'problem:reverse-integer',
  solve: solveReverseInteger,
  mutants: [
    {
      id: 'skip-overflow-check',
      description:
        'Returns the reversed digits without rejecting a result outside the signed width.',
      solve: solveReverseIntegerWithoutOverflow,
    },
    {
      id: 'drop-negative-sign',
      description:
        'Applies the correct overflow bound but returns every reversed magnitude as nonnegative.',
      solve: solveReverseIntegerWithoutSign,
    },
  ],
})

export const REALM_6_PROBLEM_MISSION_ORACLES =
  defineProblemMissionOracleRegistry({
    'problem:insert-interval': insertIntervalOracle,
    'problem:merge-intervals': mergeIntervalsOracle,
    'problem:non-overlapping-intervals': nonOverlappingIntervalsOracle,
    'problem:meeting-rooms': meetingRoomsOracle,
    'problem:meeting-rooms-ii': meetingRoomsIIOracle,
    'problem:minimum-interval-to-include-each-query': minimumIntervalOracle,
    'problem:rotate-image': rotateImageOracle,
    'problem:spiral-matrix': spiralMatrixOracle,
    'problem:set-matrix-zeroes': setMatrixZeroesOracle,
    'problem:happy-number': happyNumberOracle,
    'problem:plus-one': plusOneOracle,
    'problem:powx-n': powXNOracle,
    'problem:multiply-strings': multiplyStringsOracle,
    'problem:detect-squares': detectSquaresOracle,
    'problem:single-number': singleNumberOracle,
    'problem:number-of-1-bits': numberOf1BitsOracle,
    'problem:counting-bits': countingBitsOracle,
    'problem:reverse-bits': reverseBitsOracle,
    'problem:missing-number': missingNumberOracle,
    'problem:sum-of-two-integers': sumOfTwoIntegersOracle,
    'problem:reverse-integer': reverseIntegerOracle,
  })
