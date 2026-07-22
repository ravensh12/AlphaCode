import { describe, expect, it } from 'vitest'
import { NEETCODE_150_REALM_BY_ID, NEETCODE_150_TRACK_BY_ID } from '../content/curricula/neetcode150'
import type { LearningCache, SkillMasteryRecord } from '../types/learning'
import { emptyLearnerModel } from './learnerModel'
import {
  combatScaleForMastery,
  selectRealmCombatMastery,
} from './combatMastery'

function skillRecord(
  entityId: SkillMasteryRecord['entityId'],
  ability: number,
): SkillMasteryRecord {
  return {
    entityKind: 'skill',
    entityId,
    submissionCount: 1,
    reviewCount: 1,
    correctCount: 1,
    firstTryCorrectCount: 1,
    ability,
    recentResults: [true],
    schedule: {
      schedulerVersion: 1,
      phase: 'review',
      stabilityDays: 1,
      difficulty: 5,
      dueAt: '2026-07-12T00:00:00.000Z',
      reps: 1,
      lapses: 0,
    },
    revision: 1,
    projectionVersion: 1,
  }
}

describe('realm combat mastery', () => {
  it('prefers manifest FSRS skill evidence and falls back safely', () => {
    const realm = NEETCODE_150_REALM_BY_ID.get('realm1')!
    const skillId = NEETCODE_150_TRACK_BY_ID.get(realm.trackIds[0])!.skillIds[0]
    const fsrs = selectRealmCombatMastery(
      'realm1',
      { [skillId]: skillRecord(skillId, 0.9) },
      {
        ...emptyLearnerModel(),
        concepts: {
          arrays: {
            conceptId: 'arrays',
            ability: 0.1,
            confidence: 1,
            seen: 1,
            correctFirstTry: 0,
            box: 1,
            dueAt: 0,
            lastSeenAt: 0,
            recentResults: [false],
          },
        },
      },
    )
    expect(fsrs).toMatchObject({ source: 'fsrs-v1', ability: 0.9 })

    const fallback = selectRealmCombatMastery(
      'realm1',
      {} as LearningCache['skillMastery'],
      emptyLearnerModel(),
    )
    expect(fallback).toEqual({
      source: 'neutral',
      ability: 0.5,
      evidenceCount: 0,
    })
    expect(combatScaleForMastery(-1)).toBe(0.92)
    expect(combatScaleForMastery(2)).toBe(1.08)
  })
})
