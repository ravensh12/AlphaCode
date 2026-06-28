import { describe, it, expect } from 'vitest'
import {
  emptyLearnerModel,
  prerequisitesOf,
  updateConcept,
  conceptBand,
  bandForConcept,
  weakestBand,
  dueConcepts,
  weakestConcepts,
  targetConcept,
  mergeLearnerModels,
  type ConceptSkill,
  type LearnerModel,
} from './learnerModel'
import type { ConceptId } from '../types/lesson'

const DAY = 24 * 60 * 60 * 1000
const T0 = 1_700_000_000_000 // a fixed epoch so dueAt math is deterministic

/** Build a fully-specified skill so band/sorting tests don't depend on update math. */
function skill(conceptId: ConceptId, over: Partial<ConceptSkill> = {}): ConceptSkill {
  return {
    conceptId,
    ability: 0.5,
    confidence: 0,
    seen: 1,
    correctFirstTry: 0,
    box: 1,
    dueAt: T0,
    lastSeenAt: T0,
    recentResults: [],
    ...over,
  }
}

function modelOf(...skills: ConceptSkill[]): LearnerModel {
  const concepts: LearnerModel['concepts'] = {}
  for (const s of skills) concepts[s.conceptId] = s
  return { concepts, updatedAt: new Date(T0).toISOString() }
}

describe('emptyLearnerModel', () => {
  it('starts with no concepts and an epoch-zero timestamp', () => {
    const m = emptyLearnerModel()
    expect(m.concepts).toEqual({})
    expect(m.updatedAt).toBe(new Date(0).toISOString())
  })
})

describe('prerequisitesOf', () => {
  it('returns the direct prerequisites of a concept', () => {
    expect(prerequisitesOf('arrays')).toEqual(['loops', 'variables'])
    expect(prerequisitesOf('twoPointers')).toEqual(['arrays', 'loops'])
  })

  it('returns an empty array for a root concept', () => {
    expect(prerequisitesOf('variables')).toEqual([])
  })
})

