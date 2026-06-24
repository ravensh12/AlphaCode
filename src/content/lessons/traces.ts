import type {
  ConceptId,
  DiagramSpec,
  LessonSection,
  LessonStep,
  TraceFrame,
  VariableValue,
} from '../../types/lesson'
import { fb, numTiles, shuffle } from './shared'

function textMode(expected: Record<string, VariableValue>): boolean {
  return Object.values(expected).some(
    (v) => typeof v === 'string' && Number.isNaN(Number(v)),
  )
}

export function resolveStepFrame(step: LessonStep, frameIndex: number): LessonStep {
  const frame = step.traceFrames?.[frameIndex]
  if (!frame) return step
  return {
    ...step,
    prompt: frame.prompt,
    currentLineIndex: frame.currentLineIndex,
    diagram: frame.diagram ?? step.diagram,
    variables: frame.variables,
    targetVariables: frame.targetVariables,
    expectedState: frame.expectedState,
    feedback: frame.feedback,
    answerTiles: frame.answerTiles,
    inputMode: textMode(frame.expectedState) ? 'text' : 'numeric',
  }
}

export function arrayDiagram(
  values: (number | string)[],
  highlight?: number,
  pointers?: { index: number; label: string }[],
  visited?: number[],
): DiagramSpec {
  return { kind: 'array', values, highlight, pointers, visited }
}

export function stringDiagram(
  chars: string,
  pointers?: { index: number; label: string }[],
  visited?: number[],
): DiagramSpec {
  return { kind: 'string', chars, pointers, visited }
}

function traceStep(
  id: string,
  code: string[],
  frames: TraceFrame[],
  tags: ConceptId[],
  section: LessonSection,
  phaseLabel: LessonStep['phaseLabel'],
  hints?: string[],
): LessonStep {
  const first = frames[0]
  return {
    id,
    type: 'traceVariables',
    section,
    phaseLabel,
    prompt: first.prompt,
    code,
    currentLineIndex: first.currentLineIndex,
    variables: first.variables,
    targetVariables: first.targetVariables,
    expectedState: first.expectedState,
    feedback: first.feedback,
    answerTiles: first.answerTiles,
    inputMode: textMode(first.expectedState) ? 'text' : 'numeric',
    conceptTags: tags,
    diagram: first.diagram,
    traceFrames: frames,
    hints,
  }
}

/** Walk through find-max line by line — nums must be a fixed, verified array. */
export function buildFindMaxTrace(
  nums: number[],
  id: string,
  section: LessonSection,
  phaseLabel: LessonStep['phaseLabel'] = section === 'teach' ? 'Visual' : 'Quiz',
): LessonStep {
  const numsStr = `[${nums.join(', ')}]`
  const code = [
    `nums = ${numsStr}`,
    'largest = nums[0]',
    'for num in nums:',
    '    if num > largest:',
    '        largest = num',
  ]
  const frames: TraceFrame[] = []
  let largest = nums[0]

  frames.push({
    currentLineIndex: 1,
    prompt: 'Run line 2: `largest = nums[0]`. What value is stored in largest?',
    diagram: arrayDiagram(nums, 0, [{ index: 0, label: 'nums[0]' }]),
    variables: ['largest'],
    targetVariables: ['largest'],
    expectedState: { largest: nums[0] },
    feedback: fb(
      `Correct — nums[0] is ${nums[0]}.`,
      'Read the value at index 0.',
      `nums[0] = ${nums[0]}.`,
    ),
    answerTiles: numTiles(nums[0]),
    runLabel: 'Run line',
  })

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i]
    const visited = Array.from({ length: i }, (_, j) => j)

    frames.push({
      currentLineIndex: 2,
      prompt: `The loop visits index ${i}. What is num?`,
      diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
      variables: ['num', 'largest'],
      targetVariables: ['num'],
      expectedState: { num, largest },
      feedback: fb(
        `Correct — nums[${i}] is ${num}.`,
        `Look at the highlighted cell (index ${i}).`,
        `nums[${i}] = ${num}.`,
      ),
      answerTiles: numTiles(num),
      runLabel: 'Run line',
    })

    if (num > largest) {
      frames.push({
        currentLineIndex: 4,
        prompt: `${num} > ${largest}, so the if is True. What does largest become?`,
        diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
        variables: ['num', 'largest'],
        targetVariables: ['largest'],
        expectedState: { num, largest: num },
        feedback: fb(
          `Correct — largest updates to ${num}.`,
          `${num} is bigger than the old largest (${largest}).`,
          `largest = ${num}.`,
        ),
        answerTiles: numTiles(num),
        runLabel: 'Run line',
      })
      largest = num
    } else {
      frames.push({
        currentLineIndex: 3,
        prompt: `Is ${num} > ${largest}? The if is False — largest stays the same. What is largest?`,
        diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
        variables: ['num', 'largest'],
        targetVariables: ['largest'],
        expectedState: { num, largest },
        feedback: fb(
          `Correct — largest stays ${largest}.`,
          'When the if is False, we skip the update.',
          `Still ${largest}.`,
        ),
        answerTiles: numTiles(largest),
        runLabel: 'Run line',
      })
    }
  }

  frames.push({
    currentLineIndex: 2,
    prompt: 'The loop finished scanning every element. What is the final largest?',
    diagram: arrayDiagram(
      nums,
      nums.indexOf(largest),
      undefined,
      nums.map((_, i) => i),
    ),
    variables: ['largest'],
    targetVariables: ['largest'],
    expectedState: { largest },
    feedback: fb(
      `Correct — the maximum is ${largest}.`,
      'Which value won after visiting every index?',
      `The max in this list is ${largest}.`,
    ),
    answerTiles: numTiles(largest),
    runLabel: 'Finish trace',
  })

  return traceStep(id, code, frames, ['arrays', 'loops'], section, phaseLabel)
}

