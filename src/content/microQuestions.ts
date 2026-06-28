/**
 * Micro-questions — one-shot retrieval questions keyed by ConceptId.
 *
 * These power the in-world "Knowledge Surge" (knowledge-zombies): when the
 * learner destroys a Glitch carrying a concept they're weak on or due to review,
 * a quick question pops up. Getting it right is spaced-repetition practice folded
 * directly into the action — the variety of the run is driven by the learner's
 * own weaknesses, so no two players (or sessions) face the same mix.
 */

import type { ConceptId } from '../types/lesson'

export type MicroQuestion = {
  concept: ConceptId
  prompt: string
  choices: string[]
  /** Index into `choices` of the correct answer. */
  answerIndex: number
}

const BANK: Record<ConceptId, MicroQuestion[]> = {
  variables: [
    { concept: 'variables', prompt: 'x = 5, then x = x + 3. What is x now?', choices: ['8', '5', '3', '53'], answerIndex: 0 },
    { concept: 'variables', prompt: 'A variable is best described as…', choices: ['a named box that holds a value', 'a kind of loop', 'a sorted list', 'a function'], answerIndex: 0 },
  ],
  loops: [
    { concept: 'loops', prompt: 'for i in range(3): how many times does the body run?', choices: ['3', '2', '4', '1'], answerIndex: 0 },
    { concept: 'loops', prompt: 'A loop that visits every item of an n-length list does about how much work?', choices: ['n steps', '1 step', 'n² steps', 'half a step'], answerIndex: 0 },
  ],
  arrays: [
    { concept: 'arrays', prompt: 'In nums = [4, 9, 2], what is nums[0]?', choices: ['4', '9', '2', '0'], answerIndex: 0 },
    { concept: 'arrays', prompt: 'Scanning [3, 8, 5, 1] for the largest, what do you get?', choices: ['8', '5', '3', '1'], answerIndex: 0 },
    { concept: 'arrays', prompt: 'The last valid index of a 5-item array is…', choices: ['4', '5', '0', '1'], answerIndex: 0 },
  ],
  strings: [
    { concept: 'strings', prompt: 'Which word is a palindrome?', choices: ['racecar', 'planet', 'coding', 'zombie'], answerIndex: 0 },
    { concept: 'strings', prompt: 'How many characters are in "HELLO"?', choices: ['5', '4', '6', '3'], answerIndex: 0 },
    { concept: 'strings', prompt: 'To check a palindrome you compare characters from…', choices: ['both ends inward', 'left only', 'random spots', 'the middle out'], answerIndex: 0 },
  ],
  hashMaps: [
    { concept: 'hashMaps', prompt: 'A hash map looks up a stored value in about…', choices: ['one step', 'n steps', 'half the list', 'two passes'], answerIndex: 0 },
    { concept: 'hashMaps', prompt: 'Target 10, you have seen 7. Which partner completes the pair?', choices: ['3', '7', '10', '17'], answerIndex: 0 },
    { concept: 'hashMaps', prompt: 'A hash map stores each value under a…', choices: ['key', 'pointer', 'bracket', 'color'], answerIndex: 0 },
  ],
  twoPointers: [
    { concept: 'twoPointers', prompt: 'Two pointers on a sorted array usually start at the…', choices: ['two ends', 'same spot', 'middle', 'top only'], answerIndex: 0 },
    { concept: 'twoPointers', prompt: 'Sorted, sum too big. Which pointer moves inward?', choices: ['the right one', 'the left one', 'both outward', 'neither'], answerIndex: 0 },
  ],
  stacks: [
    { concept: 'stacks', prompt: 'A stack removes items in what order?', choices: ['last in, first out', 'first in, first out', 'sorted', 'random'], answerIndex: 0 },
    { concept: 'stacks', prompt: 'Push A, B, C. Which pops first?', choices: ['C', 'A', 'B', 'none'], answerIndex: 0 },
    { concept: 'stacks', prompt: 'Matching brackets, you see ")" — you should…', choices: ['pop the last "("', 'push it', 'ignore it', 'clear all'], answerIndex: 0 },
  ],
  binarySearch: [
    { concept: 'binarySearch', prompt: 'Each binary search step throws away about…', choices: ['half the range', 'one item', 'nothing', 'all but one'], answerIndex: 0 },
    { concept: 'binarySearch', prompt: 'Binary search needs the data to be…', choices: ['sorted', 'reversed', 'random', 'empty'], answerIndex: 0 },
    { concept: 'binarySearch', prompt: 'First guess in binary search checks the…', choices: ['middle', 'first', 'last', 'second'], answerIndex: 0 },
  ],
}

/** A random micro-question for a concept (or null if none defined). */
export function getMicroQuestion(concept: ConceptId): MicroQuestion | null {
  const qs = BANK[concept]
  if (!qs || qs.length === 0) return null
  return qs[Math.floor(Math.random() * qs.length)]
}
