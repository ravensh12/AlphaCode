import type { ProblemId } from '../../../types/curriculum'
import type { ProblemLessonSpecV1 } from '../../../types/problemLesson'
import { NEETCODE_150_PROBLEMS } from './manifest'
import { NEETCODE_150_PROBLEM_LESSON_LOADERS } from './problemLessonLoaders.generated'

export type ProblemLessonModule =
  | { default: ProblemLessonSpecV1 }
  | { problemLesson: ProblemLessonSpecV1 }

export type ProblemLessonLoaderResult =
  | ProblemLessonSpecV1
  | ProblemLessonModule

/**
 * Loaders are dynamic-import friendly:
 * `() => import('./problems/containsDuplicate')`.
 */
export type ProblemLessonLoader = () => Promise<ProblemLessonLoaderResult>

function unwrapProblemLesson(
  result: ProblemLessonLoaderResult,
): ProblemLessonSpecV1 {
  if ('schemaVersion' in result) return result
  if ('default' in result) return result.default
  return result.problemLesson
}

/**
 * A dynamic import that never settles (stalled dev-server/network fetch)
 * would otherwise be cached in `pending` forever, leaving every surface that
 * awaits the lesson (e.g. the mission page) on an infinite loader with
 * no retry path. Failing slow-but-finite lets callers surface their existing
 * error UI, and clearing `pending` lets the next visit re-attempt the import.
 */
const LOAD_TIMEOUT_MS = 30_000

function withLoadTimeout<T>(work: Promise<T>, problemId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `The mission content for "${problemId}" took too long to load.`,
        ),
      )
    }, LOAD_TIMEOUT_MS)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export class ProblemLessonRegistry {
  private readonly loaders = new Map<ProblemId, ProblemLessonLoader>()
  private readonly loaded = new Map<ProblemId, ProblemLessonSpecV1>()
  private readonly pending = new Map<
    ProblemId,
    Promise<ProblemLessonSpecV1 | undefined>
  >()
  private readonly allowedProblemIds?: ReadonlySet<ProblemId>

  constructor(allowedProblemIds?: Iterable<ProblemId>) {
    this.allowedProblemIds = allowedProblemIds
      ? new Set(allowedProblemIds)
      : undefined
  }

  register(
    problemId: ProblemId,
    loader: ProblemLessonLoader,
    options: { replace?: boolean } = {},
  ): () => void {
    if (this.allowedProblemIds && !this.allowedProblemIds.has(problemId)) {
      throw new Error(`Problem "${problemId}" is not in this registry's manifest`)
    }
    if (this.loaders.has(problemId) && !options.replace) {
      throw new Error(`A problem lesson loader is already registered for "${problemId}"`)
    }
    this.loaders.set(problemId, loader)
    this.loaded.delete(problemId)
    this.pending.delete(problemId)
    return () => {
      if (this.loaders.get(problemId) === loader) this.unregister(problemId)
    }
  }

  registerMany(
    loaders: Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>,
    options: { replace?: boolean } = {},
  ): void {
    for (const [problemId, loader] of Object.entries(loaders)) {
      if (loader) this.register(problemId as ProblemId, loader, options)
    }
  }

  unregister(problemId: ProblemId): boolean {
    this.loaded.delete(problemId)
    this.pending.delete(problemId)
    return this.loaders.delete(problemId)
  }

  has(problemId: ProblemId): boolean {
    return this.loaders.has(problemId)
  }

  list(): readonly ProblemId[] {
    return [...this.loaders.keys()].sort()
  }

  clear(): void {
    this.loaders.clear()
    this.loaded.clear()
    this.pending.clear()
  }

  async load(problemId: ProblemId): Promise<ProblemLessonSpecV1 | undefined> {
    const cached = this.loaded.get(problemId)
    if (cached) return cached

    const inFlight = this.pending.get(problemId)
    if (inFlight) return inFlight

    const loader = this.loaders.get(problemId)
    if (!loader) return undefined

    let pending: Promise<ProblemLessonSpecV1 | undefined>
    pending = withLoadTimeout(loader(), problemId)
      .then(unwrapProblemLesson)
      .then((spec) => {
        if (spec.problemId !== problemId) {
          throw new Error(
            `Loader for "${problemId}" returned lesson "${spec.problemId}"`,
          )
        }
        if (this.loaders.get(problemId) === loader) {
          this.loaded.set(problemId, spec)
        }
        return spec
      })
      .finally(() => {
        if (this.pending.get(problemId) === pending) {
          this.pending.delete(problemId)
        }
      })
    this.pending.set(problemId, pending)
    return pending
  }
}

const NEETCODE_150_PROBLEM_IDS = new Set(
  NEETCODE_150_PROBLEMS.map(({ id }) => id),
)

export const NEETCODE_150_PROBLEM_LESSON_REGISTRY =
  new ProblemLessonRegistry(NEETCODE_150_PROBLEM_IDS)

NEETCODE_150_PROBLEM_LESSON_REGISTRY.registerMany(
  NEETCODE_150_PROBLEM_LESSON_LOADERS,
)

export const registerProblemLesson = (
  problemId: ProblemId,
  loader: ProblemLessonLoader,
  options?: { replace?: boolean },
): (() => void) =>
  NEETCODE_150_PROBLEM_LESSON_REGISTRY.register(problemId, loader, options)

export const registerProblemLessonLoaders = (
  loaders: Readonly<Partial<Record<ProblemId, ProblemLessonLoader>>>,
  options?: { replace?: boolean },
): void =>
  NEETCODE_150_PROBLEM_LESSON_REGISTRY.registerMany(loaders, options)

export const hasRegisteredProblemLesson = (problemId: ProblemId): boolean =>
  NEETCODE_150_PROBLEM_LESSON_REGISTRY.has(problemId)

export const listRegisteredProblemLessons = (): readonly ProblemId[] =>
  NEETCODE_150_PROBLEM_LESSON_REGISTRY.list()

export const loadProblemLesson = (
  problemId: ProblemId,
): Promise<ProblemLessonSpecV1 | undefined> =>
  NEETCODE_150_PROBLEM_LESSON_REGISTRY.load(problemId)