/** Walk through find-min — same scan pattern, flipped comparison. */
export function buildFindMinTrace(
  nums: number[],
  id: string,
  section: LessonSection,
): LessonStep {
  const numsStr = `[${nums.join(', ')}]`
  const code = [
    `nums = ${numsStr}`,
    'smallest = nums[0]',
    'for num in nums:',
    '    if num < smallest:',
    '        smallest = num',
  ]
  const frames: TraceFrame[] = []
  let smallest = nums[0]

  frames.push({
    currentLineIndex: 1,
    prompt: 'Run line 2: `smallest = nums[0]`. What value is stored?',
    diagram: arrayDiagram(nums, 0, [{ index: 0, label: 'nums[0]' }]),
    variables: ['smallest'],
    targetVariables: ['smallest'],
    expectedState: { smallest: nums[0] },
    feedback: fb(
      `Correct — nums[0] is ${nums[0]}.`,
      'Start with the first list item.',
      `smallest = ${nums[0]}.`,
    ),
    answerTiles: numTiles(nums[0]),
  })

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i]
    const visited = Array.from({ length: i }, (_, j) => j)

    frames.push({
      currentLineIndex: 2,
      prompt: `Loop at index ${i}. What is num?`,
      diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
      variables: ['num', 'smallest'],
      targetVariables: ['num'],
      expectedState: { num, smallest },
      feedback: fb(
        `Correct — nums[${i}] is ${num}.`,
        `Read index ${i}.`,
        `num = ${num}.`,
      ),
      answerTiles: numTiles(num),
    })

    if (num < smallest) {
      frames.push({
        currentLineIndex: 4,
        prompt: `${num} < ${smallest} — update smallest. What is the new value?`,
        diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
        variables: ['num', 'smallest'],
        targetVariables: ['smallest'],
        expectedState: { num, smallest: num },
        feedback: fb(
          `Correct — smallest becomes ${num}.`,
          `${num} is less than the old smallest.`,
          `smallest = ${num}.`,
        ),
        answerTiles: numTiles(num),
      })
      smallest = num
    } else {
      frames.push({
        currentLineIndex: 3,
        prompt: `${num} is not less than ${smallest}. What stays in smallest?`,
        diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
        variables: ['num', 'smallest'],
        targetVariables: ['smallest'],
        expectedState: { num, smallest },
        feedback: fb(
          `Correct — smallest stays ${smallest}.`,
          'No update when the if is False.',
          `Still ${smallest}.`,
        ),
        answerTiles: numTiles(smallest),
      })
    }
  }

  frames.push({
    currentLineIndex: 2,
    prompt: 'Scan complete. What is the final smallest?',
    diagram: arrayDiagram(
      nums,
      nums.indexOf(smallest),
      undefined,
      nums.map((_, i) => i),
    ),
    variables: ['smallest'],
    targetVariables: ['smallest'],
    expectedState: { smallest },
    feedback: fb(
      `Correct — the minimum is ${smallest}.`,
      'Which value is smallest after the full scan?',
      `The min is ${smallest}.`,
    ),
    answerTiles: numTiles(smallest),
  })

  return traceStep(
    id,
    code,
    frames,
    ['arrays', 'loops'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
  )
}

