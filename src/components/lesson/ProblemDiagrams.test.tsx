import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ProblemDiagramSpec } from './ProblemDiagrams'
import { ProblemDiagrams } from './ProblemDiagrams'
import { VisualDiagram } from './VisualDiagram'
import {
  PROBLEM_DIAGRAM_LIMITS,
  buildHierarchyLayers,
  layoutCircle,
  layoutIntervals,
  layoutLayeredIds,
  orderedLinkedListNodeIds,
  selectVisibleIndices,
} from './problemDiagramLayout'

const diagrams: readonly [string, ProblemDiagramSpec, string][] = [
  [
    'linked list',
    {
      kind: 'linkedList',
      head: 'one',
      nodes: [
        { id: 'one', value: 1, next: 'two' },
        { id: 'two', value: 2, next: null, random: 'one' },
      ],
      pointers: [{ nodeId: 'two', label: 'slow' }],
      highlightedNodeIds: ['two'],
    },
    'slow',
  ],
  [
    'binary tree',
    {
      kind: 'tree',
      variant: 'binary',
      rootId: 'root',
      nodes: [
        { id: 'root', value: 2, left: 'left', right: 'right' },
        { id: 'left', value: 1 },
        { id: 'right', value: 3 },
      ],
      pointers: [{ nodeId: 'left', label: 'current' }],
      highlightedNodeIds: ['right'],
    },
    'current',
  ],
  [
    'trie',
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
      highlightedNodeIds: ['a'],
    },
    'root',
  ],
  [
    'heap',
    {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'min',
      values: [1, 3, 2],
      highlight: 0,
      pointers: [{ index: 2, label: 'child' }],
    },
    'child',
  ],
  [
    'authored graph',
    {
      kind: 'graph',
      variant: 'graph',
      directed: true,
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [
        { id: 'ab', from: 'a', to: 'b', label: 'road', weight: 4 },
      ],
      highlightedNodeIds: ['a'],
      highlightedEdgeIds: ['ab'],
    },
    'road',
  ],
  [
    'union find',
    {
      kind: 'graph',
      variant: 'unionFind',
      nodes: [
        { id: 'a', label: 'A', parentId: 'a', rank: 1, size: 2 },
        { id: 'b', label: 'B', parentId: 'a', rank: 0, size: 1 },
      ],
      highlightedNodeIds: ['b'],
    },
    'rank 1',
  ],
  [
    'grid',
    {
      kind: 'grid',
      variant: 'grid',
      cells: [
        [1, 0],
        [0, 1],
      ],
      rowLabels: ['top', 'bottom'],
      columnLabels: ['left', 'right'],
      highlightedCells: [{ row: 0, column: 1, label: 'island' }],
      pointers: [{ row: 1, column: 1, label: 'cell' }],
    },
    'island',
  ],
  [
    'dynamic programming table',
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
    'Dynamic programming table',
  ],
  [
    'intervals',
    {
      kind: 'intervals',
      intervals: [
        { id: 'first', start: 1, end: 3, label: 'meeting' },
        { id: 'second', start: 4, end: 6 },
      ],
      highlightedIntervalIds: ['first'],
      cursor: 3,
    },
    'meeting',
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
        {
          id: 'call-2',
          label: 'dfs(2)',
          result: true,
          state: 'returned',
        },
      ],
      activeFrameId: 'call-1',
    },
    'dfs(1)',
  ],
  [
    'bits',
    {
      kind: 'bits',
      rows: [
        { id: 'a', label: 'left', bits: '0101' },
        { id: 'b', label: 'right', bits: '0011' },
      ],
      operation: 'XOR',
      highlightedBitIndices: [1, 2],
    },
    'XOR',
  ],
]

const emptyDiagrams: readonly [string, ProblemDiagramSpec][] = [
  ['linked list', { kind: 'linkedList', nodes: [], head: null }],
  [
    'binary tree',
    { kind: 'tree', variant: 'binary', nodes: [], rootId: null },
  ],
  ['trie', { kind: 'tree', variant: 'trie', nodes: [], rootId: null }],
  [
    'heap',
    { kind: 'tree', variant: 'heap', heapKind: 'max', values: [] },
  ],
  [
    'graph',
    { kind: 'graph', variant: 'graph', directed: false, nodes: [], edges: [] },
  ],
  ['union find', { kind: 'graph', variant: 'unionFind', nodes: [] }],
  ['grid', { kind: 'grid', variant: 'grid', cells: [] }],
  ['dp table', { kind: 'grid', variant: 'dpTable', cells: [[]] }],
  ['intervals', { kind: 'intervals', intervals: [] }],
  ['recursion', { kind: 'recursion', frames: [] }],
  ['bits', { kind: 'bits', rows: [] }],
  ['zero-width bits', { kind: 'bits', rows: [{ id: 'empty', bits: '' }] }],
]

