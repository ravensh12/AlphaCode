import { describe, expect, it } from 'vitest'
import {
  createSeededRandom,
  deriveSemanticSeed,
  SeededRandom,
  seededShuffle,
} from './seededRandom'

describe('seededRandom', () => {
  it('reproduces an exact sequence for the same semantic seed', () => {
    const random = createSeededRandom(
      'course-seed',
      'assessment',
      'assessment:one',
    )

    expect(Array.from({ length: 5 }, () => random.next())).toEqual([
      0.6355235096998513,
      0.8274162334855646,
      0.24552082689478993,
      0.2690477988217026,
      0.7530184329953045,
    ])
  })

  it('frames semantic parts so ambiguous concatenations cannot collide', () => {
    expect(deriveSemanticSeed('root', 'ab', 'c')).not.toBe(
      deriveSemanticSeed('root', 'a', 'bc'),
    )
    expect(deriveSemanticSeed('1', 1)).not.toBe(
      deriveSemanticSeed('1', '1'),
    )
  })

  it('forks independently of parent consumption', () => {
    const first = new SeededRandom('root')
    first.next()
    first.next()

    const second = new SeededRandom('root')
    expect(first.fork('assessment:a').shuffle([1, 2, 3, 4])).toEqual(
      second.fork('assessment:a').shuffle([1, 2, 3, 4]),
    )
  })

  it('does not reshuffle an assessment when unrelated content is sampled', () => {
    const before = seededShuffle(
      ['option:a', 'option:b', 'option:c', 'option:d'],
      'learner-seed',
      'problem',
      'problem:contains-duplicate',
      'assessment',
      'assessment:main',
      'options',
    )

    seededShuffle(
      ['x', 'y', 'z'],
      'learner-seed',
      'problem',
      'problem:contains-duplicate',
      'assessment',
      'assessment:unrelated',
      'options',
    )

    const after = seededShuffle(
      ['option:a', 'option:b', 'option:c', 'option:d'],
      'learner-seed',
      'problem',
      'problem:contains-duplicate',
      'assessment',
      'assessment:main',
      'options',
    )
    expect(after).toEqual(before)
  })

  it('shuffles without mutating source content', () => {
    const source = ['a', 'b', 'c', 'd']
    const shuffled = new SeededRandom('seed').shuffle(source)

    expect(source).toEqual(['a', 'b', 'c', 'd'])
    expect(shuffled).toHaveLength(source.length)
    expect(new Set(shuffled)).toEqual(new Set(source))
  })

  it('rejects invalid integer ranges and empty picks', () => {
    const random = new SeededRandom('seed')
    expect(() => random.integer(2, 1)).toThrow(RangeError)
    expect(() => random.pick([])).toThrow(RangeError)
  })
})
