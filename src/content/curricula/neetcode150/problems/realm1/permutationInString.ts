import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const permutationInStringMissionSeed = {
  slug: 'permutation-in-string',
  estimatedMinutes: 22,
  mission: {
    title: 'The Shuffled Access Chant',
    context:
      'A vault key is a lowercase chant. The listening channel may hide the key’s letters in any order, but they must occupy one uninterrupted block with exact counts.',
    prompt:
      'Return whether any channel window is a rearrangement of the key.',
  },
  objective:
    'Slide a fixed-size frequency window and compare it with the key inventory.',
  priorKnowledge: [
    'Rearrangements preserve character frequencies.',
    'A matching block must have the same length as the key.',
    'A fixed window removes one character whenever it adds one.',
  ],
  recognitionCue:
    'You need to detect whether some fixed-length substring has exactly the same character counts as a pattern.',
  misconception:
    'Matching only the set of letters accepts windows with the wrong number of repeated letters.',
  algorithmSteps: [
    { id: 'reject-short-channel', instruction: 'Return false if the key is longer than the channel.' },
    { id: 'count-key-window', instruction: 'Count letters in the key and in the first equal-length channel window.' },
    { id: 'check-first-window', instruction: 'Return true if the two count arrays match.' },
    { id: 'slide-window', instruction: 'Move right one step, adding the incoming letter and removing the outgoing letter.' },
    { id: 'check-each-window', instruction: 'After each slide, return true when all frequencies match.' },
    { id: 'finish-absent', instruction: 'Return false if no fixed-length window matches.' },
  ],
  complexity: {
    time: 'O(n + a)',
    space: 'O(a)',
    explanation:
      'The channel is scanned once; comparing fixed 26-letter arrays is constant alphabet work, with two arrays of size a.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'string',
      chars: 'xxtsudq',
      pointers: [
        { index: 2, label: 'window left' },
        { index: 5, label: 'window right' },
      ],
      visited: [0, 1],
    },
  },
  workedExample: {
    prompt:
      'Key “dust” has one each of d, u, s, t. In channel “xxtsudq”, the four-letter window “tsud” has exactly those counts.',
    code: [
      'def hidden(key, channel):',
      '    if len(key) > len(channel): return False',
      '    need = [0] * 26; window = [0] * 26',
      '    for i in range(len(key)):',
      '        need[ord(key[i]) - 97] += 1',
      '        window[ord(channel[i]) - 97] += 1',
      '    if need == window: return True',
      '    for right in range(len(key), len(channel)):',
      '        window[ord(channel[right]) - 97] += 1',
      '        window[ord(channel[right - len(key)]) - 97] -= 1',
      '        if need == window: return True',
      '    return False',
    ],
    currentLineIndex: 9,
    walkthrough: [
      'The first window xxts does not match the key counts.',
      'Each slide adds the new right letter and removes the letter four positions behind.',
      'Window tsud matches all 26 frequency slots, so the vault detects the chant.',
    ],
    diagram: { kind: 'string', chars: 'xxtsudq', pointers: [{ index: 2, label: 't' }, { index: 5, label: 'd' }], visited: [0, 1] },
  },
  patternCheck: {
    prompt:
      'What must stay constant as the channel window slides?',
    options: [
      { id: 'key-length', label: 'Its length stays equal to the key length.' },
      { id: 'first-letter', label: 'Its first letter must always equal the key’s first letter.' },
      { id: 'sorted-channel', label: 'The entire channel must remain alphabetically sorted.' },
      { id: 'growing-window', label: 'The window grows by one on every step and never removes letters.' },
    ],
    correctOptionId: 'key-length',
    feedback: {
      correct: 'Correct. A rearrangement has exactly the same number of characters as the key.',
      incorrect: 'Rearrangement changes order, but not total length or counts.',
      secondIncorrect: 'Add one incoming character and remove one outgoing character each slide.',
    },
    hints: ['A key of length 4 needs four channel characters.', 'One enters as one leaves.'],
    diagram: { kind: 'string', chars: 'zzcabx', pointers: [{ index: 2, label: 'left' }, { index: 4, label: 'right' }] },
  },
  retrievalCheck: {
    prompt:
      'Complete the slide update: add channel[right], then remove channel[______].',
    acceptedAnswers: [
      'right - len(key)',
      'right-len(key)',
      'right minus key length',
      'right - key_length',
      'right minus len(key)',
      'right minus the key length',
      'right - key length',
      'right - m',
      'right-m',
    ],
    placeholder: 'outgoing index',
    feedback: {
      correct: 'Right. That character sits exactly one full key length behind the new right edge.',
      incorrect: 'Use the right index and the fixed key length.',
      secondIncorrect: 'Remove channel[right - len(key)].',
    },
    hints: ['The window length cannot change.', 'The outgoing index is m positions behind right.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the vault detector from the short-channel check through the final false result.',
    feedback: {
      correct: 'Detector restored. Every possible key-sized window is checked once.',
      incorrect: 'Build and check the first window before sliding.',
      secondIncorrect: 'Reject short, count, check first, slide, check each, finish false.',
    },
    hints: ['There is one fewer slide than total windows.', 'True may return after any comparison.'],
    diagram: { kind: 'string', chars: 'zzcabx', pointers: [{ index: 2, label: 'c' }, { index: 4, label: 'b' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read lowercase data["key"] and data["channel"]. Return true when a key-sized channel block has identical letter counts.',
    starterCode: `def solve(data):
    key = data["key"]
    channel = data["channel"]
    if len(key) > len(channel):
        return False

    need = [0] * 26
    window = [0] * 26
    # Count the first window, compare it, then slide one letter at a time.
    return False`,
    cases: {
      visibleExample: { input: { key: 'abc', channel: 'zzcabx' }, expected: true },
      hiddenBoundary: { input: { key: 'star', channel: 'sta' }, expected: false },
      hiddenAdversarial: { input: { key: 'aabc', channel: 'zzabccyy' }, expected: false },
    },
    feedback: {
      correct: 'Chant detected correctly! Fixed-size counts handle order and repeated letters.',
      incorrect: 'A window was missed or miscounted. Recheck first-window setup and outgoing index.',
      secondIncorrect: 'Count m letters; compare; for right from m, add right and remove right-m, then compare.',
    },
    hints: [
      'Map a lowercase letter with ord(ch) - ord("a").',
      'Check the first window before the slide loop.',
      'Python lists compare element by element.',
    ],
    diagram: { kind: 'string', chars: 'zzabccyy', pointers: [{ index: 2, label: 'a' }, { index: 5, label: 'c; wrong counts' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(permutationInStringMissionSeed)
export default problemLesson
