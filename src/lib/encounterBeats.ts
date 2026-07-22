import {
  NEETCODE_150_PROBLEM_BY_ID,
  NEETCODE_150_REALMS,
  NEETCODE_150_TRACK_BY_ID,
} from '../content/curricula/neetcode150'
import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  GATES_PER_WORLD,
  ROAD_LINES,
  START_3D,
  WORLD_GATES,
  collidersNear,
  questDoor,
  roadRoute,
  type Vec2,
} from '../components/game3d/layout'
import {
  INTERACT_PRIORITY,
  INTERACT_RADIUS,
  type CityInteractable,
} from '../components/game3d/city/interactables'
import {
  canEnterAcademyCheckpointWithShowcase,
} from './showcaseOverride'
import { normalizeAcademyProgressState } from './academyProgress'
import type { AcademyProgressState } from '../types/academy'
import type { ProblemId, RealmId, TrackId } from '../types/curriculum'

/* ============================================================================
   Encounter beats — the spread-out learning world.

   Every one of the 150 academy missions is delivered as ONE in-world event
   ("beat") on the street between checkpoints, instead of a 3–15 mission
   grind behind each gate. A beat is an interactable encounter:

     - terminal: a corrupted console blocks the kerb — restore it (do the
       mission) and the street heals.
     - rescue:   a trapped citizen ringed by zombies — clear the ring, then
       they teach you the mission as thanks.
     - bounty:   a named Elite Glitch prowls the block — take it down, then
       recover the data shard (the mission) it drops.

   Beats derive their positions deterministically from the same layout the
   gates use, and their CLEARED state derives purely from academy practice
   evidence — a beat is done iff its problem is practiced. Nothing new is
   persisted, so existing player progress maps onto beats automatically.

   Progression rules:
     - Beats unlock IN ORDER along a leg (missions build on each other).
     - The FINAL beat of each leg sits at the gate and stays sealed until the
       checkpoint's hold-out siege is survived — the gate siege is the leg's
       capstone fight.
     - A leg's beats appear only when the earlier tracks of the realm are
       practice-complete (same sequencing the academy already enforces).
   ========================================================================== */

export type BeatKind = 'terminal' | 'rescue' | 'bounty'
export type BeatStatus = 'cleared' | 'available' | 'locked'

export type EncounterBeat = {
  /** Stable id: `beat-<world>-<part>-<index>`. */
  id: string
  worldIndex: number
  /** Which checkpoint leg of the world (0-based gate index). */
  part: number
  /** 0-based order within the leg (track order). */
  index: number
  kind: BeatKind
  problemId: ProblemId
  realmId: RealmId
  trackId: TrackId
  problemSlug: string
  title: string
  x: number
  z: number
  /** True for the leg's final, siege-sealed capstone beat. */
  capstone: boolean
}

const KINDS: readonly BeatKind[] = ['terminal', 'rescue', 'bounty']