/** Count evens by visiting each index — nums must be fixed. */
export function buildCountEvensTrace(
  nums: number[],
  id: string,
  section: LessonSection,
  hints?: string[],
): LessonStep {
  const numsStr = `[${nums.join(', ')}]`
  const code = [
    `nums = ${numsStr}`,
    'count = 0',
    'for num in nums:',
    '    if num % 2 == 0:',
    '        count += 1',
  ]
  const frames: TraceFrame[] = []
  let count = 0

  frames.push({
    currentLineIndex: 1,
    prompt: 'Run line 2: `count = 0`. What is count before the loop starts?',
    diagram: arrayDiagram(nums),
    variables: ['count'],
    targetVariables: ['count'],
    expectedState: { count: 0 },
    feedback: fb(
      'Correct — count starts at 0.',
      'We have not counted any evens yet.',
      'count = 0 before the loop.',
    ),
    answerTiles: numTiles(0, [1, 2, 3]),
  })

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i]
    const isEven = num % 2 === 0
    const visited = Array.from({ length: i }, (_, j) => j)

    frames.push({
      currentLineIndex: 2,
      prompt: `Loop at index ${i}. What is num?`,
      diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
      variables: ['num', 'count'],
      targetVariables: ['num'],
      expectedState: { num, count },
      feedback: fb(
        `Correct — nums[${i}] is ${num}.`,
        `Read the cell at index ${i}.`,
        `num = ${num}.`,
      ),
      answerTiles: numTiles(num),
    })

    if (isEven) {
      count += 1
      frames.push({
        currentLineIndex: 4,
        prompt: `${num} % 2 == 0 is True — we add 1 to count. What is count now?`,
        diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
        variables: ['num', 'count'],
        targetVariables: ['count'],
        expectedState: { num, count },
        feedback: fb(
          `Correct — count is now ${count}.`,
          `${num} is even, so increment count.`,
          `count = ${count}.`,
        ),
        answerTiles: numTiles(count),
      })
    } else {
      frames.push({
        currentLineIndex: 3,
        prompt: `${num} % 2 == 0 is False — count does not change. What is count?`,
        diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }], visited),
        variables: ['num', 'count'],
        targetVariables: ['count'],
        expectedState: { num, count },
        feedback: fb(
          `Correct — count stays ${count}.`,
          `${num} is odd, so we skip count += 1.`,
          `Still ${count}.`,
        ),
        answerTiles: numTiles(count),
      })
    }
  }

  frames.push({
    currentLineIndex: 2,
    prompt: 'Loop finished. How many even numbers total?',
    diagram: arrayDiagram(nums, undefined, undefined, nums.map((_, i) => i)),
    variables: ['count'],
    targetVariables: ['count'],
    expectedState: { count },
    feedback: fb(
      `Correct — there are ${count} even number(s).`,
      'Count how many times count was incremented.',
      `Total evens: ${count}.`,
    ),
    answerTiles: numTiles(count, [count + 1, count + 2, 0]),
  })

  return traceStep(
    id,
    code,
    frames,
    ['arrays', 'loops'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
    hints,
  )
}

