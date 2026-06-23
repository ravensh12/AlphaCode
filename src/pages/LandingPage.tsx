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
            Learn Python by <span className="hl">tracing</span> what the computer
            does.
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

        <div className="landing-visual">
          <img
            className="landing-hero-img"
            src="/landing-hero.png"
            alt="A friendly robot watching the value 7 drop into a labelled variable box as Python code runs"
            width={1024}
            height={768}
          />
        </div>
      </main>

      <footer className="landing-footer">
        <div className="container">
          <span className="muted">Code Tracer — a Brilliant-style way to learn how code runs.</span>
        </div>
      </footer>
    </div>
  )
}
