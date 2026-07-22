/* oxlint-disable react/only-export-components */
import { useMemo } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { IconArrowLeft, IconArrowRight, IconCheck, IconLock } from '../components/icons'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_ID,
} from '../content/curricula/neetcode150'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import {
  academyMissionPath,
  checkpointIndexForTrack,
  resolveAcademyTrackRoute,
  worldIndexForRealmId,
} from '../lib/academyQuest'
import {
  canEnterAcademyCheckpointWithShowcase,
  hasAcademyTrackEntryWithShowcase,
} from '../lib/showcaseOverride'
import {
  isMissionRetentionDue,
  missionRetentionAvailableAt,
  selectTrackProgress,
} from '../lib/academyProgress'
import { activeRunProgressView } from '../lib/freshRunView'
import { academyMissionStatus } from '../lib/academyMissionStatus'
import { useRetentionClock } from '../hooks/useRetentionClock'
import './AcademyPage.css'

type AcademyLocationState = {
  academyNotice?: string
}

/** Short, friendly local time for retention unlock moments (no raw ISO). */
export function formatRetentionTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function AcademyMeter({
  label,
  value,
  total,
  tone,
}: {
  label: string
  value: number
  total: number
  tone: 'practiced' | 'retained'
}) {
  const pct = Math.round((value / Math.max(1, total)) * 100)
  return (
    <div className={`academy-meter academy-meter--${tone}`}>
      <div className="academy-meter-head">
        <span className="academy-meter-label">{label}</span>
        <span className="academy-meter-value">
          {value}/{total}
        </span>
      </div>
      <div
        className="academy-meter-track"
        role="progressbar"
        aria-label={`${label} missions`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${total} missions ${label.toLowerCase()}`}
      >
        <span className="academy-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AcademyTrackPage() {
  const { realmId, trackId } = useParams()
  const location = useLocation()
  const { isGuest, isShowcaseAccount } = useAuth()
  const {
    ready,
    cloudEnabled,
    academyProgress,
  } = useProgress()
  const route = resolveAcademyTrackRoute(realmId, trackId)
  // What this page PRESENTS: the run view (see freshRunView.ts). Identical to
  // durable progress outside a fresh run; during one, skipped realms read as
  // completed (replayable) and a reset run reads as not-completed. Durable
  // evidence and its recording paths are untouched.
  const viewProgress = useMemo(
    () => activeRunProgressView(academyProgress),
    [academyProgress],
  )
  const retentionTimes =
    route.kind === 'valid'
      ? route.track.problemIds.flatMap((problemId) => {
          const practice = viewProgress.missionPractices[problemId]
          return practice && !viewProgress.missionCompletions[problemId]
            ? [missionRetentionAvailableAt(practice)]
            : []
        })
      : []
  const retentionNow = useRetentionClock(retentionTimes)

  if (route.kind === 'redirect') {
    return (
      <Navigate
        to={route.to}
        replace
        state={{ academyNotice: route.notice }}
      />
    )
  }
  if (!ready) return <Loader label="Opening the academy" night />

  const worldIndex = worldIndexForRealmId(route.realm.id)
  const checkpointIndex = checkpointIndexForTrack(
    route.realm.id,
    route.track.id,
  )
  // Durable access is never revoked; the run view can only OPEN more (a
  // "Skip to realm" run presents skipped realms' checkpoints as cleared).
  const accessible =
    canEnterAcademyCheckpointWithShowcase(
      isShowcaseAccount,
      academyProgress,
      worldIndex,
      checkpointIndex,
    ) ||
    canEnterAcademyCheckpointWithShowcase(
      isShowcaseAccount,
      viewProgress,
      worldIndex,
      checkpointIndex,
    )
  const progress = selectTrackProgress(viewProgress, route.track.id)
  const physicalEntry = hasAcademyTrackEntryWithShowcase(
    isShowcaseAccount,
    route.realm.id,
    route.track.id,
  )
  const problems = route.track.problemIds
    .map((problemId) => NEETCODE_150_PROBLEM_BY_ID.get(problemId))
    .filter((problem): problem is NonNullable<typeof problem> => !!problem)
  const missionCount = progress.totalProblems
  const campaignTotal = NEETCODE_150_MANIFEST.problems.length
  const notice = (location.state as AcademyLocationState | null)
    ?.academyNotice

  if (!accessible) {
    return (
      <AcademyNotice
        title={`${route.track.title} is still sealed`}
        message="Clear the earlier academy checkpoints and realm boss in Code City before starting this topic."
      />
    )
  }

  const nextProblem =
    problems.find(
      ({ id }) => !viewProgress.missionPractices[id],
    ) ??
    problems.find(({ id }) =>
      isMissionRetentionDue(viewProgress, id, retentionNow),
    ) ??
    problems.find(
      ({ id }) =>
        cloudEnabled &&
        !!viewProgress.missionCompletions[id] &&
        !viewProgress.missionCompletions[id]?.cloudVerifiedAt,
    ) ??
    problems.find(({ id }) => !viewProgress.missionCompletions[id]) ??
    problems[0]

  return (
    <div className="page academy-page">
      <AppHeader />
      <main className="container academy-main">
        <Link className="academy-back" to="/quest/list">
          <IconArrowLeft size={18} />
          Back to levels
        </Link>

        {notice && (
          <div className="academy-notice" role="status">
            {notice}
          </div>
        )}

        <header className="academy-hero">
          <div className="academy-hero-copy">
            <span className="eyebrow">
              Level {route.realm.order} · Checkpoint {route.track.realmOrder} of 3
            </span>
            <h1>{route.track.title}</h1>
            <p className="academy-hero-realm">
              {route.realm.title} · {missionCount} missions
            </p>
          </div>
          <div className="academy-progress">
            <AcademyMeter
              label="Practiced"
              value={progress.practicedProblems}
              total={missionCount}
              tone="practiced"
            />
            <AcademyMeter
              label="Retained"
              value={progress.completedProblems}
              total={missionCount}
              tone="retained"
            />
            <details className="academy-legend">
              <summary>What do practiced and retained mean?</summary>
              <p>
                <strong>Practiced</strong> — you passed the mission&apos;s
                teaching, independent transfer, and code tests in one clean run.
              </p>
              <p>
                <strong>Retained</strong> — after the wait, you also passed the
                delayed retention check, so the mission counts as complete.
              </p>
            </details>
          </div>
        </header>

        {isGuest && (
          <div className="academy-notice">
            Guest preview includes the first mission&apos;s teaching section.
            Sign in to run assessments and save the full 150-mission campaign.
          </div>
        )}

        {nextProblem && (
          <Link
            className="btn lg academy-primary"
            to={
              physicalEntry ||
              progress.practiceComplete ||
              (isGuest && nextProblem.globalOrder === 1)
                ? academyMissionPath(
                    route.realm.id,
                    route.track.id,
                    nextProblem.leetcodeSlug,
                  )
                : '/quest'
            }
          >
            {progress.complete
              ? 'Review this topic'
              : !physicalEntry && !(isGuest && nextProblem.globalOrder === 1)
                ? 'Enter through Code City'
                : progress.practicedProblems > 0
                  ? 'Continue topic'
                  : 'Start topic'}
            <IconArrowRight size={18} />
          </Link>
        )}

        <section aria-labelledby="academy-missions-title">
          <div className="academy-list-head">
            <div>
              <h2 id="academy-missions-title">Missions</h2>
              <p className="muted">Each mission teaches, retrieves, transfers, and tests code.</p>
            </div>
            {progress.complete && (
              <span className="academy-complete-chip">
                <IconCheck size={15} /> Checkpoint complete
              </span>
            )}
          </div>

          <ol className="academy-missions stagger">
            {problems.map((problem, index) => {
              // Status ladder (academyMissionStatus — its test pins the
              // exact outputs).
              const mission = academyMissionStatus({
                problemId: problem.id,
                globalOrder: problem.globalOrder,
                academyProgress: viewProgress,
                cloudEnabled,
                retentionNow,
                isGuest,
                physicalEntry,
                missionPath: academyMissionPath(
                  route.realm.id,
                  route.track.id,
                  problem.leetcodeSlug,
                ),
              })
              const content = (
                <>
                  <span className="academy-mission-number">
                    {mission.complete || mission.practiced ? <IconCheck size={17} /> : mission.guestLocked ? <IconLock size={16} /> : index + 1}
                  </span>
                  <span className="academy-mission-copy">
                    <strong>{problem.title}</strong>
                    <span className="academy-mission-meta">
                      <span
                        className={`academy-diff diff-${problem.difficulty.toLowerCase()}`}
                      >
                        {problem.difficulty}
                      </span>
                      <span>
                        Mission {index + 1} of {missionCount}
                      </span>
                      <span>
                        Campaign {problem.globalOrder}/{campaignTotal}
                      </span>
                      {mission.practiced &&
                        !mission.complete &&
                        !mission.retentionDue &&
                        mission.retentionAvailableAt && (
                          <span>
                            Retention unlocks{' '}
                            <time dateTime={mission.retentionAvailableAt}>
                              {formatRetentionTime(mission.retentionAvailableAt)}
                            </time>
                          </span>
                        )}
                    </span>
                  </span>
                  <span className="academy-mission-status">
                    {mission.status.label}
                  </span>
                  <IconArrowRight className="academy-mission-go" size={17} />
                </>
              )
              return (
                <li key={problem.id}>
                  <Link
                    className={`academy-mission ${mission.status.tone}${mission.locked ? ' is-locked' : ''}`}
                    to={mission.destination}
                  >
                    {content}
                  </Link>
                </li>
              )
            })}
          </ol>
        </section>
      </main>
    </div>
  )
}

export function AcademyNotice({
  title,
  message,
  action = { label: 'Return to Code City', to: '/quest' },
}: {
  title: string
  message: string
  action?: { label: string; to: string }
}) {
  return (
    <div className="page academy-page">
      <AppHeader />
      <main className="container academy-main">
        <div className="card academy-blocked">
          <h1>{title}</h1>
          <p className="muted">{message}</p>
          <Link className="btn" to={action.to}>
            {action.label}
          </Link>
        </div>
      </main>
    </div>
  )
}
