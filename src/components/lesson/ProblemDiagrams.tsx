import type { ReactNode } from 'react'
import type {
  BinaryTreeDiagramSpec,
  BitsDiagramSpec,
  GraphDiagramSpec,
  HeapDiagramSpec,
  IntervalsDiagramSpec,
  LinkedListDiagramSpec,
  MatrixDiagramSpec,
  NetworkDiagramSpec,
  RecursionDiagramSpec,
  TreeDiagramSpec,
  TrieDiagramSpec,
} from '../../types/diagram'
import {
  PROBLEM_DIAGRAM_LIMITS,
  buildHierarchyLayers,
  layoutCircle,
  layoutIntervals,
  layoutLayeredIds,
  layoutLinkedList,
  orderedLinkedListNodeIds,
  selectVisibleIndices,
  type DiagramPosition,
} from './problemDiagramLayout'
import './ProblemDiagrams.css'

export type ProblemDiagramSpec =
  | LinkedListDiagramSpec
  | TreeDiagramSpec
  | NetworkDiagramSpec
  | MatrixDiagramSpec
  | IntervalsDiagramSpec
  | RecursionDiagramSpec
  | BitsDiagramSpec

const SVG_WIDTH = 720
const NODE_RADIUS = 24

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function truncate(value: string, length: number): string {
  if (value.length <= length) return value
  return `${value.slice(0, Math.max(1, length - 1))}…`
}

function formatValue(value: string | number | boolean | null): string {
  if (value === null) return 'null'
  return String(value)
}

function summarize(values: readonly string[], limit = 10): string {
  if (values.length === 0) return 'none'
  const visible = values.slice(0, limit)
  const suffix =
    values.length > limit ? `, and ${values.length - limit} more` : ''
  return `${visible.join(', ')}${suffix}`
}

function selectItems<T>(
  items: readonly T[],
  limit: number,
  getId: (item: T) => string,
  priorityIds: readonly string[] = [],
): { items: T[]; omitted: number } {
  const available = new Set(items.map(getId))
  const selected = new Set<string>()

  for (const id of priorityIds) {
    if (selected.size >= limit) break
    if (available.has(id)) selected.add(id)
  }
  for (const item of items) {
    if (selected.size >= limit) break
    selected.add(getId(item))
  }

  const visible = items.filter((item) => selected.has(getId(item)))
  return { items: visible, omitted: Math.max(0, items.length - visible.length) }
}

function addAncestors(
  ids: readonly string[],
  parentById: ReadonlyMap<string, string>,
): string[] {
  const result: string[] = []
  for (const startingId of ids) {
    let id: string | undefined = startingId
    const visited = new Set<string>()
    while (id && !visited.has(id)) {
      result.push(id)
      visited.add(id)
      const parentId = parentById.get(id)
      id = parentId && parentId !== id ? parentId : undefined
    }
  }
  return unique(result)
}

function positionMap(positions: readonly DiagramPosition[]) {
  return new Map(positions.map((position) => [position.id, position]))
}

function pointerLabelsForNode(
  pointers: readonly { nodeId: string | null; label: string }[] | undefined,
  nodeId: string,
): string[] {
  return pointers
    ?.filter((pointer) => pointer.nodeId === nodeId)
    .map(({ label }) => label) ?? []
}

function nullPointerLabels(
  pointers: readonly { nodeId: string | null; label: string }[] | undefined,
): string[] {
  return pointers
    ?.filter((pointer) => pointer.nodeId === null)
    .map(({ label }) => label) ?? []
}

function pointLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value))
}

function SvgEdge({
  id,
  from,
  to,
  label,
  title,
  directed = false,
  highlighted = false,
  dashed = false,
  curved = false,
}: {
  id: string
  from: DiagramPosition
  to: DiagramPosition
  label?: string
  title?: string
  directed?: boolean
  highlighted?: boolean
  dashed?: boolean
  curved?: boolean
}) {
  if (from.id === to.id || (from.x === to.x && from.y === to.y)) {
    const path = `M ${from.x - 13} ${from.y - 20} C ${from.x - 42} ${from.y - 62}, ${from.x + 42} ${from.y - 62}, ${from.x + 13} ${from.y - 20}`
    return (
      <g
        className={`problem-diagram__edge ${highlighted ? 'is-highlighted' : ''} ${dashed ? 'is-dashed' : ''}`}
        data-edge-id={id}
      >
        {title && <title>{title}</title>}
        <path d={path} />
        {directed && (
          <polygon
            className="problem-diagram__arrow"
            points={`${from.x + 13},${from.y - 20} ${from.x + 4},${from.y - 24} ${from.x + 10},${from.y - 31}`}
          />
        )}
        {label && (
          <text
            className="problem-diagram__edge-label"
            x={from.x}
            y={from.y - 58}
            textAnchor="middle"
          >
            {truncate(label, 14)}
          </text>
        )}
      </g>
    )
  }

  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.max(1, Math.hypot(dx, dy))
  const ux = dx / distance
  const uy = dy / distance
  const start = {
    x: from.x + ux * NODE_RADIUS,
    y: from.y + uy * NODE_RADIUS,
  }
  const end = {
    x: to.x - ux * (NODE_RADIUS + (directed ? 5 : 0)),
    y: to.y - uy * (NODE_RADIUS + (directed ? 5 : 0)),
  }
  const offset = curved ? 28 : 0
  const control = {
    x: (start.x + end.x) / 2 - uy * offset,
    y: (start.y + end.y) / 2 + ux * offset,
  }
  const labelPoint = curved
    ? {
        x: (start.x + 2 * control.x + end.x) / 4,
        y: (start.y + 2 * control.y + end.y) / 4,
      }
    : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const arrowAngle = Math.atan2(end.y - control.y, end.x - control.x)
  const arrowLength = 10
  const arrowWidth = 5
  const arrowBase = {
    x: end.x - Math.cos(arrowAngle) * arrowLength,
    y: end.y - Math.sin(arrowAngle) * arrowLength,
  }
  const arrowPoints = [
    `${round(end.x)},${round(end.y)}`,
    `${round(arrowBase.x - Math.sin(arrowAngle) * arrowWidth)},${round(
      arrowBase.y + Math.cos(arrowAngle) * arrowWidth,
    )}`,
    `${round(arrowBase.x + Math.sin(arrowAngle) * arrowWidth)},${round(
      arrowBase.y - Math.cos(arrowAngle) * arrowWidth,
    )}`,
  ].join(' ')

  return (
    <g
      className={`problem-diagram__edge ${highlighted ? 'is-highlighted' : ''} ${dashed ? 'is-dashed' : ''}`}
      data-edge-id={id}
    >
      {title && <title>{title}</title>}
      {curved ? (
        <path
          d={`M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`}
        />
      ) : (
        <line
          x1={round(start.x)}
          y1={round(start.y)}
          x2={round(end.x)}
          y2={round(end.y)}
        />
      )}
      {directed && (
        <polygon className="problem-diagram__arrow" points={arrowPoints} />
      )}
      {label && (
        <text
          className="problem-diagram__edge-label"
          x={round(labelPoint.x)}
          y={round(labelPoint.y - 7)}
          textAnchor="middle"
        >
          {truncate(label, 14)}
        </text>
      )}
    </g>
  )
}

