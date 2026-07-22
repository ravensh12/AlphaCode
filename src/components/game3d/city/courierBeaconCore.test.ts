import { describe, expect, it } from 'vitest'
import {
  courierArrowYaw,
  deliveryBurstFrame,
} from './courierBeaconCore'

describe('courierArrowYaw', () => {
  const depot = { x: 10, z: -4 }

  it('points along the city yaw convention (atan2(dx, dz))', () => {
    expect(courierArrowYaw(depot, { x: 10, z: 6 })).toBeCloseTo(0) // +z
    expect(courierArrowYaw(depot, { x: 20, z: -4 })).toBeCloseTo(Math.PI / 2) // +x
    expect(courierArrowYaw(depot, { x: 0, z: -4 })).toBeCloseTo(-Math.PI / 2) // −x
    expect(Math.abs(courierArrowYaw(depot, { x: 10, z: -20 }))).toBeCloseTo(
      Math.PI,
    ) // −z
  })

  it('rests at 0 when depot and target coincide', () => {
    expect(courierArrowYaw(depot, depot)).toBe(0)
  })
})

describe('deliveryBurstFrame', () => {
  it('blooms the ring while everything fades to nothing', () => {
    const start = deliveryBurstFrame(0)
    const mid = deliveryBurstFrame(0.5)
    const end = deliveryBurstFrame(1)
    expect(start.opacity).toBe(1)
    expect(start.ring).toBeCloseTo(0.4)
    expect(mid.ring).toBeGreaterThan(start.ring)
    expect(mid.opacity).toBeLessThan(start.opacity)
    expect(end.opacity).toBe(0)
    expect(end.ring).toBeCloseTo(3.6)
    expect(end.rise).toBeGreaterThan(mid.rise)
  })

  it('clamps progress outside [0, 1]', () => {
    expect(deliveryBurstFrame(-1)).toEqual(deliveryBurstFrame(0))
    expect(deliveryBurstFrame(2)).toEqual(deliveryBurstFrame(1))
  })
})
