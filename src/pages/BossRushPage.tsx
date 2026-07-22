import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BossArena } from '../components/game3d/BossArena'
import { isCoarsePointer } from '../components/game3d/touchControls'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { WORLDS } from '../content/adventure'
import { VEX_INTRO, VEX_DEFEAT } from '../content/finalGauntletLore'
import { playClick } from '../lib/soundFx'
import {
  formatRunMs,
  loadBossRushRecord,
  recordBossRushRun,
  resolvePostgameAccess,
} from '../lib/postgame'
import {
  BOSS_RUSH_STAGES,
  continueRun,
  initialBossRushState,
  loseFight,
  maxHeartsForStage,
  retryFight,
  startRun,
  winFight,
  type BossRushState,
} from '../lib/bossRushCore'
import './BossBattlePage.css'

// The VEX finale reuses the flagship cinematic fight — lazy-split exactly like
// BossBattlePage so a rush entry doesn't parse that module graph up front.
const CinematicBossArena = lazy(() =>
  import('../components/game3d/CinematicBossArena').then((m) => ({ default: m.CinematicBossArena })),
)

/** Flat XP for finishing the rush (post-campaign victory lap — XP only). */
const BOSS_RUSH_COMPLETE_XP = 300

const RUSH_ACCENT = '#b48cff'

