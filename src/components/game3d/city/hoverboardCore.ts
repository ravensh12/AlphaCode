/* ============================================================================
   Hoverboard — render-free core.

   The speed profile the integration agent wires into its controller: cruise
   at 15 m/s, boost to 24 m/s, with exponential approach curves (brisk to
   accelerate, brisker to shed speed). The visual component reads the same
   constants for its trail/dust thresholds, so the board LOOKS fast exactly
   when the controller SAYS it is fast.
   ========================================================================== */

/** Cruise ground speed while riding (m/s). */
export const HOVERBOARD_BASE_SPEED = 15
/** Boosted ground speed (m/s). */
export const HOVERBOARD_BOOST_SPEED = 24
/** Exponential approach rate while gaining speed (1/s). */
export const HOVERBOARD_ACCEL_RATE = 2.4
/** Exponential approach rate while shedding speed (1/s) — braking bites harder. */
export const HOVERBOARD_BRAKE_RATE = 4.6
/** The trail ribbon (and heavy dust) appears above this speed (m/s). */
export const HOVERBOARD_TRAIL_MIN_SPEED = 16
/** Snap-to-target band so the curve settles instead of asymptoting forever. */
export const HOVERBOARD_SPEED_EPSILON = 0.01

export interface HoverboardMoveInput {
  /** Any movement key held. */
  moving: boolean
  /** Boost modifier held (only meaningful while moving). */
  boosting: boolean
}

/** Target ground speed for the current input: 0, cruise, or boost. */
export function hoverboardTargetSpeed(input: HoverboardMoveInput): number {
  if (!input.moving) return 0
  return input.boosting ? HOVERBOARD_BOOST_SPEED : HOVERBOARD_BASE_SPEED
}

/**
 * One integration step of the speed curve: exponential approach toward
 * `target`, using the accel rate when speeding up and the brake rate when
 * slowing down. Frame-rate independent (two half steps compose to exactly one
 * full step) and free of overshoot; within EPSILON it snaps to the target.
 */
export function stepHoverboardSpeed(
  current: number,
  target: number,
  dt: number,
): number {
  const rate = target > current ? HOVERBOARD_ACCEL_RATE : HOVERBOARD_BRAKE_RATE
  const next = target + (current - target) * Math.exp(-rate * Math.max(0, dt))
  return Math.abs(next - target) <= HOVERBOARD_SPEED_EPSILON ? target : next
}

/**
 * The pose the integration controller writes each frame while the board is
 * mounted; the visual component only ever READS it inside useFrame.
 */
export interface HoverboardPose {
  x: number
  y: number
  z: number
  /** Heading (radians, atan2(dx, dz) convention like the rest of the city). */
  yaw: number
  /** Current ground speed (m/s) — drives tilt, dust, and the trail. */
  speed: number
}
