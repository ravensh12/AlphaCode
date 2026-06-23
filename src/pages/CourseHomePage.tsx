import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { LESSON_CATALOG, MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'
import { BADGE_ORDER, BADGES } from '../content/badges'
import type { LessonSummary } from '../types/lesson'
import type { ExperienceLevel } from '../types/progress'
import { masteryBand, bandLabel } from '../lib/mastery'
import {
  IconFlame,
  IconTrophy,
  IconGauge,
  IconCompass,
  IconLock,
  IconCheck,
  IconArrowRight,
} from '../components/icons'
import './CourseHomePage.css'

const LEVEL_TAGLINE: Record<ExperienceLevel, string> = {
  new: "You're starting from scratch — the perfect place to begin.",
  some: "Let's sharpen the way you read code.",
  class: "Let's get ahead of what your class assumes you know.",
}

export function CourseHomePage() {
  const { displayName, isGuest } = useAuth()
  const {
    streak,
    variablesMastery,
    averageMastery,
    completedLessonsCount,
    totalLessonsCount,
    allLessonsComplete,
    experienceLevel,
    lessons,
    cloudEnabled,
    earnedBadges,
  } = useProgress()

  const firstLesson = lessons[LESSON_CATALOG[0].id]
  const showReview =
    firstLesson?.status === 'completed' &&
    variablesMastery < MASTERY_UNLOCK_THRESHOLD

  const tagline = experienceLevel
    ? LEVEL_TAGLINE[experienceLevel]
    : 'Trace code, update variable boxes, and prove you understand.'

  return (
    <div className="page">
      <AppHeader />

      <main className="container course-main">
        <section className="course-hero">
          <div>
            <span className="eyebrow">Your course</span>
            <h1 className="course-greeting">
              {isGuest ? 'Hi there' : `Hi, ${displayName}`}
            </h1>
            <p className="muted course-tagline">{tagline}</p>
          </div>

          <div className="course-stats">
            <Stat
              label="Day streak"
              value={`${streak.current}`}
              icon={<IconFlame size={20} />}
              tone="yellow"
            />
            <Stat
              label="Lessons done"
              value={`${completedLessonsCount}/${totalLessonsCount}`}
              icon={<IconTrophy size={20} />}
              tone="lime"
            />
            <Stat
              label="Avg mastery"
              value={`${averageMastery}%`}
              icon={<IconGauge size={20} />}
              tone="cyan"
            />
          </div>
        </section>

        {allLessonsComplete && (
          <div className="course-complete-banner card">
            <span className="course-review-emoji" aria-hidden="true">
              <IconTrophy size={24} />
            </span>
            <div className="course-review-text">
              <strong>Course complete!</strong>
              <span className="muted">
                You finished all {totalLessonsCount} lessons with {averageMastery}%
                average mastery. Replay any lesson for a fresh set of puzzles.
              </span>
            </div>
          </div>
        )}

        {!isGuest && !cloudEnabled && (
          <div className="course-setup-banner card">
            <div className="course-review-text">
              <strong>Cloud sync not set up yet</strong>
              <span className="muted">
                Run the database schema (supabase/schema.sql) in your Supabase SQL
                editor to sync progress across devices. Until then, progress saves
                on this device.
              </span>
            </div>
          </div>
        )}

        {showReview && (
          <div className="course-review-banner card">
            <span className="course-review-emoji" aria-hidden="true">
              <IconCompass size={24} />
            </span>
            <div className="course-review-text">
              <strong>Review recommended</strong>
              <span className="muted">
                Your variable mastery is {variablesMastery}%. Reach{' '}
                {MASTERY_UNLOCK_THRESHOLD}% to unlock the next lesson.
              </span>
            </div>
            <Link className="btn subtle" to={`/lesson/${LESSON_CATALOG[0].id}`}>
              Review now
            </Link>
          </div>
        )}

        <section className="course-badges">
          <div className="course-badges-head">
            <h2 className="course-path-title">Badges</h2>
            <span className="course-badges-count muted">
              {earnedBadges.length}/{BADGE_ORDER.length} earned
            </span>
          </div>
          <p className="muted course-badges-hint">
            Answer fast and clean to collect them all.
          </p>
          <div className="badge-row">
            {BADGE_ORDER.map((id) => {
              const badge = BADGES[id]
              const earned = earnedBadges.includes(id)
              const { Icon, label, description } = badge
              return (
                <div
                  key={id}
                  className={`badge-chip tone-${badge.tone} ${earned ? '' : 'locked'}`}
                  title={earned ? description : `Locked — ${description}`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="course-path">
          <h2 className="course-path-title">Learning path</h2>
          <div className="course-lessons">
            {LESSON_CATALOG.map((lesson, index) => (
              <LessonCard key={lesson.id} lesson={lesson} index={index} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: ReactNode
  tone: 'yellow' | 'lime' | 'cyan'
}) {
  return (
    <div className="course-stat card">
      <span className={`course-stat-icon tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="course-stat-body">
        <span className="course-stat-value">{value}</span>
        <span className="course-stat-label muted">{label}</span>
      </div>
    </div>
  )
}

function LessonCard({
  lesson,
  index,
}: {
  lesson: LessonSummary
  index: number
}) {
  const { getLessonProgress, isLessonUnlocked } = useProgress()
  const progress = getLessonProgress(lesson.id)
  const unlocked = isLessonUnlocked(lesson)
  const status = progress?.status ?? 'notStarted'

  const completed = status === 'completed'
  const inProgress = status === 'inProgress'
  const locked = !unlocked
  const isPreview = lesson.playable === false

  let stateClass = 'available'
  if (locked) stateClass = 'locked'
  else if (completed) stateClass = 'completed'
  else if (isPreview) stateClass = 'preview'

  const tagText = locked
    ? `Locked · needs ${lesson.unlockRequirements.minimumMastery ?? MASTERY_UNLOCK_THRESHOLD}% mastery`
    : isPreview
      ? 'Unlocked · coming soon'
      : completed
        ? `Completed · ${progress?.masteryScore ?? 0}% mastery`
        : inProgress
          ? 'In progress'
          : 'Available now'

  const inner = (
    <>
      <div className="lesson-index" aria-hidden="true">
        {completed ? (
          <IconCheck size={22} />
        ) : locked ? (
          <IconLock size={20} />
        ) : (
          index + 1
        )}
      </div>
      <div className="lesson-body">
        <div className="lesson-titlerow">
          <h3>{lesson.title}</h3>
          {completed && progress && (
            <span
              className={`pill ${masteryBand(progress.masteryScore) === 'review' || masteryBand(progress.masteryScore) === 'struggling' ? 'warn' : 'success'}`}
            >
              {bandLabel(masteryBand(progress.masteryScore))}
            </span>
          )}
        </div>
        <p className="muted lesson-sub">{lesson.subtitle}</p>
        <span className={`lesson-tag ${stateClass}`}>{tagText}</span>
      </div>
      {!locked && !isPreview && (
        <div className="lesson-action">
          {completed ? 'Review' : inProgress ? 'Resume' : 'Start'}
          <IconArrowRight size={18} />
        </div>
      )}
    </>
  )

  if (locked || isPreview) {
    return (
      <div className={`lesson-card card ${stateClass}`} aria-disabled="true">
        {inner}
      </div>
    )
  }

  // Completed lessons open the review screen; everything else jumps into play.
  const target = completed ? `/review/${lesson.id}` : `/lesson/${lesson.id}`

  return (
    <Link to={target} className={`lesson-card card ${stateClass}`}>
      {inner}
    </Link>
  )
}
