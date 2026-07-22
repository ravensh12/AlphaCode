import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { Loader } from '../components/Loader'
import { ReviewTutor, type ReviewTutorItem } from '../components/ReviewTutor'
import { IconArrowRight, IconCheck, IconX } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { useGauntlet } from '../context/GauntletContext'
import { useProgress } from '../context/ProgressContext'
import type {
  CertificationAssessment,
  CertificationOutcome,
  CertificationStepMetadata,
} from '../content/curricula/neetcode150/certificationAssessment'
import type { LessonResult, StepReview } from '../hooks/useLessonEngine'
import { resolveFinalGauntletAccessWithShowcase } from '../lib/showcaseOverride'
import {
  createGauntletEventId,
  EXAM_PASS_PERCENT,
  gradeFor,
} from '../lib/gauntletProgress'
import { LessonRunner } from './LessonPage'
import './FinalExamPage.css'

type CertificationModule = typeof import(
  '../content/curricula/neetcode150/certificationAssessment'
)

export function FinalExamPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const reviewMode = searchParams.get('mode') === 'review'
  const { isShowcaseAccount } = useAuth()
  const {
    ready,
    academyCampaignComplete,
    readyForFinalGauntlet,
    logAttempt,
    streak,
  } = useProgress()
  const {
    ready: gauntletReady,
    state: gauntlet,
    completeExam,
  } = useGauntlet()
  const access = resolveFinalGauntletAccessWithShowcase(
    isShowcaseAccount,
    ready && gauntletReady,
    academyCampaignComplete,
    readyForFinalGauntlet,
  )
  const certificationModule = useRef<CertificationModule | null>(null)

  const [assessment, setAssessment] =
    useState<CertificationAssessment | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [certificationAttemptId, setCertificationAttemptId] = useState(() =>
    createGauntletEventId('certification'),
  )
  const [result, setResult] = useState<LessonResult | null>(null)
  const [outcome, setOutcome] = useState<CertificationOutcome | null>(null)

  useEffect(() => {
    if (access.status !== 'allowed') return
    let cancelled = false
    setLoadError(null)

    void import(
      '../content/curricula/neetcode150/certificationAssessment'
    )
      .then((module) => {
        if (cancelled) return
        certificationModule.current = module
        setAssessment(module.buildCertificationAssessment())
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(
          error instanceof Error
            ? error.message
            : 'The certification trial could not be built.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [access.status])

  const finishCertification = useCallback(
    async (nextResult?: LessonResult) => {
      const module = certificationModule.current
      if (!assessment || !module || !nextResult) {
        setLoadError('The certification result could not be verified.')
        return
      }

      const nextOutcome = module.certificationAssessmentOutcome(
        nextResult,
        assessment,
      )
      try {
        await completeExam(
          certificationAttemptId,
          nextOutcome.score,
          nextOutcome.requirementsPassed,
        )
        setResult(nextResult)
        setOutcome(nextOutcome)
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Certification progress could not be saved locally.',
        )
      }
    },
    [assessment, certificationAttemptId, completeExam],
  )

  const retry = useCallback(() => {
    setResult(null)
    setOutcome(null)
    setCertificationAttemptId(createGauntletEventId('certification'))
    setAttempt((value) => value + 1)
  }, [])

  if (access.status === 'loading') {
    return <Loader label="Restoring certification progress" night />
  }
  if (access.status === 'redirect') {
    return <Navigate to={access.to} replace />
  }

  if (loadError) {
    return (
      <div className="page fx-page">
        <AppHeader />
        <main className="fx-cert-message" role="alert">
          <span className="fx-grade fx-grade-bronze">
            Certification unavailable
          </span>
          <h1>The trial could not open</h1>
          <p>{loadError}</p>
          <button
            type="button"
            className="fx-btn fx-btn-primary"
            onClick={() => window.location.reload()}
          >
            Try loading again
          </button>
        </main>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="page fx-page">
        <AppHeader />
        <Loader label="Building the 18-track certification" night />
      </div>
    )
  }

  if (reviewMode) {
    return (
      <StudyReview
        assessment={assessment}
        certificationPassed={gauntlet.examPassed}
      />
    )
  }

  if (result && outcome) {
    return (
      <CertificationResult
        assessment={assessment}
        result={result}
        outcome={outcome}
        onRetry={retry}
        onBoss={() => navigate('/final/boss')}
      />
    )
  }

  return (
    <div className="page fx-page">
      <AppHeader />
      <div className="fx-cert-runner">
        <header className="fx-cert-runner-head">
          <span>NeetCode 150 · Certification</span>
          <strong>
            {assessment.lesson.steps.length} typed checks and coding problems
            across all 18 topics
          </strong>
          <p>
            Score at least {EXAM_PASS_PERCENT}%, represent every topic, and pass
            every required transfer prompt without a miss. The trial ends with
            real Python problems graded by the code judge.
          </p>
        </header>
        <LessonRunner
          key={`certification-${attempt}`}
          lessonId={assessment.lesson.id}
          lessonOverride={assessment.lesson}
          section="quiz"
          initial={undefined}
          onSave={() => {}}
          onAttempt={logAttempt}
          streakCurrent={streak.current}
          nextLessonTitle={null}
          isLastLesson
          onTakeQuiz={() => {}}
          onExit={() => navigate('/quest')}
          onQuizComplete={finishCertification}
          examMode
          embedded
        />
      </div>
    </div>
  )
}

function StudyReview({
  assessment,
  certificationPassed,
}: {
  assessment: CertificationAssessment
  certificationPassed: boolean
}) {
  const tutorItems = useMemo<ReviewTutorItem[]>(
    () =>
      assessment.stepMetadata.map((metadata, index) => ({
        label: `Q${index + 1} · ${metadata.trackTitle}`,
        context: {
          prompt: metadata.prompt,
          code:
            assessment.lesson.steps.find(
              ({ id }) => id === metadata.stepId,
            )?.code ?? [],
          concept: metadata.trackTitle,
          hint: metadata.hint,
          answered: true,
        },
      })),
    [assessment],
  )

  return (
    <div className="page fx-page">
      <AppHeader />
      <main className="fx-shell fx-shell--review">
        <div className="fx-results">
          <span className="fx-grade fx-grade-gold">Study review</span>
          <h1>NeetCode 150 Certification Trial</h1>
          <p className="fx-results-sub">
            Review the original recognition and transfer checks from all 18
            academy topics. This page does not record a score.
          </p>
          <div className="fx-results-actions">
            <Link className="fx-btn fx-btn-primary fx-btn-lg" to="/final/exam">
              Take the trial <IconArrowRight size={18} />
            </Link>
            {certificationPassed && (
              <Link className="fx-btn fx-btn-ghost" to="/final/boss">
                Final boss <IconArrowRight size={16} />
              </Link>
            )}
            <Link className="fx-btn fx-btn-ghost" to="/quest">
              Back to academy
            </Link>
          </div>
        </div>

        <h2 className="fx-review-title">
          All {assessment.stepMetadata.length} certification items
        </h2>
        <div className="review-grid">
          <ol className="fx-review-list">
            {assessment.stepMetadata.map((metadata, index) => {
              const step = assessment.lesson.steps.find(
                ({ id }) => id === metadata.stepId,
              )
              return (
                <li
                  className="fx-review-item is-correct"
                  key={metadata.stepId}
                >
                  <ReviewHeading
                    index={index}
                    metadata={metadata}
                    status="study"
                  />
                  <p className="fx-review-prompt">{metadata.prompt}</p>
                  <CodeBlock code={step?.code ?? []} />
                  <p className="fx-review-correct">
                    <span>Answer:</span> {metadata.answerLabel}
                  </p>
                  <p className="fx-review-explain">
                    {metadata.explanation}
                  </p>
                </li>
              )
            })}
          </ol>
          <ReviewTutor
            items={tutorItems}
            heading="Ask Bit about any certification item"
          />
        </div>
      </main>
    </div>
  )
}

function CertificationResult({
  assessment,
  result,
  outcome,
  onRetry,
  onBoss,
}: {
  assessment: CertificationAssessment
  result: LessonResult
  outcome: CertificationOutcome
  onRetry: () => void
  onBoss: () => void
}) {
  const grade = gradeFor(outcome.score)
  const reviewById = useMemo(
    () => new Map(result.stepReviews.map((review) => [review.id, review])),
    [result.stepReviews],
  )
  const tutorItems = useMemo<ReviewTutorItem[]>(
    () =>
      assessment.stepMetadata
        .map((metadata) => ({
          metadata,
          review: reviewById.get(metadata.stepId),
        }))
        .sort(
          (a, b) =>
            Number(a.review?.missed ?? true) -
            Number(b.review?.missed ?? true),
        )
        .reverse()
        .map(({ metadata, review }, index) => ({
          label: `Q${index + 1} · ${metadata.trackTitle}${
            review?.missed ? ' · missed' : ''
          }`,
          context: {
            prompt: metadata.prompt,
            code:
              assessment.lesson.steps.find(
                ({ id }) => id === metadata.stepId,
              )?.code ?? [],
            concept: metadata.trackTitle,
            hint: metadata.hint,
            answered: true,
          },
        })),
    [assessment, reviewById],
  )

  return (
    <div className="page fx-page">
      <AppHeader />
      <main className="fx-shell fx-shell--review">
        <div className="fx-results">
          <span
            className={`fx-grade fx-grade-${
              outcome.passed ? grade.tier : 'bronze'
            }`}
          >
            {outcome.passed
              ? grade.label
              : 'Certification not yet earned'}
          </span>
          <h1>
            {outcome.passed
              ? 'NeetCode 150 certification earned!'
              : 'Review your certification trial'}
          </h1>
          <p className="fx-results-sub">
            You scored <strong>{outcome.score}%</strong>.{' '}
            {outcome.passed
              ? 'Every topic was represented and every required transfer was clean. The final boss is unlocked.'
              : certificationFailureMessage(outcome)}
          </p>

          <div className="fx-requirement-row">
            <RequirementPill
              passed={outcome.scorePassed}
              label={`${EXAM_PASS_PERCENT}% overall`}
            />
            <RequirementPill
              passed={outcome.trackCoveragePassed}
              label="18 topics represented"
            />
            <RequirementPill
              passed={outcome.openEndedTransferPassed}
              label="All transfers clean"
            />
          </div>

          <div className="fx-results-actions">
            {outcome.passed && (
              <button
                type="button"
                className="fx-btn fx-btn-primary fx-btn-lg"
                onClick={onBoss}
              >
                Face the final boss <IconArrowRight size={18} />
              </button>
            )}
            <button
              type="button"
              className={`fx-btn ${
                outcome.passed ? 'fx-btn-ghost' : 'fx-btn-primary fx-btn-lg'
              }`}
              onClick={onRetry}
            >
              Retry the trial
            </button>
            <Link className="fx-btn fx-btn-ghost" to="/quest">
              Leave
            </Link>
          </div>
        </div>

        <section aria-labelledby="track-summary-title">
          <h2 className="fx-review-title" id="track-summary-title">
            Results by topic
          </h2>
          <div className="fx-track-grid">
            {outcome.trackResults.map((track) => {
              const trackClean =
                track.represented && track.openEndedTransferPassed
              return (
                <article
                  className={`fx-track-result ${
                    trackClean ? 'is-clean' : 'is-missed'
                  }`}
                  key={track.trackId}
                >
                  <span aria-hidden="true">
                    {trackClean ? (
                      <IconCheck size={15} />
                    ) : (
                      <IconX size={15} />
                    )}
                  </span>
                  <strong>{track.trackTitle}</strong>
                  <small>
                    {track.cleanFirstTryCount}/{track.itemCount} clean ·{' '}
                    {track.openEndedTransferPassed
                      ? 'transfer passed'
                      : 'transfer retry needed'}
                  </small>
                </article>
              )
            })}
          </div>
        </section>

        <h2 className="fx-review-title">Review every answer</h2>
        <div className="review-grid">
          <ol className="fx-review-list">
            {assessment.stepMetadata.map((metadata, index) => {
              const review = reviewById.get(metadata.stepId)
              const clean = review?.missed === false
              const step = assessment.lesson.steps.find(
                ({ id }) => id === metadata.stepId,
              )
              return (
                <li
                  className={`fx-review-item ${
                    clean ? 'is-correct' : 'is-wrong'
                  }`}
                  key={metadata.stepId}
                >
                  <ReviewHeading
                    index={index}
                    metadata={metadata}
                    status={clean ? 'clean' : 'missed'}
                  />
                  <p className="fx-review-prompt">{metadata.prompt}</p>
                  <CodeBlock code={step?.code ?? []} />
                  <ReviewAnswer
                    metadata={metadata}
                    review={review}
                  />
                  <p className="fx-review-explain">
                    {metadata.explanation}
                  </p>
                </li>
              )
            })}
          </ol>
          <ReviewTutor
            items={tutorItems}
            heading="Ask Bit about your certification"
          />
        </div>

        <div className="fx-results-actions fx-results-actions--bottom">
          {outcome.passed && (
            <button
              type="button"
              className="fx-btn fx-btn-primary fx-btn-lg"
              onClick={onBoss}
            >
              Face the final boss <IconArrowRight size={18} />
            </button>
          )}
          <button
            type="button"
            className="fx-btn fx-btn-ghost"
            onClick={onRetry}
          >
            Retry the trial
          </button>
        </div>
      </main>
    </div>
  )
}

function RequirementPill({
  passed,
  label,
}: {
  passed: boolean
  label: string
}) {
  return (
    <span className={`fx-requirement ${passed ? 'is-passed' : 'is-missed'}`}>
      {passed ? <IconCheck size={14} /> : <IconX size={14} />}
      {label}
    </span>
  )
}

function ReviewHeading({
  index,
  metadata,
  status,
}: {
  index: number
  metadata: CertificationStepMetadata
  status: 'study' | 'clean' | 'missed'
}) {
  return (
    <div className="fx-review-head">
      <span className="fx-review-num">{index + 1}</span>
      <span className="fx-concept">{metadata.trackTitle}</span>
      <span className="fx-type">
        {metadata.itemKind === 'pattern-recognition'
          ? 'Pattern recognition'
          : metadata.itemKind === 'code-transfer'
            ? 'Coding challenge'
            : 'Required transfer'}
      </span>
      {status !== 'study' && (
        <span
          className={`fx-review-mark ${
            status === 'clean' ? 'is-correct' : 'is-wrong'
          }`}
        >
          {status === 'clean' ? (
            <>
              <IconCheck size={14} /> Clean
            </>
          ) : (
            <>
              <IconX size={14} /> Missed
            </>
          )}
        </span>
      )}
    </div>
  )
}

function CodeBlock({ code }: { code: readonly string[] }) {
  if (code.length === 0) return null
  return (
    <pre className="fx-code">
      {code.map((line, index) => (
        <code key={`${index}:${line}`}>{line || ' '}</code>
      ))}
    </pre>
  )
}

function ReviewAnswer({
  metadata,
  review,
}: {
  metadata: CertificationStepMetadata
  review: StepReview | undefined
}) {
  return (
    <div className="fx-review-answers">
      <p className="fx-review-correct">
        <span>Expected:</span>{' '}
        {review?.assessmentAnswerLabel ?? metadata.answerLabel}
      </p>
    </div>
  )
}

function certificationFailureMessage(outcome: CertificationOutcome): string {
  if (!outcome.scorePassed) {
    return `Reach ${EXAM_PASS_PERCENT}% overall, then prove the certification requirements in that same attempt.`
  }
  if (!outcome.trackCoveragePassed) {
    return `The result is missing ${outcome.missingTrackIds.length} required topic${
      outcome.missingTrackIds.length === 1 ? '' : 's'
    }.`
  }
  return 'At least one required open transfer was missed. Retry and pass every transfer on the first try.'
}
