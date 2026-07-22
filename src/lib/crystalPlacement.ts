import {
  WORLD_GATES,
  collidersNear as layoutCollidersNear,
  type Collider,
  type Vec2,
} from '../components/game3d/layout'
import {
  NEETCODE_150_MANIFEST,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId } from '../types/curriculum'
import { normalizeAcademyProgressState } from './academyProgress'
import {
  crystalRetentionAvailableAt,
  crystalStateForProblem,
  type CrystalState,
} from './memoryCrystals'

/* ============================================================================
   Memory-crystal placement — pure and fully deterministic.

   Every practiced/completed mission grows a crystal anchored at its TRACK GATE
   (WORLD_GATES[worldIndex][part] — worldIndex from the realm's manifest order,
   part from the track's realmOrder). Crystals sit on a golden-angle ring of
   radius 15 m around the gate; each slot is validated against the static city
   colliders and the crystals already placed, stepping ±10° at a time until a
   clear spot is found (falling back to the raw slot if a full sweep fails, so
   the result is always defined and always the same for the same input).

   A gate shows at most CRYSTALS_PER_GATE individual crystals — harvestable
   ones first (ripe, then pendingCloud), then growing ones soonest-ripening
   first, then cleared ones. Anything past the cap collapses into ONE cluster
   crystal carrying the overflow count, placed like a sixth ring slot.
   ========================================================================== */

export const CRYSTAL_RING_RADIUS = 15
export const CRYSTAL_MIN_SEPARATION = 2.2
export const CRYSTALS_PER_GATE = 5
export const CRYSTAL_STEP_RADIANS = (10 * Math.PI) / 180
/** Fibonacci golden angle (~137.5°) — fills the ring without clumping. */
export const CRYSTAL_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** Extra clearance kept between a crystal and any collider face. */
export const CRYSTAL_COLLIDER_CLEARANCE = 0.6

export interface PlacedCrystal {
  /** `crystal:<problemId>` or `crystal-cluster:<world>:<part>`. */
  id: string
  kind: 'single' | 'cluster'
  /** Cluster state = the most urgent state among its members. */
  state: CrystalState
  /** One problem for singles; every collapsed member for clusters. */
  problemIds: readonly ProblemId[]
  /** problemIds.length — surfaced separately for the HUD count badge. */
  count: number
  worldIndex: number
  part: number
  x: number
  z: number
}

export interface CrystalPlacementInput {
  academyProgress: AcademyProgressState
  /** Evaluation moment (epoch ms or ISO) — drives ripeness ordering. */
  now: number | string
  cloudEnabled: boolean
  /**
   * Static-collider lookup (defaults to the city broadphase). Injectable so
   * tests can force reject-and-step without depending on city geometry.
   */
  collidersNear?: (x: number, z: number) => readonly Collider[]
}

/** Lower rank = closer to the front of a gate's five visible slots. */
const STATE_RANK: Record<CrystalState, number> = {
  ripe: 0,
  pendingCloud: 1,
  growing: 2,
  cleared: 3,
}

interface CrystalSeed {
  problemId: ProblemId
  state: CrystalState
  /** Ripening moment (ms) for orderings; Infinity when not applicable. */
  availableAtMs: number
  globalOrder: number
  worldIndex: number
  part: number
}

function pointHitsColliders(
  x: number,
  z: number,
  collidersAt: (x: number, z: number) => readonly Collider[],
): boolean {
  for (const collider of collidersAt(x, z)) {
    if (
      Math.abs(x - collider.x) <= collider.hw + CRYSTAL_COLLIDER_CLEARANCE &&
      Math.abs(z - collider.z) <= collider.hd + CRYSTAL_COLLIDER_CLEARANCE
    ) {
      return true
    }
  }
  return false
}

function tooCloseToPlaced(x: number, z: number, placed: readonly PlacedCrystal[]): boolean {
  for (const crystal of placed) {
    if (Math.hypot(crystal.x - x, crystal.z - z) < CRYSTAL_MIN_SEPARATION) {
      return true
    }
  }
  return false
}

/**
 * Candidate angles for one ring slot: the golden-angle base, then ±10°, ±20°,
 * … out to ±180°. The first candidate clear of colliders and other crystals
 * wins; a fully blocked sweep settles on the base slot (still deterministic).
 */
