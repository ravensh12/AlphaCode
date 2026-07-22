import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const sameTreeMissionSeed = {
  slug: 'same-tree',
  estimatedMinutes: 20,
  mission: {
    title: 'Match the Twin Signal Towers',
    context:
      'Two hilltop signal towers were assembled from branching blueprints. An inspector must confirm that every matching position has the same panel number and the same missing branches.',
    prompt:
      'Compare two level-order JSON trees and return whether their values and shapes match exactly.',
  },
  objective:
    'Compare two binary trees in lockstep, checking both structure and node values.',
  priorKnowledge: [
    'Two missing nodes represent matching empty subtrees.',
    'Recursion can compare corresponding child pairs.',
  ],
  recognitionCue:
    'The task requires exact equality of both tree shape and values at corresponding positions.',
  misconception:
    'Matching traversal values alone is not enough when the values can sit in different shapes.',
  algorithmSteps: [
    {
      id: 'both-missing',
      instruction: 'If both current nodes are missing, report a match for this pair.',
    },
    {
      id: 'one-missing',
      instruction: 'If only one node is missing, report a mismatch.',
    },
    {
      id: 'compare-values',
      instruction: 'If the two node values differ, report a mismatch.',
    },
    {
      id: 'compare-children',
      instruction: 'Compare both left pairs and both right pairs.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(h)',
    explanation:
      'At most n matching node positions are visited, with recursion depth up to h.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'a1',
      nodes: [
        { id: 'a1', value: 1, left: 'a2', right: 'a3' },
        { id: 'a2', value: 2 },
        { id: 'a3', value: 3 },
      ],
      highlightedNodeIds: ['a1', 'a2', 'a3'],
      pointers: [{ nodeId: 'a2', label: 'paired with 2' }],
    },
  },
  workedExample: {
    prompt:
      'Trees [1, 2, 3] and [1, 2, 3] match at the roots, then at both child pairs, then at all missing child pairs.',
    code: [
      'def match(a, b):',
      '    if a is None and b is None: return True',
      '    if a is None or b is None: return False',
      '    if a.value != b.value: return False',
      '    return match(a.left, b.left) and match(a.right, b.right)',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'The two roots both hold 1.',
      'The left pair both hold 2, and the right pair both hold 3.',
      'All corresponding gaps also match, so the result is true.',
    ],
  },
  patternCheck: {
    prompt:
      'Which comparison proves two tower blueprints are identical?',
    options: [
      {
        id: 'lockstep-pairs',
        label: 'Compare corresponding nodes, values, and child pairs together.',
      },
      {
        id: 'same-sum',
        label: 'Check whether both trees have the same sum of values.',
      },
      {
        id: 'sorted-values',
        label: 'Sort each tree’s values and compare the two lists.',
      },
      {
        id: 'root-and-size',
        label: 'Compare only the roots and total node counts.',
      },
    ],
    correctOptionId: 'lockstep-pairs',
    feedback: {
      correct:
        'Exactly. Lockstep pairs preserve both position and value information.',
      incorrect:
        'Different shapes can share those totals or collections.',
      secondIncorrect:
        'At every position, handle both missing, one missing, value mismatch, then both child pairs.',
    },
    hints: ['Position matters as much as value.', 'A missing left child cannot match a missing right child elsewhere.'],
  },
  retrievalCheck: {
    prompt:
      'When both nodes in the current pair are missing, what boolean should the pair return?',
    acceptedAnswers: ['true'],
    matcher: { mode: 'boolean', expected: true },
    placeholder: 'Boolean result',
    feedback: {
      correct:
        'Right. Two empty subtrees match.',
      incorrect:
        'A pair of gaps has the same shape and no conflicting value.',
      secondIncorrect:
        'Return true.',
    },
    hints: ['This is the successful base case.', 'No node exists on either side.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the exact-tree comparison checks from base cases to recursion.',
    feedback: {
      correct:
        'The cases safely handle gaps before values and child links are read.',
      incorrect:
        'Check missing nodes before trying to compare their values.',
      secondIncorrect:
        'Use both missing → one missing → values → child pairs.',
    },
    hints: ['The two missing-node cases are different.', 'Both recursive child comparisons must pass.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). The object contains firstTree and secondTree as level-order lists with null gaps. Return true only for an exact shape-and-value match.',
    starterCode: `from collections import deque

def solve(data):
    first_values = data["firstTree"]
    second_values = data["secondTree"]
    # TODO: build both sparse trees.

    def same(first, second):
        # TODO: handle gaps, values, and both child pairs.
        pass

    return same(None, None)`,
    cases: {
      visibleExample: {
        input: { firstTree: [1, 2, 3], secondTree: [1, 2, 3] },
        expected: true,
      },
      hiddenBoundary: {
        input: { firstTree: [], secondTree: [] },
        expected: true,
      },
      hiddenAdversarial: {
        input: { firstTree: [1, 2], secondTree: [1, null, 2] },
        expected: false,
      },
    },
    feedback: {
      correct:
        'Blueprints compared correctly, including empty towers and values placed on opposite sides.',
      incorrect:
        'A shape or value mismatch was overlooked. Pair the same child directions.',
      secondIncorrect:
        'Both None is true; exactly one None is false; unequal values are false; otherwise compare left-left and right-right.',
    },
    hints: [
      'Use the same level-order tree builder for both inputs.',
      'Do not flatten away null positions before comparing.',
      'Replace the placeholder call with the two built roots.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'two' },
        { id: 'two', value: 2 },
      ],
      pointers: [{ nodeId: 'two', label: 'left, not right' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(sameTreeMissionSeed)

export default problemLesson
