import type { ConceptId, LessonStep } from '../../types/lesson'
import { isPassiveType, lessonPracticeStep } from './shared'

type CheckpointSpec = {
  prompt: string
  answer: string
  options: string[]
  correct: string
  incorrect: string
  secondIncorrect: string
  tags: ConceptId[]
}

const CHECKPOINT_BANK: Record<string, CheckpointSpec[]> = {
  'arrays-and-loops': [
    {
      prompt: 'In Python, what index holds the first element of a list?',
      answer: '0',
      options: ['1', '-1', 'len(nums)'],
      correct: 'Right — Python counts from 0, so nums[0] is the first slot.',
      incorrect: 'The first index is 0, not 1.',
      secondIncorrect: 'Review the indexing slides — first slot is index 0.',
      tags: ['arrays'],
    },
    {
      prompt: 'What does `for num in nums` give you on each loop pass?',
      answer: 'The next element',
      options: ['A random index', 'The last element only', 'The list length'],
      correct: 'Exactly — each pass visits the next value left to right.',
      incorrect: 'The loop walks the list in order, one element at a time.',
      secondIncorrect: 'Re-read the loop slides — each pass gets the next element.',
      tags: ['arrays', 'loops'],
    },
    {
      prompt: 'In find-max, when should you update `largest`?',
      answer: 'When num > largest',
      options: ['Every iteration', 'Only on the last index', 'When num equals largest'],
      correct: 'Correct — only bump largest when you find a bigger value.',
      incorrect: 'Compare num to largest — update only when num is bigger.',
      secondIncorrect: 'Review the walkthrough — update when num > largest.',
      tags: ['arrays', 'loops'],
    },
    {
      prompt: 'How many elements does a full scan loop visit in a list of length n?',
      answer: 'Every element once',
      options: ['Only half the list', 'Two random elements', 'The first and last only'],
      correct: 'Right — one pass, one visit per element — O(n) time.',
      incorrect: 'A full scan checks each slot exactly once.',
      secondIncorrect: 'Re-read the scan template — visit every element once.',
      tags: ['arrays', 'loops'],
    },
    {
      prompt: 'What is step 1 of the basic scan template?',
      answer: 'Pick a starting answer',
      options: ['Sort the list first', 'Use a hash map', 'Skip the first element'],
      correct: 'Yes — initialize an answer, then loop and update it.',
      incorrect: 'Start with a running answer before the loop runs.',
      secondIncorrect: 'Review the scan template slides — initialize first.',
      tags: ['arrays', 'loops'],
    },
  ],
  strings: [
    {
      prompt: 'How do you read the first character of string `s`?',
      answer: 's[0]',
      options: ['s[1]', 's.first', 's[-0]'],
      correct: 'Correct — same indexing rule as arrays.',
      incorrect: 'First character is at index 0: s[0].',
      secondIncorrect: 'Review indexing — strings start at index 0.',
      tags: ['strings'],
    },
    {
      prompt: 'What does `for ch in s` loop over?',
      answer: 'Each character',
      options: ['Each word', 'Only vowels', 'The string length'],
      correct: 'Right — one character per loop pass, left to right.',
      incorrect: 'The loop visits every character in order.',
      secondIncorrect: 'Re-read the loop slides — one character at a time.',
      tags: ['strings', 'loops'],
    },
    {
      prompt: 'Which test checks if a character is a vowel?',
      answer: 'ch in "aeiou"',
      options: ['ch == vowel', 'ch > "a"', 'len(ch) == 1'],
      correct: 'Exactly — membership in "aeiou" catches vowels.',
      incorrect: 'Use `ch in "aeiou"` to test vowels.',
      secondIncorrect: 'Review the vowel slides — use membership in "aeiou".',
      tags: ['strings', 'loops'],
    },
    {
      prompt: 'Counting vowels uses the same pattern as find-max — what changes?',
      answer: 'Compare characters not numbers',
      options: ['Use two pointers', 'Sort the string', 'Skip the loop'],
      correct: 'Right — same loop skeleton, different test inside.',
      incorrect: 'Still one pass — but test each character instead of comparing numbers.',
      secondIncorrect: 'Review the walkthrough — loop + test, like array scanning.',
      tags: ['strings', 'loops'],
    },
    {
      prompt: 'Why are strings a natural step after arrays?',
      answer: 'Both use index and loop',
      options: ['Strings never loop', 'Strings skip indexing', 'Strings always use hash maps'],
      correct: 'Yes — ordered slots you visit one at a time.',
      incorrect: 'Strings behave like arrays of characters — index and loop.',
      secondIncorrect: 'Review the intro slides — indexing and looping both apply.',
      tags: ['strings'],
    },
  ],
  'hash-maps': [
    {
      prompt: 'What does a hash map store?',
      answer: 'Key-value pairs',
      options: ['Only sorted numbers', 'Loop counters', 'Stack frames'],
      correct: 'Right — a key maps to a value for fast lookup.',
      incorrect: 'Hash maps map keys to values — like a dictionary.',
      secondIncorrect: 'Review the locker analogy — key → value.',
      tags: ['hashMaps'],
    },
    {
      prompt: 'In Two Sum, what is the complement of num for target T?',
      answer: 'T - num',
      options: ['num - T', 'T + num', 'T / num'],
      correct: 'Correct — num + complement must equal the target.',
      incorrect: 'Complement = target - num.',
      secondIncorrect: 'Review the complement slides — target minus num.',
      tags: ['hashMaps'],
    },
    {
      prompt: 'When do you store a number in the map during Two Sum?',
      answer: 'After checking the complement',
      options: ['Before the loop starts', 'Never store anything', 'Only at the last index'],
      correct: 'Right — check first, then store num → index if no pair found.',
      incorrect: 'Lookup complement first, then store the current number.',
      secondIncorrect: 'Review the walkthrough — check, then store.',
      tags: ['hashMaps'],
    },
    {
      prompt: 'What question does a hash map answer in O(1) time?',
      answer: 'Have I seen this before?',
      options: ['Is the list sorted?', 'What is the maximum?', 'How long is the array?'],
      correct: 'Exactly — instant lookup of a key you stored earlier.',
      incorrect: 'Hash maps answer “have I seen this value?” fast.',
      secondIncorrect: 'Review the store-and-lookup slides.',
      tags: ['hashMaps'],
    },
    {
      prompt: 'Two Sum avoids nested loops by using a hash map to…',
      answer: 'Look up complements',
      options: ['Sort the array', 'Count vowels', 'Push open brackets'],
      correct: 'Yes — store seen values, lookup target - num instantly.',
      incorrect: 'The map lets you find complements without scanning again.',
      secondIncorrect: 'Review the Two Sum walkthrough — store and lookup.',
      tags: ['hashMaps'],
    },
  ],
  'two-pointers': [
    {
      prompt: 'Where do left and right start on a palindrome check?',
      answer: 'First and last index',
      options: ['Both at index 0', 'Middle of the string', 'Random positions'],
      correct: 'Correct — left at 0, right at len-1.',
      incorrect: 'Start at opposite ends — first and last character.',
      secondIncorrect: 'Review the setup slides — opposite ends.',
      tags: ['twoPointers', 'strings'],
    },
    {
      prompt: 'After comparing s[left] and s[right], what happens next?',
      answer: 'Move both inward',
      options: ['Only move left', 'Reset to the start', 'Stop immediately'],
      correct: 'Right — left += 1 and right -= 1 shrink the window.',
      incorrect: 'Both pointers move toward the center after each match.',
      secondIncorrect: 'Review the pointer slides — both move inward.',
      tags: ['twoPointers'],
    },
    {
      prompt: 'On a sorted array, if left + right is too small, which pointer moves?',
      answer: 'Move left up',
      options: ['Move right down', 'Move both down', 'Neither moves'],
      correct: 'Yes — a larger sum needs a bigger left value.',
      incorrect: 'Too small → increase left to raise the sum.',
      secondIncorrect: 'Review sorted pair slides — too small means move left.',
      tags: ['twoPointers', 'arrays'],
    },
    {
      prompt: 'When is two pointers the right pattern?',
      answer: 'Sorted or mirrored data',
      options: ['Unsorted random data', 'Hash map lookups', 'Stack matching only'],
      correct: 'Correct — palindromes and sorted pair sums fit this shape.',
      incorrect: 'Use two pointers when structure comes from both ends.',
      secondIncorrect: 'Review the concept slides — mirrored or sorted data.',
      tags: ['twoPointers'],
    },
    {
      prompt: 'A palindrome fails when…',
      answer: 'Any pair differs',
      options: ['Pointers meet in the middle', 'The string is empty', 'Left equals right'],
      correct: 'Right — one mismatch means not a palindrome.',
      incorrect: 'If s[left] != s[right] at any step, return false.',
      secondIncorrect: 'Review the walkthrough — compare each pair.',
      tags: ['twoPointers', 'strings'],
    },
  ],
  stacks: [
    {
      prompt: 'What order does a stack follow?',
      answer: 'Last in, first out',
      options: ['First in, first out', 'Random access', 'Sorted order'],
      correct: 'Correct — LIFO — the most recent item is on top.',
      incorrect: 'Stacks are last-in, first-out (LIFO).',
      secondIncorrect: 'Review the LIFO slides — last pushed is first popped.',
      tags: ['stacks'],
    },
    {
      prompt: 'What do you do when you see an opener like "("?',
      answer: 'Push onto the stack',
      options: ['Pop from the stack', 'Ignore it', 'Sort the string'],
      correct: 'Right — openers wait on the stack for a matching closer.',
      incorrect: 'Open brackets get pushed onto the stack.',
      secondIncorrect: 'Review the push slides — openers go on the stack.',
      tags: ['stacks'],
    },
    {
      prompt: 'When a closing bracket arrives, you should…',
      answer: 'Pop and compare',
      options: ['Push it too', 'Clear the whole stack', 'Skip it'],
      correct: 'Correct — pop the top opener and verify it pairs with the closer.',
      incorrect: 'Pop the most recent opener and check the pair.',
      secondIncorrect: 'Review the match slides — pop then compare.',
      tags: ['stacks'],
    },
    {
      prompt: 'Valid parentheses means the stack is…',
      answer: 'Empty at the end',
      options: ['Full at the end', 'Never used', 'Sorted alphabetically'],
      correct: 'Yes — every opener was matched and popped.',
      incorrect: 'All openers matched → stack empty when done.',
      secondIncorrect: 'Review the walkthrough — empty stack = valid.',
      tags: ['stacks'],
    },
    {
      prompt: 'Why does a stack fit bracket matching?',
      answer: 'Most recent opener matches next closer',
      options: ['Stacks sort brackets', 'Stacks skip duplicates', 'Stacks only store numbers'],
      correct: 'Exactly — LIFO pairs the latest unmatched opener.',
      incorrect: 'The last opener must match the next closer — that is LIFO.',
      secondIncorrect: 'Review LIFO matching — stack top = latest opener.',
      tags: ['stacks'],
    },
  ],
  'binary-search': [
    {
      prompt: 'Binary search requires the data to be…',
      answer: 'Sorted',
      options: ['Unsorted', 'A string only', 'Exactly length 10'],
      correct: 'Correct — order tells you which half to discard.',
      incorrect: 'Binary search only works on sorted data.',
      secondIncorrect: 'Review the sorted-data slides.',
      tags: ['binarySearch'],
    },
    {
      prompt: 'What does mid = (low + high) // 2 pick?',
      answer: 'Middle index',
      options: ['The target value', 'Always index 0', 'The last index'],
      correct: 'Right — mid is the middle index of the current window.',
      incorrect: 'mid is the middle index between low and high.',
      secondIncorrect: 'Review the bounds slides — mid splits the window.',
      tags: ['binarySearch'],
    },
    {
      prompt: 'If nums[mid] is too small, which bound moves?',
      answer: 'low moves up',
      options: ['high moves down', 'Both become 0', 'Neither moves'],
      correct: 'Correct — low = mid + 1 discards the too-small half.',
      incorrect: 'Too small → raise low to mid + 1.',
      secondIncorrect: 'Review the walkthrough — too small means low = mid + 1.',
      tags: ['binarySearch'],
    },
    {
      prompt: 'Each binary search step eliminates…',
      answer: 'Half the search space',
      options: ['One random element', 'The entire array', 'Nothing'],
      correct: 'Yes — that is why it is O(log n).',
      incorrect: 'Each comparison cuts the remaining indices in half.',
      secondIncorrect: 'Review the halving slides — discard half each step.',
      tags: ['binarySearch'],
    },
    {
      prompt: 'Binary search stops when…',
      answer: 'Target found or window empty',
      options: ['low equals high always', 'mid is always 0', 'The array is reversed'],
      correct: 'Right — found at mid, or low > high means not present.',
      incorrect: 'Stop when you find the target or low passes high.',
      secondIncorrect: 'Review the trace — find target or exhaust the range.',
      tags: ['binarySearch'],
    },
  ],
}