describe('ProblemDiagrams markup', () => {
  it.each(diagrams)(
    'renders accessible %s markup',
    (_name, diagram, expectedText) => {
      const markup = renderToStaticMarkup(
        <ProblemDiagrams diagram={diagram} />,
      )

      expect(markup).toContain('role="img"')
      expect(markup).toContain(`data-diagram-kind="${diagram.kind}"`)
      expect(markup).toMatch(/aria-label="[^"]+"/)
      expect(markup).toContain(expectedText)
    },
  )

  it.each(emptyDiagrams)('renders the empty %s boundary', (_name, diagram) => {
    const markup = renderToStaticMarkup(<ProblemDiagrams diagram={diagram} />)

    expect(markup).toContain('role="img"')
    expect(markup).toContain('problem-diagram__empty')
    expect(markup).toMatch(/aria-label="[^"]+"/)
  })

  it('produces deterministic markup for an authored graph', () => {
    const diagram = diagrams.find(([name]) => name === 'authored graph')?.[1]
    expect(diagram).toBeDefined()

    const first = renderToStaticMarkup(
      <ProblemDiagrams diagram={diagram as ProblemDiagramSpec} />,
    )
    const second = renderToStaticMarkup(
      <ProblemDiagrams diagram={diagram as ProblemDiagramSpec} />,
    )
    expect(second).toBe(first)
  })

  it('renders directed self-loops without non-finite geometry', () => {
    const markup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'graph',
          variant: 'graph',
          directed: true,
          nodes: [{ id: 'self', label: 'Self' }],
          edges: [{ id: 'loop', from: 'self', to: 'self' }],
        }}
      />,
    )

    expect(markup).toContain('data-edge-id="loop"')
    expect(markup).not.toMatch(/NaN|Infinity/)
  })
})

describe('VisualDiagram integration', () => {
  it.each(diagrams)(
    'delegates the new %s kind',
    (_name, diagram) => {
      const markup = renderToStaticMarkup(<VisualDiagram diagram={diagram} />)

      expect(markup).toContain('class="viz problem-diagram')
      expect(markup).toContain(`data-diagram-kind="${diagram.kind}"`)
    },
  )

  it('keeps a legacy renderer on its existing path', () => {
    const markup = renderToStaticMarkup(
      <VisualDiagram
        diagram={{
          kind: 'array',
          values: [3, 1, 2],
          highlight: 1,
          pointers: [{ index: 1, label: 'i' }],
        }}
      />,
    )

    expect(markup).toContain('viz-array')
    expect(markup).not.toContain('problem-diagram')
  })
})

describe('problem diagram layout helpers', () => {
  it('lays nodes on a stable circle in authored order', () => {
    const expected = [
      { id: 'a', x: 200, y: 50 },
      { id: 'b', x: 350, y: 200 },
      { id: 'c', x: 200, y: 350 },
      { id: 'd', x: 50, y: 200 },
    ]

    expect(layoutCircle(['a', 'b', 'c', 'd'], 400, 400, 50)).toEqual(
      expected,
    )
    expect(layoutCircle(['a', 'b', 'c', 'd'], 400, 400, 50)).toEqual(
      expected,
    )
    expect(layoutCircle([], 400, 400, 50)).toEqual([])
    expect(layoutCircle(['only'], 400, 300, 50)).toEqual([
      { id: 'only', x: 200, y: 150 },
    ])
  })

  it('lays hierarchy layers deterministically', () => {
    expect(
      layoutLayeredIds([['root'], ['left', 'right']], 400, 300, 50, 50),
    ).toEqual([
      { id: 'root', x: 200, y: 50 },
      { id: 'left', x: 150, y: 250 },
      { id: 'right', x: 250, y: 250 },
    ])

    const children = new Map<string, readonly string[]>([
      ['root', ['left', 'right']],
      ['left', ['leaf']],
    ])
    expect(
      buildHierarchyLayers(
        ['root', 'left', 'right', 'leaf', 'orphan'],
        ['root'],
        children,
      ),
    ).toEqual([['root', 'orphan'], ['left', 'right'], ['leaf']])
  })

  it('orders linked lists safely across cycles and disconnected nodes', () => {
    expect(
      orderedLinkedListNodeIds(
        [
          { id: 'a', value: 1, next: 'b' },
          { id: 'b', value: 2, next: 'a' },
          { id: 'orphan', value: 3 },
        ],
        'a',
      ),
    ).toEqual(['a', 'b', 'orphan'])
    expect(orderedLinkedListNodeIds([], 'missing')).toEqual([])
  })

  it('keeps interval point ranges finite and visible', () => {
    const layout = layoutIntervals(
      [{ id: 'point', start: 5, end: 5 }],
      5,
      400,
      100,
      20,
    )

    expect(layout.domainStart).toBe(4.5)
    expect(layout.domainEnd).toBe(5.5)
    expect(layout.cursorX).toBe(240)
    expect(layout.bars[0].width).toBe(6)
    expect(Object.values(layout.bars[0]).join('')).not.toMatch(/NaN|Infinity/)
  })

  it('selects valid priority indices and preserves source order', () => {
    expect(selectVisibleIndices(10, 4, [9, 9, -1, 4.5, 7])).toEqual([
      0, 1, 7, 9,
    ])
    expect(selectVisibleIndices(0, 4, [0])).toEqual([])
  })
})

