import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useGauntlet } from '../context/GauntletContext'
import { WORLDS } from '../content/adventure'
import {
  loadFreshRunState,
  startFreshQuestRun,
} from '../lib/questSession'
import {
  loadRealmsReached,
  recordRealmsReached,
  skipRunToRealm,
} from '../lib/realmSkip'
import { freshRunProgressView } from '../lib/freshRunView'
import {
  selectRealmProgress,
  selectTrackProgress,
} from '../lib/academyProgress'
import {
  academyTrackPath,
  isRealmRunPassed,
} from '../lib/academyQuest'
import { prefetchOverworld } from '../lib/prefetchOverworld'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  academyCampaignCompleteWithShowcase,
  academyWorldStateWithShowcase,
  readyForFinalGauntletWithShowcase,
} from '../lib/showcaseOverride'
import {
  formatRunMs,
  loadBossRushRecord,
  loadEndlessRecord,
} from '../lib/postgame'
import type { AcademyRealmProgress, AcademyTrackProgress } from '../types/academy'
import type { RealmSpec, TrackId } from '../types/curriculum'
import {
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconFlame,
  IconLock,
} from '../components/icons'
import './QuestMapPage.css'

const TOTAL_MISSIONS = NEETCODE_150_MANIFEST.problems.length
const REALM_COUNT = NEETCODE_150_MANIFEST.realms.length

/* Journey-path geometry — a gentle wave rising left to right.
   Node positions double as CSS percentages for the HTML markers, so the
   container keeps the same 4:1 aspect ratio as the viewBox. */
const PATH_W = 1200
const PATH_H = 300
const NODE_POINTS = [
  { x: 70, y: 212 },
  { x: 282, y: 124 },
  { x: 494, y: 204 },
  { x: 706, y: 116 },
  { x: 918, y: 196 },
  { x: 1130, y: 108 },
] as const

