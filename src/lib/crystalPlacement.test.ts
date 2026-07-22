import { describe, expect, it } from 'vitest'
import { WORLD_GATES } from '../components/game3d/layout'
import { NEETCODE_150_TRACK_BY_ID } from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  recordMissionPractice,
  recordMissionRetention,
} from './academyProgress'
import {
  CRYSTAL_MIN_SEPARATION,
  CRYSTAL_RING_RADIUS,
  CRYSTALS_PER_GATE,
  placeMemoryCrystals,
  type CrystalPlacementInput,
} from './crystalPlacement'

const NOW = Date.parse('2026-07-10T12:00:00.000Z')
const TWO_DAYS_AGO = '2026-07-08T12:00:00.000Z'

const ARRAYS_TRACK = NEETCODE_150_TRACK_BY_ID.get('arrays-hashing')!
const POINTERS_TRACK = NEETCODE_150_TRACK_BY_ID.get('two-pointers')!

function practice(
  state: AcademyProgressState,
  problemId: ProblemId,
  acquiredAt: string,
): AcademyProgressState {
  return recordMissionPractice(state, {
    problemId,
    acquiredAt,
    practicedAt: acquiredAt,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`event:${problemId}:acquisition`],
    transferEventIds: [`event:${problemId}:python`],
    codeTestEventIds: [`event:${problemId}:python`],
  })
}

function complete(
  state: AcademyProgressState,
  problemId: ProblemId,
  acquiredAt: string,
): AcademyProgressState {
  const practiced = practice(state, problemId, acquiredAt)
  return recordMissionRetention(practiced, {
    problemId,
    retainedAt: new Date(
      Date.parse(acquiredAt) + 24 * 60 * 60 * 1000,
    ).toISOString(),
    delayedRetrievalPassed: true,
    delayedRetrievalEventIds: [`event:${problemId}:retention`],
  })
}

/** Minutes before NOW, ISO — staggered acquisitions give distinct ripenings. */
function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString()
}

function input(
  academyProgress: AcademyProgressState,
  overrides: Partial<CrystalPlacementInput> = {},
): CrystalPlacementInput {
  return { academyProgress, now: NOW, cloudEnabled: false, ...overrides }
}

