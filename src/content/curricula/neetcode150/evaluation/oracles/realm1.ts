import type { JsonValue } from '../../../../../types/learning'
import {
  defineProblemMissionOracle,
  defineProblemMissionOracleRegistry,
} from '../oracleContract'

function readBadgeCodes(input: JsonValue): readonly number[] {
  if (input === null || Array.isArray(input) || typeof input !== 'object') {
    throw new TypeError('Contains Duplicate input must be a JSON object')
  }
  const badgeCodes = (
    input as { readonly [key: string]: JsonValue }
  ).badgeCodes
  if (
    !Array.isArray(badgeCodes) ||
    !badgeCodes.every(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    )
  ) {
    throw new TypeError('badgeCodes must be an array of finite numbers')
  }
  return badgeCodes
}

const containsDuplicateOracle = defineProblemMissionOracle({
  problemId: 'problem:contains-duplicate',
  solve(input: JsonValue): JsonValue {
    const seen = new Set<number>()
    for (const value of readBadgeCodes(input)) {
      if (seen.has(value)) return true
      seen.add(value)
    }
    return false
  },
  mutants: [
    {
      id: 'adjacent-only',
      description:
        'Checks neighboring values only, so a separated duplicate is missed.',
      solve(input: JsonValue): JsonValue {
        const values = readBadgeCodes(input)
        return values.some(
          (value, index) => index > 0 && value === values[index - 1],
        )
      },
    },
    {
      id: 'requires-third-occurrence',
      description:
        'Treats the second sighting as setup and reports a duplicate only on the third sighting.',
      solve(input: JsonValue): JsonValue {
        const seenOnce = new Set<number>()
        const seenTwice = new Set<number>()
        for (const value of readBadgeCodes(input)) {
          if (seenTwice.has(value)) return true
          if (seenOnce.has(value)) seenTwice.add(value)
          else seenOnce.add(value)
        }
        return false
      },
    },
  ],
})

type JsonObject = { readonly [key: string]: JsonValue }

type NumberArrayRules = {
  readonly integer?: boolean
  readonly nonNegative?: boolean
}

function readJsonObject(input: JsonValue, problem: string): JsonObject {
  if (input === null || Array.isArray(input) || typeof input !== 'object') {
    throw new TypeError(`${problem} input must be a JSON object`)
  }
  return input as JsonObject
}

function readStringField(
  input: JsonObject,
  field: string,
  problem: string,
  lowercaseAsciiOnly = false,
): string {
  const value = input[field]
  if (
    typeof value !== 'string' ||
    (lowercaseAsciiOnly && !/^[a-z]*$/.test(value))
  ) {
    const qualifier = lowercaseAsciiOnly ? 'lowercase ASCII ' : ''
    throw new TypeError(`${problem}.${field} must be a ${qualifier}string`)
  }
  return value
}

function readSafeIntegerField(
  input: JsonObject,
  field: string,
  problem: string,
): number {
  const value = input[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new TypeError(`${problem}.${field} must be a safe integer`)
  }
  return value
}

function readNonNegativeIntegerField(
  input: JsonObject,
  field: string,
  problem: string,
): number {
  const value = readSafeIntegerField(input, field, problem)
  if (value < 0) {
    throw new TypeError(`${problem}.${field} must be nonnegative`)
  }
  return value
}

function readPositiveIntegerField(
  input: JsonObject,
  field: string,
  problem: string,
): number {
  const value = readSafeIntegerField(input, field, problem)
  if (value <= 0) {
    throw new TypeError(`${problem}.${field} must be positive`)
  }
  return value
}

function readNumberArrayField(
  input: JsonObject,
  field: string,
  problem: string,
  rules: NumberArrayRules = {},
): readonly number[] {
  const value = input[field]
  if (
    !Array.isArray(value) ||
    !value.every(
      (item): item is number =>
        typeof item === 'number' &&
        Number.isFinite(item) &&
        (!rules.integer || Number.isSafeInteger(item)) &&
        (!rules.nonNegative || item >= 0),
    )
  ) {
    throw new TypeError(
      `${problem}.${field} must be an array of valid numbers`,
    )
  }
  return value
}

function readStringArrayField(
  input: JsonObject,
  field: string,
  problem: string,
  lowercaseAsciiOnly = false,
): readonly string[] {
  const value = input[field]
  if (
    !Array.isArray(value) ||
    !value.every(
      (item): item is string =>
        typeof item === 'string' &&
        (!lowercaseAsciiOnly || /^[a-z]*$/.test(item)),
    )
  ) {
    const qualifier = lowercaseAsciiOnly ? 'lowercase ASCII ' : ''
    throw new TypeError(
      `${problem}.${field} must be an array of ${qualifier}strings`,
    )
  }
  return value
}

function sameCharacterInventory(first: string, second: string): boolean {
  const firstCharacters = [...first]
  const secondCharacters = [...second]
  if (firstCharacters.length !== secondCharacters.length) return false

  const counts = new Map<string, number>()
  for (const character of firstCharacters) {
    counts.set(character, (counts.get(character) ?? 0) + 1)
  }
  for (const character of secondCharacters) {
    const remaining = counts.get(character) ?? 0
    if (remaining === 0) return false
    counts.set(character, remaining - 1)
  }
  return true
}

const validAnagramOracle = defineProblemMissionOracle({
  problemId: 'problem:valid-anagram',
  solve(input: JsonValue): JsonValue {
    const data = readJsonObject(input, 'Valid Anagram')
    const original = readStringField(
      data,
      'original',
      'Valid Anagram',
      true,
    )
    const scrambled = readStringField(
      data,
      'scrambled',
      'Valid Anagram',
      true,
    )
    return sameCharacterInventory(original, scrambled)
  },
  mutants: [
    {
      id: 'distinct-letters-only',
      description:
        'Compares distinct letters but loses how many copies of each letter exist.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Valid Anagram')
        const original = readStringField(
          data,
          'original',
          'Valid Anagram',
          true,
        )
        const scrambled = readStringField(
          data,
          'scrambled',
          'Valid Anagram',
          true,
        )
        if (original.length !== scrambled.length) return false
        const first = new Set(original)
        const second = new Set(scrambled)
        return (
          first.size === second.size &&
          [...first].every((character) => second.has(character))
        )
      },
    },
    {
      id: 'requires-original-order',
      description:
        'Compares characters positionally, rejecting valid rearrangements of the same inventory.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Valid Anagram')
        const original = readStringField(
          data,
          'original',
          'Valid Anagram',
          true,
        )
        const scrambled = readStringField(
          data,
          'scrambled',
          'Valid Anagram',
          true,
        )
        return original === scrambled
      },
    },
  ],
})

