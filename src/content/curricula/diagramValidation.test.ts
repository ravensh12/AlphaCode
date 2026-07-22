import { describe, expect, it } from 'vitest'
import type { DiagramSpec } from '../../types/diagram'
import {
  PROBLEM_LESSON_LIMITS,
  validateDiagramSpec,
} from './problemLessonCompiler'

const validDiagrams: readonly [string, DiagramSpec][] = [
  [
    'array',
    {
      kind: 'array',
      values: [3, 1, 2],
      highlight: 1,
      pointers: [{ index: 1, label: 'i' }],
      visited: [0],
    },
  ],
  [
    'string',
    {
      kind: 'string',
      chars: 'abc',
      pointers: [{ index: 2, label: 'right' }],
      visited: [0, 1],
    },
  ],
  [
    'hashmap',
    {
      kind: 'hashmap',
      entries: [{ key: 'a', value: 1 }],
      lookup: 'a',
    },
  ],
  ['stack', { kind: 'stack', items: ['(', '['] }],
  [
    'binarySearch',
    {
      kind: 'binarySearch',
      values: [1, 3, 5],
      low: 0,
      high: 2,
      mid: 1,
    },
  ],
  [
    'linkedList',
    {
      kind: 'linkedList',
      head: 'a',
      nodes: [
        { id: 'a', value: 1, next: 'b' },
        { id: 'b', value: 2, next: null, random: 'a' },
      ],
      pointers: [{ nodeId: 'a', label: 'head' }],
      highlightedNodeIds: ['b'],
    },
  ],
  [
    'tree/binary',
    {
      kind: 'tree',
      variant: 'binary',
      rootId: 'root',
      nodes: [
        { id: 'root', value: 2, left: 'left', right: 'right' },
        { id: 'left', value: 1 },
        { id: 'right', value: 3 },
      ],
      highlightedNodeIds: ['root'],
    },
  ],
  [
    'tree/trie',
    {
      kind: 'tree',
      variant: 'trie',
      rootId: 'root',
      nodes: [
        {
          id: 'root',
          label: '',
          children: [{ char: 'a', nodeId: 'a' }],
        },
        { id: 'a', label: 'a', terminal: true },
      ],
    },
  ],
  [
    'tree/heap',
    {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [1, 3, 2],
      highlight: 0,
      pointers: [{ index: 1, label: 'child' }],
    },
  ],
  [
    'graph/graph',
    {
      kind: 'graph',
      variant: 'graph',
      directed: false,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ id: 'ab', from: 'a', to: 'b', weight: 2 }],
      highlightedNodeIds: ['a'],
      highlightedEdgeIds: ['ab'],
    },
  ],
  [
    'graph/unionFind',
    {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'a', label: 'A', parentId: 'a', rank: 1, size: 2 },
        { id: 'b', label: 'B', parentId: 'a', rank: 0, size: 1 },
      ],
      highlightedNodeIds: ['b'],
    },
  ],
  [
    'grid/grid',
    {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 0],
        [0, 1],
      ],
      rowLabels: ['0', '1'],
      columnLabels: ['0', '1'],
      highlightedCells: [{ row: 0, column: 1 }],
      pointers: [{ row: 1, column: 1, label: 'cell' }],
    },
  ],
  [
    'grid/dpTable',
    {
      kind: 'grid',
      variant: 'dpTable',
      cells: [
        [0, 1],
        [1, 2],
      ],
      dependencyCells: [
        { row: 0, column: 1 },
        { row: 1, column: 0 },
      ],
    },
  ],
  [
    'intervals',
    {
      kind: 'intervals',
      intervals: [
        { id: 'first', start: 1, end: 3 },
        { id: 'second', start: 4, end: 6 },
      ],
      highlightedIntervalIds: ['first'],
      cursor: 3,
    },
  ],
  [
    'recursion',
    {
      kind: 'recursion',
      frames: [
        {
          id: 'call-1',
          label: 'dfs(1)',
          arguments: { node: 1 },
          state: 'active',
        },
      ],
      activeFrameId: 'call-1',
    },
  ],
  [
    'bits',
    {
      kind: 'bits',
      rows: [
        { id: 'a', label: 'a', bits: '0101' },
        { id: 'b', label: 'b', bits: '0011' },
      ],
      operation: 'XOR',
      highlightedBitIndices: [1, 2],
    },
  ],
]

