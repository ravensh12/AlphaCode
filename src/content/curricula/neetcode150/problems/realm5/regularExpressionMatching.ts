import { createProblemMission } from '../../problemMissionFactory'
import { buildRealm5Mission } from './missionBuilder'

export const regularExpressionMatchingMissionSeed = buildRealm5Mission({
  slug: 'regular-expression-matching',
  estimatedMinutes: 30,
  mission: {
    title: 'The Signal Template Engine',
    context:
      'A receiver checks an entire text against a compact template. A dot matches any one character, while a star means the symbol immediately before it may appear zero or more times.',
    prompt:
      'Return whether the complete text matches the complete template; partial matches do not count.',
  },
  objective:
    'Use prefix-pair dynamic programming with separate transitions for ordinary symbols, dots, and starred symbols.',
  priorKnowledge: [
    'A starred symbol can be skipped as zero copies or consume one matching text character and remain active.',
    'The empty text can match only template prefixes made of zero-copy starred pairs.',
  ],
  recognitionCue:
    'Pattern matching covers the whole string and includes a repeat operator tied to the preceding pattern symbol.',
  misconception:
    'Treating star as a stand-alone any-text wildcard ignores the symbol it repeats and accepts invalid matches.',
  algorithmSteps: [
    {
      id: 'seed-empty-pair',
      instruction: 'Mark empty text against empty template as matching.',
    },
    {
      id: 'initialize-zero-copy-patterns',
      instruction: 'Fill empty-text states for template prefixes that can skip starred pairs.',
    },
    {
      id: 'scan-prefix-pairs',
      instruction: 'Process every nonempty text prefix against every template prefix.',
    },
    {
      id: 'apply-symbol-or-star',
      instruction:
        'Use diagonal matching for a symbol/dot; for star, combine zero copies with one-more-copy when its symbol matches.',
    },
    {
      id: 'return-whole-match',
      instruction: 'Return the state for both complete strings.',
    },
  ],
  complexity: {
    time: 'O(m × n)',
    space: 'O(m × n)',
    explanation:
      'Each text/template prefix pair is filled once in a boolean grid.',
  },
  diagram: {
    kind: 'grid',
    variant: 'dpTable',
    cells: [
      ['T', 'F', 'T', 'F', 'F', 'F'],
      ['F', 'F', 'F', 'T', 'F', 'F'],
      ['F', 'F', 'F', 'F', 'T', 'F'],
      ['F', 'F', 'F', 'F', 'F', 'T'],
    ],
    rowLabels: ['text ∅', 'text a', 'text aa', 'text aab'],
    columnLabels: ['pat ∅', 'pat c', 'pat c*', 'pat c*a', 'pat c*a.', 'pat c*a.b'],
    highlightedCells: [{ row: 3, column: 5, label: 'whole match' }],
    dependencyCells: [{ row: 2, column: 4 }],
  },
  workedExample: {
    prompt:
      'Text "aab" matches template "c*a.b": c* uses zero copies, a matches the first a, dot matches the second a, and b matches b.',
    code: [
      'if pattern[j - 1] == "*":',
      '    dp[i][j] = dp[i][j - 2]',
      '    repeated = pattern[j - 2]',
      '    if repeated == "." or repeated == text[i - 1]:',
      '        dp[i][j] = dp[i][j] or dp[i - 1][j]',
      'elif pattern[j - 1] in (".", text[i - 1]):',
      '    dp[i][j] = dp[i - 1][j - 1]',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The empty-text row marks c* as true because it may use zero c characters.',
      'The literal a then consumes the first text character.',
      'Dot consumes exactly one next character.',
      'The final literal b reaches the bottom-right true state.',
    ],
  },
  patternCheck: {
    prompt:
      'Which star transition correctly models both zero copies and additional copies of its preceding symbol?',
    correct:
      'Use dp[i][j - 2], or dp[i - 1][j] when the repeated symbol matches text[i - 1].',
    distractors: [
      'Let star consume any remaining text regardless of its preceding symbol.',
      'Remember only whether the current text and pattern characters match.',
      'Generate every possible expanded template before comparing it with the text.',
    ],
    hint: 'Skipping a starred pair moves two pattern positions; repeating consumes text but keeps the pattern position.',
  },
  retrievalCheck: {
    prompt:
      'What two predecessor states are joined by the star case?',
    acceptedAnswers: [
      'dp[i][j - 2] and dp[i - 1][j]',
      'dp[i][j-2] and dp[i-1][j]',
      'dp[i][j - 2] or dp[i - 1][j]',
      'dp[i][j-2] or dp[i-1][j]',
      'dp[i - 1][j] and dp[i][j - 2]',
      'dp[i-1][j] and dp[i][j-2]',
      'zero copies from two pattern positions back or one more copy from the row above',
      'skip pair or repeat from above',
    ],
    placeholder: 'Type both star predecessors',
    hint: 'One route removes x*; the other leaves x* available again.',
  },
  reconstructionPrompt:
    'Order the whole-template matcher from empty initialization through ordinary and starred transitions.',
  pythonChallenge: {
    prompt:
      'Write solve(data). The JSON object contains text and pattern. Pattern uses lowercase literals, dot for any one character, and valid stars that repeat the preceding symbol. Return a whole-string match boolean.',
    starterCode: `def solve(data):
    text = data["text"]
    pattern = data["pattern"]
    dp = [[False] * (len(pattern) + 1) for _ in range(len(text) + 1)]
    dp[0][0] = True

    for j in range(2, len(pattern) + 1):
        if pattern[j - 1] == "*":
            dp[0][j] = dp[0][j - 2]

    for i in range(1, len(text) + 1):
        for j in range(1, len(pattern) + 1):
            if pattern[j - 1] == "*":
                # Combine zero copies with a valid additional copy.
                pass
            elif pattern[j - 1] == "." or pattern[j - 1] == text[i - 1]:
                # Consume one text and one pattern symbol.
                pass

    return dp[len(text)][len(pattern)]`,
    cases: {
      visibleExample: {
        input: { text: 'aab', pattern: 'c*a.b' },
        expected: true,
      },
      hiddenBoundary: {
        input: { text: '', pattern: 'x*' },
        expected: true,
      },
      hiddenAdversarial: {
        input: { text: 'ab', pattern: '.*c' },
        expected: false,
      },
    },
    hints: [
      'For star, begin with dp[i][j - 2].',
      'If pattern[j - 2] matches text[i - 1], also allow dp[i - 1][j].',
      'A literal or dot match copies dp[i - 1][j - 1].',
    ],
  },
})

export const problemLesson = createProblemMission(
  regularExpressionMatchingMissionSeed,
)

export default problemLesson
