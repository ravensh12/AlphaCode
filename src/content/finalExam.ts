import type { ExamQuestion } from '../types/finalGauntlet'

/**
 * The Final Mastery Trial — a ~22-question unit test that interleaves every
 * concept from all six lessons. Questions favour RETRIEVAL (recall / predict /
 * reorder) over recognition, and ramp through difficulty 1 → 3. Every trace and
 * predicted output below is hand-verified.
 *
 * Order is INTERLEAVED on purpose: no two adjacent questions share a concept,
 * so the default array order already mixes topics.
 */
export const FINAL_EXAM: ExamQuestion[] = [
  // 1 — arrays / predict (find-max scan)
  {
    id: 'fx-arrays-maxscan',
    concept: 'arrays',
    conceptLabel: 'Arrays & Loops',
    difficulty: 2,
    type: 'predict',
    prompt: 'Trace this scan by hand. What does it print?',
    code: [
      'nums = [4, 9, 2, 7]',
      'biggest = nums[0]',
      'for num in nums:',
      '    if num > biggest:',
      '        biggest = num',
      'print(biggest)',
    ],
    inputMode: 'numeric',
    accept: ['9', 'nine'],
    placeholder: 'a number',
    explanation:
      'You start "biggest" at the first value, then update it only when a larger one appears. One pass over the list is enough — 9 is the largest, so no sorting needed.',
    hint: 'Keep a running "biggest so far" and walk the list left to right — when does it change?',
  },

  // 2 — hashMaps / mcq (why a hash map)
  {
    id: 'fx-hashmaps-whatfor',
    concept: 'hashMaps',
    conceptLabel: 'Hash Maps',
    difficulty: 1,
    type: 'mcq',
    prompt:
      'You want to check whether you have already seen a value — instantly — no matter how large the list grows. Which tool is built for that?',
    choices: [
      'A stack (last-in, first-out)',
      'A plain unsorted list you re-scan every time',
      'A hash map (key → value)',
      'Two pointers from both ends',
    ],
    answerIndex: 2,
    explanation:
      'A hash map stores each item under a key and answers "is this here?" in about one step (O(1)), instead of re-scanning the whole list each time.',
    hint: 'Which structure was designed for near-instant lookups by key?',
  },

  // 3 — strings / recall (len)
  {
    id: 'fx-strings-len',
    concept: 'strings',
    conceptLabel: 'Strings',
    difficulty: 1,
    type: 'recall',
    prompt:
      'In Python, which built-in function tells you how many characters are in a string s? Type it from memory.',
    inputMode: 'text',
    accept: ['len', 'len()', 'len(s)'],
    placeholder: 'function name',
    explanation:
      'len(s) counts the characters. That number matters because the valid indices of s run from 0 up to len(s) - 1.',
    hint: 'It is the same three-letter function you use to measure a list.',
  },

  // 4 — binarySearch / order (one iteration)
  {
    id: 'fx-binarysearch-order',
    concept: 'binarySearch',
    conceptLabel: 'Binary Search',
    difficulty: 2,
    type: 'order',
    prompt: 'Put one round of binary search in the correct order.',
    steps: [
      'Set low to the first index and high to the last index.',
      'While low <= high, compute mid = (low + high) // 2.',
      'If nums[mid] equals the target, you found it — stop.',
      'If nums[mid] is less than the target, move low to mid + 1.',
      'Otherwise nums[mid] is too big, so move high to mid - 1.',
    ],
    explanation:
      'You always look at the middle of the current range, then throw away the half that cannot contain the target. Each step halves the search space.',
    hint: 'You can only pick a middle after you know where the range begins and ends.',
  },

  // 5 — twoPointers / mcq (sum too big)
  {
    id: 'fx-twopointers-toobig',
    concept: 'twoPointers',
    conceptLabel: 'Two Pointers',
    difficulty: 2,
    type: 'mcq',
    prompt:
      'Sorted array [2, 4, 7, 11], target = 12. left points at 2, right points at 11. Their sum is 13 — too big. What is the correct move?',
    choices: [
      'Move the left pointer right to 4',
      'Move the right pointer left to 7',
      'Move both pointers inward at once',
      'Stop — no pair can exist',
    ],
    answerIndex: 1,
    explanation:
      'Because the array is sorted, moving the right pointer left lands on a smaller value, shrinking the sum toward the target. Too big → shrink the right side.',
    hint: 'The sum is too large. Which pointer, when moved, gives you a smaller number on a sorted array?',
  },

  // 6 — stacks / predict (LIFO pop)
  {
    id: 'fx-stacks-pop',
    concept: 'stacks',
    conceptLabel: 'Stacks',
    difficulty: 2,
    type: 'predict',
    prompt: 'What does this print?',
    code: [
      'stack = []',
      'for ch in "ABC":',
      '    stack.append(ch)',
      'print(stack.pop())',
    ],
    inputMode: 'text',
    accept: ['C', 'c'],
    placeholder: 'a letter',
    explanation:
      'A stack is last-in, first-out. "C" was pushed last, so it is the first item popped back off the top.',
    hint: 'The last item you push is the first one you pop. What was pushed last?',
  },

  // 7 — loops / mcq (linear cost)
  {
    id: 'fx-loops-linear',
    concept: 'loops',
    conceptLabel: 'Loops',
    difficulty: 1,
    type: 'mcq',
    prompt:
      'A loop walks a list of n items, doing one comparison per item. As the list gets bigger, how does the total work grow?',
    choices: [
      'It stays constant no matter the size',
      'It grows in proportion to n (linear)',
      'It grows like n squared',
      'It shrinks as n grows',
    ],
    answerIndex: 1,
    explanation:
      'One pass over n items does about n units of work — that is O(n), or linear time. Double the list and you roughly double the work.',
    hint: 'If you do one step per item and there are n items, how many steps total?',
  },

  // 8 — arrays / recall (first index)
  {
    id: 'fx-arrays-firstindex',
    concept: 'arrays',
    conceptLabel: 'Arrays & Loops',
    difficulty: 1,
    type: 'recall',
    prompt:
      'Arrays are zero-indexed. What index number holds the FIRST element of an array? Type the number.',
    inputMode: 'numeric',
    accept: ['0', 'zero'],
    placeholder: 'an index',
    explanation:
      'Counting starts at 0, so nums[0] is the first slot and nums[len(nums) - 1] is the last. Forgetting this causes most off-by-one bugs.',
    hint: 'Python does not start counting at 1. Where does it start?',
  },

  // 9 — hashMaps / order (two sum)
  {
    id: 'fx-hashmaps-twosum-order',
    concept: 'hashMaps',
    conceptLabel: 'Hash Maps',
    difficulty: 3,
    type: 'order',
    prompt: 'Order the Two Sum algorithm (using a hash map) correctly.',
    steps: [
      'Make an empty hash map to remember numbers you have already seen.',
      'For the current number, compute complement = target - num.',
      'If the complement is already a key in the map, you found the pair — return it.',
      'Otherwise, store the current number in the map, then move to the next one.',
    ],
    explanation:
      'Checking for the complement BEFORE storing the current number is what stops you from pairing a number with itself. The map turns the partner search into an O(1) lookup.',
    hint: 'You can only ask "have I seen its partner?" after you know what partner you need — and you check before you store.',
  },

  // 10 — strings / predict (vowel count)
  {
    id: 'fx-strings-vowelcount',
    concept: 'strings',
    conceptLabel: 'Strings',
    difficulty: 2,
    type: 'predict',
    prompt: 'How many times does this print loop count? What is printed?',
    code: [
      'count = 0',
      'for ch in "racecar":',
      '    if ch in "aeiou":',
      '        count += 1',
      'print(count)',
    ],
    inputMode: 'numeric',
    accept: ['3', 'three'],
    placeholder: 'a number',
    explanation:
      '"racecar" is r-a-c-e-c-a-r. The vowels are a, e, a — three of them. The test ch in "aeiou" is True only for vowels.',
    hint: 'Spell the word out letter by letter and tick off each a, e, i, o, or u.',
  },

  // 11 — binarySearch / mcq (requires sorted)
  {
    id: 'fx-binarysearch-needssorted',
    concept: 'binarySearch',
    conceptLabel: 'Binary Search',
    difficulty: 1,
    type: 'mcq',
    prompt:
      'Binary search is extremely fast, but it only works when the data has one special property. Which one?',
    choices: [
      'The data must be sorted',
      'The data must be all positive numbers',
      'The data must contain no duplicates',
      'The data must be short',
    ],
    answerIndex: 0,
    explanation:
      'Comparing the target to the middle value only tells you which half to discard if the data is sorted. On unsorted data, "go left or right" is meaningless.',
    hint: 'How can checking one middle value let you safely throw away a whole half?',
  },

  // 12 — twoPointers / order (palindrome check)
  {
    id: 'fx-twopointers-palindrome-order',
    concept: 'twoPointers',
    conceptLabel: 'Two Pointers',
    difficulty: 2,
    type: 'order',
    prompt: 'Order the steps of a two-pointer palindrome check.',
    steps: [
      'Put left at index 0 and right at the last index.',
      'While left is less than right, compare s[left] with s[right].',
      'If the two characters differ, it is not a palindrome — return False.',
      'If they match, move left one step right and right one step left.',
      'If the pointers meet with no mismatch, it is a palindrome.',
    ],
    explanation:
      'A palindrome mirrors around its center, so the outermost pair must match, then the next pair in, and so on. The pointers walk toward each other until they cross.',
    hint: 'A palindrome reads the same from both ends — which two characters do you compare first?',
  },

  // 13 — stacks / mcq (valid parentheses closer)
  {
    id: 'fx-stacks-closer',
    concept: 'stacks',
    conceptLabel: 'Stacks',
    difficulty: 2,
    type: 'mcq',
    prompt:
      'While checking valid parentheses, you read a closing bracket ")". What should you do?',
    choices: [
      'Pop the top of the stack and check it is the matching "("',
      'Push the ")" onto the stack',
      'Ignore it and keep scanning',
      'Clear the whole stack and restart',
    ],
    answerIndex: 0,
    explanation:
      'Openers get pushed; a closer must match the most recent unmatched opener — which is exactly the top of the stack. If it does not match (or the stack is empty), the string is invalid.',
    hint: 'The most recently opened bracket must be the first one closed. Where does that bracket live?',
  },

  // 14 — hashMaps / recall (O(1))
  {
    id: 'fx-hashmaps-bigo',
    concept: 'hashMaps',
    conceptLabel: 'Hash Maps',
    difficulty: 1,
    type: 'recall',
    prompt:
      'About how many steps does a hash map take to look up a value, no matter how many items it holds? Give the big-O.',
    inputMode: 'text',
    accept: ['o(1)', 'o (1)', '1', 'constant', 'constant time'],
    placeholder: 'O(?)',
    explanation:
      'Hash maps jump almost directly to a value, so lookups take roughly constant time — O(1) — even as the map grows huge.',
    hint: 'The lookup time does not grow with the number of items. What big-O means "constant"?',
  },

  // 15 — arrays / mcq (init max correctly)
  {
    id: 'fx-arrays-initmax',
    concept: 'arrays',
    conceptLabel: 'Arrays & Loops',
    difficulty: 2,
    type: 'mcq',
    prompt:
      'When scanning a list to find the maximum, why start "best" at nums[0] instead of at 0?',
    choices: [
      'Because the list might be all negative numbers, where 0 would be wrong',
      'Because typing 0 is harder',
      'Because nums[0] is always the largest value',
      'It makes no difference at all',
    ],
    answerIndex: 0,
    explanation:
      'If every value is negative (say [-4, -9, -2]), starting "best" at 0 would never be beaten and you would wrongly report 0. Starting at a real element keeps the answer honest.',
    hint: 'Imagine a list like [-4, -9, -2]. What happens if your starting guess is 0?',
  },

  // 16 — loops / predict (accumulate sum)
  {
    id: 'fx-loops-accumulate',
    concept: 'loops',
    conceptLabel: 'Loops',
    difficulty: 2,
    type: 'predict',
    prompt: 'What does this accumulator loop print?',
    code: [
      'total = 0',
      'for num in [5, 9, 2, 9]:',
      '    total += num',
      'print(total)',
    ],
    inputMode: 'numeric',
    accept: ['25'],
    placeholder: 'a number',
    explanation:
      'total += num adds each value into a running sum: 0 → 5 → 14 → 16 → 25. The accumulate pattern is the same skeleton as find-max, but it adds instead of compares.',
    hint: 'Keep a running total and add each number in turn: 5, then 9, then 2, then 9.',
  },

  // 17 — binarySearch / recall (O(log n))
  {
    id: 'fx-binarysearch-logn',
    concept: 'binarySearch',
    conceptLabel: 'Binary Search',
    difficulty: 3,
    type: 'recall',
    prompt:
      'Binary search throws away half the remaining items every step. What is its big-O time complexity? Give the big-O.',
    inputMode: 'text',
    accept: ['o(log n)', 'o(logn)', 'log n', 'logn', 'logarithmic'],
    placeholder: 'O(?)',
    explanation:
      'Halving the range each step means the work grows like the number of times you can split n in half — that is O(log n). Even a million items take only about 20 steps.',
    hint: 'Repeatedly halving a number relates to which mathematical function?',
  },

  // 18 — strings / mcq (palindrome word)
  {
    id: 'fx-strings-palindrome',
    concept: 'strings',
    conceptLabel: 'Strings',
    difficulty: 1,
    type: 'mcq',
    prompt: 'Which word is a palindrome — reads the same forwards and backwards?',
    choices: ['stack', 'level', 'arrays', 'python'],
    answerIndex: 1,
    explanation:
      'Reversed, "level" is still "level". A two-pointer check would find every mirrored pair matches, so it is a palindrome.',
    hint: 'Spell each word backwards in your head. Which one is unchanged?',
  },

  // 19 — twoPointers / predict (sorted pair sum trace)
  {
    id: 'fx-twopointers-pairsum',
    concept: 'twoPointers',
    conceptLabel: 'Two Pointers',
    difficulty: 3,
    type: 'predict',
    prompt:
      'Trace this sorted pair-sum search by hand. What does it print?',
    code: [
      'nums = [1, 2, 3, 4, 6]',
      'left, right = 0, 4',
      'while left < right:',
      '    pair = nums[left] + nums[right]',
      '    if pair == 8:',
      '        print(pair)',
      '        break',
      '    elif pair < 8:',
      '        left += 1',
      '    else:',
      '        right -= 1',
    ],
    inputMode: 'numeric',
    accept: ['8'],
    placeholder: 'a number',
    explanation:
      'First pair is 1 + 6 = 7, which is less than 8, so left moves up to 2. Now 2 + 6 = 8, a match — it prints 8 and breaks.',
    hint: 'Compute the first sum (1 + 6). It is too small — which pointer moves, and what is the next sum?',
  },

  // 20 — stacks / order (valid parentheses algorithm)
  {
    id: 'fx-stacks-validparens-order',
    concept: 'stacks',
    conceptLabel: 'Stacks',
    difficulty: 2,
    type: 'order',
    prompt: 'Order the full valid-parentheses algorithm.',
    steps: [
      'Start with an empty stack.',
      'When you see an opening bracket, push it onto the stack.',
      'When you see a closing bracket, pop the top and check it matches.',
      'If it does not match (or the stack was empty), the string is invalid.',
      'After the whole scan, the string is valid only if the stack is empty.',
    ],
    explanation:
      'The stack remembers unmatched openers in last-in order. A leftover opener at the end (non-empty stack) means something never got closed.',
    hint: 'You need somewhere to keep track of openers before you can match closers — what comes first?',
  },

  // 21 — hashMaps / mcq (two sum complement)
  {
    id: 'fx-hashmaps-complement',
    concept: 'hashMaps',
    conceptLabel: 'Hash Maps',
    difficulty: 3,
    type: 'mcq',
    prompt:
      'Two Sum: target = 10 and you are now looking at the number 6. Before storing 6, which key are you hoping is already in the map?',
    choices: ['10', '6', '4', '16'],
    answerIndex: 2,
    explanation:
      'The complement is target - num = 10 - 6 = 4. If 4 was seen earlier it is in the map, and 4 + 6 = 10 completes the pair.',
    hint: 'What number must add to 6 to reach the target of 10?',
  },

  // 22 — binarySearch / recall (mid)
  {
    id: 'fx-binarysearch-mid',
    concept: 'binarySearch',
    conceptLabel: 'Binary Search',
    difficulty: 2,
    type: 'recall',
    prompt:
      'In binary search, what one-word name do we give the middle index you compute and compare against the target each step?',
    inputMode: 'text',
    accept: ['mid', 'middle', 'midpoint'],
    placeholder: 'a name',
    explanation:
      'It is usually called mid, computed as mid = (low + high) // 2. Comparing nums[mid] to the target tells you which half to discard.',
    hint: 'It sits halfway between low and high — what is the short name programmers give it?',
  },
]

/** Count of distinct concepts covered, for the trial summary UI. */
export const EXAM_CONCEPTS = ['arrays', 'strings', 'hashMaps', 'twoPointers', 'stacks', 'binarySearch'] as const
