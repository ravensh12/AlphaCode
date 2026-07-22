import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import {
  isMissionRetentionDue,
  missionRetentionAvailableAt,
} from './academyProgress'

/* ============================================================================
   Shared academy mission status ladder.

   AcademyTrackPage's mission list renders one status per mission — labels,
   tones, destination semantics, and retention logic. This selector is the
   single source of truth (academyMissionStatus.test.ts pins its exact
   outputs). Locked destinations are /auth for guests and /quest for missing
   Code City entry.
   ========================================================================== */

/** Status tones mission entries are painted with. */
export type MissionStatusTone =
  | 'is-retained'
  | 'is-pending'
  | 'is-due'
  | 'is-practiced'
  | 'is-guest'
  | 'is-open'
  | 'is-city'

export interface AcademyMissionStatusInput {
  problemId: ProblemId
  /** 1-based campaign order (guests may only enter mission 1). */
  globalOrder: number
  academyProgress: AcademyProgressState
  cloudEnabled: boolean
  /** Retention clock (epoch ms). */
  retentionNow: number
  isGuest: boolean
  /** True once the player physically entered this checkpoint in Code City. */
  physicalEntry: boolean
  /** The academy mission route for this problem. */
  missionPath: string
}

export interface AcademyMissionStatus {
  status: { label: string; tone: MissionStatusTone }
  /** Activation target: missionPath (± ?mode=retention), or /auth / /quest. */
  destination: string
  /** Retention checks replace the history entry instead of pushing. */
  replace: boolean
  /** True when activation leaves the surface (guest or Code City lock). */
  locked: boolean
  /* Derived facts both surfaces also render from. */
  complete: boolean
  practiced: boolean
  retentionDue: boolean
  guestLocked: boolean
  entryAllowed: boolean
  /** True when activation should open the retention check. */
  retentionOpen: boolean
  /** Unlock moment for a practiced-but-not-yet-due retention check. */
  retentionAvailableAt: string | null
}

/**
 * The exact status computation AcademyTrackPage has always rendered (mission
 * practices/completions, cloud verification, retention due-ness).
 */
export function academyMissionStatus(
  input: AcademyMissionStatusInput,
): AcademyMissionStatus {
  const { academyProgress, missionPath } = input
  const completion = academyProgress.missionCompletions[input.problemId]
  const complete = !!completion
  const cloudVerified = !!completion?.cloudVerifiedAt
  const practiced = !!academyProgress.missionPractices[input.problemId]
  const needsCloudVerification =
    complete && input.cloudEnabled && !cloudVerified
  const retentionDue =
    needsCloudVerification ||
    isMissionRetentionDue(academyProgress, input.problemId, input.retentionNow)
  const retentionAvailableAt =
    practiced && !complete
      ? missionRetentionAvailableAt(
          academyProgress.missionPractices[input.problemId]!,
        )
      : null
  const guestLocked = input.isGuest && input.globalOrder !== 1
  const entryAllowed =
    complete ||
    practiced ||
    input.physicalEntry ||
    (input.isGuest && input.globalOrder === 1)
  const retentionOpen =
    practiced && retentionDue && (!complete || needsCloudVerification)

  const status: { label: string; tone: MissionStatusTone } = complete
    ? needsCloudVerification
      ? {
          label: 'Retained locally · cloud check needed',
          tone: 'is-pending',
        }
      : { label: 'Retained', tone: 'is-retained' }
    : practiced && retentionDue
      ? { label: 'Retention check ready', tone: 'is-due' }
      : practiced
        ? { label: 'Practice complete', tone: 'is-practiced' }
        : guestLocked
          ? { label: 'Sign in to unlock', tone: 'is-guest' }
          : entryAllowed
            ? { label: 'Start mission', tone: 'is-open' }
            : { label: 'Enter Code City', tone: 'is-city' }
  const destination = guestLocked
    ? '/auth'
    : !entryAllowed
      ? '/quest'
      : retentionOpen
        ? `${missionPath}?mode=retention`
        : missionPath

  return {
    status,
    destination,
    replace: !guestLocked && entryAllowed && retentionOpen,
    locked: guestLocked || !entryAllowed,
    complete,
    practiced,
    retentionDue,
    guestLocked,
    entryAllowed,
    retentionOpen,
    retentionAvailableAt,
  }
}
