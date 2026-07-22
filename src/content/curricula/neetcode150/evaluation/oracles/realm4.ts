import type { ProblemId } from '../../../../../types/curriculum'
import type { JsonValue } from '../../../../../types/learning'
import {
  defineProblemMissionOracle,
  defineProblemMissionOracleRegistry,
  type ProblemMissionMutant,
  type PureJsonProblemSolver,
} from '../oracleContract'

type JsonObject = { readonly [key: string]: JsonValue }
type NumberPair = readonly [number, number]
type StringPair = readonly [string, string]
type WeightedStringEdge = readonly [string, string, number]

const ORTHOGONAL_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

function readObject(value: JsonValue, path: string): JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new TypeError(`${path} must be a JSON object`)
  }
  return value as JsonObject
}

function readField(object: JsonObject, key: string, path: string): JsonValue {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    throw new TypeError(`${path}.${key} is required`)
  }
  return object[key]
}

function readArray(value: JsonValue, path: string): readonly JsonValue[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`)
  }
  return value
}

function readString(value: JsonValue, path: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be a string`)
  }
  return value
}

function readFiniteNumber(value: JsonValue, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number`)
  }
  return value
}

function readInteger(
  value: JsonValue,
  path: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number {
  const number = readFiniteNumber(value, path)
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new TypeError(
      `${path} must be a safe integer no smaller than ${minimum}`,
    )
  }
  return number
}

function readStringArray(value: JsonValue, path: string): string[] {
  return readArray(value, path).map((item, index) =>
    readString(item, `${path}[${index}]`),
  )
}

function readIntegerArray(
  value: JsonValue,
  path: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number[] {
  return readArray(value, path).map((item, index) =>
    readInteger(item, `${path}[${index}]`, minimum),
  )
}

function assertDistinct(
  values: readonly (number | string)[],
  path: string,
): void {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${path} must contain distinct values`)
  }
}

function readMatrix<T>(
  value: JsonValue,
  path: string,
  readCell: (cell: JsonValue, cellPath: string) => T,
): T[][] {
  const rawRows = readArray(value, path)
  let width: number | undefined
  return rawRows.map((rawRow, rowIndex) => {
    const rowPath = `${path}[${rowIndex}]`
    const rawCells = readArray(rawRow, rowPath)
    if (width === undefined) {
      width = rawCells.length
    } else if (rawCells.length !== width) {
      throw new TypeError(`${path} must be rectangular`)
    }
    return rawCells.map((cell, columnIndex) =>
      readCell(cell, `${rowPath}[${columnIndex}]`),
    )
  })
}

function readIntegerMatrix(
  value: JsonValue,
  path: string,
  allowed?: ReadonlySet<number>,
): number[][] {
  return readMatrix(value, path, (cell, cellPath) => {
    const number = readInteger(cell, cellPath)
    if (allowed && !allowed.has(number)) {
      throw new TypeError(`${cellPath} contains an unsupported cell value`)
    }
    return number
  })
}

function readIntegerPairs(value: JsonValue, path: string): NumberPair[] {
  return readArray(value, path).map((item, index) => {
    const pairPath = `${path}[${index}]`
    const pair = readArray(item, pairPath)
    if (pair.length !== 2) {
      throw new TypeError(`${pairPath} must contain exactly two integers`)
    }
    return [
      readInteger(pair[0], `${pairPath}[0]`),
      readInteger(pair[1], `${pairPath}[1]`),
    ]
  })
}

function readBoundedIndexPairs(
  value: JsonValue,
  path: string,
  count: number,
): NumberPair[] {
  const pairs = readIntegerPairs(value, path)
  for (const [first, second] of pairs) {
    if (first < 0 || first >= count || second < 0 || second >= count) {
      throw new TypeError(`${path} contains an index outside 0..${count - 1}`)
    }
  }
  return pairs
}

function readStringPairs(value: JsonValue, path: string): StringPair[] {
  return readArray(value, path).map((item, index) => {
    const pairPath = `${path}[${index}]`
    const pair = readArray(item, pairPath)
    if (pair.length !== 2) {
      throw new TypeError(`${pairPath} must contain exactly two strings`)
    }
    return [
      readString(pair[0], `${pairPath}[0]`),
      readString(pair[1], `${pairPath}[1]`),
    ]
  })
}

function readWeightedStringEdges(
  value: JsonValue,
  path: string,
): WeightedStringEdge[] {
  return readArray(value, path).map((item, index) => {
    const edgePath = `${path}[${index}]`
    const edge = readArray(item, edgePath)
    if (edge.length !== 3) {
      throw new TypeError(`${edgePath} must contain two labels and one weight`)
    }
    const weight = readFiniteNumber(edge[2], `${edgePath}[2]`)
    if (weight < 0) {
      throw new TypeError(`${edgePath}[2] must be nonnegative`)
    }
    return [
      readString(edge[0], `${edgePath}[0]`),
      readString(edge[1], `${edgePath}[1]`),
      weight,
    ]
  })
}

function validateKnownEndpoints(
  edges: readonly WeightedStringEdge[],
  labels: ReadonlySet<string>,
  path: string,
): void {
  for (const [origin, destination] of edges) {
    if (!labels.has(origin) || !labels.has(destination)) {
      throw new TypeError(`${path} contains an unknown endpoint`)
    }
  }
}

function makeJsonObject(): Record<string, JsonValue> {
  return Object.create(null) as Record<string, JsonValue>
}

function readDistinctIntegerField(
  input: JsonValue,
  mission: string,
  key: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number[] {
  const object = readObject(input, mission)
  const values = readIntegerArray(readField(object, key, mission), `${mission}.${key}`, minimum)
  assertDistinct(values, `${mission}.${key}`)
  return values
}

function enumerateSubsets(values: readonly number[], skipDuplicates: boolean): number[][] {
  const results: number[][] = []
  const path: number[] = []

  function visit(start: number): void {
    results.push([...path])
    for (let index = start; index < values.length; index += 1) {
      if (
        skipDuplicates &&
        index > start &&
        values[index] === values[index - 1]
      ) {
        continue
      }
      path.push(values[index])
      visit(index + 1)
      path.pop()
    }
  }

  visit(0)
  return results
}

function solveSubsets(input: JsonValue): JsonValue {
  return enumerateSubsets(
    readDistinctIntegerField(input, 'Subsets input', 'artifacts'),
    false,
  )
}

type CombinationSumInput = {
  readonly values: readonly number[]
  readonly target: number
}

function readCombinationSumInput(
  input: JsonValue,
  mission: string,
  valuesKey: string,
  distinct: boolean,
): CombinationSumInput {
  const object = readObject(input, mission)
  const values = readIntegerArray(
    readField(object, valuesKey, mission),
    `${mission}.${valuesKey}`,
    1,
  )
  if (distinct) assertDistinct(values, `${mission}.${valuesKey}`)
  const target = readInteger(
    readField(object, 'target', mission),
    `${mission}.target`,
    0,
  )
  return { values: [...values].sort((left, right) => left - right), target }
}

function reusableCombinationSums(
  values: readonly number[],
  target: number,
  allowReuse: boolean,
): number[][] {
  const results: number[][] = []
  const path: number[] = []

  function search(start: number, remaining: number): void {
    if (remaining === 0) {
      results.push([...path])
      return
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index]
      if (value > remaining) break
      path.push(value)
      search(allowReuse ? index : index + 1, remaining - value)
      path.pop()
    }
  }

  search(0, target)
  return results
}

function solveCombinationSum(input: JsonValue): JsonValue {
  const { values, target } = readCombinationSumInput(
    input,
    'Combination Sum input',
    'crystals',
    true,
  )
  return reusableCombinationSums(values, target, true)
}

function enumeratePermutations(
  values: readonly number[],
  reverseChoices: boolean,
): number[][] {
  const results: number[][] = []
  const path: number[] = []
  const used = Array.from({ length: values.length }, () => false)
  const indices = Array.from({ length: values.length }, (_, index) => index)
  if (reverseChoices) indices.reverse()

  function arrange(): void {
    if (path.length === values.length) {
      results.push([...path])
      return
    }
    for (const index of indices) {
      if (used[index]) continue
      used[index] = true
      path.push(values[index])
      arrange()
      path.pop()
      used[index] = false
    }
  }

  arrange()
  return results
}

function solvePermutations(input: JsonValue): JsonValue {
  return enumeratePermutations(
    readDistinctIntegerField(input, 'Permutations input', 'droneTags'),
    false,
  )
}

function readSubsetsIiValues(input: JsonValue): number[] {
  const object = readObject(input, 'Subsets II input')
  return readIntegerArray(
    readField(object, 'stickers', 'Subsets II input'),
    'Subsets II input.stickers',
  ).sort((left, right) => left - right)
}

function solveSubsetsIi(input: JsonValue): JsonValue {
  return enumerateSubsets(readSubsetsIiValues(input), true)
}

