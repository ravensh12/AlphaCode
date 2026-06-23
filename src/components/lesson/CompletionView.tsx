import { Link } from 'react-router-dom'
import type { LessonResult } from '../../hooks/useLessonEngine'
import { masteryBand, bandLabel } from '../../lib/mastery'
import { MASTERY_UNLOCK_THRESHOLD } from '../../content/catalog'
import { IconTrophy, IconGauge, IconFlame, IconArrowRight } from '../icons'

export function CompletionView({
  result,
  streakCurrent,
  lessonTitle,
  nextLessonTitle,
  isLastLesson,
  isGuest,
  onNext,
  onReturn,
  onReplay,
}: {
  result: LessonResult
  streakCurrent: number
  lessonTitle: string
  nextLessonTitle: string | null
  isLastLesson: boolean
  isGuest: boolean
  onNext?: () => void
  onReturn: () => void
  onReplay: () => void
}) {
  const band = masteryBand(result.masteryScore)
  const unlocked = result.unlockNext
  const courseComplete = isLastLesson && unlocked
  const canAdvance = unlocked && !isLastLesson && !!onNext

  const headline = courseComplete
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
        You traced every line of <strong>{lessonTitle}</strong>.
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

      <div className={`completion-band band-${band}`}>{bandLabel(band)}</div>

      <div
        className={`completion-unlock ${unlocked ? 'unlocked' : 'locked'}`}
      >
        {courseComplete ? (
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
            {MASTERY_UNLOCK_THRESHOLD}% mastery to unlock the next lesson — you're
            at {result.masteryScore}%.
          </p>
        )}
      </div>

      <div className="completion-actions">
        {canAdvance ? (
          <>
            <button className="btn lg lime" onClick={onNext}>
              Next lesson
              <IconArrowRight size={18} />
            </button>
            <button className="btn ghost lg" onClick={onReturn}>
              Back to course
            </button>
          </>
        ) : (
          <>
            <button className="btn lg" onClick={onReturn}>
              Return to course
              <IconArrowRight size={18} />
            </button>
            <button className="btn ghost lg" onClick={onReplay}>
              Play again
            </button>
          </>
        )}
      </div>

      {canAdvance && (
        <button className="btn-text" onClick={onReplay}>
          Play this level again
        </button>
      )}

      {isGuest && (
        <p className="completion-guest muted">
          Playing as a guest — <Link to="/auth">create an account</Link> to save
          your progress across devices.
        </p>
      )}
    </div>
  )
}
