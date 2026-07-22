import type { JsonValue } from '../../../../../types/learning'
import {
  defineProblemMissionOracle,
  defineProblemMissionOracleRegistry,
} from '../oracleContract'

type JsonObject = { readonly [key: string]: JsonValue }

type IntegerRules = {
  readonly min?: number
  readonly max?: number
}

type IntegerArrayRules = IntegerRules & {
  readonly minLength?: number
  readonly distinct?: boolean
}

function readObject(
  input: JsonValue,
  label: string,
  expectedKeys: readonly string[],
): JsonObject {
  if (input === null || Array.isArray(input) || typeof input !== 'object') {
    throw new TypeError(`${label} input must be a JSON object`)
  }

  const record = input as JsonObject
  const actualKeys = Object.keys(record)
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(record, key),
    )
  ) {
    throw new TypeError(
      `${label} input must contain exactly: ${expectedKeys.join(', ')}`,
    )
  }
  return record
}

function readInteger(
  value: JsonValue,
  label: string,
  rules: IntegerRules = {},
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${label} must be a safe integer`)
  }
  if (rules.min !== undefined && value < rules.min) {
    throw new RangeError(`${label} must be at least ${rules.min}`)
  }
  if (rules.max !== undefined && value > rules.max) {
    throw new RangeError(`${label} must be at most ${rules.max}`)
  }
  return value
}

function readIntegerField(
  record: JsonObject,
  key: string,
  rules: IntegerRules = {},
): number {
  return readInteger(record[key], key, rules)
}

function readStringField(
  record: JsonObject,
  key: string,
  options: {
    readonly minLength?: number
    readonly pattern?: RegExp
    readonly description?: string
  } = {},
): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new TypeError(`${key} must be a string`)
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new RangeError(
      `${key} must contain at least ${options.minLength} character(s)`,
    )
  }
  if (options.pattern !== undefined && !options.pattern.test(value)) {
    throw new TypeError(
      `${key} must contain ${options.description ?? 'valid characters'}`,
    )
  }
  return value
}

function readIntegerArrayField(
  record: JsonObject,
  key: string,
  rules: IntegerArrayRules = {},
): readonly number[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    throw new TypeError(`${key} must be an array`)
  }
  if (rules.minLength !== undefined && value.length < rules.minLength) {
    throw new RangeError(
      `${key} must contain at least ${rules.minLength} item(s)`,
    )
  }

  const result = value.map((item, index) =>
    readInteger(item, `${key}[${index}]`, rules),
  )
  if (rules.distinct && new Set(result).size !== result.length) {
    throw new TypeError(`${key} must contain distinct integers`)
  }
  return result
}

function readStringArrayField(
  record: JsonObject,
  key: string,
  options: { readonly itemMinLength?: number } = {},
): readonly string[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    throw new TypeError(`${key} must be an array`)
  }
  return value.map((item, index) => {
    if (typeof item !== 'string') {
      throw new TypeError(`${key}[${index}] must be a string`)
    }
    if (
      options.itemMinLength !== undefined &&
      item.length < options.itemMinLength
    ) {
      throw new RangeError(
        `${key}[${index}] must contain at least ${options.itemMinLength} character(s)`,
      )
    }
    return item
  })
}

function readIntegerMatrixField(
  record: JsonObject,
  key: string,
): readonly (readonly number[])[] {
  const value = record[key]
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${key} must be a nonempty rectangular array`)
  }

  let width: number | undefined
  const matrix = value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new TypeError(`${key}[${rowIndex}] must be a nonempty array`)
    }
    width ??= row.length
    if (row.length !== width) {
      throw new TypeError(`${key} must be rectangular`)
    }
    return row.map((item, columnIndex) =>
      readInteger(item, `${key}[${rowIndex}][${columnIndex}]`),
    )
  })
  return matrix
}

