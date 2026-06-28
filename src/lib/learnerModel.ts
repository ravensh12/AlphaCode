/**
 * The Learner Model — a persistent, per-concept profile of an individual learner.
 *
 * This is the spine of AlphaCode's personalization. Every interactive answer the
 * learner gives is folded into a per-concept skill estimate that drives:
 *   - adaptive lesson depth/difficulty (give more/harder where weak, less where strong)
 *   - spaced repetition (resurface concepts right before they'd be forgotten)
 *   - adaptive combat (scale the horde to the learner, not just map position)
 *   - knowledge-zombies (target a learner's weak / due concepts in the 3D world)
 *   - the Coder Profile dashboard (make strengths/weaknesses legible)
 *
 * Pure logic — no React, no storage. Fully unit-testable. Persistence lives in
 * localProgress (rides inside ProgressState) and cloudProgress (concept_mastery).
 */

import type { ConceptId } from '../types/lesson'

/** How fast the ability estimate tracks recent performance (exponential moving avg). */
const ABILITY_ALPHA = 0.4
/** A fresh concept starts neutral — neither weak nor strong. */
const INITIAL_ABILITY = 0.5
/** Confidence reaches ~1.0 after roughly this many graded attempts. */
const CONFIDENCE_SATURATION = 6
/** Sliding window of recent first-try outcomes kept per concept. */
const RECENT_WINDOW = 8

const MAX_BOX = 5
const DAY = 24 * 60 * 60 * 1000
/** Leitner review intervals (ms) per box. Box 1 resurfaces within the session. */
const BOX_INTERVAL_MS = [0, 25 * 1000, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY]

export type ConceptSkill = {
  conceptId: ConceptId
  /** 0..1 rolling estimate of true skill (EMA of weighted outcomes). */
  ability: number
  /** 0..1 — how much we trust the estimate (grows with attempts). */
  confidence: number
  seen: number
  correctFirstTry: number
  /** Leitner box 1..5 for spaced repetition. */
  box: number
  /** Epoch ms when this concept is next due for review. */
  dueAt: number
  lastSeenAt: number
  /** Last few first-try outcomes (true = correct), newest last. */
  recentResults: boolean[]
}

export type LearnerModel = {
  concepts: Partial<Record<ConceptId, ConceptSkill>>
  updatedAt: string
}

/** Coarse band used by lessons, combat, and the dashboard. */
export type ConceptBand = 'weak' | 'developing' | 'solid' | 'mastered'

/**
 * Prerequisite graph — what a concept quietly depends on. Powers smart
 * remediation: when a learner fails Two Pointers, the real gap is often Loops
 * or Arrays, so we can steer review there instead of grinding the hard topic.
 */
const PREREQUISITES: Record<ConceptId, ConceptId[]> = {
  variables: [],
  loops: ['variables'],
  arrays: ['loops', 'variables'],
  strings: ['loops', 'arrays'],
  hashMaps: ['arrays'],
  twoPointers: ['arrays', 'loops'],
  stacks: ['arrays'],
  binarySearch: ['arrays', 'loops'],
}

export function prerequisitesOf(conceptId: ConceptId): ConceptId[] {
  return PREREQUISITES[conceptId] ?? []
}

