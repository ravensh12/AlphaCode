import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useGauntlet } from '../context/GauntletContext'
import type { ConceptId } from '../types/lesson'
import { IconCheck, IconArrowRight, IconBolt } from '../components/icons'
import { resolveFinalGauntletAccessWithShowcase } from '../lib/showcaseOverride'
import { createGauntletEventId } from '../lib/gauntletProgress'
import './FinalJourneyPage.css'

/**
 * "The Ascent" — the journey beyond Code City. A short series of interleaved
 * warm-up retrieval trials sampled from academy foundations. They activate
 * prior knowledge before the high-stakes 18-topic certification trial.
 * Low stakes by design: retrieval practice that warms the mind for the exam.
 */

type Trial = {
  concept: ConceptId
  label: string
  prompt: string
  choices: string[]
  answerIndex: number
  explain: string
}

const TRIALS: Trial[] = [
  {
    concept: 'arrays',
    label: 'The Scanning Gate',
    prompt: 'To find the largest value in a list of 5 numbers, how many items must a loop check?',
    choices: ['All 5', 'Just the first', 'Just the last', 'Only the middle'],
    answerIndex: 0,
    explain: 'A scan has to look at every element — you can\u2019t know the max without checking each one.',
  },
  {
    concept: 'strings',
    label: 'The Letter Span',
    prompt: 'In the string "code", which index holds the first character?',
    choices: ['0', '1', '4', 'c'],
    answerIndex: 0,
    explain: 'Strings are 0-indexed: s[0] is the first character, s[1] the second, and so on.',
  },
  {
    concept: 'hashMaps',
    label: 'The Memory Vault',
    prompt: 'About how long does a hash map take to look up a stored value?',
    choices: ['One step', 'Every step', 'Half the steps', 'Two full passes'],
    answerIndex: 0,
    explain: 'Hash maps give roughly O(1) lookups — one step, no matter how many items are stored.',
  },
  {
    concept: 'twoPointers',
    label: 'The Twin Bridge',
    prompt: 'In the classic two-pointer pattern on a sorted array, where do the pointers start?',
    choices: ['At the two ends', 'Both in the middle', 'Both at the start', 'Random spots'],
    answerIndex: 0,
    explain: 'One pointer starts at the left end, the other at the right, and they move inward.',
  },
  {
    concept: 'stacks',
    label: 'The Tower Lock',
    prompt: 'You push A, then B, then C onto a stack. Which one pops off first?',
    choices: ['C', 'A', 'B', 'None'],
    answerIndex: 0,
    explain: 'A stack is LIFO — last in, first out — so the most recently pushed item (C) leaves first.',
  },
  {
    concept: 'binarySearch',
    label: 'The Halving Rift',
    prompt: 'Binary search only works when the data is…',
    choices: ['Sorted', 'Random', 'Reversed', 'Empty'],
    answerIndex: 0,
    explain: 'Halving relies on order: comparing to the middle only narrows the search if the data is sorted.',
  },
]

