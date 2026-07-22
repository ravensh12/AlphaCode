import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import {
  isMissionRetentionDue,
  missionRetentionAvailableAt,
  selectAcademyProblemProgress,
} from './academyProgress'

/* ============================================================================
   Memory Crystals — retention made physical (Living Code City, PR4-6 prep).

   Every practiced mission grows a crystal beside its track gate. The crystal's
   whole lifecycle is a PROJECTION over the existing academy evidence — this
   module never stores anything and never invents timing rules of its own:

   | evidence                                        | crystal state  |
   |-------------------------------------------------|----------------|
   | practiced, retention not yet due                | 'growing'      |
   | practiced, isMissionRetentionDue(...) === true  | 'ripe'         |
   | completed, cloud on, no cloudVerifiedAt         | 'pendingCloud' |
   | completed otherwise                             | 'cleared'      |
   | never practiced                                 | (no crystal)   |

   'ripe' and 'pendingCloud' are the only harvestable states: harvesting is the
   retention check itself (or its cloud re-verification), so a crystal can NEVER
   be interacted with before isMissionRetentionDue says the wait has passed.
   'pendingCloud' draws as a ripe crystal carrying a cloud glyph — the work is
   retained locally and only the cloud receipt is missing.
   ========================================================================== */

export type CrystalState = 'growing' | 'ripe' | 'pendingCloud' | 'cleared'

export interface CrystalClock {
  /** Evaluation moment (epoch ms or ISO timestamp). */
  now: number | string
  /** Whether cloud sync is active for this identity. */
  cloudEnabled: boolean
}

/** How a crystal state draws. pendingCloud = ripe body + cloud glyph. */
export interface CrystalRenderProfile {
  body: 'growing' | 'ripe' | 'cleared'
  cloudGlyph: boolean
}

export interface MemoryCrystalProjection {
  problemId: ProblemId
  state: CrystalState
  /** True only for 'ripe' | 'pendingCloud' — the harvestable states. */
  interactable: boolean
  /** When a growing crystal ripens (ISO); null once completed / not practiced. */
  retentionAvailableAt: string | null
  render: CrystalRenderProfile
}

/** Harvestable = the retention check (or its cloud re-verify) is actionable. */
export function isCrystalInteractable(state: CrystalState): boolean {
  return state === 'ripe' || state === 'pendingCloud'
}

export function crystalRenderProfile(state: CrystalState): CrystalRenderProfile {
  switch (state) {
    case 'growing':
      return { body: 'growing', cloudGlyph: false }
    case 'ripe':
      return { body: 'ripe', cloudGlyph: false }
    case 'pendingCloud':
      return { body: 'ripe', cloudGlyph: true }
    case 'cleared':
      return { body: 'cleared', cloudGlyph: false }
  }
}

/**
 * Crystal state for one problem, straight from the academy selectors.
 * Returns null when the problem was never practiced (no crystal exists).
 */
export function crystalStateForProblem(
  state: AcademyProgressState,
  problemId: ProblemId,
  clock: CrystalClock,
): CrystalState | null {
  const progress = selectAcademyProblemProgress(state, problemId)
  if (!progress.missionPracticed && !progress.missionCompleted) return null
  if (progress.missionCompleted) {
    const pendingCloud =
      clock.cloudEnabled && !progress.completionEvidence?.cloudVerifiedAt
    return pendingCloud ? 'pendingCloud' : 'cleared'
  }
  return isMissionRetentionDue(state, problemId, clock.now)
    ? 'ripe'
    : 'growing'
}

/**
 * When the crystal ripens (the mission's retention-availability moment).
 * Null for completed or never-practiced problems — nothing left to wait for.
 */
export function crystalRetentionAvailableAt(
  state: AcademyProgressState,
  problemId: ProblemId,
): string | null {
  const progress = selectAcademyProblemProgress(state, problemId)
  if (!progress.practiceEvidence || progress.missionCompleted) return null
  return missionRetentionAvailableAt(progress.practiceEvidence)
}

/** Full projection for the world layer (state + render + interactability). */
export function projectMemoryCrystal(
  state: AcademyProgressState,
  problemId: ProblemId,
  clock: CrystalClock,
): MemoryCrystalProjection | null {
  const crystalState = crystalStateForProblem(state, problemId, clock)
  if (!crystalState) return null
  return {
    problemId,
    state: crystalState,
    interactable: isCrystalInteractable(crystalState),
    retentionAvailableAt: crystalRetentionAvailableAt(state, problemId),
    render: crystalRenderProfile(crystalState),
  }
}
