import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
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
import { WORLDS, getWorld } from '../content/adventure'
import { getBonusQuestion } from '../content/bonusQuestions'
import { BOSS_DONE_KEY } from '../lib/questSession'
import { playClick } from '../lib/soundFx'
import type { AttemptRecord } from '../types/progress'
import { IconArrowLeft } from '../components/icons'
import {
  buildRealmBossAssessment,
  createRealmQuizAttemptId,
  realmAssessmentOutcome,
  realmQuizEvidenceEventIds,
  type RealmAssessmentGate,
  type RealmBossAssessment,
} from '../content/curricula/neetcode150/realmAssessment'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import { isRealmRunPassed, realmIdForWorldIndex } from '../lib/academyQuest'
import { selectRealmProgress } from '../lib/academyProgress'
import { activeRunProgressView } from '../lib/freshRunView'
import {
  bossKnowledgeGateOpenWithShowcase,
  canAccessAcademyBossEntryWithShowcase,
  canEnterAcademyBossWithShowcase,
} from '../lib/showcaseOverride'
import {
  combatScaleForMastery,
  selectRealmCombatMastery,
} from '../lib/combatMastery'
import { runDurableTransition } from '../lib/durableTransition'
import './BossBattlePage.css'

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
  const { isGuest, isShowcaseAccount } = useAuth()
  const {
    ready,
    academyProgress,
    realmProgress,
    recordRealmQuizAttempt,
    recordRealmBossDefeat,
    recordLearningAttempt,
    skillMastery,
    learnerModel,
    logAttempt,
    streak,
  } = useProgress()

  const world = lessonId ? getWorld(lessonId) : undefined
  const realmId = world ? realmIdForWorldIndex(world.index) : null
  const durableRealmProgress = realmId ? realmProgress(realmId) : null
  // The run view: identical to durable progress outside a fresh run; during
  // one it additionally presents realms behind a "Skip to realm" anchor as
  // run-passed, so their bosses open for a rematch. Entry only ever WIDENS —
  // durable rematch rights are checked alongside it below.
  const runViewProgress = useMemo(
    () => activeRunProgressView(academyProgress),
    [academyProgress],
  )
  const runViewRunPassed =
    !!realmId && isRealmRunPassed(selectRealmProgress(runViewProgress, realmId))
  // Token-less re-entry (rematch) opens once the realm is run-passed — the
  // boss is durably defeated, or the active run skipped past this realm —
  // even while the mastery claim is still pending.
  const battleEntryAuthorized =
    !!realmId &&
    canAccessAcademyBossEntryWithShowcase(
      isShowcaseAccount,
      realmId,
      (durableRealmProgress
        ? isRealmRunPassed(durableRealmProgress)
        : false) || runViewRunPassed,
    )
  const canBattle =
    !!world &&
    !!realmId &&
    ready &&
    !isGuest &&
    battleEntryAuthorized &&
    (canEnterAcademyBossWithShowcase(
      isShowcaseAccount,
      academyProgress,
      realmId,
    ) ||
      canEnterAcademyBossWithShowcase(
        isShowcaseAccount,
        runViewProgress,
        realmId,
      ))
  const knowledgePassed = durableRealmProgress?.knowledgePassed ?? false
  // Showcase may always advance from quiz to fight; the quiz score itself is
  // still shown (and recorded) honestly.
  const skipGateOpen = bossKnowledgeGateOpenWithShowcase(
    isShowcaseAccount,
    knowledgePassed,
  )
  // The final world swaps the quiz->blaster flow for the flagship VEX fight.
  const isFinalWorld = !!world && world.index === WORLDS.length - 1
  const combatMastery = useMemo(
    () =>
      realmId
        ? selectRealmCombatMastery(realmId, skillMastery, learnerModel)
        : { ability: 0.5, source: 'neutral' as const, evidenceCount: 0 },
    [learnerModel, realmId, skillMastery],
  )
  const combatScale = combatScaleForMastery(combatMastery.ability)

  const [phase, setPhase] = useState<Phase>('intro')
  // Bump to remount the arena for a fresh fight attempt.
  const [fightRun, setFightRun] = useState(0)
  // Bump to remount the quiz for a retake.
  const [quizRound, setQuizRound] = useState(0)
  // The most recent quiz result, shown on the post-quiz results screen.
  const [quizResult, setQuizResult] = useState<LessonResult | null>(null)
  const [quizGate, setQuizGate] = useState<RealmAssessmentGate | null>(null)
  const [assessment, setAssessment] = useState<RealmBossAssessment | null>(null)
  const [assessmentError, setAssessmentError] = useState<string | null>(null)
  const [quizAttemptId, setQuizAttemptId] = useState(createRealmQuizAttemptId)
  const [bossDefeatId, setBossDefeatId] = useState(createRealmQuizAttemptId)
  const [showReview, setShowReview] = useState(false)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const [pendingQuizSave, setPendingQuizSave] = useState<{
    result: LessonResult
    outcome: ReturnType<typeof realmAssessmentOutcome>
    learningEventIds: string[]
  } | null>(null)
  const [pendingBossSave, setPendingBossSave] = useState<{
    defeatedAt: string
    eventId?: string
  } | null>(null)

  useEffect(() => {
    if (!realmId || !canBattle) return
    let cancelled = false
    setAssessment(null)
    setAssessmentError(null)
    void buildRealmBossAssessment(realmId, {
      formIndex: durableRealmProgress?.quizAttemptCount ?? 0,
    })
      .then((built) => {
        if (!cancelled) setAssessment(built)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssessmentError(
            error instanceof Error
              ? error.message
              : 'The realm assessment could not load.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [canBattle, durableRealmProgress?.quizAttemptCount, realmId])

  // The cinematic VEX fight is lazy-split; warm its chunk on the final realm.
  useEffect(() => {
    if (isFinalWorld) void import('../components/game3d/CinematicBossArena')
  }, [isFinalWorld])

  function handleAttempt(a: AttemptRecord) {
    logAttempt(a)
  }

  async function persistQuizEvidence(
    pending: NonNullable<typeof pendingQuizSave>,
  ) {
    if (!realmId) return
    const transition = await runDurableTransition(
      () =>
        recordRealmQuizAttempt({
          realmId,
          attemptId: quizAttemptId,
          attemptedAt: new Date().toISOString(),
          score: pending.outcome.score,
          openEndedTransferPassed:
            pending.outcome.openEndedTransferPassed,
          learningEventIds: pending.learningEventIds,
        }),
      () => {
        setPersistenceError(null)
        setPendingQuizSave(null)
        setQuizResult(pending.result)
        setQuizGate(pending.outcome)
        setShowReview(false)
        setPhase('result')
      },
    )
    if (!transition.ok) {
      setPersistenceError(
        transition.error instanceof Error
          ? transition.error.message
          : 'The realm assessment could not be saved locally.',
      )
    }
  }

  async function handleQuizComplete(result?: LessonResult) {
    if (!realmId || !assessment || !result) {
      setAssessmentError('The assessment result could not be verified.')
      return
    }
    const outcome = realmAssessmentOutcome(result, assessment)
    const learningEventIds = realmQuizEvidenceEventIds(result, assessment)
    if (learningEventIds.length === 0) {
      setPersistenceError(
        'The assessment events were not durably saved, so this realm attempt cannot count.',
      )
      return
    }
    const pending = { result, outcome, learningEventIds }
    setPendingQuizSave(pending)
    await persistQuizEvidence(pending)
  }

  function retakeQuiz() {
    setPersistenceError(null)
    setPendingQuizSave(null)
    setQuizAttemptId(createRealmQuizAttemptId())
    setQuizResult(null)
    setQuizGate(null)
    setQuizRound((round) => round + 1)
    setPhase('quiz')
  }

  function continueToFight() {
    if (
      !bossKnowledgeGateOpenWithShowcase(
        isShowcaseAccount,
        knowledgePassed || !!quizGate?.passed,
      )
    ) {
      return
    }
    setBossDefeatId(createRealmQuizAttemptId())
    setFightRun((run) => run + 1)
    setPhase('fight')
  }

  // A rematch can skip knowledge checks only after this realm has passed them
  // (the showcase account may skip straight to the fight at any time).
  function skipToFight() {
    if (!skipGateOpen) return
    playClick()
    setBossDefeatId(createRealmQuizAttemptId())
    setFightRun((run) => run + 1)
    setPhase('fight')
  }

  async function persistBossVictory(
    existing: typeof pendingBossSave = pendingBossSave,
  ) {
    if (
      !world ||
      !realmId ||
      !bossKnowledgeGateOpenWithShowcase(
        isShowcaseAccount,
        knowledgePassed || !!quizGate?.passed,
      )
    ) {
      return
    }
    let pending = existing ?? { defeatedAt: new Date().toISOString() }
    try {
      const realm = NEETCODE_150_MANIFEST.realms.find(
        ({ id }) => id === realmId,
      )
      const skillIds = [
        ...new Set(
          (realm?.trackIds ?? []).flatMap(
            (trackId) => NEETCODE_150_TRACK_BY_ID.get(trackId)?.skillIds ?? [],
          ),
        ),
      ]
      if (!pending.eventId) {
        const event = await recordLearningAttempt({
          interactionId: bossDefeatId,
          source: 'realm-boss',
          problemId: `gauntlet:realm-boss:${realmId}`,
          skillIds,
          attemptNumber: 1,
          isCorrect: true,
          resolved: true,
          firstTryCorrect: true,
          occurredAt: pending.defeatedAt,
          metadata: {
            academyMode: 'realm-boss',
            realmId,
            defeatId: bossDefeatId,
          },
        })
        pending = { ...pending, eventId: event.id }
        setPendingBossSave(pending)
      }
      const eventId = pending.eventId
      if (!eventId) throw new Error('Boss evidence event was not saved')
      const transition = await runDurableTransition(
        () =>
          recordRealmBossDefeat({
            realmId,
            defeatId: bossDefeatId,
            defeatedAt: pending.defeatedAt,
            learningEventIds: [eventId],
          }),
        () => {
          setPersistenceError(null)
          setPendingBossSave(null)
          // Advance the tour only after the local academy save resolves.
          try {
            sessionStorage.setItem(BOSS_DONE_KEY, String(world.index))
          } catch {
            /* unavailable session storage does not invalidate durable progress */
          }
          setPhase('won')
        },
      )
      if (!transition.ok) throw transition.error
    } catch (error) {
      setPendingBossSave(pending)
      setPersistenceError(
        error instanceof Error
          ? error.message
          : 'The boss win could not be saved.',
      )
      return
    }
  }

  async function handleWin() {
    await persistBossVictory()
  }

  // A fresh bonus question each fight attempt (random from this level's lesson).
  const bonusQuestion = useMemo(() => {
    // fightRun is the reroll key: each new attempt draws a fresh question.
    void fightRun
    return world ? getBonusQuestion(world.id) : null
  }, [world, fightRun])

  if (!world) return <Navigate to="/quest" replace />
  if (!ready) return <Loader label="Entering the arena" />
  if (isGuest) return <Navigate to="/auth" replace />
  if (!realmId || !canBattle) return <Navigate to="/quest" replace />

  const accent = world.theme.accent
  const lessonTitle = assessment?.lesson.title ?? world.name

  if (assessmentError) {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay">
            <div className="battle-result-card lose">
              <span className="battle-result-tag">Assessment unavailable</span>
              <h2>The boss gate stayed sealed</h2>
              <p>{assessmentError}</p>
              <div className="battle-result-actions">
                <button
                  className="battle-btn battle-btn-primary"
                  onClick={() => window.location.reload()}
                >
                  Try loading again
                </button>
                <button
                  className="battle-btn battle-btn-ghost"
                  onClick={() => navigate('/quest')}
                >
                  Return to Code City
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (persistenceError) {
    return (
      <div className="battle-page">
        <div className="battle-stage battle-stage--full">
          <div className="battle-backdrop" style={{ ['--accent' as string]: accent }} />
          <div className="battle-overlay">
            <div className="battle-result-card lose">
              <span className="battle-result-tag">Save required</span>
              <h2>Progress was not advanced</h2>
              <p>{persistenceError}</p>
              <p>Your assessment or victory remains on this device until the local save succeeds.</p>
              <div className="battle-result-actions">
                {pendingQuizSave && (
                  <button
                    className="battle-btn battle-btn-primary"
                    onClick={() => void persistQuizEvidence(pendingQuizSave)}
                  >
                    Retry assessment save
                  </button>
                )}
                {pendingBossSave && (
                  <button
                    className="battle-btn battle-btn-primary"
                    onClick={() => void persistBossVictory(pendingBossSave)}
                  >
                    Retry victory save
                  </button>
                )}
                {!pendingQuizSave && !pendingBossSave && (
                  <button
                    className="battle-btn battle-btn-primary"
                    onClick={retakeQuiz}
                  >
                    Retake assessment
                  </button>
                )}
                <button
                  className="battle-btn battle-btn-ghost"
                  onClick={() => navigate('/quest')}
                >
                  Return to Code City
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // === POST-ASSESSMENT RESULTS — failed knowledge never counts as combat ===
  if (phase === 'result') {
    const r = quizResult
    const items = (r?.stepReviews ?? []).filter(
      (s) => s.targetVariables.length > 0 || !!s.assessmentAnswerLabel,
    )
    const total = items.length
    const firstTry = r?.correctFirstTry ?? 0
    const score = quizGate ? (r?.masteryScore ?? 0) : 0
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
              <p>
                {quizGate?.passed
                  ? 'Realm knowledge verified. This combat attempt will count.'
                  : !quizGate?.scorePassed
                    ? 'You need at least 80%. Review the authored checks and retake before combat.'
                    : 'One or more required typed retrieval answers was missed. Review and retake before combat.'}
              </p>
              {!quizGate?.passed && isShowcaseAccount && (
                <p>
                  Showcase access: the score above stands as recorded, but the
                  fight is open to you anyway.
                </p>
              )}
              <div className="battle-result-actions">
                {bossKnowledgeGateOpenWithShowcase(
                  isShowcaseAccount,
                  !!quizGate?.passed,
                ) && (
                  <button className="battle-btn battle-btn-primary" onClick={continueToFight}>
                    Continue to boss fight →
                  </button>
                )}
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
              combatScale={combatScale}
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
                    onClick={continueToFight}
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
      if (!assessment) return <Loader label="Building the realm assessment" />
      return (
        <div className="battle-page">
          <div className="battle-quiz battle-quiz-full">
            {skipGateOpen && (
              <button className="battle-skip-quiz" onClick={skipToFight}>
                Skip to fight →
              </button>
            )}
            <LessonRunner
              key={`vex-quiz-${quizRound}`}
              lessonId={assessment.lesson.id}
              lessonOverride={assessment.lesson}
              section="quiz"
              initial={undefined}
              onSave={() => {}}
              onAttempt={handleAttempt}
              streakCurrent={streak.current}
              nextLessonTitle={null}
              isLastLesson
              onNext={() => navigate('/quest')}
              onTakeQuiz={() => {}}
              onExit={() => navigate('/quest')}
              onQuizComplete={handleQuizComplete}
              examMode
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
                disabled={!assessment}
                onClick={() => {
                  playClick()
                  setPhase('quiz')
                }}
              >
                {assessment ? 'Start realm assessment' : 'Preparing assessment…'}
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
          combatScale={combatScale}
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
                  onClick={continueToFight}
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
                First, pass a typed assessment drawn from all three academy topics, ending with a full Python problem solve.
                Score at least 80% and miss no required typed retrieval, then face{' '}
                {world.boss.name} in a live blaster fight.
              </p>
              <button
                className="battle-btn battle-btn-primary"
                disabled={!assessment}
                onClick={() => {
                  playClick()
                  setPhase('quiz')
                }}
              >
                {assessment ? 'Start realm assessment' : 'Preparing assessment…'}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'quiz' && assessment && (
        <div className="battle-quiz battle-quiz-full">
          {skipGateOpen && (
            <button className="battle-skip-quiz" onClick={skipToFight}>
              Skip to fight →
            </button>
          )}
          <LessonRunner
            key={`quiz-${quizRound}`}
            lessonId={assessment.lesson.id}
            lessonOverride={assessment.lesson}
            section="quiz"
            initial={undefined}
            onSave={() => {}}
            onAttempt={handleAttempt}
            streakCurrent={streak.current}
            nextLessonTitle={nextWorld?.name ?? null}
            isLastLesson={world.index === WORLDS.length - 1}
            onNext={() => navigate('/quest')}
            onTakeQuiz={() => {}}
            onExit={() => navigate('/quest')}
            onQuizComplete={handleQuizComplete}
            examMode
            embedded
          />
        </div>
      )}
      {phase === 'quiz' && !assessment && (
        <Loader label="Building the realm assessment" night />
      )}
    </div>
  )
}