function oneUseCombinationSums(
  values: readonly number[],
  target: number,
  skipDuplicates: boolean,
  allowReuse: boolean,
): number[][] {
  const results: number[][] = []
  const path: number[] = []

  function search(start: number, remaining: number): void {
    if (remaining === 0) {
      results.push([...path])
      return
    }
    for (let index = start; index < values.length; index += 1) {
      if (
        skipDuplicates &&
        index > start &&
        values[index] === values[index - 1]
      ) {
        continue
      }
      const value = values[index]
      if (value > remaining) break
      path.push(value)
      search(allowReuse ? index : index + 1, remaining - value)
      path.pop()
    }
  }

  search(0, target)
  return results
}

function solveCombinationSumIi(input: JsonValue): JsonValue {
  const { values, target } = readCombinationSumInput(
    input,
    'Combination Sum II input',
    'crateValues',
    false,
  )
  return oneUseCombinationSums(values, target, true, false)
}

type WordSearchInput = {
  readonly field: readonly (readonly string[])[]
  readonly trail: string
}

function readWordSearchInput(input: JsonValue): WordSearchInput {
  const mission = 'Word Search input'
  const object = readObject(input, mission)
  const field = readMatrix(
    readField(object, 'field', mission),
    `${mission}.field`,
    (cell, path) => {
      const character = readString(cell, path)
      if (character.length !== 1) {
        throw new TypeError(`${path} must be one character`)
      }
      return character
    },
  )
  const trail = readString(readField(object, 'trail', mission), `${mission}.trail`)
  return { field, trail }
}

function wordExists({ field, trail }: WordSearchInput): boolean {
  if (trail.length === 0) return true
  if (field.length === 0 || field[0].length === 0) return false
  const rows = field.length
  const columns = field[0].length
  const used = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => false),
  )

  function search(row: number, column: number, index: number): boolean {
    if (
      row < 0 ||
      row >= rows ||
      column < 0 ||
      column >= columns ||
      used[row][column] ||
      field[row][column] !== trail[index]
    ) {
      return false
    }
    if (index === trail.length - 1) return true

    used[row][column] = true
    for (const [rowChange, columnChange] of ORTHOGONAL_DIRECTIONS) {
      if (search(row + rowChange, column + columnChange, index + 1)) {
        used[row][column] = false
        return true
      }
    }
    used[row][column] = false
    return false
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (search(row, column, 0)) return true
    }
  }
  return false
}

function solveWordSearch(input: JsonValue): JsonValue {
  return wordExists(readWordSearchInput(input))
}

function readRibbon(input: JsonValue): string {
  const mission = 'Palindrome Partitioning input'
  const object = readObject(input, mission)
  return readString(readField(object, 'ribbon', mission), `${mission}.ribbon`)
}

function palindromePartitions(text: string): string[][] {
  const results: string[][] = []
  const path: string[] = []

  function isPalindrome(left: number, right: number): boolean {
    while (left < right) {
      if (text[left] !== text[right]) return false
      left += 1
      right -= 1
    }
    return true
  }

  function cut(start: number): void {
    if (start === text.length) {
      results.push([...path])
      return
    }
    for (let end = start; end < text.length; end += 1) {
      if (!isPalindrome(start, end)) continue
      path.push(text.slice(start, end + 1))
      cut(end + 1)
      path.pop()
    }
  }

  cut(0)
  return results
}

function solvePalindromePartitioning(input: JsonValue): JsonValue {
  return palindromePartitions(readRibbon(input))
}

const KEYPAD: Readonly<Record<string, string>> = {
  '2': 'abc',
  '3': 'def',
  '4': 'ghi',
  '5': 'jkl',
  '6': 'mno',
  '7': 'pqrs',
  '8': 'tuv',
  '9': 'wxyz',
}

function readPhoneSignal(input: JsonValue): string {
  const mission = 'Phone Letter Combinations input'
  const object = readObject(input, mission)
  const signal = readString(
    readField(object, 'signal', mission),
    `${mission}.signal`,
  )
  if (!/^[2-9]*$/.test(signal)) {
    throw new TypeError(`${mission}.signal may contain only digits 2 through 9`)
  }
  return signal
}

function phoneCombinations(signal: string, reverseLetters: boolean): string[] {
  if (signal.length === 0) return []
  const results: string[] = []
  const path: string[] = []

  function decode(index: number): void {
    if (index === signal.length) {
      results.push(path.join(''))
      return
    }
    const letters = KEYPAD[signal[index]]
    const choices = reverseLetters ? [...letters].reverse() : [...letters]
    for (const letter of choices) {
      path.push(letter)
      decode(index + 1)
      path.pop()
    }
  }

  decode(0)
  return results
}

function solvePhoneCombinations(input: JsonValue): JsonValue {
  return phoneCombinations(readPhoneSignal(input), false)
}

function readNQueensSize(input: JsonValue): number {
  const mission = 'N-Queens input'
  const object = readObject(input, mission)
  return readInteger(readField(object, 'size', mission), `${mission}.size`, 1)
}

function nQueensLayouts(
  size: number,
  ignoreAscendingDiagonal: boolean,
  ignoreDescendingDiagonal = false,
): string[][] {
  const board = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => '.'),
  )
  const columns = new Set<number>()
  const descending = new Set<number>()
  const ascending = new Set<number>()
  const layouts: string[][] = []

  function place(row: number): void {
    if (row === size) {
      layouts.push(board.map((cells) => cells.join('')))
      return
    }
    for (let column = 0; column < size; column += 1) {
      const descendingKey = row - column
      const ascendingKey = row + column
      if (
        columns.has(column) ||
        (!ignoreDescendingDiagonal && descending.has(descendingKey)) ||
        (!ignoreAscendingDiagonal && ascending.has(ascendingKey))
      ) {
        continue
      }
      columns.add(column)
      descending.add(descendingKey)
      ascending.add(ascendingKey)
      board[row][column] = 'Q'
      place(row + 1)
      board[row][column] = '.'
      columns.delete(column)
      descending.delete(descendingKey)
      ascending.delete(ascendingKey)
    }
  }

  place(0)
  return layouts
}

function solveNQueens(input: JsonValue): JsonValue {
  return nQueensLayouts(readNQueensSize(input), false)
}

function readGridField(
  input: JsonValue,
  mission: string,
  key: string,
  allowed?: ReadonlySet<number>,
): number[][] {
  const object = readObject(input, mission)
  return readIntegerMatrix(
    readField(object, key, mission),
    `${mission}.${key}`,
    allowed,
  )
}

function measureLand(
  grid: readonly (readonly number[])[],
  connectDiagonally: boolean,
): { readonly count: number; readonly maximumArea: number } {
  if (grid.length === 0 || grid[0].length === 0) {
    return { count: 0, maximumArea: 0 }
  }
  const rows = grid.length
  const columns = grid[0].length
  const visited = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => false),
  )
  const directions: readonly NumberPair[] = connectDiagonally
    ? [
        ...ORTHOGONAL_DIRECTIONS,
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ]
    : ORTHOGONAL_DIRECTIONS
  let count = 0
  let maximumArea = 0

  for (let startRow = 0; startRow < rows; startRow += 1) {
    for (let startColumn = 0; startColumn < columns; startColumn += 1) {
      if (grid[startRow][startColumn] !== 1 || visited[startRow][startColumn]) {
        continue
      }
      count += 1
      let area = 0
      const stack: NumberPair[] = [[startRow, startColumn]]
      visited[startRow][startColumn] = true
      while (stack.length > 0) {
        const [row, column] = stack.pop()!
        area += 1
        for (const [rowChange, columnChange] of directions) {
          const nextRow = row + rowChange
          const nextColumn = column + columnChange
          if (
            nextRow >= 0 &&
            nextRow < rows &&
            nextColumn >= 0 &&
            nextColumn < columns &&
            grid[nextRow][nextColumn] === 1 &&
            !visited[nextRow][nextColumn]
          ) {
            visited[nextRow][nextColumn] = true
            stack.push([nextRow, nextColumn])
          }
        }
      }
      maximumArea = Math.max(maximumArea, area)
    }
  }
  return { count, maximumArea }
}

function solveNumberOfIslands(input: JsonValue): JsonValue {
  const grid = readGridField(
    input,
    'Number of Islands input',
    'roofMap',
    new Set([0, 1]),
  )
  return measureLand(grid, false).count
}

function solveMaxAreaOfIsland(input: JsonValue): JsonValue {
  const grid = readGridField(
    input,
    'Max Area of Island input',
    'panelMap',
    new Set([0, 1]),
  )
  return measureLand(grid, false).maximumArea
}

type CloneGraphInput = {
  readonly start: string | null
  readonly adjacency: ReadonlyMap<string, readonly string[]>
}

function readCloneGraphInput(input: JsonValue): CloneGraphInput {
  const mission = 'Clone Graph input'
  const object = readObject(input, mission)
  const rawStart = readField(object, 'start', mission)
  const start =
    rawStart === null ? null : readString(rawStart, `${mission}.start`)
  const rawAdjacency = readObject(
    readField(object, 'adjacency', mission),
    `${mission}.adjacency`,
  )
  const adjacency = new Map<string, readonly string[]>()
  for (const station of Object.keys(rawAdjacency)) {
    adjacency.set(
      station,
      readStringArray(
        rawAdjacency[station],
        `${mission}.adjacency.${JSON.stringify(station)}`,
      ),
    )
  }
  for (const neighbors of adjacency.values()) {
    for (const neighbor of neighbors) {
      if (!adjacency.has(neighbor)) {
        throw new TypeError(`${mission}.adjacency references an unknown station`)
      }
    }
  }
  if (start !== null && !adjacency.has(start)) {
    throw new TypeError(`${mission}.start must name an adjacency key`)
  }
  return { start, adjacency }
}

