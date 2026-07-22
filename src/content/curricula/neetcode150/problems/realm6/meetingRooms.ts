import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const meetingRoomsMissionSeed = {
  slug: 'meeting-rooms',
  estimatedMinutes: 17,
  mission: {
    title: 'The Robotics Lab Booking',
    context:
      'A robotics club has one testing lab. Teams submit booking intervals, and a team may enter at the exact minute the previous team leaves.',
    prompt:
      'Report whether every booking can use the single lab without two teams occupying it at once.',
  },
  objective:
    'Sort bookings by start and detect any adjacent overlap.',
  priorKnowledge: [
    'Intervals can be sorted by their start field.',
    'Touching endpoints do not overlap for room bookings.',
    'A boolean answer may return as soon as a conflict appears.',
  ],
  recognitionCue:
    'The question asks whether one resource can handle every time interval.',
  misconception:
    'Comparing bookings only in their input order can miss a conflict hidden by an unsorted list.',
  algorithmSteps: [
    {
      id: 'sort-bookings',
      instruction: 'Sort bookings from earliest to latest start.',
    },
    {
      id: 'scan-neighbors',
      instruction: 'Visit each booking after the first with its predecessor.',
    },
    {
      id: 'reject-overlap',
      instruction:
        'Return false if the current start is earlier than the previous end.',
    },
    {
      id: 'approve-schedule',
      instruction: 'Return true after every neighboring pair is safe.',
    },
  ],
  complexity: {
    time: 'O(n log n)',
    space: 'O(n)',
    explanation:
      'Sorting n bookings dominates a linear neighbor scan and may use linear auxiliary storage.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'team-blue', start: 2, end: 5 },
        { id: 'team-gold', start: 4, end: 7 },
      ],
      highlightedIntervalIds: ['team-blue', 'team-gold'],
      cursor: 4,
    },
  },
  workedExample: {
    prompt:
      'Bookings [8, 10], [1, 4], and [4, 7] sort to [1, 4], [4, 7], [8, 10]. Each next start is at least the previous end, so one lab is enough.',
    code: [
      'ordered = [[1, 4], [4, 7], [8, 10]]',
      '4 < 4 is False',
      '8 < 7 is False',
      'return True',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The [1, 4] team leaves exactly when [4, 7] enters.',
      'The next team waits until time 8, after time 7.',
      'No neighboring pair overlaps.',
      'The schedule is valid.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'first', start: 1, end: 4 },
        { id: 'second', start: 4, end: 7 },
        { id: 'third', start: 8, end: 10 },
      ],
      cursor: 4,
    },
  },
  patternCheck: {
    prompt:
      'After sorting by start, what proves the lab schedule is impossible?',
    options: [
      {
        id: 'start-before-end',
        label: 'A current booking starts before the previous booking ends.',
      },
      {
        id: 'same-end',
        label: 'Two bookings have the same ending minute.',
      },
      {
        id: 'long-gap',
        label: 'There is an unused gap between two bookings.',
      },
    ],
    correctOptionId: 'start-before-end',
    feedback: {
      correct: 'Exactly. That strict inequality means both teams need the lab together.',
      incorrect: 'That condition does not necessarily create simultaneous lab use.',
      secondIncorrect:
        'Look for current.start < previous.end after sorting.',
    },
    hints: [
      'A team may enter exactly when another leaves.',
      'The unsafe comparison must therefore be strict.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'previous', start: 1, end: 5 },
        { id: 'current', start: 4, end: 6 },
      ],
      highlightedIntervalIds: ['previous', 'current'],
    },
  },
  retrievalCheck: {
    prompt:
      'Type the safe relationship between a current start and the previous end.',
    acceptedAnswers: [
      'current start is greater than or equal to previous end',
      'current.start >= previous.end',
      'start >= previous end',
      'current start >= previous end',
      'current["start"] >= previous["end"]',
      'current.start>=previous.end',
      'current start greater than or equal to previous end',
    ],
    placeholder: 'current start ... previous end',
    feedback: {
      correct: 'Right. Equality allows a clean handoff.',
      incorrect: 'Include the comparison and remember that touching is allowed.',
      secondIncorrect: 'Use: current start >= previous end.',
    },
    hints: [
      'The next team cannot enter before the room is free.',
      'At the same minute is acceptable.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'Reorder the lab-check actions into one reliable scan.',
    feedback: {
      correct: 'The checker now catches the earliest conflict and approves only after the scan.',
      incorrect: 'Bookings must be chronological before neighboring times are meaningful.',
      secondIncorrect:
        'Sort, scan pairs, reject a strict overlap, then approve after all pairs pass.',
    },
    hints: [
      'The successful return belongs after the loop.',
      'A conflict can stop immediately.',
    ],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). JSON supplies data["bookings"] as start/end objects. Return true if one room handles all bookings, otherwise false.',
    starterCode: `def solve(data):
    bookings = sorted(data["bookings"], key=lambda item: item["start"])

    for index in range(1, len(bookings)):
        previous = bookings[index - 1]
        current = bookings[index]
        # TODO: reject a strict overlap.
        pass

    return True`,
    cases: {
      visibleExample: {
        input: {
          bookings: [
            { start: 8, end: 10 },
            { start: 1, end: 4 },
            { start: 4, end: 7 },
          ],
        },
        expected: true,
      },
      hiddenBoundary: {
        input: { bookings: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: {
          bookings: [
            { start: 10, end: 12 },
            { start: -2, end: 20 },
            { start: 4, end: 5 },
          ],
        },
        expected: false,
      },
    },
    feedback: {
      correct: 'The robotics club now knows whether one lab can host the day.',
      incorrect:
        'A booking set was judged incorrectly. Check unsorted input, touching endpoints, and a long booking around a short one.',
      secondIncorrect:
        'Inside the loop, return False when current["start"] < previous["end"].',
    },
    hints: [
      'Sort by item["start"].',
      'Use < for conflict, not <=.',
      'Zero or one booking is always possible.',
    ],
    diagram: {
      kind: 'intervals',
      intervals: [
        { id: 'wide', start: -2, end: 20, label: 'wide booking' },
        { id: 'inside', start: 4, end: 5, label: 'conflict' },
      ],
      highlightedIntervalIds: ['wide', 'inside'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(meetingRoomsMissionSeed)

export default problemLesson
