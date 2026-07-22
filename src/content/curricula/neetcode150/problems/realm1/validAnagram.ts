import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const validAnagramMissionSeed = {
  slug: 'valid-anagram',
  estimatedMinutes: 19,
  mission: {
    title: 'The Scrambled Comet Call',
    context:
      'Two research crews send call signs made from lowercase signal tiles. A gust may have shuffled one tray, but it cannot create or remove tiles.',
    prompt:
      'Decide whether the second call sign uses exactly the same letters, with exactly the same counts, as the first.',
  },
  objective:
    'Compare two strings by building and balancing a frequency map.',
  priorKnowledge: [
    'A dictionary can map a letter to its count.',
    'Strings can be scanned one character at a time.',
    'Different lengths cannot have equal character counts.',
  ],
  recognitionCue:
    'Order does not matter, but every item and its number of appearances must match.',
  misconception:
    'A set only records which letters exist, so it misses count differences such as aab versus abb.',
  algorithmSteps: [
    { id: 'reject-lengths', instruction: 'Return false if the two call signs have different lengths.' },
    { id: 'count-first', instruction: 'Count every letter in the first call sign.' },
    { id: 'spend-second', instruction: 'For each letter in the second sign, subtract one from its count.' },
    { id: 'reject-shortage', instruction: 'Return false if a needed letter has no count left.' },
    { id: 'confirm-balance', instruction: 'After the scan, return true because every count balanced.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(k)',
    explanation:
      'Both length-n strings are scanned once, and the map stores at most k distinct letters.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'c', value: 1 },
        { key: 'i', value: 1 },
        { key: 'd', value: 1 },
        { key: 'e', value: 1 },
        { key: 'r', value: 1 },
      ],
      lookup: 'r',
    },
  },
  workedExample: {
    prompt:
      'Compare “cider” with “cried.” Count cider, then spend one count for each letter in cried. No count drops below zero.',
    code: [
      'def same_tiles(first, second):',
      '    if len(first) != len(second): return False',
      '    counts = {}',
      '    for ch in first: counts[ch] = counts.get(ch, 0) + 1',
      '    for ch in second:',
      '        if counts.get(ch, 0) == 0: return False',
      '        counts[ch] -= 1',
      '    return True',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'cider creates five letter counts of 1.',
      'c, r, i, and e each spend an available count.',
      'd spends the last count, so every tile has a partner.',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'c', value: 0 },
        { key: 'i', value: 0 },
        { key: 'd', value: 0 },
        { key: 'e', value: 0 },
        { key: 'r', value: 0 },
      ],
    },
  },
  patternCheck: {
    prompt:
      'Which plan can tell “aab” apart from “abb” while ignoring letter order?',
    options: [
      { id: 'balance-counts', label: 'Count letters in one word and spend those counts with the other.' },
      { id: 'compare-sets', label: 'Compare only the set of different letters in each word.' },
      { id: 'compare-positions', label: 'Require matching letters at every position.' },
      { id: 'compare-sums', label: 'Add letter codes and compare only the two totals.' },
    ],
    correctOptionId: 'balance-counts',
    feedback: {
      correct: 'Yes. Frequency counts preserve multiplicity without caring about order.',
      incorrect: 'That plan loses either counts or the freedom to rearrange letters.',
      secondIncorrect: 'Track how many copies of each letter are available, not just whether it appears.',
    },
    hints: ['The two words may be shuffled.', 'A repeated letter needs a repeated count.'],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'a', value: 2 },
        { key: 'b', value: 1 },
      ],
      lookup: 'b',
    },
  },
  retrievalCheck: {
    prompt:
      'Complete the rule: when scanning the second call sign, each letter must ______ its stored count.',
    acceptedAnswers: [
      'subtract one from',
      'decrement',
      'spend one from',
      'reduce by one',
      'subtract 1 from',
      'reduce by 1',
      'decrease by one',
      'decrease by 1',
      'decrement by one',
      'take one from',
    ],
    placeholder: 'Type the count update',
    feedback: {
      correct: 'Right. A negative or missing supply proves the counts differ.',
      incorrect: 'Name the one-step update applied to the matching frequency.',
      secondIncorrect: 'Use “subtract one from” or “decrement.”',
    },
    hints: ['The first scan builds supply.', 'The second scan uses that supply.'],
  },
  reconstructionCheck: {
    prompt:
      'Put the call-sign checker in order from the quick length check to the final decision.',
    feedback: {
      correct: 'Correct. The map starts with supply and the second scan safely spends it.',
      incorrect: 'Build the counts before trying to spend them.',
      secondIncorrect: 'Check lengths, count the first sign, scan and reject shortages, then confirm.',
    },
    hints: ['The cheapest rejection comes first.', 'A shortage check belongs inside the second scan.'],
    diagram: { kind: 'string', chars: 'cried', pointers: [{ index: 4, label: 'scan' }], visited: [0, 1, 2, 3] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["original"] and data["scrambled"], then return true only when their lowercase letter tiles match exactly.',
    starterCode: `def solve(data):
    original = data["original"]
    scrambled = data["scrambled"]
    if len(original) != len(scrambled):
        return False

    counts = {}
    # Build counts, then spend them while scanning scrambled.
    return False`,
    cases: {
      visibleExample: { input: { original: 'cider', scrambled: 'cried' }, expected: true },
      hiddenBoundary: { input: { original: '', scrambled: '' }, expected: true },
      hiddenAdversarial: { input: { original: 'aacc', scrambled: 'ccca' }, expected: false },
    },
    feedback: {
      correct: 'Signal restored! Your frequency map handles shuffles, repeats, and empty signs.',
      incorrect: 'A tile count did not balance. Check lengths, missing letters, and repeated letters.',
      secondIncorrect: 'Count original, then reject when scrambled asks for a zero count; otherwise decrement.',
    },
    hints: [
      'Use counts.get(ch, 0) when building and checking.',
      'Return false as soon as the second word has no copy left.',
      'Equal lengths plus no shortage means every count balanced.',
    ],
    diagram: { kind: 'string', chars: 'cider', pointers: [{ index: 0, label: 'count' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(validAnagramMissionSeed)
export default problemLesson
