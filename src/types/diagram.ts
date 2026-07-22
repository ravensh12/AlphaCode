/** JSON-safe scalar used by the richer lesson diagrams. */
export type DiagramValue = string | number | boolean | null

/**
 * Diagram data is content, not renderer state. Every variant is deliberately
 * serializable so problem lessons can be loaded lazily or cached.
 *
 * The five legacy variants below intentionally retain their original shapes.
 */
export type LegacyDiagramSpec =
  | {
      kind: 'array'
      values: (number | string)[]
      highlight?: number
      pointers?: { index: number; label: string }[]
      /** Indices already visited by the loop — shown dimmed. */
      visited?: number[]
    }
  | {
      kind: 'string'
      chars: string
      pointers?: { index: number; label: string }[]
      visited?: number[]
    }
  | {
      kind: 'hashmap'
      entries: { key: string; value: string | number }[]
      lookup?: string
    }
  | { kind: 'stack'; items: string[] }
  | {
      kind: 'binarySearch'
      values: number[]
      low?: number
      high?: number
      mid?: number
    }

export type LinkedListDiagramSpec = {
  kind: 'linkedList'
  nodes: {
    id: string
    value: string | number
    next?: string | null
    random?: string | null
  }[]
  head?: string | null
  pointers?: { nodeId: string | null; label: string }[]
  highlightedNodeIds?: string[]
}

type TreeDiagramCommon = {
  rootId?: string | null
  pointers?: { nodeId: string | null; label: string }[]
  highlightedNodeIds?: string[]
}

export type BinaryTreeDiagramSpec = TreeDiagramCommon & {
  kind: 'tree'
  variant: 'binary'
  nodes: {
    id: string
    value: string | number
    left?: string | null
    right?: string | null
  }[]
}

export type TrieDiagramSpec = TreeDiagramCommon & {
  kind: 'tree'
  variant: 'trie'
  nodes: {
    id: string
    label: string
    terminal?: boolean
    children?: { char: string; nodeId: string }[]
  }[]
}

export type HeapDiagramSpec = {
  kind: 'tree'
  variant: 'heap'
  heapKind: 'min' | 'max'
  values: (number | string)[]
  highlight?: number
  pointers?: { index: number; label: string }[]
}

export type TreeDiagramSpec =
  | BinaryTreeDiagramSpec
  | TrieDiagramSpec
  | HeapDiagramSpec

export type GraphDiagramSpec = {
  kind: 'graph'
  variant: 'graph'
  directed: boolean
  nodes: { id: string; label: string }[]
  edges: {
    id: string
    from: string
    to: string
    label?: string
    weight?: number
  }[]
  highlightedNodeIds?: string[]
  highlightedEdgeIds?: string[]
}

export type UnionFindDiagramSpec = {
  kind: 'graph'
  variant: 'unionFind'
  nodes: {
    id: string
    label: string
    parentId: string
    rank?: number
    size?: number
  }[]
  highlightedNodeIds?: string[]
}

export type NetworkDiagramSpec =
  | GraphDiagramSpec
  | UnionFindDiagramSpec

type GridDiagramCommon = {
  cells: DiagramValue[][]
  rowLabels?: string[]
  columnLabels?: string[]
  highlightedCells?: { row: number; column: number; label?: string }[]
  pointers?: { row: number; column: number; label: string }[]
}

export type GridDiagramSpec = GridDiagramCommon & {
  kind: 'grid'
  variant: 'grid'
}

export type DpTableDiagramSpec = GridDiagramCommon & {
  kind: 'grid'
  variant: 'dpTable'
  dependencyCells?: { row: number; column: number }[]
}

export type MatrixDiagramSpec = GridDiagramSpec | DpTableDiagramSpec

export type IntervalsDiagramSpec = {
  kind: 'intervals'
  intervals: {
    id: string
    start: number
    end: number
    label?: string
  }[]
  highlightedIntervalIds?: string[]
  cursor?: number
}

export type RecursionDiagramSpec = {
  kind: 'recursion'
  frames: {
    id: string
    label: string
    arguments?: Record<string, DiagramValue>
    result?: DiagramValue
    state?: 'pending' | 'active' | 'returned'
  }[]
  activeFrameId?: string
}

export type BitsDiagramSpec = {
  kind: 'bits'
  rows: {
    id: string
    bits: string
    label?: string
  }[]
  operation?: string
  highlightedBitIndices?: number[]
}

export type DiagramSpec =
  | LegacyDiagramSpec
  | LinkedListDiagramSpec
  | TreeDiagramSpec
  | NetworkDiagramSpec
  | MatrixDiagramSpec
  | IntervalsDiagramSpec
  | RecursionDiagramSpec
  | BitsDiagramSpec