function cloneAdjacency(
  { start, adjacency }: CloneGraphInput,
  includeUnreachable: boolean,
): JsonValue {
  const copied = makeJsonObject()
  if (start === null) return copied
  const stations: string[] = includeUnreachable
    ? [...adjacency.keys()]
    : [start]
  const visited = new Set<string>()

  while (stations.length > 0) {
    const station = stations.pop()!
    if (visited.has(station)) continue
    visited.add(station)
    const neighbors = adjacency.get(station)!
    copied[station] = [...neighbors]
    if (!includeUnreachable) {
      for (let index = neighbors.length - 1; index >= 0; index -= 1) {
        if (!visited.has(neighbors[index])) stations.push(neighbors[index])
      }
    }
  }
  return copied
}

function solveCloneGraph(input: JsonValue): JsonValue {
  return cloneAdjacency(readCloneGraphInput(input), false)
}

function wallsAndGatesDistances(
  grid: readonly (readonly number[])[],
  useEveryGate: boolean,
): number[][] {
  const result = grid.map((row) => [...row])
  if (result.length === 0 || result[0].length === 0) return result
  const rows = result.length
  const columns = result[0].length
  const queue: NumberPair[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (result[row][column] === 0) {
        queue.push([row, column])
        if (!useEveryGate) break
      }
    }
    if (!useEveryGate && queue.length > 0) break
  }

  for (let front = 0; front < queue.length; front += 1) {
    const [row, column] = queue[front]
    for (const [rowChange, columnChange] of ORTHOGONAL_DIRECTIONS) {
      const nextRow = row + rowChange
      const nextColumn = column + columnChange
      if (
        nextRow >= 0 &&
        nextRow < rows &&
        nextColumn >= 0 &&
        nextColumn < columns &&
        result[nextRow][nextColumn] === 999
      ) {
        result[nextRow][nextColumn] = result[row][column] + 1
        queue.push([nextRow, nextColumn])
      }
    }
  }
  return result
}

function readWallsAndGatesGrid(input: JsonValue): number[][] {
  return readGridField(
    input,
    'Walls and Gates input',
    'festivalMap',
    new Set([-1, 0, 999]),
  )
}

function solveWallsAndGates(input: JsonValue): JsonValue {
  return wallsAndGatesDistances(readWallsAndGatesGrid(input), true)
}

function rottingMinutes(
  grid: readonly (readonly number[])[],
  useEverySource = true,
): number {
  if (grid.length === 0 || grid[0].length === 0) return 0
  const bay = grid.map((row) => [...row])
  const rows = bay.length
  const columns = bay[0].length
  const queue: NumberPair[] = []
  let cool = 0

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (bay[row][column] === 1) cool += 1
      if (
        bay[row][column] === 2 &&
        (useEverySource || queue.length === 0)
      ) {
        queue.push([row, column])
      }
    }
  }

  let front = 0
  let minutes = 0
  while (front < queue.length && cool > 0) {
    const layerEnd = queue.length
    let heated = 0
    while (front < layerEnd) {
      const [row, column] = queue[front]
      front += 1
      for (const [rowChange, columnChange] of ORTHOGONAL_DIRECTIONS) {
        const nextRow = row + rowChange
        const nextColumn = column + columnChange
        if (
          nextRow >= 0 &&
          nextRow < rows &&
          nextColumn >= 0 &&
          nextColumn < columns &&
          bay[nextRow][nextColumn] === 1
        ) {
          bay[nextRow][nextColumn] = 2
          cool -= 1
          heated += 1
          queue.push([nextRow, nextColumn])
        }
      }
    }
    if (heated > 0) minutes += 1
  }
  return cool === 0 ? minutes : -1
}

function readRottingOrangesGrid(input: JsonValue): number[][] {
  return readGridField(
    input,
    'Rotting Oranges input',
    'batteryBay',
    new Set([0, 1, 2]),
  )
}

function solveRottingOranges(input: JsonValue): JsonValue {
  return rottingMinutes(readRottingOrangesGrid(input))
}

function pacificAtlanticCells(
  heights: readonly (readonly number[])[],
  requireStrictClimb: boolean,
  reverseInequality = false,
): number[][] {
  if (heights.length === 0 || heights[0].length === 0) return []
  const rows = heights.length
  const columns = heights[0].length

  function reverseFill(starts: readonly NumberPair[]): Set<number> {
    const reached = new Set<number>()
    const queue: NumberPair[] = []
    for (const [row, column] of starts) {
      const key = row * columns + column
      if (!reached.has(key)) {
        reached.add(key)
        queue.push([row, column])
      }
    }
    for (let front = 0; front < queue.length; front += 1) {
      const [row, column] = queue[front]
      for (const [rowChange, columnChange] of ORTHOGONAL_DIRECTIONS) {
        const nextRow = row + rowChange
        const nextColumn = column + columnChange
        if (
          nextRow < 0 ||
          nextRow >= rows ||
          nextColumn < 0 ||
          nextColumn >= columns
        ) {
          continue
        }
        const climbs = reverseInequality
          ? heights[nextRow][nextColumn] <= heights[row][column]
          : requireStrictClimb
            ? heights[nextRow][nextColumn] > heights[row][column]
            : heights[nextRow][nextColumn] >= heights[row][column]
        const key = nextRow * columns + nextColumn
        if (climbs && !reached.has(key)) {
          reached.add(key)
          queue.push([nextRow, nextColumn])
        }
      }
    }
    return reached
  }

  const northOrWest: NumberPair[] = []
  const southOrEast: NumberPair[] = []
  for (let column = 0; column < columns; column += 1) {
    northOrWest.push([0, column])
    southOrEast.push([rows - 1, column])
  }
  for (let row = 0; row < rows; row += 1) {
    northOrWest.push([row, 0])
    southOrEast.push([row, columns - 1])
  }
  const first = reverseFill(northOrWest)
  const second = reverseFill(southOrEast)
  const result: number[][] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const key = row * columns + column
      if (first.has(key) && second.has(key)) result.push([row, column])
    }
  }
  return result
}

function readHeights(input: JsonValue): number[][] {
  return readGridField(
    input,
    'Pacific Atlantic Water Flow input',
    'heights',
  )
}

function solvePacificAtlantic(input: JsonValue): JsonValue {
  return pacificAtlanticCells(readHeights(input), false)
}

function readSurroundedBoard(input: JsonValue): string[][] {
  const mission = 'Surrounded Regions input'
  const object = readObject(input, mission)
  return readMatrix(
    readField(object, 'blueprint', mission),
    `${mission}.blueprint`,
    (cell, path) => {
      const character = readString(cell, path)
      if (character !== 'X' && character !== 'O') {
        throw new TypeError(`${path} must be "X" or "O"`)
      }
      return character
    },
  )
}

function captureRegions(
  source: readonly (readonly string[])[],
  includeSideBoundaries: boolean,
  floodFromBoundaries = true,
): string[][] {
  const board = source.map((row) => [...row])
  if (board.length === 0 || board[0].length === 0) return board
  const rows = board.length
  const columns = board[0].length
  const safe = new Set<number>()
  const queue: NumberPair[] = []

  function mark(row: number, column: number): void {
    const key = row * columns + column
    if (board[row][column] === 'O' && !safe.has(key)) {
      safe.add(key)
      queue.push([row, column])
    }
  }

  for (let column = 0; column < columns; column += 1) {
    mark(0, column)
    mark(rows - 1, column)
  }
  if (includeSideBoundaries) {
    for (let row = 0; row < rows; row += 1) {
      mark(row, 0)
      mark(row, columns - 1)
    }
  }
  if (floodFromBoundaries) {
    for (let front = 0; front < queue.length; front += 1) {
      const [row, column] = queue[front]
      for (const [rowChange, columnChange] of ORTHOGONAL_DIRECTIONS) {
        const nextRow = row + rowChange
        const nextColumn = column + columnChange
        if (
          nextRow >= 0 &&
          nextRow < rows &&
          nextColumn >= 0 &&
          nextColumn < columns
        ) {
          mark(nextRow, nextColumn)
        }
      }
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (board[row][column] === 'O' && !safe.has(row * columns + column)) {
        board[row][column] = 'X'
      }
    }
  }
  return board
}

function solveSurroundedRegions(input: JsonValue): JsonValue {
  return captureRegions(readSurroundedBoard(input), true)
}

type CountedEdgesInput = {
  readonly count: number
  readonly edges: readonly NumberPair[]
}

