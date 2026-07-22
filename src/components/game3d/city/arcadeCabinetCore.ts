/* ============================================================================
   ArcadeCabinet — render-free core.

   The cabinet's screen is a canvas texture that must be redrawn ONLY when the
   visible content actually changes (never per frame, never per render). The
   guard is a content-derived key: the component redraws when the key differs
   from the one it last painted. Everything here is pure and Node-testable.
   ========================================================================== */

export interface ArcadeScreenContent {
  title: string
  /** The big center line (the due count, or a standby word). */
  big: string
  sub: string
}

/** Counts above this render as "99+" — beyond it the screen stops changing. */
export const ARCADE_SCREEN_MAX_COUNT = 99

/** What the screen shows for a given review-due count / empty-history flag. */
export function arcadeScreenContent(
  dueCount: number,
  empty: boolean,
): ArcadeScreenContent {
  if (empty) {
    return { title: 'PATTERN ARCADE', big: 'READY', sub: 'NO PATTERNS YET' }
  }
  const due = Math.max(0, Math.floor(dueCount))
  if (due === 0) {
    return { title: 'PATTERN ARCADE', big: 'CLEAR', sub: 'ALL PATTERNS FRESH' }
  }
  const big =
    due > ARCADE_SCREEN_MAX_COUNT ? `${ARCADE_SCREEN_MAX_COUNT}+` : String(due)
  return { title: 'PATTERN ARCADE', big, sub: due === 1 ? 'PATTERN DUE' : 'PATTERNS DUE' }
}

/**
 * Canvas-regeneration guard key. Derived from the DISPLAYED content, so
 * inputs that render identically (120 due vs 130 due → both "99+") share a
 * key and never trigger a repaint.
 */
export function arcadeScreenKey(dueCount: number, empty: boolean): string {
  const { title, big, sub } = arcadeScreenContent(dueCount, empty)
  return `${title}|${big}|${sub}`
}

/**
 * Marquee emissive envelope — a slow neon breath in [0.55, 1]. Shader-free:
 * the component writes this into emissiveIntensity via a material ref.
 */
export function marqueePulse(tSeconds: number): number {
  return 0.775 + Math.sin(tSeconds * 2.1) * 0.225
}
