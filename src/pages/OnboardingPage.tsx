import { useMemo, useState } from 'react'
import type { ComponentType } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import type { ExperienceLevel } from '../types/progress'
import { LESSON_CATALOG } from '../content/catalog'
import { getWorld } from '../content/adventure'
import { skipToLevel } from '../lib/questSession'
import { playClick } from '../lib/soundFx'
import {
  IconArrowRight,
  IconBolt,
  IconCap,
  IconCheck,
  IconSprout,
} from '../components/icons'
import './OnboardingPage.css'

type IconType = ComponentType<{ size?: number; className?: string }>

const LEVEL_OPTIONS: {
  id: ExperienceLevel
  title: string
  sub: string
  Icon: IconType
}[] = [
  {
    id: 'new',
    title: 'I am brand new to Python',
    sub: "We'll build the core patterns before NeetCode-style problems.",
    Icon: IconSprout,
  },
  {
    id: 'some',
    title: 'I know a little Python',
    sub: 'Sharpen tracing skills before interview-style practice.',
    Icon: IconBolt,
  },
  {
    id: 'class',
    title: 'I am taking a Python class',
    sub: 'Build the pattern skills NeetCode 150 assumes you know.',
    Icon: IconCap,
  },
]

const LOOP_CODE = [
  'nums = [4, 8, 2]',
  'big = nums[0]',
  'for n in nums:',
  '    if n > big:',
  '        big = n',
  'print(big)',
]

const LOOP_CHOICES = ['4', '8', '2', '14']
const LOOP_ANSWER = 1

const HASH_CHOICES = [
  'Check every pair with nested loops',
  "Remember the numbers you've already seen (a hash set/map)",
  'Sort the list, then binary search',
  'Reverse the list',
]
const HASH_ANSWER = 1

const TOTAL_STEPS = 3

