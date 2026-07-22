import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const designAddAndSearchWordsDataStructureMissionSeed = {
  slug: 'design-add-and-search-words-data-structure',
  estimatedMinutes: 29,
  mission: {
    title: 'Decode the Smudged Word Vault',
    context:
      'A word vault stores clean labels in letter branches. Later, a scanner may show a dot where one letter is smudged, and that dot may stand for any single character.',
    prompt:
      'Process add and search events, where search patterns may contain dots, and return each search result in event order.',
  },
  objective:
    'Store words in a trie and use branching depth-first search whenever a wildcard can match several child edges.',
  priorKnowledge: [
    'A trie follows one edge for a known character.',
    'A dot wildcard represents exactly one character, not zero or many.',
  ],
  recognitionCue:
    'Queries combine shared-prefix storage with a single-character wildcard that creates choices.',
  misconception:
    'Treating a dot as a literal child label misses every wildcard match.',
  algorithmSteps: [
    {
      id: 'add-words',
      instruction: 'Insert each added word into a trie and mark its ending node.',
    },
    {
      id: 'search-state',
      instruction: 'Search with a state containing the current node and pattern index.',
    },
    {
      id: 'follow-known',
      instruction: 'For a letter, follow only its matching child or fail.',
    },
    {
      id: 'branch-on-dot',
      instruction: 'For a dot, try the next index from every child node.',
    },
    {
      id: 'check-ending',
      instruction: 'At the pattern end, succeed only on a terminal node.',
    },
  ],
  complexity: {
    time: 'O(L) add; O(b^d × L) worst-case search',
    space: 'O(T + L)',
    explanation:
      'Adds walk L letters. Wildcards can branch among b children at d dots; the trie has T nodes and recursion depth L.',
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
          children: [{ char: 'm', nodeId: 'm' }],
        },
        { id: 'm', label: 'm', children: [{ char: 'a', nodeId: 'ma' }, { char: 'o', nodeId: 'mo' }] },
        { id: 'ma', label: 'ma', children: [{ char: 'p', nodeId: 'map' }] },
        { id: 'mo', label: 'mo', children: [{ char: 'p', nodeId: 'mop' }] },
        { id: 'map', label: 'map', terminal: true },
        { id: 'mop', label: 'mop', terminal: true },
      ],
      highlightedNodeIds: ['ma', 'mo'],
      pointers: [{ nodeId: 'm', label: 'dot branches here' }],
    },
  },
  workedExample: {
    prompt:
      'After adding "map" and "mop", search "m.p" follows m, branches to a and o for the dot, and reaches a terminal p on either route.',
    code: [
      'def matches(index, node):',
      '    if index == len(pattern): return node.terminal',
      '    char = pattern[index]',
      '    if char == ".":',
      '        return any(matches(index + 1, child) for child in node.children.values())',
      '    return char in node.children and matches(index + 1, node.children[char])',
    ],
    currentLineIndex: 4,
    walkthrough: [
      'Known letter m chooses one edge.',
      'The dot tries both second-letter branches a and o.',
      'Each route then follows p, and a terminal endpoint makes the query true.',
    ],
  },
  patternCheck: {
    prompt:
      'What should a search do when it reaches a dot in the pattern?',
    options: [
      {
        id: 'try-every-child',
        label: 'Recurse from every child and succeed if any route matches.',
      },
      {
        id: 'skip-dot',
        label: 'Move to the next pattern position without taking a trie edge.',
      },
      {
        id: 'literal-dot',
        label: 'Follow a child edge labeled with the dot character.',
      },
      {
        id: 'first-child-only',
        label: 'Choose the first child and ignore the other letters.',
      },
    ],
    correctOptionId: 'try-every-child',
    feedback: {
      correct:
        'Exactly. A dot consumes one character, so every existing child is a possible route.',
      incorrect:
        'That gives the dot the wrong length or ignores valid character choices.',
      secondIncorrect:
        'Advance the pattern index once while trying all child nodes.',
    },
    hints: ['The wildcard stands for one character.', 'Any matching branch is enough.'],
  },
  retrievalCheck: {
    prompt:
      'At the end of a search pattern, which node flag must be true?',
    acceptedAnswers: [
      'terminal',
      'terminal flag',
      'end-of-word marker',
      'end marker',
      'terminal marker',
      'end of word marker',
      'end of word flag',
      'end of word',
    ],
    placeholder: 'Required flag',
    feedback: {
      correct:
        'Right. Ending on a path alone could mean only a prefix was matched.',
      incorrect:
        'Use the same marker set at the end of each added word.',
      secondIncorrect:
        'The terminal flag must be true.',
    },
    hints: ['Exact-length matching is required.', 'A longer stored word should not satisfy a shorter pattern.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the wildcard-vault algorithm.',
    feedback: {
      correct:
        'Known letters stay on one route, while dots branch and terminal state closes the match.',
      incorrect:
        'Create the trie before searching, and check terminal only when the pattern is fully consumed.',
      secondIncorrect:
        'Use add → search state → known edge → wildcard branches → terminal check.',
    },
    hints: ['The pattern index advances for letters and dots.', 'Search may return early when one dot branch succeeds.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Process data["operations"] with {"op":"add","word":...} and {"op":"search","pattern":...}; dots match exactly one character. Return search booleans only.',
    starterCode: `def solve(data):
    root = {"children": {}, "terminal": False}
    answers = []

    def matches(pattern, index, node):
        # TODO: handle pattern end, a known letter, and a dot branch.
        pass

    for event in data["operations"]:
        if event["op"] == "add":
            # TODO: insert event["word"] and mark its final node.
            pass
        else:
            answers.append(matches(event["pattern"], 0, root))
    return answers`,
    cases: {
      visibleExample: {
        input: {
          operations: [
            { op: 'add', word: 'map' },
            { op: 'add', word: 'mop' },
            { op: 'search', pattern: 'm.p' },
            { op: 'search', pattern: '.ap' },
            { op: 'search', pattern: 'ma.' },
          ],
        },
        expected: [true, true, true],
      },
      hiddenBoundary: {
        input: { operations: [{ op: 'search', pattern: '.' }] },
        expected: [false],
      },
      hiddenAdversarial: {
        input: {
          operations: [
            { op: 'add', word: 'bad' },
            { op: 'add', word: 'bake' },
            { op: 'search', pattern: 'ba..' },
            { op: 'search', pattern: 'b..e' },
            { op: 'search', pattern: '..d.' },
          ],
        },
        expected: [true, true, false],
      },
    },
    feedback: {
      correct:
        'The vault decodes known letters, smudges, exact endings, and empty storage correctly.',
      incorrect:
        'A dot consumed the wrong number of letters or an endpoint ignored terminal state.',
      secondIncorrect:
        'For ".", call matches(index+1, child) for every child; for a letter, follow one child; at len(pattern), return terminal.',
    },
    hints: [
      'Use any(...) for wildcard branches.',
      'A missing known edge returns False.',
      'Adds produce no output entry.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'trie',
      rootId: 'root',
      nodes: [
        { id: 'root', label: 'start', children: [{ char: 'b', nodeId: 'b' }] },
        { id: 'b', label: 'b', children: [{ char: 'a', nodeId: 'ba' }] },
        {
          id: 'ba',
          label: 'ba',
          children: [
            { char: 'd', nodeId: 'bad' },
            { char: 'k', nodeId: 'bak' },
          ],
        },
        { id: 'bad', label: 'bad', terminal: true },
        { id: 'bak', label: 'bak', children: [{ char: 'e', nodeId: 'bake' }] },
        { id: 'bake', label: 'bake', terminal: true },
      ],
      highlightedNodeIds: ['bad', 'bake'],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(
  designAddAndSearchWordsDataStructureMissionSeed,
)

export default problemLesson
