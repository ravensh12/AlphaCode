import { describe, expect, it } from 'vitest'
import { NEETCODE_150_MANIFEST } from './curricula/neetcode150'
import type { TrackId } from '../types/curriculum'
import {
  DISTRICT_QUESTION_CHAIN_LENGTH,
  DISTRICT_QUESTIONS,
  TRACK_CONCEPTS,
  districtQuestionChain,
} from './districtQuestions'

const ALL_TRACK_IDS = NEETCODE_150_MANIFEST.tracks.map(({ id }) => id)
const ALL_QUESTIONS = ALL_TRACK_IDS.flatMap(
  (trackId) => DISTRICT_QUESTIONS[trackId],
)

describe('district question coverage', () => {
  it('covers every manifest track with a full 3-question chain', () => {
    expect(ALL_TRACK_IDS).toHaveLength(18)
    for (const trackId of ALL_TRACK_IDS) {
      const chain = districtQuestionChain(trackId)
      expect(chain, trackId).toHaveLength(DISTRICT_QUESTION_CHAIN_LENGTH)
    }
    // No stray banks for tracks outside the manifest.
    expect(Object.keys(DISTRICT_QUESTIONS).sort()).toEqual(
      [...ALL_TRACK_IDS].sort(),
    )
    expect(ALL_QUESTIONS.length).toBeGreaterThanOrEqual(54)
  })

  it('every question has a valid answer index and distinct, plausible choices', () => {
    for (const question of ALL_QUESTIONS) {
      expect(question.prompt.trim().length).toBeGreaterThan(10)
      expect(question.choices.length).toBeGreaterThanOrEqual(3)
      expect(Number.isInteger(question.answerIndex)).toBe(true)
      expect(question.answerIndex).toBeGreaterThanOrEqual(0)
      expect(question.answerIndex).toBeLessThan(question.choices.length)
      const trimmed = question.choices.map((choice) => choice.trim())
      expect(new Set(trimmed).size, question.prompt).toBe(trimmed.length)
      for (const choice of trimmed) expect(choice.length).toBeGreaterThan(0)
    }
  })

  it('spreads correct answers across positions (never mostly index 0)', () => {
    const counts = [0, 0, 0, 0]
    for (const question of ALL_QUESTIONS) counts[question.answerIndex] += 1
    // Every position is used a meaningful number of times…
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(8)
    }
    // …and no single position dominates the bank.
    const max = Math.max(...counts)
    expect(max / ALL_QUESTIONS.length).toBeLessThanOrEqual(0.4)
  })
})

describe('legacy concept mapping', () => {
  it('tags questions only on tracks with a real legacy ConceptId mapping', () => {
    for (const trackId of ALL_TRACK_IDS) {
      const allowed = TRACK_CONCEPTS[trackId]
      for (const question of DISTRICT_QUESTIONS[trackId]) {
        if (allowed) {
          // Mapped tracks always feed the learner model, with a concept from
          // the track's declared legacy set.
          expect(question.concept, `${trackId}: ${question.prompt}`).toBeDefined()
          expect(allowed).toContain(question.concept!)
        } else {
          // Unmapped tracks are XP-only: the concept key must not exist at
          // all so integration can key recordConceptResult off its presence.
          expect(
            'concept' in question,
            `${trackId} must be concept-free: ${question.prompt}`,
          ).toBe(false)
        }
      }
    }
  })

  it('maps exactly the realm 1–2 fundamentals tracks', () => {
    const mapped = (Object.keys(TRACK_CONCEPTS) as TrackId[]).sort()
    expect(mapped).toEqual(
      [
        'arrays-hashing',
        'two-pointers',
        'sliding-window',
        'stack',
        'binary-search',
      ].sort(),
    )
    const realm12Tracks = new Set(
      NEETCODE_150_MANIFEST.tracks
        .filter(({ realmId }) => realmId === 'realm1' || realmId === 'realm2')
        .map(({ id }) => id),
    )
    for (const trackId of mapped) {
      expect(realm12Tracks.has(trackId)).toBe(true)
    }
  })
})
