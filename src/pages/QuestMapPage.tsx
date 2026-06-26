import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { CodeBot, type CodeBotMood } from '../components/game/CodeBot'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { useGauntlet } from '../context/GauntletContext'
import { LESSON_CATALOG } from '../content/catalog'
import { WORLDS, WORLD_COUNT, codeBotStage, type World } from '../content/adventure'
import { getWorldState, listViewStatusLabel, type WorldState } from '../lib/questState'
import { canBrowseLevelInList } from '../lib/gameAccess'
import { CHECKPOINTS_PER_LEVEL } from '../lib/questLabels'
import { clearQuestRun, skipToLevel } from '../lib/questSession'
import type { LessonSummary } from '../types/lesson'
import {
  IconLock,
  IconCheck,
  IconFlame,
  IconBolt,
  IconArrowRight,
} from '../components/icons'
import './QuestMapPage.css'

const SUMMARY_BY_ID: Record<string, LessonSummary> = Object.fromEntries(
  LESSON_CATALOG.map((l) => [l.id, l]),
)

export function QuestMapPage() {
  const { isGuest, displayName } = useAuth()
  const {
    getLessonProgress,
    isLessonUnlocked,
    streak,
    totalBadgeCount,
    recordDailyActivity,
    interZoneComplete,
    readyForFinalGauntlet,
  } = useProgress()
  const { state: gauntlet } = useGauntlet()
  const navigate = useNavigate()

  // Opening the map counts as showing up for the day.
  useEffect(() => {
    recordDailyActivity()
  }, [recordDailyActivity])

  const states = useMemo(() => {
    return WORLDS.map((world) => {
      const summary = SUMMARY_BY_ID[world.id]
      const unlocked = summary ? isLessonUnlocked(summary) : false
      const progress = getLessonProgress(world.id)
      return { world, state: getWorldState(world.id, progress, unlocked) }
    })
  }, [getLessonProgress, isLessonUnlocked])

  const clearedCount = states.filter((s) => s.state.mastered).length
  const stageInfo = codeBotStage(clearedCount)

  // The active world = the first non-cleared, unlocked world.
  const activeIndex = states.findIndex(
    (s) => s.state.unlocked && s.state.status !== 'cleared',
  )
  const activeEntry = activeIndex >= 0 ? states[activeIndex] : null

  const allCleared = clearedCount >= WORLD_COUNT

  const greeting = buildGreeting({
    name: isGuest ? null : displayName,
    clearedCount,
    activeName: activeEntry?.world.name ?? null,
    allCleared,
  })

  const mood: CodeBotMood = allCleared ? 'celebrate' : clearedCount > 0 ? 'happy' : 'idle'

  function restartGame() {
    if (
      !window.confirm(
        'Restart the game from Level 1 · Checkpoint 1? Your finished lessons stay saved, but your run, hearts, and timer all reset.',
      )
    ) {
      return
    }
    clearQuestRun()
    navigate('/quest')
  }

  return (
    <div className="page quest-page">
      <AppHeader />

      <main className="container quest-main">
        {allCleared && !interZoneComplete && (
          <Link className="quest-gauntlet-banner is-threshold" to="/threshold">
            <span className="quest-gauntlet-icon" aria-hidden="true">
              <IconBolt size={26} />
            </span>
            <span className="quest-gauntlet-copy">
              <strong>Enter The Threshold</strong>
              <span>
                Code City is whole again — but one last gate stands between you and the
                Final Gauntlet. Step through The Threshold to prove you&apos;re ready.
              </span>
            </span>
            <IconArrowRight size={20} className="quest-gauntlet-go" />
          </Link>
        )}

        {readyForFinalGauntlet && !gauntlet.examPassed && (
          <Link className="quest-gauntlet-banner" to="/final/journey">
            <span className="quest-gauntlet-icon" aria-hidden="true">
              <IconBolt size={26} />
            </span>
            <span className="quest-gauntlet-copy">
              <strong>The Final Gauntlet</strong>
              <span>
                A journey, a mastery test of all six topics, and a final boss unlike any other.
              </span>
            </span>
            <IconArrowRight size={20} className="quest-gauntlet-go" />
          </Link>
        )}

        {readyForFinalGauntlet && gauntlet.examPassed && (
          <section
            className={`quest-gauntlet-panel ${gauntlet.finalBossBeaten ? 'is-conquered' : ''}`}
            aria-label="The Final Gauntlet"
          >
            <div className="quest-gauntlet-panel-head">
              <span className="quest-gauntlet-icon" aria-hidden="true">
                <IconBolt size={26} />
              </span>
              <span className="quest-gauntlet-copy">
                <strong>
                  {gauntlet.finalBossBeaten ? 'Final Gauntlet — Conquered' : 'The Final Gauntlet'}
                </strong>
                <span>
                  {gauntlet.finalBossBeaten
                    ? 'You beat the Architect. Revisit the Mastery Trial any time, or fight again.'
                    : `You passed the Mastery Trial${gauntlet.bestScore ? ` — best ${gauntlet.bestScore}%` : ''}. Review your answers, retake the test, or face the final boss.`}
                </span>
              </span>
            </div>
            <div className="quest-gauntlet-actions">
              <Link className="quest-gauntlet-action" to="/final/exam?mode=review">
                Review test
              </Link>
              <Link className="quest-gauntlet-action" to="/final/exam">
                Retake test
              </Link>
              <Link className="quest-gauntlet-action is-primary" to="/final/boss">
                Final boss fight
                <IconArrowRight size={18} />
              </Link>
            </div>
          </section>
        )}

        <section className="quest-hero">
          <div className="quest-hero-bot">
            <CodeBot stage={clearedCount} mood={mood} size={150} title={stageInfo.title} />
          </div>
          <div className="quest-hero-copy">
            <span className="eyebrow">CodeBot&apos;s Pattern Quest · List view</span>
            <div className="codebot-bubble quest-hero-bubble">
              <span className="codebot-bubble-name">CodeBot · {stageInfo.title}</span>
              {greeting}
            </div>
            <div className="quest-stats">
              <QuestStat
                icon={<IconBolt size={18} />}
                tone="violet"
                value={`${clearedCount}/${WORLD_COUNT}`}
                label="Powers earned"
              />
              <QuestStat
                icon={<IconFlame size={18} />}
                tone="yellow"
                value={`${streak.current}`}
                label="Day fuel streak"
              />
              <QuestStat
                icon={<IconCheck size={18} />}
                tone="lime"
                value={`${totalBadgeCount}`}
                label="Crystals collected"
              />
            </div>
          </div>
        </section>

        <section className="quest-list" aria-label="Level list">
          <div className="quest-list-head">
            <h2 className="quest-list-title">Levels</h2>
            <div className="quest-list-actions">
              <span className="quest-list-progress">
                {clearedCount}/{WORLD_COUNT} cleared
              </span>
              <button type="button" className="btn ghost sm quest-restart" onClick={restartGame}>
                Restart game
              </button>
            </div>
          </div>
          <ol className="quest-cards stagger">
            {states.map(({ world, state }, i) => {
              const prevMastered = i > 0 ? states[i - 1].state.mastered : false
              const canSkip =
                state.unlocked && (state.mastered || (i > 0 && prevMastered))
              return (
                <WorldCard
                  key={world.id}
                  world={world}
                  state={state}
                  number={i + 1}
                  isActive={i === activeIndex}
                  canSkip={canSkip}
                  onSkip={() => {
                    skipToLevel(i, { welcome: true })
                    navigate('/quest')
                  }}
                />
              )
            })}
          </ol>
        </section>
      </main>
    </div>
  )
}

