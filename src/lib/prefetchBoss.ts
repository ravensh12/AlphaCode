/**
 * Warm the boss-fight route chunk ahead of time so pressing E at a Boss Totem
 * doesn't pay the dynamic-import download + parse cost at the exact moment of
 * navigation — a key source of the "lag/stutter before the fight" the player
 * feels when entering a boss.
 *
 * Vite keys chunks by resolved module id, so this `import()` warms the same
 * chunk that `App.tsx`'s lazy `BossBattlePage` route will use. Safe to call
 * repeatedly: the in-flight promise is cached, and the browser/Vite dedupe the
 * fetch. A failed prefetch (e.g. offline) clears the cache so a later call can
 * retry.
 *
 * Suggested call site (in the overworld, which this file does not import to
 * avoid a cycle): trigger it as soon as the player is near a boss objective —
 * e.g. inside `handleNearby` in `Overworld3DPage.tsx`:
 *
 *   import { prefetchBossPage } from '../lib/prefetchBoss'
 *   const handleNearby = useCallback((t: Target | null) => {
 *     if (t?.kind === 'boss') prefetchBossPage()   // <-- add this line
 *     nearbyRef.current = t
 *     setNearby(t)
 *   }, [])
 */
let warmed: Promise<unknown> | null = null

export function prefetchBossPage(): void {
  if (warmed) return
  warmed = import('../pages/BossBattlePage').catch(() => {
    // Allow a later retry if the prefetch failed.
    warmed = null
  })
}
