import type { Lesson, LessonStep } from '../../../types/lesson'
import type { ProblemId, RealmId, TrackId } from '../../../types/curriculum'
import type { LessonResult } from '../../../hooks/useLessonEngine'
import { ACADEMY_REALM_QUIZ_PASS_SCORE } from '../../../lib/academyProgress'
import { compileProblemLesson } from '../problemLessonCompiler'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_REALM_BY_ID,
  NEETCODE_150_TRACK_BY_ID,
} from './index'
import { loadProblemLesson } from './problemRegistry'

/** Typed pair drawn from every track: retrieval prompt + rebuild-order. */
const REQUIRED_TYPED_KINDS = ['shortAnswer', 'predict'] as const

export type RealmAssessmentSelection = {
  trackId: TrackId
  problemId: ProblemId
  stepIds: readonly string[]
  assessmentIds: readonly string[]
}

export type RealmBossAssessment = {
  realmId: RealmId
  lesson: Lesson
  selections: readonly RealmAssessmentSelection[]
  requiredOpenEndedStepIds: readonly string[]
}

export type RealmAssessmentGate = {
  scorePassed: boolean
  openEndedTransferPassed: boolean
  passed: boolean
  combatCounts: boolean
}

export function evaluateRealmAssessmentGate(
  score: number,
  openEndedTransferPassed: boolean,
): RealmAssessmentGate {
  const scorePassed = score >= ACADEMY_REALM_QUIZ_PASS_SCORE
  const passed = scorePassed && openEndedTransferPassed
  return {
    scorePassed,
    openEndedTransferPassed,
    passed,
    combatCounts: passed,
  }
}

export function realmAssessmentOutcome(
  result: LessonResult,
  assessment: RealmBossAssessment,
): RealmAssessmentGate & { score: number } {
  const reviewById = new Map(
    result.stepReviews.map((review) => [review.id, review]),
  )
  const openEndedTransferPassed =
    assessment.requiredOpenEndedStepIds.length > 0 &&
    assessment.requiredOpenEndedStepIds.every(
      (stepId) => reviewById.get(stepId)?.missed === false,
    )
  return {
    score: result.masteryScore,
    ...evaluateRealmAssessmentGate(
      result.masteryScore,
      openEndedTransferPassed,
    ),
  }
}

/** Event links accepted by the realm RPC; retry misses remain telemetry only. */
export function realmQuizEvidenceEventIds(
  result: LessonResult,
  assessment: RealmBossAssessment,
): string[] {
  const requiredClean = new Set(assessment.requiredOpenEndedStepIds)
  return [
    ...new Set(
      (result.assessmentEvidence ?? [])
        .filter(
          (event) =>
            event.resolved &&
            event.isCorrect &&
            (!requiredClean.has(event.stepId) ||
              (event.firstTry && !event.usedHint && !event.revealed)),
        )
        .map(({ eventId }) => eventId),
    ),
  ].sort()
}

function representativeProblemId(
  trackId: TrackId,
  formIndex: number,
): ProblemId {
  const track = NEETCODE_150_TRACK_BY_ID.get(trackId)
  if (!track || track.problemIds.length === 0) {
    throw new Error(`Track "${trackId}" has no authored missions`)
  }
  const start = Math.floor((track.problemIds.length - 1) / 2)
  const offset =
    ((Math.floor(formIndex) % track.problemIds.length) +
      track.problemIds.length) %
    track.problemIds.length
  return track.problemIds[(start + offset) % track.problemIds.length]
}

function requiredStep(
  lesson: Lesson,
  trackId: TrackId,
  kind: string,
): LessonStep {
  const step = lesson.steps.find((item) => item.assessment?.kind === kind)
  if (!step) {
    throw new Error(
      `Representative mission for "${trackId}" is missing a required authored assessment`,
    )
  }
  return step
}

/**
 * Builds a stable, mostly-typed realm assessment from authored mission
 * content: one pattern-recognition MCQ, a typed retrieval plus typed
 * rebuild-order prompt from every track, and one full LeetCode-style Python
 * solve drawn from this realm's problems as the finale.
 */
export async function buildRealmBossAssessment(
  realmId: RealmId,
  options: { formIndex?: number } = {},
): Promise<RealmBossAssessment> {
  const realm = NEETCODE_150_REALM_BY_ID.get(realmId)
  if (!realm) throw new Error(`Unknown academy realm "${realmId}"`)

  const selections: RealmAssessmentSelection[] = []
  const steps: LessonStep[] = []
  const requiredOpenEndedStepIds: string[] = []
  const formIndex = options.formIndex ?? 0
  // Rotate which tracks supply the MCQ warm-up and the Python finale so
  // retakes are not identical while track coverage stays stable.
  const choiceTrackIndex = formIndex % realm.trackIds.length
  const pythonTrackIndex = (formIndex + 1) % realm.trackIds.length

  const loaded = await Promise.all(
    realm.trackIds.map(async (trackId) => {
      const problemId = representativeProblemId(trackId, formIndex)
      const spec = await loadProblemLesson(problemId)
      if (!spec) {
        throw new Error(`No authored mission is registered for "${problemId}"`)
      }
      const compiled = compileProblemLesson(spec, NEETCODE_150_MANIFEST, {
        seed: `realm-assessment|${realmId}|form:${formIndex}|${trackId}|${problemId}`,
      })
      return { trackId, problemId, compiled }
    }),
  )

  // Promise.all preserves realm.trackIds order while loading all three chunks
  // concurrently, avoiding a serial three-request boss-gate delay.
  let pythonFinale: LessonStep | null = null
  loaded.forEach(({ trackId, problemId, compiled }, trackIndex) => {
    const selected: LessonStep[] = []
    if (trackIndex === choiceTrackIndex) {
      selected.push(requiredStep(compiled, trackId, 'singleChoice'))
    }
    const typedRetrieval = requiredStep(
      compiled,
      trackId,
      REQUIRED_TYPED_KINDS[0],
    )
    selected.push(typedRetrieval)
    selected.push(requiredStep(compiled, trackId, REQUIRED_TYPED_KINDS[1]))
    steps.push(...selected)

    if (trackIndex === pythonTrackIndex) {
      // The full-problem solve always closes the trial, LeetCode-style.
      pythonFinale = requiredStep(compiled, trackId, 'pythonCode')
      selected.push(pythonFinale)
    }

    requiredOpenEndedStepIds.push(typedRetrieval.id)
    selections.push({
      trackId,
      problemId,
      stepIds: selected.map(({ id }) => id),
      assessmentIds: selected.map((step) => step.assessment!.id),
    })
  })
  if (pythonFinale) steps.push(pythonFinale)

  return {
    realmId,
    lesson: {
      id:
        formIndex === 0
          ? `academy-realm-assessment:${realmId}`
          : `academy-realm-assessment:${realmId}:form-${formIndex}`,
      title: `${realm.title} Mastery Trial`,
      description:
        'Typed retrieval and rebuild checks from all three academy topics, capped by one full Python problem solve.',
      pattern: 'Realm synthesis',
      estimatedMinutes: 25,
      conceptTags: [],
      unlockRequirements: {},
      steps,
    },
    selections,
    requiredOpenEndedStepIds,
  }
}

export function createRealmQuizAttemptId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (char) => {
    const value = Math.floor(Math.random() * 16)
    const nibble = char === 'x' ? value : (value & 0x3) | 0x8
    return nibble.toString(16)
  })
}