function buildGreeting({
  name,
  clearedCount,
  activeName,
  allCleared,
}: {
  name: string | null
  clearedCount: number
  activeName: string | null
  allCleared: boolean
}) {
  const who = name ? `, ${name}` : ''
  if (allCleared) {
    return (
      <p>
        We did it{who}! Every power earned and every boss beaten. You&apos;re a true{' '}
        <strong>Code Master</strong>. Replay any level to keep your skills sharp!
      </p>
    )
  }
  if (clearedCount === 0) {
    return (
      <p>
        Hi{who}! I&apos;m <strong>CodeBot</strong>. Train me in each world to unlock coding
        superpowers, then beat the boss to move on. Ready for <strong>{activeName}</strong>?
      </p>
    )
  }
  return (
    <p>
      {clearedCount === 1 ? 'One power down' : `${clearedCount} powers down`}
      {who}! Next stop: <strong>{activeName}</strong>. Let&apos;s go earn another one.
    </p>
  )
}

function QuestStat({
  icon,
  tone,
  value,
  label,
}: {
  icon: ReactNode
  tone: 'violet' | 'yellow' | 'lime'
  value: string
  label: string
}) {
  return (
    <div className="quest-stat">
      <span className={`quest-stat-icon tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div className="quest-stat-body">
        <span className="quest-stat-value">{value}</span>
        <span className="quest-stat-label muted">{label}</span>
      </div>
    </div>
  )
}

function WorldCard({
  world,
  state,
  number,
  isActive,
  canSkip,
  onSkip,
}: {
  world: World
  state: WorldState
  number: number
  isActive: boolean
  canSkip: boolean
  onSkip: () => void
}) {
  const PowerIcon = world.power.Icon
  const cleared = state.status === 'cleared'
  const courseLocked = state.status === 'locked'
  const gameLocked = !canBrowseLevelInList(state)
  const lessonDone = state.learnDone
  // The real coding topic this level teaches (e.g. "Binary Search").
  const topic = SUMMARY_BY_ID[world.id]?.title

  const medallion = (
    <span
      className="quest-card-medallion"
      style={{
        background: courseLocked ? 'var(--surface-2)' : world.theme.accentSoft,
        color: world.theme.accentInk,
      }}
    >
      {courseLocked ? <IconLock size={22} /> : cleared ? <PowerIcon size={24} /> : <span className="quest-card-number">{number}</span>}
    </span>
  )

  const inner = (
    <>
      {isActive && <span className="quest-card-flag">Current</span>}
      {cleared && (
        <span className="quest-card-flag is-clear">
          <IconCheck size={12} /> Cleared
        </span>
      )}
      {medallion}
      <div className="quest-card-body">
        <span className="quest-card-name">Level {number} · {world.name}</span>
        {topic && <span className="quest-card-topic">{topic}</span>}
        <span className="quest-card-blurb">{world.power.name} · {CHECKPOINTS_PER_LEVEL} checkpoints + boss</span>
        {/* Cleared cards already show the corner badge — drop the redundant
            pills + status line so the card stays clean. */}
        {!cleared && (
          <>
            <div className="quest-card-pills">
              <span className={`quest-pill ${lessonDone ? 'is-done' : courseLocked || gameLocked ? 'is-locked' : 'is-todo'}`}>
                {lessonDone ? <IconCheck size={12} /> : null}
                Checkpoints
              </span>
              <span className={`quest-pill ${!lessonDone || courseLocked || gameLocked ? 'is-locked' : 'is-todo'}`}>
                Boss
              </span>
            </div>
            <span className="quest-card-status">{listViewStatusLabel(state)}</span>
          </>
        )}
        {canSkip && (
          <button
            type="button"
            className="quest-skip-btn"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSkip()
            }}
          >
            Skip to Level {number}
          </button>
        )}
      </div>
      {!courseLocked && !gameLocked && <IconArrowRight size={18} className="quest-card-go" />}
    </>
  )

  const className = `quest-card quest-card--${state.status} ${isActive ? 'is-active' : ''} ${gameLocked && !courseLocked ? 'is-game-locked' : ''}`
  const style = { ['--world-accent' as string]: world.theme.accent }

  if (courseLocked) {
    return (
      <li className={className} style={style} aria-disabled="true">
        {inner}
      </li>
    )
  }

  if (gameLocked) {
    return (
      <li className={className} style={style}>
        <Link className="quest-card-link" to="/quest">
          {inner}
        </Link>
      </li>
    )
  }

  return (
    <li className={className} style={style}>
      <Link className="quest-card-link" to={`/world/${world.id}`}>
        {inner}
      </Link>
    </li>
  )
}
