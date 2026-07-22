import {
  NEETCODE_150_REALM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import type { RealmId } from '../types/curriculum'
import type { LearningCache } from '../types/learning'
import type { LearnerModel } from './learnerModel'

export type RealmCombatMastery = {
  readonly ability: number
  readonly source: 'fsrs-v1' | 'core-primer' | 'neutral'
  readonly evidenceCount: number
}

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

export function selectRealmCombatMastery(
  realmId: RealmId,
  skillMastery: LearningCache['skillMastery'],
  legacyModel: LearnerModel | undefined,
): RealmCombatMastery {
  const realm = NEETCODE_150_REALM_BY_ID.get(realmId)
  const skillIds = [
    ...new Set(
      (realm?.trackIds ?? []).flatMap(
        (trackId) => NEETCODE_150_TRACK_BY_ID.get(trackId)?.skillIds ?? [],
      ),
    ),
  ]
  const fsrs = skillIds
    .map((skillId) => skillMastery[skillId])
    .filter(
      (record): record is NonNullable<typeof record> =>
        !!record && record.reviewCount > 0,
    )
  if (fsrs.length > 0) {
    return {
      ability: average(fsrs.map(({ ability }) => ability)),
      source: 'fsrs-v1',
      evidenceCount: fsrs.length,
    }
  }

  const legacy = Object.values(legacyModel?.concepts ?? {}).filter(
    (record): record is NonNullable<typeof record> =>
      !!record && record.seen > 0,
  )
  if (legacy.length > 0) {
    return {
      ability: average(legacy.map(({ ability }) => ability)),
      source: 'core-primer',
      evidenceCount: legacy.length,
    }
  }
  return { ability: 0.5, source: 'neutral', evidenceCount: 0 }
}

/** Keeps adaptation deliberately modest so controls and encounter identity stay stable. */
export function combatScaleForMastery(ability: number): number {
  const normalized = Math.max(0, Math.min(1, ability))
  return 0.92 + normalized * 0.16
}
