import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import './LandingPage.css'

export function LandingPage() {
  const navigate = useNavigate()
  const { continueAsGuest, status } = useAuth()

  function tryPreview() {
    continueAsGuest()
    navigate('/start')
  }

  return (
    <div className="page landing">
      <header className="landing-nav">
        <div className="container landing-nav-inner">
          <Brand />
          <nav className="landing-nav-actions">
            {status === 'authenticated' || status === 'guest' ? (
              <Link className="btn subtle" to="/quest">
                Continue quest
              </Link>
            ) : (
              <Link className="btn ghost" to="/auth">
                Log in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="container landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">3D shooter · learn to code</p>
          <h1 className="landing-title landing-brand-name">
            Alpha<span className="landing-brand-accent">Code</span>
          </h1>
          <p className="landing-lede">
            Blast through <span className="lede-zombie">zombie hordes</span>, clear checkpoints,
            beat the boss. <strong>LeetCode prep</strong> that plays like a game.
          </p>

          <ul className="landing-chips">
            <li className="landing-chip">🔫 Run &amp; gun</li>
            <li className="landing-chip">🧟 Zombie hordes</li>
            <li className="landing-chip">👾 Boss battles</li>
          </ul>

          <div className="landing-cta">
            <Link
              className="btn lg"
              to={status === 'authenticated' || status === 'guest' ? '/quest' : '/auth'}
            >
              Play Now
            </Link>
            <button className="btn lg ghost" onClick={tryPreview}>
              Try Preview
            </button>
          </div>
        </div>

        <div className="landing-visual">
          <GameScene />
        </div>
      </main>

      <footer className="landing-footer">
        <div className="container">
          <span className="landing-footer-brand">
            <strong>AlphaCode</strong>
            <span className="landing-footer-tag">Learn to code · survive Code City</span>
          </span>
        </div>
      </footer>
    </div>
  )
}

/**
 * A self-contained, looping diorama of the core gameplay: the hero runs and
 * guns down a zombie horde on a Code City street while the checkpoint beacon
 * glows ahead. Pure CSS/markup — no assets, respects reduced-motion.
 */
function GameScene() {
  return (
    <div
      className="game-scene"
      role="img"
      aria-label="The AlphaCode hero blasting a horde of zombies on a Code City street, racing toward a glowing checkpoint."
    >
      <div className="gs-sky" />
      <div className="gs-stars" aria-hidden="true">
        <span /><span /><span /><span /><span /><span />
      </div>

      {/* Distant skyline */}
      <div className="gs-skyline" aria-hidden="true">
        <span className="gs-tower t1" />
        <span className="gs-tower t2" />
        <span className="gs-tower t3" />
        <span className="gs-tower t4" />
        <span className="gs-tower t5" />
      </div>

      {/* Checkpoint building + beacon */}
      <div className="gs-checkpoint" aria-hidden="true">
        <span className="gs-beacon" />
        <span className="gs-cp-roof" />
        <span className="gs-cp-door" />
      </div>

      {/* Street */}
      <div className="gs-ground" aria-hidden="true">
        <span className="gs-lane" />
      </div>

      {/* HUD */}
      <div className="gs-hud" aria-hidden="true">
        <div className="gs-hearts">
          <span className="gs-heart" />
          <span className="gs-heart" />
          <span className="gs-heart" />
        </div>
        <div className="gs-timer">
          <span className="gs-timer-fill" />
        </div>
      </div>
      <div className="gs-ko" aria-hidden="true">KO!</div>

      {/* Zombies marching in */}
      <div className="gs-zombie z1" aria-hidden="true">
        <span className="gs-z-head" />
        <span className="gs-z-body" />
        <span className="gs-z-arm" />
      </div>
      <div className="gs-zombie z2" aria-hidden="true">
        <span className="gs-z-head" />
        <span className="gs-z-body" />
        <span className="gs-z-arm" />
      </div>
      <div className="gs-zombie z3" aria-hidden="true">
        <span className="gs-z-head" />
        <span className="gs-z-body" />
        <span className="gs-z-arm" />
      </div>

      {/* Impact burst where bolts land */}
      <div className="gs-impact" aria-hidden="true" />

      {/* Bolts */}
      <div className="gs-bolts" aria-hidden="true">
        <span className="gs-bolt b1" />
        <span className="gs-bolt b2" />
        <span className="gs-bolt b3" />
      </div>

      {/* Hero with blaster */}
      <div className="gs-hero" aria-hidden="true">
        <span className="gs-hero-head" />
        <span className="gs-hero-visor" />
        <span className="gs-hero-body" />
        <span className="gs-hero-legs" />
        <span className="gs-hero-arm" />
        <span className="gs-hero-gun" />
        <span className="gs-muzzle" />
      </div>
    </div>
  )
}
