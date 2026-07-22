import { createProblemMission } from '../../problemMissionFactory'
import {
  createRealm2MissionSeed,
  type Realm2MissionSeedInput,
} from './missionSupport'

export const copyListWithRandomPointerMissionSeed =
  createRealm2MissionSeed({
    slug: 'copy-list-with-random-pointer',
    estimatedMinutes: 25,
    mission: {
      title: 'The Constellation Tag Replica',
      context:
        'Museum tags form a next-pointer chain, and each tag also has an optional star pointer to any tag in the same chain. A traveling exhibit needs a fully separate replica.',
      prompt:
        'Deep-copy every node and both pointer types. JSON supplies parallel values and random-index arrays; return the copied structure in the same format.',
    },
    objective:
      'Clone a pointer graph by mapping each original node identity to exactly one new node before wiring links.',
    priorKnowledge: [
      'Two nodes may hold equal values but still have different identities.',
      'A hash map can use object identity as a key.',
      'Null next or random pointers should stay null.',
    ],
    recognitionCue:
      'Nodes have cross-links, and every copied link must point to copied nodes rather than originals.',
    misconception:
      'Mapping copies by node value merges distinct nodes when duplicate values occur.',
    keyRule:
      'First create one clone per original identity; then set clone.next and clone.random through the original-to-clone map.',
    algorithmSteps: [
      {
        id: 'map-null',
        instruction: 'Create a map that sends null to null.',
      },
      {
        id: 'create-all-clones',
        instruction:
          'Walk the original next chain and create one unlinked clone for each node.',
      },
      {
        id: 'restart-original-walk',
        instruction: 'Walk the original chain a second time.',
      },
      {
        id: 'wire-clone-next',
        instruction:
          'Set each clone’s next to the mapped copy of original.next.',
      },
      {
        id: 'wire-clone-random',
        instruction:
          'Set each clone’s random to the mapped copy of original.random.',
      },
      {
        id: 'return-cloned-head',
        instruction: 'Return the mapped copy of the original head.',
      },
    ],
    complexity: {
      time: 'O(n)',
      space: 'O(n)',
      explanation:
        'Two linear passes clone and wire n nodes, and the identity map stores one entry per original node.',
    },
    explanationVisuals: {
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 7, next: 'b', random: 'c' },
          { id: 'b', value: 2, next: 'c', random: 'a' },
          { id: 'c', value: 9, next: null, random: 'c' },
        ],
        pointers: [{ nodeId: 'a', label: 'original head' }],
      },
    },
    workedExample: {
      prompt:
        'Tags 7 → 2 → 9 have star targets [9, 7, 9]. Create three blank clones first. Then each copied star pointer can safely look up its copied target.',
      code: [
        'copies[old7] = new7',
        'copies[old2] = new2',
        'copies[old9] = new9',
        'new7.random = copies[old9]',
        'new2.random = copies[old7]',
        'new9.random = copies[old9]',
      ],
      currentLineIndex: 3,
      walkthrough: [
        'The first pass guarantees every possible target already has a clone.',
        'Next links are rebuilt using mapped identities.',
        'Random links may point forward, backward, to self, or to null without special cases.',
        'No link in the replica points back into the original exhibit.',
      ],
      diagram: {
        kind: 'linkedList',
        head: 'ca',
        nodes: [
          { id: 'ca', value: 7, next: 'cb', random: 'cc' },
          { id: 'cb', value: 2, next: 'cc', random: 'ca' },
          { id: 'cc', value: 9, next: null, random: 'cc' },
        ],
        pointers: [{ nodeId: 'ca', label: 'copy head' }],
        highlightedNodeIds: ['ca', 'cb', 'cc'],
      },
    },
    patternCheck: {
      prompt:
        'Why must the copy map use original node identities instead of values?',
      options: [
        {
          id: 'preserve-duplicate-nodes',
          label:
            'Different nodes may share a value and still need separate clones.',
        },
        {
          id: 'sort-copy-values',
          label: 'Identity keys automatically sort the copied list.',
        },
        {
          id: 'avoid-second-pass',
          label: 'Identity keys remove the need to wire any pointers.',
        },
        {
          id: 'change-random-targets',
          label: 'Identity keys let random pointers choose new targets.',
        },
      ],
      correctOptionId: 'preserve-duplicate-nodes',
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 5, next: 'b', random: 'b' },
          { id: 'b', value: 5, next: null, random: 'a' },
        ],
      },
    },
    retrievalCheck: {
      prompt:
        'After all clones exist, how should clone.random be assigned?',
      acceptedAnswers: [
        'copies[original.random]',
        'the mapped copy of original.random',
        'clone.random = map[old.random]',
        'map[original.random]',
        'copies[old.random]',
        'the copy of original.random',
        'the clone mapped from original.random',
      ],
      placeholder: 'Type the mapped-pointer assignment',
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 7, next: 'b', random: 'b' },
          { id: 'b', value: 2, next: null, random: null },
        ],
      },
    },
    reconstructionCheck: {
      prompt:
        'Restore the deep-copy routine from identity-map setup through clone creation, pointer wiring, and copied-head return.',
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 1, next: 'b', random: 'b' },
          { id: 'b', value: 1, next: null, random: 'a' },
        ],
      },
    },
    pythonChallenge: {
      prompt:
        'Write solve(data). data["values"] lists node values and data["random"][i] is a target index or null. Deep-copy the nodes and return {"values": [...], "random": [...]} from the copied chain.',
      starterCode: `class Node:
    def __init__(self, value):
        self.value = value
        self.next = None
        self.random = None

def build(values, random_indices):
    nodes = [Node(value) for value in values]
    for index, node in enumerate(nodes):
        node.next = nodes[index + 1] if index + 1 < len(nodes) else None
        target = random_indices[index]
        node.random = nodes[target] if target is not None else None
    return nodes[0] if nodes else None

def serialize(head):
    nodes = []
    current = head
    while current:
        nodes.append(current)
        current = current.next
    indices = {node: index for index, node in enumerate(nodes)}
    return {
        "values": [node.value for node in nodes],
        "random": [indices[node.random] if node.random else None for node in nodes],
    }

def solve(data):
    head = build(data["values"], data["random"])
    # Create one clone per identity, then wire copied next and random links.
    copied_head = None
    pass
    return serialize(copied_head)`,
      cases: {
        visibleExample: {
          input: { values: [7, 2, 9], random: [2, 0, 2] },
          expected: { values: [7, 2, 9], random: [2, 0, 2] },
        },
        hiddenBoundary: {
          input: { values: [], random: [] },
          expected: { values: [], random: [] },
        },
        hiddenAdversarial: {
          input: { values: [5, 5], random: [1, 1] },
          expected: { values: [5, 5], random: [1, 1] },
        },
      },
      verificationNotes: [
        'The browser verifies copied values and random-target indices after serialization.',
        'Object identity does not survive the browser JSON boundary, so the judge cannot prove that cloned nodes are disjoint from the originals; allocating fresh nodes remains required.',
      ],
      diagram: {
        kind: 'linkedList',
        head: 'a',
        nodes: [
          { id: 'a', value: 7, next: 'b', random: 'c' },
          { id: 'b', value: 2, next: 'c', random: 'a' },
          { id: 'c', value: 9, next: null, random: 'c' },
        ],
      },
    },
  } as const satisfies Realm2MissionSeedInput)

export const problemLesson = createProblemMission(
  copyListWithRandomPointerMissionSeed,
)

export default problemLesson