function findTwoSum(input: JsonValue, storeBeforeLookup: boolean): JsonValue {
  const data = readJsonObject(input, 'Two Sum')
  const charges = readNumberArrayField(data, 'charges', 'Two Sum', {
    integer: true,
  })
  const target = readSafeIntegerField(data, 'target', 'Two Sum')
  const earlier = new Map<number, number>()

  for (let index = 0; index < charges.length; index += 1) {
    const charge = charges[index]
    if (storeBeforeLookup) earlier.set(charge, index)
    const match = earlier.get(target - charge)
    if (match !== undefined) return [match, index]
    if (!storeBeforeLookup) earlier.set(charge, index)
  }
  throw new Error('Two Sum input must contain a matching pair')
}

const twoSumOracle = defineProblemMissionOracle({
  problemId: 'problem:two-sum',
  solve(input: JsonValue): JsonValue {
    return findTwoSum(input, false)
  },
  mutants: [
    {
      id: 'stores-before-lookup',
      description:
        'Stores the current cell first, allowing one position to pair with itself.',
      solve(input: JsonValue): JsonValue {
        return findTwoSum(input, true)
      },
    },
    {
      id: 'reverses-index-order',
      description:
        'Finds the correct cells but returns the current index before the earlier index.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Two Sum')
        const charges = readNumberArrayField(data, 'charges', 'Two Sum', {
          integer: true,
        })
        const target = readSafeIntegerField(data, 'target', 'Two Sum')
        const earlier = new Map<number, number>()
        for (let index = 0; index < charges.length; index += 1) {
          const charge = charges[index]
          const match = earlier.get(target - charge)
          if (match !== undefined) return [index, match]
          earlier.set(charge, index)
        }
        throw new Error('Two Sum input must contain a matching pair')
      },
    },
  ],
})

function letterInventoryKey(label: string): string {
  const counts = Array<number>(26).fill(0)
  for (const character of label) {
    const index = character.charCodeAt(0) - 97
    counts[index] += 1
  }
  return counts.join(',')
}

function groupLabels(
  input: JsonValue,
  distinctLettersOnly: boolean,
): JsonValue {
  const data = readJsonObject(input, 'Group Anagrams')
  const labels = readStringArrayField(
    data,
    'labels',
    'Group Anagrams',
    true,
  )
  const groups = new Map<string, string[]>()

  for (const label of labels) {
    const key = distinctLettersOnly
      ? [...new Set(label)].sort().join('')
      : letterInventoryKey(label)
    const group = groups.get(key)
    if (group) group.push(label)
    else groups.set(key, [label])
  }
  return [...groups.values()]
}

const groupAnagramsOracle = defineProblemMissionOracle({
  problemId: 'problem:group-anagrams',
  solve(input: JsonValue): JsonValue {
    return groupLabels(input, false)
  },
  mutants: [
    {
      id: 'distinct-letter-signature',
      description:
        'Uses only the set of letters, merging labels with different counts.',
      solve(input: JsonValue): JsonValue {
        return groupLabels(input, true)
      },
    },
    {
      id: 'reuses-counts-across-labels',
      description:
        'Fails to reset the frequency array, so each signature includes all earlier labels.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Group Anagrams')
        const labels = readStringArrayField(
          data,
          'labels',
          'Group Anagrams',
          true,
        )
        const counts = Array<number>(26).fill(0)
        const groups = new Map<string, string[]>()
        for (const label of labels) {
          for (const character of label) {
            counts[character.charCodeAt(0) - 97] += 1
          }
          const key = counts.join(',')
          const group = groups.get(key)
          if (group) group.push(label)
          else groups.set(key, [label])
        }
        return [...groups.values()]
      },
    },
  ],
})

function topKFrequent(input: JsonValue, lowFrequencyFirst: boolean): JsonValue {
  const data = readJsonObject(input, 'Top K Frequent Elements')
  const pings = readNumberArrayField(
    data,
    'pings',
    'Top K Frequent Elements',
    { integer: true },
  )
  const k = readPositiveIntegerField(data, 'k', 'Top K Frequent Elements')
  const counts = new Map<number, number>()
  for (const ping of pings) {
    counts.set(ping, (counts.get(ping) ?? 0) + 1)
  }
  if (k > counts.size) {
    throw new TypeError(
      'Top K Frequent Elements.k cannot exceed the distinct ping count',
    )
  }

  const buckets = Array.from(
    { length: pings.length + 1 },
    () => [] as number[],
  )
  for (const [ping, count] of counts) buckets[count].push(ping)

  const answer: number[] = []
  if (lowFrequencyFirst) {
    for (let frequency = 1; frequency < buckets.length; frequency += 1) {
      for (const ping of buckets[frequency]) {
        answer.push(ping)
        if (answer.length === k) return answer
      }
    }
  } else {
    for (
      let frequency = buckets.length - 1;
      frequency >= 1;
      frequency -= 1
    ) {
      for (const ping of buckets[frequency]) {
        answer.push(ping)
        if (answer.length === k) return answer
      }
    }
  }
  throw new Error('Top K Frequent Elements could not produce k results')
}

const topKFrequentElementsOracle = defineProblemMissionOracle({
  problemId: 'problem:top-k-frequent-elements',
  solve(input: JsonValue): JsonValue {
    return topKFrequent(input, false)
  },
  mutants: [
    {
      id: 'scans-buckets-upward',
      description:
        'Scans frequency buckets from low to high, returning the least frequent codes.',
      solve(input: JsonValue): JsonValue {
        return topKFrequent(input, true)
      },
    },
    {
      id: 'skips-full-frequency-bucket',
      description:
        'Starts below frequency n, omitting a value that fills the entire input.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Top K Frequent Elements')
        const pings = readNumberArrayField(
          data,
          'pings',
          'Top K Frequent Elements',
          { integer: true },
        )
        const k = readPositiveIntegerField(
          data,
          'k',
          'Top K Frequent Elements',
        )
        const counts = new Map<number, number>()
        for (const ping of pings) {
          counts.set(ping, (counts.get(ping) ?? 0) + 1)
        }
        if (k > counts.size) {
          throw new TypeError(
            'Top K Frequent Elements.k cannot exceed the distinct ping count',
          )
        }
        const buckets = Array.from(
          { length: pings.length + 1 },
          () => [] as number[],
        )
        for (const [ping, count] of counts) buckets[count].push(ping)

        const answer: number[] = []
        for (
          let frequency = pings.length - 1;
          frequency >= 1;
          frequency -= 1
        ) {
          for (const ping of buckets[frequency]) {
            answer.push(ping)
            if (answer.length === k) return answer
          }
        }
        return answer
      },
    },
  ],
})

