import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const implementTriePrefixTreeMissionSeed = {
  slug: 'implement-trie-prefix-tree',
  estimatedMinutes: 26,
  mission: {
    title: 'Build the Spellbook Branches',
    context:
      'A young librarian stores magic words one letter per branch. Words with the same beginning share shelves, but a marker is needed where each complete word ends.',
    prompt:
      'Process an operation log of inserts, exact searches, and prefix checks, returning the boolean result of each query in order.',
  },
  objective:
    'Implement trie insertion, whole-word search, and prefix search with shared character paths and terminal markers.',
  priorKnowledge: [
    'A map can connect a character to its next trie node.',
    'A prefix path may exist even when it is not a stored whole word.',
  ],
  recognitionCue:
    'Many string operations ask about shared beginnings, exact words, and repeated character-by-character lookup.',
  misconception:
    'Reaching the last character proves a prefix exists, but exact search also needs an end-of-word marker.',
  algorithmSteps: [
    {
      id: 'begin-root',
      instruction: 'Start each operation at the trie root.',
    },
    {
      id: 'follow-characters',
      instruction: 'Follow one child edge for each character in the text.',
    },
    {
      id: 'create-on-insert',
      instruction: 'During insert, create any missing character nodes.',
    },
    {
      id: 'mark-word-end',
      instruction: 'After an insert path, mark its final node as a complete word.',
    },
    {
      id: 'answer-query',
      instruction: 'For queries, require the path; exact search also requires the terminal mark.',
    },
  ],
  complexity: {
    time: 'O(L) per operation',
    space: 'O(T)',
    explanation:
      'An operation reads L characters, while T total created character nodes hold all inserted words.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'trie',
      rootId: 'root',
      nodes: [
        {
          id: 'root',
          label: 'start',
          children: [{ char: 's', nodeId: 's' }],
        },
        { id: 's', label: 's', children: [{ char: 't', nodeId: 'st' }] },
        { id: 'st', label: 'st', children: [{ char: 'a', nodeId: 'sta' }] },
        {
          id: 'sta',
          label: 'sta',
          children: [
            { char: 'r', nodeId: 'star' },
            { char: 'y', nodeId: 'stay' },
          ],
        },
        { id: 'star', label: 'star', terminal: true },
        { id: 'stay', label: 'stay', terminal: true },
      ],
      highlightedNodeIds: ['s', 'st', 'sta'],
      pointers: [{ nodeId: 'sta', label: 'shared prefix' }],
    },
  },
  workedExample: {
    prompt:
      'After inserting "star", exact search for "star" reaches a terminal node. Search for "sta" reaches a path but no terminal, while prefix check for "sta" succeeds.',
    code: [
      'node = root',
      'for char in text:',
      '    if char not in node.children: return False',
      '    node = node.children[char]',
      'return True if prefix_query else node.terminal',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Insert creates the s → t → a → r path and marks r terminal.',
      'Exact "sta" stops at a nonterminal node, so it is false.',
      'The same path is enough for startsWith("sta"), so that query is true.',
    ],
  },
  patternCheck: {
    prompt:
      'What extra fact separates an exact word query from a prefix query?',
    options: [
      {
        id: 'terminal-marker',
        label: 'The final trie node must be marked as a complete word.',
      },
      {
        id: 'root-child-count',
        label: 'The root must have exactly one child.',
      },
      {
        id: 'longest-path',
        label: 'The query must end on the deepest path in the trie.',
      },
      {
        id: 'alphabetical-branch',
        label: 'Every sibling edge must be visited in alphabetical order.',
      },
    ],
    correctOptionId: 'terminal-marker',
    feedback: {
      correct:
        'Exactly. Shared paths answer prefix questions; terminal marks record which paths are whole words.',
      incorrect:
        'That does not tell whether this particular path was inserted as a complete word.',
      secondIncorrect:
        'After following all characters, exact search checks node.terminal.',
    },
    hints: ['"sta" can lead toward "star" without being stored itself.', 'The marker belongs at the final node of an insert.'],
  },
  retrievalCheck: {
    prompt:
      'Type the one-word node property checked after an exact search path succeeds.',
    acceptedAnswers: [
      'terminal',
      'terminal marker',
      'end marker',
      'end-of-word marker',
      'terminal flag',
      'end of word marker',
      'end of word',
      'word end marker',
    ],
    placeholder: 'Node property',
    feedback: {
      correct:
        'Right. The terminal flag separates a stored word from a shared prefix.',
      incorrect:
        'Name the marker set at the end of insertion.',
      secondIncorrect:
        'Check the terminal marker.',
    },
    hints: ['It means “a word ends here.”', 'Prefix checks do not require it.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the trie operation routine from root to result.',
    feedback: {
      correct:
        'Character paths are shared, inserts create gaps, and terminal state answers exact queries.',
      incorrect:
        'Walk characters before marking or answering the final node.',
      secondIncorrect:
        'Use root → follow chars → create on insert → mark end → answer query.',
    },
    hints: ['Every operation restarts at root.', 'Creation occurs only for insert.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Process data["operations"]; insert stores a word, search tests a whole word, and startsWith tests a prefix. Return booleans only for query operations.',
    starterCode: `def solve(data):
    root = {"children": {}, "terminal": False}
    answers = []

    for event in data["operations"]:
        op = event["op"]
        text = event.get("word", event.get("prefix", ""))
        node = root
        # TODO: walk or create the character path.
        # TODO: mark inserts or append the correct query result.
        pass

    return answers`,
    cases: {
      visibleExample: {
        input: {
          operations: [
            { op: 'insert', word: 'star' },
            { op: 'search', word: 'star' },
            { op: 'search', word: 'sta' },
            { op: 'startsWith', prefix: 'sta' },
          ],
        },
        expected: [true, false, true],
      },
      hiddenBoundary: {
        input: { operations: [] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          operations: [
            { op: 'insert', word: 'app' },
            { op: 'insert', word: 'apple' },
            { op: 'search', word: 'app' },
            { op: 'search', word: 'ap' },
            { op: 'startsWith', prefix: 'appl' },
          ],
        },
        expected: [true, false, true],
      },
    },
    feedback: {
      correct:
        'The spellbook shares prefixes while keeping exact words distinct.',
      incorrect:
        'A path, terminal marker, or query-only output was handled incorrectly.',
      secondIncorrect:
        'Insert uses setdefault for each character then marks terminal; queries fail on missing edges, and search also checks terminal.',
    },
    hints: [
      'Return no output for insert events.',
      'An empty prefix follows zero edges and therefore exists.',
      'Use event.get to read either word or prefix.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'trie',
      rootId: 'root',
      nodes: [
        {
          id: 'root',
          label: 'start',
          children: [{ char: 'a', nodeId: 'a' }],
        },
        { id: 'a', label: 'a', children: [{ char: 'p', nodeId: 'ap' }] },
        { id: 'ap', label: 'ap', children: [{ char: 'p', nodeId: 'app' }] },
        {
          id: 'app',
          label: 'app',
          terminal: true,
          children: [{ char: 'l', nodeId: 'appl' }],
        },
        { id: 'appl', label: 'appl', children: [{ char: 'e', nodeId: 'apple' }] },
        { id: 'apple', label: 'apple', terminal: true },
      ],
      highlightedNodeIds: ['app', 'apple'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  implementTriePrefixTreeMissionSeed,
)

export default problemLesson
