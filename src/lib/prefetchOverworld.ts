/**
 * Warm the 3D overworld route chunk ahead of time.
 *
 * Returning from a 2D page (quest list, academy mission, lesson) to `/quest`
 * lazy-loads `Overworld3DPage` and its whole module graph (city, combat,
 * horde, postprocessing…). In dev that also means a Vite re-transform of the
 * chunk. Fetching + parsing it while the user is still reading the 2D page
 * removes that cost from the route switch itself.
 *
 * Uses the SAME specifier the `lazy()` in App.tsx uses, so the module is
 * deduped — no double download.
 */
let warmed = false

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
}

export function prefetchOverworld(): void {
  if (warmed || typeof window === 'undefined') return
  warmed = true

  const run = () => {
    // Best-effort warm-up; the real navigation surfaces any load failure.
    void import('../pages/Overworld3DPage').catch(() => {
      // Allow a later retry if the speculative fetch failed (offline, etc.).
      warmed = false
    })
  }

  const w = window as IdleWindow
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(run, { timeout: 2000 })
  } else {
    window.setTimeout(run, 300)
  }
}
