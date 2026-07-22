import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const meetingRoomsIIMissionSeed = {
  slug: 'meeting-rooms-ii',
  estimatedMinutes: 24,
  mission: {
    title: 'The Drone Charging Bays',
    context:
      'A rescue club schedules drones to recharge during start/end intervals. A bay becomes reusable at the exact moment its current drone finishes.',
    prompt:
      'Return the minimum number of charging bays needed so every scheduled drone can recharge on time.',
  },
  objective:
    'Sweep meetings by start time while a min-heap tracks the earliest bay release.',
  priorKnowledge: [
    'A min-heap reveals its smallest value first.',
    'Intervals can be sorted by start time.',
    'A resource ending at time t can serve another job starting at t.',
  ],
  recognitionCue:
    'Overlapping intervals need separate copies of the same resource, and the question asks for the peak count.',
  misconception:
    'Counting all pairwise overlaps can overcount because several overlaps may reuse the same bay at different times.',
  algorithmSteps: [
    {
      id: 'sort-arrivals',
      instruction: 'Sort charging sessions by start time.',
    },
    {
      id: 'release-earliest',
      instruction:
        'If the earliest ending bay is free, remove that end time for reuse.',
    },
    {
      id: 'assign-session',
      instruction: 'Push the current session end into the min-heap.',
    },
    {
      id: 'report-bays',
      instruction: 'Return the largest heap size reached, or the final allocated size.',
    },
  ],
  complexity: {
    time: 'O(n log n)',
    space: 'O(n)',
    explanation:
      'Each of n sessions is sorted and performs heap work costing O(log n); at most n end times are stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'drone-a', start: 0, end: 30 },
        { id: 'drone-b', start: 5, end: 10 },
        { id: 'drone-c', start: 15, end: 20 },
      ],
      highlightedIntervalIds: ['drone-a', 'drone-b'],
      cursor: 5,
    },
  },
  workedExample: {
    prompt:
      'Sessions [0, 30], [5, 10], and [15, 20] arrive in that order. The second needs a new bay, but its bay is free by time 15 and can serve the third.',
    code: [
      'start 0: heap = [30]',
      'start 5: 30 is busy; heap = [10, 30]',
      'start 15: pop 10; push 20',
      'heap = [20, 30]',
      'return 2',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The first drone claims one bay until time 30.',
      'At time 5 that bay is busy, so a second bay is opened until time 10.',
      'At time 15 the time-10 bay is reused for the final drone.',
      'Two bays cover every session.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'bay-one', start: 0, end: 30, label: 'bay 1' },
        { id: 'bay-two-a', start: 5, end: 10, label: 'bay 2' },
        { id: 'bay-two-b', start: 15, end: 20, label: 'reuse bay 2' },
      ],
      highlightedIntervalIds: ['bay-two-a', 'bay-two-b'],
      cursor: 15,
    },
  },
  patternCheck: {
    prompt:
      'Which value must be easiest to access when deciding whether the next drone can reuse a bay?',
    options: [
      {
        id: 'earliest-end',
        label: 'The earliest end time among occupied bays.',
      },
      {
        id: 'latest-start',
        label: 'The latest start time seen so far.',
      },
      {
        id: 'longest-duration',
        label: 'The duration of the longest session.',
      },
    ],
    correctOptionId: 'earliest-end',
    feedback: {
      correct: 'Yes. If even the earliest release is too late, every bay is still busy.',
      incorrect: 'That value does not tell whether any bay is free at the next start.',
      secondIncorrect:
        'Use a min-heap so the smallest end time is always at the top.',
    },
    hints: [
      'You need to answer “Does any bay finish by this start?”',
      'A min-heap exposes the smallest endpoint.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'ends-late', start: 1, end: 9 },
        { id: 'ends-first', start: 2, end: 5 },
        { id: 'arrival', start: 6, end: 8 },
      ],
      highlightedIntervalIds: ['ends-first', 'arrival'],
      cursor: 6,
    },
  },
  retrievalCheck: {
    prompt:
      'Type the condition that lets a session reuse the earliest-ending bay.',
    acceptedAnswers: [
      'earliest end <= current start',
      'heap[0] <= current start',
      'earliest end is less than or equal to current start',
      'end <= start',
      'end<=start',
      'end_heap[0] <= session["start"]',
      'end_heap[0] <= start',
      'earliest end <= start',
      'heap[0] <= start',
      'heap[0]<=start',
      'heap[0] <= session start',
      'the earliest end is at most the current start',
    ],
    placeholder: 'earliest end ... current start',
    feedback: {
      correct: 'Correct. Equality means the handoff is immediate.',
      incorrect: 'Compare the heap minimum with the current start.',
      secondIncorrect: 'Use: earliest end <= current start.',
    },
    hints: [
      'The bay must finish no later than the arrival.',
      'The heap minimum is heap[0].',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Reassemble the charging-bay sweep in working order.',
    feedback: {
      correct: 'The sweep now reuses each available bay before opening another.',
      incorrect: 'Sessions must arrive in chronological order before heap reuse decisions.',
      secondIncorrect:
        'Sort starts, release the earliest compatible end, push the current end, then report the allocation.',
    },
    hints: [
      'A release check happens before assigning the arriving drone.',
      'Every session contributes its end time.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["sessions"] as interval objects. Return the minimum integer number of bays, allowing a bay ending at t to serve a session starting at t.',
    starterCode: `import heapq

def solve(data):
    sessions = sorted(data["sessions"], key=lambda item: item["start"])
    end_heap = []

    for session in sessions:
        # TODO: reuse one available bay before pushing this end.
        heapq.heappush(end_heap, session["end"])

    return len(end_heap)`,
    cases: {
      visibleExample: {
        input: {
          sessions: [
            { start: 0, end: 30 },
            { start: 5, end: 10 },
            { start: 15, end: 20 },
          ],
        },
        expected: 2,
      },
      hiddenBoundary: {
        input: { sessions: [] },
        expected: 0,
      },
      hiddenAdversarial: {
        input: {
          sessions: [
            { start: 9, end: 11 },
            { start: 0, end: 10 },
            { start: 2, end: 8 },
            { start: 8, end: 12 },
            { start: 1, end: 9 },
          ],
        },
        expected: 3,
      },
    },
    feedback: {
      correct: 'Every rescue drone now has a bay without wasting capacity.',
      incorrect:
        'The bay count failed. Check exact-time reuse, unsorted sessions, and several nested overlaps.',
      secondIncorrect:
        'Before heappush, if end_heap and end_heap[0] <= session["start"], call heappop.',
    },
    hints: [
      'Use heapq.heappop(end_heap) when the smallest end is reusable.',
      'Perform the reuse check before the push.',
      'No sessions require zero bays.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'outer', start: 0, end: 10 },
        { id: 'middle', start: 1, end: 9 },
        { id: 'inner', start: 2, end: 8 },
        { id: 'handoff', start: 8, end: 12 },
      ],
      highlightedIntervalIds: ['outer', 'middle', 'inner'],
      cursor: 2,
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(meetingRoomsIIMissionSeed)

export default problemLesson