function synthesizeFromBlock(
  _lessonId: string,
  block: LessonStep[],
  _index: number,
): CheckpointSpec {
  const anchor = [...block].reverse().find((s) => s.callout || s.hook) ?? block[block.length - 1]
  const snippet = (anchor.callout ?? anchor.hook ?? anchor.prompt).slice(0, 80)
  return {
    prompt: `What was the main idea in the slides you just read?`,
    answer: 'Review the slides above',
    options: ['Skip to the quiz', 'Guess without reading', 'Memorize index 1'],
    correct: `Good — you picked up the key point: ${snippet}`,
    incorrect: 'Re-read the slides in this section.',
    secondIncorrect: 'Go back through the slides above, then try again.',
    tags: anchor.conceptTags,
  }
}

/**
 * Insert gated practice questions every 4–5 passive teach slides.
 * Wrong twice → learner rewinds to the start of that block.
 */
export function insertTeachCheckpoints(
  lessonId: string,
  steps: LessonStep[],
): LessonStep[] {
  const bank = CHECKPOINT_BANK[lessonId] ?? []
  const result: LessonStep[] = []
  let blockStartId: string | null = null
  let slideInBlock = 0
  let blockSize = 4
  let specIndex = 0
  let blockSlides: LessonStep[] = []

  for (const step of steps) {
    if (step.section !== 'teach') {
      result.push(step)
      continue
    }

    if (step.type === 'lessonPractice') {
      result.push(step)
      continue
    }

    if (blockStartId === null) blockStartId = step.id
    result.push(step)

    if (!isPassiveType(step.type)) continue

    blockSlides.push(step)
    slideInBlock++

    if (slideInBlock < blockSize) continue

    const spec = bank[specIndex] ?? synthesizeFromBlock(lessonId, blockSlides, specIndex)
    result.push(
      lessonPracticeStep(
        `${lessonId}-checkpoint-${specIndex}`,
        spec.prompt,
        spec.answer,
        spec.options,
        {
          correct: spec.correct,
          incorrect: spec.incorrect,
          secondIncorrect: spec.secondIncorrect,
        },
        spec.tags,
        blockStartId,
      ),
    )

    specIndex++
    blockStartId = null
    slideInBlock = 0
    blockSize = blockSize === 4 ? 5 : 4
    blockSlides = []
  }

  return result
}
