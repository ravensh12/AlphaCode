import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { IntroCinematic, CINEMATIC_DURATION } from '../components/game3d/IntroCinematic'
import { IconArrowRight, IconTrophy } from '../components/icons'
import { startCinematicMusic, stopCinematicMusic } from '../lib/cinematicMusic'
import './IntroPage.css'

/** Scripted overlay captions, keyed to the cinematic clock (seconds since mount). */
type Caption = { t: number; kind: 'title' | 'line'; text: string }

const CAPTIONS: Caption[] = [
  { t: 0.4, kind: 'title', text: 'Code City has fallen' },
  { t: 3.2, kind: 'line', text: 'The patterns that ran it — scattered.' },
  { t: 7.2, kind: 'line', text: 'You and CodeBot are all that’s left.' },
  { t: 12.2, kind: 'line', text: 'Master the 6 patterns. Take back the city.' },
]

/** When the hero title card + CTA appear, and when the whole thing auto-advances. */
const CTA_AT = 16.2
const END_AT = CINEMATIC_DURATION + 1.6

export function IntroPage() {
  const navigate = useNavigate()
  const finish = useCallback(() => navigate('/onboarding'), [navigate])

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
      for (let i = 0; i < CAPTIONS.length; i++) {
        if (t >= CAPTIONS[i].t) idx = i
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

  const caption = CAPTIONS[captionIdx]

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
        <button className="intro-cine-skip" onClick={finish}>
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

      {/* Final title card — styled to match the quiz UI (paper card, ink border). */}
      {showCard && (
        <div className="intro-cine-cardwrap" key="card">
          <section className="intro-cine-card card">
            <span className="intro-cine-badge" aria-hidden="true">
              <IconTrophy size={30} />
            </span>
            <span className="intro-cine-eyebrow">Your mission begins</span>
            <h1 className="intro-cine-logo">
              Alpha<span>Code</span>
            </h1>
            <p className="intro-cine-tag">Six patterns. Six bosses. Take back the city.</p>
            <button className="btn lg intro-cine-cta" onClick={finish}>
              Begin training
              <IconArrowRight size={18} />
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
