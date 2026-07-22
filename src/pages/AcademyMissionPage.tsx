/* oxlint-disable react/only-export-components */
import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { IconArrowRight, IconCheck } from '../components/icons'
import { academyMissionPath, academyTrackPath } from '../lib/academyQuest'
import { useAcademyMissionFlow } from '../hooks/useAcademyMissionFlow'
import { prefetchOverworld } from '../lib/prefetchOverworld'
import { AcademyNotice, formatRetentionTime } from './AcademyTrackPage'
import { LessonRunner } from './LessonPage'
import './AcademyPage.css'

// Evidence builders live with the headless flow; re-exported for compatibility.
export {
  canRecoverMissionCompletion,
  missionAssessmentsPassed,
  missionPracticeFromResult,
  missionRetentionFromResult,
} from '../hooks/useAcademyMissionFlow'

export function AcademyMissionPage() {
  const {
    access,
    routeNotice,
    practiceRetryNotice,
    retentionMode,
    reviewMode,
    fromCity,
    cloudEnabled,
    isGuest,
    missionPracticed,
    missionCompleted,
    retentionCloudVerified,
    retentionAvailableAt,
    retentionDue,
    lesson,
    loadError,
    section,
    previewFinished,
    retentionUnavailable,
    nextProblem,
    lessonRunner,
  } = useAcademyMissionFlow()

  // Missions typically end with a hop back into the 3D overworld — warm its
  // route chunk during idle time so the switch doesn't stall on fetch/parse.
  useEffect(() => {
    prefetchOverworld()
  }, [])

  if (access.kind === 'redirect') {
    return (
      <Navigate
        to={access.to}
        replace
        state={{ academyNotice: access.notice }}
      />
    )
  }
  if (access.kind === 'loading') {
    return <Loader label="Loading academy progress" night />
  }

  const route = access.route
  if (access.kind === 'checkpoint-locked') {
    return (
      <AcademyNotice
        title="Mission locked"
        message="Return to Code City and clear the earlier academy checkpoint first."
      />
    )
  }

  if (access.kind === 'guest-blocked') {
    return (
      <AcademyNotice
        title="Sign in to continue"
        message="Guest preview includes the teaching section of Mission 1. Create an account to unlock all 150 missions."
        action={{ label: 'Sign in', to: '/auth' }}
      />
    )
  }

  const completed = missionCompleted
  const missionPath = academyMissionPath(
    route.realm.id,
    route.track.id,
    route.problem.leetcodeSlug,
  )
  // Replays keep the city-entry marker so finishing one returns to the 3D
  // overworld (and settles the street beat) instead of the 2D topic page.
  const reviewSuffix = fromCity ? '&from=city' : ''
  if (completed && !reviewMode && (!retentionMode || retentionCloudVerified)) {
    const nextPath = nextProblem
      ? academyMissionPath(
          route.realm.id,
          route.track.id,
          nextProblem.leetcodeSlug,
        )
      : academyTrackPath(route.realm.id, route.track.id)
    return (
      <div className="page academy-page">
        <AppHeader />
        <main className="container academy-main academy-mission-done">
          {routeNotice && (
            <div className="academy-notice" role="status">
              {routeNotice}
            </div>
          )}
          <div className="card academy-blocked">
            <span className="academy-mission-context">
              {route.track.title} · Mission {route.problem.trackOrder} of{' '}
              {route.track.problemCount}
            </span>
            <span className="academy-complete-chip">
              <IconCheck size={15} />{' '}
              {cloudEnabled && !retentionCloudVerified
                ? 'Retention pending cloud verification'
                : 'Mission retained'}
            </span>
            <h1>{route.problem.title}</h1>
            <p className="muted">
              {cloudEnabled && !retentionCloudVerified
                ? 'Your retention check passed on this device. Run the quick cloud verification check to confirm it across devices.'
                : 'Clean practice and the delayed retrieval check are linked to durable learning events.'}
            </p>
            {cloudEnabled && !retentionCloudVerified && (
              <details className="academy-legend">
                <summary>Why does the cloud need to verify this?</summary>
                <p>
                  This device accepted the local retention schedule. Cloud
                  completion remains pending until linked events satisfy the
                  server received-time boundary.
                </p>
              </details>
            )}
            <div className="academy-actions">
              {cloudEnabled && !retentionCloudVerified ? (
                <>
                  <Link
                    className="btn"
                    to={`${academyMissionPath(
                      route.realm.id,
                      route.track.id,
                      route.problem.leetcodeSlug,
                    )}?mode=retention`}
                  >
                    Run cloud verification check
                  </Link>
                  <Link className="btn ghost" to={nextPath}>
                    {nextProblem
                      ? `Continue to ${nextProblem.title}`
                      : 'Back to topic'}
                    <IconArrowRight size={17} />
                  </Link>
                </>
              ) : (
                <Link className="btn" to={nextPath}>
                  {nextProblem
                    ? `Continue to ${nextProblem.title}`
                    : 'Back to topic'}
                  <IconArrowRight size={17} />
                </Link>
              )}
            </div>
            <div className="academy-actions">
              <Link
                className="btn ghost"
                to={`${missionPath}?mode=review${reviewSuffix}`}
              >
                Review lesson
              </Link>
              <Link
                className="btn ghost"
                to={`${missionPath}?mode=review&start=quiz${reviewSuffix}`}
              >
                Replay quiz
              </Link>
            </div>
            <p className="muted academy-review-note">
              Replays never change your saved completion — revisit the teaching
              and quiz as often as you like.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (access.kind === 'entry-blocked') {
    return (
      <AcademyNotice
        title="Enter through Code City"
        message="Reach this physical checkpoint, survive its siege, and press E at the academy before starting campaign missions."
      />
    )
  }

  if (loadError) {
    return (
      <AcademyNotice
        title="Mission unavailable"
        message={`${loadError} Return to the topic list and try again.`}
      />
    )
  }
  if (!lesson || !lessonRunner) {
    return <Loader label={`Loading ${route.problem.title}`} night />
  }

  if (missionPracticed && !reviewMode && (!retentionMode || !retentionDue)) {
    const nextPath = nextProblem
      ? academyMissionPath(
          route.realm.id,
          route.track.id,
          nextProblem.leetcodeSlug,
        )
      : academyTrackPath(route.realm.id, route.track.id)
    return (
      <div className="page academy-page">
        <AppHeader />
        <main className="container academy-main academy-mission-done">
          <div className="card academy-blocked">
            <span className="academy-mission-context">
              {route.track.title} · Mission {route.problem.trackOrder} of{' '}
              {route.track.problemCount}
            </span>
            <span className="academy-complete-chip">
              <IconCheck size={15} /> Practice recorded
            </span>
            <h1>{route.problem.title}</h1>
            {retentionDue ? (
              <p className="muted">
                The delayed-retrieval check is available now. Pass it cleanly
                to retain and complete this mission.
              </p>
            ) : (
              <p className="muted">
                Practice is locked in. The retention check unlocks{' '}
                <time dateTime={retentionAvailableAt ?? undefined}>
                  {retentionAvailableAt
                    ? formatRetentionTime(retentionAvailableAt)
                    : 'at the recorded policy time'}
                </time>{' '}
                — keep practicing later missions while you wait.
              </p>
            )}
            <div className="academy-actions">
              {retentionDue && (
                <Link
                  className="btn"
                  to={`${academyMissionPath(
                    route.realm.id,
                    route.track.id,
                    route.problem.leetcodeSlug,
                  )}?mode=retention`}
                >
                  Run retention check
                </Link>
              )}
              <Link className="btn ghost" to={nextPath}>
                {nextProblem ? `Practice ${nextProblem.title}` : 'Back to topic'}
                <IconArrowRight size={17} />
              </Link>
              <Link
                className="btn ghost"
                to={`${missionPath}?mode=review${reviewSuffix}`}
              >
                Review lesson
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (isGuest && (previewFinished || section === 'quiz')) {
    return (
      <AcademyNotice
        title="Preview complete"
        message="You finished the first mission lesson. Sign in to take its assessments, save completion, and continue the academy."
        action={{ label: 'Sign in to continue', to: '/auth' }}
      />
    )
  }

  if (retentionUnavailable) {
    return (
      <AcademyNotice
        title="Retention check unavailable"
        message="This mission does not contain its authored delayed-retrieval assessment."
      />
    )
  }

  const { key: runnerKey, ...runnerProps } = lessonRunner
  const notice = practiceRetryNotice ?? routeNotice
  return (
    <>
      {notice && (
        <div className="academy-route-toast" role="status">
          {notice}
        </div>
      )}
      <LessonRunner key={runnerKey} {...runnerProps} />
    </>
  )
}