describe('updateConcept', () => {
  it('does not mutate the input model', () => {
    const m = emptyLearnerModel()
    const next = updateConcept(m, 'arrays', { firstTry: true, correct: true }, T0)
    expect(m.concepts.arrays).toBeUndefined()
    expect(next).not.toBe(m)
    expect(next.concepts.arrays).toBeDefined()
  })

  it('first-try correct: EMA pulls ability toward 1, promotes the box', () => {
    const next = updateConcept(emptyLearnerModel(), 'loops', {
      firstTry: true,
      correct: true,
    }, T0)
    const s = next.concepts.loops!
    // 0.5*(1-0.4) + 1*0.4 = 0.7
    expect(s.ability).toBeCloseTo(0.7, 10)
    expect(s.seen).toBe(1)
    expect(s.correctFirstTry).toBe(1)
    expect(s.box).toBe(2)
    expect(s.recentResults).toEqual([true])
    // box 2 -> due in one day
    expect(s.dueAt).toBe(T0 + DAY)
  })

  it('incorrect: EMA pulls ability down and demotes to box 1', () => {
    // Start from a strong skill so the demotion is visible.
    const strong = modelOf(skill('stacks', { ability: 0.9, box: 4, correctFirstTry: 3 }))
    const next = updateConcept(strong, 'stacks', { firstTry: true, correct: false }, T0)
    const s = next.concepts.stacks!
    // 0.9*0.6 + 0*0.4 = 0.54
    expect(s.ability).toBeCloseTo(0.54, 10)
    expect(s.box).toBe(1)
    expect(s.correctFirstTry).toBe(3) // unchanged on a wrong answer
    expect(s.recentResults).toEqual([false])
    // box 1 -> resurfaces within the session (25s)
    expect(s.dueAt).toBe(T0 + 25_000)
  })

  it('correct-but-not-first-try: partial credit, box holds steady', () => {
    const base = modelOf(skill('hashMaps', { ability: 0.5, box: 3, correctFirstTry: 2 }))
    const next = updateConcept(base, 'hashMaps', { firstTry: false, correct: true }, T0)
    const s = next.concepts.hashMaps!
    // 0.5*0.6 + 0.5*0.4 = 0.5
    expect(s.ability).toBeCloseTo(0.5, 10)
    expect(s.box).toBe(3) // unchanged
    expect(s.correctFirstTry).toBe(2) // not a first-try win
    expect(s.recentResults).toEqual([false]) // recentResults tracks first-try wins
  })

  it('grows confidence with attempts and saturates at 1', () => {
    let m = emptyLearnerModel()
    for (let i = 0; i < 6; i++) {
      m = updateConcept(m, 'arrays', { firstTry: true, correct: true }, T0 + i)
    }
    // 6 attempts hits the saturation point.
    expect(m.concepts.arrays!.confidence).toBeCloseTo(1, 10)
    // One more attempt must not push confidence past 1.
    m = updateConcept(m, 'arrays', { firstTry: true, correct: true }, T0 + 6)
    expect(m.concepts.arrays!.confidence).toBe(1)
  })

  it('caps the recent-results window at 8 entries', () => {
    let m = emptyLearnerModel()
    for (let i = 0; i < 12; i++) {
      m = updateConcept(m, 'strings', { firstTry: true, correct: true }, T0 + i)
    }
    expect(m.concepts.strings!.recentResults).toHaveLength(8)
    expect(m.concepts.strings!.recentResults.every((r) => r === true)).toBe(true)
  })

  it('never lets the box exceed 5 even after a long streak', () => {
    let m = emptyLearnerModel()
    for (let i = 0; i < 10; i++) {
      m = updateConcept(m, 'binarySearch', { firstTry: true, correct: true }, T0 + i)
    }
    expect(m.concepts.binarySearch!.box).toBe(5)
  })

  it('keeps ability within [0, 1]', () => {
    let m = emptyLearnerModel()
    for (let i = 0; i < 20; i++) {
      m = updateConcept(m, 'arrays', { firstTry: false, correct: false }, T0 + i)
    }
    const low = m.concepts.arrays!.ability
    expect(low).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 20; i++) {
      m = updateConcept(m, 'arrays', { firstTry: true, correct: true }, T0 + 100 + i)
    }
    expect(m.concepts.arrays!.ability).toBeLessThanOrEqual(1)
  })
})

describe('conceptBand', () => {
  it('reads as developing for unknown or never-seen concepts', () => {
    expect(conceptBand(undefined)).toBe('developing')
    expect(conceptBand(skill('arrays', { seen: 0 }))).toBe('developing')
  })

  it('classifies the ability/box thresholds', () => {
    expect(conceptBand(skill('arrays', { ability: 0.9, box: 4 }))).toBe('mastered')
    // High ability but a low box is solid, not mastered.
    expect(conceptBand(skill('arrays', { ability: 0.9, box: 2 }))).toBe('solid')
    expect(conceptBand(skill('arrays', { ability: 0.7, box: 2 }))).toBe('solid')
    expect(conceptBand(skill('arrays', { ability: 0.5, box: 2 }))).toBe('developing')
    expect(conceptBand(skill('arrays', { ability: 0.3, box: 1 }))).toBe('weak')
  })
})

describe('bandForConcept', () => {
  it('looks the skill up in the model', () => {
    const m = modelOf(skill('stacks', { ability: 0.75, box: 2 }))
    expect(bandForConcept(m, 'stacks')).toBe('solid')
    expect(bandForConcept(m, 'arrays')).toBe('developing') // not present
    expect(bandForConcept(undefined, 'stacks')).toBe('developing')
  })
})

describe('weakestBand', () => {
  it('returns the worst band across the given concepts', () => {
    const m = modelOf(
      skill('arrays', { ability: 0.9, box: 4 }), // mastered
      skill('loops', { ability: 0.3, box: 1 }), // weak
    )
    expect(weakestBand(m, ['arrays', 'loops'])).toBe('weak')
  })

  it('treats unseen concepts as developing and defaults to developing', () => {
    const m = modelOf(skill('arrays', { ability: 0.9, box: 4 }))
    // 'loops' is unseen -> developing, which is worse than mastered.
    expect(weakestBand(m, ['arrays', 'loops'])).toBe('developing')
    expect(weakestBand(undefined, [])).toBe('developing')
  })
})

