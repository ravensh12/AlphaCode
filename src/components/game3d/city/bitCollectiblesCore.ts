import type { BitSpawn } from '../../../lib/cityLife'

/* ============================================================================
   BitCollectibles — render-free core.

   The auto-collect contract for the integration agent: feed the weekly spawn
   list, the already-collected id set, and the hero's ground position; get
   back the ids newly swept up this check. Pure, allocation-light, and
   Node-tested — the renderer and the controller share these exact rules.
   ========================================================================== */

/** Horizontal auto-collect radius around the hero (metres). */
export const BIT_COLLECT_RADIUS = 1.5

/**
 * Ids of bits the hero collects standing at (x, z): within `radius`
 * horizontally and not already in `collected`. Order follows the spawn list,
 * so results are deterministic for identical inputs. The caller owns the set —
 * this function never mutates it.
 */
export function collectBitsNear(
  spawns: readonly Pick<BitSpawn, 'id' | 'x' | 'z'>[],
  collected: ReadonlySet<string>,
  x: number,
  z: number,
  radius: number = BIT_COLLECT_RADIUS,
): string[] {
  const swept: string[] = []
  const r2 = radius * radius
  for (const spawn of spawns) {
    if (collected.has(spawn.id)) continue
    const dx = spawn.x - x
    const dz = spawn.z - z
    if (dx * dx + dz * dz <= r2) swept.push(spawn.id)
  }
  return swept
}

/**
 * Canonical anchor Date for an ISO week key ('2026-W28' → that week's
 * Thursday 12:00 UTC). Thursday defines the ISO week, and noon UTC keeps the
 * local calendar date inside the same week for every real-world timezone —
 * so isoWeekKey(dateFromIsoWeekKey(key)) === key always round-trips.
 */
export function dateFromIsoWeekKey(weekKey: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey)
  if (!match) return new Date(NaN)
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4 = Date.UTC(year, 0, 4)
  const jan4Weekday = new Date(jan4).getUTCDay() || 7 // 1 = Mon … 7 = Sun
  const week1Monday = jan4 - (jan4Weekday - 1) * 86_400_000
  return new Date(week1Monday + ((week - 1) * 7 + 3) * 86_400_000 + 12 * 3_600_000)
}

/** Alternating bit tints — "1" bits glow gold, "0" bits glow cyan. */
export const BIT_TINT_ONE = '#ffd23f'
export const BIT_TINT_ZERO = '#7fd8ff'

/** Deterministic tint per spawn index (parity = the bit's "value"). */
export function bitTint(index: number): string {
  return index % 2 === 0 ? BIT_TINT_ONE : BIT_TINT_ZERO
}