export function BossRushPage() {
  const navigate = useNavigate()
  const { isShowcaseAccount, identityId } = useAuth()
  const { ready, academyCampaignComplete } = useProgress()
  const { addXp } = usePlayerLevel()

  const [state, setState] = useState<BossRushState>(initialBossRushState)
  // Live hearts reported by the mounted arena (read at the moment of victory).
  const liveHeartsRef = useRef(state.hearts)
  // Fight-time-only run clock (paused on every interstitial screen).
  const fightAccumRef = useRef(0)
  const fightStartRef = useRef<number | null>(null)
  const xpGrantedRef = useRef(false)
  const [results, setResults] = useState<{ totalMs: number; newBest: boolean; bestMs: number } | null>(null)
  const best = useMemo(() => loadBossRushRecord(undefined, identityId), [identityId])

  const reportHearts = useCallback((hp: number) => {
    liveHeartsRef.current = hp
  }, [])

  // Accumulate elapsed fight time only while a fight is live.
  useEffect(() => {
    if (state.phase !== 'fight') return
    fightStartRef.current = performance.now()
    return () => {
      if (fightStartRef.current != null) {
        fightAccumRef.current += performance.now() - fightStartRef.current
        fightStartRef.current = null
      }
    }
  }, [state.phase, state.fightToken])

  // The finale chunk is lazy — warm it while the player battles toward it.
  useEffect(() => {
    if (state.phase !== 'intro') void import('../components/game3d/CinematicBossArena')
  }, [state.phase])

  const access = resolvePostgameAccess(
    isShowcaseAccount,
    ready,
    academyCampaignComplete,
  )
  if (access.status === 'loading') return <Loader label="Restoring your progress" night />
  if (access.status === 'redirect') return <Navigate to={access.to} replace />

  const elapsedMs = () =>
    fightAccumRef.current +
    (fightStartRef.current != null ? performance.now() - fightStartRef.current : 0)

  function beginRun() {
    playClick()
    fightAccumRef.current = 0
    fightStartRef.current = null
    xpGrantedRef.current = false
    setResults(null)
    const next = startRun(state)
    liveHeartsRef.current = next.hearts
    setState(next)
  }

  function handleWin() {
    // `state` cannot change during a live fight (only refs tick), so deriving
    // the transition outside setState keeps the updater pure under StrictMode.
    const next = winFight(state, liveHeartsRef.current)
    if (next.phase === 'complete' && !xpGrantedRef.current) {
      xpGrantedRef.current = true
      // The fight clock is still running here; close it out for the total.
      const totalMs = elapsedMs()
      const { record, newBest } = recordBossRushRun(totalMs, undefined, identityId)
      setResults({ totalMs, newBest, bestMs: record.bestMs })
      addXp(BOSS_RUSH_COMPLETE_XP)
    }
    setState(next)
  }

  function handleLose() {
    setState(loseFight(state))
  }

  function handleContinue() {
    playClick()
    const next = continueRun(state)
    liveHeartsRef.current = next.hearts
    setState(next)
  }

  function handleRetry() {
    playClick()
    const next = retryFight(state)
    liveHeartsRef.current = next.hearts
    setState(next)
  }

  const stage = state.stage
  const isFinale = stage === BOSS_RUSH_STAGES - 1
  const world = WORLDS[Math.min(stage, WORLDS.length - 1)]
  const accent = state.phase === 'fight' || state.phase === 'interlude' || state.phase === 'retry'
    ? world.theme.accent
    : RUSH_ACCENT
  const stageName = isFinale ? `${VEX_INTRO.title} — ${VEX_INTRO.subtitle}` : world.boss.name
  const stageTaunt = isFinale ? VEX_INTRO.taunt : world.boss.taunt

  // --- Live fight -----------------------------------------------------------
  if (state.phase === 'fight') {
    return (
      <div className="battle-page">
        {isFinale ? (
          <Suspense fallback={<Loader label="Entering the final arena" />}>
            <CinematicBossArena
              key={`rush-vex-${state.fightToken}`}
              bossName="VEX"
              accent={world.theme.accent}
              loadout={null}
              initialHp={state.hearts}
              onHpChange={reportHearts}
              onWin={handleWin}
              onLose={handleLose}
              onFlee={() => navigate('/quest/list')}
            />
          </Suspense>
        ) : (
          <BossArena
            key={`rush-${stage}-${state.fightToken}`}
            accent={world.theme.accent}
            variant={stage}
            bossName={world.boss.name}
            initialHp={state.hearts}
            onHpChange={reportHearts}
            onWin={handleWin}
            onLose={handleLose}
            onFlee={() => navigate('/quest/list')}
          />
        )}
        <RushClockChip stage={stage} elapsed={elapsedMs} />
      </div>
    )
  }

  // --- Between-fight interstitial --------------------------------------------
  if (state.phase === 'interlude') {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay" key={`interlude-${stage}`}>
            <div className="battle-intro-card">
              <span className="battle-intro-vs">
                Boss Rush · Fight {stage + 1} of {BOSS_RUSH_STAGES}
              </span>
              <h1>{stageName}</h1>
              <p className="battle-intro-taunt">{stageTaunt}</p>
              <p className="battle-intro-hint">
                +1 heart restored — {state.hearts}/{maxHeartsForStage(stage)} carried in ·{' '}
                run clock {formatRunMs(elapsedMs())}
              </p>
              <button className="battle-btn battle-btn-primary" onClick={handleContinue}>
                Continue the rush →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Fell: the stage's single retry -----------------------------------------
  if (state.phase === 'retry') {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay" key={`retry-${stage}`}>
            <div className="battle-result-card lose">
              <span className="battle-result-tag">Down!</span>
              <h2>{stageName} knocked you out</h2>
              <p>
                One retry for this boss — lose again and the run ends. You restart with
                the {state.hearts} heart{state.hearts === 1 ? '' : 's'} you entered with.
              </p>
              <div className="battle-result-actions">
                <button className="battle-btn battle-btn-primary" onClick={handleRetry}>
                  Use the retry
                </button>
                <Link className="battle-btn battle-btn-ghost" to="/quest/list">
                  Abandon run
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Run over: summary --------------------------------------------------------
  if (state.phase === 'failed') {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: RUSH_ACCENT }} />
          <div className="battle-overlay" key="rush-failed">
            <div className="battle-result-card lose">
              <span className="battle-result-tag">Run over</span>
              <h2>The rush ends at {stageName}</h2>
              <p>
                {state.cleared} of {BOSS_RUSH_STAGES} bosses cleared · {formatRunMs(elapsedMs())} on the
                clock{best ? ` · best clear ${formatRunMs(best.bestMs)}` : ''}. The gauntlet resets —
                every rush starts from The Hider.
              </p>
              <div className="battle-result-actions">
                <button className="battle-btn battle-btn-primary" onClick={beginRun}>
                  Start a new rush
                </button>
                <Link className="battle-btn battle-btn-ghost" to="/quest/list">
                  Back to levels
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state.phase === 'complete') {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: RUSH_ACCENT }} />
          <div className="battle-overlay" key="rush-complete">
            <div className="battle-result-card win">
              <span className="battle-result-tag">Gauntlet conquered</span>
              <h2>All {BOSS_RUSH_STAGES} bosses down!</h2>
              <p className="battle-intro-taunt">{VEX_DEFEAT}</p>
              <p>
                {results ? (
                  <>
                    Run time <strong>{formatRunMs(results.totalMs)}</strong>
                    {results.newBest
                      ? ' — new best!'
                      : ` · best ${formatRunMs(results.bestMs)}`}{' '}
                    · +{BOSS_RUSH_COMPLETE_XP} XP
                  </>
                ) : (
                  <>+{BOSS_RUSH_COMPLETE_XP} XP</>
                )}
              </p>
              <div className="battle-result-actions">
                <button className="battle-btn battle-btn-primary" onClick={beginRun}>
                  Run it again
                </button>
                <Link className="battle-btn battle-btn-ghost" to="/quest/list">
                  Back to levels
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Intro ---------------------------------------------------------------------
  return (
    <div className="battle-page">
      <div className="battle-stage battle-stage--full">
        <div className="battle-backdrop" style={{ ['--accent' as string]: RUSH_ACCENT }} />
        <div className="battle-overlay" key="rush-intro">
          <div className="battle-intro-card">
            <span className="battle-intro-vs">Post-campaign · Boss Rush</span>
            <h1>The Gauntlet, Relived</h1>
            <p className="battle-intro-taunt">
              All six realm bosses back to back — The Hider through VEX — with no quizzes in the
              way. Pure skill, one timer.
            </p>
            <p className="battle-intro-hint">
              Hearts carry over between fights (+1 restored at each interlude) and every boss
              allows exactly one retry before the run ends.
              {best ? ` Best clear: ${formatRunMs(best.bestMs)}.` : ' Set your first clear time.'}
            </p>
            {isCoarsePointer() && (
              <p className="battle-intro-hint">
                Best with a keyboard: the boss arenas move with WASD / arrow keys and do not yet
                support touch movement.
              </p>
            )}
            <div className="battle-result-actions">
              <button className="battle-btn battle-btn-primary" onClick={beginRun}>
                Start the rush
              </button>
              <Link className="battle-btn battle-btn-ghost" to="/quest/list">
                Not yet
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Fight index + live run clock over the arena HUD. Ticks itself so the clock
 * never re-renders the page (and with it the whole arena subtree).
 */
function RushClockChip({ stage, elapsed }: { stage: number; elapsed: () => number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 8,
        pointerEvents: 'none',
        textAlign: 'right',
        color: '#fff',
        fontWeight: 800,
        textShadow: '0 2px 8px rgba(0,0,0,0.7)',
      }}
    >
      <div style={{ fontSize: 14, letterSpacing: 1 }}>
        FIGHT {stage + 1}/{BOSS_RUSH_STAGES}
      </div>
      <div style={{ fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
        {formatRunMs(elapsed())}
      </div>
    </div>
  )
}
