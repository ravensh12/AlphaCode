import { describe, expect, it } from 'vitest'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  CITY_LIMIT,
  GATES_PER_WORLD,
  START_3D,
  WORLD_GATES,
  collidersNear,
} from '../components/game3d/layout'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId, TrackId } from '../types/curriculum'
import {
  emptyAcademyProgressState,
  recordMissionPractice,
} from './academyProgress'
import {
  ALL_BEATS,
  MISSION_LOCKED_LABEL,
  WORLD_BEATS,
  beatForProblem,
  buildBeatInteractables,
  legBeatProgress,
  legBeatStatuses,
  legBeats,
  nextPendingBeat,
  worldBeatVisuals,
} from './encounterBeats'

const NOW = '2026-07-11T18:00:00.000Z'

function practiceProblem(
  state: AcademyProgressState,
  problemId: ProblemId,
): AcademyProgressState {
  return recordMissionPractice(state, {
    problemId,
    acquiredAt: NOW,
    practicedAt: NOW,
    acquisitionPassed: true,
    transferPassed: true,
    codeTestsPassed: true,
    acquisitionEventIds: [`acquisition:${problemId}`],
    transferEventIds: [`python:${problemId}`],
    codeTestEventIds: [`python:${problemId}`],
  })
}

function practiceTrack(
  state: AcademyProgressState,
  trackId: TrackId,
): AcademyProgressState {
  const track = NEETCODE_150_TRACK_BY_ID.get(trackId)!
  return track.problemIds.reduce(practiceProblem, state)
}

const NO_ENCOUNTERS: ReadonlySet<string> = new Set()

describe('beat map', () => {
  it('assigns every one of the 150 problems to exactly one beat', () => {
    expect(ALL_BEATS).toHaveLength(NEETCODE_150_MANIFEST.problems.length)
    const problemIds = new Set(ALL_BEATS.map(({ problemId }) => problemId))
    expect(problemIds.size).toBe(NEETCODE_150_MANIFEST.problems.length)
  })

  it('gives each leg exactly its track size, in track order', () => {
    NEETCODE_150_MANIFEST.realms.forEach((realm, world) => {
      realm.trackIds.forEach((trackId, part) => {
        const track = NEETCODE_150_TRACK_BY_ID.get(trackId)!
        const beats = legBeats(world, part)
        expect(beats).toHaveLength(track.problemIds.length)
        expect(beats.map(({ problemId }) => problemId)).toEqual([
          ...track.problemIds,
        ])
        // Exactly one capstone, and it's the last beat.
        expect(beats.filter(({ capstone }) => capstone)).toHaveLength(1)
        expect(beats.at(-1)?.capstone).toBe(true)
      })
    })
  })

  it('is deterministic and places every beat inside the city', () => {
    const again = WORLD_BEATS.flat(2)
    expect(again.map(({ id, x, z, kind }) => ({ id, x, z, kind }))).toEqual(
      ALL_BEATS.map(({ id, x, z, kind }) => ({ id, x, z, kind })),
    )
    for (const beat of ALL_BEATS) {
      expect(Math.hypot(beat.x, beat.z)).toBeLessThanOrEqual(CITY_LIMIT + 12)
    }
  })

  it('spreads every leg out — real traversal between neighbouring missions', () => {
    for (let world = 0; world < WORLD_BEATS.length; world++) {
      for (let part = 0; part < GATES_PER_WORLD; part++) {
        const beats = legBeats(world, part)
        for (let i = 1; i < beats.length; i++) {
          const d = Math.hypot(
            beats[i].x - beats[i - 1].x,
            beats[i].z - beats[i - 1].z,
          )
          expect(d, `${beats[i].id} vs ${beats[i - 1].id}`).toBeGreaterThan(25)
        }
      }
    }
  })

  it('keeps every pair of stops on a leg physically apart (no piles)', () => {
    for (let world = 0; world < WORLD_BEATS.length; world++) {
      for (let part = 0; part < GATES_PER_WORLD; part++) {
        const beats = legBeats(world, part)
        for (let i = 0; i < beats.length; i++) {
          for (let j = i + 1; j < beats.length; j++) {
            const d = Math.hypot(
              beats[i].x - beats[j].x,
              beats[i].z - beats[j].z,
            )
            expect(d, `${beats[i].id} vs ${beats[j].id}`).toBeGreaterThan(20)
          }
        }
      }
    }
  })

  it('never places a beat inside a building/prop footprint', () => {
    for (const beat of ALL_BEATS) {
      const clipped = collidersNear(beat.x, beat.z).some(
        (c) =>
          Math.abs(beat.x - c.x) <= c.hw + 0.7 &&
          Math.abs(beat.z - c.z) <= c.hd + 0.7,
      )
      expect(clipped, beat.id).toBe(false)
    }
  })

  it('pins the capstone beat near its gate', () => {
    for (let world = 0; world < WORLD_BEATS.length; world++) {
      for (let part = 0; part < GATES_PER_WORLD; part++) {
        const last = legBeats(world, part).at(-1)!
        const gate = WORLD_GATES[world][part]
        expect(Math.hypot(last.x - gate.x, last.z - gate.z)).toBeLessThan(30)
      }
    }
  })

  it('opens with the save-citizen rescue, then the corrupt-terminal defense', () => {
    // Owner call (July 2026): mission 1 = save citizen (rescue), mission 2 =
    // corrupt terminal (still carries its ~30s hold-the-line defense), mission
    // 3 = elite bounty — one encounter mechanic introduced per opening mission.
    expect(legBeats(0, 0).slice(0, 3).map(({ kind }) => kind)).toEqual([
      'rescue',
      'terminal',
      'bounty',
    ])
  })

  it('places the first mission a real trek from the spawn plaza', () => {
    const first = legBeats(0, 0)[0]
    expect(Math.hypot(first.x - START_3D.x, first.z - START_3D.z)).toBeGreaterThan(80)
  })

  it('looks up beats by problem id', () => {
    const first = legBeats(0, 0)[0]
    expect(beatForProblem(first.problemId)).toEqual(first)
  })
})