function encodeMessages(messages: readonly string[]): string {
  return messages
    .map((message) => `${[...message].length}#${message}`)
    .join('')
}

function decodeMessages(encoded: string): readonly string[] {
  const characters = [...encoded]
  const messages: string[] = []
  let cursor = 0

  while (cursor < characters.length) {
    let delimiter = cursor
    while (
      delimiter < characters.length &&
      characters[delimiter] >= '0' &&
      characters[delimiter] <= '9'
    ) {
      delimiter += 1
    }
    if (
      delimiter === cursor ||
      delimiter >= characters.length ||
      characters[delimiter] !== '#'
    ) {
      throw new TypeError('Encoded messages contain an invalid length header')
    }

    const size = Number(characters.slice(cursor, delimiter).join(''))
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new TypeError('Encoded message length must be a safe integer')
    }
    const start = delimiter + 1
    const end = start + size
    if (end > characters.length) {
      throw new TypeError('Encoded message payload is shorter than its header')
    }
    messages.push(characters.slice(start, end).join(''))
    cursor = end
  }
  return messages
}

function runStringCodec(
  input: JsonValue,
  splitDecodedPayloads: boolean,
): JsonValue {
  const data = readJsonObject(input, 'Encode and Decode Strings')
  const action = readStringField(
    data,
    'action',
    'Encode and Decode Strings',
  )
  if (action === 'encode') {
    return encodeMessages(
      readStringArrayField(
        data,
        'messages',
        'Encode and Decode Strings',
      ),
    )
  }
  if (action !== 'decode') {
    throw new TypeError(
      'Encode and Decode Strings.action must be "encode" or "decode"',
    )
  }
  const encoded = readStringField(
    data,
    'encoded',
    'Encode and Decode Strings',
  )
  return splitDecodedPayloads ? encoded.split('#') : decodeMessages(encoded)
}

const encodeAndDecodeStringsOracle = defineProblemMissionOracle({
  problemId: 'problem:encode-and-decode-strings',
  solve(input: JsonValue): JsonValue {
    return runStringCodec(input, false)
  },
  mutants: [
    {
      id: 'splits-decoding-on-delimiter',
      description:
        'Splits on every delimiter instead of consuming the length-prefixed payload.',
      solve(input: JsonValue): JsonValue {
        return runStringCodec(input, true)
      },
    },
    {
      id: 'drops-empty-messages',
      description:
        'Treats empty messages as absent during encoding instead of preserving a zero-length payload.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Encode and Decode Strings')
        const action = readStringField(
          data,
          'action',
          'Encode and Decode Strings',
        )
        if (action === 'encode') {
          const messages = readStringArrayField(
            data,
            'messages',
            'Encode and Decode Strings',
          )
          return encodeMessages(
            messages.filter((message) => message.length > 0),
          )
        }
        if (action !== 'decode') {
          throw new TypeError(
            'Encode and Decode Strings.action must be "encode" or "decode"',
          )
        }
        return decodeMessages(
          readStringField(
            data,
            'encoded',
            'Encode and Decode Strings',
          ),
        )
      },
    },
  ],
})

function productsExceptSelf(
  input: JsonValue,
  prefixIncludesCurrent: boolean,
): JsonValue {
  const data = readJsonObject(input, 'Product of Array Except Self')
  const values = readNumberArrayField(
    data,
    'multipliers',
    'Product of Array Except Self',
    { integer: true },
  )
  const output = Array<number>(values.length).fill(1)
  let prefix = 1
  for (let index = 0; index < values.length; index += 1) {
    if (prefixIncludesCurrent) prefix *= values[index]
    output[index] = prefix
    if (!prefixIncludesCurrent) prefix *= values[index]
  }

  let suffix = 1
  for (let index = values.length - 1; index >= 0; index -= 1) {
    output[index] *= suffix
    suffix *= values[index]
  }
  return output
}

const productOfArrayExceptSelfOracle = defineProblemMissionOracle({
  problemId: 'problem:product-of-array-except-self',
  solve(input: JsonValue): JsonValue {
    return productsExceptSelf(input, false)
  },
  mutants: [
    {
      id: 'prefix-includes-current',
      description:
        'Updates the prefix before storing it, so each result includes its own value.',
      solve(input: JsonValue): JsonValue {
        return productsExceptSelf(input, true)
      },
    },
    {
      id: 'omits-suffix-pass',
      description:
        'Returns prefix products without combining values from the right side.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Product of Array Except Self')
        const values = readNumberArrayField(
          data,
          'multipliers',
          'Product of Array Except Self',
          { integer: true },
        )
        const output = Array<number>(values.length).fill(1)
        let prefix = 1
        for (let index = 0; index < values.length; index += 1) {
          output[index] = prefix
          prefix *= values[index]
        }
        return output
      },
    },
  ],
})

function readSudokuBoard(input: JsonValue): readonly (readonly string[])[] {
  const data = readJsonObject(input, 'Valid Sudoku')
  const rawBoard = data.board
  if (!Array.isArray(rawBoard) || rawBoard.length !== 4) {
    throw new TypeError('Valid Sudoku.board must be a 4x4 grid')
  }

  const board: string[][] = []
  for (const rawRow of rawBoard) {
    if (
      !Array.isArray(rawRow) ||
      rawRow.length !== 4 ||
      !rawRow.every(
        (cell): cell is string =>
          typeof cell === 'string' && /^[.1-4]$/.test(cell),
      )
    ) {
      throw new TypeError(
        'Valid Sudoku.board cells must be ".", "1", "2", "3", or "4"',
      )
    }
    board.push([...rawRow])
  }
  return board
}

