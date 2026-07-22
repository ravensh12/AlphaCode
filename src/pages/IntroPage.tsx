import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { IntroCinematic, CINEMATIC_DURATION } from '../components/game3d/IntroCinematic'
import { IconArrowRight, IconTrophy } from '../components/icons'
import { startCinematicMusic, stopCinematicMusic } from '../lib/cinematicMusic'
import './IntroPage.css'

/** Scripted overlay captions, keyed to the cinematic clock (seconds since mount). */
type Caption = { t: number; kind: 'title' | 'line'; text: string }

const INTRO_CAPTIONS: Caption[] = [
  { t: 0.4, kind: 'title', text: 'Welcome to Code City' },
  { t: 4.2, kind: 'line', text: 'Every district is a coding pattern to master.' },
  { t: 8.4, kind: 'line', text: 'Solve the checkpoints. Outsmart the bosses. Keep every pattern sharp.' },
  { t: 12, kind: 'line', text: '150 missions. 18 topics. One Code Master.' },
]

const INTRO_DESTINATION = '/quest'

const INTRO_MARKETING_COPY = {
  eyebrow: 'Enter the Living Code City',
  promise: 'Beat the full course to prove proficiency across NeetCode 150 patterns.',
  completion:
    'To beat AlphaCode: finish all 150 original missions, pass delayed retention checks, clear the assessment and boss in each of six realms, and pass the 18-topic Final Certification Trial.',
  cta: 'Begin the quest',
  independence: 'AlphaCode is independent and not affiliated with NeetCode or LeetCode.',
} as const

const INTRO_COURSE_FACTS = [
  { value: 150, label: 'Missions' },
  { value: 18, label: 'Topics' },
  { value: 6, label: 'Realms' },
] as const

/** When the hero title card + CTA appear, and when the whole thing auto-advances. */
const CTA_AT = 13.2
const END_AT = CINEMATIC_DURATION + 6

export function IntroFinalCard() {
  return (
    <section className="intro-cine-card card" aria-labelledby="intro-course-promise">
      <span className="intro-cine-badge" aria-hidden="true">
        <IconTrophy size={28} />
      </span>
      <span className="intro-cine-eyebrow">{INTRO_MARKETING_COPY.eyebrow}</span>
      <h1 className="intro-cine-promise" id="intro-course-promise">
        {INTRO_MARKETING_COPY.promise}
      </h1>

      <ul
        className="intro-cine-proof"
        aria-label="Course scope: 150 missions, 18 topics, 6 realms"
      >
        {INTRO_COURSE_FACTS.map((fact) => (
          <li key={fact.label}>
            <strong>{fact.value}</strong>
            <span>{fact.label}</span>
          </li>
        ))}
      </ul>

      <p className="intro-cine-completion">{INTRO_MARKETING_COPY.completion}</p>

      <Link className="btn lg intro-cine-cta" to={INTRO_DESTINATION}>
        {INTRO_MARKETING_COPY.cta}
        <IconArrowRight size={18} />
      </Link>

      <small className="intro-cine-independence">{INTRO_MARKETING_COPY.independence}</small>
    </section>
  )
}

export function IntroPage() {
  const navigate = useNavigate()
  const finish = useCallback(() => navigate(INTRO_DESTINATION), [navigate])

  // Caption index + CTA visibility are the only things that re-render the page;
  // they advance off a single timeline clock captured at mount, so the whole
  // sequence replays correctly every time the component mounts.
  const [captionIdx, setCaptionIdx] = useState(0)
  const [showCard, setShowCard] = useState(false)
  const finishedRef = useRef(false)

  // Score the cinematic with the dark-heroic cue (respects the global mute).
  useEffect(() => {
    startCinematicMusic('intro')
    return () => stopCinematicMusic()
  }, [])

  useEffect(() => {
    const startMs = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = (now - startMs) / 1000

      let idx = 0
      for (let i = 0; i < INTRO_CAPTIONS.length; i++) {
        if (t >= INTRO_CAPTIONS[i].t) idx = i
      }
      setCaptionIdx(idx)
      setShowCard(t >= CTA_AT)

      if (t >= END_AT) {
        if (!finishedRef.current) {
          finishedRef.current = true
          finish()
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [finish])

  const caption = INTRO_CAPTIONS[captionIdx]

  return (
    <div className="intro-cine">
      <div className="intro-cine-canvas">
        <IntroCinematic />
      </div>

      {/* Cinematic letterbox bars for a filmic frame. */}
      <div className="intro-bar intro-bar--top" aria-hidden="true" />
      <div className="intro-bar intro-bar--bottom" aria-hidden="true" />

      {/* Top bar: brand + persistent skip. */}
      <div className="intro-cine-top">
        <Brand to="/" />
        <button type="button" className="intro-cine-skip" onClick={finish}>
          Skip
        </button>
      </div>

      {/* Scripted captions over the action (hidden once the title card lands). */}
      {!showCard && (
        <div className="intro-cine-caption" aria-live="polite">
          <p
            key={captionIdx}
            className={`intro-cap ${caption.kind === 'title' ? 'intro-cap--title' : 'intro-cap--line'}`}
          >
            {caption.text}
          </p>
        </div>
      )}

      {/* Final title card and direct entry into Code City. */}
      {showCard && (
        <div className="intro-cine-cardwrap" key="card">
          <IntroFinalCard />
        </div>
      )}
    </div>
  )
}
