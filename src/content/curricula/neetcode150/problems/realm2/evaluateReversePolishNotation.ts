import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const evaluateReversePolishNotationMissionSeed =
  createRealm2MissionSeed({
    slug: 'evaluate-reverse-polish-notation',
    estimatedMinutes: 21,
    mission: {
      title: 'The Drone Recipe Deck',
      context:
        'A repair drone receives arithmetic cards in a compact order: number cards arrive first, and an operator card combines the two newest unfinished results.',
      prompt:
        'Evaluate the card stream using +, -, *, and /. Division must discard the fractional part toward zero, including for negative results.',
    },
    objective:
      'Evaluate a postfix expression in one pass with a stack of unfinished numeric results.',
    priorKnowledge: [
      'An integer token can be converted from text with int.',
      'A binary operator needs a left and a right operand.',
      'A stack returns the most recently pushed result first.',
    ],
    recognitionCue:
      'Every operator applies to the two most recent available values, so parentheses and precedence are unnecessary.',
    misconception:
      'The first popped value is the right operand, so reversing left and right breaks subtraction and division.',
    keyRule:
      'For an operator, pop right first and left second, compute left operator right, then push the result.',
    algorithmSteps: [
      {
        id: 'open-value-stack',
        instruction: 'Create an empty stack of numeric results.',
      },
      {
        id: 'read-token',
        instruction: 'Read each card from left to right.',
      },
      {
        id: 'push-number',
        instruction: 'Convert a number card to an integer and push it.',
      },
      {
        id: 'pop-operands',
        instruction:
          'For an operator, pop the right operand and then the left operand.',
      },
      {
        id: 'push-operation-result',
        instruction:
          'Apply the operator, truncating division toward zero, and push the result.',
      },
      {
        id: 'return-final-value',
        instruction: 'Return the only value left on the stack.',
      },
    ],
    complexity: {
      time: 'O(n)',
      space: 'O(n)',
      explanation:
        'Each token causes constant stack work, and a run of number cards can store a linear number of values.',
    },
    explanationVisuals: {
      diagram: { kind: 'stack', items: ['4', '6', '3'] },
    },
    workedExample: {
      prompt:
        'For cards 4, 6, +, 3, *, the plus card turns 4 and 6 into 10. The multiply card then turns 10 and 3 into 30.',
      code: [
        'push(4)',
        'push(6)',
        '+: right = pop() -> 6, left = pop() -> 4; push(4 + 6)  # 10',
        'push(3)',
        '*: right = pop() -> 3, left = pop() -> 10; push(10 * 3)  # 30',
        'return pop()',
      ],
      currentLineIndex: 4,
      walkthrough: [
        '4 and 6 wait on the value stack.',
        '+ consumes both and pushes 10.',
        '3 joins 10 on the stack.',
        '* consumes 10 and 3, leaving the final value 30.',
      ],
      diagram: { kind: 'stack', items: ['10', '3'] },
      diagramSequence: [
        { kind: 'stack', items: ['4'] },
        { kind: 'stack', items: ['4', '6'] },
        { kind: 'stack', items: ['10'] },
        { kind: 'stack', items: ['10', '3'] },
        { kind: 'stack', items: ['30'] },
      ],
    },
    patternCheck: {
      prompt:
        'An operator card appears after several partial calculations. Which action preserves operand order?',
      options: [
        {
          id: 'right-then-left',
          label:
            'Pop right, pop left, calculate left operator right, and push the result.',
        },
        {
          id: 'left-then-right',
          label:
            'Treat the first popped value as left and the second as right.',
        },
        {
          id: 'scan-for-precedence',
          label: 'Search ahead for multiplication before using the operator.',
        },
        {
          id: 'sort-values',
          label: 'Sort waiting values before choosing two operands.',
        },
      ],
      correctOptionId: 'right-then-left',
      diagram: { kind: 'stack', items: ['12', '5'] },
    },
    retrievalCheck: {
      prompt:
        'For subtraction, name the pop order and expression used for the two stack values.',
      acceptedAnswers: [
        'pop right, pop left, then left - right',
        'right first then left, compute left minus right',
        'right = pop, left = pop, push left - right',
        'pop right, pop left, left - right',
        'pop right, pop left, then left minus right',
        'pop right first, then left, compute left - right',
        'pop right then pop left, then left - right',
        'right = pop(), left = pop(), push(left - right)',
      ],
      placeholder: 'Type the operand rule',
      diagram: { kind: 'stack', items: ['12', '5'] },
    },
    reconstructionCheck: {
      prompt:
        'Put the postfix evaluator back together from empty stack through token handling to its final return.',
      diagram: { kind: 'stack', items: ['7', '-3'] },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). Read data["tokens"], evaluate the postfix card stream, and return one integer. Use truncation toward zero for division.',
      starterCode: `def solve(data):
    tokens = data["tokens"]
    stack = []

    for token in tokens:
        # Push numbers; for operators, combine the top two values.
        pass

    return stack[-1]`,
      cases: {
        visibleExample: {
          input: { tokens: ['4', '6', '+', '3', '*'] },
          expected: 30,
        },
        hiddenBoundary: {
          input: { tokens: ['-8'] },
          expected: -8,
        },
        hiddenAdversarial: {
          input: { tokens: ['12', '5', '-', '-3', '*', '8', '/'] },
          expected: -2,
        },
      },
      diagram: { kind: 'stack', items: ['-21', '8'] },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  evaluateReversePolishNotationMissionSeed,
)

export default problemLesson
