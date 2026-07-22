import type { TrackId } from '../types/curriculum'
import type { ConceptId } from '../types/lesson'

/* ============================================================================
   District NPC question bank (Living Code City PR4-6 prep).

   Every district NPC carries a 3-question chat chain about one of the
   district's tracks. Questions reuse the MicroQuestion shape, but `concept`
   is OPTIONAL: only tracks that genuinely map onto a legacy learner-model
   ConceptId (the realm 1–2 fundamentals) tag their questions, so integration
   can feed recordConceptResult. Every other track is XP-only — no concept
   field, nothing written to the learner model.

   All prompts are original, aimed at a grade 7–9 reading level, and correct
   answers are deliberately spread across all four positions.
   ========================================================================== */

export interface DistrictQuestion {
  /** Legacy learner-model concept — present only on mapped (realm 1–2) tracks. */
  concept?: ConceptId
  prompt: string
  choices: readonly string[]
  /** Index into `choices` of the correct answer. */
  answerIndex: number
}

export const DISTRICT_QUESTION_CHAIN_LENGTH = 3

/**
 * Which legacy concepts a track's questions may carry. Tracks absent from
 * this map have NO legacy equivalent and must stay concept-free (XP only).
 */
export const TRACK_CONCEPTS: Partial<Record<TrackId, readonly ConceptId[]>> = {
  'arrays-hashing': ['arrays', 'hashMaps'],
  'two-pointers': ['twoPointers'],
  'sliding-window': ['strings', 'arrays'],
  stack: ['stacks'],
  'binary-search': ['binarySearch'],
}

