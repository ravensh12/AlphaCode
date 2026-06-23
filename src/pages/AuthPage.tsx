import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import './AuthPage.css'

type Mode = 'signup' | 'login'

export function AuthPage() {
  const navigate = useNavigate()
  const { signUp, signIn, continueAsGuest, hasBackend } = useAuth()

  const [mode, setMode] = useState<Mode>('signup')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function friendlyError(err: unknown): string {
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    if (/rate limit/i.test(message)) {
      return 'Too many signups in a short time. This is a Supabase email limit — wait a few minutes, or turn off "Confirm email" in your Supabase Auth settings.'
    }
    if (/invalid login credentials/i.test(message)) {
      return 'Incorrect email or password.'
    }
    return message
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const result = await signUp(
          email.trim(),
          password,
          displayName.trim() || 'Learner',
        )
        if (result === 'active') {
          navigate('/onboarding')
        } else {
          setMode('login')
          setNotice(
            'Account created. Check your email to confirm it, then log in.',
          )
        }
      } else {
        await signIn(email.trim(), password)
        navigate('/start')
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  function handleGuest() {
    continueAsGuest()
    navigate('/home')
  }

  return (
    <div className="page auth-page">
      <div className="container auth-top">
        <Brand />
      </div>

      <main className="auth-main">
        <div className="auth-card card">
          <div className="auth-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'signup'}
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setMode('signup')
                setError(null)
                setNotice(null)
              }}
            >
              Sign up
            </button>
            <button
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login')
                setError(null)
                setNotice(null)
              }}
            >
              Log in
            </button>
          </div>

          <div className="auth-body">
            <h1 className="auth-title">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="muted auth-subtitle">
              {mode === 'signup'
                ? 'Save your progress, streak, and mastery as you learn.'
                : 'Log in to pick up right where you left off.'}
            </p>

            {!hasBackend && (
              <div className="auth-notice">
                Accounts need Supabase configured. You can still explore with{' '}
                <strong>Continue as guest</strong>.
              </div>
            )}

            {notice && <div className="auth-success">{notice}</div>}

            <form className="auth-form" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input
                    id="name"
                    className="input"
                    type="text"
                    autoComplete="name"
                    placeholder="Maya"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
              )}

              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={
                    mode === 'signup' ? 'new-password' : 'current-password'
                  }
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <div className="form-error">{error}</div>}

              <button className="btn full lg" type="submit" disabled={busy}>
                {busy
                  ? 'Working…'
                  : mode === 'signup'
                    ? 'Create account'
                    : 'Log in'}
              </button>
            </form>

            <div className="auth-divider">
              <span>or</span>
            </div>

            <button className="btn ghost full" onClick={handleGuest}>
              Continue as guest
            </button>
            <p className="auth-guest-note muted">
              Guest progress is saved on this device only.
            </p>
          </div>
        </div>

        <p className="auth-back">
          <Link to="/">← Back to home</Link>
        </p>
      </main>
    </div>
  )
}
