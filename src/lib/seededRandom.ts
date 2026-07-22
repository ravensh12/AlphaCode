export type SeedValue = string | number
export type SemanticSeedPart = string | number | boolean | null

const UINT32_RANGE = 0x1_0000_0000

function encodePart(part: SemanticSeedPart): string {
  const type = part === null ? 'null' : typeof part
  const value =
    typeof part === 'number'
      ? Object.is(part, -0)
        ? '-0'
        : String(part)
      : String(part)
  return `${type}:${value.length}:${value}`
}

/**
 * Length-framed semantic path. Callers should use stable content identities
 * (assessment id, frame id, purpose), never array positions.
 */
export function deriveSemanticSeed(
  root: SeedValue,
  ...parts: readonly SemanticSeedPart[]
): string {
  return [encodePart(root), ...parts.map(encodePart)].join('|')
}

/** FNV-1a over UTF-16 code units, with a non-zero avalanche finish. */
export function hashSeed(seed: SeedValue): number {
  const value = String(seed)
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    hash ^= code & 0xff
    hash = Math.imul(hash, 0x01000193)
    hash ^= code >>> 8
    hash = Math.imul(hash, 0x01000193)
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

export class SeededRandom {
  readonly seed: string
  private state: number

  constructor(seed: SeedValue) {
    this.seed = String(seed)
    this.state = hashSeed(this.seed)
  }

  /** Mulberry32: compact, deterministic, and sufficient for content ordering. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE
  }

  integer(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError('integer bounds must be safe integers with min <= max')
    }
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError('cannot pick from an empty array')
    return values[this.integer(0, values.length - 1)]
  }

  shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(0, index)
      ;[shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ]
    }
    return shuffled
  }

  /** A fork is independent of how many values have been consumed by its parent. */
  fork(...parts: readonly SemanticSeedPart[]): SeededRandom {
    return new SeededRandom(deriveSemanticSeed(this.seed, ...parts))
  }
}

export function createSeededRandom(
  root: SeedValue,
  ...semanticPath: readonly SemanticSeedPart[]
): SeededRandom {
  return new SeededRandom(deriveSemanticSeed(root, ...semanticPath))
}

export function seededShuffle<T>(
  values: readonly T[],
  root: SeedValue,
  ...semanticPath: readonly SemanticSeedPart[]
): T[] {
  return createSeededRandom(root, ...semanticPath).shuffle(values)
}