/** Trace vowel counting character by character. */
export function buildVowelCountTrace(
  word: string,
  id: string,
  section: LessonSection,
): LessonStep {
  const vowels = new Set(['a', 'e', 'i', 'o', 'u'])
  const code = [
    `s = "${word}"`,
    'count = 0',
    'for ch in s:',
    '    if ch in "aeiou":',
    '        count += 1',
  ]
  const frames: TraceFrame[] = []
  let count = 0

  frames.push({
    currentLineIndex: 1,
    prompt: 'Run line 2: `count = 0`. What is count before we start?',
    diagram: stringDiagram(word),
    variables: ['count'],
    targetVariables: ['count'],
    expectedState: { count: 0 },
    feedback: fb('Correct — count starts at 0.', 'No vowels counted yet.', 'count = 0.'),
    answerTiles: numTiles(0, [1, 2]),
  })

  for (let i = 0; i < word.length; i++) {
    const ch = word[i]
    const isVowel = vowels.has(ch)
    const visited = Array.from({ length: i }, (_, j) => j)

    frames.push({
      currentLineIndex: 2,
      prompt: `Loop at index ${i}. What character is ch?`,
      diagram: stringDiagram(word, [{ index: i, label: 'ch' }], visited),
      variables: ['ch', 'count'],
      targetVariables: ['ch'],
      expectedState: { ch, count },
      feedback: fb(
        `Correct — s[${i}] is "${ch}".`,
        `Read the letter at index ${i}.`,
        `ch = "${ch}".`,
      ),
      answerTiles: shuffle([...new Set([ch, 'a', 'e', 'x', 'z'])].slice(0, 8)),
    })

    if (isVowel) {
      count += 1
      frames.push({
        currentLineIndex: 4,
        prompt: `"${ch}" is a vowel — count goes up by 1. What is count?`,
        diagram: stringDiagram(word, [{ index: i, label: 'ch' }], visited),
        variables: ['ch', 'count'],
        targetVariables: ['count'],
        expectedState: { ch, count },
        feedback: fb(
          `Correct — count is now ${count}.`,
          `"${ch}" is in "aeiou".`,
          `count = ${count}.`,
        ),
        answerTiles: numTiles(count),
      })
    } else {
      frames.push({
        currentLineIndex: 3,
        prompt: `"${ch}" is not a vowel — count stays the same. What is count?`,
        diagram: stringDiagram(word, [{ index: i, label: 'ch' }], visited),
        variables: ['ch', 'count'],
        targetVariables: ['count'],
        expectedState: { ch, count },
        feedback: fb(
          `Correct — count stays ${count}.`,
          `"${ch}" is not in "aeiou".`,
          `Still ${count}.`,
        ),
        answerTiles: numTiles(count),
      })
    }
  }

  frames.push({
    currentLineIndex: 2,
    prompt: `Finished scanning "${word}". How many vowels total?`,
    diagram: stringDiagram(word, undefined, word.split('').map((_, i) => i)),
    variables: ['count'],
    targetVariables: ['count'],
    expectedState: { count },
    feedback: fb(
      `Correct — ${count} vowel(s) in "${word}".`,
      'Add up every time count increased.',
      `Total vowels: ${count}.`,
    ),
    answerTiles: numTiles(count, [count + 1, 1, 0]),
  })

  return traceStep(
    id,
    code,
    frames,
    ['strings', 'loops'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
  )
}

/** Two Sum store-and-lookup trace — nums and target must be fixed. */
export function buildTwoSumTrace(
  nums: number[],
  target: number,
  id: string,
  section: LessonSection,
): LessonStep {
  const code = [
    `nums = [${nums.join(', ')}]`,
    `target = ${target}`,
    'seen = {}',
    'for i, num in enumerate(nums):',
    '    needed = target - num',
    '    if needed in seen:',
    '        return [seen[needed], i]',
    '    seen[num] = i',
  ]
  const frames: TraceFrame[] = []
  const seen: { key: string; value: number }[] = []

  frames.push({
    currentLineIndex: 2,
    prompt: 'Run line 3: `seen = {}`. The map starts empty. How many entries?',
    diagram: { kind: 'hashmap', entries: [] },
    variables: ['size'],
    targetVariables: ['size'],
    expectedState: { size: 0 },
    feedback: fb(
      'Correct — the hash map is empty.',
      'No keys stored yet.',
      'seen = {} means 0 entries.',
    ),
    answerTiles: numTiles(0, [1, 2]),
  })

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i]
    const needed = target - num

    frames.push({
      currentLineIndex: 3,
      prompt: `Loop at index ${i}. num = nums[${i}]. What is num?`,
      diagram: arrayDiagram(nums, i, [{ index: i, label: 'num' }]),
      variables: ['num', 'i'],
      targetVariables: ['num'],
      expectedState: { num, i },
      feedback: fb(
        `Correct — nums[${i}] is ${num}.`,
        `Read index ${i}.`,
        `num = ${num}.`,
      ),
      answerTiles: numTiles(num),
    })

    frames.push({
      currentLineIndex: 4,
      prompt: `Compute needed = target - num = ${target} - ${num}. What is needed?`,
      diagram: { kind: 'hashmap', entries: [...seen], lookup: String(needed) },
      variables: ['needed', 'num'],
      targetVariables: ['needed'],
      expectedState: { needed, num },
      feedback: fb(
        `Correct — needed = ${needed}.`,
        `${target} minus ${num}.`,
        `needed = ${needed}.`,
      ),
      answerTiles: numTiles(needed),
    })

    if (seen.some((e) => e.key === String(needed))) {
      const partnerIdx = seen.find((e) => e.key === String(needed))!.value
      frames.push({
        currentLineIndex: 5,
        prompt: `${needed} is already in seen! What index pair do we return?`,
        diagram: {
          kind: 'hashmap',
          entries: [...seen],
          lookup: String(needed),
        },
        variables: ['first', 'second'],
        targetVariables: ['second'],
        expectedState: { first: partnerIdx, second: i },
        feedback: fb(
          `Correct — return [${partnerIdx}, ${i}].`,
          `seen[${needed}] was stored at index ${partnerIdx}.`,
          `Pair found: indices ${partnerIdx} and ${i}.`,
        ),
        answerTiles: numTiles(i, [partnerIdx, partnerIdx + 1, 0]),
      })
      break
    }

    seen.push({ key: String(num), value: i })
    frames.push({
      currentLineIndex: 7,
      prompt: `needed not in seen yet. Store seen[${num}] = ${i}. What is in the map now?`,
      diagram: { kind: 'hashmap', entries: [...seen] },
      variables: ['stored'],
      targetVariables: ['stored'],
      expectedState: { stored: num },
      feedback: fb(
        `Correct — key ${num} maps to index ${i}.`,
        `seen[${num}] = ${i}.`,
        `Stored ${num} → ${i}.`,
      ),
      answerTiles: numTiles(num),
    })
  }

  return traceStep(id, code, frames, ['hashMaps'], section, section === 'teach' ? 'Visual' : 'Quiz')
}

