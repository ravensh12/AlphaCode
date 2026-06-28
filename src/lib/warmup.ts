/**
 * Daily Warm-up — a spaced, interleaved retrieval session.
 *
 * Built on the two most strongly evidence-backed techniques in learning science:
 *   - Retrieval practice (the "testing effect"): actively recalling beats re-reading.
 *   - Spacing: concepts resurface via the Leitner scheduler right as they're about
 *     to be forgotten (`dueConcepts` / box intervals in learnerModel).
 *   - Interleaving: questions mix DIFFERENT concepts rather than blocking one at a
 *     time, which improves the ability to pick the right approach (the real skill).
 *
 * We only ever review concepts the learner has actually practiced — you can't
 * "retrieve" something you never encoded.
 */

import type { ConceptId } from '../types/lesson'
import type { LearnerModel } from './learnerModel'
import { dueConcepts, weakestConcepts } from './learnerModel'
import { getMicroQuestion, type MicroQuestion } from '../content/microQuestions'

/** Count of practiced concepts that are currently due for review (spacing). */
export function dueReviewCount(model: LearnerModel | undefined): number {
  if (!model) return 0
  const due = dueConcepts(model)
  return due.filter((c) => (model.concepts[c]?.seen ?? 0) > 0).length
}

/** True once the learner has practiced anything worth reviewing. */
export function hasReviewHistory(model: LearnerModel | undefined): boolean {
  if (!model) return false
  return Object.values(model.concepts).some((c) => !!c && c.seen > 0)
}

/**
 * Build an interleaved retrieval session. Concept order is spacing-prioritised
 * (due → weakest → rest), then cycled so adjacent questions are different
 * concepts (interleaving). Returns [] when there's no practiced history yet.
 */
export function buildWarmupSession(
  model: LearnerModel | undefined,
  count = 6,
): MicroQuestion[] {
  if (!model) return []
  const practiced = Object.values(model.concepts)
    .filter((c): c is NonNullable<typeof c> => !!c && c.seen > 0)
    .map((c) => c.conceptId)
  if (practiced.length === 0) return []

  const practicedSet = new Set<ConceptId>(practiced)
  const due = dueConcepts(model).filter((c) => practicedSet.has(c))
  const weak = weakestConcepts(model, 8).filter((c) => practicedSet.has(c))

  // Spacing priority order, de-duplicated: due first, then weakest, then the rest.
  const ordered: ConceptId[] = []
  const seen = new Set<ConceptId>()
  for (const c of [...due, ...weak, ...practiced]) {
    if (!seen.has(c)) {
      seen.add(c)
      ordered.push(c)
    }
  }

  // Interleave by cycling distinct concepts so no two adjacent questions share
  // a concept (unless only one concept has been practiced).
  const chosen: ConceptId[] = []
  let i = 0
  const guard = count * 4
  while (chosen.length < count && i < guard) {
    chosen.push(ordered[i % ordered.length])
    i++
  }

  const questions: MicroQuestion[] = []
  for (const c of chosen) {
    const q = getMicroQuestion(c)
    if (q) questions.push(q)
  }
  return questions
}