function validateSudoku(
  input: JsonValue,
  checks: {
    readonly rows: boolean
    readonly columns: boolean
    readonly sectors: boolean
  },
): boolean {
  const board = readSudokuBoard(input)
  const rows = Array.from({ length: 4 }, () => new Set<string>())
  const columns = Array.from({ length: 4 }, () => new Set<string>())
  const sectors = Array.from({ length: 4 }, () => new Set<string>())

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const rune = board[row][column]
      if (rune === '.') continue
      const sector = Math.floor(row / 2) * 2 + Math.floor(column / 2)
      if (
        (checks.rows && rows[row].has(rune)) ||
        (checks.columns && columns[column].has(rune)) ||
        (checks.sectors && sectors[sector].has(rune))
      ) {
        return false
      }
      rows[row].add(rune)
      columns[column].add(rune)
      sectors[sector].add(rune)
    }
  }
  return true
}

const validSudokuOracle = defineProblemMissionOracle({
  problemId: 'problem:valid-sudoku',
  solve(input: JsonValue): JsonValue {
    return validateSudoku(input, {
      rows: true,
      columns: true,
      sectors: true,
    })
  },
  mutants: [
    {
      id: 'omits-sector-check',
      description:
        'Checks rows and columns but misses duplicates confined to one 2x2 sector.',
      solve(input: JsonValue): JsonValue {
        return validateSudoku(input, {
          rows: true,
          columns: true,
          sectors: false,
        })
      },
    },
    {
      id: 'omits-row-check',
      description:
        'Checks columns and sectors but misses duplicates separated across one row.',
      solve(input: JsonValue): JsonValue {
        return validateSudoku(input, {
          rows: false,
          columns: true,
          sectors: true,
        })
      },
    },
    {
      id: 'omits-column-check',
      description:
        'Checks rows and sectors but misses duplicates separated down one column.',
      solve(input: JsonValue): JsonValue {
        return validateSudoku(input, {
          rows: true,
          columns: false,
          sectors: true,
        })
      },
    },
  ],
})

function longestConsecutiveTrail(
  input: JsonValue,
  usesSuccessorBoundary: boolean,
): number {
  const data = readJsonObject(input, 'Longest Consecutive Sequence')
  const values = readNumberArrayField(
    data,
    'stones',
    'Longest Consecutive Sequence',
    { integer: true },
  )
  const stones = new Set(values)
  let best = 0

  for (const value of stones) {
    const isBoundary = usesSuccessorBoundary
      ? !stones.has(value + 1)
      : !stones.has(value - 1)
    if (!isBoundary) continue
    let length = 1
    while (stones.has(value + length)) length += 1
    best = Math.max(best, length)
  }
  return best
}

const longestConsecutiveSequenceOracle = defineProblemMissionOracle({
  problemId: 'problem:longest-consecutive-sequence',
  solve(input: JsonValue): JsonValue {
    return longestConsecutiveTrail(input, false)
  },
  mutants: [
    {
      id: 'starts-at-successor-boundary',
      description:
        'Starts at run ends while still walking forward, reducing every run to one.',
      solve(input: JsonValue): JsonValue {
        return longestConsecutiveTrail(input, true)
      },
    },
    {
      id: 'counts-duplicate-stones',
      description:
        'Counts duplicate reports as extra positions inside a consecutive run.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Longest Consecutive Sequence')
        const values = [
          ...readNumberArrayField(
            data,
            'stones',
            'Longest Consecutive Sequence',
            { integer: true },
          ),
        ].sort((first, second) => first - second)
        if (values.length === 0) return 0

        let current = 1
        let best = 1
        for (let index = 1; index < values.length; index += 1) {
          if (values[index] - values[index - 1] <= 1) current += 1
          else current = 1
          best = Math.max(best, current)
        }
        return best
      },
    },
  ],
})

const ALPHANUMERIC_CHARACTER = /^[\p{L}\p{N}]$/u

function validPalindrome(input: JsonValue, caseSensitive: boolean): boolean {
  const data = readJsonObject(input, 'Valid Palindrome')
  const signal = readStringField(data, 'signal', 'Valid Palindrome')
  const characters = [...signal]
  let left = 0
  let right = characters.length - 1

  while (left < right) {
    while (
      left < right &&
      !ALPHANUMERIC_CHARACTER.test(characters[left])
    ) {
      left += 1
    }
    while (
      left < right &&
      !ALPHANUMERIC_CHARACTER.test(characters[right])
    ) {
      right -= 1
    }
    const leftCharacter = caseSensitive
      ? characters[left]
      : characters[left].toLowerCase()
    const rightCharacter = caseSensitive
      ? characters[right]
      : characters[right].toLowerCase()
    if (leftCharacter !== rightCharacter) return false
    left += 1
    right -= 1
  }
  return true
}

const validPalindromeOracle = defineProblemMissionOracle({
  problemId: 'problem:valid-palindrome',
  solve(input: JsonValue): JsonValue {
    return validPalindrome(input, false)
  },
  mutants: [
    {
      id: 'case-sensitive-pairs',
      description:
        'Skips punctuation correctly but compares letter pairs without case folding.',
      solve(input: JsonValue): JsonValue {
        return validPalindrome(input, true)
      },
    },
    {
      id: 'skips-whitespace-only',
      description:
        'Ignores spaces but still compares punctuation as meaningful signal data.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Valid Palindrome')
        const characters = [
          ...readStringField(data, 'signal', 'Valid Palindrome'),
        ]
        let left = 0
        let right = characters.length - 1
        while (left < right) {
          while (left < right && /^\s$/u.test(characters[left])) left += 1
          while (left < right && /^\s$/u.test(characters[right])) right -= 1
          if (
            characters[left].toLowerCase() !==
            characters[right].toLowerCase()
          ) {
            return false
          }
          left += 1
          right -= 1
        }
        return true
      },
    },
  ],
})

