import { buildTwoSumTrace } from './traces'
import { hashMapGrowSequence } from '../../lib/diagramSequences'
import {
  buildTwoSumDemo,
  thinkPatternCheck,
} from './demos'
import {
  conceptStep,
  exploreStep,
  lessonShell,
  quizCheckStep,
  quizIntroStep,
} from './shared'

const TEACH_NUMS = [2, 7, 11, 15]
const TEACH_TARGET = 9
const QUIZ_NUMS = [3, 2, 4]
const QUIZ_TARGET = 6

export function generateHashMaps() {
  return lessonShell(
    'hash-maps',
    'Hash Maps',
    'Remember what you have seen so you can look it up instantly — the Two Sum pattern.',
    'Store → lookup in O(1)',
    ['hashMaps'],
    [
      exploreStep(
        'explore-locker',
        'A hash map is like lockers: store something under a key, fetch it later without searching every locker.',
        'In Python, seen[num] = i stores the number as the key and its index as the value. Lookup is fast — O(1) average.',
        ['hashMaps'],
        { kind: 'hashmap', entries: [], lookup: '?' },
        [
          'dict / hash map = key → value storage.',
          '“Have I seen this key before?” is the interview signal.',
        ],
        hashMapGrowSequence([
          { key: '2', value: 0 },
          { key: '7', value: 1 },
        ]),
      ),
      exploreStep(
        'explore-store',
        'As you loop, save each value you have seen. That is the “remember” step of Two Sum.',
        'After seeing 2 at index 0, seen holds {2: 0}. Later you can ask: “have I seen the complement?”',
        ['hashMaps'],
        { kind: 'hashmap', entries: [{ key: '2', value: 0 }] },
        undefined,
        hashMapGrowSequence([{ key: '2', value: 0 }]),
      ),
      exploreStep(
        'explore-complement',
        `For target ${TEACH_TARGET}, each number needs a partner: target - num. When you see 7, you need 2.`,
        'If 2 is already in the map, you found the pair — no nested loop required.',
        ['hashMaps'],
        { kind: 'hashmap', entries: [{ key: '2', value: 0 }], lookup: '2' },
        undefined,
        hashMapGrowSequence([{ key: '2', value: 0 }], '2'),
      ),
      conceptStep(
        'concept',
        'Hash maps answer “have I seen this before?” in one step — the core of Two Sum and frequency counting.',
        'Watch the Two Sum walkthrough — store each number, then check for the complement.',
        ['hashMaps'],
        { kind: 'hashmap', entries: [], lookup: '?' },
        hashMapGrowSequence(
          [
            { key: '2', value: 0 },
            { key: '7', value: 1 },
          ],
          '2',
        ),
      ),
      ...buildTwoSumDemo(TEACH_NUMS, TEACH_TARGET),
      thinkPatternCheck(
        'check-signal',
        'When you need “have I seen this value before?”, what tool fits?',
        'Hash map',
        'Store as you go, look up in O(1) — the classic Two Sum and frequency-count pattern.',
        ['hashMaps'],
      ),

      quizIntroStep(
        'Trace Two Sum on a new array — same store-and-lookup pattern, different numbers.',
        'Walk through each index. Do not skip the map updates.',
        ['hashMaps'],
      ),
      buildTwoSumTrace(QUIZ_NUMS, QUIZ_TARGET, 'quiz-twosum-trace', 'quiz'),
      quizCheckStep(
        'quiz-pattern',
        'When should you reach for a hash map?',
        'Need fast lookup of seen values',
        ['Data is unsorted only', 'Never on arrays', 'Only for strings'],
        {
          correct: 'Exactly — “have I seen this?” is the hash map signal.',
          incorrect: 'Think Two Sum and frequency counting.',
          secondIncorrect: 'Store as you go, look up complements instantly.',
        },
        ['hashMaps'],
      ),
    ],
    { previousLessonId: 'strings', minimumMastery: 75 },
  )
}
