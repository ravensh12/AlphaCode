import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const slidingWindowMaximumMissionSeed = {
  slug: 'sliding-window-maximum',
  estimatedMinutes: 26,
  mission: {
    title: 'The Storm-Strength Watch',
    context:
      'A weather drone records one storm strength per minute. For every block of k consecutive minutes, the station needs the strongest reading.',
    prompt:
      'Return each block maximum using a deque that keeps only useful candidate indices.',
  },
  objective:
    'Maintain a decreasing deque so the current window maximum is always at the front.',
  priorKnowledge: [
    'A deque removes and adds at both ends.',
    'Indices reveal when a reading leaves the window.',
    'A newer larger value makes smaller trailing values useless.',
  ],
  recognitionCue:
    'You need a maximum for every overlapping fixed-size window, so rescanning each window repeats work.',
  misconception:
    'Storing only values makes it hard to tell whether the front maximum belongs to an expired position.',
  algorithmSteps: [
    { id: 'open-deque', instruction: 'Create an empty deque of candidate indices and an empty answer.' },
    { id: 'expire-front', instruction: 'For each right index, remove the front while it lies before the current window.' },
    { id: 'remove-weaker', instruction: 'Remove back indices while their readings are no larger than the incoming reading.' },
    { id: 'append-right', instruction: 'Append the incoming right index.' },
    { id: 'emit-maximum', instruction: 'Once a full window exists, append the reading at the deque front.' },
    { id: 'return-maxima', instruction: 'Return all emitted maxima after the scan.' },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(k)',
    explanation:
      'Each index enters and leaves the deque at most once, and the deque holds no more than one window.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [2, 6, 1, 5, 3],
      highlight: 3,
      pointers: [
        { index: 1, label: 'deque front 6' },
        { index: 3, label: 'incoming 5' },
      ],
      visited: [0],
    },
  },
  workedExample: {
    prompt:
      'For readings [2, 6, 1, 5, 3] and k = 3, the first maximum is 6. When 5 arrives, it removes weaker 1 but stays behind 6; after 6 expires, 5 becomes front.',
    code: [
      'from collections import deque',
      'def strongest(readings, k):',
      '    candidates = deque(); answer = []',
      '    for right, value in enumerate(readings):',
      '        while candidates and candidates[0] <= right - k: candidates.popleft()',
      '        while candidates and readings[candidates[-1]] <= value: candidates.pop()',
      '        candidates.append(right)',
      '        if right >= k - 1: answer.append(readings[candidates[0]])',
      '    return answer',
    ],
    currentLineIndex: 5,
    walkthrough: [
      'Reading 6 removes 2 from the back because 2 can never win a later shared window.',
      'Reading 1 stays behind 6, but incoming 5 removes 1.',
      'When index 1 expires, index 3 with value 5 is already waiting at the front.',
    ],
    diagram: { kind: 'array', values: ['6@1', '5@3'], highlight: 0, pointers: [{ index: 0, label: 'front maximum' }] },
  },
  patternCheck: {
    prompt:
      'Why may an incoming value remove smaller values from the deque back?',
    options: [
      { id: 'newer-and-larger', label: 'It is both newer and at least as large, so those values expire sooner and never win.' },
      { id: 'older-is-better', label: 'Older smaller values always become maximum later.' },
      { id: 'sort-whole-input', label: 'Removing them sorts the entire readings list.' },
      { id: 'window-shrinks', label: 'The window size decreases whenever a large value arrives.' },
    ],
    correctOptionId: 'newer-and-larger',
    feedback: {
      correct: 'Exactly. The incoming reading dominates weaker trailing candidates.',
      incorrect: 'That does not explain why a candidate can never be a future window maximum.',
      secondIncorrect: 'A newer value that is no smaller lasts longer and wins every shared window.',
    },
    hints: ['Compare both value and expiration time.', 'The back candidates are older than the incoming index.'],
    diagram: { kind: 'array', values: [7, 3, 5], pointers: [{ index: 1, label: 'remove 3' }, { index: 2, label: 'incoming 5' }] },
  },
  retrievalCheck: {
    prompt:
      'Write the condition showing the deque-front index has expired for current right and window size k.',
    acceptedAnswers: [
      'candidates[0] <= right - k',
      'front <= right - k',
      'deque[0] <= right-k',
      'front index is at most right minus k',
      'candidates[0] <= right-k',
      'candidates[0]<=right-k',
      'deque[0] <= right - k',
      'front <= right-k',
      'candidates[0] is at most right minus k',
    ],
    placeholder: 'expired when ...',
    feedback: {
      correct: 'Right. Valid indices begin at right - k + 1.',
      incorrect: 'Compare the oldest index with the position just before the current window start.',
      secondIncorrect: 'Use candidates[0] <= right - k.',
    },
    hints: ['The current window starts at right - k + 1.', 'Anything smaller than that start is expired.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the storm watcher from empty deque through all emitted maxima.',
    feedback: {
      correct: 'Storm watcher restored. The deque stays valid, decreasing, and ready at its front.',
      incorrect: 'Expired indices and weaker trailing indices must leave before the new index enters.',
      secondIncorrect: 'Open, expire front, remove weaker back, append right, emit, return.',
    },
    hints: ['The front handles age; the back handles strength.', 'Emit only after k readings exist.'],
    diagram: { kind: 'array', values: [9, 8, 7, 6, 5], highlight: 2, pointers: [{ index: 1, label: 'front for window' }, { index: 2, label: 'right' }] },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read data["readings"] and positive data["k"]. Return the maximum reading for every consecutive k-item window.',
    starterCode: `from collections import deque

def solve(data):
    readings = data["readings"]
    k = data["k"]
    candidates = deque()
    answer = []

    # Scan indices, expire the front, remove weaker backs, and emit.
    return answer`,
    cases: {
      visibleExample: { input: { readings: [4, 2, 12, 3, 8, 7], k: 3 }, expected: [12, 12, 12, 8] },
      hiddenBoundary: { input: { readings: [6], k: 1 }, expected: [6] },
      hiddenAdversarial: { input: { readings: [9, 8, 7, 6, 5], k: 2 }, expected: [9, 8, 7, 6] },
    },
    feedback: {
      correct: 'Storm watch online! The monotonic deque handles peaks, single windows, and falling runs.',
      incorrect: 'A maximum is missing or stale. Recheck expiration, back removal, and emit timing.',
      secondIncorrect: 'For each right: popleft expired, pop <= incoming, append right, emit front when right>=k-1.',
    },
    hints: [
      'Store indices, not reading values.',
      'Use two while loops before append.',
      'The maximum value is readings[candidates[0]].',
    ],
    diagram: { kind: 'array', values: [4, 2, 12, 3, 8, 7], pointers: [{ index: 2, label: '12 at front' }, { index: 4, label: 'right' }] },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(slidingWindowMaximumMissionSeed)
export default problemLesson
