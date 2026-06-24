import type { DiagramSpec } from '../types/lesson'

type ArrayDiagram = Extract<DiagramSpec, { kind: 'array' }>
type StringDiagram = Extract<DiagramSpec, { kind: 'string' }>
type StackDiagram = Extract<DiagramSpec, { kind: 'stack' }>
type HashMapDiagram = Extract<DiagramSpec, { kind: 'hashmap' }>
type BinarySearchDiagram = Extract<DiagramSpec, { kind: 'binarySearch' }>

/** Scan an array left to right — pointer and highlight move each beat. */
export function arrayScanSequence(
  values: (number | string)[],
  pointerLabel = 'i',
  maxSteps?: number,
): ArrayDiagram[] {
  const n = maxSteps ?? values.length
  return Array.from({ length: Math.min(n, values.length) }, (_, i) => ({
    kind: 'array',
    values,
    highlight: i,
    pointers: [{ index: i, label: pointerLabel }],
    visited: Array.from({ length: i }, (_, j) => j),
  }))
}

export function arrayHighlightSteps(
  values: (number | string)[],
  highlights: number[],
  pointerLabel?: string,
): ArrayDiagram[] {
  return highlights.map((h) => ({
    kind: 'array',
    values,
    highlight: h,
    pointers: pointerLabel ? [{ index: h, label: pointerLabel }] : undefined,
  }))
}

/** Scan a string one character at a time. */
export function stringScanSequence(
  word: string,
  pointerLabel = 'ch',
  maxSteps?: number,
): StringDiagram[] {
  const n = maxSteps ?? word.length
  return Array.from({ length: Math.min(n, word.length) }, (_, i) => ({
    kind: 'string',
    chars: word,
    pointers: [{ index: i, label: pointerLabel }],
    visited: Array.from({ length: i }, (_, j) => j),
  }))
}

export function stringTwoPointerSteps(
  word: string,
  steps: { left: number; right: number; visited?: number[] }[],
): StringDiagram[] {
  return steps.map(({ left, right, visited }) => ({
    kind: 'string',
    chars: word,
    pointers: [
      { index: left, label: 'left' },
      { index: right, label: 'right' },
    ],
    visited,
  }))
}

export function stackGrowSequence(items: string[]): StackDiagram[] {
  return items.map((_, i) => ({ kind: 'stack', items: items.slice(0, i + 1) }))
}

export function stackGrowFromEmpty(items: string[]): StackDiagram[] {
  return [{ kind: 'stack', items: [] }, ...stackGrowSequence(items)]
}

export function stackPushPopSequence(
  pushItems: string[],
  popCount = 1,
): StackDiagram[] {
  const full = pushItems
  const seq = stackGrowFromEmpty(full)
  for (let p = 0; p < popCount; p++) {
    const remaining = full.slice(0, full.length - p - 1)
    seq.push({ kind: 'stack', items: remaining })
  }
  return seq
}

export function hashMapGrowSequence(
  entries: { key: string; value: string | number }[],
  lookup?: string,
): HashMapDiagram[] {
  const seq: HashMapDiagram[] = [{ kind: 'hashmap', entries: [] }]
  entries.forEach((_, i) => {
    seq.push({
      kind: 'hashmap',
      entries: entries.slice(0, i + 1),
      lookup: i === entries.length - 1 ? lookup : undefined,
    })
  })
  return seq
}

export function binarySearchSteps(
  values: number[],
  steps: { low: number; high: number; mid: number }[],
): BinarySearchDiagram[] {
  return steps.map((s) => ({ kind: 'binarySearch', values, ...s }))
}

/** Typical binary-search window narrowing for a target in a sorted list. */
export function binarySearchNarrowingSequence(
  values: number[],
  target: number,
  maxSteps = 4,
): BinarySearchDiagram[] {
  const steps: { low: number; high: number; mid: number }[] = []
  let low = 0
  let high = values.length - 1

  while (low <= high && steps.length < maxSteps) {
    const mid = Math.floor((low + high) / 2)
    steps.push({ low, high, mid })
    const midVal = values[mid]
    if (midVal === target) break
    if (midVal < target) low = mid + 1
    else high = mid - 1
  }

  return binarySearchSteps(values, steps)
}

/** Collect the last few unique diagram states from trace frames (for walkthrough slides). */
export function tailDiagramSequence(
  frames: { diagram?: DiagramSpec }[],
  endIndex: number,
  maxBeats = 4,
): DiagramSpec[] | undefined {
  const unique: DiagramSpec[] = []
  for (let j = 0; j <= endIndex; j++) {
    const d = frames[j]?.diagram
    if (!d) continue
    const prev = unique[unique.length - 1]
    if (!prev || JSON.stringify(prev) !== JSON.stringify(d)) {
      unique.push(d)
    }
  }
  const tail = unique.slice(-maxBeats)
  return tail.length > 1 ? tail : undefined
}
