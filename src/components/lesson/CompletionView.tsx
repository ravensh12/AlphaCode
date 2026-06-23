import { Link } from 'react-router-dom'
import type { LessonResult } from '../../hooks/useLessonEngine'
import { masteryBand, bandLabel } from '../../lib/mastery'
import { MASTERY_UNLOCK_THRESHOLD } from '../../content/catalog'
import { getBadge, type BadgeId } from '../../content/badges'
import { IconTrophy, IconGauge, IconFlame, IconArrowRight } from '../icons'
import { ReviewBreakdown } from './ReviewBreakdown'

export function CompletionView({
  result,
  streakCurrent,
  lessonTitle,
  nextLessonTitle,
  isLastLesson,
  isGuest,
  isReview,
  badges,
  onNext,
  onReturn,
  onReplay,
  onRedoMissed,
}: {
  result: LessonResult
  streakCurrent: number
  lessonTitle: string
  nextLessonTitle: string | null
  isLastLesson: boolean
  isGuest: boolean
  isReview: boolean
  badges: BadgeId[]
  onNext?: () => void
  onReturn: () => void
  onReplay: () => void
  onRedoMissed: () => void
}) {
  const band = masteryBand(result.masteryScore)
  const unlocked = result.unlockNext
  const courseComplete = isLastLesson && unlocked
  // Guests can't progress past the preview level — they get a sign-up CTA.
  const canAdvance = unlocked && !isLastLesson && !!onNext && !isGuest

  const reviews = result.stepReviews
  const missedCount = reviews.filter((s) => s.missed).length

  const headline = isReview
    ? missedCount === 0
      ? 'All cleared!'
      : 'Good practice'
    : courseComplete
      ? 'Course complete!'
      : band === 'strong'
        ? 'Great job!'
        : 'Lesson complete!'

  return (
    <div className="completion">
      <div className="completion-badge" aria-hidden="true">
        <IconTrophy size={40} />
      </div>
      <h1 className="completion-title">{headline}</h1>
      <p className="muted completion-sub">
        {isReview ? (
          <>
            You retried the questions you missed in{' '}
            <strong>{lessonTitle}</strong>.
          </>
        ) : (
          <>
            You traced every line of <strong>{lessonTitle}</strong>.
          </>
        )}
      </p>

      <div className="completion-stats">
        <div className="completion-stat">
          <IconGauge size={20} />
          <span className="completion-stat-value">{result.masteryScore}%</span>
          <span className="completion-stat-label">Mastery</span>
        </div>
        <div className="completion-stat">
          <span className="completion-accuracy">{result.accuracy}%</span>
          <span className="completion-stat-value-sm" aria-hidden="true" />
          <span className="completion-stat-label">Accuracy</span>
        </div>
        <div className="completion-stat">
          <span className="completion-attempts">{result.totalAttempts}</span>
          <span className="completion-stat-label">Attempts</span>
        </div>
        <div className="completion-stat">
          <IconFlame size={20} />
          <span className="completion-stat-value">{streakCurrent}</span>
          <span className="completion-stat-label">Day streak</span>
        </div>
      </div>

      {!isReview && (
        <div className={`completion-band band-${band}`}>{bandLabel(band)}</div>
      )}

      {badges.length > 0 && (
        <div className="completion-badges">
          <p className="completion-badges-title">Badges earned</p>
          <div className="badge-row">
            {badges.map((id) => {
              const badge = getBadge(id)
              if (!badge) return null
              const { Icon, label, description } = badge
              return (
                <div
                  key={id}
                  className={`badge-chip tone-${badge.tone}`}
                  title={description}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {reviews.length > 0 && <ReviewBreakdown reviews={reviews} />}

      {!isReview && (
        <div
          className={`completion-unlock ${isGuest ? 'locked' : unlocked ? 'unlocked' : 'locked'}`}
        >
          {isGuest ? (
            <p>
              <strong>Preview complete!</strong> Sign up free to unlock{' '}
              {nextLessonTitle ?? 'the rest of the course'} and the other levels.
            </p>
          ) : courseComplete ? (
            <p>
              <strong>You finished the whole course.</strong> You can trace
              variables, output, conditions, loops, and bugs.
            </p>
          ) : unlocked ? (
            <p>
              <strong>Next unlocked:</strong>{' '}
              {nextLessonTitle ?? 'the next lesson'}
            </p>
          ) : (
            <p>
              <strong>Review recommended.</strong> Reach{' '}
              {MASTERY_UNLOCK_THRESHOLD}% mastery to unlock the next lesson —
              you're at {result.masteryScore}%.
            </p>
          )}
        </div>
      )}

      <div className="completion-actions">
        {missedCount > 0 && (
          <button className="btn lg" onClick={onRedoMissed}>
            Redo missed ({missedCount})
            <IconArrowRight size={18} />
          </button>
        )}

        {isReview ? (
          <button className="btn ghost lg" onClick={onReturn}>
            Back to course
          </button>
        ) : isGuest ? (
          <>
            {missedCount === 0 && (
              <Link className="btn lg lime" to="/auth">
                Sign up to unlock
                <IconArrowRight size={18} />
              </Link>
            )}
            <button className="btn ghost lg" onClick={onReplay}>
              Play again
            </button>
          </>
        ) : canAdvance ? (
          <>
            {missedCount === 0 && (
              <button className="btn lg lime" onClick={onNext}>
                Next lesson
                <IconArrowRight size={18} />
              </button>
            )}
            <button className="btn ghost lg" onClick={onReturn}>
              Back to course
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost lg" onClick={onReturn}>
              Return to course
            </button>
            <button className="btn ghost lg" onClick={onReplay}>
              Play again
            </button>
          </>
        )}
      </div>

      {!isReview && canAdvance && missedCount > 0 && (
        <button className="btn-text" onClick={onNext}>
          Skip review · go to {nextLessonTitle ?? 'next lesson'}
        </button>
      )}

      {isGuest && (
        <p className="completion-guest muted">
          No account needed to try — sign up to keep your streak, badges, and
          mastery.
        </p>
      )}
    </div>
  )
}