function journeyPathD(): string {
  const half = (NODE_POINTS[1].x - NODE_POINTS[0].x) / 2
  let d = `M ${NODE_POINTS[0].x} ${NODE_POINTS[0].y}`
  for (let i = 1; i < NODE_POINTS.length; i++) {
    const a = NODE_POINTS[i - 1]
    const b = NODE_POINTS[i]
    d += ` C ${a.x + half} ${a.y}, ${b.x - half} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}
const JOURNEY_D = journeyPathD()

type RealmEntry = {
  index: number
  realm: RealmSpec
  progress: AcademyRealmProgress
  unlocked: boolean
  /** Skip-to-realm target: unlocked now, or ever reached on this account. */
  skipAvailable: boolean
  /** Run-passed: the realm boss is down and the trail moved on. */
  passed: boolean
  /** Strict mastery claim (assessment + retention + boss). */
  mastered: boolean
  /** Legacy world record — kept for the boss-battle route and boss flavor. */
  hubId: string
  bossName: string
}

export function QuestMapPage() {
  const { isGuest, displayName, isShowcaseAccount, identityId } = useAuth()
  const {
    ready,
    recordDailyActivity,
    academyProgress,
    academyCampaignComplete,
    interZoneComplete,
    readyForFinalGauntlet,
  } = useProgress()
  const { ready: gauntletReady, state: gauntlet } = useGauntlet()
  const location = useLocation()
  const routeNotice = (
    location.state as { academyNotice?: string } | null
  )?.academyNotice

  // Opening the map counts as showing up for the day.
  useEffect(() => {
    if (ready) recordDailyActivity()
  }, [ready, recordDailyActivity])

  // The most common exit is back into the 3D overworld — warm its chunk.
  useEffect(() => {
    prefetchOverworld()
  }, [])

  // The active run (fresh-run anchor + ledger). Held in state so skip /
  // reset re-derive the whole page in place, without a reload or navigation.
  const [freshRun, setFreshRun] = useState(() => loadFreshRunState())
  const runTour = freshRun?.tour ?? null

  // What this page PRESENTS: the run view. During a fresh run (reset or
  // skip) it is the masked/granted projection every other surface reads —
  // skipped realms show completed with a rematchable boss, a reset run shows
  // everything not-completed again. Durable evidence is never touched.
  const viewProgress = useMemo(
    () =>
      freshRun
        ? freshRunProgressView(academyProgress, freshRun)
        : academyProgress,
    [academyProgress, freshRun],
  )
  const trackProgressView = useCallback(
    (trackId: TrackId) => selectTrackProgress(viewProgress, trackId),
    [viewProgress],
  )

  // Durable "ever reached" memory: realms unlocked right now (durable
  // progress) and everything behind the active run's position are folded into
  // the identity-scoped set, so a run reset never re-locks skip destinations.
  const [reached, setReached] = useState<ReadonlySet<number>>(() =>
    loadRealmsReached(identityId),
  )
  useEffect(() => {
    if (!ready) return
    const seen: number[] = []
    NEETCODE_150_MANIFEST.realms.forEach((_, index) => {
      const state = academyWorldStateWithShowcase(
        isShowcaseAccount,
        academyProgress,
        index,
      )
      if (state.unlocked) seen.push(index)
    })
    if (runTour) {
      for (let i = 0; i <= Math.min(runTour.world, REALM_COUNT - 1); i++) {
        seen.push(i)
      }
    }
    setReached(recordRealmsReached(seen, identityId))
  }, [ready, academyProgress, isShowcaseAccount, identityId, runTour])

  const entries: RealmEntry[] = useMemo(
    () =>
      NEETCODE_150_MANIFEST.realms.map((realm, index) => {
        const progress = selectRealmProgress(viewProgress, realm.id)
        const state = academyWorldStateWithShowcase(
          isShowcaseAccount,
          viewProgress,
          index,
        )
        return {
          index,
          realm,
          progress,
          unlocked: state.unlocked,
          skipAvailable: state.unlocked || reached.has(index),
          passed: isRealmRunPassed(progress),
          mastered: progress.cleared,
          hubId: WORLDS[index]?.id ?? realm.id,
          bossName: WORLDS[index]?.boss.name ?? 'Realm boss',
        }
      }),
    [viewProgress, isShowcaseAccount, reached],
  )

  // "You are here": an active run's position is authoritative (it is what the
  // overworld plays); otherwise the first realm whose boss is still standing.
  const runWorld =
    runTour && runTour.world < REALM_COUNT ? runTour.world : null
  const firstUnpassedIndex = entries.findIndex((entry) => !entry.passed)
  const currentIndex = runWorld ?? firstUnpassedIndex
  const campaignDone = currentIndex < 0
  const current = campaignDone ? null : entries[currentIndex]

  const practicedTotal = Object.keys(viewProgress.missionPractices).length
  const overallPct = Math.round((practicedTotal / TOTAL_MISSIONS) * 100)
  const passedCount = entries.filter((entry) => entry.passed).length

  // What to do next inside the current realm: the first unpracticed mission,
  // or (all legs done) the realm assessment + boss. A replayed realm whose
  // boss is already down durably is a fresh-run replay.
  const nextUp = useMemo(() => {
    if (!current) return null
    if (current.passed) {
      return {
        kind: 'replay' as const,
        label: `Replay ${current.realm.title}`,
        detail: 'Fresh-run replay — solved missions and evidence stay saved',
      }
    }
    for (const trackId of current.realm.trackIds) {
      const track = trackProgressView(trackId)
      if (!track.practiceComplete && track.firstUnpracticedProblemId) {
        const problem = NEETCODE_150_PROBLEM_BY_ID.get(
          track.firstUnpracticedProblemId,
        )
        if (problem) {
          return {
            kind: 'mission' as const,
            label: problem.title,
            detail: NEETCODE_150_TRACK_BY_ID.get(trackId)?.title ?? '',
          }
        }
      }
    }
    return {
      kind: 'boss' as const,
      label: `Realm assessment + boss — ${current.bossName}`,
      detail: 'Score 80%+ on the gate quiz, then win the fight',
    }
  }, [current, trackProgressView])

  // Drill-in panel — defaults open on the current realm.
  const [expanded, setExpanded] = useState<number | null>(null)
  const openIndex = expanded ?? (campaignDone ? REALM_COUNT - 1 : currentIndex)

  // Path fill: fraction of the line behind the player, normalized (pathLength=100).
  const pathPct = campaignDone
    ? 100
    : (currentIndex / (REALM_COUNT - 1)) * 100

  const allComplete = academyCampaignCompleteWithShowcase(
    isShowcaseAccount,
    academyCampaignComplete,
  )
  const gauntletBannerReady = readyForFinalGauntletWithShowcase(
    isShowcaseAccount,
    readyForFinalGauntlet,
  )

  const bossRushBest = useMemo(
    () => loadBossRushRecord(undefined, identityId),
    [identityId],
  )
  const endlessBest = useMemo(
    () => loadEndlessRecord(undefined, identityId),
    [identityId],
  )

  // Both mutations are session-side writes; the page re-derives everything
  // (hero, path, drill-in) in place from the refreshed run anchor. The player
  // stays here and enters the city via "Continue in Code City" when ready.
  function restartGame() {
    if (
      !window.confirm(
        'Restart from Level 1. Skip-to-realm stays unlocked for every level you have already reached — solved missions and completion evidence stay saved too. Only the run position, hearts, and timer reset.',
      )
    ) {
      return
    }
    startFreshQuestRun()
    setFreshRun(loadFreshRunState())
    setExpanded(null)
  }

  function skipToRealm(entry: RealmEntry) {
    if (
      !window.confirm(
        `Jump to Level ${entry.index + 1} — ${entry.realm.title}? Earlier levels count as complete on this run and their boss fights open for a rematch. Your solved missions and evidence are untouched.`,
      )
    ) {
      return
    }
    skipRunToRealm(entry.index, identityId)
    setFreshRun(loadFreshRunState())
    setReached(loadRealmsReached(identityId))
    setExpanded(entry.index)
  }

  if (!ready || !gauntletReady) {
    return <Loader label="Restoring academy progress" night />
  }

  return (
    <div className="page quest-page">
      <div className="quest-bg" aria-hidden="true">
        <div className="quest-bg-grid" />
        <div className="quest-bg-orb quest-bg-orb--a" />
        <div className="quest-bg-orb quest-bg-orb--b" />
      </div>
      <AppHeader />

      <main className="container quest-main">
        {routeNotice && (
          <div className="quest-route-notice" role="status">
            {routeNotice}
          </div>
        )}

        {allComplete && !interZoneComplete && (
          <Link className="quest-gauntlet-banner is-threshold" to="/threshold">
            <span className="quest-gauntlet-icon" aria-hidden="true">
              <IconBolt size={22} />
            </span>
            <span className="quest-gauntlet-copy">
              <strong>Enter The Threshold</strong>
              <span>
                Code City is whole again — one last gate stands before the Final
                Gauntlet.
              </span>
            </span>
            <IconArrowRight size={18} className="quest-gauntlet-go" />
          </Link>
        )}

        {gauntletBannerReady && !gauntlet.examPassed && (
          <Link className="quest-gauntlet-banner" to="/final/journey">
            <span className="quest-gauntlet-icon" aria-hidden="true">
              <IconBolt size={22} />
            </span>
            <span className="quest-gauntlet-copy">
              <strong>The Final Gauntlet</strong>
              <span>
                A journey, a mastery test across all 18 topics, and a final boss
                unlike any other.
              </span>
            </span>
            <IconArrowRight size={18} className="quest-gauntlet-go" />
          </Link>
        )}

        {gauntletBannerReady && gauntlet.examPassed && (
          <section
            className={`quest-gauntlet-panel ${gauntlet.finalBossBeaten ? 'is-conquered' : ''}`}
            aria-label="The Final Gauntlet"
          >
            <div className="quest-gauntlet-panel-head">
              <span className="quest-gauntlet-icon" aria-hidden="true">
                <IconBolt size={22} />
              </span>
              <span className="quest-gauntlet-copy">
                <strong>
                  {gauntlet.finalBossBeaten
                    ? 'Final Gauntlet — Conquered'
                    : 'The Final Gauntlet'}
                </strong>
                <span>
                  {gauntlet.finalBossBeaten
                    ? 'You beat the Architect. Redo the fight from the Threshold or review the test.'
                    : `You passed the Certification Trial${gauntlet.bestScore ? ` — best ${gauntlet.bestScore}%` : ''}. Review, retake, or face the final boss.`}
                </span>
              </span>
            </div>
            <div className="quest-gauntlet-actions">
              {gauntlet.finalBossBeaten ? (
                <>
                  <Link className="quest-gauntlet-action is-primary" to="/threshold">
                    Redo boss fight
                    <IconArrowRight size={16} />
                  </Link>
                  <Link className="quest-gauntlet-action" to="/final/exam?mode=review">
                    Review test
                  </Link>
                </>
              ) : (
                <>
                  <Link className="quest-gauntlet-action" to="/final/exam?mode=review">
                    Review test
                  </Link>
                  <Link className="quest-gauntlet-action" to="/final/exam">
                    Retake test
                  </Link>
                  <Link className="quest-gauntlet-action is-primary" to="/final/boss">
                    Final boss fight
                    <IconArrowRight size={16} />
                  </Link>
                </>
              )}
            </div>
          </section>
        )}

        {allComplete && (
          <div className="quest-postgame">
            <Link className="quest-postgame-card" to="/gauntlet/boss-rush">
              <IconBolt size={18} />
              <span className="quest-postgame-copy">
                <strong>Boss Rush</strong>
                <span>
                  {bossRushBest
                    ? `Best clear ${formatRunMs(bossRushBest.bestMs)}`
                    : 'All six bosses back to back'}
                </span>
              </span>
              <IconArrowRight size={16} />
            </Link>
            <Link className="quest-postgame-card" to="/gauntlet/endless">
              <IconFlame size={18} />
              <span className="quest-postgame-copy">
                <strong>Endless Siege</strong>
                <span>
                  {endlessBest
                    ? `Best wave ${endlessBest.bestWave}`
                    : 'Wave survival, one life'}
                </span>
              </span>
              <IconArrowRight size={16} />
            </Link>
          </div>
        )}

        {/* ============ Hero status strip — readable in two seconds ========= */}
        <section className="quest-hero" aria-label="Your position">
          <div className="quest-hero-main">
            <span className="quest-hero-eyebrow">
              {isGuest ? 'You are here' : `You are here${displayName ? `, ${displayName}` : ''}`}
            </span>
            <h1 className="quest-hero-title">
              {campaignDone ? (
                'Campaign complete'
              ) : (
                <>
                  <span className="quest-hero-level">Level {currentIndex + 1}</span>
                  <span className="quest-hero-sep" aria-hidden="true" />
                  {current?.realm.title}
                </>
              )}
            </h1>
            {campaignDone ? (
              <p className="quest-hero-next">
                All 6 realm bosses are down. The Final Gauntlet awaits above.
              </p>
            ) : (
              <p className="quest-hero-next">
                <span className="quest-hero-next-label">Next</span>
                {nextUp?.kind === 'mission' ? (
                  <>
                    <strong>{nextUp.label}</strong>
                    <span className="quest-hero-next-detail">
                      {nextUp.detail} · mission{' '}
                      {(current?.progress.practicedProblems ?? 0) + 1} of{' '}
                      {current?.progress.totalProblems} in this realm
                    </span>
                  </>
                ) : (
                  <>
                    <strong>{nextUp?.label}</strong>
                    <span className="quest-hero-next-detail">{nextUp?.detail}</span>
                  </>
                )}
              </p>
            )}
            <div className="quest-hero-actions">
              <Link className="quest-continue" to="/quest">
                Continue in Code City
                <IconArrowRight size={17} />
              </Link>
              <button type="button" className="quest-restart" onClick={restartGame}>
                Reset run
              </button>
            </div>
          </div>

          <div className="quest-hero-meter" aria-label="Overall progress">
            <div className="quest-meter-pct">
              {overallPct}
              <span className="quest-meter-pct-sign">%</span>
            </div>
            <div
              className="quest-meter-bar"
              role="progressbar"
              aria-valuenow={practicedTotal}
              aria-valuemin={0}
              aria-valuemax={TOTAL_MISSIONS}
            >
              <span style={{ width: `${overallPct}%` }} />
            </div>
            <div className="quest-meter-facts">
              <span>
                {practicedTotal}/{TOTAL_MISSIONS} missions
              </span>
              <span>
                {passedCount}/{REALM_COUNT} realms
              </span>
            </div>
          </div>
        </section>

        {/* ============ The path — journey line through six realms ========== */}
        <section className="quest-journey" aria-label="Realm path">
          <div className="quest-journey-frame">
            <svg
              className="quest-journey-svg"
              viewBox={`0 0 ${PATH_W} ${PATH_H}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="qj-progress" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#5ef0e0" />
                  <stop offset="1" stopColor="#8f6bff" />
                </linearGradient>
              </defs>
              <path className="qj-base" d={JOURNEY_D} pathLength={100} />
              {pathPct > 0 && (
                <>
                  {/* dasharray "pct 200" + the dashoffset draw-in animation in
                      CSS renders exactly the completed portion of the line. */}
                  <path
                    className="qj-glow"
                    d={JOURNEY_D}
                    pathLength={100}
                    strokeDasharray={`${pathPct} 200`}
                  />
                  <path
                    className="qj-fill"
                    d={JOURNEY_D}
                    pathLength={100}
                    strokeDasharray={`${pathPct} 200`}
                  />
                </>
              )}
            </svg>

            <ol className="quest-journey-nodes">
              {entries.map((entry) => {
                const status = entry.passed
                  ? 'done'
                  : entry.index === currentIndex
                    ? 'current'
                    : entry.skipAvailable
                      ? 'open'
                      : 'locked'
                const point = NODE_POINTS[entry.index]
                const isOpen = openIndex === entry.index
                return (
                  <li
                    key={entry.realm.id}
                    className={`qj-node qj-node--${status} ${isOpen ? 'is-open' : ''}`}
                    style={{
                      ['--qj-x' as string]: `${(point.x / PATH_W) * 100}%`,
                      ['--qj-y' as string]: `${(point.y / PATH_H) * 100}%`,
                    }}
                  >
                    <button
                      type="button"
                      className="qj-node-btn"
                      aria-expanded={isOpen}
                      aria-controls="quest-realm-panel"
                      onClick={() =>
                        setExpanded(isOpen ? -1 : entry.index)
                      }
                    >
                      <span className="qj-dot">
                        {entry.passed ? (
                          <IconCheck size={16} />
                        ) : status === 'locked' ? (
                          <IconLock size={14} />
                        ) : (
                          entry.index + 1
                        )}
                      </span>
                      <span className="qj-label">
                        <span className="qj-label-level">Level {entry.index + 1}</span>
                        <span className="qj-label-name">{entry.realm.title}</span>
                        <span className="qj-label-count">
                          {entry.passed
                            ? entry.mastered
                              ? 'Mastered'
                              : 'Boss down'
                            : `${entry.progress.practicedProblems}/${entry.progress.totalProblems} missions`}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* ============ Drill-in: one realm elaborated ====================== */}
        {openIndex >= 0 && expanded !== -1 && (
          <RealmPanel
            entry={entries[openIndex]}
            isCurrent={openIndex === currentIndex}
            isGuest={isGuest}
            isShowcaseAccount={isShowcaseAccount}
            trackProgress={trackProgressView}
            onSkip={() => skipToRealm(entries[openIndex])}
          />
        )}
      </main>
    </div>
  )
}

function RealmPanel({
  entry,
  isCurrent,
  isGuest,
  isShowcaseAccount,
  trackProgress,
  onSkip,
}: {
  entry: RealmEntry
  isCurrent: boolean
  isGuest: boolean
  isShowcaseAccount: boolean
  trackProgress: (trackId: TrackId) => AcademyTrackProgress
  onSkip: () => void
}) {
  const { realm, progress } = entry
  const statusLabel = entry.mastered
    ? 'Mastered'
    : entry.passed
      ? 'Boss defeated — mastery pending'
      : isCurrent
        ? 'In progress'
        : entry.unlocked
          ? 'Ready'
          : 'Locked'

  return (
    <section
      id="quest-realm-panel"
      className={`quest-panel ${entry.unlocked ? '' : 'is-locked'}`}
      aria-label={`Level ${entry.index + 1} — ${realm.title}`}
    >
      <header className="quest-panel-head">
        <div className="quest-panel-title">
          <span className="quest-panel-eyebrow">Level {entry.index + 1}</span>
          <h2>{realm.title}</h2>
        </div>
        <span
          className={`quest-panel-status ${
            entry.mastered
              ? 'is-mastered'
              : entry.passed
                ? 'is-passed'
                : isCurrent
                  ? 'is-current'
                  : entry.unlocked
                    ? ''
                    : 'is-locked'
          }`}
        >
          {statusLabel}
        </span>
      </header>

      <div className="quest-panel-tracks">
        {realm.trackIds.map((trackId, leg) => {
          const track = NEETCODE_150_TRACK_BY_ID.get(trackId)
          if (!track) return null
          const tp = trackProgress(trackId)
          const preview = track.problemIds
            .slice(0, 3)
            .map((id) => NEETCODE_150_PROBLEM_BY_ID.get(id)?.title)
            .filter(Boolean)
            .join(' · ')
          const more = track.problemIds.length - 3
          const inner = (
            <>
              <span className="quest-track-leg">
                {tp.practiceComplete ? <IconCheck size={14} /> : leg + 1}
              </span>
              <span className="quest-track-body">
                <span className="quest-track-name">{track.title}</span>
                <span className="quest-track-preview">
                  {preview}
                  {more > 0 ? ` +${more} more` : ''}
                </span>
              </span>
              <span className="quest-track-count">
                {tp.practicedProblems}/{tp.totalProblems}
              </span>
            </>
          )
          return entry.unlocked ? (
            <Link
              key={trackId}
              className={`quest-track ${tp.practiceComplete ? 'is-done' : ''}`}
              to={academyTrackPath(realm.id, trackId)}
            >
              {inner}
            </Link>
          ) : (
            <div key={trackId} className="quest-track is-locked-row">
              {inner}
            </div>
          )
        })}

        <BossRow
          entry={entry}
          isGuest={isGuest}
          isShowcaseAccount={isShowcaseAccount}
        />
      </div>

      <div className="quest-panel-gates">
        <span className={`quest-gate ${progress.quizPassed ? 'is-done' : ''}`}>
          {progress.quizPassed ? <IconCheck size={13} /> : null}
          Realm quiz{' '}
          {progress.quizAttemptCount > 0
            ? `· best ${progress.quizBestScore}%`
            : '· 80% to pass'}
        </span>
        <span
          className={`quest-gate ${
            progress.completedProblems === progress.totalProblems ? 'is-done' : ''
          }`}
        >
          {progress.completedProblems === progress.totalProblems ? (
            <IconCheck size={13} />
          ) : null}
          Retention · {progress.completedProblems}/{progress.totalProblems}
        </span>
      </div>

      <footer className="quest-panel-actions">
        {entry.skipAvailable && (
          <button type="button" className="quest-panel-skip" onClick={onSkip}>
            Skip to this realm
            <IconArrowRight size={15} />
          </button>
        )}
        {!entry.unlocked && (
          <span className="quest-panel-locknote">
            <IconLock size={14} />
            {entry.skipAvailable
              ? 'Reached before — skip is open; missions unlock when the run gets here.'
              : `Defeat the Level ${entry.index} boss to unlock this realm.`}
          </span>
        )}
      </footer>
    </section>
  )
}

/**
 * The boss fight as the realm's fourth leg. Mirrors the retired realm-hub's
 * entry semantics exactly: a defeated boss (or the showcase account) may open
 * the arena directly at /battle/:worldId — BossBattlePage authorizes
 * token-less re-entry once the realm is run-passed. A first fight must be
 * entered physically through Code City (the boss gate grants the entry
 * token), so its action routes to /quest.
 */
function BossRow({
  entry,
  isGuest,
  isShowcaseAccount,
}: {
  entry: RealmEntry
  isGuest: boolean
  isShowcaseAccount: boolean
}) {
  const { progress } = entry
  const defeated = entry.passed
  const sealed = !defeated && progress.practicedTracks < 3
  const directEntry = !isGuest && (defeated || isShowcaseAccount)

  const detail = defeated
    ? entry.mastered
      ? 'Defeated — realm mastered. Rematch anytime.'
      : 'Defeated — rematch anytime.'
    : !entry.unlocked
      ? 'Waiting behind the earlier realms.'
      : isGuest
        ? 'Sign in to fight realm bosses and save the win.'
        : sealed
          ? 'Clear all 3 checkpoints to unseal the arena.'
          : progress.knowledgePassed
            ? 'Quiz passed — fight at the boss gate in Code City.'
            : 'Pass the realm quiz (80%), then fight at the boss gate.'

  const action = defeated
    ? 'Rematch'
    : isGuest
      ? 'Sign in'
      : directEntry
        ? 'Fight the boss'
        : 'Fight via Code City'

  const to = isGuest ? '/auth' : directEntry ? `/battle/${entry.hubId}` : '/quest'
  const interactive = entry.unlocked && !sealed

  const inner = (
    <>
      <span className="quest-track-leg quest-boss-leg">
        {defeated ? <IconCheck size={14} /> : <IconFlame size={13} />}
      </span>
      <span className="quest-track-body">
        <span className="quest-track-name">Boss — {entry.bossName}</span>
        <span className="quest-track-preview">{detail}</span>
      </span>
      <span className="quest-track-count quest-boss-action">
        {interactive ? action : <IconLock size={13} />}
      </span>
    </>
  )

  return interactive ? (
    <Link
      className={`quest-track quest-track--boss ${defeated ? 'is-done' : ''}`}
      to={to}
    >
      {inner}
    </Link>
  ) : (
    <div className="quest-track quest-track--boss is-locked-row">{inner}</div>
  )
}