describe('diagram validation', () => {
  it.each(validDiagrams)('accepts the %s serializable shape', (_name, diagram) => {
    expect(validateDiagramSpec(diagram)).toEqual([])
    expect(JSON.parse(JSON.stringify(diagram))).toEqual(diagram)
  })

  const invalidDiagrams: readonly [string, DiagramSpec, string][] = [
    [
      'array bounds',
      { kind: 'array', values: [1], highlight: 1 },
      'diagram.index',
    ],
    [
      'string bounds',
      {
        kind: 'string',
        chars: 'a',
        pointers: [{ index: -1, label: 'i' }],
      },
      'diagram.index',
    ],
    [
      'hash map duplicate keys',
      {
        kind: 'hashmap',
        entries: [
          { key: 'a', value: 1 },
          { key: 'a', value: 2 },
        ],
      },
      'id.duplicate',
    ],
    [
      'stack size cap',
      {
        kind: 'stack',
        items: Array.from(
          { length: PROBLEM_LESSON_LIMITS.sequenceValues + 1 },
          (_, index) => String(index),
        ),
      },
      'diagram.size',
    ],
    [
      'binary search bounds',
      {
        kind: 'binarySearch',
        values: [1, 2],
        low: 1,
        high: 0,
      },
      'diagram.bounds',
    ],
    [
      'linked list reference',
      {
        kind: 'linkedList',
        head: 'missing',
        nodes: [{ id: 'a', value: 1 }],
      },
      'diagram.reference',
    ],
    [
      'binary tree reference',
      {
        kind: 'tree',
        variant: 'binary',
        rootId: 'root',
        nodes: [{ id: 'root', value: 1, left: 'missing' }],
      },
      'diagram.reference',
    ],
    [
      'binary tree cycle',
      {
        kind: 'tree',
        variant: 'binary',
        rootId: 'root',
        nodes: [{ id: 'root', value: 1, left: 'root' }],
      },
      'diagram.cycle',
    ],
    [
      'trie reference',
      {
        kind: 'tree',
        variant: 'trie',
        rootId: 'root',
        nodes: [
          {
            id: 'root',
            label: '',
            children: [{ char: 'a', nodeId: 'missing' }],
          },
        ],
      },
      'diagram.reference',
    ],
    [
      'heap bounds',
      {
        kind: 'tree',
        variant: 'heap',
        heapKind: 'max',
        values: [3],
        highlight: 2,
      },
      'diagram.index',
    ],
    [
      'graph edge reference',
      {
        kind: 'graph',
        variant: 'graph',
        directed: true,
        nodes: [{ id: 'a', label: 'A' }],
        edges: [{ id: 'edge', from: 'a', to: 'missing' }],
      },
      'diagram.reference',
    ],
    [
      'union-find parent reference',
      {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [{ id: 'a', label: 'A', parentId: 'missing' }],
      },
      'diagram.reference',
    ],
    [
      'union-find cycle',
      {
        kind: 'graph',
        variant: 'unionFind',
        nodes: [
          { id: 'a', label: 'A', parentId: 'b' },
          { id: 'b', label: 'B', parentId: 'a' },
        ],
      },
      'diagram.cycle',
    ],
    [
      'grid shape',
      {
        kind: 'grid',
        variant: 'grid',
        cells: [[1, 2], [3]],
      },
      'diagram.rectangular',
    ],
    [
      'dp dependency bounds',
      {
        kind: 'grid',
        variant: 'dpTable',
        cells: [[0]],
        dependencyCells: [{ row: 1, column: 0 }],
      },
      'diagram.index',
    ],
    [
      'interval bounds',
      {
        kind: 'intervals',
        intervals: [{ id: 'bad', start: 4, end: 1 }],
      },
      'diagram.interval',
    ],
    [
      'recursion reference',
      {
        kind: 'recursion',
        frames: [{ id: 'call', label: 'f()' }],
        activeFrameId: 'missing',
      },
      'diagram.reference',
    ],
    [
      'bit encoding',
      {
        kind: 'bits',
        rows: [{ id: 'bad', bits: '012' }],
      },
      'diagram.bits',
    ],
  ]

  it.each(invalidDiagrams)(
    'rejects invalid %s',
    (_name, diagram, expectedCode) => {
      expect(validateDiagramSpec(diagram).map(({ code }) => code)).toContain(
        expectedCode,
      )
    },
  )
})
