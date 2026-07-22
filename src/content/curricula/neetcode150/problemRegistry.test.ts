import { describe, expect, it, vi } from 'vitest'
import type { ProblemId } from '../../../types/curriculum'
import type { ProblemLessonSpecV1 } from '../../../types/problemLesson'
import { ProblemLessonRegistry } from './problemRegistry'

const makeSpec = (problemId: ProblemId): ProblemLessonSpecV1 => ({
  schemaVersion: 1,
  curriculumId: 'curriculum:neetcode150',
  manifestContentVersion: 'v1.0.0',
  problemId,
  problemContentVersion: 'v1.0.0',
  description: 'A lazy test lesson.',
  pattern: 'Test pattern',
  estimatedMinutes: 5,
  skillIds: ['skill:hash-membership'],
  variants: [
    {
      id: 'variant:default',
      explanation: {
        id: 'explain',
        kind: 'explanation',
        prompt: 'Learn it.',
      },
      workedExample: {
        id: 'worked',
        kind: 'workedExample',
        prompt: 'Watch it.',
        code: ['pass'],
      },
      quizIntro: {
        id: 'quiz-intro',
        kind: 'quizIntro',
        prompt: 'Prove it.',
      },
      assessments: [
        {
          id: 'check',
          kind: 'assessment',
          prompt: 'Answer it.',
          assessment: {
            schemaVersion: 1,
            id: 'assessment:check',
            kind: 'shortAnswer',
            prompt: 'Answer it.',
            evidenceKind: 'acquisition',
            matcher: {
              mode: 'normalized',
              acceptedAnswers: ['yes'],
            },
          },
          feedback: {
            correct: 'Yes.',
            incorrect: 'Try again.',
          },
        },
      ],
    },
  ],
})

describe('ProblemLessonRegistry', () => {
  it('loads lazily, unwraps default modules, and caches concurrent loads', async () => {
    const problemId = 'problem:contains-duplicate'
    const spec = makeSpec(problemId)
    const registry = new ProblemLessonRegistry([problemId])
    const loader = vi.fn(async () => ({ default: spec }))

    registry.register(problemId, loader)
    expect(loader).not.toHaveBeenCalled()

    const [first, second] = await Promise.all([
      registry.load(problemId),
      registry.load(problemId),
    ])
    expect(first).toBe(spec)
    expect(second).toBe(spec)
    expect(loader).toHaveBeenCalledTimes(1)

    expect(await registry.load(problemId)).toBe(spec)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('supports named modules and reports unregistered lessons as absent', async () => {
    const problemId = 'problem:contains-duplicate'
    const spec = makeSpec(problemId)
    const registry = new ProblemLessonRegistry()
    registry.register(problemId, async () => ({ problemLesson: spec }))

    expect(await registry.load(problemId)).toBe(spec)
    expect(
      await registry.load('problem:not-registered'),
    ).toBeUndefined()
  })

  it('enforces manifest membership, duplicate registration, and loaded identity', async () => {
    const problemId = 'problem:contains-duplicate'
    const registry = new ProblemLessonRegistry([problemId])
    registry.register(problemId, async () => makeSpec(problemId))

    expect(() =>
      registry.register(problemId, async () => makeSpec(problemId)),
    ).toThrow(/already registered/u)
    expect(() =>
      registry.register(
        'problem:not-in-manifest',
        async () => makeSpec('problem:not-in-manifest'),
      ),
    ).toThrow(/not in this registry/u)

    const mismatch = new ProblemLessonRegistry()
    mismatch.register(problemId, async () => makeSpec('problem:two-sum'))
    await expect(mismatch.load(problemId)).rejects.toThrow(
      /returned lesson "problem:two-sum"/u,
    )
  })

  it('can replace, unregister, list, dispose, and clear loaders', () => {
    const firstId = 'problem:contains-duplicate'
    const secondId = 'problem:two-sum'
    const registry = new ProblemLessonRegistry()
    const dispose = registry.register(secondId, async () => makeSpec(secondId))
    registry.register(firstId, async () => makeSpec(firstId))

    expect(registry.list()).toEqual([firstId, secondId])
    registry.register(
      firstId,
      async () => ({ default: makeSpec(firstId) }),
      { replace: true },
    )
    dispose()
    expect(registry.has(secondId)).toBe(false)
    expect(registry.unregister(firstId)).toBe(true)

    registry.register(firstId, async () => makeSpec(firstId))
    registry.clear()
    expect(registry.list()).toEqual([])
  })
})
