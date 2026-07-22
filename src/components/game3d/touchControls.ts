/* ============================================================================
   Touch-control math for the standalone arenas (Endless Siege).

   Pure and DOM-free so the joystick vector can be unit-tested in node: the
   on-screen stick component feeds pointer coordinates + its pad rect in and
   writes the resulting vector into a ref the arena's useFrame reads. Screen
   axes map straight onto the arenas' screen-relative movement (drag right =
   +X strafe, drag up = -Z advance under the fixed high camera).
   ========================================================================== */

export interface TouchMoveVector {
  /** Screen-right deflection, -1..1 (feeds the arena's +X strafe). */
  strX: number
  /** Screen-down deflection, -1..1 (screen-up = -Z = away from camera). */
  strZ: number
  /** Stick deflection magnitude 0..1 (0 = released / dead zone handling). */
  mag: number
}

export const TOUCH_MOVE_REST: TouchMoveVector = { strX: 0, strZ: 0, mag: 0 }

/** Deflections below this are treated as rest (thumb jitter around center). */
export const TOUCH_DEAD_ZONE = 0.12

/**
 * Convert a pointer position over a circular pad into the movement vector:
 * offsets are normalized by the pad radius and clamped to the unit circle
 * (dragging past the rim keeps direction, pins magnitude at 1). A degenerate
 * rect (zero size) yields rest instead of NaN.
 */
export function joystickVector(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): TouchMoveVector {
  const rx = rect.width / 2
  const ry = rect.height / 2
  if (rx <= 0 || ry <= 0) return { ...TOUCH_MOVE_REST }
  let dx = (clientX - (rect.left + rx)) / rx
  let dy = (clientY - (rect.top + ry)) / ry
  const mag = Math.hypot(dx, dy)
  if (mag > 1) {
    dx /= mag
    dy /= mag
  }
  return { strX: dx, strZ: dy, mag: Math.min(1, mag) }
}

/** True when the stick is deflected past the dead zone. */
export function joystickActive(vector: TouchMoveVector): boolean {
  return vector.mag > TOUCH_DEAD_ZONE
}

/** Only offer on-screen controls where the primary pointer is a finger. */
export function isCoarsePointer(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)')?.matches ?? false)
    )
  } catch {
    return false
  }
}
