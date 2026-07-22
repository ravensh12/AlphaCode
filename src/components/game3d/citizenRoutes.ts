import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  ROAD_HALF_W,
  ROAD_LINES,
  START_3D,
  WORLD_GATES,
  type Vec2,
} from './layout'

/* ============================================================================
   Phase 3 — CITIZEN SIDEWALK ROUTES (pure, Node-testable).

   Robot citizens stroll the sidewalks by day (they shelter from the
   corruption at night — which conveniently frees the frame budget exactly
   when the horde peaks). Each citizen owns one straight sidewalk segment
   between two intersections and ping-pongs along it; segments avoid quest
   plazas so pedestrians never crowd an objective.

   The walk itself is evaluated by tiny pure helpers (`citizenPoseAt`,
   `citizenClipFor`) shared by the renderer and the tests, so foot-plant
   rates and turnarounds are verifiable in Node.
   ========================================================================== */

/** Sidewalk walk-line offset from the road centreline (kerb 7.3, lamps 10). */
export const SIDEWALK_OFFSET = ROAD_HALF_W + 2.2

export const CITIZEN_SPEED_MIN = 0.9
export const CITIZEN_SPEED_MAX = 1.7

/** Locomotion reference speed for the Walk cycle (m/s at rate 1). */
export const CITIZEN_WALK_REF = 1.35

export interface CitizenRoute {
  /** 0 = segment runs along z at x = line+offset; 1 = along x. */
  axis: 0 | 1
  /** Road centreline the sidewalk belongs to. */
  line: number
  /** Which side of the road (multiplies SIDEWALK_OFFSET). */
  side: 1 | -1
  /** Segment endpoints along the travel axis. */
  start: number
  end: number
  /** Walk speed, m/s. */
  speed: number
  /** 0..1 phase offset so crowds never march in sync. */
  phase: number
  /** Outfit tint index (0..5). */
  tint: number
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CLEARINGS: { p: Vec2; r: number }[] = [
  ...CHECKPOINTS_3D.map((c) => ({ p: c.flag, r: 26 })),
  ...CHECKPOINTS_3D.map((c) => ({ p: c.boss, r: 26 })),
  ...WORLD_GATES.flatMap((gates) => gates.map((g) => ({ p: g, r: 24 }))),
  { p: START_3D, r: 24 },
]

function nearClearing(x: number, z: number): boolean {
  for (const c of CLEARINGS) {
    const dx = c.p.x - x
    const dz = c.p.z - z
    if (dx * dx + dz * dz < c.r * c.r) return true
  }
  return false
}

/** Segment length walked between turnarounds. */
export function routeLength(route: CitizenRoute): number {
  return route.end - route.start
}

/**
 * Deterministic sidewalk segments for `count` citizens. Each segment spans
 * one city block (between adjacent grid lines, inset past the intersection),
 * stays inside the city ring, and skips quest plazas.
 */
export function buildCitizenRoutes(count: number, seed = 20260714): CitizenRoute[] {
  const rnd = mulberry32(seed)
  const routes: CitizenRoute[] = []
  const inset = ROAD_HALF_W + 4
  let guard = 0
  while (routes.length < count && guard < count * 60) {
    guard++
    const axis: 0 | 1 = rnd() < 0.5 ? 0 : 1
    const line = ROAD_LINES[Math.floor(rnd() * ROAD_LINES.length) % ROAD_LINES.length]
    const k = Math.floor(rnd() * (ROAD_LINES.length - 1))
    const a = ROAD_LINES[k] + inset
    const b = ROAD_LINES[k + 1] - inset
    if (b - a < 22) continue
    const side: 1 | -1 = rnd() < 0.5 ? 1 : -1
    const cross = line + side * SIDEWALK_OFFSET
    const midAlong = (a + b) / 2
    const x = axis === 0 ? cross : midAlong
    const z = axis === 0 ? midAlong : cross
    if (Math.hypot(x, z) > CITY_LIMIT - 12) continue
    if (nearClearing(x, z)) continue
    routes.push({
      axis,
      line,
      side,
      start: a,
      end: b,
      speed: CITIZEN_SPEED_MIN + rnd() * (CITIZEN_SPEED_MAX - CITIZEN_SPEED_MIN),
      phase: rnd(),
      tint: Math.floor(rnd() * 6),
    })
  }
  return routes
}

export interface CitizenPose {
  x: number
  z: number
  /** Facing (radians, atan2(dx, dz) convention like the rest of the game). */
  heading: number
}

/**
 * Ping-pong position + facing along a route at gameplay time t. Pure —
 * exactly what CitizenCrowd evaluates per frame, so tests can pin turnaround
 * behavior and bounds.
 */
export function citizenPoseAt(route: CitizenRoute, t: number, out: CitizenPose): CitizenPose {
  const len = routeLength(route)
  const travel = route.phase * len * 2 + t * route.speed
  const cycle = travel % (len * 2)
  const wrapped = cycle < 0 ? cycle + len * 2 : cycle
  const forward = wrapped < len
  const along = route.start + (forward ? wrapped : len * 2 - wrapped)
  const cross = route.line + route.side * SIDEWALK_OFFSET
  if (route.axis === 0) {
    out.x = cross
    out.z = along
    out.heading = forward ? 0 : Math.PI
  } else {
    out.x = along
    out.z = cross
    out.heading = forward ? Math.PI / 2 : -Math.PI / 2
  }
  return out
}

/** Clip + playback rate for a ground speed (citizens only Idle/Walk). */
export function citizenClipFor(speed: number): { clip: 'Idle' | 'Walk'; rate: number } {
  if (speed < 0.2) return { clip: 'Idle', rate: 1 }
  return {
    clip: 'Walk',
    rate: Math.min(2.2, Math.max(0.6, speed / CITIZEN_WALK_REF)),
  }
}