describe('beat statuses', () => {
  it('unlocks beats in order and seals the capstone behind the siege', () => {
    const empty = emptyAcademyProgressState()
    const statuses = legBeatStatuses(empty, 0, 0, { siegeReady: false })
    expect(statuses[0]).toBe('available')
    expect(statuses.slice(1).every((s) => s === 'locked')).toBe(true)

    // Practice everything but the capstone: it stays sealed until the siege.
    const beats = legBeats(0, 0)
    const nearlyDone = beats
      .slice(0, -1)
      .reduce((s, b) => practiceProblem(s, b.problemId), empty)
    expect(
      legBeatStatuses(nearlyDone, 0, 0, { siegeReady: false }).at(-1),
    ).toBe('locked')
    expect(
      legBeatStatuses(nearlyDone, 0, 0, { siegeReady: true }).at(-1),
    ).toBe('available')
  })

  it('derives cleared beats from practice evidence (auto-migration)', () => {
    const state = practiceTrack(emptyAcademyProgressState(), 'arrays-hashing')
    const statuses = legBeatStatuses(state, 0, 0, { siegeReady: false })
    expect(statuses.every((s) => s === 'cleared')).toBe(true)
    expect(nextPendingBeat(state, 0, 0)).toBeNull()
    expect(legBeatProgress(state, 0, 0)).toEqual({
      cleared: legBeats(0, 0).length,
      total: legBeats(0, 0).length,
    })
  })

  it('nextPendingBeat follows track order', () => {
    const empty = emptyAcademyProgressState()
    const beats = legBeats(0, 0)
    expect(nextPendingBeat(empty, 0, 0)?.id).toBe(beats[0].id)
    const one = practiceProblem(empty, beats[0].problemId)
    expect(nextPendingBeat(one, 0, 0)?.id).toBe(beats[1].id)
  })
})

