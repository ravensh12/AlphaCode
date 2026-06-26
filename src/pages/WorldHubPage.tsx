import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { CodeBot } from '../components/game/CodeBot'
import { PowerUnlock } from '../components/game/PowerUnlock'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { LESSON_CATALOG, MASTERY_UNLOCK_THRESHOLD } from '../content/catalog'
import { WORLDS, getWorld } from '../content/adventure'
import { getNeetCodeReadiness } from '../content/neetcodeReadiness'
import { getWorldState } from '../lib/questState'
import { canBrowseLevelInList } from '../lib/gameAccess'
import type { LessonSummary } from '../types/lesson'
import {
  IconArrowLeft,
  IconArrowRight,
  IconLock,
  IconCheck,
  IconBolt,
} from '../components/icons'
import './WorldHubPage.css'

const SUMMARY_BY_ID: Record<string, LessonSummary> = Object.fromEntries(
  LESSON_CATALOG.map((l) => [l.id, l]),
)

function powerSeenKey(lessonId: string) {
  return `alphacode.power.${lessonId}`
}

export function WorldHubPage() {
  const { lessonId } = useParams()
  const { isGuest } = useAuth()
  const { getLessonProgress, isLessonUnlocked, lessons } = useProgress()
  const [celebrate, setCelebrate] = useState(false)

  const world = lessonId ? getWorld(lessonId) : undefined

  const clearedCount = useMemo(
    () =>
      WORLDS.filter((w) => {
        const summary = SUMMARY_BY_ID[w.id]
        const unlocked = summary ? isLessonUnlocked(summary) : false
        return getWorldState(w.id, getLessonProgress(w.id), unlocked).mastered
      }).length,
    // lessons changes whenever progress updates
    [getLessonProgress, isLessonUnlocked, lessons],
  )

  const summary = world ? SUMMARY_BY_ID[world.id] : undefined
  const unlocked = summary ? isLessonUnlocked(summary) : false
  const progress = world ? getLessonProgress(world.id) : undefined
  const state = world ? getWorldState(world.id, progress, unlocked) : undefined

  // Show the power-unlock celebration once, the first time a boss is beaten.
  useEffect(() => {
    if (!world || !state?.mastered) return
    try {
      if (!localStorage.getItem(powerSeenKey(world.id))) {
        setCelebrate(true)
      }
    } catch {
      /* localStorage unavailable — skip celebration */
    }
  }, [world, state?.mastered])

  if (!world) {
    return <Navigate to="/quest" replace />
  }
  if (!state) {
    return <Navigate to="/quest" replace />
  }

  const accent = world.theme.accent
  const themeStyle = {
    ['--world-accent' as string]: accent,
    ['--world-accent-soft' as string]: world.theme.accentSoft,
    ['--world-accent-ink' as string]: world.theme.accentInk,
  }

  const index = world.index
  const prevWorld = index > 0 ? WORLDS[index - 1] : null
  const PowerIcon = world.power.Icon
  const readiness = getNeetCodeReadiness(world.id)

  function closeCelebration() {
    try {
      localStorage.setItem(powerSeenKey(world!.id), '1')
    } catch {
      /* ignore */
    }
    setCelebrate(false)
  }

  // ---- Locked world ----
  if (state.status === 'locked') {
    return (
      <div className="page world-page" style={themeStyle}>
        <AppHeader />
        <main className="container world-main">
          <BackToMap />
          <div className="world-locked card">
            <CodeBot stage={clearedCount} mood="sad" size={140} />
            <h1 className="world-locked-title">{world.name} is sealed</h1>
            <p className="muted">
              {isGuest
                ? 'This world is part of the full adventure. Sign in to unlock the whole map and save CodeBot’s powers.'
                : prevWorld
                  ? `Beat the boss of ${prevWorld.name} to open the path to ${world.name}.`
                  : 'Keep going to open this world.'}
            </p>
            {isGuest ? (
              <Link className="btn lg" to="/auth">
                Sign in to continue
                <IconArrowRight size={18} />
              </Link>
            ) : prevWorld ? (
              <Link className="btn lg" to={`/world/${prevWorld.id}`}>
                Go to {prevWorld.name}
                <IconArrowRight size={18} />
              </Link>
            ) : null}
          </div>
        </main>
      </div>
    )
  }

  // In-progress levels: lessons and boss are only reachable from the overworld.
  if (!canBrowseLevelInList(state)) {
    return (
      <div className="page world-page" style={themeStyle}>
        <AppHeader />
        <main className="container world-main">
          <BackToMap />
          <div className="world-locked card">
            <CodeBot stage={clearedCount} mood="idle" size={140} accent={accent} />
            <h1 className="world-locked-title">{world.name} — play in Code City</h1>
            <p className="muted">
              Checkpoints and the boss unlock as you reach them in the 3D overworld. Follow the
              trail, beat the timer, and press <strong>E</strong> at each building — you can&apos;t
              skip ahead from the list until you&apos;ve cleared this level.
            </p>
            <Link className="btn lg" to="/quest">
              Open Code City
              <IconArrowRight size={18} />
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const { learnDone, quizStarted, mastered, mastery } = state
  const charge = Math.min(100, Math.round((mastery / MASTERY_UNLOCK_THRESHOLD) * 100))

  // Boss is fightable once training is done (and, for guests, blocked at quiz).
  const bossLockedForGuest = isGuest
  const bossLocked = !learnDone || bossLockedForGuest

  return (
    <div className="page world-page" style={themeStyle}>
      <AppHeader />

      {celebrate && (
        <PowerUnlock
          world={world}
          clearedCount={clearedCount}
          isFinal={index === WORLDS.length - 1}
          onClose={closeCelebration}
        />
      )}

      <main className="container world-main">
        <BackToMap />

        <section className="world-banner" >
          <div className="world-banner-bot">
            <CodeBot
              stage={clearedCount}
              mood={mastered ? 'celebrate' : 'happy'}
              size={140}
              accent={accent}
            />
          </div>
          <div className="world-banner-copy">
            <span className="world-eyebrow">
              World {index + 1} of {WORLDS.length}
            </span>
            <h1 className="world-title">{world.name}</h1>
            {summary?.title && <span className="world-topic">{summary.title}</span>}
            <p className="world-blurb">{world.blurb}</p>
            <div className="codebot-bubble world-bubble">
              <span className="codebot-bubble-name">CodeBot</span>
              <p>{mastered ? `${world.power.name} earned! Replay anytime to stay sharp.` : world.intro}</p>
            </div>
          </div>
        </section>

        {/* Power chip — what this world grants */}
        <section className={`world-power ${mastered ? 'is-earned' : 'is-locked'}`}>
          <span className="world-power-icon">
            {mastered ? <PowerIcon size={26} /> : <IconLock size={22} />}
          </span>
          <div className="world-power-copy">
            <span className="world-power-label">
              {mastered ? 'Power earned' : 'Power to earn'}
            </span>
            <strong className="world-power-name">{world.power.name}</strong>
            <span className="world-power-desc muted">{world.power.description}</span>
          </div>
        </section>

        {/* Two missions: Train + Boss */}
        <section className="world-missions stagger">
          <MissionCard
            kind="train"
            title="Train"
            subtitle="Learn the pattern"
            description="Visual lessons and guided tracing — CodeBot walks you through every step."
            status={
              learnDone ? 'Training complete' : quizStarted ? 'Training complete' : state.status === 'training' ? 'In progress' : 'Ready'
            }
            done={learnDone}
            action={learnDone ? 'Review training' : state.status === 'training' ? 'Resume' : 'Start training'}
            to={`/lesson/${world.id}/learn`}
            locked={false}
          />

          <MissionCard
            kind="boss"
            title="Boss Fight"
            subtitle={world.boss.name}
            description={
              mastered
                ? world.boss.defeat
                : bossLockedForGuest
                  ? 'Sign in to take on the boss and save your powers.'
                  : !learnDone
                    ? 'Finish training to challenge the boss.'
                    : world.boss.taunt
            }
            status={
              mastered
                ? 'Defeated'
                : !learnDone
                  ? 'Locked'
                  : state.status === 'review'
                    ? `Rematch · ${mastery}%`
                    : quizStarted
                      ? `In battle · ${mastery}%`
                      : 'Ready'
            }
            done={mastered}
            action={
              mastered
                ? 'Rematch boss'
                : state.status === 'review'
                  ? 'Continue rematch'
                  : quizStarted
                    ? 'Continue fight'
                    : 'Fight the boss'
            }
            to={bossLockedForGuest ? '/auth' : `/battle/${world.id}`}
            locked={bossLocked && !bossLockedForGuest}
            guestLocked={bossLockedForGuest}
          />
        </section>

        {/* Boss power charge bar */}
        {learnDone && !bossLockedForGuest && (
          <section className="world-charge card">
            <div className="world-charge-head">
              <span className="world-charge-label">
                {mastered ? 'Boss defeated' : 'Power charge to defeat the boss'}
              </span>
              <span className="world-charge-value">
                {mastered ? <IconCheck size={18} /> : `${mastery}% / ${MASTERY_UNLOCK_THRESHOLD}%`}
              </span>
            </div>
            <div className="world-charge-track">
              <div
                className={`world-charge-fill ${mastered ? 'is-full' : ''}`}
                style={{ width: `${mastered ? 100 : charge}%` }}
              />
            </div>
            <p className="world-charge-hint muted">
              {mastered
                ? 'You mastered this pattern. CodeBot is stronger because of you!'
                : `Answer boss questions correctly on the first try to charge up. Reach ${MASTERY_UNLOCK_THRESHOLD}% to win.`}
            </p>
          </section>
        )}

        {/* Real-world missions unlocked */}
        {mastered && readiness && (
          <section className="world-missions-real card">
            <div className="world-missions-real-head">
              <IconBolt size={18} />
              <h2>Side quests unlocked</h2>
            </div>
            <p className="muted">
              You learned <strong>{readiness.patternLearned}</strong>. CodeBot says you&apos;re
              ready to try these NeetCode-style problems for real:
            </p>
            <ul className="world-missions-real-list">
              {readiness.readyFor.map((problem) => (
                <li key={problem}>
                  <IconCheck size={15} />
                  {problem}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}

function BackToMap() {
  return (
    <Link className="world-back" to="/quest/list">
      <IconArrowLeft size={18} />
      Back to list
    </Link>
  )
}

function MissionCard({
  kind,
  title,
  subtitle,
  description,
  status,
  done,
  action,
  to,
  locked,
  guestLocked,
}: {
  kind: 'train' | 'boss'
  title: string
  subtitle: string
  description: string
  status: string
  done: boolean
  action: string
  to: string
  locked: boolean
  guestLocked?: boolean
}) {
  const className = `world-mission world-mission--${kind} ${done ? 'is-done' : ''} ${
    locked ? 'is-locked' : ''
  }`

  const inner = (
    <>
      <div className="world-mission-top">
        <span className="world-mission-kind">{title}</span>
        <span className="world-mission-status">
          {locked && <IconLock size={13} />}
          {done && <IconCheck size={13} />}
          {status}
        </span>
      </div>
      <h3 className="world-mission-subtitle">{subtitle}</h3>
      <p className="world-mission-desc">{description}</p>
      {!locked && (
        <span className="world-mission-action">
          {action}
          <IconArrowRight size={16} />
        </span>
      )}
    </>
  )

  if (locked) {
    return (
      <div className={className} aria-disabled="true">
        {inner}
      </div>
    )
  }

  return (
    <Link className={className} to={to}>
      {guestLocked && <span className="world-mission-guest">Sign in</span>}
      {inner}
    </Link>
  )
}
