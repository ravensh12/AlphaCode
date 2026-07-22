import { NEETCODE_150_MANIFEST, NEETCODE_150_REALM_BY_ID } from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { RealmId, TrackId } from '../types/curriculum'
import {
  academyWorldState,
  canEnterAcademyBoss,
  canEnterAcademyCheckpoint,
} from './academyQuest'
import {
  canAccessAcademyBossEntry,
  canAccessAcademyMissionEntry,
  canAccessLessonPart,
  hasAcademyTrackEntry,
  type GameAccessStorage,
} from './gameAccess'
import {
  resolveFinalGauntletAccess,
  resolveThresholdAccess,
  type FinalFlowAccess,
} from './finalFlowAccess'
import type { WorldState } from './questState'

/**
 * Showcase-account virtual access overrides.
 *
 * The showcase account (see `showcaseAccess.ts` / `useAuth().isShowcaseAccount`)
 * behaves as if the game were beaten: every gate — academy checkpoints,
 * missions, realm bosses, the Threshold, and the Final Gauntlet — can be
 * ENTERED at any time, in any order.
 *
 * This is strictly a read-side override. No fake mission completions, quiz
 * attempts, retention evidence, learning events, or gauntlet records are ever
 * written: progress displays, retention timing, certification scoring, and
 * evidence recording stay truthful, and anything the showcase account actually
 * does records through the normal paths. Every function here takes the real
 * gate result (or computes it) and only widens ENTRY for the showcase account;
 * guests and all other accounts flow through the original gates unchanged.
 */

/** Academy checkpoint entry: showcase only needs the checkpoint to exist. */
export function canEnterAcademyCheckpointWithShowcase(
  isShowcaseAccount: boolean,
  state: AcademyProgressState,
  worldIndex: number,
  checkpointIndex: number,
): boolean {
  if (isShowcaseAccount) {
    const realm = NEETCODE_150_MANIFEST.realms[worldIndex]
    return (
      !!realm &&
      checkpointIndex >= 0 &&
      checkpointIndex < realm.trackIds.length
    )
  }
  return canEnterAcademyCheckpoint(state, worldIndex, checkpointIndex)
}

/** Realm boss entry: showcase only needs the realm to exist. */
export function canEnterAcademyBossWithShowcase(
  isShowcaseAccount: boolean,
  state: AcademyProgressState,
  realmId: RealmId,
): boolean {
  if (isShowcaseAccount) return NEETCODE_150_REALM_BY_ID.has(realmId)
  return canEnterAcademyBoss(state, realmId)
}

/**
 * World-node projection for the quest map / world hub: showcase sees every
 * realm unlocked while all progress facts (mastery, counts, status) stay real.
 */
export function academyWorldStateWithShowcase(
  isShowcaseAccount: boolean,
  state: AcademyProgressState,
  worldIndex: number,
): WorldState {
  return academyWorldState(state, worldIndex, {
    assumeUnlocked: isShowcaseAccount,
  })
}

/** Physical academy-track token: showcase never needs the overworld walk-in. */
export function hasAcademyTrackEntryWithShowcase(
  isShowcaseAccount: boolean,
  realmId: RealmId,
  trackId: TrackId,
  storage?: GameAccessStorage,
): boolean {
  if (isShowcaseAccount) return true
  return hasAcademyTrackEntry(realmId, trackId, storage)
}

/** Mission entry (Code City token / completion / guest preview) for showcase. */
export function canAccessAcademyMissionEntryWithShowcase(
  isShowcaseAccount: boolean,
  realmId: RealmId,
  trackId: TrackId,
  options: { completed: boolean; guestPreview: boolean },
  storage?: GameAccessStorage,
): boolean {
  if (isShowcaseAccount) return true
  return canAccessAcademyMissionEntry(realmId, trackId, options, storage)
}

/** Physical boss-arena token: showcase can enter any boss arena directly. */
export function canAccessAcademyBossEntryWithShowcase(
  isShowcaseAccount: boolean,
  realmId: RealmId,
  realmCleared: boolean,
  storage?: GameAccessStorage,
): boolean {
  if (isShowcaseAccount) return true
  return canAccessAcademyBossEntry(realmId, realmCleared, storage)
}

/**
 * Historical primer lesson unlock (course home / lesson list). The real
 * unlock decision is computed by the caller; showcase always passes.
 */
export function lessonUnlockedWithShowcase(
  isShowcaseAccount: boolean,
  unlocked: boolean,
): boolean {
  return isShowcaseAccount || unlocked
}

/**
 * Overworld lesson-part token. Showcase passes WITHOUT consuming the one-time
 * session token, so a real walk-in entry is never invalidated.
 */
export function canAccessLessonPartWithShowcase(
  isShowcaseAccount: boolean,
  worldIndex: number,
  part: number | null,
  mastered: boolean,
): boolean {
  if (isShowcaseAccount) return true
  return canAccessLessonPart(worldIndex, part, mastered)
}

/** Threshold route gate: showcase enters even with zero campaign progress. */
export function resolveThresholdAccessWithShowcase(
  isShowcaseAccount: boolean,
  ready: boolean,
  academyCampaignComplete: boolean,
): FinalFlowAccess {
  return resolveThresholdAccess(
    ready,
    isShowcaseAccount || academyCampaignComplete,
  )
}

/** Final Journey / Exam / Boss route gate: showcase is always ready. */
export function resolveFinalGauntletAccessWithShowcase(
  isShowcaseAccount: boolean,
  ready: boolean,
  academyCampaignComplete: boolean,
  readyForFinalGauntlet: boolean,
): FinalFlowAccess {
  return resolveFinalGauntletAccess(
    ready,
    isShowcaseAccount || academyCampaignComplete,
    isShowcaseAccount || readyForFinalGauntlet,
  )
}

/** UI readiness (Final Gauntlet banners etc.): showcase reads as ready. */
export function readyForFinalGauntletWithShowcase(
  isShowcaseAccount: boolean,
  readyForFinalGauntlet: boolean,
): boolean {
  return isShowcaseAccount || readyForFinalGauntlet
}

/** Campaign-complete UI states (Threshold banner): showcase reads as done. */
export function academyCampaignCompleteWithShowcase(
  isShowcaseAccount: boolean,
  academyCampaignComplete: boolean,
): boolean {
  return isShowcaseAccount || academyCampaignComplete
}

/**
 * Realm-boss knowledge gate. A low quiz score is still shown honestly, but it
 * never blocks the showcase account from continuing into the fight.
 */
export function bossKnowledgeGateOpenWithShowcase(
  isShowcaseAccount: boolean,
  knowledgePassed: boolean,
): boolean {
  return isShowcaseAccount || knowledgePassed
}

/** Final-boss exam seal: showcase may face the Architect pre-certification. */
export function finalBossSealOpenWithShowcase(
  isShowcaseAccount: boolean,
  examPassed: boolean,
): boolean {
  return isShowcaseAccount || examPassed
}

/**
 * Overworld hold-out siege before a gate opens. The siege stays part of the
 * normal game; for showcase it is optional — pressing E always works.
 */
export function bypassesOverworldSiege(isShowcaseAccount: boolean): boolean {
  return isShowcaseAccount
}