describe('buildBeatInteractables', () => {
  const baseInput = {
    isShowcaseAccount: false,
    siegeReady: false,
    activeWorld: 0,
    activePart: 0,
    clearedEncounterIds: NO_ENCOUNTERS,
  }

  it('emits every leg of the active world for a fresh player, one unlocked', () => {
    const out = buildBeatInteractables({
      ...baseInput,
      academyProgress: emptyAcademyProgressState(),
    })
    // All three legs of world 0 are pressable (future ones locked, so their
    // visible street markers explain themselves); other worlds stay silent.
    expect(out.length).toBe(
      legBeats(0, 0).length + legBeats(0, 1).length + legBeats(0, 2).length,
    )
    expect(out.every(({ payload }) => payload.kind === 'beat')).toBe(true)
    const unlocked = out.filter(({ target }) => !target.locked)
    expect(unlocked).toHaveLength(1)
    expect(unlocked[0].target.key).toBe(legBeats(0, 0)[0].id)
  })

  it('locks every beat of a not-yet-reachable leg with the unlock message', () => {
    const out = buildBeatInteractables({
      ...baseInput,
      academyProgress: emptyAcademyProgressState(),
    })
    const futureLeg = out.filter(({ target }) => target.part === 1)
    expect(futureLeg).toHaveLength(legBeats(0, 1).length)
    for (const { target, prompt } of futureLeg) {
      expect(target.locked, target.key).toBe(true)
      expect(prompt.lockedLabel).toBe(MISSION_LOCKED_LABEL)
    }
  })

  it('opens the next leg once the previous track is practice-complete', () => {
    const state = practiceTrack(emptyAcademyProgressState(), 'arrays-hashing')
    const out = buildBeatInteractables({
      ...baseInput,
      academyProgress: state,
      activePart: 1,
    })
    // Leg 0 is fully cleared (scenery, no targets); leg 1's beats appear
    // live, and leg 2's stay pressable-but-locked behind them.
    expect(out.length).toBe(legBeats(0, 1).length + legBeats(0, 2).length)
    expect(out[0].target.key).toBe(legBeats(0, 1)[0].id)
    const unlocked = out.filter(({ target }) => !target.locked)
    expect(unlocked).toHaveLength(1)
    expect(unlocked[0].target.key).toBe(legBeats(0, 1)[0].id)
  })

  it('terminal beats never require an encounter; bounty/rescue do', () => {
    const out = buildBeatInteractables({
      ...baseInput,
      academyProgress: emptyAcademyProgressState(),
    })
    for (const { payload } of out) {
      if (payload.kind !== 'beat') continue
      if (payload.beatKind === 'terminal') {
        expect(payload.encounterCleared).toBe(true)
      } else {
        expect(payload.encounterCleared).toBe(false)
      }
    }
  })

  it('pending bounty/rescue prompts say kill/clear first to unlock', () => {
    const out = buildBeatInteractables({
      ...baseInput,
      academyProgress: emptyAcademyProgressState(),
    })
    for (const { target, payload, prompt } of out) {
      if (payload.kind !== 'beat' || payload.encounterCleared) continue
      if (target.locked) {
        // A locked beat must not coach the fight — its prompt explains the
        // mission isn't unlocked instead.
        expect(prompt.verb).not.toBe('Kill')
        expect(prompt.verb).not.toBe('Clear')
        continue
      }
      if (payload.beatKind === 'bounty') {
        expect(prompt.verb).toBe('Kill')
        expect(prompt.label.toLowerCase()).toContain('unlock')
      }
      if (payload.beatKind === 'rescue') {
        expect(prompt.verb).toBe('Clear')
        expect(prompt.label.toLowerCase()).toContain('unlock')
      }
    }
  })

  it('marks bounty/rescue encounters cleared from the session set', () => {
    const beats = legBeats(0, 0)
    const fight = beats.find(({ kind }) => kind !== 'terminal')
    if (!fight) return // pool happens to be all terminals — nothing to assert
    const out = buildBeatInteractables({
      ...baseInput,
      academyProgress: emptyAcademyProgressState(),
      clearedEncounterIds: new Set([fight.id]),
    })
    const target = out.find(({ target }) => target.key === fight.id)
    expect(target?.payload.kind === 'beat' && target.payload.encounterCleared).toBe(
      true,
    )
  })
})

describe('worldBeatVisuals', () => {
  it('renders cleared beats as scenery and flags the active objective', () => {
    const empty = emptyAcademyProgressState()
    const beats = legBeats(0, 0)
    const one = practiceProblem(empty, beats[0].problemId)
    const visuals = worldBeatVisuals(one, 0, {
      siegeReady: false,
      activePart: 0,
      activeBeatId: beats[1].id,
      clearedEncounterIds: NO_ENCOUNTERS,
    })
    const byId = new Map(visuals.map((v) => [v.id, v]))
    expect(byId.get(beats[0].id)?.status).toBe('cleared')
    expect(byId.get(beats[1].id)?.active).toBe(true)
    // All three legs of the world are represented.
    expect(visuals.length).toBe(
      legBeats(0, 0).length + legBeats(0, 1).length + legBeats(0, 2).length,
    )
  })

  it('dims every beat of legs beyond the active part (no stray glow)', () => {
    const visuals = worldBeatVisuals(emptyAcademyProgressState(), 0, {
      siegeReady: false,
      activePart: 0,
      activeBeatId: legBeats(0, 0)[0].id,
      clearedEncounterIds: NO_ENCOUNTERS,
    })
    for (const v of visuals) {
      const part = Number(v.id.split('-')[2])
      if (part > 0) {
        expect(v.status, v.id).toBe('locked')
        expect(v.active, v.id).toBe(false)
      }
    }
    // The live leg still surfaces its one available mission.
    const activeLeg = visuals.filter((v) => v.id.startsWith('beat-0-0-'))
    expect(activeLeg.filter((v) => v.status === 'available')).toHaveLength(1)
  })
})