/** Catalog index → starting lesson, per the placement mapping. */
function startIndexFor(level: ExperienceLevel, score: number): number {
  if (level === 'new') return 0
  if (level === 'some') return score === 2 ? 2 : score === 1 ? 1 : 0
  return score === 2 ? 3 : score === 1 ? 2 : 1
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { displayName } = useAuth()
  const { completePlacement } = useProgress()

  const [step, setStep] = useState(0)
  const [level, setLevel] = useState<ExperienceLevel | null>(null)
  const [loopChoice, setLoopChoice] = useState<number | null>(null)
  const [hashChoice, setHashChoice] = useState<number | null>(null)
  const [showResult, setShowResult] = useState(false)

  const result = useMemo(() => {
    if (!level) return null
    const score = (loopChoice === LOOP_ANSWER ? 1 : 0) + (hashChoice === HASH_ANSWER ? 1 : 0)
    const index = Math.max(
      0,
      Math.min(LESSON_CATALOG.length - 1, startIndexFor(level, score)),
    )
    const startLessonId = LESSON_CATALOG[index].id
    return { level, index, startLessonId, worldName: getWorld(startLessonId)?.name }
  }, [level, loopChoice, hashChoice])

  const canAdvance =
    (step === 0 && level !== null) ||
    (step === 1 && loopChoice !== null) ||
    (step === 2 && hashChoice !== null)

  function handleNext() {
    if (!canAdvance) return
    playClick()
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1)
    else setShowResult(true)
  }

  function handleBack() {
    if (showResult) {
      setShowResult(false)
      return
    }
    setStep((s) => Math.max(0, s - 1))
  }

  function enterCity() {
    if (!result) return
    completePlacement(result.level, result.startLessonId)
    // Drop the player onto the quest MAP, positioned at the placed level.
    skipToLevel(result.index)
    navigate('/quest')
  }

  function startFromBeginning() {
    completePlacement(level ?? 'new', 'arrays-and-loops')
    skipToLevel(0)
    navigate('/quest')
  }

  return (
    <div className="page onboarding">
      <div className="container onboarding-top">
        <Brand to="/" />
      </div>

      <main className="container onboarding-main">
        {!showResult && (
          <Steps current={step} total={TOTAL_STEPS} />
        )}

        {showResult && result ? (
          <ResultPanel
            displayName={displayName}
            levelNum={result.index + 1}
            worldName={result.worldName}
            topic={LESSON_CATALOG[result.index]?.title}
            onEnter={enterCity}
            onBeginning={startFromBeginning}
          />
        ) : step === 0 ? (
          <section className="onboarding-step">
            <div className="onboarding-head">
              <span className="eyebrow">Quick check-in{displayName ? `, ${displayName}` : ''}</span>
              <h1 className="onboarding-title">Where are you starting from?</h1>
              <p className="muted">
                Three quick questions help us pick your first world. No pressure &mdash;
                this isn&rsquo;t a test.
              </p>
            </div>

            <div className="onboarding-options">
              {LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  className={`onboarding-option card ${level === opt.id ? 'selected' : ''}`}
                  onClick={() => setLevel(opt.id)}
                  aria-pressed={level === opt.id}
                >
                  <span className="onboarding-emoji" aria-hidden="true">
                    <opt.Icon size={24} />
                  </span>
                  <span className="onboarding-option-text">
                    <strong>{opt.title}</strong>
                    <span className="muted">{opt.sub}</span>
                  </span>
                  <span className="onboarding-check" aria-hidden="true">
                    <IconCheck size={16} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : step === 1 ? (
          <section className="onboarding-step">
            <div className="onboarding-head">
              <span className="eyebrow">Warm-up · loops</span>
              <h1 className="onboarding-title">What does this print?</h1>
              <p className="muted">Trace it line by line &mdash; take your best guess.</p>
            </div>

            <CodeBlock lines={LOOP_CODE} />

            <ChoiceGrid
              columns
              choices={LOOP_CHOICES}
              selected={loopChoice}
              onSelect={setLoopChoice}
              ariaLabel="What does this code print?"
            />
          </section>
        ) : (
          <section className="onboarding-step">
            <div className="onboarding-head">
              <span className="eyebrow">Warm-up · patterns</span>
              <h1 className="onboarding-title">Pick the fastest approach</h1>
              <p className="muted">
                You want to know if two numbers in a list add up to 10, in a single
                pass. The fastest approach is to&hellip;
              </p>
            </div>

            <ChoiceGrid
              choices={HASH_CHOICES}
              selected={hashChoice}
              onSelect={setHashChoice}
              ariaLabel="The fastest approach is to"
            />
          </section>
        )}

        {!showResult && (
          <div className="onboarding-nav">
            <button
              className="btn ghost onboarding-back"
              onClick={handleBack}
              disabled={step === 0}
            >
              Back
            </button>
            <button
              className="btn lg onboarding-continue"
              disabled={!canAdvance}
              onClick={handleNext}
            >
              {step < TOTAL_STEPS - 1 ? 'Continue' : 'See my start'}
              <IconArrowRight size={18} />
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function Steps({ current, total }: { current: number; total: number }) {
  return (
    <div className="onboarding-steps" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`onboarding-step-dot ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <div className="onboarding-code" role="img" aria-label="Python code">
      <div className="onboarding-code-bar" aria-hidden="true">
        <span className="onboarding-code-dot" />
        <span className="onboarding-code-dot" />
        <span className="onboarding-code-dot" />
        <span className="onboarding-code-name">main.py</span>
      </div>
      <pre className="onboarding-code-lines">
        {lines.map((line, i) => (
          <div key={i} className="onboarding-code-line">
            <span className="onboarding-code-ln">{i + 1}</span>
            <code>{line}</code>
          </div>
        ))}
      </pre>
    </div>
  )
}

function ChoiceGrid({
  choices,
  selected,
  onSelect,
  ariaLabel,
  columns,
}: {
  choices: string[]
  selected: number | null
  onSelect: (i: number) => void
  ariaLabel: string
  columns?: boolean
}) {
  return (
    <div
      className={`onboarding-choices ${columns ? 'cols' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {choices.map((choice, i) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={selected === i}
          className={`onboarding-choice card ${selected === i ? 'selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <span className="onboarding-choice-text">{choice}</span>
          <span className="onboarding-choice-check" aria-hidden="true">
            <IconCheck size={15} />
          </span>
        </button>
      ))}
    </div>
  )
}

function ResultPanel({
  displayName,
  levelNum,
  worldName,
  topic,
  onEnter,
  onBeginning,
}: {
  displayName: string | null
  levelNum: number
  worldName?: string
  topic?: string
  onEnter: () => void
  onBeginning: () => void
}) {
  return (
    <section className="onboarding-result card">
      <span className="onboarding-result-badge" aria-hidden="true">
        <IconCheck size={30} />
      </span>
      <h1 className="onboarding-title">
        You&rsquo;re set{displayName ? `, ${displayName}` : ''}!
      </h1>
      <p className="onboarding-result-line">
        We&rsquo;ve unlocked Code City up to{' '}
        <strong>
          Level {levelNum} · {worldName ?? 'Scanner Valley'}
          {topic ? ` (${topic})` : ''}
        </strong>
        . You&apos;ll spawn at that level&apos;s first checkpoint.
      </p>
      <div className="onboarding-result-actions">
        <button className="btn lg onboarding-enter" onClick={onEnter}>
          Enter Code City
          <IconArrowRight size={18} />
        </button>
        <button className="onboarding-beginning" onClick={onBeginning}>
          Start from the very beginning
        </button>
      </div>
    </section>
  )
}
