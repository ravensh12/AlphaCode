import { useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { EndlessArena, type EndlessRunResult } from '../components/game3d/EndlessArena'
import { isCoarsePointer } from '../components/game3d/touchControls'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { playClick } from '../lib/soundFx'
import {
  loadEndlessRecord,
  recordEndlessRun,
  resolvePostgameAccess,
} from '../lib/postgame'
import './BossBattlePage.css'

/** XP per fully-cleared wave, capped per run (post-campaign — XP only). */
const ENDLESS_XP_PER_WAVE = 25
const ENDLESS_XP_CAP = 500

const SIEGE_ACCENT = '#37e6ff'

type Phase = 'intro' | 'run' | 'summary'

export function EndlessSiegePage() {
  const navigate = useNavigate()
  const { isShowcaseAccount, identityId } = useAuth()
  const { ready, academyCampaignComplete } = useProgress()
  const { addXp } = usePlayerLevel()

  const [phase, setPhase] = useState<Phase>('intro')
  const [runKey, setRunKey] = useState(0)
  const [summary, setSummary] = useState<{
    result: EndlessRunResult
    newBest: boolean
    bestWave: number
    xp: number
  } | null>(null)
  const endedRunRef = useRef(-1)
  const best = useMemo(() => loadEndlessRecord(undefined, identityId), [identityId])

  const access = resolvePostgameAccess(
    isShowcaseAccount,
    ready,
    academyCampaignComplete,
  )
  if (access.status === 'loading') return <Loader label="Restoring your progress" night />
  if (access.status === 'redirect') return <Navigate to={access.to} replace />

  function beginRun() {
    playClick()
    setSummary(null)
    setRunKey((k) => k + 1)
    setPhase('run')
  }

  function handleEnd(result: EndlessRunResult) {
    // One grant per run even if the arena ever double-fired.
    if (endedRunRef.current === runKey) return
    endedRunRef.current = runKey
    const { record, newBest } = recordEndlessRun(
      result.wave,
      result.kills,
      undefined,
      identityId,
    )
    const wavesCleared = Math.max(0, result.wave - 1)
    const xp = Math.min(ENDLESS_XP_CAP, wavesCleared * ENDLESS_XP_PER_WAVE)
    if (xp > 0) addXp(xp)
    setSummary({ result, newBest, bestWave: record.bestWave, xp })
    setPhase('summary')
  }

  // --- Live run ---------------------------------------------------------------
  if (phase === 'run') {
    return (
      <div className="battle-page">
        <EndlessArena
          key={`siege-${runKey}`}
          accent={SIEGE_ACCENT}
          onEnd={handleEnd}
          onExit={() => navigate('/quest/list')}
        />
      </div>
    )
  }

  // --- Run summary --------------------------------------------------------------
  if (phase === 'summary' && summary) {
    const wavesCleared = Math.max(0, summary.result.wave - 1)
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: SIEGE_ACCENT }} />
          <div className="battle-overlay" key={`siege-summary-${runKey}`}>
            <div className="battle-result-card lose">
              <span className="battle-result-tag">The siege ends</span>
              <h2>You fell on wave {summary.result.wave}</h2>
              <p>
                {wavesCleared} wave{wavesCleared === 1 ? '' : 's'} survived ·{' '}
                {summary.result.kills} kills ·{' '}
                {summary.newBest ? (
                  <strong>new best wave!</strong>
                ) : (
                  <>best wave {summary.bestWave}</>
                )}
                {summary.xp > 0 ? ` · +${summary.xp} XP` : ''}
              </p>
              <div className="battle-result-actions">
                <button className="battle-btn battle-btn-primary" onClick={beginRun}>
                  Hold the line again
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

  // --- Intro ----------------------------------------------------------------------
  return (
    <div className="battle-page">
      <div className="battle-stage battle-stage--full">
        <div className="battle-backdrop" style={{ ['--accent' as string]: SIEGE_ACCENT }} />
        <div className="battle-overlay" key="siege-intro">
          <div className="battle-intro-card">
            <span className="battle-intro-vs">Post-campaign · Endless Siege</span>
            <h1>Hold the Arena</h1>
            <p className="battle-intro-taunt">
              The simulation pours in escalating waves — shamblers first, then runners, acid
              spitters, armored brutes, mutants and glitch elites. Survive as long as you can.
            </p>
            <p className="battle-intro-hint">
              {isCoarsePointer()
                ? 'On-screen stick to move, hold the FIRE button to shoot — best with a keyboard (WASD + F).'
                : 'WASD to move, hold click / F to shoot.'}{' '}
              Heart pickups drop between waves — grab them during the breather. The run ends when
              your hearts do.
              {best ? ` Best: wave ${best.bestWave}.` : ' Set your first record.'}
            </p>
            <div className="battle-result-actions">
              <button className="battle-btn battle-btn-primary" onClick={beginRun}>
                Start the siege
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