function SvgNode({
  position,
  label,
  subLabel,
  metadata,
  pointerLabels = [],
  highlighted = false,
  terminal = false,
  root = false,
}: {
  position: DiagramPosition
  label: string
  subLabel?: string
  metadata?: string
  pointerLabels?: readonly string[]
  highlighted?: boolean
  terminal?: boolean
  root?: boolean
}) {
  const pointerLabel = pointerLabels.length > 0 ? pointerLabels.join(', ') : ''
  const pointerWidth = clamp(pointerLabel.length * 7 + 16, 38, 150)
  const nodeTitle = `${label}${subLabel ? `, ${subLabel}` : ''}${
    metadata ? `, ${metadata}` : ''
  }${pointerLabel ? `, pointed to by ${pointerLabel}` : ''}`

  return (
    <g
      className={`problem-diagram__node ${highlighted ? 'is-highlighted' : ''} ${terminal ? 'is-terminal' : ''} ${root ? 'is-root' : ''}`}
      data-node-id={position.id}
      transform={`translate(${position.x} ${position.y})`}
    >
      <title>{nodeTitle}</title>
      {pointerLabel && (
        <g className="problem-diagram__node-pointer" transform="translate(0 -39)">
          <rect x={-pointerWidth / 2} y={-12} width={pointerWidth} height={22} rx={8} />
          <text textAnchor="middle" dominantBaseline="middle">
            {truncate(pointerLabel, 18)}
          </text>
        </g>
      )}
      <circle r={NODE_RADIUS} />
      {terminal && <circle className="problem-diagram__terminal-ring" r={18} />}
      <text
        className="problem-diagram__node-label"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {truncate(label, 10)}
      </text>
      {subLabel && (
        <text
          className="problem-diagram__node-sub-label"
          textAnchor="middle"
          y={36}
        >
          {truncate(subLabel, 16)}
        </text>
      )}
      {metadata && (
        <text
          className="problem-diagram__node-metadata"
          textAnchor="middle"
          y={subLabel ? 50 : 38}
        >
          {truncate(metadata, 22)}
        </text>
      )}
    </g>
  )
}