function sortedTwoSum(input: JsonValue, zeroBasedOutput: boolean): JsonValue {
  const data = readJsonObject(input, 'Two Sum II')
  const strengths = readNumberArrayField(data, 'strengths', 'Two Sum II', {
    integer: true,
  })
  const target = readSafeIntegerField(data, 'target', 'Two Sum II')
  for (let index = 1; index < strengths.length; index += 1) {
    if (strengths[index] < strengths[index - 1]) {
      throw new TypeError('Two Sum II.strengths must be sorted')
    }
  }

  let left = 0
  let right = strengths.length - 1
  while (left < right) {
    const total = strengths[left] + strengths[right]
    if (total === target) {
      return zeroBasedOutput ? [left, right] : [left + 1, right + 1]
    }
    if (total < target) left += 1
    else right -= 1
  }
  throw new Error('Two Sum II input must contain a matching pair')
}

const twoSumIiInputArrayIsSortedOracle = defineProblemMissionOracle({
  problemId: 'problem:two-sum-ii-input-array-is-sorted',
  solve(input: JsonValue): JsonValue {
    return sortedTwoSum(input, false)
  },
  mutants: [
    {
      id: 'returns-zero-based-slots',
      description:
        'Returns internal array indices without converting them to one-based slots.',
      solve(input: JsonValue): JsonValue {
        return sortedTwoSum(input, true)
      },
    },
    {
      id: 'moves-wrong-boundary',
      description:
        'Lowers a small sum and raises a large sum by moving the opposite pointer.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Two Sum II')
        const strengths = readNumberArrayField(
          data,
          'strengths',
          'Two Sum II',
          { integer: true },
        )
        const target = readSafeIntegerField(data, 'target', 'Two Sum II')
        for (let index = 1; index < strengths.length; index += 1) {
          if (strengths[index] < strengths[index - 1]) {
            throw new TypeError('Two Sum II.strengths must be sorted')
          }
        }

        let left = 0
        let right = strengths.length - 1
        while (left < right) {
          const total = strengths[left] + strengths[right]
          if (total === target) return [left + 1, right + 1]
          if (total < target) right -= 1
          else left += 1
        }
        return []
      },
    },
  ],
})

function threeSum(input: JsonValue, skipFixedDuplicates: boolean): JsonValue {
  const data = readJsonObject(input, '3Sum')
  const charges = [
    ...readNumberArrayField(data, 'charges', '3Sum', { integer: true }),
  ].sort((first, second) => first - second)
  const answer: number[][] = []

  for (let fixed = 0; fixed < charges.length - 2; fixed += 1) {
    if (
      skipFixedDuplicates &&
      fixed > 0 &&
      charges[fixed] === charges[fixed - 1]
    ) {
      continue
    }
    let left = fixed + 1
    let right = charges.length - 1
    while (left < right) {
      const total = charges[fixed] + charges[left] + charges[right]
      if (total < 0) {
        left += 1
      } else if (total > 0) {
        right -= 1
      } else {
        answer.push([charges[fixed], charges[left], charges[right]])
        left += 1
        right -= 1
        while (left < right && charges[left] === charges[left - 1]) {
          left += 1
        }
        while (left < right && charges[right] === charges[right + 1]) {
          right -= 1
        }
      }
    }
  }
  return answer
}

const threeSumOracle = defineProblemMissionOracle({
  problemId: 'problem:3sum',
  solve(input: JsonValue): JsonValue {
    return threeSum(input, true)
  },
  mutants: [
    {
      id: 'repeats-fixed-values',
      description:
        'Runs the pair search for duplicate fixed values, repeating valid triplets.',
      solve(input: JsonValue): JsonValue {
        return threeSum(input, false)
      },
    },
    {
      id: 'moves-pair-pointers-backward',
      description:
        'Moves right for a small total and left for a large total, steering away from zero.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, '3Sum')
        const charges = [
          ...readNumberArrayField(data, 'charges', '3Sum', {
            integer: true,
          }),
        ].sort((first, second) => first - second)
        const answer: number[][] = []

        for (let fixed = 0; fixed < charges.length - 2; fixed += 1) {
          if (fixed > 0 && charges[fixed] === charges[fixed - 1]) continue
          let left = fixed + 1
          let right = charges.length - 1
          while (left < right) {
            const total = charges[fixed] + charges[left] + charges[right]
            if (total < 0) {
              right -= 1
            } else if (total > 0) {
              left += 1
            } else {
              answer.push([charges[fixed], charges[left], charges[right]])
              left += 1
              right -= 1
              while (
                left < right &&
                charges[left] === charges[left - 1]
              ) {
                left += 1
              }
              while (
                left < right &&
                charges[right] === charges[right + 1]
              ) {
                right -= 1
              }
            }
          }
        }
        return answer
      },
    },
  ],
})

function largestContainer(input: JsonValue, moveTaller: boolean): number {
  const data = readJsonObject(input, 'Container With Most Water')
  const heights = readNumberArrayField(
    data,
    'masts',
    'Container With Most Water',
    { integer: true, nonNegative: true },
  )
  let left = 0
  let right = heights.length - 1
  let best = 0

  while (left < right) {
    best = Math.max(
      best,
      (right - left) * Math.min(heights[left], heights[right]),
    )
    if (moveTaller) {
      if (heights[left] <= heights[right]) right -= 1
      else left += 1
    } else if (heights[left] <= heights[right]) {
      left += 1
    } else {
      right -= 1
    }
  }
  return best
}

const containerWithMostWaterOracle = defineProblemMissionOracle({
  problemId: 'problem:container-with-most-water',
  solve(input: JsonValue): JsonValue {
    return largestContainer(input, false)
  },
  mutants: [
    {
      id: 'moves-taller-boundary',
      description:
        'Discards the taller mast, preserving the current height bottleneck as width shrinks.',
      solve(input: JsonValue): JsonValue {
        return largestContainer(input, true)
      },
    },
    {
      id: 'uses-taller-height',
      description:
        'Uses the taller mast as usable height instead of the shorter limiting boundary.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Container With Most Water')
        const heights = readNumberArrayField(
          data,
          'masts',
          'Container With Most Water',
          { integer: true, nonNegative: true },
        )
        let left = 0
        let right = heights.length - 1
        let best = 0
        while (left < right) {
          best = Math.max(
            best,
            (right - left) * Math.max(heights[left], heights[right]),
          )
          if (heights[left] <= heights[right]) left += 1
          else right -= 1
        }
        return best
      },
    },
  ],
})

