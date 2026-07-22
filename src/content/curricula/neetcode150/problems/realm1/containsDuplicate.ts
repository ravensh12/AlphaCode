import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const containsDuplicateMissionSeed = {
  slug: 'contains-duplicate',
  estimatedMinutes: 18,
  mission: {
    title: 'The Echoing Badge Alarm',
    context:
      'Nova Station is opening its training arena. The gate scanner records each access badge code in arrival order, and a reused badge could mean that someone slipped through twice.',
    prompt:
      'Inspect the full badge stream and report whether any code was scanned more than once. The stream may contain zero or more codes.',
  },
  objective:
    'Detect a repeated value in one left-to-right scan by remembering values in a hash set.',
  priorKnowledge: [
    'A list can be scanned from left to right with a loop.',
    'A set stores each value at most once.',
    'Python can test set membership with the in operator.',
  ],
  recognitionCue:
    'The question asks whether a value has appeared before, while its position and total count do not matter.',
  misconception:
    'If you add the current code before checking membership, that code will always look as though it was already seen.',
  algorithmSteps: [
    {
      id: 'open-empty-log',
      instruction: 'Create an empty set named seen.',
    },
    {
      id: 'read-next-code',
      instruction: 'Read the next badge code from left to right.',
    },
    {
      id: 'stop-on-repeat',
      instruction: 'If the code is already in seen, report a reused badge.',
    },
    {
      id: 'remember-new-code',
      instruction: 'Otherwise, add the code to seen and continue.',
    },
    {
      id: 'finish-clear',
      instruction: 'After the scan ends, report that every badge was fresh.',
    },
  ],
  complexity: {
    time: 'O(n) expected',
    space: 'O(n)',
    explanation:
      'Each of n codes gets one expected constant-time set lookup, and an all-unique stream stores n codes.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'array',
      values: [42, 17, 88, 17],
      highlight: 3,
      pointers: [{ index: 3, label: 'scanner' }],
      visited: [0, 1, 2],
    },
  },
  workedExample: {
    prompt:
      'Trace badge stream [42, 17, 88, 17]. The first three codes enter seen. When the final 17 reaches the scanner, membership is already true, so the alarm fires.',
    code: [
      'def badge_alarm(codes):',
      '    seen = set()',
      '    for code in codes:',
      '        if code in seen:',
      '            return True',
      '        seen.add(code)',
      '    return False',
    ],
    currentLineIndex: 3,
    walkthrough: [
      '42 is new, so seen becomes {42}.',
      '17 is new, so seen becomes {17, 42}.',
      '88 is new, so seen becomes {17, 42, 88}.',
      '17 is already present, so the function returns True immediately.',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: '42', value: 'seen' },
        { key: '17', value: 'seen' },
        { key: '88', value: 'seen' },
      ],
      lookup: '17',
    },
    diagramSequence: [
      {
        kind: 'array',
        values: [42, 17, 88, 17],
        highlight: 0,
        pointers: [{ index: 0, label: 'scanner' }],
      },
      {
        kind: 'hashmap',
        entries: [{ key: '42', value: 'seen' }],
      },
      {
        kind: 'array',
        values: [42, 17, 88, 17],
        highlight: 1,
        pointers: [{ index: 1, label: 'scanner' }],
        visited: [0],
      },
      {
        kind: 'hashmap',
        entries: [
          { key: '42', value: 'seen' },
          { key: '17', value: 'seen' },
        ],
      },
      {
        kind: 'array',
        values: [42, 17, 88, 17],
        highlight: 2,
        pointers: [{ index: 2, label: 'scanner' }],
        visited: [0, 1],
      },
      {
        kind: 'hashmap',
        entries: [
          { key: '42', value: 'seen' },
          { key: '17', value: 'seen' },
          { key: '88', value: 'seen' },
        ],
      },
      {
        kind: 'array',
        values: [42, 17, 88, 17],
        highlight: 3,
        pointers: [{ index: 3, label: 'scanner' }],
        visited: [0, 1, 2],
      },
      {
        kind: 'hashmap',
        entries: [
          { key: '42', value: 'seen' },
          { key: '17', value: 'seen' },
          { key: '88', value: 'seen' },
        ],
        lookup: '17',
      },
    ],
  },
  patternCheck: {
    prompt:
      'A fresh stream can be very long, and a reused code may be far from its first scan. Which plan best fits the mission?',
    options: [
      {
        id: 'remember-seen-codes',
        label:
          'Keep a set of earlier codes and check membership before each add.',
      },
      {
        id: 'compare-neighbors',
        label: 'Compare each code only with the code immediately before it.',
      },
      {
        id: 'add-before-checking',
        label: 'Add each code to a set first, then ask whether it is in the set.',
      },
      {
        id: 'sum-all-codes',
        label: 'Keep a running total and sound the alarm when the total is large.',
      },
    ],
    correctOptionId: 'remember-seen-codes',
    feedback: {
      correct:
        'Exactly. The set answers “Have I seen this before?” without caring how far apart the scans are.',
      incorrect:
        'That plan can miss a reused code or confuse the current scan with an earlier one.',
      secondIncorrect:
        'Focus on the phrase “appeared before.” You need memory plus a membership check before adding.',
    },
    hints: [
      'A matching pair may have many unrelated codes between its two scans.',
      'Choose the structure whose membership test is expected O(1).',
    ],
    diagram: {
      kind: 'hashmap',
      entries: [
        { key: '204', value: 'seen' },
        { key: '915', value: 'seen' },
      ],
      lookup: '915',
    },
  },
  retrievalCheck: {
    prompt:
      'Without looking back, complete the safety rule: before storing the current code, first ______.',
    acceptedAnswers: [
      'check whether it is already in seen',
      'check if it is already in seen',
      'test membership in seen',
      'check whether it is in seen',
      'check if it is in seen',
      'check if the code is already in seen',
      'check whether the code is already in seen',
      'check if the code is in seen',
      'check membership in seen',
      'check if it is in the set',
      'check whether it is in the set',
    ],
    placeholder: 'Type the missing action',
    feedback: {
      correct:
        'Right—the lookup must happen first, while seen still represents only earlier scans.',
      incorrect:
        'Your answer should name the check that happens before the set changes.',
      secondIncorrect:
        'Use this shape: “check whether it is already in seen.”',
    },
    hints: [
      'What question does the in operator answer?',
      'The set should contain earlier codes, not the current one yet.',
    ],
  },
  reconstructionCheck: {
    prompt:
      'The scanner logic was scrambled during a power flicker. Put the five actions back in a safe order.',
    feedback: {
      correct:
        'Sequence restored. The invariant is clean: seen contains exactly the codes from earlier positions.',
      incorrect:
        'The scanner must check the current code before remembering it.',
      secondIncorrect:
        'Start with an empty set, repeat read → check → add, and use the clear result only after the loop.',
    },
    hints: [
      'Setup comes before the repeated scan actions.',
      'A positive result can happen inside the loop; the clear result waits until the loop ends.',
    ],
    diagram: {
      kind: 'array',
      values: [73, 16, 73],
      highlight: 2,
      visited: [0, 1],
    },
  },
  pythonChallenge: {
    prompt:
      'Calibrate a new gate by writing solve(data). The JSON object has a badgeCodes list. Return the JSON boolean true when any code was used earlier in the same list; otherwise return false.',
    starterCode: `def solve(data):
    badge_codes = data["badgeCodes"]
    seen = set()

    for code in badge_codes:
        # Check the code, then remember it if it is new.
        pass

    return False`,
    cases: {
      visibleExample: {
        input: { badgeCodes: [204, 915, 63, 915] },
        expected: true,
      },
      hiddenBoundary: {
        input: { badgeCodes: [] },
        expected: false,
      },
      hiddenAdversarial: {
        input: { badgeCodes: [730, -12, 44, 98, 501, 730] },
        expected: true,
      },
      additional: [
        {
          id: 'hidden-unique-run',
          input: { badgeCodes: [11, 24, 37, 50] },
          expected: false,
          visibility: 'hidden',
        },
      ],
    },
    feedback: {
      correct:
        'Gate calibrated! Your one-pass membership check catches distant repeats and leaves fresh streams alone.',
      incorrect:
        'One or more badge streams fooled the scanner. Recheck when membership is tested and when False is returned.',
      secondIncorrect:
        'Inside the loop, return True if code is in seen; otherwise add it. Return False only after the loop.',
    },
    hints: [
      'Read the list from data["badgeCodes"].',
      'Use if code in seen before seen.add(code).',
      'A repeat can return True immediately, but False must wait for the entire scan.',
    ],
    diagram: {
      kind: 'array',
      values: [204, 915, 63, 915],
      highlight: 3,
      pointers: [{ index: 3, label: 'code' }],
      visited: [0, 1, 2],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(containsDuplicateMissionSeed)

export default problemLesson