describe('problem diagram density limits', () => {
  it('retains highlighted graph nodes and edges outside the initial cap', () => {
    const nodes = Array.from({ length: 30 }, (_, index) => ({
      id: `n${index}`,
      label: `Node ${index}`,
    }))
    const markup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'graph',
          variant: 'graph',
          directed: true,
          nodes,
          edges: [{ id: 'late', from: 'n28', to: 'n29', label: 'late edge' }],
          highlightedNodeIds: ['n29'],
          highlightedEdgeIds: ['late'],
        }}
      />,
    )

    expect(markup).toContain('data-node-id="n29"')
    expect(markup).toContain('data-edge-id="late"')
    expect(markup).toContain('nodes and')
    expect((markup.match(/data-node-id=/g) ?? []).length).toBe(
      PROBLEM_DIAGRAM_LIMITS.graphNodes,
    )
  })

  it('retains linked-list highlights and pointers beyond the cap', () => {
    const nodes = Array.from({ length: 30 }, (_, index) => ({
      id: `n${index}`,
      value: index,
      next: index === 29 ? null : `n${index + 1}`,
    }))
    const markup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'linkedList',
          nodes,
          head: 'n0',
          highlightedNodeIds: ['n29'],
          pointers: [{ nodeId: 'n28', label: 'tail' }],
        }}
      />,
    )

    expect(markup).toContain('data-node-id="n29"')
    expect(markup).toContain('data-node-id="n28"')
    expect(markup).toContain('tail')
    expect(markup).toContain('additional nodes')
  })

  it('retains marked grid cells, heap values, and bit columns', () => {
    const cells = Array.from({ length: 20 }, (_, row) =>
      Array.from({ length: 20 }, (_, column) => row * 20 + column),
    )
    const gridMarkup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'grid',
          variant: 'dpTable',
          cells,
          highlightedCells: [{ row: 19, column: 19, label: 'goal' }],
          pointers: [{ row: 19, column: 19, label: 'cursor' }],
          dependencyCells: [{ row: 18, column: 19 }],
        }}
      />,
    )
    expect(gridMarkup).toContain('data-cell="19,19"')
    expect(gridMarkup).toContain('goal')
    expect(gridMarkup).toContain('cursor')

    const heapMarkup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'tree',
          variant: 'heap',
          heapKind: 'max',
          values: Array.from({ length: 64 }, (_, index) => 64 - index),
          highlight: 63,
          pointers: [{ index: 63, label: 'deep' }],
        }}
      />,
    )
    expect(heapMarkup).toContain('data-node-id="63"')
    expect(heapMarkup).toContain('deep')

    const bitsMarkup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'bits',
          rows: [{ id: 'wide', bits: '0'.repeat(39) + '1' }],
          highlightedBitIndices: [39],
        }}
      />,
    )
    expect(bitsMarkup).toContain('data-bit-index="39"')
    expect(bitsMarkup).toContain('bit columns hidden')
  })

  it('retains highlighted intervals and the active recursion frame', () => {
    const intervalMarkup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'intervals',
          intervals: Array.from({ length: 24 }, (_, index) => ({
            id: `i${index}`,
            start: index,
            end: index + 1,
          })),
          highlightedIntervalIds: ['i23'],
        }}
      />,
    )
    expect(intervalMarkup).toContain('data-interval-id="i23"')
    expect(intervalMarkup).toContain('additional intervals')

    const recursionMarkup = renderToStaticMarkup(
      <ProblemDiagrams
        diagram={{
          kind: 'recursion',
          frames: Array.from({ length: 20 }, (_, index) => ({
            id: `f${index}`,
            label: `call(${index})`,
          })),
          activeFrameId: 'f0',
        }}
      />,
    )
    expect(recursionMarkup).toContain('data-frame-id="f0"')
    expect(recursionMarkup).toContain('data-frame-state="active"')
    expect(recursionMarkup).toContain('earlier frames hidden')
  })
})