describe('dueConcepts', () => {
  it('returns only practiced concepts past their due time, soonest first', () => {
    const m = modelOf(
      skill('arrays', { seen: 2, dueAt: T0 - 5_000 }),
      skill('loops', { seen: 2, dueAt: T0 - 10_000 }),
      skill('stacks', { seen: 2, dueAt: T0 + 10_000 }), // not due yet
      skill('strings', { seen: 0, dueAt: T0 - 10_000 }), // never practiced
    )
    expect(dueConcepts(m, T0)).toEqual(['loops', 'arrays'])
  })

  it('returns an empty array for an undefined model', () => {
    expect(dueConcepts(undefined, T0)).toEqual([])
  })
})

describe('weakestConcepts', () => {
  it('returns the n weakest practiced concepts, weakest first', () => {
    const m = modelOf(
      skill('arrays', { ability: 0.8 }),
      skill('loops', { ability: 0.2 }),
      skill('stacks', { ability: 0.5 }),
      skill('strings', { ability: 0.1, seen: 0 }), // never practiced -> excluded
    )
    expect(weakestConcepts(m, 2)).toEqual(['loops', 'stacks'])
  })

  it('returns an empty array for an undefined model', () => {
    expect(weakestConcepts(undefined)).toEqual([])
  })
})

describe('targetConcept', () => {
  it('prefers a due concept over a merely-weak one', () => {
    const m = modelOf(
      skill('arrays', { ability: 0.2, dueAt: T0 + DAY }), // weak but not due
      skill('loops', { ability: 0.8, seen: 2, dueAt: T0 - 1_000 }), // due now
    )
    expect(targetConcept(m, T0)).toBe('loops')
  })

  it('falls back to the weakest practiced concept when nothing is due', () => {
    const m = modelOf(
      skill('arrays', { ability: 0.2, dueAt: T0 + DAY }),
      skill('loops', { ability: 0.8, dueAt: T0 + DAY }),
    )
    expect(targetConcept(m, T0)).toBe('arrays')
  })

  it('returns undefined for a learner with no history', () => {
    expect(targetConcept(emptyLearnerModel(), T0)).toBeUndefined()
    expect(targetConcept(undefined, T0)).toBeUndefined()
  })
})

describe('mergeLearnerModels', () => {
  it('returns the other model when one side is undefined', () => {
    const m = modelOf(skill('arrays'))
    expect(mergeLearnerModels(undefined, m)).toBe(m)
    expect(mergeLearnerModels(m, undefined)).toBe(m)
    expect(mergeLearnerModels(undefined, undefined)).toBeUndefined()
  })

  it('takes a missing concept from whichever side has it', () => {
    const a = modelOf(skill('arrays'))
    const b = modelOf(skill('loops'))
    const merged = mergeLearnerModels(a, b)!
    expect(Object.keys(merged.concepts).sort()).toEqual(['arrays', 'loops'])
  })

  it('never regresses progress and keeps the more recent ability estimate', () => {
    const older = skill('arrays', {
      ability: 0.4,
      box: 4,
      seen: 10,
      correctFirstTry: 6,
      dueAt: T0 + 5 * DAY,
      lastSeenAt: T0,
    })
    const newer = skill('arrays', {
      ability: 0.8,
      box: 2,
      seen: 3,
      correctFirstTry: 2,
      dueAt: T0 + DAY,
      lastSeenAt: T0 + DAY,
    })
    const merged = mergeLearnerModels(modelOf(older), modelOf(newer))!
    const s = merged.concepts.arrays!
    // Ability follows the more recently seen side.
    expect(s.ability).toBe(0.8)
    // Monotonic fields take the max from either side.
    expect(s.box).toBe(4)
    expect(s.seen).toBe(10)
    expect(s.correctFirstTry).toBe(6)
    expect(s.dueAt).toBe(T0 + 5 * DAY)
    expect(s.lastSeenAt).toBe(T0 + DAY)
  })
})