/** Deterministic per-beat hash → stable pseudo-random kind assignment. */
function hash3(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Curated onboarding rotation for the game's opening leg: the FIRST beat is the
 * save-the-citizen rescue (clear the zombie ring, then press E), the second is
 * the hold-the-line corrupted-terminal defense (survive the ~30s corruption
 * surge, then press E to restore it), and the third is an elite bounty — so a
 * brand-new player meets all three encounter mechanics in their first three
 * missions. Owner call (July 2026): mission 1 = save citizen, mission 2 =
 * corrupt terminal. The terminal still carries its hold-the-line defense; it
 * now runs as the SECOND mission rather than the opener.
 */
const OPENING_KINDS: readonly BeatKind[] = ['rescue', 'terminal', 'bounty']

function beatKindFor(world: number, part: number, index: number): BeatKind {
  if (world === 0 && part === 0 && index < OPENING_KINDS.length) {
    return OPENING_KINDS[index]
  }
  return KINDS[hash3(world + 1, part + 1, index + 1) % KINDS.length]
}

/** Where the player begins the given leg (the previous objective's door). */
export function legOriginPoint(worldIndex: number, part: number): Vec2 {
  if (part === 0) {
    if (worldIndex === 0) return START_3D
    return questDoor(CHECKPOINTS_3D[worldIndex - 1].boss, 6.5)
  }
  return questDoor(WORLD_GATES[worldIndex][part - 1], 6.5)
}

/* --------------------------------------------------------- beat placement
   Spread pass (July 2026): the shared placeLegStops dog-leg averaged well
   under a road block between missions — dense legs read as a strip mall, not
   a journey. Beats now get their own serpentine tour of the district: the
   route detours through road intersections alternating 2 blocks to EITHER
   side of the direct line, so every mission pulls the player down genuinely
   different streets and the trail beacon has real traversal to guide.
   Deterministic: same inputs, same stops. */

const ROAD_PITCH =
  ROAD_LINES.length > 1 ? ROAD_LINES[1] - ROAD_LINES[0] : 74
const MAX_ROAD = ROAD_LINES.length > 0 ? Math.max(...ROAD_LINES) : 666
/** Minimum physical distance between any two stops of the same leg. */
const MIN_BEAT_SEPARATION = 26

/**
 * Street polyline for a leg's mission tour: origin → a serpentine LADDER of
 * road intersections (columns strictly advance toward the gate; rows swing up
 * to two blocks to alternating sides of the direct line) → gate. Hops between
 * rungs are explicit L-turns along the grid, so the route never retraces a
 * street — every mission stop lands on a genuinely different block. Denser
 * legs earn more rungs so per-mission spacing holds.
 */
function beatTourRoute(origin: Vec2, dest: Vec2, count: number): Vec2[] {
  const alongX = Math.abs(dest.x - origin.x) >= Math.abs(dest.z - origin.z)
  const main = (p: Vec2) => (alongX ? p.x : p.z)
  const cross = (p: Vec2) => (alongX ? p.z : p.x)
  const mk = (m: number, c: number): Vec2 =>
    alongX ? { x: m, z: c } : { x: c, z: m }
  const dir = Math.sign(main(dest) - main(origin)) || 1
  const snapLine = (v: number) =>
    Math.max(-MAX_ROAD, Math.min(MAX_ROAD, Math.round(v / ROAD_PITCH) * ROAD_PITCH))
  const rungs = Math.max(2, Math.min(5, Math.ceil(count / 3)))

  // Streets only exist inside the city disc — every junction the route bends
  // through (rungs AND the corners of L-hops between them) must stay inside.
  const INSET = CITY_LIMIT - 20
  const inside = (p: Vec2) => Math.hypot(p.x, p.z) <= INSET

  const waypoints: Vec2[] = []
  let prev = origin
  for (let i = 0; i < rungs; i++) {
    const f = (i + 1) / (rungs + 1)
    let m = snapLine(main(origin) + (main(dest) - main(origin)) * f)
    if ((m - main(prev)) * dir <= 0) m = snapLine(main(prev) + dir * ROAD_PITCH)
    const side = i % 2 === 0 ? 1 : -1
    const baseCross = cross(origin) + (cross(dest) - cross(origin)) * f
    // Widest swing whose junction AND connecting corner stay inside the city.
    let rung: Vec2 | null = null
    for (const blocks of [2, 1, 0]) {
      const cand = mk(m, snapLine(baseCross + side * blocks * ROAD_PITCH))
      if (!inside(cand)) continue
      if (inside(mk(main(cand), cross(prev))) || inside(mk(main(prev), cross(cand)))) {
        rung = cand
        break
      }
    }
    if (!rung || (main(rung) - main(prev)) * dir <= 0) continue
    prev = rung
    waypoints.push(rung)
  }

  const route: Vec2[] = [origin]
  const pushPt = (p: Vec2) => {
    const last = route[route.length - 1]
    if (last.x !== p.x || last.z !== p.z) route.push(p)
  }
  let firstHop = true
  for (const w of waypoints) {
    const from = route[route.length - 1]
    if (firstHop) {
      for (const p of roadRoute(from, w).slice(1)) pushPt(p)
      firstHop = false
    } else {
      // L-hop between rungs: advance along the previous rung's row street,
      // then swing down the new column street (or the mirrored L if only
      // that corner stays inside the city).
      const cornerA = mk(main(w), cross(from))
      const cornerB = mk(main(from), cross(w))
      pushPt(inside(cornerA) ? cornerA : cornerB)
      pushPt(w)
    }
  }
  for (const p of roadRoute(route[route.length - 1], dest).slice(1)) pushPt(p)
  return route
}

/** True when (x, z) would put a beat marker inside a solid footprint. */
function insideCollider(x: number, z: number): boolean {
  for (const c of collidersNear(x, z)) {
    if (Math.abs(x - c.x) <= c.hw + 0.9 && Math.abs(z - c.z) <= c.hd + 0.9) {
      return true
    }
  }
  return false
}

type PlaceOptions = {
  /**
   * The game's very first leg starts its tour deep into the route so the
   * opening mission is a real trek from the spawn plaza — the player crosses
   * the night city behind the trail beacon before their first fight.
   */
  farFirst: boolean
}

/**
 * Distribute `count` mission stops along the serpentine tour. Stops sit on
 * the asphalt (alternating kerb sides), are pushed off any collider they'd
 * clip, and the FINAL stop stays pinned just short of the gate — it's the
 * leg's capstone. Deterministic: same inputs, same stops.
 */
function placeBeatStops(
  origin: Vec2,
  dest: Vec2,
  count: number,
  options: PlaceOptions,
): Vec2[] {
  if (count <= 0) return []
  const route = beatTourRoute(origin, dest, count)
  const segLen: number[] = []
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    const l = Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z)
    segLen.push(l)
    total += l
  }
  if (total <= 0) return Array.from({ length: count }, () => ({ ...dest }))

  // Point + direction at arc length `t` along the polyline.
  const pointAt = (t: number): { x: number; z: number; dx: number; dz: number } => {
    let rem = Math.max(0, Math.min(total, t))
    for (let i = 0; i < segLen.length; i++) {
      if (rem <= segLen[i] || i === segLen.length - 1) {
        const a = route[i]
        const b = route[i + 1]
        const l = segLen[i] || 1
        const f = Math.min(1, rem / l)
        return {
          x: a.x + (b.x - a.x) * f,
          z: a.z + (b.z - a.z) * f,
          dx: (b.x - a.x) / l,
          dz: (b.z - a.z) / l,
        }
      }
      rem -= segLen[i]
    }
    const last = route[route.length - 1]
    return { x: last.x, z: last.z, dx: 1, dz: 0 }
  }

  // Nudge onto alternating kerb sides (roads are 14 m wide, so still
  // asphalt), falling back through the other kerb / the centreline / small
  // slides along the route if the spot would clip a parked car or prop.
  const settle = (t: number, i: number): Vec2 => {
    const side = i % 2 === 0 ? 1 : -1
    const candidates: Vec2[] = []
    for (const dt of [0, 6, -6, 12, -12]) {
      const a = pointAt(t + dt)
      for (const s of [side * 2.4, -side * 2.4, 0]) {
        candidates.push({ x: a.x - a.dz * s, z: a.z + a.dx * s })
      }
    }
    return candidates.find((c) => !insideCollider(c.x, c.z)) ?? candidates[0]
  }

  const start = options.farFirst
    ? Math.min(Math.max(total * 0.3, 140), total * 0.45)
    : Math.min(34, total * 0.08)
  const end = Math.max(start, total - 10)
  if (count === 1) return [settle(end, 0)]

  // Capstone first (pinned at the gate), then walk the tour forward. Streets
  // the route walks twice (an out-and-back detour) can put arc-distant stops
  // physically side by side, so each stop slides further along the route
  // until it clears EVERY earlier stop and the capstone.
  const capstone = settle(end, count - 1)
  const out: Vec2[] = []
  const separation = (p: Vec2): number => {
    let min = Math.hypot(p.x - capstone.x, p.z - capstone.z)
    for (const q of out) min = Math.min(min, Math.hypot(p.x - q.x, p.z - q.z))
    return min
  }
  let prevT = -Infinity
  for (let i = 0; i < count - 1; i++) {
    const nominal = Math.max(start + ((end - start) * i) / (count - 1), prevT + 14)
    let bestT = nominal
    let bestP = settle(nominal, i)
    let bestSep = separation(bestP)
    for (let step = 6; step <= 96 && bestSep < MIN_BEAT_SEPARATION; step += 6) {
      for (const t of [nominal + step, nominal - step]) {
        if (t < prevT + 14 || t > end - 16) continue
        const p = settle(t, i)
        const sep = separation(p)
        if (sep > bestSep) {
          bestSep = sep
          bestP = p
          bestT = t
        }
      }
    }
    prevT = bestT
    out.push(bestP)
  }
  out.push(capstone)
  return out
}

