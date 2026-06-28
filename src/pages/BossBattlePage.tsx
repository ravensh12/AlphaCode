import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { BossArena } from '../components/game3d/BossArena'
import { VEX_INTRO, VEX_DEFEAT } from '../content/finalGauntletLore'
import { LessonRunner } from './LessonPage'
import { ReviewTutor, type ReviewTutorItem } from '../components/ReviewTutor'
import type { LessonResult } from '../hooks/useLessonEngine'
import { masteryBand, bandLabel } from '../lib/mastery'
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
import { playClick } from '../lib/soundFx'
import type { AttemptRecord, LessonProgress } from '../types/progress'
import type { LessonSummary } from '../types/lesson'
import { IconArrowLeft } from '../components/icons'
import './BossBattlePage.css'

const SUMMARY_BY_ID: Record<string, LessonSummary> = Object.fromEntries(
  LESSON_CATALOG.map((l) => [l.id, l]),
)

// Only the final world uses the heavy cinematic VEX fight (the full post stack,
// reflective floor, VexBoss rig and VFX engine). Splitting it out of the main
// battle chunk means a regular boss fight no longer downloads/parses that whole
// module graph at the moment the player presses E — a big chunk-parse win on
// the common entry path.
const CinematicBossArena = lazy(() =>
  import('../components/game3d/CinematicBossArena').then((m) => ({ default: m.CinematicBossArena })),
)

type Phase = 'intro' | 'quiz' | 'result' | 'fight' | 'won' | 'lost'