export const DISTRICT_QUESTIONS: Record<TrackId, readonly DistrictQuestion[]> = {
  /* ------------------------------------------------------------- realm1 -- */
  'arrays-hashing': [
    {
      concept: 'hashMaps',
      prompt:
        "A club checks “is this name already signed up?” thousands of times. Which tool answers that in about one step?",
      choices: [
        'Reading the whole list each time',
        'A hash set',
        'A stack of index cards',
        'Sorting the list again before each check',
      ],
      answerIndex: 1,
    },
    {
      concept: 'arrays',
      prompt: 'nums = [7, 2, 9, 4]. What is nums[2]?',
      choices: ['2', '4', '9', '7'],
      answerIndex: 2,
    },
    {
      concept: 'hashMaps',
      prompt:
        'You want to count how many times each word appears in a song. The natural fit is…',
      choices: [
        'a hash map from word to count',
        'a single running total',
        'a stack of words',
        'binary search over the lyrics',
      ],
      answerIndex: 0,
    },
  ],
  'two-pointers': [
    {
      concept: 'twoPointers',
      prompt:
        'The list is sorted and the sum at your two pointers is too BIG. What is the classic move?',
      choices: [
        'Move the right pointer left',
        'Move the left pointer right',
        'Move both pointers outward',
        'Restart from the middle',
      ],
      answerIndex: 0,
    },
    {
      concept: 'twoPointers',
      prompt:
        'To check that “racecar” reads the same both ways, where do the two pointers start?',
      choices: [
        'Both at the middle',
        'Both at the front',
        'At two random letters',
        'One at each end',
      ],
      answerIndex: 3,
    },
    {
      concept: 'twoPointers',
      prompt: 'Why do two pointers beat checking every possible pair?',
      choices: [
        'They guess the answer',
        'One pass does it — about n steps instead of n²',
        'They skip half the items without checking them',
        'They only work on tiny lists',
      ],
      answerIndex: 1,
    },
  ],
  'sliding-window': [
    {
      concept: 'strings',
      prompt:
        'A window hunting the longest stretch of a string with no repeated letters hits a repeat. What does it do?',
      choices: [
        'Starts over from the beginning',
        'Deletes the repeated letter from the string',
        'Shrinks from the left until the repeat is gone',
        'Jumps straight to the end',
      ],
      answerIndex: 2,
    },
    {
      concept: 'arrays',
      prompt:
        'You want the best sales total over any 3 days in a row. Each time the window slides, it…',
      choices: [
        'adds the new day and drops the oldest day',
        're-adds all three days from scratch',
        'sorts the three days first',
        'skips ahead three whole days',
      ],
      answerIndex: 0,
    },
    {
      concept: 'strings',
      prompt: 'What makes a window “slide” instead of restart?',
      choices: [
        'It always covers the whole string',
        'Both ends move toward the middle',
        'It copies the string on every move',
        'Its two edges only ever move forward',
      ],
      answerIndex: 3,
    },
  ],
  /* ------------------------------------------------------------- realm2 -- */
  stack: [
    {
      concept: 'stacks',
      prompt: 'You push A, then B, then C onto a stack. Which pops first?',
      choices: ['A', 'C', 'B', 'They pop together'],
      answerIndex: 1,
    },
    {
      concept: 'stacks',
      prompt: 'The Undo button in an editor keeps your actions in…',
      choices: [
        'a list sorted by name',
        'a queue, oldest first',
        'a hash map keyed by action',
        'a stack, newest first',
      ],
      answerIndex: 3,
    },
    {
      concept: 'stacks',
      prompt:
        'Scanning “( [ ) ]” for matching brackets, at what moment do you know it is broken?',
      choices: [
        'Only when the string ends',
        'The moment any closing bracket appears',
        'When “)” arrives but “[” is on top of the stack',
        'Never — those brackets match fine',
      ],
      answerIndex: 2,
    },
  ],
  'binary-search': [
    {
      concept: 'binarySearch',
      prompt: 'Each guess in binary search throws away about…',
      choices: [
        'half of what is left',
        'one item',
        'a quarter of the list',
        'nothing until the last guess',
      ],
      answerIndex: 0,
    },
    {
      concept: 'binarySearch',
      prompt:
        'Binary search over 1,000 sorted items needs at most about how many guesses?',
      choices: ['500', '10', '100', '3'],
      answerIndex: 1,
    },
    {
      concept: 'binarySearch',
      prompt: 'Binary search only works when the data is…',
      choices: ['all numbers', 'short', 'sorted', 'stored in a hash map'],
      answerIndex: 2,
    },
  ],
  'linked-list': [
    {
      prompt: 'In a linked list, how do you get from one node to the next?',
      choices: [
        'Jump by index, like an array',
        'Ask a hash map for it',
        'Scan memory left to right',
        'Follow the node’s next pointer',
      ],
      answerIndex: 3,
    },
    {
      prompt: 'Inserting a new node between two neighbors costs…',
      choices: [
        'just rewiring a couple of pointers',
        'shifting every later node over by one',
        'copying the whole list',
        'sorting the list again',
      ],
      answerIndex: 0,
    },
    {
      prompt: 'You lose the head of a singly linked list. What happens?',
      choices: [
        'Nothing — nodes remember their index',
        'You can no longer reach the rest of the list',
        'The tail becomes the new head',
        'The list sorts itself',
      ],
      answerIndex: 1,
    },
  ],
  /* ------------------------------------------------------------- realm3 -- */
  trees: [
    {
      prompt:
        'In a binary SEARCH tree, the values in a node’s LEFT subtree are…',
      choices: [
        'always the newest ones',
        'in random order',
        'smaller than the node’s value',
        'larger than the node’s value',
      ],
      answerIndex: 2,
    },
    {
      prompt: 'A tree node with no children is called a…',
      choices: ['root', 'leaf', 'branch pointer', 'bucket'],
      answerIndex: 1,
    },
    {
      prompt:
        'A balanced tree holding about 1,000,000 values is roughly how many levels deep?',
      choices: ['1,000,000', '10,000', '1,000', 'about 20'],
      answerIndex: 3,
    },
  ],
  tries: [
    {
      prompt: 'In a trie, the words “star” and “start” share…',
      choices: [
        'the whole path for s-t-a-r',
        'nothing at all',
        'only the letter t',
        'the same ending node',
      ],
      answerIndex: 0,
    },
    {
      prompt: 'Why are tries a great fit for autocomplete?',
      choices: [
        'They sort all words alphabetically first',
        'They store every word in one big array',
        'Typing a prefix walks straight to every word that starts with it',
        'They make the words shorter',
      ],
      answerIndex: 2,
    },
    {
      prompt:
        'How does a trie know “star” is a real word and not just the start of “start”?',
      choices: [
        'The node for “r” has no children',
        'The node for “r” carries an end-of-word mark',
        'It counts the letters',
        'It looks the word up in a dictionary array',
      ],
      answerIndex: 1,
    },
  ],
  'heap-priority-queue': [
    {
      prompt: 'A min-heap always keeps WHAT at the top?',
      choices: [
        'the newest value',
        'the biggest value',
        'a random value',
        'the smallest value',
      ],
      answerIndex: 3,
    },
    {
      prompt:
        'An emergency room treats the most urgent patient first, even if they arrived last. That policy is…',
      choices: [
        'a priority queue',
        'a plain first-come queue',
        'a stack',
        'an array re-sorted at every arrival',
      ],
      answerIndex: 0,
    },
    {
      prompt:
        'You need the 5 largest of a million scores. Why does a heap beat sorting everything?',
      choices: [
        'Heaps can store more numbers',
        'Heaps never compare values',
        'It keeps only a tiny top group instead of ordering all million',
        'Sorting loses data',
      ],
      answerIndex: 2,
    },
  ],
  /* ------------------------------------------------------------- realm4 -- */
  backtracking: [
    {
      prompt: 'Backtracking explores a maze by…',
      choices: [
        'always turning left',
        'trying a path and undoing the step when it dead-ends',
        'checking every cell in random order',
        'flooding every path at the same time',
      ],
      answerIndex: 1,
    },
    {
      prompt:
        'For each of 3 snacks you either pack it or skip it. How many different bags are possible?',
      choices: ['3', '6', '9', '8'],
      answerIndex: 3,
    },
    {
      prompt: 'The “undo the last choice” step in backtracking exists so you can…',
      choices: [
        'try the next option from the same spot',
        'save memory forever',
        'avoid recursion entirely',
        'sort the choices',
      ],
      answerIndex: 0,
    },
  ],
  graphs: [
    {
      prompt: 'At its heart, a graph is…',
      choices: [
        'a bar chart',
        'a grid of pixels',
        'dots (nodes) connected by lines (edges)',
        'a sorted kind of tree',
      ],
      answerIndex: 2,
    },
    {
      prompt:
        'Breadth-first search starting from your profile visits people in what order?',
      choices: [
        'Friends, then friends-of-friends — ring by ring',
        'One deepest chain first',
        'Alphabetical order',
        'Random hops',
      ],
      answerIndex: 0,
    },
    {
      prompt: 'An adjacency list stores…',
      choices: [
        'every possible pair, even strangers',
        'each node’s own list of neighbors',
        'the nodes in sorted order',
        'only the shortest path',
      ],
      answerIndex: 1,
    },
  ],
  'advanced-graphs': [
    {
      prompt:
        'Roads have different drive times. To find the fastest route, the winning strategy is to…',
      choices: [
        'count the number of roads only',
        'take the straightest roads',
        'always drive toward the goal',
        'grow outward, always extending the cheapest total so far',
      ],
      answerIndex: 3,
    },
    {
      prompt:
        'Connecting 6 villages with the least total cable is the classic…',
      choices: [
        'shortest path problem',
        'sorting problem',
        'minimum spanning tree problem',
        'sliding window problem',
      ],
      answerIndex: 2,
    },
    {
      prompt: 'Why can’t plain BFS find the fastest route on weighted roads?',
      choices: [
        'It counts hops, not total travel time',
        'It visits too few nodes',
        'It needs sorted input',
        'It only works on trees',
      ],
      answerIndex: 0,
    },
  ],
  /* ------------------------------------------------------------- realm5 -- */
  '1d-dp': [
    {
      prompt: 'Dynamic programming gets its speed by…',
      choices: [
        'guessing well',
        'solving each small subproblem once and reusing the answer',
        'skipping the hard cases',
        'running two pointers',
      ],
      answerIndex: 1,
    },
    {
      prompt:
        'You can hop up 1 or 2 steps at a time. The number of ways to reach step 10 equals…',
      choices: [
        'ways(5) × 2',
        'ways(9) − ways(8)',
        'ways(9) + ways(8)',
        '10 × 2',
      ],
      answerIndex: 2,
    },
    {
      prompt: 'Plain recursive Fibonacci is slow because…',
      choices: [
        'the numbers get too big',
        'recursion is always slow',
        'it uses too much memory',
        'it recomputes the same calls again and again',
      ],
      answerIndex: 3,
    },
  ],
  '2d-dp': [
    {
      prompt:
        'A robot walks a grid moving only right or down. Paths into a cell = …',
      choices: [
        'paths from above + paths from the left',
        'paths from above × paths from the left',
        'always exactly 2',
        'rows + columns',
      ],
      answerIndex: 0,
    },
    {
      prompt:
        'A DP table comparing a 5-letter word with an 8-letter word needs about…',
      choices: ['13 cells', '5 × 8 cells', 'only the diagonal', '2 cells'],
      answerIndex: 1,
    },
    {
      prompt: 'In grid DP, the first row is easy to fill because…',
      choices: [
        'it looks nicer',
        'those cells are never used again',
        'those cells can only be reached one way',
        'the final answer lives there',
      ],
      answerIndex: 2,
    },
  ],
  greedy: [
    {
      prompt: 'A greedy algorithm decides by…',
      choices: [
        'looking at every possible future',
        'rolling back bad picks',
        'saving its choices for later',
        'taking the best-looking option right now',
      ],
      answerIndex: 3,
    },
    {
      prompt:
        'To fit the MOST non-overlapping shows into one day, greedily pick the show that…',
      choices: [
        'ends earliest',
        'starts earliest',
        'runs longest',
        'is most popular',
      ],
      answerIndex: 0,
    },
    {
      prompt: 'When is greedy the WRONG tool?',
      choices: [
        'When the input is large',
        'When a locally best pick can ruin the overall answer',
        'When the data is already sorted',
        'When two options tie',
      ],
      answerIndex: 1,
    },
  ],
  /* ------------------------------------------------------------- realm6 -- */
  intervals: [
    {
      prompt: 'Do the meetings [1, 4] and [3, 6] overlap?',
      choices: [
        'No — 4 comes before 6',
        'Only if they share a room',
        'Yes — 3 starts before 4 ends',
        'There is no way to tell',
      ],
      answerIndex: 2,
    },
    {
      prompt: 'Merging [1, 4] and [3, 6] gives…',
      choices: ['[3, 4]', '[1, 3]', '[4, 6]', '[1, 6]'],
      answerIndex: 3,
    },
    {
      prompt: 'Before merging a pile of intervals, the standard first move is…',
      choices: [
        'sort them by start',
        'sort them by length',
        'reverse them',
        'drop the shortest one',
      ],
      answerIndex: 0,
    },
  ],
  'math-geometry': [
    {
      prompt:
        'Rotating a square photo 90° clockwise sends its top-left corner to the…',
      choices: ['bottom-left', 'top-right', 'center', 'bottom-right'],
      answerIndex: 1,
    },
    {
      prompt: 'In grid[row][col], moving one cell to the RIGHT changes…',
      choices: ['col by +1', 'row by +1', 'both by +1', 'neither one'],
      answerIndex: 0,
    },
    {
      prompt: 'gcd(12, 18) — the largest number dividing both — is…',
      choices: ['3', '36', '2', '6'],
      answerIndex: 3,
    },
  ],
  'bit-manipulation': [
    {
      prompt: 'The number 5 written in binary is…',
      choices: ['110', '111', '101', '100'],
      answerIndex: 2,
    },
    {
      prompt: 'x XOR x always equals…',
      choices: ['x', '0', '1', '2x'],
      answerIndex: 1,
    },
    {
      prompt: 'Shifting a binary number left by one (x << 1) is the same as…',
      choices: [
        'dividing it by 2',
        'adding 1 to it',
        'squaring it',
        'multiplying it by 2',
      ],
      answerIndex: 3,
    },
  ],
}

/** The 3-question chat chain a district NPC runs for one track. */
export function districtQuestionChain(
  trackId: TrackId,
): readonly DistrictQuestion[] {
  return DISTRICT_QUESTIONS[trackId]
}