/** Binary search trace on a sorted array. */
export function buildBinarySearchTrace(
  values: number[],
  target: number,
  id: string,
  section: LessonSection,
): LessonStep {
  const code = [
    `nums = [${values.join(', ')}]`,
    `target = ${target}`,
    'low = 0',
    'high = len(nums) - 1',
    'while low <= high:',
    '    mid = (low + high) // 2',
    '    if nums[mid] == target:',
    '        return mid',
    '    elif nums[mid] < target:',
    '        low = mid + 1',
    '    else:',
    '        high = mid - 1',
  ]
  const frames: TraceFrame[] = []
  let low = 0
  let high = values.length - 1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midVal = values[mid]

    frames.push({
      currentLineIndex: 5,
      prompt: `low=${low}, high=${high}. What is mid = (low + high) // 2?`,
      diagram: { kind: 'binarySearch', values, low, high, mid },
      variables: ['mid', 'low', 'high'],
      targetVariables: ['mid'],
      expectedState: { mid, low, high },
      feedback: fb(
        `Correct — mid = ${mid}.`,
        `(${low} + ${high}) // 2 = ${mid}.`,
        `mid = ${mid}.`,
      ),
      answerTiles: numTiles(mid),
    })

    frames.push({
      currentLineIndex: 6,
      prompt: `nums[${mid}] = ${midVal}. Is it equal to target (${target})?`,
      diagram: { kind: 'binarySearch', values, low, high, mid },
      variables: ['match'],
      targetVariables: ['match'],
      expectedState: { match: midVal === target ? 'True' : 'False' },
      feedback: fb(
        midVal === target
          ? `Correct — ${midVal} == ${target}.`
          : `Correct — ${midVal} ≠ ${target}.`,
        `Compare nums[${mid}] to target.`,
        midVal === target ? 'Equal — found it.' : 'Not equal — narrow the range.',
      ),
      answerTiles: ['True', 'False'],
    })

    if (midVal === target) {
      frames.push({
        currentLineIndex: 7,
        prompt: `Found it! What index do we return?`,
        diagram: { kind: 'binarySearch', values, low, high, mid },
        variables: ['index'],
        targetVariables: ['index'],
        expectedState: { index: mid },
        feedback: fb(
          `Correct — target is at index ${mid}.`,
          `nums[${mid}] == ${target}.`,
          `Return index ${mid}.`,
        ),
        answerTiles: numTiles(mid),
      })
      break
    }

    if (midVal < target) {
      frames.push({
        currentLineIndex: 8,
        prompt: `${midVal} < ${target} — search the right half. What is the new low?`,
        diagram: { kind: 'binarySearch', values, low, high, mid },
        variables: ['low'],
        targetVariables: ['low'],
        expectedState: { low: mid + 1 },
        feedback: fb(
          `Correct — low = mid + 1 = ${mid + 1}.`,
          'Target is bigger than nums[mid].',
          `low becomes ${mid + 1}.`,
        ),
        answerTiles: numTiles(mid + 1, [mid, low]),
      })
      low = mid + 1
    } else {
      frames.push({
        currentLineIndex: 10,
        prompt: `${midVal} > ${target} — search the left half. What is the new high?`,
        diagram: { kind: 'binarySearch', values, low, high, mid },
        variables: ['high'],
        targetVariables: ['high'],
        expectedState: { high: mid - 1 },
        feedback: fb(
          `Correct — high = mid - 1 = ${mid - 1}.`,
          'Target is smaller than nums[mid].',
          `high becomes ${mid - 1}.`,
        ),
        answerTiles: numTiles(mid - 1, [mid, high]),
      })
      high = mid - 1
    }
  }

  return traceStep(
    id,
    code,
    frames,
    ['binarySearch'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
  )
}

