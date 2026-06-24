import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import './AuthPage.css'

type Mode = 'signup' | 'login'

export function AuthPage() {
  const navigate = useNavigate()
  const { signUp, signIn, signInWithGoogle, continueAsGuest, hasBackend } =
    useAuth()

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
          navigate('/start')
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

  async function handleGoogle() {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      // On success the browser redirects to Google, so we stay "busy".
      await signInWithGoogle()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  function handleGuest() {
    continueAsGuest()
    navigate('/start')
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

            {hasBackend && (
              <button
                className="btn full auth-google"
                onClick={handleGoogle}
                disabled={busy}
                type="button"
              >
                <GoogleMark />
                Continue with Google
              </button>
            )}

            <button className="btn ghost full" onClick={handleGuest}>
              Continue as guest
            </button>
            <p className="auth-guest-note muted">
              Guest mode previews the first interactive lesson only. Sign in to
              unlock the quiz and full course.
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

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
