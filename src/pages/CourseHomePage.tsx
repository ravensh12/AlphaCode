import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { LESSON_CATALOG, MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'
import { generateLesson } from '../content/lessons'
import { dueReviewCount, hasReviewHistory } from '../lib/warmup'
import {
  hasQuizActivity,
  isLearnComplete,
} from '../lib/lessonSections'
import { hasPendingMissedReview, hasEverMastered, meetsUnlockThreshold } from '../lib/mastery'
import { BADGE_ORDER, BADGES } from '../content/badges'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  selectAcademyProgressCounts,
  selectTrackProgress,
} from '../lib/academyProgress'
import { activeRunProgressView } from '../lib/freshRunView'
import { academyTrackPath } from '../lib/academyQuest'
import type { LessonSummary } from '../types/lesson'
import type { ExperienceLevel } from '../types/progress'
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
  new: "Perfect — we'll build the patterns NeetCode 150 assumes you know.",
  some: "Let's sharpen how you trace code before real interview problems.",
  class: 'Get ahead of what NeetCode-style problems expect from you.',
}

export function CourseHomePage() {
  const { displayName, isGuest } = useAuth()
  const {
    streak,
    variablesMastery,
    experienceLevel,
    lessons,
    cloudEnabled,
    badgeCounts,
    totalBadgeCount,
    badgesUnlockedCount,
    learnerModel,
    academyProgress,
    academyCampaignComplete,
  } = useProgress()
  // The run view (see freshRunView.ts): identical to durable progress outside
  // a fresh run; during one, counts match what the levels/track pages show —
  // a reset run reads 0 solved again, a skip run reads prior realms complete.
  const viewProgress = useMemo(
    () => activeRunProgressView(academyProgress),
    [academyProgress],
  )
  const academyCounts = selectAcademyProgressCounts(viewProgress)

  const firstLesson = lessons[LESSON_CATALOG[0].id]
  const showReview =
    firstLesson?.status === 'completed' &&
    variablesMastery < MASTERY_UNLOCK_THRESHOLD

  const tagline = experienceLevel
    ? LEVEL_TAGLINE[experienceLevel]
    : 'LeetCode prep course'

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
            {experienceLevel ? (
              <p className="muted course-tagline">{tagline}</p>
            ) : (
              <p className="course-product-line">
                <span className="course-brand-name">AlphaCode</span>
                <span className="course-brand-sub">LeetCode prep course</span>
              </p>
            )}
          </div>

          <div className="course-stats">
            <Stat
              label="Day streak"
              value={`${streak.current}`}
              icon={<IconFlame size={20} />}
              tone="yellow"
            />
            <Stat
              label="Missions solved"
              value={`${academyCounts.completedProblems}/150`}
              icon={<IconTrophy size={20} />}
              tone="lime"
            />
            <Stat
              label="Topics cleared"
              value={`${academyCounts.completedTracks}/18`}
              icon={<IconGauge size={20} />}
              tone="cyan"
            />
          </div>
        </section>

        {!isGuest && hasReviewHistory(learnerModel) && (
          <Link to="/warmup" className="course-warmup card">
            <span className="course-review-emoji" aria-hidden="true">
              <IconGauge size={24} />
            </span>
            <div className="course-review-text">
              <strong>Daily warm-up</strong>
              <span className="muted">
                {dueReviewCount(learnerModel) > 0
                  ? `${dueReviewCount(learnerModel)} concept${
                      dueReviewCount(learnerModel) === 1 ? '' : 's'
                    } due for review — a quick spaced recall to lock them in.`
                  : 'Quick spaced recall of what you’ve learned — proven to make it stick.'}
              </span>
            </div>
            <IconArrowRight size={20} />
          </Link>
        )}

        {academyCampaignComplete && (
          <div className="course-complete-banner card">
            <span className="course-review-emoji" aria-hidden="true">
              <IconTrophy size={24} />
            </span>
            <div className="course-review-text">
              <strong>Academy campaign complete!</strong>
              <span className="muted">
                You solved all 150 missions across 18 topics and cleared all 6
                realm knowledge gates and bosses.
              </span>
            </div>
          </div>
        )}

        <Link
          to="/demo/guarantee"
          className="course-warmup course-demo-guarantee card"
        >
          <span className="course-review-emoji" aria-hidden="true">
            <IconGauge size={24} />
          </span>
          <div className="course-review-text">
            <strong>DEMO ONLY · Fictional guarantee workflow</strong>
            <span className="muted">
              No payment provider is connected and no money can move. Explore
              simulated policy outcomes.
            </span>
          </div>
          <IconArrowRight size={20} />
        </Link>

        {isGuest && (
          <div className="course-setup-banner card">
            <div className="course-review-text">
              <strong>Guest preview</strong>
              <span className="muted">
                Try the first academy mission&apos;s teaching section free. Sign in
                to unlock assessments and the full 150-mission campaign.
              </span>
            </div>
            <Link className="btn subtle" to="/auth">
              Sign in
            </Link>
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
            <Link className="btn subtle" to={`/lesson/${LESSON_CATALOG[0].id}/learn`}>
              Review now
            </Link>
          </div>
        )}

        <section className="course-path">
          <h2 className="course-path-title">NeetCode 150 Academy</h2>
          <p className="muted course-path-hint">
            150 authored missions · 18 topics · 6 realms. Open any unlocked
            checkpoint directly or enter it through Code City.
          </p>
          <div className="course-academy-grid">
            {NEETCODE_150_MANIFEST.realms.map((realm) => (
              <article key={realm.id} className="course-academy-realm card">
                <span className="eyebrow">Realm {realm.order}</span>
                <h3>{realm.title}</h3>
                <div className="course-academy-tracks">
                  {realm.trackIds.map((trackId) => {
                    const track = NEETCODE_150_TRACK_BY_ID.get(trackId)!
                    const progress = selectTrackProgress(viewProgress, trackId)
                    return (
                      <Link
                        key={trackId}
                        to={academyTrackPath(realm.id, trackId)}
                        className="course-academy-track"
                      >
                        <span>
                          <strong>{track.title}</strong>
                          <small>
                            {progress.completedProblems}/{progress.totalProblems} solved
                          </small>
                        </span>
                        <IconArrowRight size={16} />
                      </Link>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="course-badges">
          <div className="course-badges-head">
            <h2 className="course-path-title">Badges</h2>
            <span className="course-badges-count muted">
              {totalBadgeCount} earned · {badgesUnlockedCount}/{BADGE_ORDER.length} types
            </span>
          </div>
          <p className="muted course-badges-hint">
            Answer fast and clean to collect them all.
          </p>
          <div className="badge-row">
            {BADGE_ORDER.map((id) => {
              const badge = BADGES[id]
              const count = badgeCounts[id] ?? 0
              const earned = count > 0
              const { Icon, label, description } = badge
              return (
                <div
                  key={id}
                  className={`badge-chip tone-${badge.tone} ${earned ? '' : 'locked'}`}
                  title={
                    earned
                      ? `${description} · Earned ${count} time${count === 1 ? '' : 's'}`
                      : `Locked — ${description}`
                  }
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {earned && <span className="badge-count">×{count}</span>}
                </div>
              )
            })}
          </div>
        </section>

        <section className="course-path">
          <h2 className="course-path-title">Historical primer</h2>
          <p className="muted course-path-hint">
            The original six-lesson primer remains available for review. It does
            not unlock academy checkpoints, realm bosses, or the final journey.
          </p>
          <div className="course-modules stagger">
            {LESSON_CATALOG.map((lesson, index) => (
              <TopicModule
                key={lesson.id}
                lesson={lesson}
                index={index}
                nextLesson={LESSON_CATALOG[index + 1] ?? null}
              />
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

function TopicModule({
  lesson,
  index,
  nextLesson,
}: {
  lesson: LessonSummary
  index: number
  nextLesson: LessonSummary | null
}) {
  const { isGuest } = useAuth()
  const { getLessonProgress, isLessonUnlocked } = useProgress()
  const progress = getLessonProgress(lesson.id)
  const unlocked = isLessonUnlocked(lesson)
  const guestLocked = isGuest && index > 0
  const locked = !unlocked || guestLocked
  const fullLesson = generateLesson(lesson.id)!
  const learnDone = isLearnComplete(progress, fullLesson)
  const quizStarted = hasQuizActivity(progress)
  const everMastered = hasEverMastered(progress)
  const mastery = quizStarted ? (progress?.masteryScore ?? 0) : 0
  const quizInProgress =
    learnDone &&
    quizStarted &&
    !meetsUnlockThreshold(mastery) &&
    (progress?.status === 'inProgress' || hasPendingMissedReview(progress))
  const needsContinue =
    learnDone && quizStarted && !meetsUnlockThreshold(mastery) && hasPendingMissedReview(progress)
  const fullyDone = learnDone && everMastered

  return (
    <article className={`course-module card ${guestLocked || !unlocked ? 'locked' : ''}`}>
      <div className="module-head">
        <div className="module-index" aria-hidden="true">
          {fullyDone ? <IconCheck size={20} /> : locked ? <IconLock size={18} /> : index + 1}
        </div>
        <div className="module-copy">
          <h3 className="module-title">{lesson.title}</h3>
          <p className="muted module-sub">{lesson.subtitle}</p>
          <span className="module-practice muted">
            Quiz practice: {lesson.practiceGoal}
          </span>
          <span className="module-pattern muted">{lesson.pattern}</span>
        </div>
      </div>

      <div className="module-sections">
        <SectionCard
          type="learn"
          lessonId={lesson.id}
          locked={locked}
          completed={learnDone}
          inProgress={!learnDone && (progress?.learnStepIndex ?? 0) > 0}
          isGuest={isGuest}
        />
        <SectionCard
          type="quiz"
          lessonId={lesson.id}
          locked={locked || !learnDone || isGuest}
          mastered={everMastered}
          needsContinue={needsContinue}
          inProgress={quizInProgress}
          mastery={mastery}
          isGuest={isGuest}
          learnDone={learnDone}
        />
      </div>

      {everMastered && nextLesson && !isGuest && (
        <Link
          to={`/lesson/${nextLesson.id}/learn`}
          className="module-next-lesson btn subtle"
        >
          Next lesson: {nextLesson.title}
          <IconArrowRight size={16} />
        </Link>
      )}
    </article>
  )
}

function SectionCard({
  type,
  lessonId,
  locked,
  completed,
  mastered,
  needsContinue,
  inProgress,
  mastery,
  isGuest,
  learnDone,
}: {
  type: 'learn' | 'quiz'
  lessonId: string
  locked: boolean
  completed?: boolean
  mastered?: boolean
  needsContinue?: boolean
  inProgress?: boolean
  mastery?: number
  isGuest?: boolean
  learnDone?: boolean
}) {
  const isLearn = type === 'learn'
  const label = isLearn ? 'Interactive lesson' : 'Quiz'
  const desc = isLearn
    ? 'Visuals, tracing, and guided practice — the pattern before the problems.'
    : 'NeetCode-style quiz — prove the pattern, unlock your readiness list.'

  const quizDone = !isLearn && mastered

  let status = 'Not started'
  if (locked && isGuest && !isLearn && learnDone) status = 'Sign in to unlock'
  else if (locked && isGuest && isLearn) status = 'Sign in to unlock'
  else if (locked && isLearn) status = 'Locked'
  else if (locked) status = 'Finish lesson first'
  else if (completed && isLearn) status = 'Lesson complete'
  else if (!isLearn && mastered) status = `${mastery ?? 0}% mastery`
  else if (!isLearn && needsContinue) status = `${mastery ?? 0}% mastery · review`
  else if (!isLearn && inProgress) status = `${mastery ?? 0}% mastery · in progress`
  else if (completed) status = 'Quiz complete'
  else if (inProgress) status = 'In progress'
  else status = 'Ready'

  let action = 'Start'
  if (!isLearn && needsContinue) action = 'Continue review'
  else if (!isLearn && inProgress) action = 'Continue'
  else if (!isLearn && mastered && meetsUnlockThreshold(mastery ?? 0)) action = 'Review'
  else if (completed && isLearn) action = 'Review'
  else if (completed) action = 'Review'
  else if (inProgress) action = 'Resume'

  const to = `/lesson/${lessonId}/${type}`

  const inner = (
    <>
      <div className={`section-card-icon ${isLearn ? 'learn' : 'quiz'}`}>
        {isLearn ? 'L' : 'Q'}
      </div>
      <div className="section-card-body">
        <span className={`section-card-type ${isLearn ? 'learn' : 'quiz'}`}>
          {label}
        </span>
        <p className="section-card-desc muted">{desc}</p>
        <div className="section-card-meta">
          {!isLearn && mastered && (
            <span className="section-card-mastered">Mastered</span>
          )}
          <span
            className={`section-card-status ${locked ? 'locked' : quizDone || (completed && isLearn) ? 'done' : ''}`}
          >
            {status}
          </span>
        </div>
      </div>
      {!locked && (
        <span className="section-card-action">
          {action}
          <IconArrowRight size={16} />
        </span>
      )}
    </>
  )

  if (locked) {
    return (
      <div className={`section-card ${type} locked`} aria-disabled="true">
        {inner}
      </div>
    )
  }

  return (
    <Link
      to={to}
      className={`section-card ${type} ${quizDone || (completed && isLearn) ? 'completed' : ''}`}
    >
      {inner}
    </Link>
  )
}