function buildWorldBeats(): EncounterBeat[][][] {
  return NEETCODE_150_REALMS.map((realm, worldIndex) =>
    realm.trackIds.map((trackId, part) => {
      const problemIds =
        NEETCODE_150_TRACK_BY_ID.get(trackId)?.problemIds ?? []
      const stops = placeBeatStops(
        legOriginPoint(worldIndex, part),
        WORLD_GATES[worldIndex][part],
        problemIds.length,
        // The opening leg's first mission is a long run from the spawn plaza.
        { farFirst: worldIndex === 0 && part === 0 },
      )
      return problemIds.map((problemId, index) => {
        const problem = NEETCODE_150_PROBLEM_BY_ID.get(problemId)
        const stop = stops[index] ?? WORLD_GATES[worldIndex][part]
        return {
          id: `beat-${worldIndex}-${part}-${index}`,
          worldIndex,
          part,
          index,
          kind: beatKindFor(worldIndex, part, index),
          problemId,
          realmId: realm.id,
          trackId,
          problemSlug: problem?.leetcodeSlug ?? '',
          title: problem?.title ?? 'Mission',
          x: stop.x,
          z: stop.z,
          capstone: index === problemIds.length - 1,
        }
      })
    }),
  )
}

/** All beats, `WORLD_BEATS[worldIndex][part][index]`. Computed once. */
export const WORLD_BEATS: readonly (readonly (readonly EncounterBeat[])[])[] =
  buildWorldBeats()

