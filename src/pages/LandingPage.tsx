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
          <h1 className="landing-title landing-brand-name">
            Alpha<span className="landing-brand-accent">Code</span>
          </h1>
          <p className="landing-eyebrow">LeetCode prep course</p>
          <p className="landing-lede">
            <span className="lede-brand">AlphaCode</span> is a{' '}
            <span className="lede-leetcode">LeetCode</span> prep course for high
            schoolers — interactive lessons, quizzes, and the core patterns before
            interview-style problems.
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
            <li>6 core patterns taught with visuals and guided tracing</li>
            <li>Interactive lesson, then a quiz — learn before you&apos;re tested</li>
            <li>See which NeetCode-style problems you&apos;re ready for next</li>
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
          <span className="landing-footer-brand">
            <strong>AlphaCode</strong>
            <span className="landing-footer-tag">LeetCode prep course</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
