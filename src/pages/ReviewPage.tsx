import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { hasLesson } from '../content/lessons'
import { LESSON_CATALOG } from '../content/catalog'
import { useProgress } from '../context/ProgressContext'
import { IconArrowLeft, IconArrowRight, IconGauge, IconTrophy } from '../components/icons'
import {
  ReviewBreakdown,
  stepToReview,
} from '../components/lesson/ReviewBreakdown'
import { LessonNotice, LessonRound } from './LessonPage'
import type { LessonResult } from '../hooks/useLessonEngine'
import type { Lesson } from '../types/lesson'
import './LessonPage.css'

export function ReviewPage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const {
    ready,
    getLessonProgress,
    saveLessonProgress,
    logAttempt,
    streak,
  } = useProgress()

  const [reviewMode, setReviewMode] = useState(false)
  const [reviewRound, setReviewRound] = useState(0)
  const quizResultRef = useRef<LessonResult | null>(null)

  if (!lessonId || !hasLesson(lessonId)) {
    return (
      <LessonNotice
        title="Lesson not found"
        message="This lesson isn't part of the course. Head back to pick one from your learning path."
      />
    )
  }

  if (!ready) return <Loader label="Loading your review" />

  const summary = LESSON_CATALOG.find((l) => l.id === lessonId)
  const lessonTitle = summary?.title ?? 'Lesson'
  const progress = getLessonProgress(lessonId)
  const review = progress?.lastReview
  const missedIds = review?.missedStepIds ?? []

  if (reviewMode && missedIds.length > 0 && review) {
    const steps = review.steps.filter((s) => missedIds.includes(s.id))
    const redoLesson = {
      id: lessonId,
      title: lessonTitle,
      description: '',
      pattern: summary?.pattern ?? '',
      estimatedMinutes: 0,
      conceptTags: summary?.conceptTags ?? [],
      unlockRequirements: {},
      steps,
    } satisfies Lesson
    return (
      <LessonRound
        key={`${reviewRound}:${missedIds.join('|')}`}
        lesson={redoLesson}
        section="quiz"
        isReview
        initial={progress}
        quizResultRef={quizResultRef}
        onSave={saveLessonProgress}
        onAttempt={logAttempt}
        streakCurrent={streak.current}
        nextLessonTitle={null}
        isLastLesson={false}
        onExit={() => navigate('/home')}
        onTakeQuiz={() => navigate(`/lesson/${lessonId}/quiz`)}
        onReplay={() => {
          setReviewMode(false)
          navigate(`/lesson/${lessonId}/quiz`)
        }}
        onRedoMissed={(ids) => {
          if (ids.length) setReviewRound((r) => r + 1)
        }}
        onReviewMasteryReached={() => setReviewMode(false)}
      />
    )
  }

  if (!progress || progress.status !== 'completed' || !review) {
    return (
      <div className="page">
        <AppHeader />
        <main className="container lp">
          <div className="lp-top">
            <Link to="/home" className="lp-exit" aria-label="Back to course">
              <IconArrowLeft size={18} />
            </Link>
          </div>
          <div className="card lp-missing-card review-empty">
            <h1>Nothing to review yet</h1>
            <p className="muted">
              Play <strong>{lessonTitle}</strong> once and your results will show
              up here so you can see what you got right and redo what you missed.
            </p>
            <Link className="btn lg" to={`/lesson/${lessonId}/quiz`}>
              Play lesson
              <IconArrowRight size={18} />
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const reviews = review.steps.map((s) =>
    stepToReview(s, review.missedStepIds.includes(s.id)),
  )
  const missedCount = missedIds.length

  return (
    <div className="page">
      <AppHeader />
      <main className="container lp">
        <div className="lp-top">
          <Link to="/home" className="lp-exit" aria-label="Back to course">
            <IconArrowLeft size={18} />
          </Link>
        </div>

        <div className="review-page">
          <h1 className="review-page-title">Review · {lessonTitle}</h1>
          <p className="muted review-page-sub">
            {missedCount > 0
              ? 'Here’s how your last run went. Redo the ones you missed to raise your mastery.'
              : 'You aced every question last time. Replay anytime for fresh puzzles.'}
          </p>

          <div className="completion-stats">
            <div className="completion-stat">
              <IconGauge size={20} />
              <span className="completion-stat-value">
                {progress.masteryScore}%
              </span>
              <span className="completion-stat-label">Mastery</span>
            </div>
            <div className="completion-stat">
              <span className="completion-accuracy">{progress.accuracy}%</span>
              <span className="completion-stat-value-sm" aria-hidden="true" />
              <span className="completion-stat-label">Accuracy</span>
            </div>
            <div className="completion-stat">
              <IconTrophy size={20} />
              <span className="completion-stat-value">{reviews.length}</span>
              <span className="completion-stat-label">Questions</span>
            </div>
          </div>

          <ReviewBreakdown reviews={reviews} />

          <div className="completion-actions">
            {missedCount > 0 && (
              <button className="btn lg" onClick={() => setReviewMode(true)}>
                Redo missed ({missedCount})
                <IconArrowRight size={18} />
              </button>
            )}
            <Link className="btn ghost lg" to={`/lesson/${lessonId}/quiz`}>
              Replay full lesson
            </Link>
            <Link className="btn ghost lg" to="/home">
              Back to course
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
