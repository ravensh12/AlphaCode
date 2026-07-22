import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const groupAnagramsMissionSeed = {
  slug: 'group-anagrams',
  estimatedMinutes: 23,
  mission: {
    title: 'The Windblown Word Shelves',
    context:
      'Sky Library labels are made from lowercase letter tiles. Wind scrambled some labels, and the librarian wants labels built from the same tile inventory shelved together.',
    prompt:
      'Group the labels by exact letter counts. Group and label order do not affect correctness.',
  },
  objective:
    'Group strings with a shared immutable frequency signature.',
  priorKnowledge: [
    'Equal letter inventories have equal frequency counts.',
    'Dictionary keys must be hashable.',
    'Lists can collect several words under one key.',
  ],
  recognitionCue:
    'Many strings must be divided into groups where order changes but character counts do not.',
  misconception:
    'Using the set of letters as a key merges labels such as “abb” and “aab,” whose counts differ.',
  algorithmSteps: [
    { id: 'open-groups', instruction: 'Create an insertion-ordered map from signature to label list.' },
    { id: 'count-label', instruction: 'Build a 26-slot lowercase letter count for each label.' },
    { id: 'freeze-signature', instruction: 'Convert that count list to a tuple so it can be a map key.' },
    { id: 'append-label', instruction: 'Append the original label to the list for its signature.' },
    { id: 'return-groups', instruction: 'Return the map’s group lists in first-signature order.' },
  ],
  complexity: {
    time: 'O(w · l)',
    space: 'O(w · l)',
    explanation:
      'For w labels of maximum length l, every character is counted once; stored labels and groups use linear total space.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'a1 c1 r1', value: 'arc, car, rac' },
        { key: 'm1 n1 o2', value: 'moon' },
      ],
      lookup: 'a1 c1 r1',
    },
  },
  workedExample: {
    prompt:
      'Labels [“arc”, “car”, “moon”, “rac”] produce two signatures. The first, second, and fourth labels share counts a1-c1-r1.',
    code: [
      'def shelve(labels):',
      '    groups = {}',
      '    for label in labels:',
      '        counts = [0] * 26',
      '        for ch in label: counts[ord(ch) - ord("a")] += 1',
      '        key = tuple(counts)',
      '        groups.setdefault(key, []).append(label)',
      '    return list(groups.values())',
    ],
    currentLineIndex: 6,
    walkthrough: [
      'arc creates a new signature and starts the first shelf.',
      'car has the same count tuple, so it joins that shelf.',
      'moon starts another shelf; rac later returns to the first.',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'a1 c1 r1', value: 'arc, car, rac' },
        { key: 'm1 n1 o2', value: 'moon' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'What is the safest key for grouping lowercase labels that may contain repeated letters?',
    options: [
      { id: 'count-tuple', label: 'A tuple of 26 letter counts.' },
      { id: 'letter-set', label: 'A set of the different letters.' },
      { id: 'word-length', label: 'Only the total number of letters.' },
      { id: 'first-letter', label: 'The label’s first character.' },
    ],
    correctOptionId: 'count-tuple',
    feedback: {
      correct: 'Correct. Equal tuples mean every letter count matches.',
      incorrect: 'That key can collide for labels with different tile inventories.',
      secondIncorrect: 'The key must preserve one count for each lowercase letter.',
    },
    hints: ['“abb” and “aab” need different keys.', 'A tuple is hashable; a count list is not.'],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: 'a1 b2', value: 'abb, bab' },
        { key: 'a2 b1', value: 'aab' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Name the information that must become the immutable dictionary key for each label.',
    acceptedAnswers: [
      'letter count tuple',
      'tuple of letter counts',
      'frequency signature',
      'character frequency tuple',
      'frequency tuple',
      'count tuple',
      'tuple of counts',
      'letter frequency tuple',
      'tuple of 26 letter counts',
      'letter counts as a tuple',
    ],
    placeholder: 'Type the grouping key',
    feedback: {
      correct: 'Exactly. The signature ignores order but keeps multiplicity.',
      incorrect: 'Describe both the counts and the hashable form used as the key.',
      secondIncorrect: 'Answer “tuple of letter counts.”',
    },
    hints: ['It has one slot per lowercase letter.', 'Freeze the list before using it as a key.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the shelf sorter from empty map through returned groups.',
    feedback: {
      correct: 'Shelves restored. Each label is counted, keyed, and appended exactly once.',
      incorrect: 'A mutable count list cannot be used before it is converted to a tuple.',
      secondIncorrect: 'Open groups, count a label, freeze the signature, append, then return.',
    },
    hints: ['The signature is made inside the label loop.', 'Return only after all labels are grouped.'],
    diagram: { kind: 'array', values: ['arc', 'car', 'moon', 'rac'], highlight: 3, visited: [0, 1, 2] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Group lowercase data["labels"] by exact letter inventory. Any group order is accepted.',
    starterCode: `def solve(data):
    labels = data["labels"]
    groups = {}

    for label in labels:
        counts = [0] * 26
        # Count label, freeze the key, and append to its group.
        pass

    return list(groups.values())`,
    cases: {
      visibleExample: {
        input: { labels: ['arc', 'car', 'moon', 'rac', 'on'] },
        expected: [['arc', 'car', 'rac'], ['moon'], ['on']],
      },
      hiddenBoundary: { input: { labels: [] }, expected: [] },
      hiddenAdversarial: {
        input: { labels: ['', 'b', '', 'bb', 'b'] },
        expected: [['', ''], ['b', 'b'], ['bb']],
      },
    },
    comparator: { kind: 'unordered' },
    feedback: {
      correct: 'Shelves sorted! Empty labels and repeated labels land in the right groups.',
      incorrect: 'A label reached the wrong shelf or order changed. Recheck the full count signature.',
      secondIncorrect: 'Count with ord(ch)-ord("a"), use tuple(counts), then setdefault(key, []).append(label).',
    },
    hints: [
      'Reset counts for every label.',
      'Use a tuple, not the mutable list, as the key.',
      'Python dictionaries preserve first key insertion order.',
    ],
    diagram: { kind: 'array', values: ['arc', 'car', 'moon', 'rac'], highlight: 1, pointers: [{ index: 1, label: 'same key' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(groupAnagramsMissionSeed)
export default problemLesson