function trappedRainWater(
  input: JsonValue,
  stopWhenAdjacent: boolean,
): number {
  const data = readJsonObject(input, 'Trapping Rain Water')
  const heights = readNumberArrayField(
    data,
    'elevations',
    'Trapping Rain Water',
    { integer: true, nonNegative: true },
  )
  let left = 0
  let right = heights.length - 1
  let leftMaximum = 0
  let rightMaximum = 0
  let water = 0

  while (stopWhenAdjacent ? left + 1 < right : left < right) {
    if (heights[left] <= heights[right]) {
      leftMaximum = Math.max(leftMaximum, heights[left])
      water += leftMaximum - heights[left]
      left += 1
    } else {
      rightMaximum = Math.max(rightMaximum, heights[right])
      water += rightMaximum - heights[right]
      right -= 1
    }
  }
  return water
}

const trappingRainWaterOracle = defineProblemMissionOracle({
  problemId: 'problem:trapping-rain-water',
  solve(input: JsonValue): JsonValue {
    return trappedRainWater(input, false)
  },
  mutants: [
    {
      id: 'stops-when-adjacent',
      description:
        'Stops with adjacent pointers, leaving one still-trappable boundary unresolved.',
      solve(input: JsonValue): JsonValue {
        return trappedRainWater(input, true)
      },
    },
    {
      id: 'resolves-higher-side',
      description:
        'Advances the higher boundary first, before the opposite side safely seals it.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Trapping Rain Water')
        const heights = readNumberArrayField(
          data,
          'elevations',
          'Trapping Rain Water',
          { integer: true, nonNegative: true },
        )
        let left = 0
        let right = heights.length - 1
        let leftMaximum = 0
        let rightMaximum = 0
        let water = 0
        while (left < right) {
          if (heights[left] <= heights[right]) {
            rightMaximum = Math.max(rightMaximum, heights[right])
            water += rightMaximum - heights[right]
            right -= 1
          } else {
            leftMaximum = Math.max(leftMaximum, heights[left])
            water += leftMaximum - heights[left]
            left += 1
          }
        }
        return water
      },
    },
  ],
})

function bestStockProfit(input: JsonValue, ignoresTimeOrder: boolean): number {
  const data = readJsonObject(input, 'Best Time to Buy and Sell Stock')
  const prices = readNumberArrayField(
    data,
    'prices',
    'Best Time to Buy and Sell Stock',
    { integer: true, nonNegative: true },
  )
  if (prices.length < 2) return 0

  if (ignoresTimeOrder) {
    let minimum = prices[0]
    let maximum = prices[0]
    for (const price of prices) {
      minimum = Math.min(minimum, price)
      maximum = Math.max(maximum, price)
    }
    return maximum - minimum
  }

  let cheapest = prices[0]
  let best = 0
  for (let index = 1; index < prices.length; index += 1) {
    best = Math.max(best, prices[index] - cheapest)
    cheapest = Math.min(cheapest, prices[index])
  }
  return best
}

const bestTimeToBuyAndSellStockOracle = defineProblemMissionOracle({
  problemId: 'problem:best-time-to-buy-and-sell-stock',
  solve(input: JsonValue): JsonValue {
    return bestStockProfit(input, false)
  },
  mutants: [
    {
      id: 'ignores-buy-sell-order',
      description:
        'Subtracts global extrema, even when the minimum occurs after the maximum.',
      solve(input: JsonValue): JsonValue {
        return bestStockProfit(input, true)
      },
    },
    {
      id: 'allows-negative-profit',
      description:
        'Initializes from a losing trade instead of preserving the option to skip trading.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Best Time to Buy and Sell Stock')
        const prices = readNumberArrayField(
          data,
          'prices',
          'Best Time to Buy and Sell Stock',
          { integer: true, nonNegative: true },
        )
        if (prices.length < 2) return 0

        let cheapest = prices[0]
        let best = prices[1] - prices[0]
        for (let index = 1; index < prices.length; index += 1) {
          best = Math.max(best, prices[index] - cheapest)
          cheapest = Math.min(cheapest, prices[index])
        }
        return best
      },
    },
  ],
})

function longestDistinctSubstring(
  input: JsonValue,
  clearOnDuplicate: boolean,
): number {
  const data = readJsonObject(
    input,
    'Longest Substring Without Repeating Characters',
  )
  const route = [
    ...readStringField(
      data,
      'route',
      'Longest Substring Without Repeating Characters',
    ),
  ]
  const inside = new Set<string>()
  let left = 0
  let best = 0

  for (let right = 0; right < route.length; right += 1) {
    const symbol = route[right]
    if (clearOnDuplicate && inside.has(symbol)) {
      inside.clear()
      left = right
    } else {
      while (inside.has(symbol)) {
        inside.delete(route[left])
        left += 1
      }
    }
    inside.add(symbol)
    best = Math.max(best, right - left + 1)
  }
  return best
}

const longestSubstringWithoutRepeatingCharactersOracle =
  defineProblemMissionOracle({
    problemId: 'problem:longest-substring-without-repeating-characters',
    solve(input: JsonValue): JsonValue {
      return longestDistinctSubstring(input, false)
    },
    mutants: [
      {
        id: 'clears-window-on-duplicate',
        description:
          'Clears the whole window on a repeat, discarding a valid suffix that could keep growing.',
        solve(input: JsonValue): JsonValue {
          return longestDistinctSubstring(input, true)
        },
      },
      {
        id: 'omits-inclusive-endpoint',
        description:
          'Measures right - left and drops one character from every inclusive window length.',
        solve(input: JsonValue): JsonValue {
          const data = readJsonObject(
            input,
            'Longest Substring Without Repeating Characters',
          )
          const route = [
            ...readStringField(
              data,
              'route',
              'Longest Substring Without Repeating Characters',
            ),
          ]
          const inside = new Set<string>()
          let left = 0
          let best = 0
          for (let right = 0; right < route.length; right += 1) {
            const symbol = route[right]
            while (inside.has(symbol)) {
              inside.delete(route[left])
              left += 1
            }
            inside.add(symbol)
            best = Math.max(best, right - left)
          }
          return best
        },
      },
    ],
  })

