import { buildPalindromeTrace, buildVowelCountTrace, stringDiagram } from './traces'
import { stringScanSequence } from '../../lib/diagramSequences'
import {
  buildVowelCountDemo,
  thinkPatternCheck,
} from './demos'
import {
  conceptStep,
  exploreStep,
  lessonShell,
  quizCheckStep,
  quizIntroStep,
} from './shared'

const TEACH_WORD = 'hello'
const QUIZ_WORD = 'code'

export function generateStrings() {
  return lessonShell(
    'strings',
    'Strings',
    'Work with text one character at a time — indexing, loops, and comparisons.',
    'Loop through characters',
    ['strings', 'loops'],
    [
      exploreStep(
        'explore-chars',
        `A string is a row of characters — "${TEACH_WORD}" has ${TEACH_WORD.length} letters in order.`,
        's[0] is the first letter, s[1] is the second. Strings behave like lists of characters — you can index and loop them the same way as arrays.',
        ['strings'],
        stringDiagram(TEACH_WORD),
        [
          'Characters are single letters in quotes: "h", "e", …',
          'len(s) gives the number of characters.',
        ],
        stringScanSequence(TEACH_WORD, 'ch'),
      ),
      exploreStep(
        'explore-index',
        `In "${TEACH_WORD}", index 1 points to "e" — the second character.`,
        'Python counts from 0. Index 0 is always the first slot — the same rule as arrays.',
        ['strings'],
        stringDiagram(TEACH_WORD, [{ index: 1, label: 's[1]' }]),
        undefined,
        stringScanSequence(TEACH_WORD, 's[i]', 3),
      ),
      exploreStep(
        'explore-loop',
        'Looping a string visits one character at a time — left to right, index by index.',
        'for ch in s runs the block once per letter. Many string problems are just array scans on characters.',
        ['strings', 'loops'],
        stringDiagram(TEACH_WORD, [{ index: 0, label: 'ch' }]),
        undefined,
        stringScanSequence(TEACH_WORD, 'ch'),
      ),
      exploreStep(
        'explore-vowel',
        'Vowels are a, e, i, o, u. The test ch in "aeiou" checks each letter.',
        'Walk the string once and count how many characters pass the vowel test — same scan template as find-max.',
        ['strings', 'loops'],
        stringDiagram(TEACH_WORD),
        undefined,
        stringScanSequence(TEACH_WORD, 'ch'),
      ),
      conceptStep(
        'concept',
        'Palindromes, anagrams, and character counts all start with indexing and looping characters.',
        'Watch a vowel-count walkthrough next — same loop idea as array scanning, with characters instead of numbers.',
        ['strings'],
        stringDiagram(TEACH_WORD),
        stringScanSequence(TEACH_WORD, 'ch', 3),
      ),
      ...buildVowelCountDemo(TEACH_WORD),
      thinkPatternCheck(
        'check-strings',
        'How is looping a string like looping an array?',
        'One index at a time',
        'Both visit ordered slots left to right — s[i] is the same idea as nums[i].',
        ['strings'],
      ),

      quizIntroStep(
        'Trace two string problems line by line — vowel counting and a palindrome check.',
        'Watch the pointers move each step. No guessing the final answer without tracing.',
        ['strings'],
      ),
      buildVowelCountTrace(QUIZ_WORD, 'quiz-vowels-trace', 'quiz'),
      buildPalindromeTrace('noon', 'quiz-palindrome-trace', 'quiz'),
      quizCheckStep(
        'quiz-pattern',
        'Why are strings a good first topic after arrays?',
        'Letters are easy to picture',
        ['They never use loops', 'They are always faster', 'They skip indexing'],
        {
          correct: 'Exactly — words feel concrete compared to abstract numbers.',
          incorrect: 'Think about what made these problems intuitive.',
          secondIncorrect: 'You can see and trace each character — that helps learning.',
        },
        ['strings'],
      ),
    ],
    { previousLessonId: 'arrays-and-loops', minimumMastery: 75 },
  )
}
