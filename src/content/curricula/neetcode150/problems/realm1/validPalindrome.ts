import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const validPalindromeMissionSeed = {
  slug: 'valid-palindrome',
  estimatedMinutes: 19,
  mission: {
    title: 'The Mirror-Signal Gate',
    context:
      'An old gate accepts a transmission when its letters and digits mirror from both ends. Spaces, punctuation, and letter case are decorative noise.',
    prompt:
      'Decide whether the meaningful characters read the same forward and backward without building a cleaned copy.',
  },
  objective:
    'Compare meaningful characters with two inward-moving pointers.',
  priorKnowledge: [
    'isalnum() identifies letters and digits.',
    'lower() makes letter comparison case-insensitive.',
    'Two pointers can move from opposite ends.',
  ],
  recognitionCue:
    'The rule compares a sequence with its reverse while some characters must be skipped.',
  misconception:
    'Moving both pointers whenever either side is punctuation can skip a meaningful character on the other side.',
  algorithmSteps: [
    { id: 'place-pointers', instruction: 'Place left at the start and right at the end.' },
    { id: 'skip-left-noise', instruction: 'Move left inward while it points to a non-alphanumeric character.' },
    { id: 'skip-right-noise', instruction: 'Move right inward while it points to a non-alphanumeric character.' },
    { id: 'compare-pair', instruction: 'Compare the lowercase meaningful characters and return false if they differ.' },
    { id: 'move-inward', instruction: 'Move both pointers inward after a matching pair.' },
    { id: 'confirm-mirror', instruction: 'Return true when the pointers meet or cross.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(1)',
    explanation:
      'Each pointer crosses at most n characters, and the check stores only two indices.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'string',
      chars: 'N!o on',
      pointers: [
        { index: 0, label: 'left' },
        { index: 5, label: 'right' },
      ],
    },
  },
  workedExample: {
    prompt:
      'Trace “Was it a rat I saw?” The pointers skip spaces and ?, compare w/w, a/a, s/s, and continue until they cross.',
    code: [
      'def mirrors(text):',
      '    left, right = 0, len(text) - 1',
      '    while left < right:',
      '        while left < right and not text[left].isalnum(): left += 1',
      '        while left < right and not text[right].isalnum(): right -= 1',
      '        if text[left].lower() != text[right].lower(): return False',
      '        left += 1',
      '        right -= 1',
      '    return True',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'W and w match after lowercase conversion.',
      'The right pointer skips ?, and both pointers independently skip spaces.',
      'Every meaningful pair matches, so crossing pointers return true.',
    ],
    diagram: {
      kind: 'string',
      chars: 'Was it a rat I saw?',
      pointers: [
        { index: 0, label: 'W' },
        { index: 17, label: 'w' },
      ],
    },
  },
  patternCheck: {
    prompt:
      'How should the pointers react when the left side is a space but the right side is a letter?',
    options: [
      { id: 'move-left-only', label: 'Move only the left pointer until it reaches a letter or digit.' },
      { id: 'move-both', label: 'Move both pointers one step immediately.' },
      { id: 'reject-space', label: 'Return false because the characters differ.' },
      { id: 'move-right-only', label: 'Move only the right pointer and keep the space.' },
    ],
    correctOptionId: 'move-left-only',
    feedback: {
      correct: 'Yes. Each side skips its own noise independently before comparison.',
      incorrect: 'That can discard a meaningful character or treat noise as data.',
      secondIncorrect: 'Advance only the pointer currently resting on noise.',
    },
    hints: ['The right letter still needs a partner.', 'Skip loops are separate for left and right.'],
    diagram: {
      kind: 'string',
      chars: 'a  A',
      pointers: [
        { index: 1, label: 'left noise' },
        { index: 3, label: 'right letter' },
      ],
    },
  },
  retrievalCheck: {
    prompt:
      'Name the character test used to decide whether a pointer should stop skipping.',
    acceptedAnswers: [
      'isalnum',
      'isalnum()',
      'is alphanumeric',
      'letter or digit',
      'alphanumeric',
      '.isalnum()',
      '.isalnum',
      'a letter or digit',
      'letter or a digit',
      'is a letter or digit',
    ],
    placeholder: 'Type the test',
    feedback: {
      correct: 'Correct. Letters and digits participate; everything else is skipped.',
      incorrect: 'Name the Python check that accepts either a letter or a digit.',
      secondIncorrect: 'Use isalnum().',
    },
    hints: ['It begins with “is”.', 'It combines alphabetic and numeric.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the mirror scan so noise is skipped before each comparison.',
    feedback: {
      correct: 'Gate sequence restored. Independent skips protect every meaningful pair.',
      incorrect: 'Both skip loops must happen before lowercase comparison.',
      secondIncorrect: 'Place pointers, skip left, skip right, compare, move both, then confirm.',
    },
    hints: ['Comparison happens only on meaningful characters.', 'True comes after the pointers cross.'],
    diagram: { kind: 'string', chars: 'N!o on', pointers: [{ index: 1, label: 'skip' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Return true when data["signal"] mirrors after ignoring non-alphanumeric characters and letter case.',
    starterCode: `def solve(data):
    signal = data["signal"]
    left, right = 0, len(signal) - 1

    while left < right:
        # Skip noise on each side, then compare lowercase characters.
        pass

    return True`,
    cases: {
      visibleExample: { input: { signal: 'Never odd, or even!' }, expected: true },
      hiddenBoundary: { input: { signal: '...' }, expected: true },
      hiddenAdversarial: { input: { signal: 'Signal, is!' }, expected: false },
    },
    feedback: {
      correct: 'Gate opened! Your pointers ignore noise without losing meaningful characters.',
      incorrect: 'A mirror pair was mishandled. Recheck independent skips and lowercase comparison.',
      secondIncorrect: 'Use two guarded skip loops, compare lower(), return false on mismatch, then move both.',
    },
    hints: [
      'Keep left < right in each skip-loop condition.',
      'Call signal[index].isalnum().',
      'Only matching meaningful characters move both pointers.',
    ],
    diagram: {
      kind: 'string',
      chars: 'Race a car',
      pointers: [
        { index: 3, label: 'e' },
        { index: 5, label: 'a; mismatch' },
      ],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(validPalindromeMissionSeed)
export default problemLesson