export function FinalJourneyPage() {
  const navigate = useNavigate()
  const { isShowcaseAccount } = useAuth()
  const { ready, academyCampaignComplete, readyForFinalGauntlet } =
    useProgress()
  const { ready: gauntletReady, recordOutcome } = useGauntlet()

  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [missed, setMissed] = useState(false)
  const [cleared, setCleared] = useState(0)
  const [journeyRunId] = useState(() => createGauntletEventId('journey'))
  const [saveError, setSaveError] = useState<string | null>(null)

  // The Final Gauntlet only opens after both Code City and The Threshold are
  // cleared. Worlds not done -> back to the quest; worlds done but Threshold
  // not -> route through The Threshold first. The showcase account may enter
  // at any time.
  const access = resolveFinalGauntletAccessWithShowcase(
    isShowcaseAccount,
    ready && gauntletReady,
    academyCampaignComplete,
    readyForFinalGauntlet,
  )
  if (access.status === 'loading') {
    return <Loader label="Restoring final journey progress" night />
  }
  if (access.status === 'redirect') {
    return <Navigate to={access.to} replace />
  }

  const summit = step >= TRIALS.length
  const trial = TRIALS[step]

  function choose(i: number) {
    if (picked !== null) return
    setPicked(i)
    const correct = i === trial.answerIndex
    if (!correct) setMissed(true)
  }

  async function next() {
    if (picked === null) return
    const correct = picked === trial.answerIndex
    if (correct) {
      try {
        await recordOutcome(`${journeyRunId}:${trial.concept}`, {
          questionId: `journey-${trial.concept}`,
          concept: trial.concept,
          firstTryCorrect: !missed,
          attempts: missed ? 2 : 1,
          usedHint: false,
        })
        setSaveError(null)
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : 'Journey progress could not be saved locally.',
        )
        return
      }
      setCleared((c) => c + 1)
      setStep((s) => s + 1)
      setPicked(null)
      setMissed(false)
    } else {
      // low-stakes retrieval: try again
      setPicked(null)
    }
  }

  return (
    <div className="page fj-page">
      <AppHeader />
      <div className="fj-sky" aria-hidden="true">
        <span className="fj-rift" />
      </div>

      <div className="fj-shell">
        <aside className="fj-path" aria-hidden="true">
          {TRIALS.map((t, i) => (
            <div key={t.concept} className={`fj-node ${i < cleared ? 'is-done' : ''} ${i === step ? 'is-active' : ''}`}>
              <span className="fj-node-dot">{i < cleared ? <IconCheck size={14} /> : i + 1}</span>
              <span className="fj-node-label">{t.label}</span>
            </div>
          ))}
          <div className={`fj-node fj-node-summit ${summit ? 'is-active' : ''}`}>
            <span className="fj-node-dot"><IconBolt size={14} /></span>
            <span className="fj-node-label">The Core</span>
          </div>
        </aside>

        <main className="fj-main">
          {!summit ? (
            <>
              <header className="fj-head">
                <span className="fj-tag">The Ascent · Trial {step + 1} of {TRIALS.length}</span>
                <h1>{trial.label}</h1>
                <p className="fj-sub">
                  Across 150 missions, you trained 18 topics. These quick
                  foundation gates sharpen a few core moves before the full
                  certification trial.
                </p>
              </header>

              <div className="fj-card">
                <span className="fj-concept">{conceptLabel(trial.concept)}</span>
                <h2 className="fj-prompt">{trial.prompt}</h2>
                <div className="fj-choices">
                  {trial.choices.map((c, i) => {
                    const isAnswer = i === trial.answerIndex
                    const isPicked = picked === i
                    const cls =
                      picked === null
                        ? ''
                        : isAnswer
                          ? 'is-correct'
                          : isPicked
                            ? 'is-wrong'
                            : ''
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`fj-choice ${cls}`}
                        disabled={picked !== null}
                        onClick={() => choose(i)}
                      >
                        {c}
                      </button>
                    )
                  })}
                </div>

                {picked !== null && (
                  <div className={`fj-feedback ${picked === trial.answerIndex ? 'is-correct' : 'is-wrong'}`}>
                    {picked === trial.answerIndex ? (
                      <>
                        <strong><IconCheck size={16} /> Reclaimed.</strong>
                        <p>{trial.explain}</p>
                      </>
                    ) : (
                      <>
                        <strong>Not yet — try again.</strong>
                        <p>{trial.explain}</p>
                      </>
                    )}
                    {saveError && <p role="alert">{saveError}</p>}
                    <button type="button" className="fj-btn fj-btn-primary" onClick={() => void next()}>
                      {picked === trial.answerIndex ? 'Climb higher' : 'Try again'}
                      <IconArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="fj-summit">
              <span className="fj-tag">The Summit</span>
              <h1>The Core awaits</h1>
              <p className="fj-sub">
                Your 150-mission campaign across all 18 topics led here. Ahead
                is the <strong>NeetCode 150 Certification Trial</strong> — 36
                interleaved recognition and transfer checks. Pass it, and the
                corrupted guardian itself will rise.
              </p>
              <div className="fj-summit-actions">
                <button type="button" className="fj-btn fj-btn-primary fj-btn-lg" onClick={() => navigate('/final/exam')}>
                  Enter the Certification Trial <IconArrowRight size={18} />
                </button>
                <Link className="fj-btn fj-btn-ghost" to="/quest">Not yet</Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function conceptLabel(c: ConceptId): string {
  const map: Record<string, string> = {
    arrays: 'Arrays & Loops',
    loops: 'Loops',
    strings: 'Strings',
    hashMaps: 'Hash Maps',
    twoPointers: 'Two Pointers',
    stacks: 'Stacks',
    binarySearch: 'Binary Search',
    variables: 'Variables',
  }
  return map[c] ?? c
}