export const ALL_BEATS: readonly EncounterBeat[] = WORLD_BEATS.flat(2)

const BEAT_BY_PROBLEM: ReadonlyMap<ProblemId, EncounterBeat> = new Map(
  ALL_BEATS.map((beat) => [beat.problemId, beat]),
)

export function legBeats(worldIndex: number, part: number): readonly EncounterBeat[] {
  return WORLD_BEATS[worldIndex]?.[part] ?? []
}

export function beatForProblem(problemId: ProblemId): EncounterBeat | null {
  return BEAT_BY_PROBLEM.get(problemId) ?? null
}

export type LegBeatOptions = {
  /** The current leg's hold-out siege is survived (unseals the capstone). */
  siegeReady: boolean
}

/**
 * Status of every beat on a leg, in order. Cleared derives from practice
 * evidence; exactly one beat is 'available' (the first pending one), and the
 * capstone additionally waits for the siege.
 */
export function legBeatStatuses(
  state: AcademyProgressState,
  worldIndex: number,
  part: number,
  options: LegBeatOptions,
): BeatStatus[] {
  const normalized = normalizeAcademyProgressState(state)
  const beats = legBeats(worldIndex, part)
  let pendingSeen = false
  return beats.map((beat) => {
    if (normalized.missionPractices[beat.problemId]) return 'cleared'
    if (pendingSeen) return 'locked'
    pendingSeen = true
    if (beat.capstone && !options.siegeReady) return 'locked'
    return 'available'
  })
}

