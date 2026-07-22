import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { useProgress } from '../context/ProgressContext'
import { usePlayerLevel } from '../context/PlayerLevelContext'
import { answerXp } from '../lib/playerLevel'
import { buildWarmupSession } from '../lib/warmup'
import { playCorrect, playWrong } from '../lib/soundFx'
import type { ConceptId } from '../types/lesson'
import { IconCheck, IconCompass } from '../components/icons'
import {
  NEETCODE_150_PROBLEM_BY_ID,
} from '../content/curricula/neetcode150'
import { academyMissionPath } from '../lib/academyQuest'
import { isMissionRetentionDue } from '../lib/academyProgress'
import type { ProblemSummary } from '../types/curriculum'
import type { AcademyProgressState } from '../types/academy'
import './WarmupPage.css'

const CONCEPT_LABEL: Record<ConceptId, string> = {
  variables: 'Variables',
  loops: 'Loops',
  arrays: 'Arrays',
  strings: 'Strings',
  hashMaps: 'Hash Maps',
  twoPointers: 'Two Pointers',
  stacks: 'Stacks',
  binarySearch: 'Binary Search',
}

export function WarmupPage() {
  const navigate = useNavigate()
  const {
    learnerModel,
    recordConceptResult,
    dueProblemIds,
    academyProgress,
  } = useProgress()
  const { addXp } = usePlayerLevel()

  // Build the spaced + interleaved session once per visit.
  const session = useMemo(() => buildWarmupSession(learnerModel, 6), [learnerModel])
  const dueAcademy = useMemo(() => {
    const ids = new Set(
      dueProblemIds.filter((id) => id.startsWith('problem:')),
    )
    for (const problemId of Object.keys(academyProgress.missionPractices)) {
      if (
        isMissionRetentionDue(
          academyProgress,
          problemId as `problem:${string}`,
          Date.now(),
        )
      ) {
        ids.add(problemId as `problem:${string}`)
      }
    }
    return [...ids]
      .map((id) => NEETCODE_150_PROBLEM_BY_ID.get(id as `problem:${string}`))
      .filter((problem): problem is ProblemSummary => !!problem)
      .slice(0, 8)
  }, [academyProgress, dueProblemIds])

  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)

  const q = session[index]

  function choose(choiceIndex: number) {
    if (picked != null || !q) return
    const correct = choiceIndex === q.answerIndex
    setPicked(choiceIndex)
    // Retrieval outcome feeds the Leitner scheduler (reschedules this concept).
    recordConceptResult({ conceptIds: [q.concept], firstTry: true, correct })
    if (correct) {
      setCorrectCount((c) => c + 1)
      addXp(answerXp(true, true, 2500))
      playCorrect()
    } else {
      playWrong()
    }
  }

  function next() {
    if (index + 1 >= session.length) {
      setDone(true)
    } else {
      setIndex((i) => i + 1)
      setPicked(null)
    }
  }

  // No practiced history yet — nothing to retrieve.
  if (session.length === 0 && dueAcademy.length === 0) {
    return (
      <div className="page">
        <AppHeader />
        <main className="container warmup-main" id="main-content">
          <section className="warmup-card warmup-empty">
            <h1>Nothing to review yet</h1>
            <p>
              Warm-ups use <strong>spaced retrieval</strong> — quick recall of concepts you’ve
              already learned, resurfaced right before you’d forget them. Play a lesson first and
              they’ll start showing up here.
            </p>
            <Link className="btn" to="/quest">
              <IconCompass size={16} /> Enter Code City
            </Link>
          </section>
        </main>
      </div>
    )
  }

  if (session.length === 0) {
    return (
      <div className="page">
        <AppHeader />
        <main className="container warmup-main" id="main-content">
          <AcademyDueLinks
            problems={dueAcademy}
            academyProgress={academyProgress}
          />
        </main>
      </div>
    )
  }

  if (done) {
    return (
      <div className="page">
        <AppHeader />
        <main className="container warmup-main" id="main-content">
          <AcademyDueLinks
            problems={dueAcademy}
            academyProgress={academyProgress}
          />
          <section className="warmup-card warmup-results">
            <span className="warmup-eyebrow">Core primer complete</span>
            <h1>
              {correctCount} / {session.length} recalled
            </h1>
            <p>
              Nice retrieval. Each concept you practiced just got rescheduled — the ones you nailed
              come back later, the ones you missed come back soon. Spacing it out is what makes it
              stick.
            </p>
            <div className="warmup-results-actions">
              <button className="btn" onClick={() => navigate('/quest')}>
                Play Code City
              </button>
              <Link className="btn ghost" to="/profile">
                See my profile
              </Link>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const revealed = picked != null

  return (
    <div className="page">
      <AppHeader />
      <main className="container warmup-main" id="main-content">
        <AcademyDueLinks
          problems={dueAcademy}
          academyProgress={academyProgress}
        />
        <div className="warmup-progress" aria-label={`Question ${index + 1} of ${session.length}`}>
          {session.map((_, i) => (
            <span
              key={i}
              className={`warmup-pip ${i < index ? 'is-done' : i === index ? 'is-now' : ''}`}
            />
          ))}
        </div>

        <section className="warmup-card">
          <span className="warmup-eyebrow">
            Core primer · {CONCEPT_LABEL[q.concept]}
          </span>
          <h1 className="warmup-q">{q.prompt}</h1>

          <div className="warmup-choices">
            {q.choices.map((choice, i) => {
              const isAnswer = i === q.answerIndex
              const isPicked = i === picked
              const cls = revealed
                ? isAnswer
                  ? 'is-right'
                  : isPicked
                    ? 'is-wrong'
                    : 'is-dim'
                : ''
              return (
                <button
                  key={i}
                  className={`warmup-choice ${cls}`}
                  disabled={revealed}
                  onClick={() => choose(i)}
                >
                  {choice}
                  {revealed && isAnswer && <IconCheck size={16} />}
                </button>
              )
            })}
          </div>

          {revealed && (
            <div className="warmup-feedback">
              <p className={picked === q.answerIndex ? 'is-right' : 'is-wrong'}>
                {picked === q.answerIndex
                  ? 'Correct — that recall just strengthened the memory.'
                  : `The answer is “${q.choices[q.answerIndex]}.” You’ll see this concept again soon.`}
              </p>
              <button className="btn warmup-next" onClick={next}>
                {index + 1 >= session.length ? 'Finish' : 'Next'}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function AcademyDueLinks({
  problems,
  academyProgress,
}: {
  problems: readonly ProblemSummary[]
  academyProgress: AcademyProgressState
}) {
  if (problems.length === 0) return null
  return (
    <section className="warmup-card" aria-labelledby="academy-due-title">
      <span className="warmup-eyebrow">Academy mastery · FSRS v1</span>
      <h1 id="academy-due-title">Due academy practice</h1>
      <p>
        These links use the active academy problem schedule. Retention checks
        appear only after their policy wait.
      </p>
      <div className="warmup-results-actions">
        {problems.map((problem) => {
          const retentionDue = isMissionRetentionDue(
            academyProgress,
            problem.id,
            Date.now(),
          )
          const path = academyMissionPath(
            problem.realmId,
            problem.trackId,
            problem.leetcodeSlug,
          )
          return (
            <Link
              key={problem.id}
              className="btn ghost"
              to={retentionDue ? `${path}?mode=retention` : path}
            >
              {retentionDue ? `Retain ${problem.title}` : problem.title}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
