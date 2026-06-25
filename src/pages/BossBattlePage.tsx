import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { BossArena } from '../components/game3d/BossArena'
import { LessonRunner } from './LessonPage'
import { Loader } from '../components/Loader'
import { useAuth } from '../context/AuthContext'
import { useProgress } from '../context/ProgressContext'
import { LESSON_CATALOG } from '../content/catalog'
import { WORLDS, getWorld } from '../content/adventure'
import { generateLesson } from '../content/lessons'
import { isLearnComplete } from '../lib/lessonSections'
import { getBonusQuestion } from '../content/bonusQuestions'
import { canAccessBossFight } from '../lib/gameAccess'
import { getWorldState } from '../lib/questState'
import { BOSS_DONE_KEY } from '../lib/questSession'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import type { LessonSummary } from '../types/lesson'
import { IconArrowLeft } from '../components/icons'
import './BossBattlePage.css'

const SUMMARY_BY_ID: Record<string, LessonSummary> = Object.fromEntries(
  LESSON_CATALOG.map((l) => [l.id, l]),
)

type Phase = 'intro' | 'quiz' | 'fight' | 'won' | 'lost'

export function BossBattlePage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { isGuest } = useAuth()
  const { ready, getLessonProgress, isLessonUnlocked, saveLessonProgress, logAttempt, restartQuizProgress, streak } =
    useProgress()

  const world = lessonId ? getWorld(lessonId) : undefined

  const fullLesson = lessonId ? generateLesson(lessonId) : undefined
  const progress = lessonId ? getLessonProgress(lessonId) : undefined
  const summary = lessonId ? SUMMARY_BY_ID[lessonId] : undefined
  const unlocked = summary ? isLessonUnlocked(summary) : false
  const learnDone = fullLesson ? isLearnComplete(progress, fullLesson) : false
  const worldState = world ? getWorldState(world.id, progress, unlocked) : undefined
  const mastered = worldState?.mastered ?? false
  const canBattle = !!world && ready && !isGuest && unlocked && learnDone

  const [phase, setPhase] = useState<Phase>('intro')
  // Bump to remount the arena for a fresh fight attempt.
  const [fightRun, setFightRun] = useState(0)

  // Fresh quiz each time we enter the intro (mount + retry). Guarded so it only
  // fires once per intro entry.
  const introReadyRef = useRef(false)
  useEffect(() => {
    if (!canBattle || !world) return
    if (phase === 'intro') {
      if (!introReadyRef.current) {
        introReadyRef.current = true
        restartQuizProgress(world.id)
      }
    } else {
      introReadyRef.current = false
    }
  }, [phase, canBattle, world, restartQuizProgress])

  function handleAttempt(a: AttemptRecord) {
    logAttempt(a)
  }

  function handleSave(p: LessonProgress) {
    saveLessonProgress(p)
  }

  // Finishing the quiz (pass OR miss — no review loop) always leads to the fight.
  function handleQuizComplete() {
    setFightRun((r) => r + 1)
    setPhase('fight')
  }

  // Winning the fight is what clears the level (marks it mastered so the
  // overworld advances and the next gun unlocks).
  function handleWin() {
    if (world) {
      const current = getLessonProgress(world.id)
      if (current) {
        saveLessonProgress({
          ...current,
          status: 'completed',
          unlockNextLesson: true,
          masteryScore: Math.max(current.masteryScore ?? 0, 100),
        })
      }
      // Signal the overworld to advance the tour — only because the boss was
      // beaten on THIS run, not because the lesson was mastered previously.
      try {
        sessionStorage.setItem(BOSS_DONE_KEY, String(world.index))
      } catch {
        /* ignore */
      }
    }
    setPhase('won')
  }

  // A fresh bonus question each fight attempt (random from this level's lesson).
  const bonusQuestion = useMemo(
    () => (world ? getBonusQuestion(world.id) : null),
    [world, fightRun],
  )

  if (!world) return <Navigate to="/quest" replace />
  if (!ready) return <Loader label="Entering the arena" />
  if (isGuest) return <Navigate to="/auth" replace />
  if (!unlocked) return <Navigate to="/quest" replace />
  if (!learnDone) return <Navigate to="/quest" replace />
  if (!canAccessBossFight(world.index, mastered)) return <Navigate to="/quest" replace />

  const accent = world.theme.accent

  // --- Playable gun fight ---------------------------------------------------
  if (phase === 'fight') {
    return (
      <div className="battle-page">
        <BossArena
          key={`arena-${fightRun}`}
          accent={accent}
          variant={world.index}
          bossName={world.boss.name}
          bonusQuestion={bonusQuestion}
          onWin={handleWin}
          onLose={() => setPhase('lost')}
          onFlee={() => navigate('/quest')}
        />
      </div>
    )
  }

  // --- Victory --------------------------------------------------------------
  if (phase === 'won') {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay" key="victory">
            <div className="battle-result-card win">
              <span className="battle-result-tag">Victory</span>
              <h2>You defeated {world.boss.name}!</h2>
              <p>{world.boss.defeat}</p>
              <button className="battle-btn battle-btn-primary" onClick={() => navigate('/quest')}>
                Advance
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Fell in the fight: retry the fight (quiz already mastered) ----------
  if (phase === 'lost') {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay" key="lost">
            <div className="battle-result-card lose">
              <span className="battle-result-tag">Down!</span>
              <h2>{world.boss.name} knocked you out!</h2>
              <p>You&rsquo;ve got the knowledge — get back in there and finish the fight.</p>
              <div className="battle-result-actions">
                <button
                  className="battle-btn battle-btn-primary"
                  onClick={() => {
                    setFightRun((r) => r + 1)
                    setPhase('fight')
                  }}
                >
                  Fight again
                </button>
                <button className="battle-btn battle-btn-ghost" onClick={() => navigate('/quest')}>
                  Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- Intro + quiz ---------------------------------------------------------
  const nextWorld = WORLDS[world.index + 1]

  return (
    <div className="battle-page">
      {phase === 'intro' && (
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <button className="battle-flee" onClick={() => navigate('/quest')}>
            <IconArrowLeft size={16} />
            Flee
          </button>
          <div className="battle-overlay" key={`intro-${world.id}`}>
            <div className="battle-intro-card">
              <span className="battle-intro-vs">Boss Battle · Level {world.index + 1}</span>
              <h1>{world.boss.name}</h1>
              <p className="battle-intro-taunt">{world.boss.taunt}</p>
              <p className="battle-intro-hint">
                First, answer the quiz. Then face {world.boss.name} in a live blaster fight — beat
                the boss to clear the level. He&rsquo;s tough, so keep moving and dodge his orbs!
              </p>
              <button className="battle-btn battle-btn-primary" onClick={() => setPhase('quiz')}>
                Start quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'quiz' && (
        <div className="battle-quiz battle-quiz-full">
          <LessonRunner
            lessonId={world.id}
            section="quiz"
            initial={undefined}
            onSave={handleSave}
            onAttempt={handleAttempt}
            streakCurrent={streak.current}
            nextLessonTitle={nextWorld?.name ?? null}
            isLastLesson={world.index === WORLDS.length - 1}
            onNext={() => navigate('/quest')}
            onTakeQuiz={() => {}}
            onExit={() => navigate('/quest')}
            onQuizComplete={handleQuizComplete}
            embedded
          />
        </div>
      )}
    </div>
  )
}
