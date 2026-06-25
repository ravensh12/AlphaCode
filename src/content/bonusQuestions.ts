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

const BANK: Record<string, BonusQuestion[]> = {
  // Level 1 — Arrays & loops (Scan Beam: read every slot)
  'arrays-and-loops': [
    { prompt: 'You scan the row [3, 9, 2, 7]. What is the biggest number?', choices: ['9', '7', '3', '2'], answerIndex: 0 },
    { prompt: 'To find the largest value in a list, how many items must a loop check?', choices: ['Every item', 'Only the first', 'Only the last', 'Just the middle'], answerIndex: 0 },
    { prompt: 'Scanning [4, 1, 8, 6], which value is the smallest?', choices: ['1', '4', '6', '8'], answerIndex: 0 },
  ],

  // Level 2 — Strings (Char Reader: walk letters / palindromes)
  strings: [
    { prompt: 'Which word reads the same forwards and backwards?', choices: ['level', 'apple', 'stack', 'robot'], answerIndex: 0 },
    { prompt: 'How many letters are in the string "CODE"?', choices: ['4', '3', '5', '2'], answerIndex: 0 },
    { prompt: 'To check a palindrome, you compare letters from…', choices: ['both ends inward', 'the left only', 'the right only', 'random spots'], answerIndex: 0 },
  ],

  // Level 3 — Hash maps (Recall Crystal: store + instant lookup, two-sum)
  'hash-maps': [
    { prompt: 'A hash map can look up a stored value in about…', choices: ['one step', 'every step', 'half the steps', 'two passes'], answerIndex: 0 },
    { prompt: 'The target is 10 and you have already seen 6. Which partner sums to the target?', choices: ['4', '6', '10', '2'], answerIndex: 0 },
    { prompt: 'A hash map stores each value under a…', choices: ['key', 'color', 'bracket', 'pointer'], answerIndex: 0 },
  ],

  // Level 4 — Two pointers (Double Step: scan inward from both ends)
  'two-pointers': [
    { prompt: 'Two pointers usually start at the…', choices: ['two ends', 'same spot', 'middle', 'top'], answerIndex: 0 },
    { prompt: 'Sorted [1, 3, 5, 8], target 9. Left = 1, right = 8 — their sum is 9, so that is…', choices: ['a match', 'too big', 'too small', 'skipped'], answerIndex: 0 },
    { prompt: 'If a pair’s sum is too big, you move the…', choices: ['right pointer inward', 'left pointer outward', 'both pointers right', 'neither pointer'], answerIndex: 0 },
  ],

  // Level 5 — Stacks (Top Loader: LIFO / bracket matching)
  stacks: [
    { prompt: 'A stack removes items in what order?', choices: ['last in, first out', 'first in, first out', 'random order', 'sorted order'], answerIndex: 0 },
    { prompt: 'You push A, then B, then C onto a stack. Which pops off first?', choices: ['C', 'A', 'B', 'none'], answerIndex: 0 },
    { prompt: 'Matching brackets, you reach a ")". You should…', choices: ['pop the last "("', 'push it on top', 'ignore it', 'clear the stack'], answerIndex: 0 },
  ],

  // Level 6 — Binary search (Split Sight: halve the range)
  'binary-search': [
    { prompt: 'Each binary search step throws away about…', choices: ['half the range', 'one item', 'nothing', 'all but one'], answerIndex: 0 },
    { prompt: 'Binary search only works when the data is…', choices: ['sorted', 'reversed', 'empty', 'random'], answerIndex: 0 },
    { prompt: 'Searching sorted [1…16], your first guess checks the…', choices: ['middle', 'first', 'last', 'second'], answerIndex: 0 },
  ],
}

/** A random bonus question for a level, or null if none are defined. */
export function getBonusQuestion(worldId: string): BonusQuestion | null {
  const qs = BANK[worldId]
  if (!qs || qs.length === 0) return null
  return qs[Math.floor(Math.random() * qs.length)]
}
