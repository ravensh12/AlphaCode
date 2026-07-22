import { describe, expect, it } from 'vitest'
import {
  BOSS_RUSH_STAGES,
  RUSH_FINALE_MAX_HEARTS,
  RUSH_MAX_HEARTS,
  continueRun,
  initialBossRushState,
  loseFight,
  maxHeartsForStage,
  retryFight,
  startRun,
  winFight,
  type BossRushState,
} from './bossRushCore'

describe('boss rush state machine', () => {
  it('starts a fresh run at stage 0 with full hearts', () => {
    const s = startRun(initialBossRushState())
    expect(s.phase).toBe('fight')
    expect(s.stage).toBe(0)
    expect(s.hearts).toBe(RUSH_MAX_HEARTS)
    expect(s.retryUsed).toBe(false)
    expect(s.cleared).toBe(0)
  })

  it('advances through all six fights and completes', () => {
    let s = startRun(initialBossRushState())
    for (let stage = 0; stage < BOSS_RUSH_STAGES - 1; stage++) {
      expect(s.stage).toBe(stage)
      s = winFight(s, 5)
      expect(s.phase).toBe('interlude')
      expect(s.stage).toBe(stage + 1)
      s = continueRun(s)
      expect(s.phase).toBe('fight')
    }
    expect(s.stage).toBe(BOSS_RUSH_STAGES - 1)
    s = winFight(s, 3)
    expect(s.phase).toBe('complete')
    expect(s.cleared).toBe(BOSS_RUSH_STAGES)
  })

  it('tops hearts up by one between fights, capped to the next arena track', () => {
    let s = startRun(initialBossRushState())
    s = winFight(s, 4)
    expect(s.hearts).toBe(5)
    // Winning at full hearts cannot exceed the cap.
    s = continueRun(s)
    s = winFight(s, RUSH_MAX_HEARTS)
    expect(s.hearts).toBe(RUSH_MAX_HEARTS)
    // Winning at zero-ish still enters the next fight with at least 2 (1 floor + heal).
    s = continueRun(s)
    s = winFight(s, 0)
    expect(s.hearts).toBe(2)
  })

  it('lets the finale carry more hearts than the standard arenas', () => {
    expect(maxHeartsForStage(0)).toBe(RUSH_MAX_HEARTS)
    expect(maxHeartsForStage(BOSS_RUSH_STAGES - 2)).toBe(RUSH_MAX_HEARTS)
    expect(maxHeartsForStage(BOSS_RUSH_STAGES - 1)).toBe(RUSH_FINALE_MAX_HEARTS)
    // Entering the finale with 8 hearts heals to 9 (finale track allows 12).
    let s = startRun(initialBossRushState())
    for (let stage = 0; stage < BOSS_RUSH_STAGES - 2; stage++) {
      s = continueRun(winFight(s, RUSH_MAX_HEARTS))
    }
    s = winFight(s, RUSH_MAX_HEARTS)
    expect(s.stage).toBe(BOSS_RUSH_STAGES - 1)
    expect(s.hearts).toBe(RUSH_MAX_HEARTS + 1)
  })

  it('offers exactly one retry per boss, then ends the run', () => {
    let s = startRun(initialBossRushState())
    s = loseFight(s)
    expect(s.phase).toBe('retry')
    expect(s.retryUsed).toBe(true)
    const beforeToken = s.fightToken
    s = retryFight(s)
    expect(s.phase).toBe('fight')
    expect(s.fightToken).toBe(beforeToken + 1) // remounts the arena
    s = loseFight(s)
    expect(s.phase).toBe('failed')
  })

  it('restores the hearts the fight was entered with on retry', () => {
    let s = startRun(initialBossRushState())
    s = winFight(s, 3) // enter stage 1 with 4 hearts
    s = continueRun(s)
    expect(s.hearts).toBe(4)
    s = retryFight(loseFight(s))
    expect(s.hearts).toBe(4) // live HP loss inside the arena never leaks back
  })

  it('resets the retry allowance at each new stage', () => {
    let s = startRun(initialBossRushState())
    s = retryFight(loseFight(s)) // burn stage 0's retry
    expect(s.retryUsed).toBe(true)
    s = continueRun(winFight(s, 5))
    expect(s.retryUsed).toBe(false)
    s = loseFight(s)
    expect(s.phase).toBe('retry') // stage 1 gets its own retry
  })

  it('fully restarts from failed/complete summaries', () => {
    let s = startRun(initialBossRushState())
    s = continueRun(winFight(s, 5))
    s = loseFight(s)
    expect(s.phase).toBe('retry')
    expect(loseFight(s)).toBe(s) // a second loss can only come from a live fight
    s = loseFight(retryFight(s))
    expect(s.phase).toBe('failed')
    const restarted = startRun(s)
    expect(restarted).toMatchObject({
      phase: 'fight',
      stage: 0,
      hearts: RUSH_MAX_HEARTS,
      retryUsed: false,
      cleared: 0,
    })
    expect(restarted.fightToken).toBeGreaterThan(s.fightToken)
  })

  it('ignores out-of-phase events', () => {
    const intro = initialBossRushState()
    expect(winFight(intro, 5)).toBe(intro)
    expect(loseFight(intro)).toBe(intro)
    expect(continueRun(intro)).toBe(intro)
    expect(retryFight(intro)).toBe(intro)
    const fighting = startRun(intro)
    expect(continueRun(fighting)).toBe(fighting)
    expect(retryFight(fighting)).toBe(fighting)
    const done: BossRushState = { ...fighting, phase: 'complete' }
    expect(winFight(done, 5)).toBe(done)
  })
})
