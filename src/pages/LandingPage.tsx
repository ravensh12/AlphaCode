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
              <Link className="btn subtle" to="/home">
                Go to course
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
          <span className="pill brand">Beginner Python · Learn by doing</span>
          <h1 className="landing-title">
            Learn Python by tracing what the computer does.
          </h1>
          <p className="landing-lede">
            Code Tracer turns the invisible part of programming into a puzzle. Step
            through code one line at a time, watch variable boxes update, and prove
            you understand how values change.
          </p>
          <div className="landing-cta">
            <Link className="btn lg" to="/auth">
              Start Learning
            </Link>
            <button className="btn lg ghost" onClick={tryPreview}>
              Try Preview
            </button>
          </div>
          <ul className="landing-points">
            <li>Step through real Python, line by line</li>
            <li>Instant, specific feedback on every answer</li>
            <li>Unlock the next lesson by reaching 75% mastery</li>
          </ul>
        </div>

        <DemoCard />
      </main>

      <footer className="landing-footer">
        <div className="container">
          <span className="muted">Code Tracer — a Brilliant-style way to learn how code runs.</span>
        </div>
      </footer>
    </div>
  )
}

function DemoCard() {
  return (
    <div className="demo-card card" aria-hidden="true">
      <div className="demo-code">
        <div className="demo-code-line">
          <span className="demo-ln">1</span>
          <code>
            <span className="tok-var">x</span> = <span className="tok-num">4</span>
          </code>
        </div>
        <div className="demo-code-line active">
          <span className="demo-ln">2</span>
          <code>
            <span className="tok-var">y</span> = <span className="tok-var">x</span> +{' '}
            <span className="tok-num">3</span>
          </code>
        </div>
        <div className="demo-code-line">
          <span className="demo-ln">3</span>
          <code>
            <span className="tok-var">x</span> = <span className="tok-var">y</span> -{' '}
            <span className="tok-num">2</span>
          </code>
        </div>
      </div>

      <div className="demo-vars">
        <div className="demo-var">
          <span className="demo-var-name">x</span>
          <span className="demo-var-box">4</span>
        </div>
        <div className="demo-var">
          <span className="demo-var-name">y</span>
          <span className="demo-var-box pulse">?</span>
        </div>
      </div>

      <div className="demo-prompt">
        <strong>What is stored in <code>y</code>?</strong>
        <div className="demo-tiles">
          <span className="demo-tile">5</span>
          <span className="demo-tile correct">7</span>
          <span className="demo-tile">12</span>
        </div>
      </div>
    </div>
  )
}
