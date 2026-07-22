import { describe, expect, it } from 'vitest'
import {
  CITIZEN_SPEED_MAX,
  CITIZEN_SPEED_MIN,
  CITIZEN_WALK_REF,
  SIDEWALK_OFFSET,
  buildCitizenRoutes,
  citizenClipFor,
  citizenPoseAt,
  routeLength,
  type CitizenPose,
} from './citizenRoutes'
import {
  CHECKPOINTS_3D,
  CITY_LIMIT,
  ROAD_HALF_W,
  ROAD_LINES,
  START_3D,
  WORLD_GATES,
} from './layout'

describe('citizen sidewalk routes', () => {
  const routes = buildCitizenRoutes(56)

  it('is deterministic and fills the requested crowd', () => {
    expect(routes).toHaveLength(56)
    expect(buildCitizenRoutes(56)).toEqual(routes)
  })

  it('segments live on real sidewalks inside the city', () => {
    for (const r of routes) {
      expect(ROAD_LINES).toContain(r.line)
      expect(routeLength(r)).toBeGreaterThanOrEqual(22)
      expect(r.speed).toBeGreaterThanOrEqual(CITIZEN_SPEED_MIN)
      expect(r.speed).toBeLessThanOrEqual(CITIZEN_SPEED_MAX)
      // Walk line sits on the sidewalk band, outside the asphalt.
      expect(SIDEWALK_OFFSET).toBeGreaterThan(ROAD_HALF_W)
      const pose: CitizenPose = { x: 0, z: 0, heading: 0 }
      for (const t of [0, 3.7, 60, 500]) {
        citizenPoseAt(r, t, pose)
        expect(Math.hypot(pose.x, pose.z)).toBeLessThanOrEqual(CITY_LIMIT)
        const cross = r.axis === 0 ? pose.x : pose.z
        expect(Math.abs(cross - r.line)).toBeCloseTo(SIDEWALK_OFFSET)
        const along = r.axis === 0 ? pose.z : pose.x
        expect(along).toBeGreaterThanOrEqual(r.start - 0.001)
        expect(along).toBeLessThanOrEqual(r.end + 0.001)
      }
    }
  })

  it('ping-pongs: facing flips at the turnaround and position stays continuous', () => {
    const r = routes[0]
    const len = routeLength(r)
    // Time at which this walker reaches the segment end (phase offset included).
    const tTurn = (len - r.phase * len * 2 + (r.phase * len * 2 > len ? len * 2 : 0)) / r.speed
    const before: CitizenPose = { x: 0, z: 0, heading: 0 }
    const after: CitizenPose = { x: 0, z: 0, heading: 0 }
    citizenPoseAt(r, tTurn - 0.2, before)
    citizenPoseAt(r, tTurn + 0.2, after)
    // Continuous through the turn (< speed * dt window) and heading flipped.
    const dist = Math.hypot(after.x - before.x, after.z - before.z)
    expect(dist).toBeLessThan(r.speed * 0.5 + 0.001)
    expect(before.heading).not.toBe(after.heading)
  })

  it('keeps quest plazas clear', () => {
    const sites = [
      ...CHECKPOINTS_3D.flatMap((c) => [c.flag, c.boss]),
      ...WORLD_GATES.flat(),
      START_3D,
    ]
    for (const r of routes) {
      const midAlong = (r.start + r.end) / 2
      const cross = r.line + r.side * SIDEWALK_OFFSET
      const x = r.axis === 0 ? cross : midAlong
      const z = r.axis === 0 ? midAlong : cross
      for (const s of sites) {
        expect(Math.hypot(x - s.x, z - s.z)).toBeGreaterThan(16)
      }
    }
  })

  it('clip mapping plants feet: rate scales with speed around the Walk reference', () => {
    expect(citizenClipFor(0)).toEqual({ clip: 'Idle', rate: 1 })
    expect(citizenClipFor(CITIZEN_WALK_REF)).toEqual({ clip: 'Walk', rate: 1 })
    expect(citizenClipFor(CITIZEN_WALK_REF * 1.5).rate).toBeCloseTo(1.5)
    expect(citizenClipFor(10).rate).toBeLessThanOrEqual(2.2) // clamped
    expect(citizenClipFor(0.3).rate).toBeGreaterThanOrEqual(0.6)
  })
})