/** First unpracticed beat of the leg (ignores siege/order seals), or null. */
export function nextPendingBeat(
  state: AcademyProgressState,
  worldIndex: number,
  part: number,
): EncounterBeat | null {
  const normalized = normalizeAcademyProgressState(state)
  for (const beat of legBeats(worldIndex, part)) {
    if (!normalized.missionPractices[beat.problemId]) return beat
  }
  return null
}

/** Cleared / total counts for the leg's progress HUD. */
export function legBeatProgress(
  state: AcademyProgressState,
  worldIndex: number,
  part: number,
): { cleared: number; total: number } {
  const normalized = normalizeAcademyProgressState(state)
  const beats = legBeats(worldIndex, part)
  const cleared = beats.filter(
    (beat) => !!normalized.missionPractices[beat.problemId],
  ).length
  return { cleared, total: beats.length }
}

/* ------------------------------------------------------------ interactables */

export type BeatInteractablesInput = {
  academyProgress: AcademyProgressState
  isShowcaseAccount: boolean
  /** Live hold-out siege state for the ACTIVE leg (world:part key). */
  siegeReady: boolean
  /** The tour's active leg — the only leg whose capstone the siege can seal. */
  activeWorld: number
  activePart: number
  /** Encounter (elite / rescue-ring) fights already won this session. */
  clearedEncounterIds: ReadonlySet<string>
}

const BEAT_PROMPTS: Record<BeatKind, { verb: string; noun: string }> = {
  terminal: { verb: 'Restore', noun: 'Corrupted Terminal' },
  rescue: { verb: 'Rescue', noun: 'Trapped Citizen' },
  bounty: { verb: 'Recover', noun: 'Elite Bounty' },
}

/**
 * Interact line for any beat the player isn't supposed to do yet — with the
 * missions spread across the district (July 2026) players routinely wander
 * into future missions, so the message says plainly why E won't work.
 */
export const MISSION_LOCKED_LABEL =
  'Mission not unlocked — finish the current mission first'

/** Interact prompt while the fight gate is still locked. */
const FIGHT_GATE_PROMPTS: Record<
  Exclude<BeatKind, 'terminal'>,
  { verb: string; label: string }
> = {
  bounty: {
    verb: 'Kill',
    label: 'Elite Glitch first — unlocks the mission',
  },
  rescue: {
    verb: 'Clear',
    label: 'all 5 zombies first — unlocks the mission',
  },
}

/**
 * Every pressable beat, derived purely from progress facts. Reachable legs
 * (previous tracks practice-complete) emit their normal in-order targets.
 * The ACTIVE world's not-yet-reachable legs additionally emit LOCKED targets:
 * their markers are visible on the streets (worldBeatVisuals renders every
 * leg of the district), so wandering into one must explain itself — the
 * prompt says the mission isn't unlocked instead of silently ignoring E.
 * Other worlds render no markers and stay skipped. Cleared beats are
 * scenery, not targets (mirrors the crystal rule).
 */