function longestRepeatingReplacement(
  input: JsonValue,
  exactBudgetIsInvalid: boolean,
): number {
  const data = readJsonObject(
    input,
    'Longest Repeating Character Replacement',
  )
  const notes = [
    ...readStringField(
      data,
      'chorus',
      'Longest Repeating Character Replacement',
    ),
  ]
  const k = readNonNegativeIntegerField(
    data,
    'k',
    'Longest Repeating Character Replacement',
  )
  const counts = new Map<string, number>()
  let left = 0
  let best = 0
  let maximumCount = 0

  for (let right = 0; right < notes.length; right += 1) {
    const note = notes[right]
    const count = (counts.get(note) ?? 0) + 1
    counts.set(note, count)
    maximumCount = Math.max(maximumCount, count)

    const exceedsBudget = (): boolean => {
      const replacements = right - left + 1 - maximumCount
      return exactBudgetIsInvalid ? replacements >= k : replacements > k
    }
    while (left <= right && exceedsBudget()) {
      const outgoing = notes[left]
      counts.set(outgoing, (counts.get(outgoing) ?? 0) - 1)
      left += 1
    }
    best = Math.max(best, right - left + 1)
  }
  return best
}

const longestRepeatingCharacterReplacementOracle =
  defineProblemMissionOracle({
    problemId: 'problem:longest-repeating-character-replacement',
    solve(input: JsonValue): JsonValue {
      return longestRepeatingReplacement(input, false)
    },
    mutants: [
      {
        id: 'treats-budget-as-exclusive',
        description:
          'Shrinks when changes equal k, incorrectly allowing fewer than the stated budget.',
        solve(input: JsonValue): JsonValue {
          return longestRepeatingReplacement(input, true)
        },
      },
      {
        id: 'uses-distinct-count-as-cost',
        description:
          'Treats the number of distinct notes as the retune cost instead of counting nonmajority notes.',
        solve(input: JsonValue): JsonValue {
          const data = readJsonObject(
            input,
            'Longest Repeating Character Replacement',
          )
          const notes = [
            ...readStringField(
              data,
              'chorus',
              'Longest Repeating Character Replacement',
            ),
          ]
          const k = readNonNegativeIntegerField(
            data,
            'k',
            'Longest Repeating Character Replacement',
          )
          const counts = new Map<string, number>()
          let left = 0
          let best = 0
          for (let right = 0; right < notes.length; right += 1) {
            const incoming = notes[right]
            counts.set(incoming, (counts.get(incoming) ?? 0) + 1)
            while (counts.size > k) {
              const outgoing = notes[left]
              const remaining = (counts.get(outgoing) ?? 0) - 1
              if (remaining === 0) counts.delete(outgoing)
              else counts.set(outgoing, remaining)
              left += 1
            }
            best = Math.max(best, right - left + 1)
          }
          return best
        },
      },
    ],
  })

function sameCounts(first: readonly number[], second: readonly number[]) {
  return first.every((count, index) => count === second[index])
}

function lowercaseLetterIndex(character: string): number {
  return character.charCodeAt(0) - 97
}

function containsPermutation(
  input: JsonValue,
  keepsOutgoingLetters: boolean,
): boolean {
  const data = readJsonObject(input, 'Permutation in String')
  const key = [
    ...readStringField(data, 'key', 'Permutation in String', true),
  ]
  const channel = [
    ...readStringField(data, 'channel', 'Permutation in String', true),
  ]
  if (key.length > channel.length) return false

  const needed = Array<number>(26).fill(0)
  const window = Array<number>(26).fill(0)
  for (let index = 0; index < key.length; index += 1) {
    needed[lowercaseLetterIndex(key[index])] += 1
    window[lowercaseLetterIndex(channel[index])] += 1
  }
  if (sameCounts(needed, window)) return true

  for (let right = key.length; right < channel.length; right += 1) {
    window[lowercaseLetterIndex(channel[right])] += 1
    if (!keepsOutgoingLetters) {
      window[lowercaseLetterIndex(channel[right - key.length])] -= 1
    }
    if (sameCounts(needed, window)) return true
  }
  return false
}

const permutationInStringOracle = defineProblemMissionOracle({
  problemId: 'problem:permutation-in-string',
  solve(input: JsonValue): JsonValue {
    return containsPermutation(input, false)
  },
  mutants: [
    {
      id: 'keeps-outgoing-letters',
      description:
        'Adds each incoming letter without removing the outgoing one, so the window grows.',
      solve(input: JsonValue): JsonValue {
        return containsPermutation(input, true)
      },
    },
    {
      id: 'compares-distinct-letters-only',
      description:
        'Accepts a window with the right letter set even when repeated counts differ.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Permutation in String')
        const key = [
          ...readStringField(data, 'key', 'Permutation in String', true),
        ]
        const channel = [
          ...readStringField(
            data,
            'channel',
            'Permutation in String',
            true,
          ),
        ]
        if (key.length > channel.length) return false

        const needed = new Set(key)
        for (
          let left = 0;
          left + key.length <= channel.length;
          left += 1
        ) {
          const window = new Set(channel.slice(left, left + key.length))
          if (
            window.size === needed.size &&
            [...needed].every((character) => window.has(character))
          ) {
            return true
          }
        }
        return false
      },
    },
  ],
})

function minimumCoveringWindow(
  input: JsonValue,
  ignoresRequiredCopies: boolean,
): string {
  const data = readJsonObject(input, 'Minimum Window Substring')
  const source = [
    ...readStringField(data, 'source', 'Minimum Window Substring'),
  ]
  const required = [
    ...readStringField(data, 'required', 'Minimum Window Substring'),
  ]
  if (required.length === 0) return ''

  const needed = new Map<string, number>()
  for (const character of required) {
    needed.set(
      character,
      ignoresRequiredCopies ? 1 : (needed.get(character) ?? 0) + 1,
    )
  }

  const window = new Map<string, number>()
  let formed = 0
  let left = 0
  let bestStart = -1
  let bestLength = Number.POSITIVE_INFINITY

  for (let right = 0; right < source.length; right += 1) {
    const incoming = source[right]
    const incomingCount = (window.get(incoming) ?? 0) + 1
    window.set(incoming, incomingCount)
    if (needed.has(incoming) && incomingCount === needed.get(incoming)) {
      formed += 1
    }

    while (formed === needed.size) {
      const length = right - left + 1
      if (length < bestLength) {
        bestStart = left
        bestLength = length
      }
      const outgoing = source[left]
      const outgoingCount = (window.get(outgoing) ?? 0) - 1
      window.set(outgoing, outgoingCount)
      left += 1
      if (needed.has(outgoing) && outgoingCount < (needed.get(outgoing) ?? 0)) {
        formed -= 1
      }
    }
  }

  return bestStart < 0
    ? ''
    : source.slice(bestStart, bestStart + bestLength).join('')
}

