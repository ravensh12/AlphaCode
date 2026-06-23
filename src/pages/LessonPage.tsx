import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { generateLesson, hasLesson } from '../content/lessons'
import { LESSON_CATALOG } from '../content/catalog'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useLessonEngine } from '../hooks/useLessonEngine'
import type { Lesson, LessonStep } from '../types/lesson'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import { CodePanel } from '../components/lesson/CodePanel'
import { VariableBoxes } from '../components/lesson/VariableBoxes'
import { AnswerTiles } from '../components/lesson/AnswerTiles'
import { FeedbackPanel } from '../components/lesson/FeedbackPanel'
import { LevelTracker } from '../components/lesson/LevelTracker'
import { CompletionView } from '../components/lesson/CompletionView'
import { Loader } from '../components/Loader'
import { IconArrowLeft } from '../components/icons'
import './LessonPage.css'

function genTiles(step: LessonStep): number[] {
  const corrects = step.targetVariables
    .map((v) => step.expectedState[v])
    .filter((v): v is number => typeof v === 'number')
  const set = new Set<number>(corrects)
  for (const n of corrects) {
    for (const d of [n - 1, n + 1, n + 2, n - 2]) {
      if (d >= 0) set.add(d)
    }
  }
  let k = 3
  const base = corrects[0] ?? 5
  while (set.size < 6) {
    if (base + k >= 0) set.add(base + k)
    k++
  }
  const arr = [...set]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, 8)
}

export function LessonPage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { ready, lessons, saveLessonProgress, logAttempt, streak, isLessonUnlocked } =
    useProgress()

  if (!lessonId || !hasLesson(lessonId)) {
    return (
      <LessonNotice
        title="Lesson not found"
        message="This lesson isn't part of the course. Head back to pick one from your learning path."
      />
    )
  }

  if (!ready) {
    return <Loader label="Loading lesson" />
  }

  const catalogIndex = LESSON_CATALOG.findIndex((l) => l.id === lessonId)
  const summary = catalogIndex >= 0 ? LESSON_CATALOG[catalogIndex] : null

  // Guard direct-URL access to a lesson that isn't unlocked yet.
  if (summary && !isLessonUnlocked(summary)) {
    return (
      <LessonNotice
        title="Lesson locked"
        message={`Reach ${summary.unlockRequirements.minimumMastery ?? 75}% mastery on the previous lesson to unlock this one.`}
      />
    )
  }

  const nextSummary = LESSON_CATALOG[catalogIndex + 1] ?? null
  const isLastLesson = catalogIndex === LESSON_CATALOG.length - 1

  return (
    <LessonRunner
      key={lessonId}
      lessonId={lessonId}
      initial={lessons[lessonId]}
      onSave={saveLessonProgress}
      onAttempt={logAttempt}
      streakCurrent={streak.current}
      nextLessonTitle={nextSummary?.title ?? null}
      isLastLesson={isLastLesson}
      onNext={nextSummary ? () => navigate(`/lesson/${nextSummary.id}`) : undefined}
      onExit={() => navigate('/home')}
    />
  )
}

function LessonNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="page">
      <AppHeader />
      <main className="container lp-missing">
        <div className="card lp-missing-card">
          <h1>{title}</h1>
          <p className="muted">{message}</p>
          <Link className="btn" to="/home">
            Back to course
          </Link>
        </div>
      </main>
    </div>
  )
}

function LessonRunner({
  lessonId,
  initial,
  onSave,
  onAttempt,
  streakCurrent,
  nextLessonTitle,
  isLastLesson,
  onNext,
  onExit,
}: {
  lessonId: string
  initial?: LessonProgress
  onSave: (p: LessonProgress) => void
  onAttempt: (a: AttemptRecord) => void
  streakCurrent: number
  nextLessonTitle: string | null
  isLastLesson: boolean
  onNext?: () => void
  onExit: () => void
}) {
  // `round` bumps on replay/restart so a brand-new randomized lesson is built.
  const [round, setRound] = useState(0)
  const lesson = useMemo(() => {
    void round // re-generate fresh questions whenever the round changes
    return generateLesson(lessonId)!
  }, [lessonId, round])
  const replay = useCallback(() => setRound((r) => r + 1), [])

  return (
    <LessonRound
      key={round}
      lesson={lesson}
      // Only resume saved progress on the first round; replays start clean.
      initial={round === 0 ? initial : undefined}
      onSave={onSave}
      onAttempt={onAttempt}
      streakCurrent={streakCurrent}
      nextLessonTitle={nextLessonTitle}
      isLastLesson={isLastLesson}
      onNext={onNext}
      onExit={onExit}
      onReplay={replay}
    />
  )
}