function OmittedNotice({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <p className="problem-diagram__omitted">{children}</p>
}

function DiagramShell({
  diagram,
  caption,
  children,
}: {
  diagram: ProblemDiagramSpec
  caption: string
  children: ReactNode
}) {
  const variant =
    diagram.kind === 'tree' ||
    diagram.kind === 'graph' ||
    diagram.kind === 'grid'
      ? diagram.variant
      : undefined

  return (
    <div
      className={`viz problem-diagram problem-diagram--${diagram.kind}`}
      role="img"
      aria-label={describeProblemDiagram(diagram)}
      data-diagram-kind={diagram.kind}
      data-diagram-variant={variant}
    >
      <p className="problem-diagram__caption" aria-hidden="true">
        {caption}
      </p>
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="problem-diagram__empty">{children}</p>
}

function pointerSummary(
  pointers: readonly { nodeId: string | null; label: string }[] | undefined,
): string {
  return summarize(
    pointers?.map(
      ({ label, nodeId }) => `${label}→${nodeId === null ? 'null' : nodeId}`,
    ) ?? [],
  )
}

function describeProblemDiagram(diagram: ProblemDiagramSpec): string {
  switch (diagram.kind) {
    case 'linkedList':
      return [
        `Linked list with ${diagram.nodes.length} nodes.`,
        `Head: ${diagram.head ?? 'null'}.`,
        `Nodes: ${summarize(
          diagram.nodes.map(
            ({ id, value, next, random }) =>
              `${id}=${formatValue(value)}, next ${next ?? 'null'}${
                random !== undefined ? `, random ${random ?? 'null'}` : ''
              }`,
          ),
        )}.`,
        `Pointers: ${pointerSummary(diagram.pointers)}.`,
        `Highlighted: ${summarize(diagram.highlightedNodeIds ?? [])}.`,
      ].join(' ')

    case 'tree':
      if (diagram.variant === 'heap') {
        return `${diagram.heapKind === 'min' ? 'Min' : 'Max'} heap with ${
          diagram.values.length
        } values: ${summarize(diagram.values.map(String))}. Highlighted index: ${
          diagram.highlight ?? 'none'
        }. Pointers: ${summarize(
          diagram.pointers?.map(({ index, label }) => `${label}→${index}`) ?? [],
        )}.`
      }
      if (diagram.variant === 'binary') {
        return `Binary tree with ${diagram.nodes.length} nodes. Root: ${
          diagram.rootId ?? 'none'
        }. Nodes: ${summarize(
          diagram.nodes.map(
            ({ id, value, left, right }) =>
              `${id}=${formatValue(value)}, left ${left ?? 'null'}, right ${
                right ?? 'null'
              }`,
          ),
        )}. Pointers: ${pointerSummary(diagram.pointers)}. Highlighted: ${summarize(
          diagram.highlightedNodeIds ?? [],
        )}.`
      }
      return `Trie with ${diagram.nodes.length} nodes. Root: ${
        diagram.rootId ?? 'none'
      }. Nodes: ${summarize(
        diagram.nodes.map(
          ({ id, label, terminal }) =>
            `${id}=${label || 'root'}${terminal ? ' terminal' : ''}`,
        ),
      )}. Pointers: ${pointerSummary(diagram.pointers)}. Highlighted: ${summarize(
        diagram.highlightedNodeIds ?? [],
      )}.`

    case 'graph':
      if (diagram.variant === 'unionFind') {
        return `Union-find forest with ${
          diagram.nodes.length
        } nodes. Nodes: ${summarize(
          diagram.nodes.map(
            ({ id, label, parentId, rank, size }) =>
              `${id}=${label}, parent ${parentId}${
                rank != null ? `, rank ${rank}` : ''
              }${size != null ? `, size ${size}` : ''}`,
          ),
        )}. Highlighted: ${summarize(diagram.highlightedNodeIds ?? [])}.`
      }
      return `${diagram.directed ? 'Directed' : 'Undirected'} graph with ${
        diagram.nodes.length
      } nodes and ${diagram.edges.length} edges. Nodes: ${summarize(
        diagram.nodes.map(({ id, label }) => `${id}=${label}`),
      )}. Edges: ${summarize(
        diagram.edges.map(
          ({ from, to, label, weight }) =>
            `${from}${diagram.directed ? '→' : '—'}${to}${
              label ? ` ${label}` : ''
            }${weight != null ? ` weight ${weight}` : ''}`,
        ),
      )}. Highlighted nodes: ${summarize(
        diagram.highlightedNodeIds ?? [],
      )}. Highlighted edges: ${summarize(diagram.highlightedEdgeIds ?? [])}.`

    case 'grid': {
      const rows = diagram.cells.length
      const columns = Math.max(0, ...diagram.cells.map((row) => row.length))
      const highlighted = diagram.highlightedCells?.map(
        ({ row, column, label }) =>
          `row ${row}, column ${column}${label ? ` ${label}` : ''}`,
      )
      const pointers = diagram.pointers?.map(
        ({ row, column, label }) => `${label}→row ${row}, column ${column}`,
      )
      const dependencies =
        diagram.variant === 'dpTable'
          ? diagram.dependencyCells?.map(
              ({ row, column }) => `row ${row}, column ${column}`,
            )
          : []
      return `${
        diagram.variant === 'dpTable' ? 'Dynamic programming table' : 'Grid'
      } with ${rows} rows and ${columns} columns. Highlighted cells: ${summarize(
        highlighted ?? [],
      )}. Pointers: ${summarize(pointers ?? [])}. Dependencies: ${summarize(
        dependencies ?? [],
      )}.`
    }

    case 'intervals':
      return `Intervals diagram with ${
        diagram.intervals.length
      } intervals: ${summarize(
        diagram.intervals.map(
          ({ id, label, start, end }) =>
            `${label ?? id} from ${start} to ${end}`,
        ),
      )}. Cursor: ${diagram.cursor ?? 'none'}. Highlighted: ${summarize(
        diagram.highlightedIntervalIds ?? [],
      )}.`

    case 'recursion':
      return `Recursion stack with ${
        diagram.frames.length
      } frames: ${summarize(
        diagram.frames.map(
          ({ id, label, state, result }) =>
            `${id} ${label}${state ? ` ${state}` : ''}${
              result !== undefined ? ` returns ${formatValue(result)}` : ''
            }`,
        ),
      )}. Active frame: ${diagram.activeFrameId ?? 'none'}.`

    case 'bits':
      return `Bit diagram with ${diagram.rows.length} rows. Operation: ${
        diagram.operation ?? 'none'
      }. Rows: ${summarize(
        diagram.rows.map(
          ({ id, label, bits }) =>
            `${label ?? id}=${truncate(bits || 'empty', 64)}`,
        ),
      )}. Highlighted bit indices: ${summarize(
        diagram.highlightedBitIndices?.map(String) ?? [],
      )}.`
  }
}

function LinkedListDiagram({ diagram }: { diagram: LinkedListDiagramSpec }) {
  if (diagram.nodes.length === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Linked list">
        <EmptyState>No linked-list nodes to display.</EmptyState>
      </DiagramShell>
    )
  }

  const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
  const orderedIds = orderedLinkedListNodeIds(diagram.nodes, diagram.head)
  const priorityIds = [
    ...(diagram.highlightedNodeIds ?? []),
    ...(diagram.pointers?.flatMap(({ nodeId }) => (nodeId ? [nodeId] : [])) ??
      []),
    ...(diagram.head ? [diagram.head] : []),
  ]
  const selection = selectItems(
    orderedIds,
    PROBLEM_DIAGRAM_LIMITS.linkedListNodes,
    (id) => id,
    priorityIds,
  )
  const visibleNodes = selection.items
    .map((id) => byId.get(id))
    .filter((node): node is LinkedListDiagramSpec['nodes'][number] => !!node)
  const visibleIds = new Set(visibleNodes.map(({ id }) => id))
  const positions = layoutLinkedList(visibleNodes.map(({ id }) => id))
  const positionsById = positionMap(positions)
  const rows = Math.ceil(visibleNodes.length / 5)
  const height = Math.max(150, rows * 112 + 34)
  const highlighted = new Set(diagram.highlightedNodeIds ?? [])

  return (
    <DiagramShell diagram={diagram} caption="Linked list">
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {visibleNodes.flatMap((node) => {
            const from = positionsById.get(node.id)
            if (!from) return []
            const edges: ReactNode[] = []
            if (node.next && visibleIds.has(node.next)) {
              const to = positionsById.get(node.next)
              if (to) {
                edges.push(
                  <SvgEdge
                    key={`${node.id}:next`}
                    id={`${node.id}:next`}
                    from={from}
                    to={to}
                    directed
                    title={`${node.id} next points to ${node.next}`}
                  />,
                )
              }
            }
            if (node.random && visibleIds.has(node.random)) {
              const to = positionsById.get(node.random)
              if (to) {
                edges.push(
                  <SvgEdge
                    key={`${node.id}:random`}
                    id={`${node.id}:random`}
                    from={from}
                    to={to}
                    label="random"
                    title={`${node.id} random points to ${node.random}`}
                    directed
                    dashed
                    curved
                  />,
                )
              }
            }
            return edges
          })}
          {visibleNodes.map((node) => {
            const position = positionsById.get(node.id)
            if (!position) return null
            const pointerLabels = pointerLabelsForNode(
              diagram.pointers,
              node.id,
            )
            if (diagram.head === node.id) pointerLabels.unshift('head')
            return (
              <SvgNode
                key={node.id}
                position={position}
                label={String(node.value)}
                subLabel={node.id}
                pointerLabels={unique(pointerLabels)}
                highlighted={highlighted.has(node.id)}
                root={diagram.head === node.id}
              />
            )
          })}
        </svg>
      </div>
      {nullPointerLabels(diagram.pointers).length > 0 && (
        <p className="problem-diagram__null-pointers">
          {nullPointerLabels(diagram.pointers).join(', ')} → null
        </p>
      )}
      <OmittedNotice>
        {selection.omitted > 0
          ? `${selection.omitted} additional nodes hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function BinaryTreeDiagram({ diagram }: { diagram: BinaryTreeDiagramSpec }) {
  if (diagram.nodes.length === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Binary tree">
        <EmptyState>No binary-tree nodes to display.</EmptyState>
      </DiagramShell>
    )
  }

  const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
  const childrenById = new Map(
    diagram.nodes.map((node) => [
      node.id,
      [node.left, node.right].filter((id): id is string => !!id),
    ]),
  )
  const parentById = new Map<string, string>()
  for (const node of diagram.nodes) {
    if (node.left) parentById.set(node.left, node.id)
    if (node.right) parentById.set(node.right, node.id)
  }
  const rootIds = diagram.rootId
    ? [diagram.rootId]
    : diagram.nodes.slice(0, 1).map(({ id }) => id)
  const layers = buildHierarchyLayers(
    diagram.nodes.map(({ id }) => id),
    rootIds,
    childrenById,
  )
  const orderedIds = layers.flat()
  const importantIds = addAncestors(
    [
      ...(diagram.highlightedNodeIds ?? []),
      ...(diagram.pointers?.flatMap(({ nodeId }) => (nodeId ? [nodeId] : [])) ??
        []),
      ...rootIds,
    ],
    parentById,
  )
  const selection = selectItems(
    orderedIds,
    PROBLEM_DIAGRAM_LIMITS.treeNodes,
    (id) => id,
    importantIds,
  )
  const visibleIds = new Set(selection.items)
  const visibleLayers = layers
    .map((layer) => layer.filter((id) => visibleIds.has(id)))
    .filter((layer) => layer.length > 0)
  const height = Math.max(180, visibleLayers.length * 100)
  const positions = layoutLayeredIds(
    visibleLayers,
    SVG_WIDTH,
    height,
    48,
    58,
  )
  const positionsById = positionMap(positions)
  const highlighted = new Set(diagram.highlightedNodeIds ?? [])

  return (
    <DiagramShell diagram={diagram} caption="Binary tree">
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {diagram.nodes.flatMap((node) => {
            const from = positionsById.get(node.id)
            if (!from) return []
            return ([
              ['left', node.left, 'L'],
              ['right', node.right, 'R'],
            ] as const).flatMap(([side, childId, label]) => {
              const to = childId ? positionsById.get(childId) : undefined
              return to ? (
                <SvgEdge
                  key={`${node.id}:${side}`}
                  id={`${node.id}:${side}`}
                  from={from}
                  to={to}
                  label={label}
                  title={`${node.id} ${side} child is ${childId}`}
                />
              ) : (
                []
              )
            })
          })}
          {selection.items.map((id) => {
            const node = byId.get(id)
            const position = positionsById.get(id)
            if (!node || !position) return null
            return (
              <SvgNode
                key={id}
                position={position}
                label={String(node.value)}
                subLabel={id}
                pointerLabels={pointerLabelsForNode(diagram.pointers, id)}
                highlighted={highlighted.has(id)}
                root={diagram.rootId === id}
              />
            )
          })}
        </svg>
      </div>
      {nullPointerLabels(diagram.pointers).length > 0 && (
        <p className="problem-diagram__null-pointers">
          {nullPointerLabels(diagram.pointers).join(', ')} → null
        </p>
      )}
      <OmittedNotice>
        {selection.omitted > 0
          ? `${selection.omitted} additional nodes hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function TrieDiagram({ diagram }: { diagram: TrieDiagramSpec }) {
  if (diagram.nodes.length === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Trie">
        <EmptyState>No trie nodes to display.</EmptyState>
      </DiagramShell>
    )
  }

  const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
  const childrenById = new Map(
    diagram.nodes.map((node) => [
      node.id,
      node.children?.map(({ nodeId }) => nodeId) ?? [],
    ]),
  )
  const parentById = new Map<string, string>()
  for (const node of diagram.nodes) {
    for (const child of node.children ?? []) {
      parentById.set(child.nodeId, node.id)
    }
  }
  const rootIds = diagram.rootId
    ? [diagram.rootId]
    : diagram.nodes.slice(0, 1).map(({ id }) => id)
  const layers = buildHierarchyLayers(
    diagram.nodes.map(({ id }) => id),
    rootIds,
    childrenById,
  )
  const importantIds = addAncestors(
    [
      ...(diagram.highlightedNodeIds ?? []),
      ...(diagram.pointers?.flatMap(({ nodeId }) => (nodeId ? [nodeId] : [])) ??
        []),
      ...rootIds,
    ],
    parentById,
  )
  const selection = selectItems(
    layers.flat(),
    PROBLEM_DIAGRAM_LIMITS.treeNodes,
    (id) => id,
    importantIds,
  )
  const visibleIds = new Set(selection.items)
  const visibleLayers = layers
    .map((layer) => layer.filter((id) => visibleIds.has(id)))
    .filter((layer) => layer.length > 0)
  const height = Math.max(180, visibleLayers.length * 100)
  const positions = layoutLayeredIds(
    visibleLayers,
    SVG_WIDTH,
    height,
    48,
    58,
  )
  const positionsById = positionMap(positions)
  const highlighted = new Set(diagram.highlightedNodeIds ?? [])

  return (
    <DiagramShell diagram={diagram} caption="Trie">
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {diagram.nodes.flatMap((node) => {
            const from = positionsById.get(node.id)
            if (!from) return []
            return (node.children ?? []).flatMap((child) => {
              const to = positionsById.get(child.nodeId)
              return to ? (
                <SvgEdge
                  key={`${node.id}:${child.nodeId}:${child.char}`}
                  id={`${node.id}:${child.nodeId}`}
                  from={from}
                  to={to}
                  label={child.char}
                  title={`${node.id} has ${child.char} child ${child.nodeId}`}
                />
              ) : (
                []
              )
            })
          })}
          {selection.items.map((id) => {
            const node = byId.get(id)
            const position = positionsById.get(id)
            if (!node || !position) return null
            return (
              <SvgNode
                key={id}
                position={position}
                label={node.label || 'root'}
                subLabel={id}
                pointerLabels={pointerLabelsForNode(diagram.pointers, id)}
                highlighted={highlighted.has(id)}
                terminal={node.terminal}
                root={diagram.rootId === id}
              />
            )
          })}
        </svg>
      </div>
      {nullPointerLabels(diagram.pointers).length > 0 && (
        <p className="problem-diagram__null-pointers">
          {nullPointerLabels(diagram.pointers).join(', ')} → null
        </p>
      )}
      <OmittedNotice>
        {selection.omitted > 0
          ? `${selection.omitted} additional nodes hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function HeapDiagram({ diagram }: { diagram: HeapDiagramSpec }) {
  if (diagram.values.length === 0) {
    return (
      <DiagramShell
        diagram={diagram}
        caption={`${diagram.heapKind === 'min' ? 'Min' : 'Max'} heap`}
      >
        <EmptyState>No heap values to display.</EmptyState>
      </DiagramShell>
    )
  }

  const focusedIndices = [
    ...(diagram.highlight != null ? [diagram.highlight] : []),
    ...(diagram.pointers?.map(({ index }) => index) ?? []),
  ]
  const ancestorIndices = unique(
    focusedIndices.flatMap((startingIndex) => {
      const ancestors: number[] = []
      let index = startingIndex
      while (index >= 0) {
        ancestors.push(index)
        if (index === 0) break
        index = Math.floor((index - 1) / 2)
      }
      return ancestors
    }),
  )
  const visibleIndices = selectVisibleIndices(
    diagram.values.length,
    PROBLEM_DIAGRAM_LIMITS.treeNodes,
    [...focusedIndices, ...ancestorIndices],
  )
  const layers = new Map<number, string[]>()
  for (const index of visibleIndices) {
    const depth = Math.floor(Math.log2(index + 1))
    const layer = layers.get(depth) ?? []
    layer.push(String(index))
    layers.set(depth, layer)
  }
  const visibleLayers = [...layers.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, ids]) => ids)
  const height = Math.max(180, visibleLayers.length * 100)
  const positions = layoutLayeredIds(
    visibleLayers,
    SVG_WIDTH,
    height,
    48,
    58,
  )
  const positionsById = positionMap(positions)

  return (
    <DiagramShell
      diagram={diagram}
      caption={`${diagram.heapKind === 'min' ? 'Min' : 'Max'} heap`}
    >
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {visibleIndices.flatMap((index) => {
            if (index === 0) return []
            const parentIndex = Math.floor((index - 1) / 2)
            const from = positionsById.get(String(parentIndex))
            const to = positionsById.get(String(index))
            return from && to ? (
              <SvgEdge
                key={`${parentIndex}:${index}`}
                id={`${parentIndex}:${index}`}
                from={from}
                to={to}
                title={`Heap index ${parentIndex} is parent of index ${index}`}
              />
            ) : (
              []
            )
          })}
          {visibleIndices.map((index) => {
            const position = positionsById.get(String(index))
            if (!position) return null
            return (
              <SvgNode
                key={index}
                position={position}
                label={String(diagram.values[index])}
                subLabel={`index ${index}`}
                pointerLabels={
                  diagram.pointers
                    ?.filter((pointer) => pointer.index === index)
                    .map(({ label }) => label) ?? []
                }
                highlighted={diagram.highlight === index}
                root={index === 0}
              />
            )
          })}
        </svg>
      </div>
      <OmittedNotice>
        {visibleIndices.length < diagram.values.length
          ? `${
              diagram.values.length - visibleIndices.length
            } additional values hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function TreeDiagram({ diagram }: { diagram: TreeDiagramSpec }) {
  switch (diagram.variant) {
    case 'binary':
      return <BinaryTreeDiagram diagram={diagram} />
    case 'trie':
      return <TrieDiagram diagram={diagram} />
    case 'heap':
      return <HeapDiagram diagram={diagram} />
  }
}

function GraphDiagram({ diagram }: { diagram: GraphDiagramSpec }) {
  if (diagram.nodes.length === 0) {
    return (
      <DiagramShell
        diagram={diagram}
        caption={`${diagram.directed ? 'Directed' : 'Undirected'} graph`}
      >
        <EmptyState>No graph nodes to display.</EmptyState>
      </DiagramShell>
    )
  }

  const highlightedEdgeIds = new Set(diagram.highlightedEdgeIds ?? [])
  const highlightedNodeIds = new Set(diagram.highlightedNodeIds ?? [])
  const highlightedEndpoints = diagram.edges
    .filter(({ id }) => highlightedEdgeIds.has(id))
    .flatMap(({ from, to }) => [from, to])
  const nodeSelection = selectItems(
    diagram.nodes,
    PROBLEM_DIAGRAM_LIMITS.graphNodes,
    ({ id }) => id,
    [...highlightedNodeIds, ...highlightedEndpoints],
  )
  const visibleNodeIds = new Set(nodeSelection.items.map(({ id }) => id))
  const eligibleEdges = diagram.edges.filter(
    ({ from, to }) => visibleNodeIds.has(from) && visibleNodeIds.has(to),
  )
  const edgeSelection = selectItems(
    eligibleEdges,
    PROBLEM_DIAGRAM_LIMITS.graphEdges,
    ({ id }) => id,
    diagram.highlightedEdgeIds,
  )
  const positions = layoutCircle(nodeSelection.items.map(({ id }) => id))
  const positionsById = positionMap(positions)

  return (
    <DiagramShell
      diagram={diagram}
      caption={`${diagram.directed ? 'Directed' : 'Undirected'} graph`}
    >
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg problem-diagram__svg--graph"
          viewBox={`0 0 ${SVG_WIDTH} 400`}
          aria-hidden="true"
          focusable="false"
        >
          {edgeSelection.items.map((edge) => {
            const from = positionsById.get(edge.from)
            const to = positionsById.get(edge.to)
            if (!from || !to) return null
            const label = [
              edge.label,
              edge.weight != null ? String(edge.weight) : undefined,
            ]
              .filter((part): part is string => !!part)
              .join(' · ')
            return (
              <SvgEdge
                key={edge.id}
                id={edge.id}
                from={from}
                to={to}
                label={label || undefined}
                title={`${edge.from} ${diagram.directed ? 'to' : 'and'} ${
                  edge.to
                }${label ? `, ${label}` : ''}`}
                directed={diagram.directed}
                highlighted={highlightedEdgeIds.has(edge.id)}
                curved={edge.from !== edge.to && edge.id.length % 2 === 0}
              />
            )
          })}
          {nodeSelection.items.map((node) => {
            const position = positionsById.get(node.id)
            return position ? (
              <SvgNode
                key={node.id}
                position={position}
                label={node.label}
                subLabel={node.id === node.label ? undefined : node.id}
                highlighted={highlightedNodeIds.has(node.id)}
              />
            ) : null
          })}
        </svg>
      </div>
      <OmittedNotice>
        {nodeSelection.omitted > 0 ||
        edgeSelection.items.length < diagram.edges.length
          ? `${nodeSelection.omitted} nodes and ${
              diagram.edges.length - edgeSelection.items.length
            } edges hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function UnionFindDiagram({
  diagram,
}: {
  diagram: Extract<NetworkDiagramSpec, { variant: 'unionFind' }>
}) {
  if (diagram.nodes.length === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Union-find forest">
        <EmptyState>No union-find nodes to display.</EmptyState>
      </DiagramShell>
    )
  }

  const parentById = new Map(
    diagram.nodes.map(({ id, parentId }) => [id, parentId]),
  )
  const childrenById = new Map<string, string[]>()
  for (const node of diagram.nodes) {
    if (node.parentId === node.id) continue
    const children = childrenById.get(node.parentId) ?? []
    children.push(node.id)
    childrenById.set(node.parentId, children)
  }
  const roots = diagram.nodes
    .filter(({ id, parentId }) => id === parentId)
    .map(({ id }) => id)
  const layers = buildHierarchyLayers(
    diagram.nodes.map(({ id }) => id),
    roots,
    childrenById,
  )
  const focusedWithAncestors = addAncestors(
    diagram.highlightedNodeIds ?? [],
    parentById,
  )
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]))
  const orderedNodes = layers
    .flat()
    .map((id) => nodeById.get(id))
    .filter(
      (
        node,
      ): node is Extract<
        NetworkDiagramSpec,
        { variant: 'unionFind' }
      >['nodes'][number] => !!node,
    )
  const selection = selectItems(
    orderedNodes,
    PROBLEM_DIAGRAM_LIMITS.graphNodes,
    ({ id }) => id,
    [...(diagram.highlightedNodeIds ?? []), ...focusedWithAncestors, ...roots],
  )
  const visibleIds = new Set(selection.items.map(({ id }) => id))
  const visibleLayers = layers
    .map((layer) => layer.filter((id) => visibleIds.has(id)))
    .filter((layer) => layer.length > 0)
  const height = Math.max(180, visibleLayers.length * 105)
  const positions = layoutLayeredIds(
    visibleLayers,
    SVG_WIDTH,
    height,
    48,
    58,
  )
  const positionsById = positionMap(positions)
  const highlighted = new Set(diagram.highlightedNodeIds ?? [])

  return (
    <DiagramShell diagram={diagram} caption="Union-find forest">
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          {selection.items.flatMap((node) => {
            if (node.parentId === node.id) return []
            const from = positionsById.get(node.id)
            const to = positionsById.get(node.parentId)
            return from && to ? (
              <SvgEdge
                key={`${node.id}:parent`}
                id={`${node.id}:parent`}
                from={from}
                to={to}
                directed
                title={`${node.id} parent is ${node.parentId}`}
              />
            ) : (
              []
            )
          })}
          {selection.items.map((node) => {
            const position = positionsById.get(node.id)
            if (!position) return null
            const metadata = [
              node.rank != null ? `rank ${node.rank}` : '',
              node.size != null ? `size ${node.size}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <SvgNode
                key={node.id}
                position={position}
                label={node.label}
                subLabel={node.id}
                metadata={metadata || undefined}
                highlighted={highlighted.has(node.id)}
                root={node.parentId === node.id}
              />
            )
          })}
        </svg>
      </div>
      <OmittedNotice>
        {selection.omitted > 0
          ? `${selection.omitted} additional nodes hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function NetworkDiagram({ diagram }: { diagram: NetworkDiagramSpec }) {
  switch (diagram.variant) {
    case 'graph':
      return <GraphDiagram diagram={diagram} />
    case 'unionFind':
      return <UnionFindDiagram diagram={diagram} />
  }
}

function GridDiagram({ diagram }: { diagram: MatrixDiagramSpec }) {
  const rowCount = diagram.cells.length
  const columnCount = Math.max(0, ...diagram.cells.map((row) => row.length))
  const caption =
    diagram.variant === 'dpTable' ? 'Dynamic programming table' : 'Grid'

  if (rowCount === 0 || columnCount === 0) {
    return (
      <DiagramShell diagram={diagram} caption={caption}>
        <EmptyState>No grid cells to display.</EmptyState>
      </DiagramShell>
    )
  }

  const highlightedCoordinates = diagram.highlightedCells ?? []
  const pointerCoordinates = diagram.pointers ?? []
  const dependencyCoordinates =
    diagram.variant === 'dpTable' ? diagram.dependencyCells ?? [] : []
  const importantCoordinates = [
    ...highlightedCoordinates,
    ...pointerCoordinates,
    ...dependencyCoordinates,
  ]
  const visibleRows = selectVisibleIndices(
    rowCount,
    PROBLEM_DIAGRAM_LIMITS.gridRows,
    importantCoordinates.map(({ row }) => row),
  )
  const visibleColumns = selectVisibleIndices(
    columnCount,
    PROBLEM_DIAGRAM_LIMITS.gridColumns,
    importantCoordinates.map(({ column }) => column),
  )
  const coordinateKey = (row: number, column: number) => `${row}:${column}`
  const highlighted = new Map(
    highlightedCoordinates.map((cell) => [
      coordinateKey(cell.row, cell.column),
      cell.label,
    ]),
  )
  const dependencies = new Set(
    dependencyCoordinates.map(({ row, column }) => coordinateKey(row, column)),
  )

  return (
    <DiagramShell diagram={diagram} caption={caption}>
      <div className="problem-diagram__scroller">
        <table className="problem-diagram__grid" aria-hidden="true">
          <thead>
            <tr>
              <th className="problem-diagram__grid-corner" />
              {visibleColumns.map((column) => (
                <th key={column} scope="col">
                  {diagram.columnLabels?.[column] ?? column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row}>
                <th scope="row">{diagram.rowLabels?.[row] ?? row}</th>
                {visibleColumns.map((column) => {
                  const key = coordinateKey(row, column)
                  const pointerLabels =
                    diagram.pointers
                      ?.filter(
                        (pointer) =>
                          pointer.row === row && pointer.column === column,
                      )
                      .map(({ label }) => label) ?? []
                  const highlightLabel = highlighted.get(key)
                  return (
                    <td
                      key={column}
                      className={`${highlighted.has(key) ? 'is-highlighted' : ''} ${
                        dependencies.has(key) ? 'is-dependency' : ''
                      } ${pointerLabels.length > 0 ? 'is-pointed' : ''}`.trim()}
                      data-cell={`${row},${column}`}
                      title={[
                        `row ${row}, column ${column}`,
                        highlightLabel,
                        pointerLabels.length > 0
                          ? `pointer ${pointerLabels.join(', ')}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    >
                      {pointerLabels.length > 0 && (
                        <span className="problem-diagram__cell-pointer">
                          {truncate(pointerLabels.join(', '), 14)}
                        </span>
                      )}
                      <span className="problem-diagram__cell-value">
                        {formatValue(diagram.cells[row]?.[column] ?? null)}
                      </span>
                      {highlightLabel && (
                        <span className="problem-diagram__cell-label">
                          {truncate(highlightLabel, 14)}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <OmittedNotice>
        {visibleRows.length < rowCount || visibleColumns.length < columnCount
          ? `${rowCount - visibleRows.length} rows and ${
              columnCount - visibleColumns.length
            } columns hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function IntervalsDiagram({ diagram }: { diagram: IntervalsDiagramSpec }) {
  if (diagram.intervals.length === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Intervals">
        <EmptyState>No intervals to display.</EmptyState>
      </DiagramShell>
    )
  }

  const highlighted = new Set(diagram.highlightedIntervalIds ?? [])
  const selection = selectItems(
    diagram.intervals,
    PROBLEM_DIAGRAM_LIMITS.intervals,
    ({ id }) => id,
    diagram.highlightedIntervalIds,
  )
  const layout = layoutIntervals(diagram.intervals, diagram.cursor)
  const barById = new Map(layout.bars.map((bar) => [bar.id, bar]))
  const height = selection.items.length * 42 + 86
  const axisY = height - 30

  return (
    <DiagramShell diagram={diagram} caption="Intervals">
      <div className="problem-diagram__scroller">
        <svg
          className="problem-diagram__svg problem-diagram__svg--intervals"
          viewBox={`0 0 ${SVG_WIDTH} ${height}`}
          aria-hidden="true"
          focusable="false"
        >
          <line
            className="problem-diagram__interval-axis"
            x1={140}
            x2={SVG_WIDTH - 30}
            y1={axisY}
            y2={axisY}
          />
          <text className="problem-diagram__axis-label" x={140} y={axisY + 20}>
            {pointLabel(layout.domainStart)}
          </text>
          <text
            className="problem-diagram__axis-label"
            x={SVG_WIDTH - 30}
            y={axisY + 20}
            textAnchor="end"
          >
            {pointLabel(layout.domainEnd)}
          </text>
          {selection.items.map((interval, index) => {
            const bar = barById.get(interval.id)
            if (!bar) return null
            const y = 34 + index * 42
            return (
              <g
                key={interval.id}
                className={`problem-diagram__interval ${
                  highlighted.has(interval.id) ? 'is-highlighted' : ''
                }`}
                data-interval-id={interval.id}
              >
                <title>{`${interval.label ?? interval.id}, ${
                  interval.start
                } to ${interval.end}`}</title>
                <text className="problem-diagram__interval-label" x={8} y={y + 5}>
                  {truncate(interval.label ?? interval.id, 15)} [{interval.start},{' '}
                  {interval.end}]
                </text>
                <rect x={bar.x} y={y - 11} width={bar.width} height={22} rx={8} />
              </g>
            )
          })}
          {layout.cursorX != null && (
            <g
              className="problem-diagram__interval-cursor"
              data-cursor={diagram.cursor}
            >
              <line
                x1={layout.cursorX}
                x2={layout.cursorX}
                y1={12}
                y2={axisY}
              />
              <text x={layout.cursorX} y={12} textAnchor="middle">
                cursor {diagram.cursor}
              </text>
            </g>
          )}
        </svg>
      </div>
      <OmittedNotice>
        {selection.omitted > 0
          ? `${selection.omitted} additional intervals hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function RecursionDiagram({ diagram }: { diagram: RecursionDiagramSpec }) {
  if (diagram.frames.length === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Recursion stack">
        <EmptyState>No recursion frames to display.</EmptyState>
      </DiagramShell>
    )
  }

  const selectedIds = new Set<string>()
  if (diagram.activeFrameId) selectedIds.add(diagram.activeFrameId)
  for (
    let index = diagram.frames.length - 1;
    index >= 0 &&
    selectedIds.size < PROBLEM_DIAGRAM_LIMITS.recursionFrames;
    index -= 1
  ) {
    selectedIds.add(diagram.frames[index].id)
  }
  const frames = diagram.frames.filter(({ id }) => selectedIds.has(id))

  return (
    <DiagramShell diagram={diagram} caption="Recursion stack">
      <ol className="problem-diagram__frames" aria-hidden="true">
        {frames.map((frame, index) => {
          const active =
            diagram.activeFrameId === frame.id || frame.state === 'active'
          const state = active ? 'active' : frame.state ?? 'pending'
          const argumentsText = Object.entries(frame.arguments ?? {})
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, value]) => `${key}=${formatValue(value)}`)
            .join(', ')
          return (
            <li
              key={frame.id}
              className={`problem-diagram__frame is-${state}`}
              data-frame-id={frame.id}
              data-frame-state={state}
              style={{ marginInlineStart: `${Math.min(index, 5) * 12}px` }}
            >
              <span className="problem-diagram__frame-state">{state}</span>
              <strong>{frame.label}</strong>
              {argumentsText && (
                <code className="problem-diagram__frame-arguments">
                  {argumentsText}
                </code>
              )}
              {frame.result !== undefined && (
                <span className="problem-diagram__frame-result">
                  → {formatValue(frame.result)}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <OmittedNotice>
        {frames.length < diagram.frames.length
          ? `${
              diagram.frames.length - frames.length
            } earlier frames hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

function BitsDiagram({ diagram }: { diagram: BitsDiagramSpec }) {
  const bitWidth = Math.max(0, ...diagram.rows.map(({ bits }) => bits.length))
  if (diagram.rows.length === 0 || bitWidth === 0) {
    return (
      <DiagramShell diagram={diagram} caption="Bit operations">
        <EmptyState>No bits to display.</EmptyState>
      </DiagramShell>
    )
  }

  const rowSelection = selectItems(
    diagram.rows,
    PROBLEM_DIAGRAM_LIMITS.bitRows,
    ({ id }) => id,
  )
  const visibleBitIndices = selectVisibleIndices(
    bitWidth,
    PROBLEM_DIAGRAM_LIMITS.bitColumns,
    diagram.highlightedBitIndices,
  )
  const highlighted = new Set(diagram.highlightedBitIndices ?? [])

  return (
    <DiagramShell diagram={diagram} caption="Bit operations">
      {diagram.operation && (
        <p className="problem-diagram__operation" aria-hidden="true">
          {diagram.operation}
        </p>
      )}
      <div className="problem-diagram__scroller">
        <table className="problem-diagram__bits" aria-hidden="true">
          <thead>
            <tr>
              <th />
              {visibleBitIndices.map((index) => (
                <th key={index} scope="col">
                  {index}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowSelection.items.map((row) => (
              <tr key={row.id} data-bit-row={row.id}>
                <th scope="row">{row.label ?? row.id}</th>
                {visibleBitIndices.map((index) => (
                  <td
                    key={index}
                    className={highlighted.has(index) ? 'is-highlighted' : ''}
                    data-bit-index={index}
                  >
                    {row.bits[index] ?? '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <OmittedNotice>
        {rowSelection.omitted > 0 || visibleBitIndices.length < bitWidth
          ? `${rowSelection.omitted} rows and ${
              bitWidth - visibleBitIndices.length
            } bit columns hidden for readability.`
          : null}
      </OmittedNotice>
    </DiagramShell>
  )
}

export function ProblemDiagrams({
  diagram,
}: {
  diagram: ProblemDiagramSpec
}) {
  switch (diagram.kind) {
    case 'linkedList':
      return <LinkedListDiagram diagram={diagram} />
    case 'tree':
      return <TreeDiagram diagram={diagram} />
    case 'graph':
      return <NetworkDiagram diagram={diagram} />
    case 'grid':
      return <GridDiagram diagram={diagram} />
    case 'intervals':
      return <IntervalsDiagram diagram={diagram} />
    case 'recursion':
      return <RecursionDiagram diagram={diagram} />
    case 'bits':
      return <BitsDiagram diagram={diagram} />
  }
}
