import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { LessonResult } from '../../hooks/useLessonEngine'
import { playVictory } from '../../lib/soundFx'
import { Confetti } from '../Confetti'
import { CountUp } from '../CountUp'
import { masteryBand, bandLabel } from '../../lib/mastery'
import { MASTERY_UNLOCK_THRESHOLD } from '../../content/catalog'
import { getNeetCodeReadiness } from '../../content/neetcodeReadiness'
import { getBadge, BADGE_ORDER, type BadgeCounts } from '../../content/badges'
import { IconTrophy, IconGauge, IconFlame, IconArrowRight } from '../icons'
import { ReviewBreakdown } from './ReviewBreakdown'
import { NeetCodeReadinessPanel } from './NeetCodeReadinessPanel'
import { ReviewTutor, type ReviewTutorItem } from '../ReviewTutor'

export function CompletionView({
  result,
  streakCurrent,
  lessonId,
  lessonTitle,
  nextLessonTitle,
  isLastLesson,
  isGuest,
  reviewCleared,
  badgeCounts,
  onNext,
  onReturn,
  onReplay,
}: {
  result: LessonResult
  streakCurrent: number
  lessonId: string
  lessonTitle: string
  nextLessonTitle: string | null
  isLastLesson: boolean
  isGuest: boolean
  reviewCleared?: boolean
  badgeCounts: BadgeCounts
  onNext?: () => void
  onReturn: () => void
  onReplay: () => void
}) {
  // Celebrate when the completion screen appears.
  useEffect(() => {
    playVictory()
  }, [])

  const band = masteryBand(result.masteryScore)
  const unlocked = result.unlockNext
  const courseComplete = isLastLesson && unlocked
  const canAdvance = unlocked && !isLastLesson && !!onNext && !isGuest

  const reviews = result.stepReviews
  const readiness = getNeetCodeReadiness(lessonId)

  // Bit review helper — missed questions first so the most useful one is default.
  const tutorItems: ReviewTutorItem[] = [...reviews]
    .sort((a, b) => Number(b.missed) - Number(a.missed))
    .map((s, i) => ({
      label: `Q${i + 1}${s.missed ? ' · missed' : ''}`,
      context: {
        prompt: s.prompt,
        code: s.code,
        concept: lessonTitle,
        hint: '',
        answered: true,
      },
    }))

  const headline = reviewCleared
    ? 'Review complete!'
    : courseComplete
      ? 'Primer complete!'
      : band === 'strong'
        ? 'Great job!'
        : 'Quiz complete!'

  return (
    <div className="completion">
      <Confetti count={90} />
      <div className="completion-badge" aria-hidden="true">
        <IconTrophy size={40} />
      </div>
      <h1 className="completion-title">{headline}</h1>
      <p className="muted completion-sub">
        {reviewCleared ? (
          <>
            You cleared every missed question in{' '}
            <strong>{lessonTitle}</strong>.
          </>
        ) : (
          <>
            You finished the quiz on <strong>{lessonTitle}</strong> — one core
            pattern down.
          </>
        )}
      </p>

      <div className="completion-stats">
        <div className="completion-stat">
          <IconGauge size={20} />
          <span className="completion-stat-value">
            <CountUp end={result.masteryScore} suffix="%" />
          </span>
          <span className="completion-stat-label">Mastery</span>
        </div>
        <div className="completion-stat">
          <span className="completion-accuracy">
            <CountUp end={result.accuracy} suffix="%" />
          </span>
          <span className="completion-stat-value-sm" aria-hidden="true" />
          <span className="completion-stat-label">Accuracy</span>
        </div>
        <div className="completion-stat">
          <span className="completion-attempts">
            <CountUp end={result.totalAttempts} />
          </span>
          <span className="completion-stat-label">Attempts</span>
        </div>
        <div className="completion-stat">
          <IconFlame size={20} />
          <span className="completion-stat-value">
            <CountUp end={streakCurrent} />
          </span>
          <span className="completion-stat-label">Day streak</span>
        </div>
      </div>

      <div className={`completion-band band-${band}`}>{bandLabel(band)}</div>

      {Object.values(badgeCounts).some((n) => n > 0) && (
        <div className="completion-badges">
          <p className="completion-badges-title">Badges earned this run</p>
          <div className="badge-row">
            {BADGE_ORDER.filter((id) => badgeCounts[id] > 0).map((id) => {
              const count = badgeCounts[id]
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
                  <span className="badge-count">×{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {reviews.length > 0 && <ReviewBreakdown reviews={reviews} />}

      {tutorItems.length > 0 && <ReviewTutor items={tutorItems} />}

      {readiness && <NeetCodeReadinessPanel readiness={readiness} />}

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
            <strong>You finished the historical six-lesson primer.</strong> The
            durable Academy campaign contains 150 missions across 18 topics and
            6 realms.
          </p>
        ) : unlocked ? (
          <p>
            <strong>Next unlocked:</strong>{' '}
            {nextLessonTitle ?? 'the next lesson'}
          </p>
        ) : (
          <p>
            <strong>Keep reviewing.</strong> You&apos;re at {result.masteryScore}
            % — reach {MASTERY_UNLOCK_THRESHOLD}% by getting missed questions
            right. Each one you clear raises your score.
          </p>
        )}
      </div>

      <div className="completion-actions">
        {isGuest ? (
          <>
            {canAdvance && (
              <Link className="btn lg lime" to="/auth">
                Sign up to unlock
                <IconArrowRight size={18} />
              </Link>
            )}
            <button type="button" className="btn ghost lg" onClick={onReplay}>
              Restart quiz
            </button>
            <button type="button" className="btn ghost lg" onClick={onReturn}>
              Back to course
            </button>
          </>
        ) : canAdvance ? (
          <>
            <button type="button" className="btn lg lime" onClick={onNext}>
              Next lesson
              <IconArrowRight size={18} />
            </button>
            <button type="button" className="btn ghost lg" onClick={onReplay}>
              Restart quiz
            </button>
            <button type="button" className="btn ghost lg" onClick={onReturn}>
              Back to course
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn ghost lg" onClick={onReplay}>
              Restart quiz
            </button>
            <button type="button" className="btn ghost lg" onClick={onReturn}>
              Back to course
            </button>
          </>
        )}
      </div>

      {isGuest && (
        <p className="completion-guest muted">
          No account needed to try — sign up to keep your streak, badges, and
          mastery.
        </p>
      )}
    </div>
  )
}
