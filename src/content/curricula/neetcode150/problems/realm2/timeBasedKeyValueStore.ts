import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const timeBasedKeyValueStoreMissionSeed = createRealm2MissionSeed({
  slug: 'time-based-key-value-store',
  estimatedMinutes: 25,
  mission: {
    title: 'The Observatory Message Archive',
    context:
      'An observatory saves changing messages under channel names. Every saved version receives an increasing timestamp, and visitors may ask what a channel most recently said at an earlier moment.',
    prompt:
      'Process set and get operations. Each get returns the value with the greatest timestamp not exceeding its requested time, or an empty string when no version is old enough.',
  },
  objective:
    'Store timestamped histories by key and binary-search the rightmost eligible version for each query.',
  priorKnowledge: [
    'A hash map can group all versions of the same key.',
    'Set timestamps arrive in increasing order for each key.',
    'A binary search can find a boundary rather than an exact match.',
  ],
  recognitionCue:
    'Queries ask for the latest record at or before a time within an ordered history.',
  misconception:
    'Searching only for an exact timestamp misses the correct earlier version when the requested time falls between updates.',
  keyRule:
    'For a get, binary-search the key’s timestamps for the rightmost value <= query time and return empty only if no such index exists.',
  algorithmSteps: [
    {
      id: 'open-history-map',
      instruction: 'Create a map from each key to its ordered version list.',
    },
    {
      id: 'read-log-operation',
      instruction: 'Process each operation in order.',
    },
    {
      id: 'append-version',
      instruction:
        'On set, append its timestamp-value pair to that key’s history.',
    },
    {
      id: 'search-query-history',
      instruction:
        'On get, binary-search for the rightmost timestamp not above the query.',
    },
    {
      id: 'record-query-answer',
      instruction:
        'Append its value, or an empty string when the boundary is before index zero.',
    },
    {
      id: 'return-query-answers',
      instruction: 'Return get answers in operation order.',
    },
  ],
  complexity: {
    time: 'O(1) set and O(log k) get',
    space: 'O(m)',
    explanation:
      'Appending an ordered version is constant time; a query halves one key’s k versions, and m saved versions remain stored.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'binarySearch',
      values: [2, 6],
      low: 0,
      high: 1,
      mid: 0,
    },
  },
  workedExample: {
    prompt:
      'Channel comet stores red at time 2 and gold at time 6. A query at time 4 chooses red; a query at time 6 chooses gold exactly.',
    code: [
      'history["comet"] = [(2, "red"), (6, "gold")]',
      'get("comet", 4): rightmost timestamp <= 4 is 2',
      'answer "red"',
      'get("comet", 6): rightmost timestamp <= 6 is 6',
      'answer "gold"',
    ],
    currentLineIndex: 1,
    walkthrough: [
      'The per-channel list is already ordered because sets arrive by increasing time.',
      'Time 4 lies after version 2 but before version 6.',
      'The boundary search keeps version 2 as the best-so-far candidate.',
      'An exact timestamp is also eligible and replaces earlier candidates.',
    ],
    diagram: {
      kind: 'binarySearch',
      values: [2, 6],
      low: 0,
      high: 1,
      mid: 0,
    },
    diagramSequence: [
      {
        kind: 'binarySearch',
        values: [2, 6],
        low: 0,
        high: 1,
        mid: 0,
      },
      {
        kind: 'binarySearch',
        values: [2, 6],
        low: 1,
        high: 1,
        mid: 1,
      },
    ],
  },
  patternCheck: {
    prompt:
      'A query time falls between two saved versions. Which search result should be returned?',
    options: [
      {
        id: 'rightmost-not-after',
        label: 'The rightmost version whose timestamp is at most the query.',
      },
      {
        id: 'closest-either-side',
        label: 'Whichever timestamp is numerically closest, even if it is later.',
      },
      {
        id: 'exact-only',
        label: 'An empty string unless a timestamp exactly equals the query.',
      },
      {
        id: 'oldest-version',
        label: 'Always the first version saved for that key.',
      },
    ],
    correctOptionId: 'rightmost-not-after',
    diagram: {
      kind: 'binarySearch',
      values: [2, 6],
      low: 0,
      high: 1,
      mid: 0,
    },
  },
  retrievalCheck: {
    prompt:
      'State the timestamp condition used to keep a version as a possible get answer.',
    acceptedAnswers: [
      'timestamp <= query time',
      'the saved timestamp is at most the requested time',
      'version time is not after the query time',
      'timestamp<=query time',
      'the timestamp is at most the query time',
      'timestamp is less than or equal to the query time',
      'timestamp not greater than the query time',
    ],
    placeholder: 'Type the eligibility condition',
    diagram: {
      kind: 'binarySearch',
      values: [1, 5, 9],
      low: 0,
      high: 2,
      mid: 1,
    },
  },
  reconstructionCheck: {
    prompt:
      'Restore the archive processor from its history map through append-only sets, boundary-search gets, and answer return.',
    diagram: {
      kind: 'binarySearch',
      values: [1, 5, 9],
      low: 0,
      high: 2,
      mid: 1,
    },
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Operations are ["set", key, value, timestamp] or ["get", key, timestamp]. Return one string per get; set operations produce no output.',
    starterCode: `def solve(data):
    histories = {}
    answers = []

    for operation in data["operations"]:
        command = operation[0]
        # Append a set or binary-search one key's history for a get.
        pass

    return answers`,
    cases: {
      visibleExample: {
        input: {
          operations: [
            ['set', 'comet', 'red', 2],
            ['set', 'comet', 'gold', 6],
            ['get', 'comet', 1],
            ['get', 'comet', 4],
            ['get', 'comet', 6],
            ['get', 'comet', 9],
          ],
        },
        expected: ['', 'red', 'gold', 'gold'],
      },
      hiddenBoundary: {
        input: { operations: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          operations: [
            ['set', 'alpha', 'x', 1],
            ['set', 'beta', 'q', 2],
            ['set', 'alpha', 'y', 5],
            ['get', 'alpha', 4],
            ['get', 'beta', 1],
            ['get', 'beta', 9],
            ['get', 'alpha', 5],
          ],
        },
        expected: ['x', '', 'q', 'y'],
      },
    },
    diagram: {
      kind: 'binarySearch',
      values: [1, 5, 9],
      low: 0,
      high: 2,
      mid: 1,
    },
  },
} as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  timeBasedKeyValueStoreMissionSeed,
)

export default problemLesson
