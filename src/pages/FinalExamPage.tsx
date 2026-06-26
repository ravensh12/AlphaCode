import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { AiTutorPanel } from '../components/final/AiTutorPanel'
import { useProgress } from '../context/ProgressContext'
import { useGauntlet } from '../context/GauntletContext'
import { FINAL_EXAM } from '../content/finalExam'
import { gradeFor, isConceptMastered, EXAM_PASS_PERCENT } from '../lib/gauntletProgress'
import type { ExamQuestion } from '../types/finalGauntlet'
import { IconCheck, IconX, IconArrowRight, IconArrowLeft, IconBolt } from '../components/icons'
import './FinalExamPage.css'

/* ------------------------------------------------------------- helpers */

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Reorder questions so no two adjacent share a concept (keeps interleaving strong). */
function interleave(questions: ExamQuestion[]): ExamQuestion[] {
  const pool = shuffle(questions)
  const out: ExamQuestion[] = []
  while (pool.length) {
    const last = out[out.length - 1]
    let idx = pool.findIndex((q) => !last || q.concept !== last.concept)
    if (idx === -1) idx = 0
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

type AnswerValue =
  | { kind: 'none' }
  | { kind: 'choice'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'order'; value: string[] }

function checkAnswer(q: ExamQuestion, answer: AnswerValue): boolean {
  switch (q.type) {
    case 'mcq':
      return answer.kind === 'choice' && answer.value === q.answerIndex
    case 'recall':
    case 'predict': {
      if (answer.kind !== 'text') return false
      const got = normalize(answer.value)
      if (!got) return false
      if (q.inputMode === 'numeric') {
        const n = Number(got.replace(/[^0-9.+-]/g, ''))
        return q.accept.some((a) => Number(a) === n)
      }
      return q.accept.some((a) => normalize(a) === got)
    }
    case 'order':
      return (
        answer.kind === 'order' &&
        answer.value.length === q.steps.length &&
        answer.value.every((stepText, i) => stepText === q.steps[i])
      )
  }
}

type Prepared = {
  choices?: { text: string; originalIndex: number }[]
  shuffledSteps?: string[]
}

function buildPrepared(questions: ExamQuestion[]): Record<string, Prepared> {
  const out: Record<string, Prepared> = {}
  for (const q of questions) {
    if (q.type === 'mcq') {
      out[q.id] = { choices: shuffle(q.choices.map((text, originalIndex) => ({ text, originalIndex }))) }
    } else if (q.type === 'order') {
      out[q.id] = { shuffledSteps: shuffle(q.steps) }
    } else {
      out[q.id] = {}
    }
  }
  return out
}

const TOTAL = FINAL_EXAM.length

/* ------------------------------------------------------------- page */

export function FinalExamPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reviewMode = searchParams.get('mode') === 'review'
  const { allLessonsComplete, readyForFinalGauntlet } = useProgress()
  const { recordOutcome, completeExam } = useGauntlet()

  // A fresh attempt re-shuffles question + choice order.
  const [attempt, setAttempt] = useState(0)
  const order = useMemo(() => interleave([...FINAL_EXAM]), [attempt])
  const prepared = useMemo(() => buildPrepared(order), [order])

  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [hintForId, setHintForId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'taking' | 'review'>('taking')
  const usedHelp = useRef<Set<string>>(new Set())
  const committed = useRef(false)

  // Score the whole attempt (only meaningful once submitted).
  const results = useMemo(() => {
    const detail = order.map((q) => {
      const given = answers[q.id] ?? ({ kind: 'none' } as AnswerValue)
      return { q, given, correct: checkAnswer(q, given) }
    })
    const correctCount = detail.filter((d) => d.correct).length
    const percent = order.length > 0 ? Math.round((correctCount / order.length) * 100) : 0
    return { detail, correctCount, percent, passed: percent >= EXAM_PASS_PERCENT }
  }, [order, answers])

  // Commit results once when the learner submits (delayed: nothing recorded mid-test).
  useEffect(() => {
    if (phase !== 'review' || committed.current) return
    committed.current = true
    for (const d of results.detail) {
      recordOutcome({
        questionId: d.q.id,
        concept: d.q.concept,
        firstTryCorrect: d.correct,
        attempts: 1,
        usedHint: usedHelp.current.has(d.q.id),
      })
    }
    completeExam(results.percent)
  }, [phase, results, recordOutcome, completeExam])

  // Gate the Mastery Trial behind both Code City and The Threshold. Worlds not
  // done -> back to the quest; worlds done but Threshold not -> The Threshold.
  if (!readyForFinalGauntlet) {
    return <Navigate to={allLessonsComplete ? '/threshold' : '/quest'} replace />
  }

  /* ---------------- read-only study review (from the levels gauntlet) ------ */
  if (reviewMode) {
    return (
      <div className="page fx-page">
        <AppHeader />
        <div className="fx-shell fx-shell--review">
          <div className="fx-results">
            <span className="fx-grade fx-grade-gold">Study Review</span>
            <h1>Mastery Trial — answers &amp; explanations</h1>
            <p className="fx-results-sub">
              Every question with the correct answer and the why behind it. No score here — just study,
              then retake when you&rsquo;re ready.
            </p>
            <div className="fx-results-actions">
              <Link className="fx-btn fx-btn-primary fx-btn-lg" to="/final/exam">
                Retake the trial <IconArrowRight size={18} />
              </Link>
              <Link className="fx-btn fx-btn-ghost" to="/final/boss">
                Final boss <IconArrowRight size={16} />
              </Link>
              <Link className="fx-btn fx-btn-ghost" to="/quest/list">
                Back to levels
              </Link>
            </div>
          </div>

          <h2 className="fx-review-title">All questions</h2>
          <ol className="fx-review-list">
            {FINAL_EXAM.map((q, i) => (
              <li key={q.id} className="fx-review-item is-correct">
                <div className="fx-review-head">
                  <span className="fx-review-num">{i + 1}</span>
                  <span className="fx-concept">{q.conceptLabel}</span>
                  <span className="fx-type">{labelForType(q.type)}</span>
                </div>
                <p className="fx-review-prompt">{q.prompt}</p>
                {q.code && q.code.length > 0 && (
                  <pre className="fx-code">
                    {q.code.map((line, j) => (
                      <code key={j}>{line || ' '}</code>
                    ))}
                  </pre>
                )}
                <div className="fx-review-answers">
                  <p className="fx-review-correct">
                    <span>Correct:</span> {renderCorrect(q)}
                  </p>
                </div>
                <p className="fx-review-explain">{q.explanation}</p>
              </li>
            ))}
          </ol>

          <div className="fx-results-actions fx-results-actions--bottom">
            <Link className="fx-btn fx-btn-primary fx-btn-lg" to="/final/exam">
              Retake the trial <IconArrowRight size={18} />
            </Link>
            <Link className="fx-btn fx-btn-ghost" to="/quest/list">
              Back to levels
            </Link>
          </div>
        </div>
      </div>
    )
  }

  /* ---------------- review screen ---------------- */
  if (phase === 'review') {
    return (
      <div className="page fx-page">
        <AppHeader />
        <FinalExamReview
          detail={results.detail}
          percent={results.percent}
          passed={results.passed}
          prepared={prepared}
          onRetry={() => {
            committed.current = false
            usedHelp.current = new Set()
            setAnswers({})
            setIndex(0)
            setHintForId(null)
            setPhase('taking')
            setAttempt((a) => a + 1)
          }}
          onBoss={() => navigate('/final/boss')}
        />
      </div>
    )
  }

  /* ---------------- taking screen ---------------- */
  const current = order[index]
  const answer = answers[current.id] ?? (current.type === 'order' ? { kind: 'order', value: [] } : { kind: 'none' })
  const answeredCount = order.filter((q) => hasAnswer(answers[q.id] ?? { kind: 'none' }, q)).length
  const isLast = index === order.length - 1
  const canAdvance = hasAnswer(answer, current)
  const hintUnlocked = current.difficulty <= 2 // scaffolding fades on the hardest items
  const showHint = hintForId === current.id

  function setCurrentAnswer(a: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [current.id]: a }))
  }

  return (
    <div className="page fx-page">
      <AppHeader />

      <div className="fx-shell">
        <main className="fx-main">
          <header className="fx-progress">
            <div className="fx-progress-bar">
              <span style={{ width: `${Math.round((answeredCount / TOTAL) * 100)}%` }} />
            </div>
            <span className="fx-progress-label">
              Question {index + 1} of {TOTAL}
            </span>
            <button
              type="button"
              className="fx-skip-test"
              title="Testing shortcut: mark the trial passed and jump to the boss"
              onClick={() => {
                completeExam(100)
                navigate('/final/boss')
              }}
            >
              Skip test → Boss
            </button>
          </header>

          <p className="fx-no-feedback-note">
            Answer everything first — your results and full explanations come at the end.
          </p>

          <div className="fx-card">
            <div className="fx-card-top">
              <span className="fx-concept">{current.conceptLabel}</span>
              <span className={`fx-diff fx-diff-${current.difficulty}`}>
                {['', 'Warm-up', 'Challenge', 'Hard'][current.difficulty]}
              </span>
              <span className="fx-type">{labelForType(current.type)}</span>
            </div>

            <h2 className="fx-prompt">{current.prompt}</h2>

            {current.code && current.code.length > 0 && (
              <pre className="fx-code">
                {current.code.map((line, i) => (
                  <code key={i}>{line || ' '}</code>
                ))}
              </pre>
            )}

            <AnswerArea
              question={current}
              prepared={prepared[current.id]}
              answer={answer}
              setAnswer={setCurrentAnswer}
              answered={false}
            />

            {hintUnlocked ? (
              <div className="fx-hint-row">
                {showHint ? (
                  <p className="fx-hint">{current.hint}</p>
                ) : (
                  <button
                    type="button"
                    className="fx-hint-btn"
                    onClick={() => {
                      setHintForId(current.id)
                      usedHelp.current.add(current.id)
                    }}
                  >
                    Need a hint?
                  </button>
                )}
              </div>
            ) : (
              <p className="fx-hint-locked">
                No hint on this one — give it your best. Ask Bit if you&rsquo;re truly stuck.
              </p>
            )}

            <div className="fx-actions">
              <button
                type="button"
                className="fx-btn fx-btn-ghost"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <IconArrowLeft size={16} /> Back
              </button>
              {!isLast ? (
                <button
                  type="button"
                  className="fx-btn fx-btn-primary"
                  onClick={() => setIndex((i) => Math.min(order.length - 1, i + 1))}
                  disabled={!canAdvance}
                >
                  Next <IconArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="fx-btn fx-btn-primary"
                  onClick={() => setPhase('review')}
                  disabled={answeredCount < TOTAL}
                  title={answeredCount < TOTAL ? 'Answer every question first' : 'See your results'}
                >
                  Finish &amp; see results <IconArrowRight size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="fx-dots" aria-hidden="true">
            {order.map((q, i) => (
              <span
                key={q.id}
                className={`fx-dot ${i === index ? 'is-current' : ''} ${hasAnswer(answers[q.id] ?? { kind: 'none' }, q) ? 'is-answered' : ''}`}
              />
            ))}
          </div>
        </main>

        <aside className="fx-aside">
          <AiTutorPanel
            context={{
              prompt: current.prompt,
              code: current.code,
              concept: current.conceptLabel,
              hint: current.hint,
              answered: false,
            }}
          />
          <div className="fx-aside-note">
            <IconBolt size={14} /> Bit nudges your thinking — it won&rsquo;t tell you if you&rsquo;re right.
          </div>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- subviews */

function labelForType(t: ExamQuestion['type']): string {
  return t === 'mcq'
    ? 'Choose one'
    : t === 'recall'
      ? 'Recall'
      : t === 'predict'
        ? 'Predict output'
        : 'Order the steps'
}

function hasAnswer(a: AnswerValue, q: ExamQuestion): boolean {
  if (a.kind === 'choice') return true
  if (a.kind === 'text') return a.value.trim().length > 0
  if (a.kind === 'order' && q.type === 'order') return a.value.length === q.steps.length
  return false
}

function AnswerArea({
  question,
  prepared,
  answer,
  setAnswer,
  answered,
}: {
  question: ExamQuestion
  prepared: Prepared
  answer: AnswerValue
  setAnswer: (a: AnswerValue) => void
  answered: boolean
}) {
  if (question.type === 'mcq') {
    return (
      <div className="fx-choices">
        {prepared.choices?.map((c) => {
          const selected = answer.kind === 'choice' && answer.value === c.originalIndex
          const cls = answered ? '' : selected ? 'is-selected' : ''
          return (
            <button
              key={c.originalIndex}
              type="button"
              className={`fx-choice ${cls}`}
              disabled={answered}
              onClick={() => setAnswer({ kind: 'choice', value: c.originalIndex })}
            >
              {c.text}
            </button>
          )
        })}
      </div>
    )
  }

  if (question.type === 'recall' || question.type === 'predict') {
    return (
      <div className="fx-input-wrap">
        <input
          className="fx-input"
          type="text"
          inputMode={question.inputMode === 'numeric' ? 'numeric' : 'text'}
          placeholder={question.placeholder ?? (question.inputMode === 'numeric' ? 'Type the number' : 'Type your answer')}
          value={answer.kind === 'text' ? answer.value : ''}
          disabled={answered}
          onChange={(e) => setAnswer({ kind: 'text', value: e.target.value })}
        />
      </div>
    )
  }

  // order
  const chosen = answer.kind === 'order' ? answer.value : []
  const remaining = (prepared.shuffledSteps ?? question.steps).filter((s) => !chosen.includes(s))
  return (
    <div className="fx-order">
      <ol className="fx-order-slots">
        {chosen.map((step, i) => (
          <li key={step} className="fx-order-slot">
            <span className="fx-order-num">{i + 1}</span>
            {step}
            <button
              type="button"
              className="fx-order-x"
              aria-label="Remove"
              onClick={() => setAnswer({ kind: 'order', value: chosen.filter((s) => s !== step) })}
            >
              <IconX size={13} />
            </button>
          </li>
        ))}
        {chosen.length === 0 && <li className="fx-order-empty">Tap steps below in order…</li>}
      </ol>
      {remaining.length > 0 && (
        <div className="fx-order-bank">
          {remaining.map((step) => (
            <button
              key={step}
              type="button"
              className="fx-order-chip"
              onClick={() => setAnswer({ kind: 'order', value: [...chosen, step] })}
            >
              {step}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type ReviewItem = { q: ExamQuestion; given: AnswerValue; correct: boolean }

function FinalExamReview({
  detail,
  percent,
  passed,
  prepared,
  onRetry,
  onBoss,
}: {
  detail: ReviewItem[]
  percent: number
  passed: boolean
  prepared: Record<string, Prepared>
  onRetry: () => void
  onBoss: () => void
}) {
  const { state } = useGauntlet()
  const grade = gradeFor(percent)
  const concepts = useMemo(
    () =>
      Object.values(state.concepts)
        .map((c) => ({ concept: c.concept, mastered: isConceptMastered(c), seen: c.seen }))
        .filter((c) => c.seen > 0),
    [state.concepts],
  )

  return (
    <div className="fx-shell fx-shell--review">
      <div className="fx-results">
        <span className={`fx-grade fx-grade-${passed ? grade.tier : 'bronze'}`}>
          {passed ? grade.label : 'Not yet — keep training'}
        </span>
        <h1>{passed ? 'Mastery Trial passed!' : 'Mastery Trial — review & retry'}</h1>
        <p className="fx-results-sub">
          You scored <strong>{percent}%</strong>. {passed
            ? `You cleared the ${EXAM_PASS_PERCENT}% mastery bar — the final boss awaits.`
            : `You need ${EXAM_PASS_PERCENT}% to advance. Review the explanations below, then retry.`}
        </p>

        <div className="fx-results-concepts">
          {concepts.map((c) => (
            <span key={c.concept} className={`fx-concept-pip ${c.mastered ? 'is-mastered' : ''}`}>
              {c.mastered ? <IconCheck size={13} /> : null}
              {conceptShort(c.concept)}
            </span>
          ))}
        </div>

        <div className="fx-results-actions">
          {passed ? (
            <button type="button" className="fx-btn fx-btn-primary fx-btn-lg" onClick={onBoss}>
              Face the Final Boss <IconArrowRight size={18} />
            </button>
          ) : (
            <button type="button" className="fx-btn fx-btn-primary fx-btn-lg" onClick={onRetry}>
              Retry the trial <IconArrowRight size={18} />
            </button>
          )}
          <Link className="fx-btn fx-btn-ghost" to="/quest">Leave</Link>
        </div>
      </div>

      <h2 className="fx-review-title">Review — every question explained</h2>
      <ol className="fx-review-list">
        {detail.map(({ q, given, correct }, i) => (
          <li key={q.id} className={`fx-review-item ${correct ? 'is-correct' : 'is-wrong'}`}>
            <div className="fx-review-head">
              <span className="fx-review-num">{i + 1}</span>
              <span className="fx-concept">{q.conceptLabel}</span>
              <span className={`fx-review-mark ${correct ? 'is-correct' : 'is-wrong'}`}>
                {correct ? <><IconCheck size={14} /> Correct</> : <><IconX size={14} /> Missed</>}
              </span>
            </div>
            <p className="fx-review-prompt">{q.prompt}</p>
            {q.code && q.code.length > 0 && (
              <pre className="fx-code">
                {q.code.map((line, j) => (
                  <code key={j}>{line || ' '}</code>
                ))}
              </pre>
            )}
            <div className="fx-review-answers">
              {!correct && (
                <p className="fx-review-yours">
                  <span>Your answer:</span> {renderAnswer(q, given, prepared[q.id]) || <em>blank</em>}
                </p>
              )}
              <p className="fx-review-correct">
                <span>Correct:</span> {renderCorrect(q)}
              </p>
            </div>
            <p className="fx-review-explain">{q.explanation}</p>
          </li>
        ))}
      </ol>

      <div className="fx-results-actions fx-results-actions--bottom">
        {passed ? (
          <button type="button" className="fx-btn fx-btn-primary fx-btn-lg" onClick={onBoss}>
            Face the Final Boss <IconArrowRight size={18} />
          </button>
        ) : (
          <button type="button" className="fx-btn fx-btn-primary fx-btn-lg" onClick={onRetry}>
            Retry the trial <IconArrowRight size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

function renderAnswer(q: ExamQuestion, given: AnswerValue, prep: Prepared): string {
  if (q.type === 'mcq') {
    if (given.kind !== 'choice') return ''
    const found = prep.choices?.find((c) => c.originalIndex === given.value)
    return found?.text ?? q.choices[given.value] ?? ''
  }
  if (q.type === 'recall' || q.type === 'predict') {
    return given.kind === 'text' ? given.value : ''
  }
  if (q.type === 'order') {
    return given.kind === 'order' ? given.value.join(' → ') : ''
  }
  return ''
}

function renderCorrect(q: ExamQuestion): string {
  if (q.type === 'mcq') return q.choices[q.answerIndex]
  if (q.type === 'recall' || q.type === 'predict') return q.accept[0]
  if (q.type === 'order') return q.steps.join(' → ')
  return ''
}

function conceptShort(c: string): string {
  const map: Record<string, string> = {
    arrays: 'Arrays',
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
