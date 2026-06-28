/**
 * Warm the boss-battle route chunk ahead of time.
 *
 * Pressing E at a boss totem navigates to `/battle/:lessonId`, which lazy-loads
 * `BossBattlePage` and its whole 3D arena module graph (BossArena, Boss3D,
 * Avatar, the postprocessing AA pass, …). If that chunk hasn't been fetched yet
 * the click stalls on a network round-trip + JS parse before even the intro
 * card can show — the "lag/delay entering a boss fight".
 *
 * Calling this while the player is already in the overworld (three.js + fiber +
 * postprocessing vendor chunks are loaded) downloads & parses only the small
 * arena chunk during idle time, so by the time E is pressed the page is already
 * in the module cache and the dynamic `import()` resolves synchronously.
 *
 * Uses the SAME specifier the `lazy()` in App.tsx uses, so the module is
 * deduped — no double download.
 */
let warmed = false

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
}

export function prefetchBossBattle(): void {
  if (warmed || typeof window === 'undefined') return
  warmed = true

  const run = () => {
    // Pull in the page + its static arena imports. Errors are swallowed: this is
    // a best-effort warm-up, the real navigation will surface any load failure.
    void import('../pages/BossBattlePage').catch(() => {
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
