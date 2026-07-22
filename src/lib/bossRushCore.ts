/**
 * Boss Rush — pure run state machine.
 *
 * Six back-to-back boss fights (the five realm arenas + the cinematic VEX
 * finale). Hearts persist across fights with a +1 top-up at every interlude,
 * and each boss allows exactly ONE retry before the run ends. The live HP
 * during a fight belongs to the arena component; this core only tracks the
 * hearts carried INTO the current fight, so a retry restores exactly what the
 * player entered with.
 */

export const BOSS_RUSH_STAGES = 6
/** BossArena's heart track (stages 0-4). */
export const RUSH_MAX_HEARTS = 8
/** CinematicBossArena's heart track (the VEX finale). */
export const RUSH_FINALE_MAX_HEARTS = 12
/** Hearts restored at each between-fight interlude. */
export const RUSH_INTERLUDE_HEAL = 1

export type BossRushPhase =
  | 'intro'
  | 'fight'
  | 'interlude'
  | 'retry'
  | 'failed'
  | 'complete'

export type BossRushState = {
  phase: BossRushPhase
  /** Current fight index (0..5). During an interlude it is the NEXT fight. */
  stage: number
  /** Hearts carried into the current stage's fight. */
  hearts: number
  /** True once the single retry for the current stage has been spent. */
  retryUsed: boolean
  /** Bumped on every fight (re)start — key the arena off it to remount. */
  fightToken: number
  /** Fights fully cleared so far (for run summaries). */
  cleared: number
}

export function maxHeartsForStage(stage: number): number {
  return stage >= BOSS_RUSH_STAGES - 1
    ? RUSH_FINALE_MAX_HEARTS
    : RUSH_MAX_HEARTS
}

export function initialBossRushState(): BossRushState {
  return {
    phase: 'intro',
    stage: 0,
    hearts: RUSH_MAX_HEARTS,
    retryUsed: false,
    fightToken: 0,
    cleared: 0,
  }
}

/** Begin (or fully restart) the run from the intro / summary screens. */
export function startRun(state: BossRushState): BossRushState {
  if (state.phase === 'fight') return state
  return {
    phase: 'fight',
    stage: 0,
    hearts: RUSH_MAX_HEARTS,
    retryUsed: false,
    fightToken: state.fightToken + 1,
    cleared: 0,
  }
}

/**
 * A boss went down. `heartsRemaining` is the live HP reported by the arena at
 * the moment of victory; the interlude tops it up by one (never past the next
 * arena's track, never below one).
 */
export function winFight(
  state: BossRushState,
  heartsRemaining: number,
): BossRushState {
  if (state.phase !== 'fight') return state
  const cleared = state.cleared + 1
  if (state.stage >= BOSS_RUSH_STAGES - 1) {
    return {
      ...state,
      phase: 'complete',
      cleared,
      hearts: Math.max(0, Math.round(heartsRemaining)),
    }
  }
  const nextStage = state.stage + 1
  const healed = Math.max(1, Math.round(heartsRemaining)) + RUSH_INTERLUDE_HEAL
  return {
    phase: 'interlude',
    stage: nextStage,
    hearts: Math.min(healed, maxHeartsForStage(nextStage)),
    retryUsed: false,
    fightToken: state.fightToken,
    cleared,
  }
}

/** Leave the interlude and start the next fight. */
export function continueRun(state: BossRushState): BossRushState {
  if (state.phase !== 'interlude') return state
  return { ...state, phase: 'fight', fightToken: state.fightToken + 1 }
}

/** The hero fell. First fall on a stage offers the retry; the second ends the run. */
export function loseFight(state: BossRushState): BossRushState {
  if (state.phase !== 'fight') return state
  if (state.retryUsed) return { ...state, phase: 'failed' }
  return { ...state, phase: 'retry', retryUsed: true }
}

/** Take the stage's one retry — hearts reset to what the fight started with. */
export function retryFight(state: BossRushState): BossRushState {
  if (state.phase !== 'retry') return state
  return { ...state, phase: 'fight', fightToken: state.fightToken + 1 }
}