function readCountedEdges(
  input: JsonValue,
  mission: string,
  countKey: string,
  edgesKey: string,
  minimumCount: number,
): CountedEdgesInput {
  const object = readObject(input, mission)
  const count = readInteger(
    readField(object, countKey, mission),
    `${mission}.${countKey}`,
    minimumCount,
  )
  const edges = readBoundedIndexPairs(
    readField(object, edgesKey, mission),
    `${mission}.${edgesKey}`,
    count,
  )
  return { count, edges }
}

function readCourseSchedule(input: JsonValue): CountedEdgesInput {
  return readCountedEdges(
    input,
    'Course Schedule input',
    'badgeCount',
    'requirements',
    0,
  )
}

function canFinishCourses(
  { count, edges }: CountedEdgesInput,
  ignoreActivePath: boolean,
): boolean {
  const graph = Array.from({ length: count }, () => [] as number[])
  for (const [badge, requiredBadge] of edges) {
    graph[requiredBadge].push(badge)
  }
  if (ignoreActivePath) {
    const visited = new Set<number>()
    function visit(badge: number): void {
      if (visited.has(badge)) return
      visited.add(badge)
      for (const next of graph[badge]) visit(next)
    }
    for (let badge = 0; badge < count; badge += 1) visit(badge)
    return true
  }

  const state = Array.from({ length: count }, () => 0)
  function safe(badge: number): boolean {
    if (state[badge] === 1) return false
    if (state[badge] === 2) return true
    state[badge] = 1
    for (const next of graph[badge]) {
      if (!safe(next)) return false
    }
    state[badge] = 2
    return true
  }
  for (let badge = 0; badge < count; badge += 1) {
    if (!safe(badge)) return false
  }
  return true
}

function solveCourseSchedule(input: JsonValue): JsonValue {
  return canFinishCourses(readCourseSchedule(input), false)
}

function readCourseScheduleIi(input: JsonValue): CountedEdgesInput {
  return readCountedEdges(
    input,
    'Course Schedule II input',
    'stationCount',
    'requirements',
    0,
  )
}

function topologicalStationOrder(
  { count, edges }: CountedEdgesInput,
  largestFirst: boolean,
): number[] {
  const graph = Array.from({ length: count }, () => [] as number[])
  const indegree = Array.from({ length: count }, () => 0)
  for (const [station, requiredStation] of edges) {
    graph[requiredStation].push(station)
    indegree[station] += 1
  }
  const available: number[] = []
  for (let station = 0; station < count; station += 1) {
    if (indegree[station] === 0) available.push(station)
  }
  const route: number[] = []
  while (available.length > 0) {
    available.sort((left, right) =>
      largestFirst ? left - right : right - left,
    )
    const station = available.pop()!
    route.push(station)
    for (const next of graph[station]) {
      indegree[next] -= 1
      if (indegree[next] === 0) available.push(next)
    }
  }
  return route.length === count ? route : []
}

function solveCourseScheduleIi(input: JsonValue): JsonValue {
  return topologicalStationOrder(readCourseScheduleIi(input), false)
}

class IndexDisjointSet {
  readonly parent: number[]
  readonly size: number[]

  constructor(count: number) {
    this.parent = Array.from({ length: count }, (_, index) => index)
    this.size = Array.from({ length: count }, () => 1)
  }

  find(node: number): number {
    let root = node
    while (this.parent[root] !== root) root = this.parent[root]
    while (this.parent[node] !== node) {
      const next = this.parent[node]
      this.parent[node] = root
      node = next
    }
    return root
  }

  union(first: number, second: number): boolean {
    let firstRoot = this.find(first)
    let secondRoot = this.find(second)
    if (firstRoot === secondRoot) return false
    if (this.size[firstRoot] < this.size[secondRoot]) {
      ;[firstRoot, secondRoot] = [secondRoot, firstRoot]
    }
    this.parent[secondRoot] = firstRoot
    this.size[firstRoot] += this.size[secondRoot]
    return true
  }
}

function readValidTree(input: JsonValue): CountedEdgesInput {
  return readCountedEdges(
    input,
    'Graph Valid Tree input',
    'platforms',
    'bridges',
    1,
  )
}

function isValidTree({ count, edges }: CountedEdgesInput): boolean {
  if (edges.length !== count - 1) return false
  const sets = new IndexDisjointSet(count)
  for (const [first, second] of edges) {
    if (!sets.union(first, second)) return false
  }
  return true
}

function solveValidTree(input: JsonValue): JsonValue {
  return isValidTree(readValidTree(input))
}

function readConnectedComponents(input: JsonValue): CountedEdgesInput {
  return readCountedEdges(
    input,
    'Connected Components input',
    'radios',
    'links',
    0,
  )
}

function connectedComponentCount({ count, edges }: CountedEdgesInput): number {
  const sets = new IndexDisjointSet(count)
  let components = count
  for (const [first, second] of edges) {
    if (sets.union(first, second)) components -= 1
  }
  return components
}

function solveConnectedComponents(input: JsonValue): JsonValue {
  return connectedComponentCount(readConnectedComponents(input))
}

function readSkywalks(input: JsonValue): NumberPair[] {
  const mission = 'Redundant Connection input'
  const object = readObject(input, mission)
  return readIntegerPairs(
    readField(object, 'skywalks', mission),
    `${mission}.skywalks`,
  )
}

function findRedundantConnection(
  edges: readonly NumberPair[],
  returnLast: boolean,
): number[] {
  const parent = new Map<number, number>()
  const size = new Map<number, number>()
  for (const [first, second] of edges) {
    if (!parent.has(first)) {
      parent.set(first, first)
      size.set(first, 1)
    }
    if (!parent.has(second)) {
      parent.set(second, second)
      size.set(second, 1)
    }
  }

  function find(node: number): number {
    let root = node
    while (parent.get(root)! !== root) root = parent.get(root)!
    while (parent.get(node)! !== node) {
      const next = parent.get(node)!
      parent.set(node, root)
      node = next
    }
    return root
  }

  let redundant: number[] = []
  for (const [first, second] of edges) {
    let firstRoot = find(first)
    let secondRoot = find(second)
    if (firstRoot === secondRoot) {
      redundant = [first, second]
      if (!returnLast) return redundant
      continue
    }
    if (size.get(firstRoot)! < size.get(secondRoot)!) {
      ;[firstRoot, secondRoot] = [secondRoot, firstRoot]
    }
    parent.set(secondRoot, firstRoot)
    size.set(firstRoot, size.get(firstRoot)! + size.get(secondRoot)!)
  }
  return redundant
}

function solveRedundantConnection(input: JsonValue): JsonValue {
  return findRedundantConnection(readSkywalks(input), false)
}

type WordLadderInput = {
  readonly start: string
  readonly goal: string
  readonly cards: readonly string[]
}

function readWordLadder(input: JsonValue): WordLadderInput {
  const mission = 'Word Ladder input'
  const object = readObject(input, mission)
  const start = readString(readField(object, 'start', mission), `${mission}.start`)
  const goal = readString(readField(object, 'goal', mission), `${mission}.goal`)
  const cards = readStringArray(
    readField(object, 'cards', mission),
    `${mission}.cards`,
  )
  if (start.length !== goal.length) {
    throw new TypeError(`${mission}.start and goal must have equal lengths`)
  }
  if (cards.some((card) => card.length !== start.length)) {
    throw new TypeError(`${mission}.cards must match the endpoint word length`)
  }
  assertDistinct(cards, `${mission}.cards`)
  return { start, goal, cards }
}

function differsByAtMost(
  first: string,
  second: string,
  maximumDifferences: number,
): boolean {
  let differences = 0
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      differences += 1
      if (differences > maximumDifferences) return false
    }
  }
  return differences >= 1
}

function wordLadderLength(
  { start, goal, cards }: WordLadderInput,
  maximumDifferences = 1,
): number {
  if (start === goal) return 1
  if (!cards.includes(goal)) return 0
  const queue: readonly [string, number][] = [[start, 1]]
  const mutableQueue = [...queue]
  const visited = new Set<string>([start])
  for (let front = 0; front < mutableQueue.length; front += 1) {
    const [word, distance] = mutableQueue[front]
    for (const candidate of cards) {
      if (
        visited.has(candidate) ||
        !differsByAtMost(word, candidate, maximumDifferences)
      ) {
        continue
      }
      if (candidate === goal) return distance + 1
      visited.add(candidate)
      mutableQueue.push([candidate, distance + 1])
    }
  }
  return 0
}

function solveWordLadder(input: JsonValue): JsonValue {
  return wordLadderLength(readWordLadder(input))
}

type ItineraryInput = {
  readonly start: string
  readonly tickets: readonly StringPair[]
}

function readItinerary(input: JsonValue): ItineraryInput {
  const mission = 'Reconstruct Itinerary input'
  const object = readObject(input, mission)
  return {
    start: readString(readField(object, 'start', mission), `${mission}.start`),
    tickets: readStringPairs(
      readField(object, 'tickets', mission),
      `${mission}.tickets`,
    ),
  }
}