function placeOnRing(
  gate: Vec2,
  slot: number,
  placed: readonly PlacedCrystal[],
  collidersAt: (x: number, z: number) => readonly Collider[],
): Vec2 {
  const base = slot * CRYSTAL_GOLDEN_ANGLE
  for (let step = 0; step <= 18; step++) {
    for (const side of step === 0 ? [1] : [1, -1]) {
      if (step === 18 && side === -1) continue // ±180° coincide
      const angle = base + side * step * CRYSTAL_STEP_RADIANS
      const x = gate.x + Math.cos(angle) * CRYSTAL_RING_RADIUS
      const z = gate.z + Math.sin(angle) * CRYSTAL_RING_RADIUS
      if (pointHitsColliders(x, z, collidersAt)) continue
      if (tooCloseToPlaced(x, z, placed)) continue
      return { x, z }
    }
  }
  return {
    x: gate.x + Math.cos(base) * CRYSTAL_RING_RADIUS,
    z: gate.z + Math.sin(base) * CRYSTAL_RING_RADIUS,
  }
}

function compareSeeds(a: CrystalSeed, b: CrystalSeed): number {
  return (
    STATE_RANK[a.state] - STATE_RANK[b.state] ||
    a.availableAtMs - b.availableAtMs ||
    a.globalOrder - b.globalOrder
  )
}

/**
 * Place every crystal the current progress grows. Pure: identical input
 * (progress, clock, cloud flag) always yields identical placements.
 */
export function placeMemoryCrystals(
  input: CrystalPlacementInput,
): PlacedCrystal[] {
  const collidersAt = input.collidersNear ?? layoutCollidersNear
  const state = normalizeAcademyProgressState(input.academyProgress)
  const clock = { now: input.now, cloudEnabled: input.cloudEnabled }

  // Seed one crystal per practiced/completed problem, keyed to its track gate.
  const byGate = new Map<string, { gate: Vec2; seeds: CrystalSeed[] }>()
  for (const problem of NEETCODE_150_MANIFEST.problems) {
    const crystalState = crystalStateForProblem(state, problem.id, clock)
    if (!crystalState) continue
    const track = NEETCODE_150_TRACK_BY_ID.get(problem.trackId)
    if (!track) continue
    const worldIndex = NEETCODE_150_MANIFEST.realms.findIndex(
      ({ id }) => id === track.realmId,
    )
    const part = track.realmOrder - 1
    const gate = WORLD_GATES[worldIndex]?.[part]
    if (!gate) continue
    const availableAt = crystalRetentionAvailableAt(state, problem.id)
    const seed: CrystalSeed = {
      problemId: problem.id,
      state: crystalState,
      availableAtMs: availableAt ? Date.parse(availableAt) : Infinity,
      globalOrder: problem.globalOrder,
      worldIndex,
      part,
    }
    const key = `${worldIndex}:${part}`
    const bucket = byGate.get(key)
    if (bucket) bucket.seeds.push(seed)
    else byGate.set(key, { gate, seeds: [seed] })
  }

  // Manifest problem order is stable, so bucket contents are already
  // deterministic; sort by urgency and lay out each gate's ring.
  const placed: PlacedCrystal[] = []
  const gateKeys = [...byGate.keys()].sort()
  for (const key of gateKeys) {
    const { gate, seeds } = byGate.get(key)!
    seeds.sort(compareSeeds)
    const singles = seeds.slice(0, CRYSTALS_PER_GATE)
    const overflow = seeds.slice(CRYSTALS_PER_GATE)

    singles.forEach((seed, slot) => {
      const spot = placeOnRing(gate, slot, placed, collidersAt)
      placed.push({
        id: `crystal:${seed.problemId}`,
        kind: 'single',
        state: seed.state,
        problemIds: [seed.problemId],
        count: 1,
        worldIndex: seed.worldIndex,
        part: seed.part,
        x: spot.x,
        z: spot.z,
      })
    })

    if (overflow.length > 0) {
      const spot = placeOnRing(gate, CRYSTALS_PER_GATE, placed, collidersAt)
      placed.push({
        id: `crystal-cluster:${overflow[0].worldIndex}:${overflow[0].part}`,
        kind: 'cluster',
        state: overflow[0].state,
        problemIds: overflow.map(({ problemId }) => problemId),
        count: overflow.length,
        worldIndex: overflow[0].worldIndex,
        part: overflow[0].part,
        x: spot.x,
        z: spot.z,
      })
    }
  }
  return placed
}
