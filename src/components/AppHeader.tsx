import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import { useAuth } from '../context/AuthContext'
import { IconCompass, IconSpeaker, IconSpeakerOff } from './icons'
import { isMuted as isMusicMuted, toggleMusic } from '../lib/themeMusic'
import { isSfxMuted, toggleSfx, playToggle } from '../lib/soundFx'
import './AppHeader.css'

export function AppHeader() {
  const { displayName, isGuest, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const onCoursePage = location.pathname === '/quest'
  const courseTarget = '/quest'

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  function goIntro() {
    navigate('/')
  }

  function goCourse() {
    navigate(courseTarget)
  }

  // Move focus to the page's main region (works on any page with a <main>).
  function skipToMain(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    const main = document.querySelector('main')
    if (main) {
      main.setAttribute('tabindex', '-1')
      ;(main as HTMLElement).focus()
      main.scrollIntoView({ block: 'start' })
    }
  }

  return (
    <header className="app-header">
      <a className="skip-link" href="#main-content" onClick={skipToMain}>
        Skip to main content
      </a>
      <div className="container app-header-inner">
        <Brand to="/" onNavigate={goIntro} />
        <div className="app-header-right">
          {!onCoursePage && (
            <button
              type="button"
              className="btn ghost app-header-course"
              aria-label="Go to Code City"
              onClick={goCourse}
            >
              <IconCompass size={16} />
              <span className="app-header-course-label">Code City</span>
            </button>
          )}
          <AudioSettings />
          <span className="app-header-user">
            {isGuest ? 'Guest' : displayName}
          </span>
          {isGuest ? (
            <Link className="btn app-header-signin" to="/auth">
              Sign in
            </Link>
          ) : (
            <button className="btn ghost app-header-signout" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

/** Compact audio popover: Music + Sound-effects toggles, accessible. */
function AudioSettings() {
  const [open, setOpen] = useState(false)
  const [musicMuted, setMusicMuted] = useState(() => isMusicMuted())
  const [sfxMuted, setSfxMuted] = useState(() => isSfxMuted())
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Close on outside-click and Escape; restore focus to the trigger on Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleMusic() {
    const nowMuted = toggleMusic()
    setMusicMuted(nowMuted)
  }

  function handleSfx() {
    const nowMuted = toggleSfx()
    setSfxMuted(nowMuted)
    // A subtle confirmation tick only when turning sound back ON.
    if (!nowMuted) playToggle(true)
  }

  // The trigger reflects overall audio state: muted only when BOTH are off.
  const allMuted = musicMuted && sfxMuted

  return (
    <div className="app-audio" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="btn ghost app-audio-btn"
        aria-label="Audio settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {allMuted ? <IconSpeakerOff size={16} /> : <IconSpeaker size={16} />}
      </button>

      {open && (
        <div className="app-audio-pop" role="menu" aria-label="Audio settings">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={!musicMuted}
            className={`app-audio-row ${musicMuted ? '' : 'is-on'}`}
            onClick={handleMusic}
          >
            <span className="app-audio-row-label">
              {musicMuted ? <IconSpeakerOff size={16} /> : <IconSpeaker size={16} />}
              Music
            </span>
            <span className="app-audio-state">{musicMuted ? 'Off' : 'On'}</span>
          </button>

          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={!sfxMuted}
            className={`app-audio-row ${sfxMuted ? '' : 'is-on'}`}
            onClick={handleSfx}
          >
            <span className="app-audio-row-label">
              {sfxMuted ? <IconSpeakerOff size={16} /> : <IconSpeaker size={16} />}
              Sound effects
            </span>
            <span className="app-audio-state">{sfxMuted ? 'Off' : 'On'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
