import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArchitectArena } from '../components/game3d/ArchitectArena'
import { useGauntlet } from '../context/GauntletContext'
import { ARCHITECT_INTRO, ARCHITECT_DEFEAT, ARCHITECT_VICTORY } from '../content/finalGauntletLore'
import { playClick } from '../lib/soundFx'
import './FinalBossPage.css'

type Phase = 'intro' | 'fight' | 'won' | 'lost'

const ACCENT = '#8ea2ff'

export function FinalBossPage() {
  const navigate = useNavigate()
  const { state, beatFinalBoss } = useGauntlet()
  const [phase, setPhase] = useState<Phase>('intro')
  // Bump to remount the arena for a fresh attempt.
  const [fightRun, setFightRun] = useState(0)
  // Testing shortcut: lets you enter the fight without passing the trial.
  const [bypassGate, setBypassGate] = useState(false)

  // --- Gate: the Mastery Trial must be cleared first ----------------------
  if (!state.examPassed && !bypassGate) {
    return (
      <div className="over3d-page fb-page fb-page--apex">
        <div className="fb-void-bg" aria-hidden />
        <div className="fb-screen">
          <div className="fb-card fb-card--locked">
            <span className="fb-tag fb-tag--locked">Sealed</span>
            <h1 className="fb-title">The Apex Is Sealed</h1>
            <p className="fb-lead">
              The Architect waits on the storm-lashed rooftop above Code City — but the way up only opens
              to those who have <strong>proven their mastery</strong>. Clear the Mastery Trial first to
              break the seal.
            </p>
            <div className="fb-actions">
              <Link className="fb-btn fb-btn--primary" to="/final/exam">
                Take the Mastery Trial
              </Link>
              <Link className="fb-btn fb-btn--ghost" to="/quest">
                Back to Code City
              </Link>
            </div>
            <button
              type="button"
              className="fb-skip-test"
              onClick={() => setBypassGate(true)}
            >
              Skip into the fight (testing)
            </button>
          </div>
        </div>
      </div>
    )
  }

  function handleWin() {
    beatFinalBoss()
    setPhase('won')
  }

  // --- Live fight ----------------------------------------------------------
  if (phase === 'fight') {
    return (
      <div className="over3d-page fb-page fb-page--fight">
        <ArchitectArena
          key={`architect-arena-${fightRun}`}
          bossName="THE ARCHITECT"
          accent={ACCENT}
          onWin={handleWin}
          onLose={() => setPhase('lost')}
          onFlee={() => navigate('/quest')}
        />
      </div>
    )
  }

  // --- Victory / credits ---------------------------------------------------
  if (phase === 'won') {
    return (
      <div className="over3d-page fb-page fb-page--apex">
        <div className="fb-void-bg fb-void-bg--win" aria-hidden />
        <div className="fb-screen">
          <div className="fb-card fb-card--win">
            <span className="fb-tag fb-tag--win">The Architect Falls</span>
            <h1 className="fb-title fb-title--win">Dawn Over Code City</h1>
            <p className="fb-lead">{ARCHITECT_DEFEAT}</p>
            <div className="fb-victory" aria-label="Victory">
              {ARCHITECT_VICTORY.map((line, i) => (
                <span key={i} className="fb-victory-line" style={{ animationDelay: `${0.4 + i * 0.7}s` }}>
                  {line}
                </span>
              ))}
            </div>
            <div className="fb-actions">
              <Link className="fb-btn fb-btn--primary" to="/quest/list">
                Back to Levels
              </Link>
              <Link className="fb-btn fb-btn--ghost" to="/quest">
                Code City
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Defeat --------------------------------------------------------------
  if (phase === 'lost') {
    return (
      <div className="over3d-page fb-page fb-page--apex">
        <div className="fb-void-bg fb-void-bg--lost" aria-hidden />
        <div className="fb-screen">
          <div className="fb-card fb-card--lost">
            <span className="fb-tag fb-tag--lost">Overwritten</span>
            <h1 className="fb-title fb-title--lost">The Architect Stands</h1>
            <p className="fb-lead">
              The storm swallows you and the rooftop goes dark. But you read his rhythm now — bait the
              glowing overhead, <strong>parry</strong> it clean, and punish the stagger. Get back up and
              finish what you started.
            </p>
            <div className="fb-actions">
              <button
                className="fb-btn fb-btn--primary"
                onClick={() => {
                  setFightRun((r) => r + 1)
                  setPhase('fight')
                }}
              >
                Fight again
              </button>
              <Link className="fb-btn fb-btn--ghost" to="/quest">
                Leave the Apex
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Intro ---------------------------------------------------------------
  return (
    <div className="over3d-page fb-page fb-page--apex">
      <div className="fb-void-bg fb-void-bg--intro" aria-hidden />
      <div className="fb-screen">
        <div className="fb-card fb-card--intro">
          <span className="fb-tag">Final Showdown · The Apex</span>
          <h1 className="fb-title fb-title--boss">{ARCHITECT_INTRO.title}</h1>
          <p className="fb-subtitle">{ARCHITECT_INTRO.subtitle}</p>
          <p className="fb-lead fb-lead--taunt">{ARCHITECT_INTRO.taunt}</p>
          <p className="fb-lead">
            A brutal <strong>four-phase</strong> duel atop the storm-lashed rooftop — and as he weakens he{' '}
            <strong>fractures into echo-clones</strong> that strike alongside him from every side. Read the
            rhythm, parry the heavies, and don&rsquo;t get surrounded. {ARCHITECT_INTRO.hint}
          </p>
          <p className="fb-controls-line">
            <kbd>WASD</kbd> move · <kbd>Shift</kbd> dash · <kbd>K</kbd> roll · <kbd>Space</kbd> jump ·{' '}
            <kbd>Q</kbd>/Click melee · <kbd>F</kbd> ranged · <kbd>L</kbd> <strong>PARRY</strong>
          </p>
          <div className="fb-actions">
            <button
              className="fb-btn fb-btn--primary fb-btn--begin"
              onClick={() => {
                playClick()
                setPhase('fight')
              }}
            >
              Face the Architect
            </button>
            <Link className="fb-btn fb-btn--ghost" to="/quest">
              Not yet
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
