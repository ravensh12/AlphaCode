/**
 * Mid-fight "Bonus Strike" questions for each boss. One is drawn at random when
 * the boss hits half health — answer it right to blast 30% off its HP. Each
 * question is pulled from the concept that level teaches, so it reinforces the
 * lesson the player just trained on (no new persistence, purely in-fight).
 */

export type BonusQuestion = {
  prompt: string
  choices: string[]
  /** Index into `choices` of the correct answer. */
  answerIndex: number
}

// Correct answers are deliberately spread across positions — the UI shows
// choices in authored order, so a fixed position would leak the answer.
const BANK: Record<string, BonusQuestion[]> = {
  // Level 1 — Arrays & loops (Scan Beam: read every slot)
  'arrays-and-loops': [
    { prompt: 'You scan the row [3, 9, 2, 7]. What is the biggest number?', choices: ['7', '9', '3', '2'], answerIndex: 1 },
    { prompt: 'To find the largest value in a list, how many items must a loop check?', choices: ['Only the first', 'Only the last', 'Every item', 'Just the middle'], answerIndex: 2 },
    { prompt: 'Scanning [4, 1, 8, 6], which value is the smallest?', choices: ['4', '6', '8', '1'], answerIndex: 3 },
  ],

  // Level 2 — Strings (Char Reader: walk letters / palindromes)
  strings: [
    { prompt: 'Which word reads the same forwards and backwards?', choices: ['level', 'apple', 'stack', 'robot'], answerIndex: 0 },
    { prompt: 'How many letters are in the string "CODE"?', choices: ['3', '4', '5', '2'], answerIndex: 1 },
    { prompt: 'To check a palindrome, you compare letters from…', choices: ['the left only', 'the right only', 'both ends inward', 'random spots'], answerIndex: 2 },
  ],

  // Level 3 — Hash maps (Recall Crystal: store + instant lookup, two-sum)
  'hash-maps': [
    { prompt: 'A hash map can look up a stored value in about…', choices: ['every step', 'half the steps', 'two passes', 'one step'], answerIndex: 3 },
    { prompt: 'The target is 10 and you have already seen 6. Which partner sums to the target?', choices: ['4', '6', '10', '2'], answerIndex: 0 },
    { prompt: 'A hash map stores each value under a…', choices: ['color', 'key', 'bracket', 'pointer'], answerIndex: 1 },
  ],

  // Level 4 — Two pointers (Double Step: scan inward from both ends)
  'two-pointers': [
    { prompt: 'Two pointers usually start at the…', choices: ['same spot', 'middle', 'two ends', 'top'], answerIndex: 2 },
    { prompt: 'Sorted [1, 3, 5, 8], target 9. Left = 1, right = 8 — their sum is 9, so that is…', choices: ['too big', 'too small', 'skipped', 'a match'], answerIndex: 3 },
    { prompt: 'If a pair’s sum is too big, you move the…', choices: ['right pointer inward', 'left pointer outward', 'both pointers right', 'neither pointer'], answerIndex: 0 },
  ],

  // Level 5 — Stacks (Top Loader: LIFO / bracket matching)
  stacks: [
    { prompt: 'A stack removes items in what order?', choices: ['first in, first out', 'last in, first out', 'random order', 'sorted order'], answerIndex: 1 },
    { prompt: 'You push A, then B, then C onto a stack. Which pops off first?', choices: ['A', 'B', 'C', 'none'], answerIndex: 2 },
    { prompt: 'Matching brackets, you reach a ")". You should…', choices: ['push it on top', 'ignore it', 'clear the stack', 'pop the last "("'], answerIndex: 3 },
  ],

  // Level 6 — Binary search (Split Sight: halve the range)
  'binary-search': [
    { prompt: 'Each binary search step throws away about…', choices: ['half the range', 'one item', 'nothing', 'all but one'], answerIndex: 0 },
    { prompt: 'Binary search only works when the data is…', choices: ['reversed', 'sorted', 'empty', 'random'], answerIndex: 1 },
    { prompt: 'Searching sorted [1…16], your first guess checks the…', choices: ['first', 'last', 'middle', 'second'], answerIndex: 2 },
  ],
}

/** A random bonus question for a level, or null if none are defined. */
export function getBonusQuestion(worldId: string): BonusQuestion | null {
  const qs = BANK[worldId]
  if (!qs || qs.length === 0) return null
  return qs[Math.floor(Math.random() * qs.length)]
}
