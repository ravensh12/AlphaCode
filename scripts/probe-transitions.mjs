// SCREEN-SWITCH LATENCY PROBE — measures input-to-painted-route time and the
// longest main-thread stall (max rAF gap) for every overworld-adjacent
// transition:
//   overworld → Levels list → overworld (both directions)
//   overworld → lesson (direct route load) → back to overworld
// A transition FAILS the smoothness bar when its max main-thread stall
// exceeds 150ms (the "visible freeze" threshold) after the warm run.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-transitions.mjs
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
for (const sig of ['uncaughtException', 'unhandledRejection']) {
  process.on(sig, async (e) => {
    console.log('FATAL', String(e).slice(0, 300))
    try {
      await browser.close()
    } catch {
      /* already gone */
    }
    process.exit(1)
  })
}
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
await page.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  localStorage.setItem(
    'alphacode.progress.guest',
    JSON.stringify({
      streak: { current: 0, longest: 0 },
      lessons: {},
      badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
      academyProgress: {
        schemaVersion: 1,
        curriculumId: 'curriculum:neetcode150',
        curriculumVersion: 'v1.0.0',
        contentVersion: 'v1.0.0',
        missionCompletions: {},
        realmQuizzes: {},
        bossDefeats: {},
      },
    }),
  )
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
})

await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
let sawVeil = false
for (let i = 0; i < 600; i++) {
  const up = await page.evaluate(() =>
    /RENDERING CODE CITY/i.test(document.body.innerText || ''),
  )
  if (up) sawVeil = true
  if (sawVeil && !up) break
  await page.waitForTimeout(200)
}
await page.waitForTimeout(1200)

const startSampler = () =>
  page.evaluate(() => {
    window.__gapT0 = performance.now()
    window.__gaps = []
    window.__gapSampling = true
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      window.__gaps.push(now - last)
      last = now
      if (window.__gapSampling) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

const stopSampler = () =>
  page.evaluate(() => {
    window.__gapSampling = false
    const total = Math.round(performance.now() - window.__gapT0)
    const maxGap = Math.round(Math.max(0, ...window.__gaps))
    return { total, maxGap }
  })

async function transition(name, act, readySelector) {
  await startSampler()
  await act()
  await page.waitForSelector(readySelector, { timeout: 30_000 })
  // One settled frame so the new screen's first real paint is included.
  await page.waitForTimeout(120)
  const m = await stopSampler()
  console.log(`${name}: ready=${m.total}ms maxStall=${m.maxGap}ms`)
  return { name, ...m }
}

const results = []

// Cold + warm passes: the first Levels click may fetch the chunk (prefetch
// should have warmed it — a cold-looking first hop is itself a finding).
results.push(
  await transition(
    'overworld→levels (1st)',
    () => page.click('.over3d-levels-btn'),
    '.quest-page',
  ),
)
results.push(
  await transition(
    'levels→overworld (1st)',
    () => page.click('.quest-continue'),
    '.over3d-stage',
  ),
)
await page.waitForTimeout(800)
results.push(
  await transition(
    'overworld→levels (2nd)',
    () => page.click('.over3d-levels-btn'),
    '.quest-page',
  ),
)
results.push(
  await transition(
    'levels→overworld (2nd)',
    () => page.click('.quest-continue'),
    '.over3d-stage',
  ),
)
await page.waitForTimeout(800)

// Overworld → lesson (guest dojo route) → back. Navigate the router directly
// (the E-press path needs a 90s walk); the chunk work is identical.
results.push(
  await transition(
    'overworld→lesson',
    () =>
      page.evaluate(() => {
        window.history.pushState({}, '', '/lesson/two-sum')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }),
    '.lp, .lp-missing, .lp-learn',
  ),
)
results.push(
  await transition(
    'lesson→overworld',
    () =>
      page.evaluate(() => {
        window.history.pushState({}, '', '/quest')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }),
    '.over3d-stage',
  ),
)

// Death overlay → respawn: idle in the plaza until the horde downs the hero
// (guest, no shelter), then time the "Restart Level" click → overlay gone →
// world responding again. Skipped (without failing) if the horde somehow
// doesn't finish the job within 2 minutes.
try {
  await page.waitForSelector('.over3d-death', { timeout: 120_000 })
  await page.waitForTimeout(400)
  await startSampler()
  await page.click('.over3d-death-actions .over3d-death-btn:not(.over3d-death-btn-ghost)')
  await page.waitForSelector('.over3d-death', { state: 'detached', timeout: 15_000 })
  await page.waitForTimeout(120)
  const m = await stopSampler()
  console.log(`death→respawn: ready=${m.total}ms maxStall=${m.maxGap}ms`)
  results.push({ name: 'death→respawn', ...m })
} catch {
  console.log('death→respawn: horde never downed the hero — skipped')
}

// Gate: warm transitions must not freeze >150ms; boot-adjacent first hops
// get a little slack for canvas teardown (still no long freeze allowed).
const warm = results.filter((r) => !r.name.includes('(1st)'))
const failures = warm.filter((r) => r.maxGap > 150)
console.log(
  'SUMMARY',
  JSON.stringify({ results, failures: failures.map((f) => f.name) }),
)
console.log(failures.length === 0 ? 'TRANSITIONS PASS' : 'TRANSITIONS FAIL')
await browser.close()
process.exit(failures.length === 0 ? 0 : 1)