export function emptyLearnerModel(): LearnerModel {
  return { concepts: {}, updatedAt: new Date(0).toISOString() }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function intervalForBox(box: number): number {
  const i = Math.max(0, Math.min(MAX_BOX, box))
  return BOX_INTERVAL_MS[i] ?? BOX_INTERVAL_MS[MAX_BOX]
}

function freshSkill(conceptId: ConceptId, now: number): ConceptSkill {
  return {
    conceptId,
    ability: INITIAL_ABILITY,
    confidence: 0,
    seen: 0,
    correctFirstTry: 0,
    box: 1,
    dueAt: now,
    lastSeenAt: now,
    recentResults: [],
  }
}

export type ConceptOutcome = {
  firstTry: boolean
  correct: boolean
  /** Optional response time — fast first-try answers signal stronger mastery. */
  responseMs?: number
}

/**
 * Fold one resolved question into the model. Returns the NEXT model (immutable —
 * the caller decides when to persist). `firstTry` means the very first attempt
 * was correct; a later-correct answer still counts as partial credit.
 */
export function updateConcept(
  model: LearnerModel,
  conceptId: ConceptId,
  outcome: ConceptOutcome,
  now = Date.now(),
): LearnerModel {
  const prev = model.concepts[conceptId] ?? freshSkill(conceptId, now)
  const next: ConceptSkill = { ...prev, recentResults: [...prev.recentResults] }

  // Weighted outcome: clean first-try = full credit, slow/second-try = partial.
  let value: number
  if (outcome.correct) {
    value = outcome.firstTry ? 1 : 0.5
    if (outcome.firstTry && outcome.responseMs != null && outcome.responseMs <= 4000) {
      value = 1 // already capped, but keep intent explicit for fast recall
    }
  } else {
    value = 0
  }

  next.ability = clamp01(prev.ability * (1 - ABILITY_ALPHA) + value * ABILITY_ALPHA)
  next.seen = prev.seen + 1
  next.confidence = clamp01(next.seen / CONFIDENCE_SATURATION)
  next.lastSeenAt = now

  const firstTryCorrect = outcome.correct && outcome.firstTry
  if (firstTryCorrect) {
    next.correctFirstTry = prev.correctFirstTry + 1
    next.box = Math.min(MAX_BOX, prev.box + 1)
  } else if (!outcome.correct) {
    next.box = 1 // demote — resurface soon
  }
  // (correct-but-not-first-try holds the box steady.)
  next.dueAt = now + intervalForBox(next.box)

  next.recentResults.push(firstTryCorrect)
  if (next.recentResults.length > RECENT_WINDOW) {
    next.recentResults = next.recentResults.slice(-RECENT_WINDOW)
  }

  return {
    concepts: { ...model.concepts, [conceptId]: next },
    updatedAt: new Date(now).toISOString(),
  }
}

/** Band for a single skill. Unknown/low-confidence concepts read as developing. */
export function conceptBand(skill: ConceptSkill | undefined): ConceptBand {
  if (!skill || skill.seen === 0) return 'developing'
  if (skill.box >= 4 && skill.ability >= 0.85) return 'mastered'
  if (skill.ability >= 0.7) return 'solid'
  if (skill.ability >= 0.42) return 'developing'
  return 'weak'
}

export function bandForConcept(
  model: LearnerModel | undefined,
  conceptId: ConceptId,
): ConceptBand {
  return conceptBand(model?.concepts[conceptId])
}

/** The weakest band across a set of tags — used to size a lesson's difficulty. */
export function weakestBand(
  model: LearnerModel | undefined,
  conceptIds: ConceptId[],
): ConceptBand {
  const order: ConceptBand[] = ['weak', 'developing', 'solid', 'mastered']
  let worst: ConceptBand = 'mastered'
  let sawAny = false
  for (const id of conceptIds) {
    const band = bandForConcept(model, id)
    sawAny = true
    if (order.indexOf(band) < order.indexOf(worst)) worst = band
  }
  return sawAny ? worst : 'developing'
}

/** Concepts whose spaced-repetition review is due (soonest first). */
export function dueConcepts(
  model: LearnerModel | undefined,
  now = Date.now(),
): ConceptId[] {
  if (!model) return []
  return Object.values(model.concepts)
    .filter((c): c is ConceptSkill => !!c && c.seen > 0 && c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((c) => c.conceptId)
}

/** The n weakest concepts the learner has actually practiced, weakest first. */
export function weakestConcepts(
  model: LearnerModel | undefined,
  n = 3,
): ConceptId[] {
  if (!model) return []
  return Object.values(model.concepts)
    .filter((c): c is ConceptSkill => !!c && c.seen > 0)
    .sort((a, b) => a.ability - b.ability)
    .slice(0, n)
    .map((c) => c.conceptId)
}

/**
 * Pick a concept worth drilling in the 3D world right now: prefer something due
 * for review, otherwise the weakest practiced concept. Returns undefined when
 * the learner has no history yet (e.g. a brand-new player).
 */
export function targetConcept(
  model: LearnerModel | undefined,
  now = Date.now(),
): ConceptId | undefined {
  const due = dueConcepts(model, now)
  if (due.length > 0) return due[0]
  const weak = weakestConcepts(model, 1)
  return weak[0]
}

/** Merge two models — never regress mastery; prefer the more-recently-seen skill. */
export function mergeLearnerModels(
  a: LearnerModel | undefined,
  b: LearnerModel | undefined,
): LearnerModel | undefined {
  if (!a) return b
  if (!b) return a
  const ids = new Set<ConceptId>([
    ...(Object.keys(a.concepts) as ConceptId[]),
    ...(Object.keys(b.concepts) as ConceptId[]),
  ])
  const concepts: LearnerModel['concepts'] = {}
  for (const id of ids) {
    const sa = a.concepts[id]
    const sb = b.concepts[id]
    if (sa && sb) {
      const base = sa.lastSeenAt >= sb.lastSeenAt ? sa : sb
      concepts[id] = {
        ...base,
        seen: Math.max(sa.seen, sb.seen),
        correctFirstTry: Math.max(sa.correctFirstTry, sb.correctFirstTry),
        box: Math.max(sa.box, sb.box),
        dueAt: Math.max(sa.dueAt, sb.dueAt),
        lastSeenAt: Math.max(sa.lastSeenAt, sb.lastSeenAt),
      }
    } else {
      concepts[id] = (sa ?? sb)!
    }
  }
  const updatedAt =
    a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt
  return { concepts, updatedAt }
}
