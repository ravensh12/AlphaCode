import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const wordSearchIiMissionSeed = {
  slug: 'word-search-ii',
  estimatedMinutes: 34,
  mission: {
    title: 'Recover Words from the Rune Field',
    context:
      'A field of letter runes hides words along up, down, left, and right steps. Each rune tile may be used only once in one word route, and the scouts have a whole list to find.',
    prompt:
      'Find every listed word that can be traced in the board and return each found word once. Output order does not matter.',
  },
  objective:
    'Combine a trie with board backtracking so impossible word prefixes stop early and shared prefixes are explored once.',
  priorKnowledge: [
    'Backtracking marks a choice, explores neighbors, then restores the choice.',
    'A trie can tell whether a partial character route begins any wanted word.',
  ],
  recognitionCue:
    'Many target words must be searched on one board, and those words can share prefixes.',
  misconception:
    'Running a complete board search separately for every word repeats the same prefix work many times.',
  algorithmSteps: [
    {
      id: 'build-word-trie',
      instruction: 'Insert all target words into a trie, storing each complete word at its terminal node.',
    },
    {
      id: 'start-each-cell',
      instruction: 'Begin a backtracking search from every board cell.',
    },
    {
      id: 'prune-prefix',
      instruction: 'Stop when the cell letter is not a child of the current trie node.',
    },
    {
      id: 'mark-and-report',
      instruction: 'Mark the cell used and record a terminal word without duplicating it.',
    },
    {
      id: 'explore-restore',
      instruction: 'Explore four neighbors, then restore the cell for other routes.',
    },
  ],
  complexity: {
    time: 'O(T + R × C × 4^L) worst case',
    space: 'O(T + L)',
    explanation:
      'Building the trie costs O(T) total word characters. The loose board-search bound branches from each cell to depth L; T trie nodes and an L-deep route are stored.',
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
          children: [
            { char: 'c', nodeId: 'c' },
            { char: 'd', nodeId: 'd' },
          ],
        },
        { id: 'c', label: 'c', children: [{ char: 'a', nodeId: 'ca' }] },
        {
          id: 'ca',
          label: 'ca',
          children: [
            { char: 't', nodeId: 'cat' },
            { char: 'r', nodeId: 'car' },
          ],
        },
        { id: 'cat', label: 'cat', terminal: true },
        { id: 'car', label: 'car', terminal: true, children: [{ char: 'e', nodeId: 'care' }] },
        { id: 'care', label: 'care', terminal: true },
        { id: 'd', label: 'd', children: [{ char: 'o', nodeId: 'do' }] },
        { id: 'do', label: 'do', children: [{ char: 'g', nodeId: 'dog' }] },
        { id: 'dog', label: 'dog', terminal: true },
      ],
      highlightedNodeIds: ['c', 'ca', 'cat', 'car', 'care'],
    },
  },
  workedExample: {
    prompt:
      'On the rune field with top row c-a-t, the route c→a reaches a shared trie prefix. One step right finds "cat"; stepping down then right can find "care".',
    code: [
      'def visit(row, col, trie_node):',
      '    char = board[row][col]',
      '    if char not in trie_node.children: return',
      '    next_node = trie_node.children[char]',
      '    if next_node.word is not None: found.add(next_node.word)',
      '    mark, explore four neighbors, restore',
    ],
    currentLineIndex: 2,
    walkthrough: [
      'The trie rejects any board letter that cannot continue a target prefix.',
      'The c→a route remains useful for several words instead of restarting.',
      'A visited mark blocks tile reuse until that route returns and restores it.',
    ],
  },
  patternCheck: {
    prompt:
      'Why place all target words in one trie before searching the board?',
    options: [
      {
        id: 'share-and-prune',
        label: 'Shared prefixes reuse work, and missing prefixes stop routes early.',
      },
      {
        id: 'sort-board',
        label: 'A trie rearranges board letters into alphabetical order.',
      },
      {
        id: 'allow-diagonals',
        label: 'Trie edges make diagonal board moves legal.',
      },
      {
        id: 'reuse-cells',
        label: 'A trie lets one route use the same board tile several times.',
      },
    ],
    correctOptionId: 'share-and-prune',
    feedback: {
      correct:
        'Exactly. One prefix walk can serve several words and can stop as soon as no word continues.',
      incorrect:
        'That changes the board rules or gives the trie a job it does not perform.',
      secondIncorrect:
        'Use the trie as a live prefix filter during backtracking.',
    },
    hints: ['Words like cat and care share early letters.', 'A partial route absent from the trie cannot finish any target.'],
  },
  retrievalCheck: {
    prompt:
      'After exploring a route from a tile, what must happen to that tile before returning?',
    acceptedAnswers: [
      'restore it',
      'unmark it',
      'restore the tile',
      'remove the visited mark',
      'restore',
      'unmark',
      'unmark the tile',
      'undo the mark',
      'it must be restored',
    ],
    placeholder: 'Backtracking action',
    feedback: {
      correct:
        'Right. Restoration lets a different route use the tile later.',
      incorrect:
        'Backtracking must undo the route’s temporary choice.',
      secondIncorrect:
        'Restore or unmark the tile.',
    },
    hints: ['The visited state belongs only to one active route.', 'Think choose → explore → undo.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the trie-guided rune search.',
    feedback: {
      correct:
        'The trie is ready before starts are tried, and each valid prefix route is safely restored.',
      incorrect:
        'Build the trie first, prune before marking, and always undo the board mark.',
      secondIncorrect:
        'Use build trie → start cells → prune → mark/report → explore/restore.',
    },
    hints: ['A missing prefix needs no neighbor search.', 'Record words when their terminal trie nodes are reached.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Read board and words. Moves are orthogonal, a tile is used once per route, and each traceable word appears exactly once in the output; result order is not graded.',
    starterCode: `def solve(data):
    board = data["board"]
    words = data["words"]
    if not board or not words:
        return []

    root = {"children": {}, "word": None}
    # TODO: insert every word, storing the full word at its terminal node.
    found = set()

    def visit(row, col, node):
        # TODO: prune by trie edge, mark, report, explore, and restore.
        pass

    # TODO: start visit from every board cell.
    return list(found)`,
    cases: {
      visibleExample: {
        input: {
          board: [
            ['c', 'a', 't'],
            ['r', 'r', 'e'],
            ['d', 'o', 'g'],
          ],
          words: ['cat', 'car', 'card', 'dog', 'care'],
        },
        expected: ['cat', 'car', 'dog', 'care'],
      },
      hiddenBoundary: {
        input: { board: [], words: ['a'] },
        expected: [],
      },
      hiddenAdversarial: {
        input: {
          board: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          words: ['ab', 'abc', 'abd', 'acdb', 'aa', 'db'],
        },
        expected: ['ab', 'abd', 'acdb', 'db'],
      },
    },
    comparator: { kind: 'unordered', recursive: false },
    feedback: {
      correct:
        'The scouts recover all valid words once without reusing a rune.',
      incorrect:
        'A route crossed diagonally, reused a tile, skipped a shared prefix, or reported the wrong word set.',
      secondIncorrect:
        'Follow one trie child per cell, replace the board cell temporarily, explore four directions, restore it, then return the found words.',
    },
    hints: [
      'Check row and column bounds before reading a neighbor.',
      'A special marker such as None can block the active tile.',
      'A set prevents duplicate discoveries; filtering words restores deterministic order.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'trie',
      rootId: 'root',
      nodes: [
        {
          id: 'root',
          label: 'start',
          children: [
            { char: 'a', nodeId: 'a' },
            { char: 'd', nodeId: 'd' },
          ],
        },
        { id: 'a', label: 'a', children: [{ char: 'b', nodeId: 'ab' }, { char: 'c', nodeId: 'ac' }] },
        { id: 'ab', label: 'ab', terminal: true, children: [{ char: 'd', nodeId: 'abd' }] },
        { id: 'abd', label: 'abd', terminal: true },
        { id: 'ac', label: 'ac', children: [{ char: 'd', nodeId: 'acd' }] },
        { id: 'acd', label: 'acd', children: [{ char: 'b', nodeId: 'acdb' }] },
        { id: 'acdb', label: 'acdb', terminal: true },
        { id: 'd', label: 'd', children: [{ char: 'b', nodeId: 'db' }] },
        { id: 'db', label: 'db', terminal: true },
      ],
      highlightedNodeIds: ['ab', 'abd', 'acdb', 'db'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(wordSearchIiMissionSeed)

export default problemLesson