function readTriplet(value: JsonValue, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a three-integer array`)
  }
  return value.map((item, index) =>
    readInteger(item, `${label}[${index}]`),
  )
}

function readTripletField(
  record: JsonObject,
  key: string,
): readonly number[] {
  return readTriplet(record[key], key)
}

function readTripletArrayField(
  record: JsonObject,
  key: string,
): readonly (readonly number[])[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    throw new TypeError(`${key} must be an array`)
  }
  return value.map((item, index) => readTriplet(item, `${key}[${index}]`))
}

function readSingleInteger(
  input: JsonValue,
  problem: string,
  key: string,
  rules: IntegerRules = {},
): number {
  return readIntegerField(readObject(input, problem, [key]), key, rules)
}

function readSingleString(
  input: JsonValue,
  problem: string,
  key: string,
  options: {
    readonly minLength?: number
    readonly pattern?: RegExp
    readonly description?: string
  } = {},
): string {
  return readStringField(readObject(input, problem, [key]), key, options)
}

function readSingleIntegerArray(
  input: JsonValue,
  problem: string,
  key: string,
  rules: IntegerArrayRules = {},
): readonly number[] {
  return readIntegerArrayField(readObject(input, problem, [key]), key, rules)
}

function climbingWays(levels: number): number {
  if (levels <= 1) return 1
  let twoBack = 1
  let oneBack = 1
  for (let level = 2; level <= levels; level += 1) {
    const current = oneBack + twoBack
    twoBack = oneBack
    oneBack = current
  }
  return oneBack
}

function minimumStairCost(fees: readonly number[]): number {
  let twoBack = 0
  let oneBack = 0
  for (const fee of fees) {
    const landing = fee + Math.min(twoBack, oneBack)
    twoBack = oneBack
    oneBack = landing
  }
  return Math.min(twoBack, oneBack)
}

function robLine(credits: readonly number[]): number {
  let twoBack = 0
  let oneBack = 0
  for (const value of credits) {
    const current = Math.max(oneBack, twoBack + value)
    twoBack = oneBack
    oneBack = current
  }
  return oneBack
}

function longestPalindrome(
  signal: string,
  includeEvenCenters: boolean,
): string {
  let bestStart = 0
  let bestLength = 0

  for (let center = 0; center < signal.length; center += 1) {
    const centers: readonly (readonly [number, number])[] =
      includeEvenCenters
        ? [
            [center, center],
            [center, center + 1],
          ]
        : [[center, center]]

    for (const [initialLeft, initialRight] of centers) {
      let left = initialLeft
      let right = initialRight
      while (
        left >= 0 &&
        right < signal.length &&
        signal[left] === signal[right]
      ) {
        left -= 1
        right += 1
      }
      const start = left + 1
      const length = right - left - 1
      if (
        length > bestLength ||
        (length === bestLength && start < bestStart)
      ) {
        bestStart = start
        bestLength = length
      }
    }
  }

  return signal.slice(bestStart, bestStart + bestLength)
}

function countPalindromes(
  signal: string,
  includeEvenCenters: boolean,
): number {
  let count = 0
  for (let center = 0; center < signal.length; center += 1) {
    const centers: readonly (readonly [number, number])[] =
      includeEvenCenters
        ? [
            [center, center],
            [center, center + 1],
          ]
        : [[center, center]]
    for (const [initialLeft, initialRight] of centers) {
      let left = initialLeft
      let right = initialRight
      while (
        left >= 0 &&
        right < signal.length &&
        signal[left] === signal[right]
      ) {
        count += 1
        left -= 1
        right += 1
      }
    }
  }
  return count
}

function decodeCount(code: string, zeroCanStandAlone: boolean): number {
  const ways = Array<number>(code.length + 1).fill(0)
  ways[0] = 1
  ways[1] = zeroCanStandAlone || code[0] !== '0' ? 1 : 0
  for (let index = 2; index <= code.length; index += 1) {
    if (zeroCanStandAlone || code[index - 1] !== '0') {
      ways[index] += ways[index - 1]
    }
    const pair = Number(code.slice(index - 2, index))
    if (pair >= 10 && pair <= 26) {
      ways[index] += ways[index - 2]
    }
  }
  return ways[code.length]
}

function minimumCoinCount(coins: readonly number[], amount: number): number {
  const best = Array<number>(amount + 1).fill(Number.POSITIVE_INFINITY)
  best[0] = 0
  for (let total = 1; total <= amount; total += 1) {
    for (const coin of coins) {
      if (coin <= total) {
        best[total] = Math.min(best[total], best[total - coin] + 1)
      }
    }
  }
  return Number.isFinite(best[amount]) ? best[amount] : -1
}

function maximumProduct(factors: readonly number[]): number {
  let endingMaximum = factors[0]
  let endingMinimum = factors[0]
  let answer = factors[0]
  for (let index = 1; index < factors.length; index += 1) {
    const value = factors[index]
    const candidates = [
      value,
      value * endingMaximum,
      value * endingMinimum,
    ]
    endingMaximum = Math.max(...candidates)
    endingMinimum = Math.min(...candidates)
    answer = Math.max(answer, endingMaximum)
  }
  return answer
}

function canSegment(message: string, tokens: readonly string[]): boolean {
  const glossary = new Set(tokens)
  const reachable = Array<boolean>(message.length + 1).fill(false)
  reachable[0] = true
  for (let end = 1; end <= message.length; end += 1) {
    for (let start = 0; start < end; start += 1) {
      if (
        reachable[start] &&
        glossary.has(message.slice(start, end))
      ) {
        reachable[end] = true
        break
      }
    }
  }
  return reachable[message.length]
}

function increasingSubsequenceLength(
  ratings: readonly number[],
  allowEqual: boolean,
): number {
  const ending = Array<number>(ratings.length).fill(1)
  for (let index = 0; index < ratings.length; index += 1) {
    for (let previous = 0; previous < index; previous += 1) {
      const compatible = allowEqual
        ? ratings[previous] <= ratings[index]
        : ratings[previous] < ratings[index]
      if (compatible) {
        ending[index] = Math.max(ending[index], ending[previous] + 1)
      }
    }
  }
  return ending.length === 0 ? 0 : Math.max(...ending)
}

function canPartition(
  weights: readonly number[],
  ascendingUpdates: boolean,
): boolean {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total % 2 !== 0) return false
  const target = total / 2
  const reachable = Array<boolean>(target + 1).fill(false)
  reachable[0] = true
  for (const weight of weights) {
    if (ascendingUpdates) {
      for (let sum = weight; sum <= target; sum += 1) {
        reachable[sum] ||= reachable[sum - weight]
      }
    } else {
      for (let sum = target; sum >= weight; sum -= 1) {
        reachable[sum] ||= reachable[sum - weight]
      }
    }
  }
  return reachable[target]
}

function uniquePathCount(
  rows: number,
  columns: number,
  extraRow: boolean,
): number {
  const ways = Array<number>(columns).fill(1)
  const rowCount = extraRow ? rows : rows - 1
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      ways[column] += ways[column - 1]
    }
  }
  return ways[columns - 1]
}

function commonSubsequenceLength(
  first: string,
  second: string,
  countMatches: boolean,
): number {
  const dp = Array.from({ length: first.length + 1 }, () =>
    Array<number>(second.length + 1).fill(0),
  )
  for (let firstLength = 1; firstLength <= first.length; firstLength += 1) {
    for (
      let secondLength = 1;
      secondLength <= second.length;
      secondLength += 1
    ) {
      if (
        first[firstLength - 1] === second[secondLength - 1]
      ) {
        dp[firstLength][secondLength] =
          dp[firstLength - 1][secondLength - 1] +
          (countMatches ? 1 : 0)
      } else {
        dp[firstLength][secondLength] = Math.max(
          dp[firstLength - 1][secondLength],
          dp[firstLength][secondLength - 1],
        )
      }
    }
  }
  return dp[first.length][second.length]
}

function cooldownProfit(prices: readonly number[]): number {
  if (prices.length === 0) return 0
  let hold = -prices[0]
  let sold = Number.NEGATIVE_INFINITY
  let rest = 0
  for (let index = 1; index < prices.length; index += 1) {
    const price = prices[index]
    const nextHold = Math.max(hold, rest - price)
    const nextSold = hold + price
    const nextRest = Math.max(rest, sold)
    hold = nextHold
    sold = nextSold
    rest = nextRest
  }
  return Math.max(sold, rest)
}

function coinCombinationCount(
  coins: readonly number[],
  amount: number,
  coinOuterLoop: boolean,
): number {
  const ways = Array<number>(amount + 1).fill(0)
  ways[0] = 1
  if (coinOuterLoop) {
    for (const coin of coins) {
      for (let total = coin; total <= amount; total += 1) {
        ways[total] += ways[total - coin]
      }
    }
  } else {
    for (let total = 1; total <= amount; total += 1) {
      for (const coin of coins) {
        if (coin <= total) {
          ways[total] += ways[total - coin]
        }
      }
    }
  }
  return ways[amount]
}

function targetAssignmentCount(
  values: readonly number[],
  target: number,
): number {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (
    Math.abs(target) > total ||
    (total + target) % 2 !== 0
  ) {
    return 0
  }
  const goal = (total + target) / 2
  const ways = Array<number>(goal + 1).fill(0)
  ways[0] = 1
  for (const value of values) {
    for (let subtotal = goal; subtotal >= value; subtotal -= 1) {
      ways[subtotal] += ways[subtotal - value]
    }
  }
  return ways[goal]
}

function isInterleaving(
  laneA: string,
  laneB: string,
  merged: string,
  allowLaneB: boolean,
): boolean {
  if (merged.length !== laneA.length + laneB.length) return false
  const dp = Array.from({ length: laneA.length + 1 }, () =>
    Array<boolean>(laneB.length + 1).fill(false),
  )
  dp[0][0] = true
  for (let firstLength = 0; firstLength <= laneA.length; firstLength += 1) {
    for (
      let secondLength = 0;
      secondLength <= laneB.length;
      secondLength += 1
    ) {
      if (firstLength === 0 && secondLength === 0) continue
      const mergedIndex = firstLength + secondLength - 1
      const fromA =
        firstLength > 0 &&
        dp[firstLength - 1][secondLength] &&
        laneA[firstLength - 1] === merged[mergedIndex]
      const fromB =
        allowLaneB &&
        secondLength > 0 &&
        dp[firstLength][secondLength - 1] &&
        laneB[secondLength - 1] === merged[mergedIndex]
      dp[firstLength][secondLength] = fromA || fromB
    }
  }
  return dp[laneA.length][laneB.length]
}

type MatrixCell = {
  readonly row: number
  readonly column: number
}

function orderedMatrixCells(
  heights: readonly (readonly number[])[],
): readonly MatrixCell[] {
  const cells: MatrixCell[] = []
  for (let row = 0; row < heights.length; row += 1) {
    for (let column = 0; column < heights[0].length; column += 1) {
      cells.push({ row, column })
    }
  }
  cells.sort((left, right) => {
    const leftValue = heights[left.row][left.column]
    const rightValue = heights[right.row][right.column]
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1
    const leftIndex = left.row * heights[0].length + left.column
    const rightIndex = right.row * heights[0].length + right.column
    return leftIndex - rightIndex
  })
  return cells
}

function increasingMatrixPathLength(
  heights: readonly (readonly number[])[],
  allowEqualByIndex: boolean,
): number {
  const rows = heights.length
  const columns = heights[0].length
  const lengths = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(1),
  )
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  let answer = 1

  for (const { row, column } of orderedMatrixCells(heights)) {
    const currentIndex = row * columns + column
    for (const [rowDelta, columnDelta] of directions) {
      const neighborRow = row + rowDelta
      const neighborColumn = column + columnDelta
      if (
        neighborRow < 0 ||
        neighborRow >= rows ||
        neighborColumn < 0 ||
        neighborColumn >= columns
      ) {
        continue
      }
      const neighborValue = heights[neighborRow][neighborColumn]
      const currentValue = heights[row][column]
      const neighborIndex = neighborRow * columns + neighborColumn
      const canPrecede =
        neighborValue < currentValue ||
        (allowEqualByIndex &&
          neighborValue === currentValue &&
          neighborIndex < currentIndex)
      if (canPrecede) {
        lengths[row][column] = Math.max(
          lengths[row][column],
          lengths[neighborRow][neighborColumn] + 1,
        )
      }
    }
    answer = Math.max(answer, lengths[row][column])
  }
  return answer
}

function distinctSubsequenceCount(
  source: string,
  target: string,
  forwardTargetLoop: boolean,
): number {
  const ways = Array<number>(target.length + 1).fill(0)
  ways[0] = 1
  for (const symbol of source) {
    if (forwardTargetLoop) {
      for (let index = 0; index < target.length; index += 1) {
        if (symbol === target[index]) {
          ways[index + 1] += ways[index]
        }
      }
    } else {
      for (let index = target.length - 1; index >= 0; index -= 1) {
        if (symbol === target[index]) {
          ways[index + 1] += ways[index]
        }
      }
    }
  }
  return ways[target.length]
}

function editDistance(
  draft: string,
  goal: string,
  allowTransposition: boolean,
): number {
  const dp = Array.from({ length: draft.length + 1 }, () =>
    Array<number>(goal.length + 1).fill(0),
  )
  for (let index = 0; index <= draft.length; index += 1) {
    dp[index][0] = index
  }
  for (let index = 0; index <= goal.length; index += 1) {
    dp[0][index] = index
  }
  for (let draftLength = 1; draftLength <= draft.length; draftLength += 1) {
    for (let goalLength = 1; goalLength <= goal.length; goalLength += 1) {
      if (draft[draftLength - 1] === goal[goalLength - 1]) {
        dp[draftLength][goalLength] =
          dp[draftLength - 1][goalLength - 1]
      } else {
        dp[draftLength][goalLength] =
          1 +
          Math.min(
            dp[draftLength - 1][goalLength],
            dp[draftLength][goalLength - 1],
            dp[draftLength - 1][goalLength - 1],
          )
      }
      if (
        allowTransposition &&
        draftLength > 1 &&
        goalLength > 1 &&
        draft[draftLength - 1] === goal[goalLength - 2] &&
        draft[draftLength - 2] === goal[goalLength - 1]
      ) {
        dp[draftLength][goalLength] = Math.min(
          dp[draftLength][goalLength],
          dp[draftLength - 2][goalLength - 2] + 1,
        )
      }
    }
  }
  return dp[draft.length][goal.length]
}

function maximumBurstScore(orbs: readonly number[]): number {
  const values = [1, ...orbs, 1]
  const dp = Array.from({ length: values.length }, () =>
    Array<number>(values.length).fill(0),
  )
  for (let width = 2; width < values.length; width += 1) {
    for (let left = 0; left + width < values.length; left += 1) {
      const right = left + width
      for (let last = left + 1; last < right; last += 1) {
        dp[left][right] = Math.max(
          dp[left][right],
          dp[left][last] +
            values[left] * values[last] * values[right] +
            dp[last][right],
        )
      }
    }
  }
  return dp[0][values.length - 1]
}

function greedyBurstScore(orbs: readonly number[]): number {
  const remaining = [...orbs]
  let total = 0
  while (remaining.length > 0) {
    let bestIndex = 0
    let bestImmediate = Number.NEGATIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const left = index === 0 ? 1 : remaining[index - 1]
      const right =
        index === remaining.length - 1 ? 1 : remaining[index + 1]
      const immediate = left * remaining[index] * right
      if (immediate > bestImmediate) {
        bestImmediate = immediate
        bestIndex = index
      }
    }
    total += bestImmediate
    remaining.splice(bestIndex, 1)
  }
  return total
}

function regexMatch(
  text: string,
  pattern: string,
  starAllowsZero: boolean,
  dotMatchesAny = true,
): boolean {
  const dp = Array.from({ length: text.length + 1 }, () =>
    Array<boolean>(pattern.length + 1).fill(false),
  )
  dp[0][0] = true
  if (starAllowsZero) {
    for (let patternLength = 2; patternLength <= pattern.length; patternLength += 1) {
      if (pattern[patternLength - 1] === '*') {
        dp[0][patternLength] = dp[0][patternLength - 2]
      }
    }
  }

  for (let textLength = 1; textLength <= text.length; textLength += 1) {
    for (
      let patternLength = 1;
      patternLength <= pattern.length;
      patternLength += 1
    ) {
      const patternSymbol = pattern[patternLength - 1]
      if (patternSymbol === '*') {
        const repeated = pattern[patternLength - 2]
        const repeatedMatches =
          (dotMatchesAny && repeated === '.') ||
          repeated === text[textLength - 1]
        if (starAllowsZero) {
          dp[textLength][patternLength] =
            dp[textLength][patternLength - 2] ||
            (repeatedMatches && dp[textLength - 1][patternLength])
        } else {
          dp[textLength][patternLength] =
            repeatedMatches &&
            (dp[textLength - 1][patternLength] ||
              dp[textLength - 1][patternLength - 2])
        }
      } else if (
        (dotMatchesAny && patternSymbol === '.') ||
        patternSymbol === text[textLength - 1]
      ) {
        dp[textLength][patternLength] =
          dp[textLength - 1][patternLength - 1]
      }
    }
  }
  return dp[text.length][pattern.length]
}

function maximumSubarray(
  signals: readonly number[],
  allowEmpty: boolean,
): number {
  let ending = allowEmpty ? 0 : signals[0]
  let best = ending
  const start = allowEmpty ? 0 : 1
  for (let index = start; index < signals.length; index += 1) {
    ending = Math.max(signals[index], ending + signals[index])
    best = Math.max(best, ending)
  }
  return best
}

function canReachLast(
  boosts: readonly number[],
  strictGoalComparison: boolean,
): boolean {
  let farthest = 0
  const last = boosts.length - 1
  for (let index = 0; index < boosts.length; index += 1) {
    if (index > farthest) return false
    farthest = Math.max(farthest, index + boosts[index])
    if (
      strictGoalComparison
        ? farthest > last
        : farthest >= last
    ) {
      return true
    }
  }
  return strictGoalComparison ? farthest > last : farthest >= last
}

function minimumJumps(
  boosts: readonly number[],
  includeGoalIndex: boolean,
): number {
  let jumps = 0
  let layerEnd = 0
  let farthest = 0
  const endExclusive = includeGoalIndex
    ? boosts.length
    : boosts.length - 1
  for (let index = 0; index < endExclusive; index += 1) {
    farthest = Math.max(farthest, index + boosts[index])
    if (index === layerEnd) {
      jumps += 1
      layerEnd = farthest
    }
  }
  return jumps
}

function gasStationStart(
  fuel: readonly number[],
  cost: readonly number[],
  resetAtZero: boolean,
): number {
  let start = 0
  let tank = 0
  let total = 0
  for (let index = 0; index < fuel.length; index += 1) {
    const gain = fuel[index] - cost[index]
    tank += gain
    total += gain
    if (resetAtZero ? tank <= 0 : tank < 0) {
      start = index + 1
      tank = 0
    }
  }
  return total >= 0 ? start : -1
}

function canGroupStraights(
  cards: readonly number[],
  groupSize: number,
): boolean {
  if (cards.length % groupSize !== 0) return false
  const counts = new Map<number, number>()
  for (const card of cards) {
    counts.set(card, (counts.get(card) ?? 0) + 1)
  }
  const starts = [...counts.keys()].sort((left, right) =>
    left === right ? 0 : left < right ? -1 : 1,
  )
  for (const start of starts) {
    const copies = counts.get(start) ?? 0
    if (copies === 0) continue
    for (let offset = 0; offset < groupSize; offset += 1) {
      const value = start + offset
      const available = counts.get(value) ?? 0
      if (available < copies) return false
      counts.set(value, available - copies)
    }
  }
  return true
}

function canMergeTriplets(
  pieces: readonly (readonly number[])[],
  target: readonly number[],
  rejectOvershoot: boolean,
): boolean {
  const covered = [false, false, false]
  for (const piece of pieces) {
    if (
      rejectOvershoot &&
      piece.some((value, index) => value > target[index])
    ) {
      continue
    }
    for (let index = 0; index < 3; index += 1) {
      if (piece[index] === target[index]) covered[index] = true
    }
  }
  return covered.every(Boolean)
}

function partitionLengths(text: string, useRunningEnd: boolean): number[] {
  const last = new Map<string, number>()
  for (let index = 0; index < text.length; index += 1) {
    last.set(text[index], index)
  }
  const lengths: number[] = []
  let start = 0
  let end = 0
  for (let index = 0; index < text.length; index += 1) {
    if (useRunningEnd) {
      end = Math.max(end, last.get(text[index]) ?? index)
    } else {
      end = last.get(text[index]) ?? index
    }
    if (index === end) {
      lengths.push(end - start + 1)
      start = index + 1
    }
  }
  return lengths
}

function validFlexibleParentheses(
  symbols: string,
  forceWildcardClosed: boolean,
): boolean {
  if (forceWildcardClosed) {
    let balance = 0
    for (const symbol of symbols) {
      balance += symbol === '(' ? 1 : -1
      if (balance < 0) return false
    }
    return balance === 0
  }

  let low = 0
  let high = 0
  for (const symbol of symbols) {
    if (symbol === '(') {
      low += 1
      high += 1
    } else if (symbol === ')') {
      low -= 1
      high -= 1
    } else {
      low -= 1
      high += 1
    }
    if (high < 0) return false
    low = Math.max(low, 0)
  }
  return low === 0
}

function longestPalindromeWithInclusiveStop(signal: string): string {
  let bestStart = 0
  let bestLength = 0
  for (let center = 0; center < signal.length; center += 1) {
    const centers = [
      [center, center],
      [center, center + 1],
    ] as const
    for (const [initialLeft, initialRight] of centers) {
      let left = initialLeft
      let right = initialRight
      while (
        left >= 0 &&
        right < signal.length &&
        signal[left] === signal[right]
      ) {
        left -= 1
        right += 1
      }
      const length = right - left
      if (length > bestLength) {
        bestStart = left + 1
        bestLength = length
      }
    }
  }
  return signal.slice(bestStart, bestStart + bestLength)
}

function countMaximalPalindromeCenters(signal: string): number {
  let count = 0
  for (let center = 0; center < signal.length; center += 1) {
    const centers = [
      [center, center],
      [center, center + 1],
    ] as const
    for (const [initialLeft, initialRight] of centers) {
      let left = initialLeft
      let right = initialRight
      let foundPalindrome = false
      while (
        left >= 0 &&
        right < signal.length &&
        signal[left] === signal[right]
      ) {
        foundPalindrome = true
        left -= 1
        right += 1
      }
      if (foundPalindrome) count += 1
    }
  }
  return count
}

function canSegmentWithoutTokenReuse(
  message: string,
  tokens: readonly string[],
): boolean {
  const used = Array<boolean>(tokens.length).fill(false)

  function search(start: number): boolean {
    if (start === message.length) return true
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      if (
        used[tokenIndex] ||
        !message.startsWith(tokens[tokenIndex], start)
      ) {
        continue
      }
      used[tokenIndex] = true
      if (search(start + tokens[tokenIndex].length)) return true
      used[tokenIndex] = false
    }
    return false
  }

  return search(0)
}

function increasingPathRightAndDownOnly(
  heights: readonly (readonly number[])[],
): number {
  const rows = heights.length
  const columns = heights[0].length
  const memo = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  )

  function trail(row: number, column: number): number {
    if (memo[row][column] !== 0) return memo[row][column]
    let best = 1
    for (const [rowDelta, columnDelta] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const nextRow = row + rowDelta
      const nextColumn = column + columnDelta
      if (
        nextRow < rows &&
        nextColumn < columns &&
        heights[nextRow][nextColumn] > heights[row][column]
      ) {
        best = Math.max(best, 1 + trail(nextRow, nextColumn))
      }
    }
    memo[row][column] = best
    return best
  }

  let answer = 1
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      answer = Math.max(answer, trail(row, column))
    }
  }
  return answer
}

function editDistanceUsingMaximum(draft: string, goal: string): number {
  const dp = Array.from({ length: draft.length + 1 }, () =>
    Array<number>(goal.length + 1).fill(0),
  )
  for (let index = 0; index <= draft.length; index += 1) {
    dp[index][0] = index
  }
  for (let index = 0; index <= goal.length; index += 1) {
    dp[0][index] = index
  }
  for (let draftLength = 1; draftLength <= draft.length; draftLength += 1) {
    for (let goalLength = 1; goalLength <= goal.length; goalLength += 1) {
      if (draft[draftLength - 1] === goal[goalLength - 1]) {
        dp[draftLength][goalLength] =
          dp[draftLength - 1][goalLength - 1]
      } else {
        dp[draftLength][goalLength] =
          1 +
          Math.max(
            dp[draftLength - 1][goalLength],
            dp[draftLength][goalLength - 1],
            dp[draftLength - 1][goalLength - 1],
          )
      }
    }
  }
  return dp[draft.length][goal.length]
}

function widestIntervalFirstBurstScore(orbs: readonly number[]): number {
  const values = [1, ...orbs, 1]
  const dp = Array.from({ length: values.length }, () =>
    Array<number>(values.length).fill(0),
  )
  for (let width = values.length - 1; width >= 2; width -= 1) {
    for (let left = 0; left + width < values.length; left += 1) {
      const right = left + width
      for (let last = left + 1; last < right; last += 1) {
        dp[left][right] = Math.max(
          dp[left][right],
          dp[left][last] +
            values[left] * values[last] * values[right] +
            dp[last][right],
        )
      }
    }
  }
  return dp[0][values.length - 1]
}

function interleavingWithNextMergedIndex(
  laneA: string,
  laneB: string,
  merged: string,
): boolean {
  if (merged.length !== laneA.length + laneB.length) return false
  const dp = Array.from({ length: laneA.length + 1 }, () =>
    Array<boolean>(laneB.length + 1).fill(false),
  )
  dp[0][0] = true
  for (let firstLength = 0; firstLength <= laneA.length; firstLength += 1) {
    for (
      let secondLength = 0;
      secondLength <= laneB.length;
      secondLength += 1
    ) {
      if (firstLength === 0 && secondLength === 0) continue
      const mergedIndex = firstLength + secondLength
      const fromA =
        firstLength > 0 &&
        dp[firstLength - 1][secondLength] &&
        laneA[firstLength - 1] === merged[mergedIndex]
      const fromB =
        secondLength > 0 &&
        dp[firstLength][secondLength - 1] &&
        laneB[secondLength - 1] === merged[mergedIndex]
      dp[firstLength][secondLength] = fromA || fromB
    }
  }
  return dp[laneA.length][laneB.length]
}

function validFlexibleWithoutLowClamp(symbols: string): boolean {
  let low = 0
  let high = 0
  for (const symbol of symbols) {
    if (symbol === '(') {
      low += 1
      high += 1
    } else if (symbol === ')') {
      low -= 1
      high -= 1
    } else {
      low -= 1
      high += 1
    }
    if (high < 0) return false
  }
  return low === 0
}

const climbingStairsOracle = defineProblemMissionOracle({
  problemId: 'problem:climbing-stairs',
  solve(input: JsonValue): JsonValue {
    const levels = readSingleInteger(
      input,
      'Climbing Stairs',
      'levels',
      { min: 0 },
    )
    return climbingWays(levels)
  },
  mutants: [
    {
      id: 'zero-empty-ladder-base',
      description:
        'Seeds ways(0) as zero, corrupting every recurrence derived from the empty route.',
      solve(input: JsonValue): JsonValue {
        const levels = readSingleInteger(
          input,
          'Climbing Stairs',
          'levels',
          { min: 0 },
        )
        if (levels <= 1) return levels
        let twoBack = 0
        let oneBack = 1
        for (let level = 2; level <= levels; level += 1) {
          const current = oneBack + twoBack
          twoBack = oneBack
          oneBack = current
        }
        return oneBack
      },
    },
    {
      id: 'stops-before-platform',
      description:
        'Stops the recurrence one level early and returns the route count for the step below the platform.',
      solve(input: JsonValue): JsonValue {
        const levels = readSingleInteger(
          input,
          'Climbing Stairs',
          'levels',
          { min: 0 },
        )
        if (levels <= 1) return 1
        let twoBack = 1
        let oneBack = 1
        for (let level = 2; level < levels; level += 1) {
          const current = oneBack + twoBack
          twoBack = oneBack
          oneBack = current
        }
        return oneBack
      },
    },
  ],
})

const minCostClimbingStairsOracle = defineProblemMissionOracle({
  problemId: 'problem:min-cost-climbing-stairs',
  solve(input: JsonValue): JsonValue {
    const fees = readSingleIntegerArray(
      input,
      'Min Cost Climbing Stairs',
      'fees',
      { min: 0, minLength: 2 },
    )
    return minimumStairCost(fees)
  },
  mutants: [
    {
      id: 'one-step-only',
      description:
        'Forces one-step movement after choosing a starting step, missing cheaper two-step routes.',
      solve(input: JsonValue): JsonValue {
        const fees = readSingleIntegerArray(
          input,
          'Min Cost Climbing Stairs',
          'fees',
          { min: 0, minLength: 2 },
        )
        return (
          Math.min(fees[0], fees[1]) +
          fees.slice(2).reduce((sum, fee) => sum + fee, 0)
        )
      },
    },
    {
      id: 'forces-step-zero-start',
      description:
        'Requires paying step zero before reaching step one, ignoring that either first step may be the free starting position.',
      solve(input: JsonValue): JsonValue {
        const fees = readSingleIntegerArray(
          input,
          'Min Cost Climbing Stairs',
          'fees',
          { min: 0, minLength: 2 },
        )
        let twoBack = fees[0]
        let oneBack = fees[0] + fees[1]
        for (let index = 2; index < fees.length; index += 1) {
          const landing = fees[index] + Math.min(twoBack, oneBack)
          twoBack = oneBack
          oneBack = landing
        }
        return Math.min(twoBack, oneBack)
      },
    },
  ],
})

const houseRobberOracle = defineProblemMissionOracle({
  problemId: 'problem:house-robber',
  solve(input: JsonValue): JsonValue {
    const credits = readSingleIntegerArray(
      input,
      'House Robber',
      'credits',
      { min: 0 },
    )
    return robLine(credits)
  },
  mutants: [
    {
      id: 'never-skip-current',
      description:
        'Always takes the current locker with the state two positions back instead of comparing the skip state.',
      solve(input: JsonValue): JsonValue {
        const credits = readSingleIntegerArray(
          input,
          'House Robber',
          'credits',
          { min: 0 },
        )
        let twoBack = 0
        let oneBack = 0
        for (const value of credits) {
          const current = twoBack + value
          twoBack = oneBack
          oneBack = current
        }
        return oneBack
      },
    },
    {
      id: 'take-from-adjacent-prefix',
      description:
        'Builds the take candidate from the immediately previous optimum, allowing adjacent lockers to be collected together.',
      solve(input: JsonValue): JsonValue {
        const credits = readSingleIntegerArray(
          input,
          'House Robber',
          'credits',
          { min: 0 },
        )
        let best = 0
        for (const value of credits) {
          best = Math.max(best, best + value)
        }
        return best
      },
    },
  ],
})

const houseRobberIiOracle = defineProblemMissionOracle({
  problemId: 'problem:house-robber-ii',
  solve(input: JsonValue): JsonValue {
    const credits = readSingleIntegerArray(
      input,
      'House Robber II',
      'credits',
      { min: 0 },
    )
    if (credits.length === 0) return 0
    if (credits.length === 1) return credits[0]
    return Math.max(
      robLine(credits.slice(0, -1)),
      robLine(credits.slice(1)),
    )
  },
  mutants: [
    {
      id: 'linear-ring',
      description:
        'Runs the linear recurrence across the whole ring and can select both conflicting endpoints.',
      solve(input: JsonValue): JsonValue {
        const credits = readSingleIntegerArray(
          input,
          'House Robber II',
          'credits',
          { min: 0 },
        )
        return robLine(credits)
      },
    },
    {
      id: 'only-excludes-first-locker',
      description:
        'Evaluates only the range without the first locker and misses solutions that require keeping the first endpoint.',
      solve(input: JsonValue): JsonValue {
        const credits = readSingleIntegerArray(
          input,
          'House Robber II',
          'credits',
          { min: 0 },
        )
        if (credits.length === 0) return 0
        if (credits.length === 1) return credits[0]
        return robLine(credits.slice(1))
      },
    },
  ],
})

const longestPalindromicSubstringOracle = defineProblemMissionOracle({
  problemId: 'problem:longest-palindromic-substring',
  solve(input: JsonValue): JsonValue {
    const signal = readSingleString(
      input,
      'Longest Palindromic Substring',
      'signal',
    )
    return longestPalindrome(signal, true)
  },
  mutants: [
    {
      id: 'odd-centers-only',
      description:
        'Expands only around characters and misses even-length palindromes centered on gaps.',
      solve(input: JsonValue): JsonValue {
        const signal = readSingleString(
          input,
          'Longest Palindromic Substring',
          'signal',
        )
        return longestPalindrome(signal, false)
      },
    },
    {
      id: 'inclusive-expansion-stop',
      description:
        'Uses the first mismatching boundary as part of the palindrome length, producing an off-by-one slice.',
      solve(input: JsonValue): JsonValue {
        const signal = readSingleString(
          input,
          'Longest Palindromic Substring',
          'signal',
        )
        return longestPalindromeWithInclusiveStop(signal)
      },
    },
  ],
})

const palindromicSubstringsOracle = defineProblemMissionOracle({
  problemId: 'problem:palindromic-substrings',
  solve(input: JsonValue): JsonValue {
    const signal = readSingleString(
      input,
      'Palindromic Substrings',
      'signal',
    )
    return countPalindromes(signal, true)
  },
  mutants: [
    {
      id: 'omit-even-centers',
      description:
        'Counts only odd-centered spans and omits every even-length palindrome.',
      solve(input: JsonValue): JsonValue {
        const signal = readSingleString(
          input,
          'Palindromic Substrings',
          'signal',
        )
        return countPalindromes(signal, false)
      },
    },
    {
      id: 'one-count-per-center',
      description:
        'Counts only one maximal palindrome per center instead of every successful expansion layer.',
      solve(input: JsonValue): JsonValue {
        const signal = readSingleString(
          input,
          'Palindromic Substrings',
          'signal',
        )
        return countMaximalPalindromeCenters(signal)
      },
    },
  ],
})

const decodeWaysOracle = defineProblemMissionOracle({
  problemId: 'problem:decode-ways',
  solve(input: JsonValue): JsonValue {
    const code = readSingleString(input, 'Decode Ways', 'code', {
      minLength: 1,
      pattern: /^[0-9]+$/,
      description: 'digits only',
    })
    return decodeCount(code, false)
  },
  mutants: [
    {
      id: 'zero-stands-alone',
      description:
        'Treats zero as a valid one-digit letter instead of allowing it only in 10 or 20.',
      solve(input: JsonValue): JsonValue {
        const code = readSingleString(input, 'Decode Ways', 'code', {
          minLength: 1,
          pattern: /^[0-9]+$/,
          description: 'digits only',
        })
        return decodeCount(code, true)
      },
    },
    {
      id: 'single-or-pair-exclusive',
      description:
        'Treats valid one-digit and two-digit endings as mutually exclusive instead of adding both predecessor counts.',
      solve(input: JsonValue): JsonValue {
        const code = readSingleString(input, 'Decode Ways', 'code', {
          minLength: 1,
          pattern: /^[0-9]+$/,
          description: 'digits only',
        })
        const ways = Array<number>(code.length + 1).fill(0)
        ways[0] = 1
        ways[1] = code[0] === '0' ? 0 : 1
        for (let index = 2; index <= code.length; index += 1) {
          const pair = Number(code.slice(index - 2, index))
          if (code[index - 1] !== '0') {
            ways[index] += ways[index - 1]
          } else if (pair >= 10 && pair <= 26) {
            ways[index] += ways[index - 2]
          }
        }
        return ways[code.length]
      },
    },
  ],
})

const coinChangeOracle = defineProblemMissionOracle({
  problemId: 'problem:coin-change',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Coin Change', ['coins', 'amount'])
    const coins = readIntegerArrayField(data, 'coins', { min: 1 })
    const amount = readIntegerField(data, 'amount', { min: 0 })
    return minimumCoinCount(coins, amount)
  },
  mutants: [
    {
      id: 'largest-token-first',
      description:
        'Greedily takes as many large tokens as possible, which is not optimal for arbitrary denominations.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Coin Change', ['coins', 'amount'])
        const coins = readIntegerArrayField(data, 'coins', { min: 1 })
        let remaining = readIntegerField(data, 'amount', { min: 0 })
        let count = 0
        const descending = [...coins].sort((left, right) =>
          left === right ? 0 : left > right ? -1 : 1,
        )
        for (const coin of descending) {
          count += Math.floor(remaining / coin)
          remaining %= coin
        }
        return remaining === 0 ? count : -1
      },
    },
    {
      id: 'amount-zero-costs-one-token',
      description:
        'Seeds amount zero with one token instead of zero, shifting every reachable minimum count upward.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Coin Change', ['coins', 'amount'])
        const coins = readIntegerArrayField(data, 'coins', { min: 1 })
        const amount = readIntegerField(data, 'amount', { min: 0 })
        const best = Array<number>(amount + 1).fill(
          Number.POSITIVE_INFINITY,
        )
        best[0] = 1
        for (let total = 1; total <= amount; total += 1) {
          for (const coin of coins) {
            if (coin <= total) {
              best[total] = Math.min(
                best[total],
                best[total - coin] + 1,
              )
            }
          }
        }
        return Number.isFinite(best[amount]) ? best[amount] : -1
      },
    },
  ],
})

const maximumProductSubarrayOracle = defineProblemMissionOracle({
  problemId: 'problem:maximum-product-subarray',
  solve(input: JsonValue): JsonValue {
    const factors = readSingleIntegerArray(
      input,
      'Maximum Product Subarray',
      'factors',
      { minLength: 1 },
    )
    return maximumProduct(factors)
  },
  mutants: [
    {
      id: 'maximum-ending-only',
      description:
        'Drops the minimum ending product, so a later negative factor cannot flip it into the optimum.',
      solve(input: JsonValue): JsonValue {
        const factors = readSingleIntegerArray(
          input,
          'Maximum Product Subarray',
          'factors',
          { minLength: 1 },
        )
        let ending = factors[0]
        let answer = factors[0]
        for (let index = 1; index < factors.length; index += 1) {
          ending = Math.max(factors[index], ending * factors[index])
          answer = Math.max(answer, ending)
        }
        return answer
      },
    },
    {
      id: 'minimum-reads-new-maximum',
      description:
        'Updates the ending maximum in place before computing the minimum, so the two states no longer share the same prior values.',
      solve(input: JsonValue): JsonValue {
        const factors = readSingleIntegerArray(
          input,
          'Maximum Product Subarray',
          'factors',
          { minLength: 1 },
        )
        let endingMaximum = factors[0]
        let endingMinimum = factors[0]
        let answer = factors[0]
        for (let index = 1; index < factors.length; index += 1) {
          const value = factors[index]
          endingMaximum = Math.max(
            value,
            value * endingMaximum,
            value * endingMinimum,
          )
          endingMinimum = Math.min(
            value,
            value * endingMaximum,
            value * endingMinimum,
          )
          answer = Math.max(answer, endingMaximum)
        }
        return answer
      },
    },
  ],
})

const wordBreakOracle = defineProblemMissionOracle({
  problemId: 'problem:word-break',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Word Break', ['message', 'tokens'])
    const message = readStringField(data, 'message')
    const tokens = readStringArrayField(data, 'tokens', {
      itemMinLength: 1,
    })
    return canSegment(message, tokens)
  },
  mutants: [
    {
      id: 'empty-prefix-unreachable',
      description:
        'Seeds the empty prefix as unreachable, breaking the base state from which every segmentation starts.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Word Break', ['message', 'tokens'])
        const message = readStringField(data, 'message')
        const tokens = readStringArrayField(data, 'tokens', {
          itemMinLength: 1,
        })
        return message.length > 0 && canSegment(message, tokens)
      },
    },
    {
      id: 'tokens-usable-once',
      description:
        'Treats glossary entries as consumable resources even though each token may be reused in multiple segments.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Word Break', ['message', 'tokens'])
        const message = readStringField(data, 'message')
        const tokens = readStringArrayField(data, 'tokens', {
          itemMinLength: 1,
        })
        return canSegmentWithoutTokenReuse(message, tokens)
      },
    },
  ],
})

const longestIncreasingSubsequenceOracle = defineProblemMissionOracle({
  problemId: 'problem:longest-increasing-subsequence',
  solve(input: JsonValue): JsonValue {
    const ratings = readSingleIntegerArray(
      input,
      'Longest Increasing Subsequence',
      'ratings',
    )
    return increasingSubsequenceLength(ratings, false)
  },
  mutants: [
    {
      id: 'nondecreasing-comparison',
      description:
        'Uses less-than-or-equal and incorrectly extends a strictly increasing sequence with equal values.',
      solve(input: JsonValue): JsonValue {
        const ratings = readSingleIntegerArray(
          input,
          'Longest Increasing Subsequence',
          'ratings',
        )
        return increasingSubsequenceLength(ratings, true)
      },
    },
    {
      id: 'counts-contiguous-rises',
      description:
        'Extends only from the immediately previous rating, confusing an increasing subsequence with a contiguous run.',
      solve(input: JsonValue): JsonValue {
        const ratings = readSingleIntegerArray(
          input,
          'Longest Increasing Subsequence',
          'ratings',
        )
        if (ratings.length === 0) return 0
        let current = 1
        let best = 1
        for (let index = 1; index < ratings.length; index += 1) {
          current =
            ratings[index - 1] < ratings[index] ? current + 1 : 1
          best = Math.max(best, current)
        }
        return best
      },
    },
  ],
})

const partitionEqualSubsetSumOracle = defineProblemMissionOracle({
  problemId: 'problem:partition-equal-subset-sum',
  solve(input: JsonValue): JsonValue {
    const weights = readSingleIntegerArray(
      input,
      'Partition Equal Subset Sum',
      'weights',
      { min: 0 },
    )
    return canPartition(weights, false)
  },
  mutants: [
    {
      id: 'ascending-one-use-update',
      description:
        'Updates sums upward, allowing the current crate to be reused multiple times in the same iteration.',
      solve(input: JsonValue): JsonValue {
        const weights = readSingleIntegerArray(
          input,
          'Partition Equal Subset Sum',
          'weights',
          { min: 0 },
        )
        return canPartition(weights, true)
      },
    },
    {
      id: 'half-target-plus-one',
      description:
        'Searches one unit above half the total, an off-by-one reduction that no longer represents equal partitioning.',
      solve(input: JsonValue): JsonValue {
        const weights = readSingleIntegerArray(
          input,
          'Partition Equal Subset Sum',
          'weights',
          { min: 0 },
        )
        const total = weights.reduce((sum, weight) => sum + weight, 0)
        if (total % 2 !== 0) return false
        const target = total / 2 + 1
        const reachable = Array<boolean>(target + 1).fill(false)
        reachable[0] = true
        for (const weight of weights) {
          for (let sum = target; sum >= weight; sum -= 1) {
            reachable[sum] ||= reachable[sum - weight]
          }
        }
        return reachable[target]
      },
    },
  ],
})

const uniquePathsOracle = defineProblemMissionOracle({
  problemId: 'problem:unique-paths',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Unique Paths', ['rows', 'columns'])
    const rows = readIntegerField(data, 'rows', { min: 1 })
    const columns = readIntegerField(data, 'columns', { min: 1 })
    return uniquePathCount(rows, columns, false)
  },
  mutants: [
    {
      id: 'processes-extra-row',
      description:
        'Runs the rolling transition for one extra row, counting routes in a grid taller than requested.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Unique Paths', ['rows', 'columns'])
        const rows = readIntegerField(data, 'rows', { min: 1 })
        const columns = readIntegerField(data, 'columns', { min: 1 })
        return uniquePathCount(rows, columns, true)
      },
    },
    {
      id: 'origin-only-border-seed',
      description:
        'Seeds only the origin but starts below the top row, leaving the first-row route states uninitialized.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Unique Paths', ['rows', 'columns'])
        const rows = readIntegerField(data, 'rows', { min: 1 })
        const columns = readIntegerField(data, 'columns', { min: 1 })
        const ways = Array<number>(columns).fill(0)
        ways[0] = 1
        for (let row = 1; row < rows; row += 1) {
          for (let column = 1; column < columns; column += 1) {
            ways[column] += ways[column - 1]
          }
        }
        return ways[columns - 1]
      },
    },
  ],
})

const longestCommonSubsequenceOracle = defineProblemMissionOracle({
  problemId: 'problem:longest-common-subsequence',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Longest Common Subsequence', [
      'first',
      'second',
    ])
    const first = readStringField(data, 'first')
    const second = readStringField(data, 'second')
    return commonSubsequenceLength(first, second, true)
  },
  mutants: [
    {
      id: 'match-without-increment',
      description:
        'Copies the diagonal state on equal symbols but forgets to count the newly matched symbol.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Longest Common Subsequence', [
          'first',
          'second',
        ])
        const first = readStringField(data, 'first')
        const second = readStringField(data, 'second')
        return commonSubsequenceLength(first, second, false)
      },
    },
    {
      id: 'returns-penultimate-column',
      description:
        'Returns the state before the second string’s final symbol instead of the completed prefix pair.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Longest Common Subsequence', [
          'first',
          'second',
        ])
        const first = readStringField(data, 'first')
        const second = readStringField(data, 'second')
        return commonSubsequenceLength(first, second.slice(0, -1), true)
      },
    },
  ],
})

const stockCooldownOracle = defineProblemMissionOracle({
  problemId: 'problem:best-time-to-buy-and-sell-stock-with-cooldown',
  solve(input: JsonValue): JsonValue {
    const prices = readSingleIntegerArray(
      input,
      'Best Time to Buy and Sell Stock with Cooldown',
      'prices',
      { min: 0 },
    )
    return cooldownProfit(prices)
  },
  mutants: [
    {
      id: 'buy-immediately-after-sale',
      description:
        'Uses a single cash state and permits buying on the day immediately after a sale.',
      solve(input: JsonValue): JsonValue {
        const prices = readSingleIntegerArray(
          input,
          'Best Time to Buy and Sell Stock with Cooldown',
          'prices',
          { min: 0 },
        )
        if (prices.length === 0) return 0
        let hold = -prices[0]
        let cash = 0
        for (let index = 1; index < prices.length; index += 1) {
          const nextHold = Math.max(hold, cash - prices[index])
          const nextCash = Math.max(cash, hold + prices[index])
          hold = nextHold
          cash = nextCash
        }
        return cash
      },
    },
    {
      id: 'free-initial-holding',
      description:
        'Initializes the holding state at zero, granting the first stock without paying its purchase price.',
      solve(input: JsonValue): JsonValue {
        const prices = readSingleIntegerArray(
          input,
          'Best Time to Buy and Sell Stock with Cooldown',
          'prices',
          { min: 0 },
        )
        if (prices.length === 0) return 0
        let hold = 0
        let sold = Number.NEGATIVE_INFINITY
        let rest = 0
        for (let index = 1; index < prices.length; index += 1) {
          const nextHold = Math.max(hold, rest - prices[index])
          const nextSold = hold + prices[index]
          const nextRest = Math.max(rest, sold)
          hold = nextHold
          sold = nextSold
          rest = nextRest
        }
        return Math.max(sold, rest)
      },
    },
  ],
})

const coinChangeIiOracle = defineProblemMissionOracle({
  problemId: 'problem:coin-change-ii',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Coin Change II', ['coins', 'amount'])
    const coins = readIntegerArrayField(data, 'coins', {
      min: 1,
      distinct: true,
    })
    const amount = readIntegerField(data, 'amount', { min: 0 })
    return coinCombinationCount(coins, amount, true)
  },
  mutants: [
    {
      id: 'amount-before-coin-loop',
      description:
        'Loops over amounts first and counts different token orders as distinct combinations.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Coin Change II', ['coins', 'amount'])
        const coins = readIntegerArrayField(data, 'coins', {
          min: 1,
          distinct: true,
        })
        const amount = readIntegerField(data, 'amount', { min: 0 })
        return coinCombinationCount(coins, amount, false)
      },
    },
    {
      id: 'descending-unlimited-update',
      description:
        'Scans amounts downward, turning reusable coin types into one-use choices.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Coin Change II', ['coins', 'amount'])
        const coins = readIntegerArrayField(data, 'coins', {
          min: 1,
          distinct: true,
        })
        const amount = readIntegerField(data, 'amount', { min: 0 })
        const ways = Array<number>(amount + 1).fill(0)
        ways[0] = 1
        for (const coin of coins) {
          for (let total = amount; total >= coin; total -= 1) {
            ways[total] += ways[total - coin]
          }
        }
        return ways[amount]
      },
    },
  ],
})

const targetSumOracle = defineProblemMissionOracle({
  problemId: 'problem:target-sum',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Target Sum', ['values', 'target'])
    const values = readIntegerArrayField(data, 'values', { min: 0 })
    const target = readIntegerField(data, 'target')
    return targetAssignmentCount(values, target)
  },
  mutants: [
    {
      id: 'deduplicate-equal-positions',
      description:
        'Collapses equal values before counting, losing independent sign choices for duplicate and zero positions.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Target Sum', ['values', 'target'])
        const values = readIntegerArrayField(data, 'values', { min: 0 })
        const target = readIntegerField(data, 'target')
        return targetAssignmentCount([...new Set(values)], target)
      },
    },
    {
      id: 'ascending-sign-subset-update',
      description:
        'Updates subset sums upward, allowing one input position to be assigned to the plus side repeatedly.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Target Sum', ['values', 'target'])
        const values = readIntegerArrayField(data, 'values', { min: 0 })
        const target = readIntegerField(data, 'target')
        const total = values.reduce((sum, value) => sum + value, 0)
        if (
          Math.abs(target) > total ||
          (total + target) % 2 !== 0
        ) {
          return 0
        }
        const goal = (total + target) / 2
        const ways = Array<number>(goal + 1).fill(0)
        ways[0] = 1
        for (const value of values) {
          for (let subtotal = value; subtotal <= goal; subtotal += 1) {
            ways[subtotal] += ways[subtotal - value]
          }
        }
        return ways[goal]
      },
    },
  ],
})

const interleavingStringOracle = defineProblemMissionOracle({
  problemId: 'problem:interleaving-string',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Interleaving String', [
      'laneA',
      'laneB',
      'merged',
    ])
    const laneA = readStringField(data, 'laneA')
    const laneB = readStringField(data, 'laneB')
    const merged = readStringField(data, 'merged')
    return isInterleaving(laneA, laneB, merged, true)
  },
  mutants: [
    {
      id: 'lane-a-predecessor-only',
      description:
        'Builds states only from lane A and ignores valid transitions that consume the next lane B symbol.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Interleaving String', [
          'laneA',
          'laneB',
          'merged',
        ])
        const laneA = readStringField(data, 'laneA')
        const laneB = readStringField(data, 'laneB')
        const merged = readStringField(data, 'merged')
        return isInterleaving(laneA, laneB, merged, false)
      },
    },
    {
      id: 'reads-next-merged-symbol',
      description:
        'Uses i + j instead of i + j - 1, comparing each transition with the following merged symbol.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Interleaving String', [
          'laneA',
          'laneB',
          'merged',
        ])
        const laneA = readStringField(data, 'laneA')
        const laneB = readStringField(data, 'laneB')
        const merged = readStringField(data, 'merged')
        return interleavingWithNextMergedIndex(laneA, laneB, merged)
      },
    },
  ],
})

const longestIncreasingPathOracle = defineProblemMissionOracle({
  problemId: 'problem:longest-increasing-path-in-a-matrix',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Longest Increasing Path in a Matrix', [
      'heights',
    ])
    const heights = readIntegerMatrixField(data, 'heights')
    return increasingMatrixPathLength(heights, false)
  },
  mutants: [
    {
      id: 'equal-height-transition',
      description:
        'Allows equal-height neighbors to extend a path under a deterministic tie order, violating strict increase.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(
          input,
          'Longest Increasing Path in a Matrix',
          ['heights'],
        )
        const heights = readIntegerMatrixField(data, 'heights')
        return increasingMatrixPathLength(heights, true)
      },
    },
    {
      id: 'right-and-down-neighbors-only',
      description:
        'Searches only right and down neighbors, omitting valid uphill extensions to the left and above.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(
          input,
          'Longest Increasing Path in a Matrix',
          ['heights'],
        )
        const heights = readIntegerMatrixField(data, 'heights')
        return increasingPathRightAndDownOnly(heights)
      },
    },
  ],
})

const distinctSubsequencesOracle = defineProblemMissionOracle({
  problemId: 'problem:distinct-subsequences',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Distinct Subsequences', [
      'source',
      'target',
    ])
    const source = readStringField(data, 'source')
    const target = readStringField(data, 'target')
    return distinctSubsequenceCount(source, target, false)
  },
  mutants: [
    {
      id: 'forward-target-update',
      description:
        'Updates target prefixes left-to-right, allowing one source position to fill several target positions.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Distinct Subsequences', [
          'source',
          'target',
        ])
        const source = readStringField(data, 'source')
        const target = readStringField(data, 'target')
        return distinctSubsequenceCount(source, target, true)
      },
    },
    {
      id: 'skips-first-source-position',
      description:
        'Starts the source scan at index one, losing every subsequence that depends on the first source position.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Distinct Subsequences', [
          'source',
          'target',
        ])
        const source = readStringField(data, 'source')
        const target = readStringField(data, 'target')
        return distinctSubsequenceCount(source.slice(1), target, false)
      },
    },
  ],
})

const editDistanceOracle = defineProblemMissionOracle({
  problemId: 'problem:edit-distance',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Edit Distance', ['draft', 'goal'])
    const draft = readStringField(data, 'draft')
    const goal = readStringField(data, 'goal')
    return editDistance(draft, goal, false)
  },
  mutants: [
    {
      id: 'transposition-costs-one',
      description:
        'Adds an unsupported one-step adjacent transposition transition to the edit recurrence.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Edit Distance', ['draft', 'goal'])
        const draft = readStringField(data, 'draft')
        const goal = readStringField(data, 'goal')
        return editDistance(draft, goal, true)
      },
    },
    {
      id: 'maximizes-edit-predecessor',
      description:
        'Chooses the most expensive insertion, deletion, or replacement predecessor instead of the least expensive one.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Edit Distance', ['draft', 'goal'])
        const draft = readStringField(data, 'draft')
        const goal = readStringField(data, 'goal')
        return editDistanceUsingMaximum(draft, goal)
      },
    },
  ],
})

const burstBalloonsOracle = defineProblemMissionOracle({
  problemId: 'problem:burst-balloons',
  solve(input: JsonValue): JsonValue {
    const orbs = readSingleIntegerArray(
      input,
      'Burst Balloons',
      'orbs',
      { min: 1 },
    )
    return maximumBurstScore(orbs)
  },
  mutants: [
    {
      id: 'largest-immediate-burst',
      description:
        'Greedily bursts the orb with the largest current local product instead of optimizing interval order.',
      solve(input: JsonValue): JsonValue {
        const orbs = readSingleIntegerArray(
          input,
          'Burst Balloons',
          'orbs',
          { min: 1 },
        )
        return greedyBurstScore(orbs)
      },
    },
    {
      id: 'widest-interval-first',
      description:
        'Fills wide intervals before their smaller dependencies, so candidate scores read unfinished subproblems.',
      solve(input: JsonValue): JsonValue {
        const orbs = readSingleIntegerArray(
          input,
          'Burst Balloons',
          'orbs',
          { min: 1 },
        )
        return widestIntervalFirstBurstScore(orbs)
      },
    },
  ],
})

const regularExpressionMatchingOracle = defineProblemMissionOracle({
  problemId: 'problem:regular-expression-matching',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Regular Expression Matching', [
      'text',
      'pattern',
    ])
    const text = readStringField(data, 'text', {
      pattern: /^[a-z]*$/,
      description: 'lowercase letters only',
    })
    const pattern = readStringField(data, 'pattern', {
      pattern: /^(?:[a-z.]\*?)*$/,
      description: 'valid lowercase, dot, and star tokens',
    })
    return regexMatch(text, pattern, true)
  },
  mutants: [
    {
      id: 'star-requires-one-copy',
      description:
        'Models star as one-or-more copies and omits the zero-copy transition that skips the starred pair.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Regular Expression Matching', [
          'text',
          'pattern',
        ])
        const text = readStringField(data, 'text', {
          pattern: /^[a-z]*$/,
          description: 'lowercase letters only',
        })
        const pattern = readStringField(data, 'pattern', {
          pattern: /^(?:[a-z.]\*?)*$/,
          description: 'valid lowercase, dot, and star tokens',
        })
        return regexMatch(text, pattern, false)
      },
    },
    {
      id: 'dot-is-literal',
      description:
        'Compares dot as an ordinary character instead of allowing it to consume any single text character.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Regular Expression Matching', [
          'text',
          'pattern',
        ])
        const text = readStringField(data, 'text', {
          pattern: /^[a-z]*$/,
          description: 'lowercase letters only',
        })
        const pattern = readStringField(data, 'pattern', {
          pattern: /^(?:[a-z.]\*?)*$/,
          description: 'valid lowercase, dot, and star tokens',
        })
        return regexMatch(text, pattern, true, false)
      },
    },
  ],
})

const maximumSubarrayOracle = defineProblemMissionOracle({
  problemId: 'problem:maximum-subarray',
  solve(input: JsonValue): JsonValue {
    const signals = readSingleIntegerArray(
      input,
      'Maximum Subarray',
      'signals',
      { minLength: 1 },
    )
    return maximumSubarray(signals, false)
  },
  mutants: [
    {
      id: 'allows-empty-window',
      description:
        'Seeds the best sum at zero, returning an invalid empty window for all-negative input.',
      solve(input: JsonValue): JsonValue {
        const signals = readSingleIntegerArray(
          input,
          'Maximum Subarray',
          'signals',
          { minLength: 1 },
        )
        return maximumSubarray(signals, true)
      },
    },
    {
      id: 'returns-final-ending-sum',
      description:
        'Returns only the best window ending at the final position and discards the global maximum seen earlier.',
      solve(input: JsonValue): JsonValue {
        const signals = readSingleIntegerArray(
          input,
          'Maximum Subarray',
          'signals',
          { minLength: 1 },
        )
        let ending = signals[0]
        for (let index = 1; index < signals.length; index += 1) {
          ending = Math.max(signals[index], ending + signals[index])
        }
        return ending
      },
    },
  ],
})

const jumpGameOracle = defineProblemMissionOracle({
  problemId: 'problem:jump-game',
  solve(input: JsonValue): JsonValue {
    const boosts = readSingleIntegerArray(
      input,
      'Jump Game',
      'boosts',
      { min: 0, minLength: 1 },
    )
    return canReachLast(boosts, false)
  },
  mutants: [
    {
      id: 'must-overshoot-goal',
      description:
        'Uses a strict frontier comparison, so landing exactly on the final index is not accepted.',
      solve(input: JsonValue): JsonValue {
        const boosts = readSingleIntegerArray(
          input,
          'Jump Game',
          'boosts',
          { min: 0, minLength: 1 },
        )
        return canReachLast(boosts, true)
      },
    },
    {
      id: 'extends-before-gap-check',
      description:
        'Lets an unreachable pad extend the frontier before verifying that the rover can land on it.',
      solve(input: JsonValue): JsonValue {
        const boosts = readSingleIntegerArray(
          input,
          'Jump Game',
          'boosts',
          { min: 0, minLength: 1 },
        )
        let farthest = 0
        const last = boosts.length - 1
        for (let index = 0; index < boosts.length; index += 1) {
          farthest = Math.max(farthest, index + boosts[index])
          if (index > farthest) return false
          if (farthest >= last) return true
        }
        return farthest >= last
      },
    },
  ],
})

const jumpGameIiOracle = defineProblemMissionOracle({
  problemId: 'problem:jump-game-ii',
  solve(input: JsonValue): JsonValue {
    const boosts = readSingleIntegerArray(
      input,
      'Jump Game II',
      'boosts',
      { min: 0, minLength: 1 },
    )
    return minimumJumps(boosts, false)
  },
  mutants: [
    {
      id: 'scans-goal-index',
      description:
        'Includes the destination in the layer scan and commits an extra jump after arrival.',
      solve(input: JsonValue): JsonValue {
        const boosts = readSingleIntegerArray(
          input,
          'Jump Game II',
          'boosts',
          { min: 0, minLength: 1 },
        )
        return minimumJumps(boosts, true)
      },
    },
    {
      id: 'layer-end-uses-boost',
      description:
        'Stores the current pad’s raw jump limit as the next layer boundary instead of the farthest absolute index.',
      solve(input: JsonValue): JsonValue {
        const boosts = readSingleIntegerArray(
          input,
          'Jump Game II',
          'boosts',
          { min: 0, minLength: 1 },
        )
        let jumps = 0
        let layerEnd = 0
        let farthest = 0
        for (let index = 0; index < boosts.length - 1; index += 1) {
          farthest = Math.max(farthest, index + boosts[index])
          if (index === layerEnd) {
            jumps += 1
            layerEnd = boosts[index]
          }
        }
        return jumps
      },
    },
  ],
})

const gasStationOracle = defineProblemMissionOracle({
  problemId: 'problem:gas-station',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Gas Station', ['fuel', 'cost'])
    const fuel = readIntegerArrayField(data, 'fuel', {
      min: 0,
      minLength: 1,
    })
    const cost = readIntegerArrayField(data, 'cost', {
      min: 0,
      minLength: 1,
    })
    if (fuel.length !== cost.length) {
      throw new TypeError('fuel and cost must have equal lengths')
    }
    return gasStationStart(fuel, cost, false)
  },
  mutants: [
    {
      id: 'reset-on-zero-tank',
      description:
        'Resets a viable candidate when its tank is exactly zero instead of only after a negative balance.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Gas Station', ['fuel', 'cost'])
        const fuel = readIntegerArrayField(data, 'fuel', {
          min: 0,
          minLength: 1,
        })
        const cost = readIntegerArrayField(data, 'cost', {
          min: 0,
          minLength: 1,
        })
        if (fuel.length !== cost.length) {
          throw new TypeError('fuel and cost must have equal lengths')
        }
        return gasStationStart(fuel, cost, true)
      },
    },
    {
      id: 'checks-final-segment-only',
      description:
        'Uses only the post-reset segment tank for final feasibility and forgets the total balance around the ring.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Gas Station', ['fuel', 'cost'])
        const fuel = readIntegerArrayField(data, 'fuel', {
          min: 0,
          minLength: 1,
        })
        const cost = readIntegerArrayField(data, 'cost', {
          min: 0,
          minLength: 1,
        })
        if (fuel.length !== cost.length) {
          throw new TypeError('fuel and cost must have equal lengths')
        }
        let start = 0
        let tank = 0
        for (let index = 0; index < fuel.length; index += 1) {
          tank += fuel[index] - cost[index]
          if (tank < 0) {
            start = index + 1
            tank = 0
          }
        }
        return tank >= 0 ? start : -1
      },
    },
  ],
})

const handOfStraightsOracle = defineProblemMissionOracle({
  problemId: 'problem:hand-of-straights',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Hand of Straights', [
      'cards',
      'groupSize',
    ])
    const cards = readIntegerArrayField(data, 'cards')
    const groupSize = readIntegerField(data, 'groupSize', { min: 1 })
    return canGroupStraights(cards, groupSize)
  },
  mutants: [
    {
      id: 'empty-hand-is-invalid',
      description:
        'Rejects the empty hand instead of recognizing its valid partition into zero groups.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Hand of Straights', [
          'cards',
          'groupSize',
        ])
        const cards = readIntegerArrayField(data, 'cards')
        const groupSize = readIntegerField(data, 'groupSize', { min: 1 })
        return cards.length > 0 && canGroupStraights(cards, groupSize)
      },
    },
    {
      id: 'distinct-count-divisibility',
      description:
        'Checks group divisibility using distinct card values instead of the number of physical cards.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Hand of Straights', [
          'cards',
          'groupSize',
        ])
        const cards = readIntegerArrayField(data, 'cards')
        const groupSize = readIntegerField(data, 'groupSize', { min: 1 })
        if (new Set(cards).size % groupSize !== 0) return false
        return canGroupStraights(cards, groupSize)
      },
    },
  ],
})

const mergeTripletsOracle = defineProblemMissionOracle({
  problemId: 'problem:merge-triplets-to-form-target-triplet',
  solve(input: JsonValue): JsonValue {
    const data = readObject(input, 'Merge Triplets', ['pieces', 'target'])
    const pieces = readTripletArrayField(data, 'pieces')
    const target = readTripletField(data, 'target')
    return canMergeTriplets(pieces, target, true)
  },
  mutants: [
    {
      id: 'cover-with-overshooting-piece',
      description:
        'Credits target-coordinate matches from pieces that irreversibly overshoot another coordinate.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Merge Triplets', [
          'pieces',
          'target',
        ])
        const pieces = readTripletArrayField(data, 'pieces')
        const target = readTripletField(data, 'target')
        return canMergeTriplets(pieces, target, false)
      },
    },
    {
      id: 'requires-single-target-piece',
      description:
        'Requires one piece to equal the whole target and never combines target coordinates supplied by different safe pieces.',
      solve(input: JsonValue): JsonValue {
        const data = readObject(input, 'Merge Triplets', [
          'pieces',
          'target',
        ])
        const pieces = readTripletArrayField(data, 'pieces')
        const target = readTripletField(data, 'target')
        return pieces.some((piece) =>
          piece.every((value, index) => value === target[index]),
        )
      },
    },
  ],
})

const partitionLabelsOracle = defineProblemMissionOracle({
  problemId: 'problem:partition-labels',
  solve(input: JsonValue): JsonValue {
    const text = readSingleString(input, 'Partition Labels', 'text', {
      pattern: /^[a-z]*$/,
      description: 'lowercase letters only',
    })
    return partitionLengths(text, true)
  },
  mutants: [
    {
      id: 'current-symbol-boundary',
      description:
        'Cuts at the current symbol’s last occurrence without preserving the farthest requirement of earlier symbols.',
      solve(input: JsonValue): JsonValue {
        const text = readSingleString(input, 'Partition Labels', 'text', {
          pattern: /^[a-z]*$/,
          description: 'lowercase letters only',
        })
        return partitionLengths(text, false)
      },
    },
    {
      id: 'omits-inclusive-end',
      description:
        'Computes each closed segment as end minus start, omitting the inclusive boundary character.',
      solve(input: JsonValue): JsonValue {
        const text = readSingleString(input, 'Partition Labels', 'text', {
          pattern: /^[a-z]*$/,
          description: 'lowercase letters only',
        })
        const last = new Map<string, number>()
        for (let index = 0; index < text.length; index += 1) {
          last.set(text[index], index)
        }
        const lengths: number[] = []
        let start = 0
        let end = 0
        for (let index = 0; index < text.length; index += 1) {
          end = Math.max(end, last.get(text[index]) ?? index)
          if (index === end) {
            lengths.push(end - start)
            start = index + 1
          }
        }
        return lengths
      },
    },
  ],
})

const validParenthesisStringOracle = defineProblemMissionOracle({
  problemId: 'problem:valid-parenthesis-string',
  solve(input: JsonValue): JsonValue {
    const symbols = readSingleString(
      input,
      'Valid Parenthesis String',
      'symbols',
      {
        pattern: /^[()?]*$/,
        description: 'only (, ), and ?',
      },
    )
    return validFlexibleParentheses(symbols, false)
  },
  mutants: [
    {
      id: 'wildcard-always-closes',
      description:
        'Greedily fixes every wildcard as a closing bracket instead of preserving the interval of possible balances.',
      solve(input: JsonValue): JsonValue {
        const symbols = readSingleString(
          input,
          'Valid Parenthesis String',
          'symbols',
          {
            pattern: /^[()?]*$/,
            description: 'only (, ), and ?',
          },
        )
        return validFlexibleParentheses(symbols, true)
      },
    },
    {
      id: 'does-not-clamp-low-bound',
      description:
        'Lets the minimum possible open count remain negative, losing wildcard assignments that choose empty instead.',
      solve(input: JsonValue): JsonValue {
        const symbols = readSingleString(
          input,
          'Valid Parenthesis String',
          'symbols',
          {
            pattern: /^[()?]*$/,
            description: 'only (, ), and ?',
          },
        )
        return validFlexibleWithoutLowClamp(symbols)
      },
    },
  ],
})

export const REALM_5_PROBLEM_MISSION_ORACLES =
  defineProblemMissionOracleRegistry({
    'problem:climbing-stairs': climbingStairsOracle,
    'problem:min-cost-climbing-stairs': minCostClimbingStairsOracle,
    'problem:house-robber': houseRobberOracle,
    'problem:house-robber-ii': houseRobberIiOracle,
    'problem:longest-palindromic-substring':
      longestPalindromicSubstringOracle,
    'problem:palindromic-substrings': palindromicSubstringsOracle,
    'problem:decode-ways': decodeWaysOracle,
    'problem:coin-change': coinChangeOracle,
    'problem:maximum-product-subarray': maximumProductSubarrayOracle,
    'problem:word-break': wordBreakOracle,
    'problem:longest-increasing-subsequence':
      longestIncreasingSubsequenceOracle,
    'problem:partition-equal-subset-sum':
      partitionEqualSubsetSumOracle,
    'problem:unique-paths': uniquePathsOracle,
    'problem:longest-common-subsequence': longestCommonSubsequenceOracle,
    'problem:best-time-to-buy-and-sell-stock-with-cooldown':
      stockCooldownOracle,
    'problem:coin-change-ii': coinChangeIiOracle,
    'problem:target-sum': targetSumOracle,
    'problem:interleaving-string': interleavingStringOracle,
    'problem:longest-increasing-path-in-a-matrix':
      longestIncreasingPathOracle,
    'problem:distinct-subsequences': distinctSubsequencesOracle,
    'problem:edit-distance': editDistanceOracle,
    'problem:burst-balloons': burstBalloonsOracle,
    'problem:regular-expression-matching':
      regularExpressionMatchingOracle,
    'problem:maximum-subarray': maximumSubarrayOracle,
    'problem:jump-game': jumpGameOracle,
    'problem:jump-game-ii': jumpGameIiOracle,
    'problem:gas-station': gasStationOracle,
    'problem:hand-of-straights': handOfStraightsOracle,
    'problem:merge-triplets-to-form-target-triplet':
      mergeTripletsOracle,
    'problem:partition-labels': partitionLabelsOracle,
    'problem:valid-parenthesis-string': validParenthesisStringOracle,
  })