describe('placeMemoryCrystals', () => {
  it('places nothing for empty progress', () => {
    expect(placeMemoryCrystals(input(emptyAcademyProgressState()))).toEqual([])
  })

  it('is deterministic: the same progress yields identical placements', () => {
    let state = emptyAcademyProgressState()
    ARRAYS_TRACK.problemIds.slice(0, 7).forEach((problemId, index) => {
      state = practice(state, problemId, minutesAgo(60 - index * 10))
    })
    state = complete(state, POINTERS_TRACK.problemIds[0], TWO_DAYS_AGO)

    const first = placeMemoryCrystals(input(state, { cloudEnabled: true }))
    const second = placeMemoryCrystals(input(state, { cloudEnabled: true }))
    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first.length).toBeGreaterThan(0)
  })

  it('anchors each crystal on the 15 m ring of its own track gate', () => {
    let state = emptyAcademyProgressState()
    state = practice(state, ARRAYS_TRACK.problemIds[0], minutesAgo(30))
    state = practice(state, POINTERS_TRACK.problemIds[0], minutesAgo(30))

    const placed = placeMemoryCrystals(input(state))
    expect(placed).toHaveLength(2)

    const arrays = placed.find(
      ({ problemIds }) => problemIds[0] === ARRAYS_TRACK.problemIds[0],
    )!
    const pointers = placed.find(
      ({ problemIds }) => problemIds[0] === POINTERS_TRACK.problemIds[0],
    )!
    // arrays-hashing is realm1 order 1 → gate [0][0]; two-pointers → [0][1].
    expect([arrays.worldIndex, arrays.part]).toEqual([0, 0])
    expect([pointers.worldIndex, pointers.part]).toEqual([0, 1])
    const arraysGate = WORLD_GATES[0][0]
    const pointersGate = WORLD_GATES[0][1]
    expect(
      Math.hypot(arrays.x - arraysGate.x, arrays.z - arraysGate.z),
    ).toBeCloseTo(CRYSTAL_RING_RADIUS, 6)
    expect(
      Math.hypot(pointers.x - pointersGate.x, pointers.z - pointersGate.z),
    ).toBeCloseTo(CRYSTAL_RING_RADIUS, 6)
  })

  it('caps a gate at 5 singles (ripe first, then soonest-ripening) and clusters the rest', () => {
    let state = emptyAcademyProgressState()
    const ids = ARRAYS_TRACK.problemIds
    // ids[0]: practiced two days ago → ripe.
    state = practice(state, ids[0], TWO_DAYS_AGO)
    // ids[1]: completed but unverified → pendingCloud (cloud on).
    state = complete(state, ids[1], TWO_DAYS_AGO)
    // ids[2..6]: growing, ripening in acquisition order (2 soonest … 6 latest).
    for (let index = 2; index <= 6; index++) {
      state = practice(state, ids[index], minutesAgo(60 - index * 10))
    }

    const placed = placeMemoryCrystals(input(state, { cloudEnabled: true }))
    const singles = placed.filter(({ kind }) => kind === 'single')
    const clusters = placed.filter(({ kind }) => kind === 'cluster')

    expect(singles).toHaveLength(CRYSTALS_PER_GATE)
    // Slot order: ripe, then pendingCloud, then the three soonest-ripening.
    expect(singles.map(({ problemIds }) => problemIds[0])).toEqual([
      ids[0],
      ids[1],
      ids[2],
      ids[3],
      ids[4],
    ])
    expect(singles[0].state).toBe('ripe')
    expect(singles[1].state).toBe('pendingCloud')

    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({
      id: 'crystal-cluster:0:0',
      count: 2,
      state: 'growing',
      problemIds: [ids[5], ids[6]],
    })
  })

  it('keeps every crystal at least the minimum separation apart', () => {
    let state = emptyAcademyProgressState()
    ARRAYS_TRACK.problemIds.forEach((problemId, index) => {
      state = practice(state, problemId, minutesAgo(90 - index * 5))
    })
    const placed = placeMemoryCrystals(input(state))
    expect(placed.length).toBe(CRYSTALS_PER_GATE + 1)
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        const distance = Math.hypot(
          placed[a].x - placed[b].x,
          placed[a].z - placed[b].z,
        )
        expect(distance).toBeGreaterThanOrEqual(CRYSTAL_MIN_SEPARATION)
      }
    }
  })

  it('steps around colliders in ±10° increments and stays deterministic', () => {
    const gate = WORLD_GATES[0][0]
    // Slot 0 sits at base angle 0 → (gate.x + 15, gate.z). Block exactly it.
    const blocked = { x: gate.x + CRYSTAL_RING_RADIUS, z: gate.z, hw: 0.5, hd: 0.5 }
    const state = practice(
      emptyAcademyProgressState(),
      ARRAYS_TRACK.problemIds[0],
      minutesAgo(30),
    )

    const clear = placeMemoryCrystals(input(state, { collidersNear: () => [] }))
    const dodged = placeMemoryCrystals(
      input(state, { collidersNear: () => [blocked] }),
    )
    const dodgedAgain = placeMemoryCrystals(
      input(state, { collidersNear: () => [blocked] }),
    )
    expect(dodged).toEqual(dodgedAgain)

    // Unblocked, slot 0 lands on the base spot; blocked, it steps off it…
    expect(clear[0].x).toBeCloseTo(gate.x + CRYSTAL_RING_RADIUS, 6)
    expect(clear[0].z).toBeCloseTo(gate.z, 6)
    expect(
      Math.hypot(dodged[0].x - blocked.x, dodged[0].z - blocked.z),
    ).toBeGreaterThan(1)
    // …by exactly one 10° step, still on the ring.
    const angle = Math.atan2(dodged[0].z - gate.z, dodged[0].x - gate.x)
    expect(Math.abs(angle)).toBeCloseTo((10 * Math.PI) / 180, 6)
    expect(
      Math.hypot(dodged[0].x - gate.x, dodged[0].z - gate.z),
    ).toBeCloseTo(CRYSTAL_RING_RADIUS, 6)
  })

  it('falls back to the base slot when a full sweep finds no clear spot', () => {
    const gate = WORLD_GATES[0][0]
    const everywhere = { x: gate.x, z: gate.z, hw: 1_000, hd: 1_000 }
    const state = practice(
      emptyAcademyProgressState(),
      ARRAYS_TRACK.problemIds[0],
      minutesAgo(30),
    )
    const placed = placeMemoryCrystals(
      input(state, { collidersNear: () => [everywhere] }),
    )
    // Slot 0's base angle is 0 · CRYSTAL_GOLDEN_ANGLE = 0.
    const base = 0
    expect(placed[0].x).toBeCloseTo(gate.x + Math.cos(base) * CRYSTAL_RING_RADIUS, 6)
    expect(placed[0].z).toBeCloseTo(gate.z + Math.sin(base) * CRYSTAL_RING_RADIUS, 6)
  })
})
