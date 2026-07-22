import type { LinkedListDiagramSpec } from '../../types/diagram'

export const PROBLEM_DIAGRAM_LIMITS = {
  linkedListNodes: 24,
  treeNodes: 31,
  graphNodes: 24,
  graphEdges: 48,
  gridRows: 12,
  gridColumns: 12,
  intervals: 18,
  recursionFrames: 12,
  bitRows: 10,
  bitColumns: 32,
} as const

export type DiagramPosition = {
  id: string
  x: number
  y: number
}

export type IntervalBarLayout = {
  id: string
  x: number
  width: number
  y: number
}

export type IntervalsLayout = {
  domainStart: number
  domainEnd: number
  cursorX?: number
  bars: IntervalBarLayout[]
}

const SVG_WIDTH = 720

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

/**
 * Picks a bounded set of indices while retaining requested highlights/pointers.
 * Returned indices are always in source order.
 */
export function selectVisibleIndices(
  length: number,
  limit: number,
  priorityIndices: readonly number[] = [],
): number[] {
  const validPriority = unique(
    priorityIndices.filter(
      (index) => Number.isInteger(index) && index >= 0 && index < length,
    ),
  )
  const selected = new Set<number>()

  for (const index of validPriority) {
    if (selected.size >= limit) break
    selected.add(index)
  }
  for (let index = 0; index < length && selected.size < limit; index += 1) {
    selected.add(index)
  }

  return [...selected].sort((a, b) => a - b)
}

/** Stable circle layout in authored node order. */
export function layoutCircle(
  nodeIds: readonly string[],
  width = SVG_WIDTH,
  height = 400,
  padding = 54,
): DiagramPosition[] {
  if (nodeIds.length === 0) return []
  if (nodeIds.length === 1) {
    return [{ id: nodeIds[0], x: round(width / 2), y: round(height / 2) }]
  }

  const radiusX = Math.max(1, width / 2 - padding)
  const radiusY = Math.max(1, height / 2 - padding)
  return nodeIds.map((id, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / nodeIds.length
    return {
      id,
      x: round(width / 2 + Math.cos(angle) * radiusX),
      y: round(height / 2 + Math.sin(angle) * radiusY),
    }
  })
}

/** Stable top-to-bottom layout for already-derived hierarchy layers. */
export function layoutLayeredIds(
  layers: readonly (readonly string[])[],
  width = SVG_WIDTH,
  height = 360,
  paddingX = 48,
  paddingY = 48,
): DiagramPosition[] {
  const nonEmptyLayers = layers.filter((layer) => layer.length > 0)
  if (nonEmptyLayers.length === 0) return []

  const usableWidth = Math.max(1, width - paddingX * 2)
  const usableHeight = Math.max(1, height - paddingY * 2)
  return nonEmptyLayers.flatMap((layer, depth) => {
    const y =
      nonEmptyLayers.length === 1
        ? height / 2
        : paddingY + (depth * usableHeight) / (nonEmptyLayers.length - 1)
    return layer.map((id, index) => ({
      id,
      x: round(paddingX + ((index + 1) * usableWidth) / (layer.length + 1)),
      y: round(y),
    }))
  })
}

/**
 * Builds deterministic breadth-first hierarchy layers. Disconnected nodes are
 * retained as additional roots, and cycles terminate safely.
 */
export function buildHierarchyLayers(
  nodeIds: readonly string[],
  rootIds: readonly string[],
  childrenById: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const validIds = new Set(nodeIds)
  const parentedIds = new Set<string>()
  for (const children of childrenById.values()) {
    for (const childId of children) {
      if (validIds.has(childId)) parentedIds.add(childId)
    }
  }

  const layers: string[][] = []
  const visited = new Set<string>()
  const visitRoot = (rootId: string) => {
    if (!validIds.has(rootId) || visited.has(rootId)) return
    const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }]
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const { id, depth } = queue[cursor]
      if (visited.has(id)) continue
      visited.add(id)
      ;(layers[depth] ??= []).push(id)
      for (const childId of childrenById.get(id) ?? []) {
        if (validIds.has(childId) && !visited.has(childId)) {
          queue.push({ id: childId, depth: depth + 1 })
        }
      }
    }
  }

  for (const rootId of unique(rootIds)) visitRoot(rootId)
  for (const nodeId of nodeIds) {
    if (!parentedIds.has(nodeId)) visitRoot(nodeId)
  }
  for (const nodeId of nodeIds) visitRoot(nodeId)

  return layers
}

/** Follows next links from head, then appends disconnected authored nodes. */
export function orderedLinkedListNodeIds(
  nodes: LinkedListDiagramSpec['nodes'],
  head: string | null | undefined,
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ordered: string[] = []
  const visited = new Set<string>()
  let currentId = head ?? undefined

  while (currentId && !visited.has(currentId)) {
    const node = byId.get(currentId)
    if (!node) break
    ordered.push(currentId)
    visited.add(currentId)
    currentId = node.next ?? undefined
  }
  for (const node of nodes) {
    if (!visited.has(node.id)) ordered.push(node.id)
  }
  return ordered
}

export function layoutLinkedList(
  nodeIds: readonly string[],
  width = SVG_WIDTH,
  columns = 5,
): DiagramPosition[] {
  if (nodeIds.length === 0) return []
  const columnCount = Math.max(1, Math.min(columns, nodeIds.length))
  const usableWidth = width - 96

  return nodeIds.map((id, index) => {
    const row = Math.floor(index / columnCount)
    const rawColumn = index % columnCount
    const column = row % 2 === 0 ? rawColumn : columnCount - 1 - rawColumn
    const x =
      columnCount === 1
        ? width / 2
        : 48 + (column * usableWidth) / (columnCount - 1)
    return { id, x: round(x), y: 64 + row * 112 }
  })
}

/** Stable interval positions, including finite zero-width intervals. */
export function layoutIntervals(
  intervals: readonly { id: string; start: number; end: number }[],
  cursor: number | undefined,
  width = SVG_WIDTH,
  paddingLeft = 140,
  paddingRight = 30,
): IntervalsLayout {
  const finiteValues = intervals.flatMap(({ start, end }) =>
    [start, end].filter(Number.isFinite),
  )
  if (cursor != null && Number.isFinite(cursor)) finiteValues.push(cursor)

  let domainStart = finiteValues.length > 0 ? Math.min(...finiteValues) : 0
  let domainEnd = finiteValues.length > 0 ? Math.max(...finiteValues) : 1
  if (domainStart === domainEnd) {
    domainStart -= 0.5
    domainEnd += 0.5
  }

  const plotWidth = Math.max(1, width - paddingLeft - paddingRight)
  const scale = (value: number) =>
    paddingLeft +
    ((clamp(value, domainStart, domainEnd) - domainStart) /
      (domainEnd - domainStart)) *
      plotWidth

  const bars = intervals.map((interval, index) => {
    const safeStart = Number.isFinite(interval.start)
      ? interval.start
      : domainStart
    const safeEnd = Number.isFinite(interval.end) ? interval.end : safeStart
    const x1 = scale(Math.min(safeStart, safeEnd))
    const x2 = scale(Math.max(safeStart, safeEnd))
    return {
      id: interval.id,
      x: round(x1),
      width: round(Math.max(6, x2 - x1)),
      y: 48 + index * 40,
    }
  })

  return {
    domainStart,
    domainEnd,
    cursorX:
      cursor != null && Number.isFinite(cursor) ? round(scale(cursor)) : undefined,
    bars,
  }
}