export function buildBeatInteractables(
  input: BeatInteractablesInput,
): CityInteractable[] {
  const out: CityInteractable[] = []
  for (let worldIndex = 0; worldIndex < WORLD_BEATS.length; worldIndex++) {
    const world = CHECKPOINTS_3D[worldIndex]?.world
    if (!world) continue
    for (let part = 0; part < GATES_PER_WORLD; part++) {
      const enterable = canEnterAcademyCheckpointWithShowcase(
        input.isShowcaseAccount,
        input.academyProgress,
        worldIndex,
        part,
      )
      if (!enterable && worldIndex !== input.activeWorld) continue
      const isActiveLeg =
        worldIndex === input.activeWorld && part === input.activePart
      const statuses = legBeatStatuses(
        input.academyProgress,
        worldIndex,
        part,
        // Only the tour's active leg runs a live siege; revisited legs are open.
        { siegeReady: isActiveLeg ? input.siegeReady : true },
      ).map(
        // A leg the academy hasn't reached has no available mission — every
        // pending beat on it is locked until the current leg is finished.
        (status) => (!enterable && status === 'available' ? 'locked' : status),
      )
      const beats = legBeats(worldIndex, part)
      for (let i = 0; i < beats.length; i++) {
        const beat = beats[i]
        const status = statuses[i]
        if (status === 'cleared') continue
        const prompt = BEAT_PROMPTS[beat.kind]
        const encounterCleared =
          beat.kind === 'terminal' ||
          input.clearedEncounterIds.has(beat.id)
        // The kill/clear-first coaching only belongs on a beat the player can
        // actually work; a locked beat's prompt must not imply the fight
        // would unlock the mission.
        const fightGate =
          status !== 'locked' && !encounterCleared && beat.kind !== 'terminal'
            ? FIGHT_GATE_PROMPTS[beat.kind]
            : null
        out.push({
          target: {
            key: beat.id,
            world,
            kind: 'beat',
            part,
            x: beat.x,
            z: beat.z,
            locked: status === 'locked',
            cleared: false,
            radius: INTERACT_RADIUS.beat,
            priority: INTERACT_PRIORITY.beat,
          },
          payload: {
            kind: 'beat',
            beatId: beat.id,
            worldIndex,
            part,
            beatIndex: beat.index,
            beatKind: beat.kind,
            problemId: beat.problemId,
            realmId: beat.realmId,
            trackId: beat.trackId,
            problemSlug: beat.problemSlug,
            problemTitle: beat.title,
            encounterCleared,
          },
          prompt: {
            verb: fightGate?.verb ?? prompt.verb,
            label: fightGate?.label ?? `${prompt.noun} — ${beat.title}`,
            lockedLabel:
              enterable &&
              beat.capstone &&
              status === 'locked' &&
              !pendingBefore(statuses, i)
                ? 'Survive the checkpoint siege to unseal it'
                : MISSION_LOCKED_LABEL,
          },
        })
      }
    }
  }
  return out
}

function pendingBefore(statuses: readonly BeatStatus[], index: number): boolean {
  for (let i = 0; i < index; i++) {
    if (statuses[i] !== 'cleared') return true
  }
  return false
}

/* ---------------------------------------------------------------- visuals */

export type BeatVisual = {
  id: string
  x: number
  z: number
  kind: BeatKind
  status: BeatStatus
  /** The guide's current objective — gets the tall light beacon. */
  active: boolean
  /** Bounty/rescue whose fight is still pending (renders the threat tell). */
  fightPending: boolean
}

/**
 * Everything the 3D beat layer renders for one world: pending beats plus the
 * small "restored" landmarks left behind by cleared ones. Legs BEYOND the
 * tour's active part render fully locked (dim markers) — their first pending
 * beat must not glow like a live objective while the player is still working
 * an earlier street.
 */
export function worldBeatVisuals(
  state: AcademyProgressState,
  worldIndex: number,
  options: {
    siegeReady: boolean
    activePart: number
    activeBeatId: string | null
    clearedEncounterIds: ReadonlySet<string>
  },
): BeatVisual[] {
  const out: BeatVisual[] = []
  for (let part = 0; part < GATES_PER_WORLD; part++) {
    const statuses = legBeatStatuses(state, worldIndex, part, {
      siegeReady: part === options.activePart ? options.siegeReady : true,
    }).map((status) =>
      part > options.activePart && status === 'available' ? 'locked' : status,
    )
    const beats = legBeats(worldIndex, part)
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i]
      out.push({
        id: beat.id,
        x: beat.x,
        z: beat.z,
        kind: beat.kind,
        status: statuses[i],
        active: beat.id === options.activeBeatId,
        fightPending:
          statuses[i] !== 'cleared' &&
          beat.kind !== 'terminal' &&
          !options.clearedEncounterIds.has(beat.id),
      })
    }
  }
  return out
}
