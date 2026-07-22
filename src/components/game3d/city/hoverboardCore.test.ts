import { describe, expect, it } from 'vitest'
import {
  HOVERBOARD_BASE_SPEED,
  HOVERBOARD_BOOST_SPEED,
  HOVERBOARD_SPEED_EPSILON,
  HOVERBOARD_TRAIL_MIN_SPEED,
  hoverboardTargetSpeed,
  stepHoverboardSpeed,
} from './hoverboardCore'

/** Integrate the curve at a fixed dt until it settles (or maxSteps). */
function settle(
  from: number,
  target: number,
  dt: number,
  maxSteps = 10_000,
): { speed: number; steps: number } {
  let speed = from
  let steps = 0
  while (speed !== target && steps < maxSteps) {
    speed = stepHoverboardSpeed(speed, target, dt)
    steps++
  }
  return { speed, steps }
}

describe('hoverboardTargetSpeed', () => {
  it('is 0 idle, 15 cruising, 24 boosting', () => {
    expect(hoverboardTargetSpeed({ moving: false, boosting: false })).toBe(0)
    expect(hoverboardTargetSpeed({ moving: false, boosting: true })).toBe(0)
    expect(hoverboardTargetSpeed({ moving: true, boosting: false })).toBe(
      HOVERBOARD_BASE_SPEED,
    )
    expect(hoverboardTargetSpeed({ moving: true, boosting: true })).toBe(
      HOVERBOARD_BOOST_SPEED,
    )
    expect(HOVERBOARD_BASE_SPEED).toBe(15)
    expect(HOVERBOARD_BOOST_SPEED).toBe(24)
  })

  it('the trail threshold sits between cruise and boost', () => {
    expect(HOVERBOARD_TRAIL_MIN_SPEED).toBeGreaterThan(HOVERBOARD_BASE_SPEED)
    expect(HOVERBOARD_TRAIL_MIN_SPEED).toBeLessThan(HOVERBOARD_BOOST_SPEED)
  })
})

describe('stepHoverboardSpeed (accel/decel curves)', () => {
  it('rises monotonically to cruise without overshooting', () => {
    let speed = 0
    for (let i = 0; i < 600; i++) {
      const next = stepHoverboardSpeed(speed, HOVERBOARD_BASE_SPEED, 1 / 60)
      expect(next).toBeGreaterThanOrEqual(speed)
      expect(next).toBeLessThanOrEqual(HOVERBOARD_BASE_SPEED)
      speed = next
    }
    expect(speed).toBe(HOVERBOARD_BASE_SPEED)
  })

  it('falls monotonically from boost without undershooting', () => {
    let speed = HOVERBOARD_BOOST_SPEED
    for (let i = 0; i < 600; i++) {
      const next = stepHoverboardSpeed(speed, HOVERBOARD_BASE_SPEED, 1 / 60)
      expect(next).toBeLessThanOrEqual(speed)
      expect(next).toBeGreaterThanOrEqual(HOVERBOARD_BASE_SPEED)
      speed = next
    }
    expect(speed).toBe(HOVERBOARD_BASE_SPEED)
  })

  it('brakes harder than it accelerates (over the same 9 m/s gap)', () => {
    const accel = settle(HOVERBOARD_BASE_SPEED, HOVERBOARD_BOOST_SPEED, 1 / 60)
    const brake = settle(HOVERBOARD_BOOST_SPEED, HOVERBOARD_BASE_SPEED, 1 / 60)
    expect(accel.speed).toBe(HOVERBOARD_BOOST_SPEED)
    expect(brake.speed).toBe(HOVERBOARD_BASE_SPEED)
    expect(brake.steps).toBeLessThan(accel.steps)
  })

  it('a full stop settles from boost within a couple of seconds', () => {
    const { speed, steps } = settle(HOVERBOARD_BOOST_SPEED, 0, 1 / 60)
    expect(speed).toBe(0)
    expect(steps / 60).toBeLessThan(2.5)
  })

  it('is frame-rate independent: two half steps equal one full step', () => {
    // Stay far from the target so the epsilon snap cannot mask drift.
    const oneStep = stepHoverboardSpeed(2, HOVERBOARD_BASE_SPEED, 0.1)
    const twoSteps = stepHoverboardSpeed(
      stepHoverboardSpeed(2, HOVERBOARD_BASE_SPEED, 0.05),
      HOVERBOARD_BASE_SPEED,
      0.05,
    )
    expect(twoSteps).toBeCloseTo(oneStep, 10)
  })

  it('dt of zero changes nothing (outside the snap band)', () => {
    expect(stepHoverboardSpeed(5, HOVERBOARD_BASE_SPEED, 0)).toBe(5)
  })

  it('snaps to target inside the epsilon band', () => {
    expect(
      stepHoverboardSpeed(
        HOVERBOARD_BASE_SPEED - HOVERBOARD_SPEED_EPSILON / 2,
        HOVERBOARD_BASE_SPEED,
        1 / 60,
      ),
    ).toBe(HOVERBOARD_BASE_SPEED)
  })
})
