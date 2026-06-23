import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import type { ExperienceLevel } from '../types/progress'
import { IconSprout, IconBolt, IconCap, IconCheck } from '../components/icons'
import type { ComponentType } from 'react'
import './OnboardingPage.css'

const OPTIONS: {
  id: ExperienceLevel
  title: string
  sub: string
  Icon: ComponentType<{ size?: number; className?: string }>
}[] = [
  {
    id: 'new',
    title: 'I am brand new to Python',
    sub: "We'll start from the very beginning.",
    Icon: IconSprout,
  },
  {
    id: 'some',
    title: 'I know a little Python',
    sub: 'A quick refresher on how code runs.',
    Icon: IconBolt,
  },
  {
    id: 'class',
    title: 'I am taking a Python class',
    sub: 'Build the tracing skills your class assumes.',
    Icon: IconCap,
  },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const { displayName } = useAuth()
  const { setExperienceLevel } = useProgress()
  const [selected, setSelected] = useState<ExperienceLevel | null>(null)

  function handleContinue() {
    if (selected) setExperienceLevel(selected)
    navigate('/start')
  }

  return (
    <div className="page onboarding">
      <div className="container onboarding-top">
        <Brand to="/home" />
      </div>

      <main className="container onboarding-main">
        <div className="onboarding-head">
          <span className="eyebrow">Welcome{displayName ? `, ${displayName}` : ''}</span>
          <h1 className="onboarding-title">Where are you starting from?</h1>
          <p className="muted">
            This just helps us set the tone. You can change topics anytime.
          </p>
        </div>

        <div className="onboarding-options">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`onboarding-option card ${selected === opt.id ? 'selected' : ''}`}
              onClick={() => setSelected(opt.id)}
              aria-pressed={selected === opt.id}
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

        <button
          className="btn lg onboarding-continue"
          disabled={!selected}
          onClick={handleContinue}
        >
          Continue
        </button>
      </main>
    </div>
  )
}