export function BossBattlePage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { isGuest } = useAuth()
  const { ready, getLessonProgress, isLessonUnlocked, saveLessonProgress, logAttempt, restartQuizProgress, streak } =
    useProgress()

  const world = lessonId ? getWorld(lessonId) : undefined

  // generateLesson rebuilds the entire lesson object (steps + checkpoints) on
  // every call; memoize it so phase changes / HUD-driven re-renders don't redo
  // that synchronous work each render.
  const fullLesson = useMemo(() => (lessonId ? generateLesson(lessonId) : undefined), [lessonId])
  const progress = lessonId ? getLessonProgress(lessonId) : undefined
  const summary = lessonId ? SUMMARY_BY_ID[lessonId] : undefined
  const unlocked = summary ? isLessonUnlocked(summary) : false
  const learnDone = fullLesson ? isLearnComplete(progress, fullLesson) : false
  const worldState = world ? getWorldState(world.id, progress, unlocked) : undefined
  const mastered = worldState?.mastered ?? false
  const canBattle = !!world && ready && !isGuest && unlocked && learnDone
  // The final world swaps the quiz->blaster flow for the flagship VEX fight.
  const isFinalWorld = !!world && world.index === WORLDS.length - 1

  const [phase, setPhase] = useState<Phase>('intro')
  // Bump to remount the arena for a fresh fight attempt.
  const [fightRun, setFightRun] = useState(0)
  // Bump to remount the quiz for a retake.
  const [quizRound, setQuizRound] = useState(0)
  // The most recent quiz result, shown on the post-quiz results screen.
  const [quizResult, setQuizResult] = useState<LessonResult | null>(null)
  const [showReview, setShowReview] = useState(false)
  // The overworld entry token is one-time use, so decide access once and cache
  // it — re-renders must not re-consume the token and bounce the player out.
  const bossAccessRef = useRef<{ key: number; ok: boolean } | null>(null)

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

  // The cinematic VEX fight is lazy-split; warm its chunk the moment we land on
  // the final world's intro so it's parsed and ready by the time the player
  // clicks through to the fight (no Suspense stall mid-transition).
  useEffect(() => {
    if (isFinalWorld) void import('../components/game3d/CinematicBossArena')
  }, [isFinalWorld])

  function handleAttempt(a: AttemptRecord) {
    logAttempt(a)
  }

  function handleSave(p: LessonProgress) {
    saveLessonProgress(p)
  }

  // Finishing the quiz shows a results screen: score, then review / retake / fight.
  function handleQuizComplete(result?: LessonResult) {
    setQuizResult(result ?? null)
    setShowReview(false)
    setPhase('result')
  }

  function retakeQuiz() {
    if (world) restartQuizProgress(world.id)
    setQuizResult(null)
    setQuizRound((r) => r + 1)
    setPhase('quiz')
  }

  function continueToFight() {
    setFightRun((r) => r + 1)
    setPhase('fight')
  }

  // Once a level's quiz has been mastered, let the player jump straight to the
  // fight on a rematch instead of re-answering everything.
  function skipToFight() {
    playClick()
    setFightRun((r) => r + 1)
    setPhase('fight')
  }

  // Winning the fight clears the level and advances the campaign, but it no
  // longer fakes a perfect score — the embedded quiz drives masteryScore, so the
  // recorded mastery honestly reflects how well the player answered.
  function handleWin() {
    if (world) {
      const current = getLessonProgress(world.id)
      if (current) {
        saveLessonProgress({
          ...current,
          status: 'completed',
          unlockNextLesson: true,
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
  if (bossAccessRef.current?.key !== world.index) {
    bossAccessRef.current = { key: world.index, ok: canAccessBossFight(world.index, mastered) }
  }
  if (!bossAccessRef.current.ok) return <Navigate to="/quest" replace />

  const accent = world.theme.accent
  const lessonTitle = summary?.title ?? 'this lesson'

  // === POST-QUIZ RESULTS — score, then review / retake / fight =============
  if (phase === 'result') {
    const r = quizResult
    const items = (r?.stepReviews ?? []).filter((s) => s.targetVariables.length > 0)
    const total = items.length
    const firstTry = r?.correctFirstTry ?? 0
    const score = r?.masteryScore ?? 0
    const band = masteryBand(score)
    const reviewItems: ReviewTutorItem[] = [...items]
      .sort((a, b) => Number(b.missed) - Number(a.missed))
      .map((s, i) => ({
        label: `Q${i + 1}${s.missed ? ' · missed' : ''}`,
        context: { prompt: s.prompt, code: s.code, concept: lessonTitle, hint: '', answered: true },
      }))
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay" key="quiz-result">
            <div className="battle-result-card" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
              <span className="battle-result-tag">Quiz complete</span>
              <h2>{score}% mastery</h2>
              <p>
                {total > 0
                  ? `You got ${firstTry} of ${total} right on the first try — ${bandLabel(band)}.`
                  : 'Nice work — now face the boss.'}
              </p>
              <div className="battle-result-actions">
                <button className="battle-btn battle-btn-primary" onClick={continueToFight}>
                  Continue to boss fight →
                </button>
                {reviewItems.length > 0 && (
                  <button className="battle-btn battle-btn-ghost" onClick={() => setShowReview((s) => !s)}>
                    {showReview ? 'Hide review' : 'Review answers'}
                  </button>
                )}
                <button className="battle-btn battle-btn-ghost" onClick={retakeQuiz}>
                  Retake quiz
                </button>
              </div>
              {showReview && reviewItems.length > 0 && (
                <ReviewTutor items={reviewItems} heading="Review with Bit" />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === FLAGSHIP FINAL WORLD: VEX, the Null Herald ===========================
  // Pure-skill cinematic boss — no quiz. Winning leads into the Threshold zone.
  if (isFinalWorld) {
    if (phase === 'fight') {
      return (
        <div className="battle-page">
          <Suspense fallback={<Loader label="Entering the arena" />}>
            <CinematicBossArena
              key={`vex-${fightRun}`}
              bossName="VEX"
              accent={accent}
              loadout={null}
              onWin={handleWin}
              onLose={() => setPhase('lost')}
              onFlee={() => navigate('/quest')}
            />
          </Suspense>
        </div>
      )
    }

    if (phase === 'won') {
      return (
        <div className="battle-page">
          <div className="battle-stage battle-stage--full battle-vex-stage">
            <div className="battle-backdrop battle-vex-backdrop" style={{ ['--accent' as string]: accent }} />
            <div className="battle-overlay" key="vex-victory">
              <div className="battle-result-card win battle-vex-card battle-vex-card--win">
                <span className="battle-result-tag battle-vex-tag">The Null Herald Falls</span>
                <h2 className="battle-vex-title">VEX is undone</h2>
                <p className="battle-vex-lore">{VEX_DEFEAT}</p>
                <button
                  className="battle-btn battle-btn-primary battle-vex-btn"
                  onClick={() => navigate('/threshold')}
                >
                  Enter the Threshold
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (phase === 'lost') {
      return (
        <div className="battle-page">
          <div className="battle-stage battle-stage--full battle-vex-stage">
            <div className="battle-backdrop battle-vex-backdrop" style={{ ['--accent' as string]: accent }} />
            <div className="battle-overlay" key="vex-lost">
              <div className="battle-result-card lose battle-vex-card battle-vex-card--lose">
                <span className="battle-result-tag battle-vex-tag">Unmade</span>
                <h2 className="battle-vex-title">VEX overwrote you</h2>
                <p className="battle-vex-lore">
                  &ldquo;Null and void,&rdquo; he sneers. But you saw his tells — the parry window, the
                  overhead glow. Read him again. Punish harder.
                </p>
                <div className="battle-result-actions">
                  <button
                    className="battle-btn battle-btn-primary battle-vex-btn"
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

    // Level 6 quiz — same retrieval quiz as the other worlds, then the fight.
    if (phase === 'quiz') {
      return (
        <div className="battle-page">
          <div className="battle-quiz battle-quiz-full">
            {mastered && (
              <button className="battle-skip-quiz" onClick={skipToFight}>
                Skip to fight →
              </button>
            )}
            <LessonRunner
              key={`vex-quiz-${quizRound}`}
              lessonId={world.id}
              section="quiz"
              initial={undefined}
              onSave={handleSave}
              onAttempt={handleAttempt}
              streakCurrent={streak.current}
              nextLessonTitle={null}
              isLastLesson
              onNext={() => navigate('/quest')}
              onTakeQuiz={() => {}}
              onExit={() => navigate('/quest')}
              onQuizComplete={handleQuizComplete}
              embedded
            />
          </div>
        </div>
      )
    }

    // phase === 'intro' (default) — dramatic full-bleed VEX intro.
    return (
      <div className="battle-page battle-vex-page">
        <div className="battle-stage battle-stage--full battle-vex-stage">
          <div className="battle-backdrop battle-vex-backdrop" style={{ ['--accent' as string]: accent }} />
          <button className="battle-flee" onClick={() => navigate('/quest')}>
            <IconArrowLeft size={16} />
            Flee
          </button>
          <div className="battle-overlay" key="vex-intro">
            <div className="battle-intro-card battle-vex-card battle-vex-card--intro">
              <span className="battle-intro-vs battle-vex-tag">Final Boss · The Peak</span>
              <h1 className="battle-vex-name">{VEX_INTRO.title}</h1>
              <p className="battle-vex-subtitle">{VEX_INTRO.subtitle}</p>
              <p className="battle-intro-taunt battle-vex-taunt">{VEX_INTRO.taunt}</p>
              <p className="battle-intro-hint battle-vex-hint">{VEX_INTRO.hint}</p>
              <div className="battle-vex-controls" aria-label="Controls">
                <span className="battle-vex-control"><b>Move</b> WASD</span>
                <span className="battle-vex-control"><b>Dash</b> Shift</span>
                <span className="battle-vex-control"><b>Roll</b> K</span>
                <span className="battle-vex-control"><b>Jump</b> Space</span>
                <span className="battle-vex-control"><b>Melee</b> Q / Click</span>
                <span className="battle-vex-control"><b>Shoot</b> F</span>
                <span className="battle-vex-control battle-vex-control--key"><b>PARRY</b> L</span>
              </div>
              <button
                className="battle-btn battle-btn-primary battle-vex-btn"
                onClick={() => {
                  playClick()
                  setPhase('quiz')
                }}
              >
                Start quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
              <button
                className="battle-btn battle-btn-primary"
                onClick={() => {
                  playClick()
                  setPhase('quiz')
                }}
              >
                Start quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'quiz' && (
        <div className="battle-quiz battle-quiz-full">
          {mastered && (
            <button className="battle-skip-quiz" onClick={skipToFight}>
              Skip to fight →
            </button>
          )}
          <LessonRunner
            key={`quiz-${quizRound}`}
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
