import type { DiagramSpec } from '../types/lesson'

/** Indices whose visual state changed between two diagram snapshots. */
export function diagramChangedIndices(
  prev: DiagramSpec | undefined,
  next: DiagramSpec | undefined,
): number[] {
  if (!prev || !next || prev.kind !== next.kind) return []

  switch (next.kind) {
    case 'array':
      if (prev.kind !== 'array') return []
      return next.values.map((_, i) => i).filter((i) => {
        const wasHighlight = prev.highlight === i
        const isHighlight = next.highlight === i
        const wasPointed = prev.pointers?.some((p) => p.index === i)
        const isPointed = next.pointers?.some((p) => p.index === i)
        const wasVisited = prev.visited?.includes(i)
        const isVisited = next.visited?.includes(i)
        const valueChanged = prev.values[i] !== next.values[i]
        return (
          wasHighlight !== isHighlight ||
          wasPointed !== isPointed ||
          wasVisited !== isVisited ||
          valueChanged
        )
      })
    case 'string':
      if (prev.kind !== 'string') return []
      return next.chars.split('').map((_, i) => i).filter((i) => {
        const wasPointed = prev.pointers?.some((p) => p.index === i)
        const isPointed = next.pointers?.some((p) => p.index === i)
        const wasVisited = prev.visited?.includes(i)
        const isVisited = next.visited?.includes(i)
        const charChanged = prev.chars[i] !== next.chars[i]
        return (
          wasPointed !== isPointed ||
          wasVisited !== isVisited ||
          charChanged
        )
      })
    case 'binarySearch':
      if (prev.kind !== 'binarySearch') return []
      return next.values.map((_, i) => i).filter((i) => {
        const wasMid = prev.mid === i
        const isMid = next.mid === i
        const wasInRange =
          prev.low != null && prev.high != null && i >= prev.low && i <= prev.high
        const isInRange =
          next.low != null && next.high != null && i >= next.low && i <= next.high
        return wasMid !== isMid || wasInRange !== isInRange
      })
    case 'hashmap':
      if (prev.kind !== 'hashmap') return []
      return hashMapChangedRows(prev, next)
    case 'stack':
      if (prev.kind !== 'stack') return []
      return stackTopChanged(prev, next) ? [0] : []
    default:
      return []
  }
}

/** Row indices that changed in a hash map diagram. */
export function hashMapChangedRows(
  prev: Extract<DiagramSpec, { kind: 'hashmap' }>,
  next: Extract<DiagramSpec, { kind: 'hashmap' }>,
): number[] {
  return next.entries.map((_, i) => i).filter((i) => {
    const p = prev.entries[i]
    const e = next.entries[i]
    return !p || p.key !== e.key || p.value !== e.value
  })
}

/** True when the stack top changed (push or pop). */
export function stackTopChanged(
  prev: Extract<DiagramSpec, { kind: 'stack' }>,
  next: Extract<DiagramSpec, { kind: 'stack' }>,
): boolean {
  if (prev.items.length !== next.items.length) return true
  const pTop = prev.items[prev.items.length - 1]
  const nTop = next.items[next.items.length - 1]
  return pTop !== nTop
}
