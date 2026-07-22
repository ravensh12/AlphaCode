import { describe, expect, it } from 'vitest'
import {
  curriculumProblemId,
  gauntletProblemId,
  isCurriculumProblemId,
  legacyProblemId,
  legacySkillId,
  lessonProblemId,
  microProblemId,
} from './problemIds'

describe('stable problem ids', () => {
  it('keeps trace frames distinct and deterministic', () => {
    expect(lessonProblemId('loops', 'trace', 0)).toBe(
      'lesson:loops:trace:frame:0:v1',
    )
    expect(lessonProblemId('loops', 'trace', 1)).toBe(
      'lesson:loops:trace:frame:1:v1',
    )
    expect(lessonProblemId('loops', 'trace', 0)).not.toBe(
      lessonProblemId('loops', 'trace', 1),
    )
  })

  it('uses masteryId so review/adaptive copies retain original identity', () => {
    const original = lessonProblemId({
      lessonId: 'arrays',
      stepId: 'original',
      frameIndex: 2,
    })
    const copy = lessonProblemId({
      lessonId: 'arrays',
      stepId: 'reinforced-copy-9',
      masteryId: 'original',
      frameIndex: 2,
    })
    expect(copy).toBe(original)
  })

  it('creates namespaced ids for every legacy producer', () => {
    expect(microProblemId('warmup/one')).toBe('micro:warmup%2Fone:v1')
    expect(gauntletProblemId('boss-1')).toBe('gauntlet:boss-1:v1')
    expect(legacyProblemId('old lesson', 'step:1')).toBe(
      'legacy:old%20lesson:step%3A1:v1',
    )
    expect(legacySkillId('arrays')).toBe('legacy-skill:arrays')
  })

  it('reuses curriculum ids without confusing internal ids', () => {
    expect(curriculumProblemId('two-sum')).toBe('problem:two-sum')
    expect(isCurriculumProblemId('problem:two-sum')).toBe(true)
    expect(isCurriculumProblemId(microProblemId('two-sum'))).toBe(false)
  })

  it('rejects unstable empty ids and invalid frame indexes', () => {
    expect(() => microProblemId(' ')).toThrow()
    expect(() => lessonProblemId('lesson', 'step', -1)).toThrow()
  })
})
