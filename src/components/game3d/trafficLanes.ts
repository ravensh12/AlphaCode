import { CITY_LIMIT, ROAD_LINES } from './layout'

/* ============================================================================
   Phase 3 — HOVER TRAFFIC LANES (pure math, Node-testable).

   Ambient hover-pods cruise the avenues at rooftop-skimming height. They fly
   the SAME ±5.2m rails the data-pulse shader paints on the asphalt
   (simulation.ts applyRoadPulse) — the pods ARE the packets, made physical.

   Everything about a pod's motion is decided here once and baked into static
   per-instance attributes; the vertex shader advances `along = phase·span +
   t·speed` and wraps, so the whole system costs ZERO CPU per frame and one
   draw for every pod in the city. 5.2m altitude clears streetlights (4.4m)
   and traffic signals (5.1m heads) while staying under every rooftop.
   ========================================================================== */

/** Cruise altitude (m). Above street furniture, below the lowest shop roof. */
export const TRAFFIC_ALTITUDE = 5.6
/** Lane offset from the road centreline — matches the data-pulse rails. */
export const TRAFFIC_LANE_OFFSET = 5.2
/** World length of the wrap loop (pods fade into the fog wall long before). */
export const TRAFFIC_SPAN = (CITY_LIMIT + 60) * 2

export const TRAFFIC_SPEED_MIN = 6
export const TRAFFIC_SPEED_MAX = 11.5

export interface TrafficRoute {
  /** 0 = vertical road (x = line, travel along z); 1 = horizontal. */
  axis: 0 | 1
  /** Road centreline coordinate (an entry of ROAD_LINES). */
  line: number
  /** Signed lane offset (right-hand traffic: sign couples to direction). */
  lane: number
  /** Travel direction along the road axis. */
  dir: 1 | -1
  /** Cruise speed, m/s. */
  speed: number
  /** 0..1 start phase along the wrap loop. */
  phase: number
  /** Body palette index (0..5). */
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

/**
 * Deterministic route table for `count` pods, spread across every avenue in
 * both axes and both directions. Right-hand rule: direction is coupled to the
 * lane side, so opposing streams never share a rail.
 */
export function buildTrafficRoutes(count: number, seed = 20260713): TrafficRoute[] {
  const rnd = mulberry32(seed)
  const routes: TrafficRoute[] = []
  const lines = ROAD_LINES
  for (let i = 0; i < count; i++) {
    const axis: 0 | 1 = i % 2 === 0 ? 0 : 1
    const line = lines[Math.floor(rnd() * lines.length) % lines.length]
    const dir: 1 | -1 = rnd() < 0.5 ? 1 : -1
    // Right-hand traffic: on a vertical road heading +z, keep to +x (and the
    // mirrored rule horizontally), so the two rails carry opposite streams.
    const lane = (axis === 0 ? dir : -dir) * TRAFFIC_LANE_OFFSET
    routes.push({
      axis,
      line,
      lane,
      dir,
      speed: TRAFFIC_SPEED_MIN + rnd() * (TRAFFIC_SPEED_MAX - TRAFFIC_SPEED_MIN),
      phase: rnd(),
      tint: Math.floor(rnd() * 6),
    })
  }
  return routes
}

/** Along-axis position of a route at time t (the shader's exact twin). */
export function trafficAlongAt(route: TrafficRoute, t: number): number {
  const raw = route.phase * TRAFFIC_SPAN + t * route.speed * route.dir
  const wrapped = ((raw % TRAFFIC_SPAN) + TRAFFIC_SPAN) % TRAFFIC_SPAN
  return wrapped - TRAFFIC_SPAN / 2
}
