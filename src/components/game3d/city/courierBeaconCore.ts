/* ============================================================================
   CourierBeacon — render-free core: arrow orientation + burst envelope.
   ========================================================================== */

export interface Vec2Like {
  x: number
  z: number
}

/**
 * Yaw (radians, the city's atan2(dx, dz) convention) that points a depot
 * arrow at the destination. Same point → 0 (the arrow just rests north).
 */
export function courierArrowYaw(from: Vec2Like, to: Vec2Like): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (dx === 0 && dz === 0) return 0
  return Math.atan2(dx, dz)
}

/** Delivery-complete burst duration (seconds). */
export const DELIVERY_BURST_SECONDS = 0.9

export interface DeliveryBurstFrame {
  /** Ground ring scale multiplier. */
  ring: number
  /** Shared fade for ring + sparks (1 → 0). */
  opacity: number
  /** Spark rise height in metres. */
  rise: number
}

/** Burst envelope over normalized progress [0, 1] — ring blooms, all fades. */
export function deliveryBurstFrame(progress: number): DeliveryBurstFrame {
  const p = Math.min(1, Math.max(0, progress))
  return {
    ring: 0.4 + p * 3.2,
    opacity: (1 - p) * (1 - p),
    rise: p * 2.6,
  }
}
