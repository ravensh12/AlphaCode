import { describe, expect, it } from 'vitest'
import {
  TOUCH_DEAD_ZONE,
  TOUCH_MOVE_REST,
  joystickActive,
  joystickVector,
} from './touchControls'

const PAD = { left: 100, top: 200, width: 120, height: 120 }
const CENTER_X = PAD.left + PAD.width / 2
const CENTER_Y = PAD.top + PAD.height / 2

describe('joystickVector', () => {
  it('is at rest in the pad center', () => {
    const v = joystickVector(CENTER_X, CENTER_Y, PAD)
    expect(v).toEqual({ strX: 0, strZ: 0, mag: 0 })
    expect(joystickActive(v)).toBe(false)
  })

  it('maps the cardinal directions onto screen axes', () => {
    // Right edge → full +X strafe.
    const right = joystickVector(PAD.left + PAD.width, CENTER_Y, PAD)
    expect(right.strX).toBeCloseTo(1, 9)
    expect(right.strZ).toBeCloseTo(0, 9)
    expect(right.mag).toBeCloseTo(1, 9)
    // Top edge → screen-up = -Z (away from the fixed high camera).
    const up = joystickVector(CENTER_X, PAD.top, PAD)
    expect(up.strX).toBeCloseTo(0, 9)
    expect(up.strZ).toBeCloseTo(-1, 9)
    // Bottom-left quadrant → negative X, positive Z.
    const downLeft = joystickVector(PAD.left + 10, PAD.top + PAD.height - 10, PAD)
    expect(downLeft.strX).toBeLessThan(0)
    expect(downLeft.strZ).toBeGreaterThan(0)
  })

  it('scales linearly inside the rim', () => {
    const half = joystickVector(CENTER_X + PAD.width / 4, CENTER_Y, PAD)
    expect(half.strX).toBeCloseTo(0.5, 9)
    expect(half.mag).toBeCloseTo(0.5, 9)
  })

  it('clamps drags past the rim to the unit circle, keeping direction', () => {
    const far = joystickVector(CENTER_X + 500, CENTER_Y + 500, PAD)
    expect(Math.hypot(far.strX, far.strZ)).toBeCloseTo(1, 9)
    expect(far.mag).toBe(1)
    // Direction preserved: 45° down-right.
    expect(far.strX).toBeCloseTo(Math.SQRT1_2, 6)
    expect(far.strZ).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('treats sub-dead-zone jitter as inactive but real deflection as active', () => {
    const jitter = joystickVector(
      CENTER_X + (PAD.width / 2) * (TOUCH_DEAD_ZONE / 2),
      CENTER_Y,
      PAD,
    )
    expect(joystickActive(jitter)).toBe(false)
    const push = joystickVector(CENTER_X + PAD.width / 4, CENTER_Y, PAD)
    expect(joystickActive(push)).toBe(true)
    expect(joystickActive(TOUCH_MOVE_REST)).toBe(false)
  })

  it('yields rest for a degenerate (zero-size) rect instead of NaN', () => {
    const v = joystickVector(50, 50, { left: 50, top: 50, width: 0, height: 0 })
    expect(v).toEqual(TOUCH_MOVE_REST)
    expect(Number.isNaN(v.strX)).toBe(false)
  })
})