const minimumWindowSubstringOracle = defineProblemMissionOracle({
  problemId: 'problem:minimum-window-substring',
  solve(input: JsonValue): JsonValue {
    return minimumCoveringWindow(input, false)
  },
  mutants: [
    {
      id: 'ignores-required-copies',
      description:
        'Tracks only required character presence, accepting too few repeated copies.',
      solve(input: JsonValue): JsonValue {
        return minimumCoveringWindow(input, true)
      },
    },
    {
      id: 'returns-first-covering-prefix',
      description:
        'Stops at the first valid right edge without shrinking away unnecessary leading characters.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Minimum Window Substring')
        const source = [
          ...readStringField(data, 'source', 'Minimum Window Substring'),
        ]
        const required = [
          ...readStringField(data, 'required', 'Minimum Window Substring'),
        ]
        if (required.length === 0) return ''

        const needed = new Map<string, number>()
        for (const character of required) {
          needed.set(character, (needed.get(character) ?? 0) + 1)
        }
        const window = new Map<string, number>()
        let formed = 0
        for (let right = 0; right < source.length; right += 1) {
          const incoming = source[right]
          const count = (window.get(incoming) ?? 0) + 1
          window.set(incoming, count)
          if (needed.has(incoming) && count === needed.get(incoming)) {
            formed += 1
          }
          if (formed === needed.size) {
            return source.slice(0, right + 1).join('')
          }
        }
        return ''
      },
    },
  ],
})

function slidingWindowMaximum(
  input: JsonValue,
  expiresOneStepLate: boolean,
): JsonValue {
  const data = readJsonObject(input, 'Sliding Window Maximum')
  const readings = readNumberArrayField(
    data,
    'readings',
    'Sliding Window Maximum',
    { integer: true },
  )
  const k = readPositiveIntegerField(data, 'k', 'Sliding Window Maximum')
  if (k > readings.length) {
    throw new TypeError(
      'Sliding Window Maximum.k cannot exceed the reading count',
    )
  }

  const candidates: number[] = []
  const answer: number[] = []
  let head = 0
  for (let right = 0; right < readings.length; right += 1) {
    const expirationBoundary = right - k
    while (
      head < candidates.length &&
      (expiresOneStepLate
        ? candidates[head] < expirationBoundary
        : candidates[head] <= expirationBoundary)
    ) {
      head += 1
    }
    while (
      candidates.length > head &&
      readings[candidates[candidates.length - 1]] <= readings[right]
    ) {
      candidates.pop()
    }
    candidates.push(right)
    if (right >= k - 1) answer.push(readings[candidates[head]])
  }
  return answer
}

const slidingWindowMaximumOracle = defineProblemMissionOracle({
  problemId: 'problem:sliding-window-maximum',
  solve(input: JsonValue): JsonValue {
    return slidingWindowMaximum(input, false)
  },
  mutants: [
    {
      id: 'expires-front-one-step-late',
      description:
        'Keeps the front index for one window after it has crossed the left boundary.',
      solve(input: JsonValue): JsonValue {
        return slidingWindowMaximum(input, true)
      },
    },
    {
      id: 'removes-stronger-candidates',
      description:
        'Maintains an increasing deque by removing stronger values, exposing window minima.',
      solve(input: JsonValue): JsonValue {
        const data = readJsonObject(input, 'Sliding Window Maximum')
        const readings = readNumberArrayField(
          data,
          'readings',
          'Sliding Window Maximum',
          { integer: true },
        )
        const k = readPositiveIntegerField(
          data,
          'k',
          'Sliding Window Maximum',
        )
        if (k > readings.length) {
          throw new TypeError(
            'Sliding Window Maximum.k cannot exceed the reading count',
          )
        }

        const candidates: number[] = []
        const answer: number[] = []
        let head = 0
        for (let right = 0; right < readings.length; right += 1) {
          while (
            head < candidates.length &&
            candidates[head] <= right - k
          ) {
            head += 1
          }
          while (
            candidates.length > head &&
            readings[candidates[candidates.length - 1]] >= readings[right]
          ) {
            candidates.pop()
          }
          candidates.push(right)
          if (right >= k - 1) answer.push(readings[candidates[head]])
        }
        return answer
      },
    },
  ],
})

/** Realm agents add one entry per mission and leave other realm files untouched. */
export const REALM_1_PROBLEM_MISSION_ORACLES =
  defineProblemMissionOracleRegistry({
    'problem:contains-duplicate': containsDuplicateOracle,
    'problem:valid-anagram': validAnagramOracle,
    'problem:two-sum': twoSumOracle,
    'problem:group-anagrams': groupAnagramsOracle,
    'problem:top-k-frequent-elements': topKFrequentElementsOracle,
    'problem:encode-and-decode-strings': encodeAndDecodeStringsOracle,
    'problem:product-of-array-except-self': productOfArrayExceptSelfOracle,
    'problem:valid-sudoku': validSudokuOracle,
    'problem:longest-consecutive-sequence': longestConsecutiveSequenceOracle,
    'problem:valid-palindrome': validPalindromeOracle,
    'problem:two-sum-ii-input-array-is-sorted':
      twoSumIiInputArrayIsSortedOracle,
    'problem:3sum': threeSumOracle,
    'problem:container-with-most-water': containerWithMostWaterOracle,
    'problem:trapping-rain-water': trappingRainWaterOracle,
    'problem:best-time-to-buy-and-sell-stock':
      bestTimeToBuyAndSellStockOracle,
    'problem:longest-substring-without-repeating-characters':
      longestSubstringWithoutRepeatingCharactersOracle,
    'problem:longest-repeating-character-replacement':
      longestRepeatingCharacterReplacementOracle,
    'problem:permutation-in-string': permutationInStringOracle,
    'problem:minimum-window-substring': minimumWindowSubstringOracle,
    'problem:sliding-window-maximum': slidingWindowMaximumOracle,
  })
