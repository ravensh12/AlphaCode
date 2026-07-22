import { describe, expect, it } from 'vitest'
import {
  TRAFFIC_ALTITUDE,
  TRAFFIC_LANE_OFFSET,
  TRAFFIC_SPAN,
  TRAFFIC_SPEED_MAX,
  TRAFFIC_SPEED_MIN,
  buildTrafficRoutes,
  trafficAlongAt,
} from './trafficLanes'
import { CITY_LIMIT, ROAD_LINES } from './layout'

describe('hover traffic lanes', () => {
  const routes = buildTrafficRoutes(72)

  it('is deterministic and returns the requested fleet size', () => {
    expect(routes).toHaveLength(72)
    expect(buildTrafficRoutes(72)).toEqual(routes)
  })

  it('every pod flies a real avenue on the data-pulse rails', () => {
    for (const r of routes) {
      expect(ROAD_LINES).toContain(r.line)
      expect(Math.abs(r.lane)).toBeCloseTo(TRAFFIC_LANE_OFFSET)
      expect(r.speed).toBeGreaterThanOrEqual(TRAFFIC_SPEED_MIN)
      expect(r.speed).toBeLessThanOrEqual(TRAFFIC_SPEED_MAX)
      expect(r.phase).toBeGreaterThanOrEqual(0)
      expect(r.phase).toBeLessThan(1)
    }
  })

  it('obeys the right-hand rule so opposing streams never share a rail', () => {
    for (const r of routes) {
      if (r.axis === 0) expect(Math.sign(r.lane)).toBe(r.dir)
      else expect(Math.sign(r.lane)).toBe(-r.dir)
    }
  })

  it('spreads across both axes and both directions', () => {
    expect(routes.some((r) => r.axis === 0)).toBe(true)
    expect(routes.some((r) => r.axis === 1)).toBe(true)
    expect(routes.some((r) => r.dir === 1)).toBe(true)
    expect(routes.some((r) => r.dir === -1)).toBe(true)
  })

  it('the wrap loop covers the whole city and never escapes it', () => {
    expect(TRAFFIC_SPAN).toBeGreaterThan(CITY_LIMIT * 2)
    const r = routes[0]
    for (const t of [0, 10, 100, 1000, 12345.6]) {
      const along = trafficAlongAt(r, t)
      expect(along).toBeGreaterThanOrEqual(-TRAFFIC_SPAN / 2)
      expect(along).toBeLessThanOrEqual(TRAFFIC_SPAN / 2)
    }
  })

  it('pods actually advance along their direction of travel', () => {
    const r = routes.find((x) => x.dir === 1)!
    const a = trafficAlongAt(r, 0)
    const b = trafficAlongAt(r, 1)
    const delta = b - a
    const wrapped = delta < -TRAFFIC_SPAN / 2 ? delta + TRAFFIC_SPAN : delta
    expect(wrapped).toBeCloseTo(r.speed, 4)
  })

  it('altitude clears streetlights (4.4m) and signal heads (5.1m)', () => {
    expect(TRAFFIC_ALTITUDE).toBeGreaterThan(5.2)
    expect(TRAFFIC_ALTITUDE).toBeLessThan(9) // under the lowest shop roofline
  })
})