function reconstructItinerary(
  { start, tickets }: ItineraryInput,
  chooseLargest: boolean,
): string[] {
  const graph = new Map<string, string[]>()
  for (const [origin, destination] of tickets) {
    const destinations = graph.get(origin)
    if (destinations) destinations.push(destination)
    else graph.set(origin, [destination])
  }
  for (const destinations of graph.values()) {
    destinations.sort()
    if (!chooseLargest) destinations.reverse()
  }

  const stack = [start]
  const reversedRoute: string[] = []
  while (stack.length > 0) {
    const stop = stack[stack.length - 1]
    const destinations = graph.get(stop)
    if (destinations && destinations.length > 0) {
      stack.push(destinations.pop()!)
    } else {
      reversedRoute.push(stack.pop()!)
    }
  }
  const route = reversedRoute.reverse()
  if (route.length !== tickets.length + 1) {
    throw new TypeError('Reconstruct Itinerary input does not contain a full route')
  }
  return route
}

function solveReconstructItinerary(input: JsonValue): JsonValue {
  return reconstructItinerary(readItinerary(input), false)
}

function readSensorPoints(input: JsonValue): NumberPair[] {
  const mission = 'Min Cost to Connect All Points input'
  const object = readObject(input, mission)
  return readIntegerPairs(
    readField(object, 'sensors', mission),
    `${mission}.sensors`,
  )
}

function minimumSpanningTreeCost(
  points: readonly NumberPair[],
  squaredEuclidean: boolean,
): number {
  if (points.length < 2) return 0
  const used = Array.from({ length: points.length }, () => false)
  const best = Array.from({ length: points.length }, () => Number.POSITIVE_INFINITY)
  best[0] = 0
  let total = 0

  for (let included = 0; included < points.length; included += 1) {
    let selected = -1
    for (let index = 0; index < points.length; index += 1) {
      if (
        !used[index] &&
        (selected === -1 || best[index] < best[selected])
      ) {
        selected = index
      }
    }
    used[selected] = true
    total += best[selected]
    for (let next = 0; next < points.length; next += 1) {
      if (used[next]) continue
      const horizontal = Math.abs(points[selected][0] - points[next][0])
      const vertical = Math.abs(points[selected][1] - points[next][1])
      const cost = squaredEuclidean
        ? horizontal * horizontal + vertical * vertical
        : horizontal + vertical
      if (cost < best[next]) best[next] = cost
    }
  }
  return total
}

function solveMinCostToConnectPoints(input: JsonValue): JsonValue {
  return minimumSpanningTreeCost(readSensorPoints(input), false)
}

type WeightedNetworkInput = {
  readonly labels: readonly string[]
  readonly start: string
  readonly edges: readonly WeightedStringEdge[]
}

function readWeightedNetwork(input: JsonValue): WeightedNetworkInput {
  const mission = 'Network Delay Time input'
  const object = readObject(input, mission)
  const labels = readStringArray(
    readField(object, 'relays', mission),
    `${mission}.relays`,
  )
  if (labels.length === 0) {
    throw new TypeError(`${mission}.relays must not be empty`)
  }
  assertDistinct(labels, `${mission}.relays`)
  const start = readString(readField(object, 'start', mission), `${mission}.start`)
  const labelSet = new Set(labels)
  if (!labelSet.has(start)) {
    throw new TypeError(`${mission}.start must name a relay`)
  }
  const edges = readWeightedStringEdges(
    readField(object, 'links', mission),
    `${mission}.links`,
  )
  validateKnownEndpoints(edges, labelSet, `${mission}.links`)
  return { labels, start, edges }
}

function networkDelay(
  { labels, start, edges }: WeightedNetworkInput,
  undirected: boolean,
): number {
  const graph = new Map<string, [string, number][]>()
  for (const label of labels) graph.set(label, [])
  for (const [origin, destination, time] of edges) {
    graph.get(origin)!.push([destination, time])
    if (undirected) graph.get(destination)!.push([origin, time])
  }
  const distance = new Map(labels.map((label) => [label, Number.POSITIVE_INFINITY]))
  distance.set(start, 0)
  const visited = new Set<string>()

  while (visited.size < labels.length) {
    let selected: string | undefined
    for (const label of labels) {
      if (
        !visited.has(label) &&
        (selected === undefined || distance.get(label)! < distance.get(selected)!)
      ) {
        selected = label
      }
    }
    if (selected === undefined || !Number.isFinite(distance.get(selected)!)) break
    visited.add(selected)
    for (const [destination, time] of graph.get(selected)!) {
      const candidate = distance.get(selected)! + time
      if (candidate < distance.get(destination)!) {
        distance.set(destination, candidate)
      }
    }
  }
  const arrivals = labels.map((label) => distance.get(label)!)
  return arrivals.some((arrival) => !Number.isFinite(arrival))
    ? -1
    : Math.max(...arrivals)
}

function solveNetworkDelay(input: JsonValue): JsonValue {
  return networkDelay(readWeightedNetwork(input), false)
}

function readSwimCourse(input: JsonValue): number[][] {
  const grid = readGridField(
    input,
    'Swim in Rising Water input',
    'course',
  )
  if (
    grid.length === 0 ||
    grid.some((row) => row.length !== grid.length) ||
    grid.some((row) => row.some((height) => height < 0))
  ) {
    throw new TypeError(
      'Swim in Rising Water input.course must be a nonempty square of nonnegative integers',
    )
  }
  return grid
}

function minimumWaterRoute(
  grid: readonly (readonly number[])[],
  additiveCost: boolean,
  ignoreStartElevation = false,
): number {
  const size = grid.length
  const best = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Number.POSITIVE_INFINITY),
  )
  const used = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  )
  best[0][0] = ignoreStartElevation ? 0 : grid[0][0]

  for (let step = 0; step < size * size; step += 1) {
    let selectedRow = -1
    let selectedColumn = -1
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        if (
          !used[row][column] &&
          (selectedRow === -1 ||
            best[row][column] < best[selectedRow][selectedColumn])
        ) {
          selectedRow = row
          selectedColumn = column
        }
      }
    }
    used[selectedRow][selectedColumn] = true
    if (selectedRow === size - 1 && selectedColumn === size - 1) {
      return best[selectedRow][selectedColumn]
    }
    for (const [rowChange, columnChange] of ORTHOGONAL_DIRECTIONS) {
      const nextRow = selectedRow + rowChange
      const nextColumn = selectedColumn + columnChange
      if (
        nextRow < 0 ||
        nextRow >= size ||
        nextColumn < 0 ||
        nextColumn >= size ||
        used[nextRow][nextColumn]
      ) {
        continue
      }
      const candidate = additiveCost
        ? best[selectedRow][selectedColumn] + grid[nextRow][nextColumn]
        : Math.max(
            best[selectedRow][selectedColumn],
            grid[nextRow][nextColumn],
          )
      if (candidate < best[nextRow][nextColumn]) {
        best[nextRow][nextColumn] = candidate
      }
    }
  }
  throw new TypeError('Swim in Rising Water input has no route')
}

function solveSwimInRisingWater(input: JsonValue): JsonValue {
  return minimumWaterRoute(readSwimCourse(input), false)
}

function readAlienWords(input: JsonValue): string[] {
  const mission = 'Alien Dictionary input'
  const object = readObject(input, mission)
  return readStringArray(
    readField(object, 'scrolls', mission),
    `${mission}.scrolls`,
  )
}

function alienAlphabet(
  words: readonly string[],
  ignoreInvalidPrefix: boolean,
  returnPartialOnCycle = false,
): string {
  const characters = [...new Set(words.flatMap((word) => [...word]))]
  const graph = new Map<string, Set<string>>()
  const indegree = new Map<string, number>()
  for (const character of characters) {
    graph.set(character, new Set())
    indegree.set(character, 0)
  }

  for (let index = 0; index + 1 < words.length; index += 1) {
    const first = [...words[index]]
    const second = [...words[index + 1]]
    const sharedLength = Math.min(first.length, second.length)
    let difference = -1
    for (let position = 0; position < sharedLength; position += 1) {
      if (first[position] !== second[position]) {
        difference = position
        break
      }
    }
    if (difference === -1) {
      if (!ignoreInvalidPrefix && first.length > second.length) return ''
      continue
    }
    const before = first[difference]
    const after = second[difference]
    if (!graph.get(before)!.has(after)) {
      graph.get(before)!.add(after)
      indegree.set(after, indegree.get(after)! + 1)
    }
  }

  const available = characters.filter((character) => indegree.get(character) === 0)
  const order: string[] = []
  while (available.length > 0) {
    available.sort().reverse()
    const character = available.pop()!
    order.push(character)
    for (const next of [...graph.get(character)!].sort()) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) available.push(next)
    }
  }
  return order.length === characters.length || returnPartialOnCycle
    ? order.join('')
    : ''
}

function solveAlienDictionary(input: JsonValue): JsonValue {
  return alienAlphabet(readAlienWords(input), false)
}

type FlightsInput = {
  readonly depots: readonly string[]
  readonly source: string
  readonly destination: string
  readonly maxStops: number
  readonly flights: readonly WeightedStringEdge[]
}

