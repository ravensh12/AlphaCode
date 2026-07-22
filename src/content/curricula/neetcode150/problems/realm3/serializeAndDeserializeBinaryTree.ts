import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const serializeAndDeserializeBinaryTreeMissionSeed = {
  slug: 'serialize-and-deserialize-binary-tree',
  estimatedMinutes: 32,
  mission: {
    title: 'Pack the Branching Radio Message',
    context:
      'A rescue team must send a whole branching map through a radio channel that carries only one string. Missing branches need markers so the receiver can rebuild the exact shape.',
    prompt:
      'Encode a level-order integer tree as preorder tokens using # for gaps, decode it, and return both the message and the rebuilt level-order tree.',
  },
  objective:
    'Preserve tree shape with explicit null markers during serialization and consume the same token order during deserialization.',
  priorKnowledge: [
    'Preorder visits a node before its left and right subtrees.',
    'A missing-child token distinguishes different tree shapes.',
  ],
  recognitionCue:
    'A tree must make a round trip through a flat format without losing where child links are absent.',
  misconception:
    'Saving only node values cannot distinguish shapes that have the same traversal values.',
  algorithmSteps: [
    {
      id: 'encode-preorder',
      instruction: 'Emit a node value, then encode its left and right subtrees.',
    },
    {
      id: 'mark-gaps',
      instruction: 'Emit # whenever the encoder reaches a missing child.',
    },
    {
      id: 'open-token-stream',
      instruction: 'Split the message and read tokens from left to right.',
    },
    {
      id: 'decode-token',
      instruction: 'Return no node for #; otherwise create the token’s node.',
    },
    {
      id: 'decode-children',
      instruction: 'Recursively fill that node’s left child and then right child.',
    },
  ],
  complexity: {
    time: 'O(n)',
    space: 'O(n)',
    explanation:
      'Encoding and decoding each real node and gap takes linear work; tokens and rebuilt nodes use linear space.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'one',
      nodes: [
        { id: 'one', value: 1, left: 'two', right: 'three' },
        { id: 'two', value: 2 },
        { id: 'three', value: 3, left: 'four', right: 'five' },
        { id: 'four', value: 4 },
        { id: 'five', value: 5 },
      ],
      highlightedNodeIds: ['two'],
      pointers: [{ nodeId: 'two', label: 'then #, #' }],
    },
  },
  workedExample: {
    prompt:
      'Tree [1, 2, 3, null, null, 4, 5] becomes 1,2,#,#,3,4,#,#,5,#,#. The decoder consumes exactly that recursive shape.',
    code: [
      'def encode(node, tokens):',
      '    if node is None: tokens.append("#"); return',
      '    tokens.append(str(node.value))',
      '    encode(node.left, tokens)',
      '    encode(node.right, tokens)',
    ],
    currentLineIndex: 1,
    walkthrough: [
      'Value 1 opens the root, followed by its complete left subtree.',
      'Two # tokens close both missing children of leaf 2.',
      'The same rule records subtree 3 with children 4 and 5, so decoding has no guesswork.',
    ],
  },
  patternCheck: {
    prompt:
      'What makes the radio message able to preserve exact tree shape?',
    options: [
      {
        id: 'explicit-gaps',
        label: 'Include a token for every missing child in a fixed traversal order.',
      },
      {
        id: 'values-only',
        label: 'Send only node values and let the receiver guess child positions.',
      },
      {
        id: 'sort-before-send',
        label: 'Sort all values so the receiver can build a search tree.',
      },
      {
        id: 'leaf-count',
        label: 'Send node values plus only the total number of leaves.',
      },
    ],
    correctOptionId: 'explicit-gaps',
    feedback: {
      correct:
        'Exactly. Gap markers turn structure into data, and fixed order makes it reversible.',
      incorrect:
        'That loses enough position information for different shapes to share one message.',
      secondIncorrect:
        'Use preorder and emit # at every missing child.',
    },
    hints: ['Leaves need two child endings.', 'The decoder should never choose a shape on its own.'],
  },
  retrievalCheck: {
    prompt:
      'Type the token used in this mission for a missing child.',
    acceptedAnswers: [
      '#',
      'hash',
      'hash mark',
      'a hash',
      'hash sign',
      'hashtag',
      'number sign',
      'pound sign',
    ],
    placeholder: 'Gap token',
    feedback: {
      correct:
        'Right. Each # closes one child position.',
      incorrect:
        'Recall the single symbol placed where no node exists.',
      secondIncorrect:
        'The token is #.',
    },
    hints: ['It is not the word null.', 'The symbol looks like a number sign.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the encode-then-decode protocol.',
    feedback: {
      correct:
        'The decoder mirrors the encoder’s node, left, right order and consumes every gap.',
      incorrect:
        'Mark gaps during encoding, then decode each real token before its two children.',
      secondIncorrect:
        'Use encode preorder → mark gaps → open stream → decode token → decode children.',
    },
    hints: ['The first two actions describe encoding.', 'A real decode token creates a node before recursive child calls.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Return {"encoded": message, "roundTrip": tree}; message uses comma-separated preorder integer tokens and # gaps, and tree is the decoded trimmed level-order list.',
    starterCode: `from collections import deque

def solve(data):
    values = data["tree"]
    # TODO: build the sparse input tree.
    root = None

    def encode(node, tokens):
        # TODO: append preorder value or # gap tokens.
        pass

    def decode(tokens):
        # TODO: consume the same preorder token stream.
        pass

    tokens = []
    encode(root, tokens)
    message = ",".join(tokens)
    rebuilt = decode(iter(tokens))
    # TODO: serialize rebuilt in trimmed level order.
    return {"encoded": message, "roundTrip": []}`,
    cases: {
      visibleExample: {
        input: { tree: [1, 2, 3, null, null, 4, 5] },
        expected: {
          encoded: '1,2,#,#,3,4,#,#,5,#,#',
          roundTrip: [1, 2, 3, null, null, 4, 5],
        },
      },
      hiddenBoundary: {
        input: { tree: [] },
        expected: { encoded: '#', roundTrip: [] },
      },
      hiddenAdversarial: {
        input: { tree: [-1, null, 2, 0] },
        expected: {
          encoded: '-1,#,2,0,#,#,#',
          roundTrip: [-1, null, 2, 0],
        },
      },
    },
    feedback: {
      correct:
        'The branching message survives a full round trip, including empty and one-sided maps.',
      incorrect:
        'The token order, gap markers, or rebuilt level-order shape does not match.',
      secondIncorrect:
        'Encode value,left,right with # for None; decode by reading one token and recursively creating left then right.',
    },
    hints: [
      'An empty root still encodes as one # token.',
      'Convert real decode tokens with int(token).',
      'Level-order output keeps interior None values and trims trailing ones.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'binary',
      rootId: 'minus-one',
      nodes: [
        { id: 'minus-one', value: -1, right: 'two' },
        { id: 'two', value: 2, left: 'zero' },
        { id: 'zero', value: 0 },
      ],
      highlightedNodeIds: ['minus-one', 'two', 'zero'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  serializeAndDeserializeBinaryTreeMissionSeed,
)

export default problemLesson