function LessonRound({
  lesson,
  initial,
  onSave,
  onAttempt,
  streakCurrent,
  nextLessonTitle,
  isLastLesson,
  onNext,
  onExit,
  onReplay,
}: {
  lesson: Lesson
  initial?: LessonProgress
  onSave: (p: LessonProgress) => void
  onAttempt: (a: AttemptRecord) => void
  streakCurrent: number
  nextLessonTitle: string | null
  isLastLesson: boolean
  onNext?: () => void
  onExit: () => void
  onReplay: () => void
}) {
  // Guests are in "preview" mode: each visit/refresh starts fresh instead of
  // resuming a half-finished level. Accounts keep their saved place.
  const { isGuest } = useAuth()

  function handleSave(p: LessonProgress) {
    // Never downgrade a completed lesson back to in-progress.
    if (initial?.status === 'completed' && p.status !== 'completed') return
    onSave(p)
  }

  const engine = useLessonEngine(lesson, {
    initialProgress: initial,
    resume: !isGuest,
    onSave: handleSave,
    onAttempt,
  })

  // step object reference is stable per step, so tiles re-roll only on step change
  const tiles = useMemo(() => genTiles(engine.step), [engine.step])

  if (engine.isComplete && engine.result) {
    return (
      <div className="page">
        <AppHeader />
        <main className="container lp">
          <CompletionView
            result={engine.result}
            streakCurrent={streakCurrent}
            lessonTitle={lesson.title}
            nextLessonTitle={nextLessonTitle}
            isLastLesson={isLastLesson}
            isGuest={isGuest}
            onNext={onNext}
            onReturn={onExit}
            onReplay={onReplay}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="page">
      <AppHeader />
      <main className="container lp">
        <div className="lp-top">
          <Link to="/home" className="lp-exit" aria-label="Exit lesson">
            <IconArrowLeft size={18} />
          </Link>
          {!engine.isIntro && (
            <Link to="/home" className="levels-link" aria-label="View all levels">
              <LevelTracker
                current={engine.progressCurrent}
                total={engine.progressTotal}
              />
            </Link>
          )}
        </div>

        {engine.isIntro ? (
          <IntroView
            title={lesson.title}
            prompt={engine.step.prompt}
            code={engine.step.code}
            onStart={engine.next}
          />
        ) : (
          <StepView
            engine={engine}
            tiles={tiles}
            lessonStepCount={lesson.steps.length}
            onReplay={onReplay}
          />
        )}
      </main>
    </div>
  )
}

function IntroView({
  title,
  prompt,
  code,
  onStart,
}: {
  title: string
  prompt: string
  code: string[]
  onStart: () => void
}) {
  return (
    <div className="stage intro-view">
      <div className="stage-reveal stack-center">
        <h1 className="intro-title">{title}</h1>
        <p className="intro-prompt">{prompt}</p>
        <CodePanel code={code} />
        <button className="btn lg" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  )
}

function StepView({
  engine,
  tiles,
  lessonStepCount,
  onReplay,
}: {
  engine: ReturnType<typeof useLessonEngine>
  tiles: number[]
  lessonStepCount: number
  onReplay: () => void
}) {
  const { step, phase } = engine
  const isTrace = step.type === 'traceVariables'
  const isLast = engine.stepIndex === lessonStepCount - 1

  const runLabel = isTrace ? 'Run line' : 'Run program'
  const readyHint = isTrace
    ? 'Run the highlighted line to see what changes.'
    : 'Run the whole program to the end.'

  return (
    <div className="stage">
      <CodePanel
        code={step.code}
        currentLineIndex={step.currentLineIndex}
        showRunHint={isTrace && phase === 'ready'}
      />

      {phase === 'ready' && (
        <div className="stage-reveal stack-center" key={`ready-${engine.stepIndex}`}>
          <p className="stage-hint muted">{readyHint}</p>
          <button className="btn lg" onClick={engine.runStep}>
            {runLabel}
          </button>
        </div>
      )}

      {phase === 'failed' && (
        <div className="stage-reveal stack-center" key={`failed-${engine.stepIndex}`}>
          <FeedbackPanel feedback={engine.feedback} />
          <p className="failed-note muted">
            Two misses in a row — retrace this line to lock it in.
          </p>
          <button className="btn lg" onClick={engine.restartStep}>
            Retry level
          </button>
          <button className="btn-text" onClick={onReplay}>
            Restart lesson
          </button>
        </div>
      )}

      {(phase === 'answering' || phase === 'solved') && (
        <div className="stage-reveal" key={`answer-${engine.stepIndex}-${phase}`}>
          {phase === 'answering' && (
            <p className="stage-question">{step.prompt}</p>
          )}

          <VariableBoxes
            step={step}
            boxValues={engine.boxValues}
            activeVar={engine.activeVar}
            errorVars={engine.errorVars}
            locked={phase === 'solved'}
            onSetActive={engine.setActiveVar}
            onSetBox={engine.setBox}
          />

          {engine.feedback && <FeedbackPanel feedback={engine.feedback} />}

          {phase === 'answering' ? (
            <div className="stack-center answer-controls">
              <AnswerTiles
                tiles={tiles}
                disabled={false}
                onPick={engine.fillActive}
              />
              <button
                className="btn lg full"
                disabled={!engine.allFilled}
                onClick={engine.check}
              >
                Check
              </button>
            </div>
          ) : (
            <button className="btn lg lime full" onClick={engine.next}>
              {isLast ? 'Finish lesson' : 'Continue'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
