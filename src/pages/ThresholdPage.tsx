import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ThresholdScene, type ThresholdSceneHandle } from '../components/game3d/ThresholdScene'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { startCinematicMusic, stopCinematicMusic } from '../lib/cinematicMusic'
import { resolveThresholdAccessWithShowcase } from '../lib/showcaseOverride'
import { playClick } from '../lib/soundFx'
import {
  THRESHOLD_TITLE,
  THRESHOLD_SUBTITLE,
  THRESHOLD_CAPTIONS,
  GATE_PROMPT,
} from '../content/finalGauntletLore'
import './ThresholdPage.css'

/**
 * THE THRESHOLD — the liminal void crossed after VEX falls. A pure cinematic
 * crossing: a full-bleed 3D rail flythrough (`ThresholdScene`) with cinematic
 * DOM overlays on top:
 *
 *   travel  -> timed title card + lower-third captions during the ~19s flight
 *   gate    -> a minimal "Step through the Gate" moment
 *   entering-> gate opens, UI fades, scene pushes through to white
 *
 * The zone is only marked complete via `onEnter` (after the gate push-through),
 * which fires `completeInterZone()` then routes to the Mastery Trial.
 */

const ACCENT = '#37e6ff'
// The title card fades out a few seconds into the flight.
const TITLE_HOLD_MS = 4200

type Phase = 'travel' | 'gate' | 'entering'

export default function ThresholdPage() {
  const navigate = useNavigate()
  const { isShowcaseAccount } = useAuth()
  const { ready, academyCampaignComplete, completeInterZone } = useProgress()
  const access = resolveThresholdAccessWithShowcase(
    isShowcaseAccount,
    ready,
    academyCampaignComplete,
  )

  const sceneRef = useRef<ThresholdSceneHandle>(null)
  const [phase, setPhase] = useState<Phase>('travel')
  const [captionIdx, setCaptionIdx] = useState(-1)
  const [titleVisible, setTitleVisible] = useState(true)

  // One-shot guards for the scene's callbacks.
  const arrivedRef = useRef(false)
  const enteredRef = useRef(false)

  // Score the crossing with the ethereal cue (respects the global mute).
  useEffect(() => {
    if (access.status !== 'allowed') return
    startCinematicMusic('threshold')
    return () => stopCinematicMusic()
  }, [access.status])

  // Timed title-card fade + synced captions during the flythrough. Cleared on
  // unmount so timers never fire against a stale component.
  useEffect(() => {
    if (access.status !== 'allowed') return
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setTitleVisible(false), TITLE_HOLD_MS))
    THRESHOLD_CAPTIONS.forEach((cap, i) => {
      timers.push(setTimeout(() => setCaptionIdx(i), cap.atMs ?? 0))
    })
    return () => timers.forEach(clearTimeout)
  }, [access.status])

  function handleArrive() {
    if (arrivedRef.current) return
    arrivedRef.current = true
    // Only the natural flythrough end advances travel -> gate; if the player
    // already skipped ahead, keep whatever phase they're in.
    setPhase((p) => (p === 'travel' ? 'gate' : p))
  }

  function handleEnter() {
    if (enteredRef.current) return
    enteredRef.current = true
    completeInterZone()
    navigate('/final/exam', { replace: true })
  }

  function stepThroughGate() {
    playClick()
    setTitleVisible(false)
    setPhase('entering')
    sceneRef.current?.openGate()
  }

  function skipToGate() {
    setTitleVisible(false)
    setPhase('gate')
  }

  // Accessibility escape hatch — still routes through completion, but skips the
  // cinematic gate push-through entirely.
  function skipToTrial() {
    if (enteredRef.current) return
    enteredRef.current = true
    completeInterZone()
    navigate('/final/exam', { replace: true })
  }

  // Only redirect once durable progress has finished hydrating.
  if (access.status === 'loading') {
    return <Loader label="Restoring Threshold progress" night />
  }
  if (access.status === 'redirect') {
    return <Navigate to={access.to} replace />
  }

  const caption = captionIdx >= 0 ? THRESHOLD_CAPTIONS[captionIdx] : null

  return (
    <div className="thr-page">
      <ThresholdScene ref={sceneRef} accent={ACCENT} onArrive={handleArrive} onEnter={handleEnter} />

      {/* ---- TRAVEL: title card + lower-third captions ---- */}
      {phase === 'travel' && (
        <>
          <div className={`thr-title ${titleVisible ? 'is-in' : 'is-out'}`} aria-hidden={!titleVisible}>
            <span className="thr-title-tag">A Threshold Opens</span>
            <h1 className="thr-title-name">{THRESHOLD_TITLE}</h1>
            <p className="thr-title-sub">{THRESHOLD_SUBTITLE}</p>
          </div>

          <div className="thr-captions" aria-live="polite">
            {caption && (
              <p key={captionIdx} className="thr-caption">
                {caption.text}
              </p>
            )}
          </div>

          <div className="thr-skip-row">
            <button type="button" className="thr-skip" onClick={skipToGate}>
              Skip ahead
            </button>
            <button type="button" className="thr-skip thr-skip--minor" onClick={skipToTrial}>
              Skip to Trial
            </button>
          </div>
        </>
      )}

      {/* ---- GATE: minimal step-through moment ---- */}
      {phase === 'gate' && (
        <div className="thr-gate" role="dialog" aria-label="The Gate">
          <div className="thr-gate-inner">
            <span className="thr-gate-tag">The Gate</span>
            <p className="thr-gate-line">
              The seam thins to nothing. Beyond it waits everything you came to prove.
            </p>
            <button type="button" className="thr-btn thr-btn--primary" onClick={stepThroughGate}>
              {GATE_PROMPT}
            </button>
            <button type="button" className="thr-skip thr-skip--minor" onClick={skipToTrial}>
              Skip to Trial
            </button>
          </div>
        </div>
      )}

      {/* ---- ENTERING: brief hint while the gate blooms ---- */}
      {phase === 'entering' && (
        <div className="thr-entering" aria-hidden="true">
          <p className="thr-entering-hint">Stepping through&hellip;</p>
        </div>
      )}
    </div>
  )
}
