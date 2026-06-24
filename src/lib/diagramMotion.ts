import type { DiagramSpec } from '../types/lesson'

export type PointerMove = { label: string; from: number; to: number }

function sequenceValues(spec: DiagramSpec): (string | number)[] | null {
  if (spec.kind === 'string') return spec.chars.split('')
  if (spec.kind === 'array') return spec.values
  return null
}

/** Pairs of indices whose values exchanged places between frames. */
export function findSwappedPairs(
  prevValues: (string | number)[],
  nextValues: (string | number)[],
): [number, number][] {
  const swaps: [number, number][] = []
  const used = new Set<number>()

  for (let i = 0; i < nextValues.length; i++) {
    if (prevValues[i] === nextValues[i] || used.has(i)) continue
    for (let j = i + 1; j < nextValues.length; j++) {
      if (used.has(j)) continue
      if (prevValues[i] === nextValues[j] && prevValues[j] === nextValues[i]) {
        swaps.push([i, j])
        used.add(i)
        used.add(j)
        break
      }
    }
  }

  return swaps
}

export function findPointerMoves(
  prevPointers: { index: number; label: string }[] | undefined,
  nextPointers: { index: number; label: string }[] | undefined,
): PointerMove[] {
  if (!prevPointers?.length || !nextPointers?.length) return []
  const moves: PointerMove[] = []
  for (const next of nextPointers) {
    const prev = prevPointers.find((p) => p.label === next.label)
    if (prev && prev.index !== next.index) {
      moves.push({ label: next.label, from: prev.index, to: next.index })
    }
  }
  return moves
}

/** Indices whose displayed value changed but were not part of a two-way swap. */
export function findValueChanges(
  prevValues: (string | number)[],
  nextValues: (string | number)[],
  swapPairs: [number, number][],
): number[] {
  const swapSet = new Set(swapPairs.flat())
  return nextValues
    .map((_, i) => i)
    .filter((i) => !swapSet.has(i) && prevValues[i] !== nextValues[i])
}

export function analyzeSequenceMotion(
  prev: DiagramSpec | undefined,
  next: DiagramSpec,
): {
  swaps: [number, number][]
  pointerMoves: PointerMove[]
  valueChanges: number[]
} {
  if (!prev || prev.kind !== next.kind) {
    return { swaps: [], pointerMoves: [], valueChanges: [] }
  }

  const prevValues = sequenceValues(prev)
  const nextValues = sequenceValues(next)
  if (!prevValues || !nextValues || prevValues.length !== nextValues.length) {
    return { swaps: [], pointerMoves: [], valueChanges: [] }
  }

  const swaps = findSwappedPairs(prevValues, nextValues)
  const pointerMoves =
    (prev.kind === 'string' || prev.kind === 'array') &&
    (next.kind === 'string' || next.kind === 'array')
      ? findPointerMoves(prev.pointers, next.pointers)
      : []
  const valueChanges = findValueChanges(prevValues, nextValues, swaps)

  return { swaps, pointerMoves, valueChanges }
}