/** Sorted two-pointer pair sum trace. */
export function buildSortedPairTrace(
  nums: number[],
  target: number,
  id: string,
  section: LessonSection,
): LessonStep {
  const code = [
    `nums = [${nums.join(', ')}]`,
    `target = ${target}`,
    'left = 0',
    'right = len(nums) - 1',
    'while left < right:',
    '    total = nums[left] + nums[right]',
    '    if total == target:',
    '        return (left, right)',
    '    elif total < target:',
    '        left += 1',
    '    else:',
    '        right -= 1',
  ]
  const frames: TraceFrame[] = []
  let left = 0
  let right = nums.length - 1

  while (left < right) {
    const sum = nums[left] + nums[right]

    frames.push({
      currentLineIndex: 5,
      prompt: `left=${left}, right=${right}. What is nums[left] + nums[right]?`,
      diagram: arrayDiagram(nums, undefined, [
        { index: left, label: 'left' },
        { index: right, label: 'right' },
      ]),
      variables: ['total', 'left', 'right'],
      targetVariables: ['total'],
      expectedState: { total: sum, left, right },
      feedback: fb(
        `Correct — ${nums[left]} + ${nums[right]} = ${sum}.`,
        `Add nums[${left}] and nums[${right}].`,
        `total = ${sum}.`,
      ),
      answerTiles: numTiles(sum),
    })

    if (sum === target) {
      frames.push({
        currentLineIndex: 6,
        prompt: `${sum} == ${target}! Which two values are at left and right?`,
        diagram: arrayDiagram(nums, undefined, [
          { index: left, label: 'left' },
          { index: right, label: 'right' },
        ]),
        variables: ['leftVal', 'rightVal'],
        targetVariables: ['leftVal', 'rightVal'],
        expectedState: { leftVal: nums[left], rightVal: nums[right] },
        feedback: fb(
          `Correct — ${nums[left]} and ${nums[right]} sum to ${target}.`,
          `nums[${left}] and nums[${right}].`,
          `${nums[left]} + ${nums[right]} = ${target}.`,
        ),
        answerTiles: numTiles(nums[left], [nums[right], nums[left] + 1]),
      })
      break
    }

    if (sum < target) {
      left += 1
      frames.push({
        currentLineIndex: 8,
        prompt: `${sum} < ${target} — move left pointer right. What is the new left index?`,
        diagram: arrayDiagram(nums, undefined, [
          { index: left, label: 'left' },
          { index: right, label: 'right' },
        ]),
        variables: ['left'],
        targetVariables: ['left'],
        expectedState: { left },
        feedback: fb(
          `Correct — left = ${left}.`,
          'Sum too small → try a bigger left value.',
          `left becomes ${left}.`,
        ),
        answerTiles: numTiles(left),
      })
    } else {
      right -= 1
      frames.push({
        currentLineIndex: 10,
        prompt: `${sum} > ${target} — move right pointer left. What is the new right index?`,
        diagram: arrayDiagram(nums, undefined, [
          { index: left, label: 'left' },
          { index: right, label: 'right' },
        ]),
        variables: ['right'],
        targetVariables: ['right'],
        expectedState: { right },
        feedback: fb(
          `Correct — right = ${right}.`,
          'Sum too big → try a smaller right value.',
          `right becomes ${right}.`,
        ),
        answerTiles: numTiles(right),
      })
    }
  }

  return traceStep(
    id,
    code,
    frames,
    ['twoPointers', 'arrays'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
  )
}

/** Palindrome check — move left/right inward step by step. */
export function buildPalindromeTrace(
  word: string,
  id: string,
  section: LessonSection,
): LessonStep {
  const code = [
    `s = "${word}"`,
    'left = 0',
    'right = len(s) - 1',
    'while left < right:',
    '    if s[left] != s[right]:',
    '        return False',
    '    left += 1',
    '    right -= 1',
    'return True',
  ]
  const frames: TraceFrame[] = []
  let left = 0
  let right = word.length - 1

  frames.push({
    currentLineIndex: 1,
    prompt: 'Run line 2: `left = 0`. What index does left start at?',
    diagram: stringDiagram(word, [
      { index: 0, label: 'left' },
      { index: right, label: 'right' },
    ]),
    variables: ['left', 'right'],
    targetVariables: ['left'],
    expectedState: { left: 0, right },
    feedback: fb('Correct — left starts at 0.', 'First character index.', 'left = 0.'),
    answerTiles: numTiles(0, [1, right]),
  })

  while (left < right) {
    const leftCh = word[left]
    const rightCh = word[right]
    const visitedOutside = [
      ...Array.from({ length: left }, (_, i) => i),
      ...Array.from({ length: word.length - 1 - right }, (_, i) => word.length - 1 - i),
    ]

    frames.push({
      currentLineIndex: 4,
      prompt: `Compare s[${left}] ("${leftCh}") and s[${right}] ("${rightCh}"). Do they match?`,
      diagram: stringDiagram(
        word,
        [
          { index: left, label: 'left' },
          { index: right, label: 'right' },
        ],
        visitedOutside,
      ),
      variables: ['match'],
      targetVariables: ['match'],
      expectedState: { match: leftCh === rightCh ? 'True' : 'False' },
      feedback: fb(
        leftCh === rightCh
          ? `Correct — both are "${leftCh}".`
          : `Correct — "${leftCh}" ≠ "${rightCh}".`,
        'Compare the two highlighted letters.',
        leftCh === rightCh ? 'They match → True.' : 'Mismatch → False.',
      ),
      answerTiles: ['True', 'False'],
    })

    if (leftCh !== rightCh) break

    left += 1
    right -= 1
  }

  const isPalindrome = word === [...word].reverse().join('')
  frames.push({
    currentLineIndex: 7,
    prompt: `All pairs checked. Is "${word}" a palindrome?`,
    diagram: stringDiagram(word),
    variables: ['answer'],
    targetVariables: ['answer'],
    expectedState: { answer: isPalindrome ? 'True' : 'False' },
    feedback: fb(
      isPalindrome
        ? `Correct — "${word}" reads the same forwards and backwards.`
        : `Correct — "${word}" is not a palindrome.`,
      'Did every pair match?',
      isPalindrome ? 'True — palindrome.' : 'False — not a palindrome.',
    ),
    answerTiles: ['True', 'False'],
  })

  return traceStep(
    id,
    code,
    frames,
    ['twoPointers', 'strings'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
  )
}

/** Valid parentheses — trace push/pop on each character. */
export function buildBracketTrace(
  brackets: string,
  id: string,
  section: LessonSection,
): LessonStep {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const openers = new Set(['(', '[', '{'])
  const code = [
    `s = "${brackets}"`,
    'stack = []',
    'for ch in s:',
    '    if ch in "([{":',
    '        stack.append(ch)',
    '    else:',
    '        top = stack.pop()',
    '        # does top match ch?',
  ]
  const frames: TraceFrame[] = []
  const stack: string[] = []

  frames.push({
    currentLineIndex: 1,
    prompt: 'Run line 2: `stack = []`. How many items on the stack?',
    diagram: { kind: 'stack', items: [] },
    variables: ['size'],
    targetVariables: ['size'],
    expectedState: { size: 0 },
    feedback: fb('Correct — stack starts empty.', 'Nothing pushed yet.', 'size = 0.'),
    answerTiles: numTiles(0, [1, 2]),
  })

  for (let i = 0; i < brackets.length; i++) {
    const ch = brackets[i]

    if (openers.has(ch)) {
      stack.push(ch)
      frames.push({
        currentLineIndex: 4,
        prompt: `"${ch}" is an opener — push it. What is on top of the stack now?`,
        diagram: { kind: 'stack', items: [...stack] },
        variables: ['top'],
        targetVariables: ['top'],
        expectedState: { top: ch },
        feedback: fb(
          `Correct — "${ch}" is on top.`,
          'Last pushed sits on top (LIFO).',
          `Top of stack = "${ch}".`,
        ),
        answerTiles: shuffle([...new Set([ch, '(', '[', '{', ')'])].slice(0, 8)),
      })
    } else {
      const top = stack.pop() ?? ''
      const matches = top === pairs[ch]
      frames.push({
        currentLineIndex: 6,
        prompt: `"${ch}" is a closer. Pop the top opener "${top}". Does "${top}" match "${ch}"?`,
        diagram: { kind: 'stack', items: [...stack] },
        variables: ['match'],
        targetVariables: ['match'],
        expectedState: { match: matches ? 'True' : 'False' },
        feedback: fb(
          matches
            ? `Correct — "${top}" pairs with "${ch}".`
            : `Correct — "${top}" does NOT pair with "${ch}".`,
          'Check opener/closer pairs: () [] {}.',
          matches ? 'Match → True.' : 'Mismatch → False.',
        ),
        answerTiles: ['True', 'False'],
      })
      if (!matches) break
    }
  }

  const valid = (() => {
    const s: string[] = []
    for (const ch of brackets) {
      if (openers.has(ch)) s.push(ch)
      else {
        const t = s.pop()
        if (t !== pairs[ch]) return false
      }
    }
    return s.length === 0
  })()

  frames.push({
    currentLineIndex: 2,
    prompt: `Finished scanning "${brackets}". Is the string valid?`,
    diagram: { kind: 'stack', items: [...stack] },
    variables: ['valid'],
    targetVariables: ['valid'],
    expectedState: { valid: valid ? 'True' : 'False' },
    feedback: fb(
      valid
        ? `Correct — "${brackets}" is valid.`
        : `Correct — "${brackets}" is invalid.`,
      valid ? 'Stack empty and all pairs matched.' : 'Mismatch or leftover openers.',
      valid ? 'True — valid.' : 'False — invalid.',
    ),
    answerTiles: ['True', 'False'],
  })

  return traceStep(
    id,
    code,
    frames,
    ['stacks'],
    section,
    section === 'teach' ? 'Visual' : 'Quiz',
  )
}