function readFlights(input: JsonValue): FlightsInput {
  const mission = 'Cheapest Flights input'
  const object = readObject(input, mission)
  const depots = readStringArray(
    readField(object, 'depots', mission),
    `${mission}.depots`,
  )
  if (depots.length === 0) {
    throw new TypeError(`${mission}.depots must not be empty`)
  }
  assertDistinct(depots, `${mission}.depots`)
  const depotSet = new Set(depots)
  const source = readString(
    readField(object, 'source', mission),
    `${mission}.source`,
  )
  const destination = readString(
    readField(object, 'destination', mission),
    `${mission}.destination`,
  )
  if (!depotSet.has(source) || !depotSet.has(destination)) {
    throw new TypeError(`${mission} endpoints must name depots`)
  }
  const maxStops = readInteger(
    readField(object, 'maxStops', mission),
    `${mission}.maxStops`,
    0,
  )
  const flights = readWeightedStringEdges(
    readField(object, 'flights', mission),
    `${mission}.flights`,
  )
  validateKnownEndpoints(flights, depotSet, `${mission}.flights`)
  return { depots, source, destination, maxStops, flights }
}

function cheapestFlight(
  { depots, source, destination, maxStops, flights }: FlightsInput,
  updateInPlace: boolean,
  treatStopsAsEdgeCount = false,
): number {
  if (source === destination) return 0
  let costs = new Map(
    depots.map((depot) => [depot, Number.POSITIVE_INFINITY]),
  )
  costs.set(source, 0)

  const relaxationRounds = treatStopsAsEdgeCount ? maxStops : maxStops + 1
  for (let edgeCount = 0; edgeCount < relaxationRounds; edgeCount += 1) {
    const nextCosts = updateInPlace ? costs : new Map(costs)
    for (const [origin, next, fare] of flights) {
      const originCost = costs.get(origin)!
      if (Number.isFinite(originCost)) {
        nextCosts.set(next, Math.min(nextCosts.get(next)!, originCost + fare))
      }
    }
    costs = nextCosts
  }
  const result = costs.get(destination)!
  return Number.isFinite(result) ? result : -1
}

function solveCheapestFlights(input: JsonValue): JsonValue {
  return cheapestFlight(readFlights(input), false)
}

function twoMutantOracle<const Id extends ProblemId>(
  problemId: Id,
  solve: PureJsonProblemSolver,
  firstMutant: ProblemMissionMutant,
  secondMutant: ProblemMissionMutant,
) {
  return defineProblemMissionOracle({
    problemId,
    solve,
    mutants: [firstMutant, secondMutant] as const,
  })
}

export const REALM_4_PROBLEM_MISSION_ORACLES =
  defineProblemMissionOracleRegistry({
    'problem:subsets': twoMutantOracle(
      'problem:subsets',
      solveSubsets,
      {
        id: 'omits-empty-subset',
        description: 'Records a subset only after choosing at least one item.',
        solve(input: JsonValue): JsonValue {
          const values = readDistinctIntegerField(
            input,
            'Subsets input',
            'artifacts',
          )
          return enumerateSubsets(values, false).slice(1)
        },
      },
      {
        id: 'forgets-to-pop-choice',
        description:
          'Leaves each chosen artifact on the shared path before exploring its sibling.',
        solve(input: JsonValue): JsonValue {
          const values = readDistinctIntegerField(
            input,
            'Subsets input',
            'artifacts',
          )
          const results: number[][] = []
          const path: number[] = []
          const visit = (start: number): void => {
            results.push([...path])
            for (let index = start; index < values.length; index += 1) {
              path.push(values[index])
              visit(index + 1)
            }
          }
          visit(0)
          return results
        },
      },
    ),
    'problem:combination-sum': twoMutantOracle(
      'problem:combination-sum',
      solveCombinationSum,
      {
        id: 'uses-each-crystal-once',
        description:
          'Advances after every choice, incorrectly preventing crystal reuse.',
        solve(input: JsonValue): JsonValue {
          const { values, target } = readCombinationSumInput(
            input,
            'Combination Sum input',
            'crystals',
            true,
          )
          return reusableCombinationSums(values, target, false)
        },
      },
      {
        id: 'accepts-overshot-total',
        description:
          'Treats a negative remaining target as a completed recipe.',
        solve(input: JsonValue): JsonValue {
          const { values, target } = readCombinationSumInput(
            input,
            'Combination Sum input',
            'crystals',
            true,
          )
          const results: number[][] = []
          const path: number[] = []
          const search = (start: number, remaining: number): void => {
            if (remaining <= 0) {
              results.push([...path])
              return
            }
            for (let index = start; index < values.length; index += 1) {
              path.push(values[index])
              search(index, remaining - values[index])
              path.pop()
            }
          }
          search(0, target)
          return results
        },
      },
    ),
    'problem:permutations': twoMutantOracle(
      'problem:permutations',
      solvePermutations,
      {
        id: 'reuses-active-tag',
        description:
          'Fails to exclude tags already active in the current arrangement.',
        solve(input: JsonValue): JsonValue {
          const values = readDistinctIntegerField(
            input,
            'Permutations input',
            'droneTags',
          )
          const results: number[][] = []
          const path: number[] = []
          const arrange = (): void => {
            if (path.length === values.length) {
              results.push([...path])
              return
            }
            for (const value of values) {
              path.push(value)
              arrange()
              path.pop()
            }
          }
          arrange()
          return results
        },
      },
      {
        id: 'forgets-to-unmark-tag',
        description:
          'Keeps a tag marked after backtracking, preventing later root branches.',
        solve(input: JsonValue): JsonValue {
          const values = readDistinctIntegerField(
            input,
            'Permutations input',
            'droneTags',
          )
          const results: number[][] = []
          const path: number[] = []
          const used = new Set<number>()
          const arrange = (): void => {
            if (path.length === values.length) {
              results.push([...path])
              return
            }
            for (const value of values) {
              if (used.has(value)) continue
              used.add(value)
              path.push(value)
              arrange()
              path.pop()
            }
          }
          arrange()
          return results
        },
      },
    ),
    'problem:subsets-ii': twoMutantOracle(
      'problem:subsets-ii',
      solveSubsetsIi,
      {
        id: 'keeps-equal-sibling-branches',
        description:
          'Branches on equal sibling values and emits duplicate subsets.',
        solve(input: JsonValue): JsonValue {
          return enumerateSubsets(readSubsetsIiValues(input), false)
        },
      },
      {
        id: 'deduplicates-values-globally',
        description:
          'Collapses equal input positions before searching, losing valid repeated-value subsets.',
        solve(input: JsonValue): JsonValue {
          return enumerateSubsets([...new Set(readSubsetsIiValues(input))], false)
        },
      },
    ),
    'problem:combination-sum-ii': twoMutantOracle(
      'problem:combination-sum-ii',
      solveCombinationSumIi,
      {
        id: 'reuses-crate-position',
        description:
          'Recurses from the chosen index, allowing one crate position repeatedly.',
        solve(input: JsonValue): JsonValue {
          const { values, target } = readCombinationSumInput(
            input,
            'Combination Sum II input',
            'crateValues',
            false,
          )
          return oneUseCombinationSums(values, target, true, true)
        },
      },
      {
        id: 'collapses-duplicate-crates',
        description:
          'Deduplicates crate values before search, erasing distinct usable positions.',
        solve(input: JsonValue): JsonValue {
          const { values, target } = readCombinationSumInput(
            input,
            'Combination Sum II input',
            'crateValues',
            false,
          )
          return oneUseCombinationSums(
            [...new Set(values)],
            target,
            true,
            false,
          )
        },
      },
    ),
    'problem:word-search': twoMutantOracle(
      'problem:word-search',
      solveWordSearch,
      {
        id: 'checks-letters-without-path',
        description:
          'Checks only whether each requested character occurs somewhere in the field.',
        solve(input: JsonValue): JsonValue {
          const { field, trail } = readWordSearchInput(input)
          const available = new Set(field.flat())
          return [...trail].every((character) => available.has(character))
        },
      },
      {
        id: 'allows-diagonal-revisits',
        description:
          'Explores eight directions without tracking used cells on the current path.',
        solve(input: JsonValue): JsonValue {
          const { field, trail } = readWordSearchInput(input)
          if (trail.length === 0) return true
          if (field.length === 0 || field[0].length === 0) return false
          const rows = field.length
          const columns = field[0].length
          const search = (
            row: number,
            column: number,
            index: number,
          ): boolean => {
            if (
              row < 0 ||
              row >= rows ||
              column < 0 ||
              column >= columns ||
              field[row][column] !== trail[index]
            ) {
              return false
            }
            if (index === trail.length - 1) return true
            for (let rowChange = -1; rowChange <= 1; rowChange += 1) {
              for (
                let columnChange = -1;
                columnChange <= 1;
                columnChange += 1
              ) {
                if (
                  (rowChange !== 0 || columnChange !== 0) &&
                  search(
                    row + rowChange,
                    column + columnChange,
                    index + 1,
                  )
                ) {
                  return true
                }
              }
            }
            return false
          }
          for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
              if (search(row, column, 0)) return true
            }
          }
          return false
        },
      },
    ),
    'problem:palindrome-partitioning': twoMutantOracle(
      'problem:palindrome-partitioning',
      solvePalindromePartitioning,
      {
        id: 'single-character-cuts-only',
        description:
          'Always cuts after one character and misses longer palindromic strips.',
        solve(input: JsonValue): JsonValue {
          return [[...readRibbon(input)]]
        },
      },
      {
        id: 'skips-palindrome-check',
        description:
          'Branches on every possible cut without verifying that each strip is a palindrome.',
        solve(input: JsonValue): JsonValue {
          const text = readRibbon(input)
          const results: string[][] = []
          const path: string[] = []
          const cut = (start: number): void => {
            if (start === text.length) {
              results.push([...path])
              return
            }
            for (let end = start; end < text.length; end += 1) {
              path.push(text.slice(start, end + 1))
              cut(end + 1)
              path.pop()
            }
          }
          cut(0)
          return results
        },
      },
    ),
    'problem:letter-combinations-of-a-phone-number': twoMutantOracle(
      'problem:letter-combinations-of-a-phone-number',
      solvePhoneCombinations,
      {
        id: 'keeps-first-root-branch-only',
        description:
          'Explores only the first mapped letter for the first signal digit.',
        solve(input: JsonValue): JsonValue {
          const signal = readPhoneSignal(input)
          const combinations = phoneCombinations(signal, false)
          if (signal.length === 0) return combinations
          const firstLetter = KEYPAD[signal[0]][0]
          return combinations.filter((code) => code.startsWith(firstLetter))
        },
      },
      {
        id: 'uses-three-letters-for-every-key',
        description:
          'Drops the fourth mapped letter from keys 7 and 9.',
        solve(input: JsonValue): JsonValue {
          const signal = readPhoneSignal(input)
          if (signal.length === 0) return []
          let combinations = ['']
          for (const digit of signal) {
            const next: string[] = []
            for (const prefix of combinations) {
              for (const letter of KEYPAD[digit].slice(0, 3)) {
                next.push(prefix + letter)
              }
            }
            combinations = next
          }
          return combinations
        },
      },
    ),
    'problem:n-queens': twoMutantOracle(
      'problem:n-queens',
      solveNQueens,
      {
        id: 'ignores-ascending-diagonal',
        description:
          'Checks columns and one diagonal direction but not the other.',
        solve(input: JsonValue): JsonValue {
          return nQueensLayouts(readNQueensSize(input), true)
        },
      },
      {
        id: 'ignores-descending-diagonal',
        description:
          'Checks columns and ascending diagonals but not descending diagonals.',
        solve(input: JsonValue): JsonValue {
          return nQueensLayouts(readNQueensSize(input), false, true)
        },
      },
    ),
    'problem:number-of-islands': twoMutantOracle(
      'problem:number-of-islands',
      solveNumberOfIslands,
      {
        id: 'connects-diagonal-land',
        description:
          'Treats diagonal land cells as connected to the same island.',
        solve(input: JsonValue): JsonValue {
          const grid = readGridField(
            input,
            'Number of Islands input',
            'roofMap',
            new Set([0, 1]),
          )
          return measureLand(grid, true).count
        },
      },
      {
        id: 'counts-every-land-cell',
        description:
          'Increments the island count for each land cell without flooding its component.',
        solve(input: JsonValue): JsonValue {
          const grid = readGridField(
            input,
            'Number of Islands input',
            'roofMap',
            new Set([0, 1]),
          )
          return grid.reduce(
            (total, row) =>
              total + row.filter((cell) => cell === 1).length,
            0,
          )
        },
      },
    ),
    'problem:max-area-of-island': twoMutantOracle(
      'problem:max-area-of-island',
      solveMaxAreaOfIsland,
      {
        id: 'counts-diagonal-area',
        description:
          'Includes diagonally touching cells in one island area.',
        solve(input: JsonValue): JsonValue {
          const grid = readGridField(
            input,
            'Max Area of Island input',
            'panelMap',
            new Set([0, 1]),
          )
          return measureLand(grid, true).maximumArea
        },
      },
      {
        id: 'combines-all-land-areas',
        description:
          'Carries area across components and returns total land instead of the largest component.',
        solve(input: JsonValue): JsonValue {
          const grid = readGridField(
            input,
            'Max Area of Island input',
            'panelMap',
            new Set([0, 1]),
          )
          return grid.reduce(
            (total, row) =>
              total + row.filter((cell) => cell === 1).length,
            0,
          )
        },
      },
    ),
    'problem:clone-graph': twoMutantOracle(
      'problem:clone-graph',
      solveCloneGraph,
      {
        id: 'copies-unreachable-stations',
        description:
          'Copies every adjacency entry instead of only the start component.',
        solve(input: JsonValue): JsonValue {
          return cloneAdjacency(readCloneGraphInput(input), true)
        },
      },
      {
        id: 'drops-self-loop-neighbors',
        description:
          'Filters a station out of its own copied neighbor list.',
        solve(input: JsonValue): JsonValue {
          const cloned = readObject(
            cloneAdjacency(readCloneGraphInput(input), false),
            'Clone Graph mutant output',
          )
          const output = makeJsonObject()
          for (const station of Object.keys(cloned)) {
            output[station] = readStringArray(
              cloned[station],
              `Clone Graph mutant output.${JSON.stringify(station)}`,
            ).filter((neighbor) => neighbor !== station)
          }
          return output
        },
      },
    ),
    'problem:walls-and-gates': twoMutantOracle(
      'problem:walls-and-gates',
      solveWallsAndGates,
      {
        id: 'starts-from-first-gate-only',
        description:
          'Runs BFS from the first gate rather than all gates simultaneously.',
        solve(input: JsonValue): JsonValue {
          return wallsAndGatesDistances(readWallsAndGatesGrid(input), false)
        },
      },
      {
        id: 'treats-walls-as-open-rooms',
        description:
          'Lets the distance wave pass through -1 wall cells.',
        solve(input: JsonValue): JsonValue {
          const withoutWalls = readWallsAndGatesGrid(input).map((row) =>
            row.map((cell) => (cell === -1 ? 999 : cell)),
          )
          return wallsAndGatesDistances(withoutWalls, true)
        },
      },
    ),
    'problem:rotting-oranges': twoMutantOracle(
      'problem:rotting-oranges',
      solveRottingOranges,
      {
        id: 'counts-initial-layer-as-minute',
        description:
          'Counts the initial hot-cell layer as a spread minute.',
        solve(input: JsonValue): JsonValue {
          const result = rottingMinutes(readRottingOrangesGrid(input))
          return result > 0 ? result + 1 : result
        },
      },
      {
        id: 'starts-from-first-hot-cell-only',
        description:
          'Seeds the spread queue with only the first initially hot cell.',
        solve(input: JsonValue): JsonValue {
          return rottingMinutes(readRottingOrangesGrid(input), false)
        },
      },
    ),
    'problem:pacific-atlantic-water-flow': twoMutantOracle(
      'problem:pacific-atlantic-water-flow',
      solvePacificAtlantic,
      {
        id: 'requires-strict-reverse-climb',
        description:
          'Rejects equal-height reverse-flow moves by requiring a strict climb.',
        solve(input: JsonValue): JsonValue {
          return pacificAtlanticCells(readHeights(input), true)
        },
      },
      {
        id: 'reverses-height-inequality',
        description:
          'Moves from ocean boundaries to equal-or-lower cells during reverse traversal.',
        solve(input: JsonValue): JsonValue {
          return pacificAtlanticCells(readHeights(input), false, true)
        },
      },
    ),
    'problem:surrounded-regions': twoMutantOracle(
      'problem:surrounded-regions',
      solveSurroundedRegions,
      {
        id: 'marks-horizontal-boundaries-only',
        description:
          'Seeds safety from top and bottom but omits left and right boundaries.',
        solve(input: JsonValue): JsonValue {
          return captureRegions(readSurroundedBoard(input), false)
        },
      },
      {
        id: 'marks-boundary-cells-without-flooding',
        description:
          'Protects boundary O cells but fails to propagate safety into their components.',
        solve(input: JsonValue): JsonValue {
          return captureRegions(readSurroundedBoard(input), true, false)
        },
      },
    ),
    'problem:course-schedule': twoMutantOracle(
      'problem:course-schedule',
      solveCourseSchedule,
      {
        id: 'uses-visited-without-active-state',
        description:
          'Uses one visited state, so a back edge into the active path is accepted.',
        solve(input: JsonValue): JsonValue {
          return canFinishCourses(readCourseSchedule(input), true)
        },
      },
      {
        id: 'treats-requirements-as-undirected',
        description:
          'Adds reverse prerequisite edges, turning an ordinary dependency into a cycle.',
        solve(input: JsonValue): JsonValue {
          const { count, edges } = readCourseSchedule(input)
          const reversed: NumberPair[] = edges.map(
            ([badge, requiredBadge]) => [requiredBadge, badge],
          )
          return canFinishCourses(
            { count, edges: [...edges, ...reversed] },
            false,
          )
        },
      },
    ),
    'problem:course-schedule-ii': twoMutantOracle(
      'problem:course-schedule-ii',
      solveCourseScheduleIi,
      {
        id: 'ignores-requirements',
        description:
          'Returns station-number order without checking any prerequisite edge.',
        solve(input: JsonValue): JsonValue {
          const { count } = readCourseScheduleIi(input)
          return Array.from({ length: count }, (_, station) => station)
        },
      },
      {
        id: 'reverses-topological-route',
        description:
          'Reverses a completed Kahn route, placing dependents before prerequisites.',
        solve(input: JsonValue): JsonValue {
          return topologicalStationOrder(
            readCourseScheduleIi(input),
            false,
          ).reverse()
        },
      },
    ),
    'problem:graph-valid-tree': twoMutantOracle(
      'problem:graph-valid-tree',
      solveValidTree,
      {
        id: 'checks-edge-count-only',
        description:
          'Assumes n - 1 edges are sufficient without rejecting a cycle.',
        solve(input: JsonValue): JsonValue {
          const { count, edges } = readValidTree(input)
          return edges.length === count - 1
        },
      },
      {
        id: 'requires-at-least-one-bridge',
        description:
          'Rejects the valid single-platform tree because it has no bridge.',
        solve(input: JsonValue): JsonValue {
          const graph = readValidTree(input)
          return graph.edges.length > 0 && isValidTree(graph)
        },
      },
    ),
    'problem:number-of-connected-components-in-an-undirected-graph':
      twoMutantOracle(
        'problem:number-of-connected-components-in-an-undirected-graph',
        solveConnectedComponents,
        {
          id: 'decrements-for-every-link',
          description:
            'Decrements the component count for duplicate and self-loop links.',
          solve(input: JsonValue): JsonValue {
            const { count, edges } = readConnectedComponents(input)
            return count - edges.length
          },
        },
        {
          id: 'omits-isolated-radios',
          description:
            'Counts components only among radio labels that appear in a link.',
          solve(input: JsonValue): JsonValue {
            const { count, edges } = readConnectedComponents(input)
            const sets = new IndexDisjointSet(count)
            const seen = new Set<number>()
            for (const [first, second] of edges) {
              seen.add(first)
              seen.add(second)
              sets.union(first, second)
            }
            return new Set([...seen].map((radio) => sets.find(radio))).size
          },
        },
      ),
    'problem:redundant-connection': twoMutantOracle(
      'problem:redundant-connection',
      solveRedundantConnection,
      {
        id: 'returns-last-redundant-edge',
        description:
          'Continues after finding a cycle and returns the last redundant edge.',
        solve(input: JsonValue): JsonValue {
          return findRedundantConnection(readSkywalks(input), true)
        },
      },
      {
        id: 'detects-directed-cycles',
        description:
          'Treats each skywalk as directed and checks only for a directed return path.',
        solve(input: JsonValue): JsonValue {
          const edges = readSkywalks(input)
          const graph = new Map<number, number[]>()
          const reaches = (start: number, target: number): boolean => {
            const stack = [start]
            const visited = new Set<number>()
            while (stack.length > 0) {
              const node = stack.pop()!
              if (node === target) return true
              if (visited.has(node)) continue
              visited.add(node)
              for (const next of graph.get(node) ?? []) stack.push(next)
            }
            return false
          }
          for (const [first, second] of edges) {
            if (reaches(second, first)) return [first, second]
            const neighbors = graph.get(first)
            if (neighbors) neighbors.push(second)
            else graph.set(first, [second])
          }
          return []
        },
      },
    ),
    'problem:word-ladder': twoMutantOracle(
      'problem:word-ladder',
      solveWordLadder,
      {
        id: 'counts-transformations-not-words',
        description:
          'Returns the edge count instead of counting both endpoint words.',
        solve(input: JsonValue): JsonValue {
          return Math.max(0, wordLadderLength(readWordLadder(input)) - 1)
        },
      },
      {
        id: 'allows-two-letter-jumps',
        description:
          'Connects words that differ in up to two positions during BFS.',
        solve(input: JsonValue): JsonValue {
          return wordLadderLength(readWordLadder(input), 2)
        },
      },
    ),
    'problem:reconstruct-itinerary': twoMutantOracle(
      'problem:reconstruct-itinerary',
      solveReconstructItinerary,
      {
        id: 'chooses-largest-destination',
        description:
          'Consumes alphabetically largest destinations first in Hierholzer traversal.',
        solve(input: JsonValue): JsonValue {
          return reconstructItinerary(readItinerary(input), true)
        },
      },
      {
        id: 'deduplicates-identical-tickets',
        description:
          'Stores destinations as a set and loses repeated tickets between the same stops.',
        solve(input: JsonValue): JsonValue {
          const { start, tickets } = readItinerary(input)
          const uniqueTickets = tickets.filter(
            ([origin, destination], index) =>
              tickets.findIndex(
                ([otherOrigin, otherDestination]) =>
                  origin === otherOrigin && destination === otherDestination,
              ) === index,
          )
          return reconstructItinerary(
            { start, tickets: uniqueTickets },
            false,
          )
        },
      },
    ),
    'problem:min-cost-to-connect-all-points': twoMutantOracle(
      'problem:min-cost-to-connect-all-points',
      solveMinCostToConnectPoints,
      {
        id: 'uses-squared-euclidean-cost',
        description:
          'Builds the spanning tree with squared Euclidean instead of Manhattan cost.',
        solve(input: JsonValue): JsonValue {
          return minimumSpanningTreeCost(readSensorPoints(input), true)
        },
      },
      {
        id: 'connects-every-point-to-first',
        description:
          'Builds a fixed star from the first sensor instead of relaxing the growing MST frontier.',
        solve(input: JsonValue): JsonValue {
          const points = readSensorPoints(input)
          if (points.length < 2) return 0
          let total = 0
          for (let index = 1; index < points.length; index += 1) {
            total +=
              Math.abs(points[0][0] - points[index][0]) +
              Math.abs(points[0][1] - points[index][1])
          }
          return total
        },
      },
    ),
    'problem:network-delay-time': twoMutantOracle(
      'problem:network-delay-time',
      solveNetworkDelay,
      {
        id: 'treats-links-as-undirected',
        description:
          'Adds a reverse edge for each directed network link.',
        solve(input: JsonValue): JsonValue {
          return networkDelay(readWeightedNetwork(input), true)
        },
      },
      {
        id: 'uses-unweighted-bfs-hops',
        description:
          'Measures relay hops with BFS instead of accumulating weighted travel times.',
        solve(input: JsonValue): JsonValue {
          const { labels, start, edges } = readWeightedNetwork(input)
          const graph = new Map(labels.map((label) => [label, [] as string[]]))
          for (const [origin, destination] of edges) {
            graph.get(origin)!.push(destination)
          }
          const hops = new Map<string, number>([[start, 0]])
          const queue = [start]
          for (let front = 0; front < queue.length; front += 1) {
            const relay = queue[front]
            for (const next of graph.get(relay)!) {
              if (hops.has(next)) continue
              hops.set(next, hops.get(relay)! + 1)
              queue.push(next)
            }
          }
          if (hops.size !== labels.length) return -1
          return Math.max(...hops.values())
        },
      },
    ),
    'problem:swim-in-rising-water': twoMutantOracle(
      'problem:swim-in-rising-water',
      solveSwimInRisingWater,
      {
        id: 'minimizes-sum-of-elevations',
        description:
          'Uses additive path cost instead of the maximum elevation on the path.',
        solve(input: JsonValue): JsonValue {
          return minimumWaterRoute(readSwimCourse(input), true)
        },
      },
      {
        id: 'ignores-start-elevation',
        description:
          'Initializes the route cost to zero instead of the top-left elevation.',
        solve(input: JsonValue): JsonValue {
          return minimumWaterRoute(readSwimCourse(input), false, true)
        },
      },
    ),
    'problem:alien-dictionary': defineProblemMissionOracle({
      problemId: 'problem:alien-dictionary',
      solve: solveAlienDictionary,
      mutants: [
        {
          id: 'accepts-invalid-prefix-order',
          description:
            'Does not reject a longer word appearing before its exact prefix.',
          solve(input: JsonValue): JsonValue {
            return alienAlphabet(readAlienWords(input), true)
          },
        },
        {
          id: 'returns-partial-order-on-cycle',
          description:
            'Returns the acyclic prefix of a topological walk when a cycle blocks the remaining symbols.',
          solve(input: JsonValue): JsonValue {
            return alienAlphabet(readAlienWords(input), false, true)
          },
        },
      ],
    }),
    'problem:cheapest-flights-within-k-stops': twoMutantOracle(
      'problem:cheapest-flights-within-k-stops',
      solveCheapestFlights,
      {
        id: 'relaxes-flights-in-place',
        description:
          'Chains multiple flights during one round and exceeds the stop limit.',
        solve(input: JsonValue): JsonValue {
          return cheapestFlight(readFlights(input), true)
        },
      },
      {
        id: 'counts-stops-as-edges',
        description:
          'Runs maxStops relaxation rounds instead of allowing maxStops + 1 flights.',
        solve(input: JsonValue): JsonValue {
          return cheapestFlight(readFlights(input), false, true)
        },
      },
    ),
  })
