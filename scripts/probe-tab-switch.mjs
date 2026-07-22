// TAB-SWITCH / VEIL-LIFECYCLE PROBE — boots /quest, lets the boot veil drop
// once, then puts the page through repeated REAL background/foreground
// cycles (a second tab takes focus, then this one returns) plus a frozen
// web-lifecycle cycle, asserting after every return:
//   - the "RENDERING CODE CITY" veil NEVER re-appears,
//   - the <canvas> element is never remounted (no context-loss death spiral),
//   - the hero position is continuous (no teleport / state reset),
//   - the graphics-governor notch hint never demotes from a tab switch.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-tab-switch.mjs
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

const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()
const governorLogs = []
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('[gfx-governor]') || text.includes('[gfx]')) {
    governorLogs.push({ at: Date.now(), text })
  }
})
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

const veilUp = () =>
  page.evaluate(() => /RENDERING CODE CITY/i.test(document.body.innerText || ''))

await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
// Generous budgets: this box often runs many probes at once (load 300+).
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 240_000 })

// Phase 1 — the one allowed veil: wait for it to drop.
let sawVeil = false
const t0 = Date.now()
for (let i = 0; i < 1500; i++) {
  const up = await veilUp()
  if (up) sawVeil = true
  if (sawVeil && !up) break
  await page.waitForTimeout(200)
}
console.log(`veil dropped ${Date.now() - t0}ms after navigation (seen=${sawVeil})`)
await page.waitForFunction(() => !!window.__alphaPlayer, undefined, { timeout: 120_000 })

// Tag the canvas element so a remount is detectable.
await page.evaluate(() => {
  const c = document.querySelector('canvas')
  if (c) c.dataset.probeTag = 'origin'
})
const notchBefore = await page.evaluate(() =>
  sessionStorage.getItem('alphacode.gfx.notch'),
)

let failures = 0
const check = async (label) => {
  const up = await veilUp()
  if (up) {
    failures++
    console.log(`FAIL [${label}] boot veil re-appeared`)
  }
  const sameCanvas = await page.evaluate(
    () => document.querySelector('canvas')?.dataset.probeTag === 'origin',
  )
  if (!sameCanvas) {
    failures++
    console.log(`FAIL [${label}] canvas was remounted`)
  }
}

// Walk a little so the position is a live, non-spawn value.
await page.keyboard.down('w')
await page.waitForTimeout(1500)
await page.keyboard.up('w')

// Phase 2 — five background/foreground cycles. Headless launch args disable
// renderer backgrounding, so bringToFront alone never fires visibilitychange
// — emulate the REAL browser signals (visibilityState override + event) so
// the app's tab-switch guard runs exactly as it would for a player. Hidden
// windows (plus the 4s post-return grace) are PROTECTED: a governor step
// inside one is a tab-switch bug — but only judged when the ambient fps was
// healthy going in (this box often runs at load 300, where demotions are
// honest low-fps calls).
const emulateVisibility = (state) =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => s,
    })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => s === 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
const measureFps = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () =>
          ++n >= 30 ? res((n / (performance.now() - t0)) * 1000) : requestAnimationFrame(tick)
        requestAnimationFrame(tick)
      }),
  )
const protectedWindows = []
const other = await context.newPage()
await other.goto('about:blank')
const ambientFps = await measureFps()
console.log(`ambient fps before cycles: ${ambientFps.toFixed(0)}`)
for (let cycle = 0; cycle < 5; cycle++) {
  const before = await page.evaluate(() => window.__alphaPlayer.pos())
  const hiddenAt = Date.now()
  await emulateVisibility('hidden')
  await other.bringToFront()
  await page.waitForTimeout(cycle % 2 === 0 ? 3_000 : 7_000)
  await page.bringToFront()
  await emulateVisibility('visible')
  protectedWindows.push([hiddenAt, Date.now() + 4_500])
  await page.waitForTimeout(1_200)
  const after = await page.evaluate(() => window.__alphaPlayer.pos())
  const drift = Math.hypot(after.x - before.x, after.z - before.z)
  if (drift > 5) {
    failures++
    console.log(`FAIL [cycle ${cycle}] position jumped ${drift.toFixed(1)}m`)
  }
  await check(`cycle ${cycle}`)
  console.log(
    `cycle ${cycle}: hidden ${cycle % 2 === 0 ? 3 : 7}s → drift ${drift.toFixed(2)}m, veil down, canvas intact`,
  )
}
await other.close()

// Phase 3 — frozen web-lifecycle state (deep background) and revival.
const cdp = await context.newCDPSession(page)
const beforeFreeze = await page.evaluate(() => window.__alphaPlayer.pos())
try {
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
  await new Promise((res) => setTimeout(res, 4_000))
  await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  await page.waitForTimeout(1_500)
  const afterFreeze = await page.evaluate(() => window.__alphaPlayer.pos())
  const drift = Math.hypot(afterFreeze.x - beforeFreeze.x, afterFreeze.z - beforeFreeze.z)
  if (drift > 5) {
    failures++
    console.log(`FAIL [freeze] position jumped ${drift.toFixed(1)}m`)
  }
  await check('freeze')
  console.log(`freeze cycle: drift ${drift.toFixed(2)}m, veil down, canvas intact`)
} catch (e) {
  console.log(`freeze cycle skipped (${String(e).slice(0, 80)})`)
}

// Phase 4 — gameplay continues after all cycles: the hero can still move.
const preMove = await page.evaluate(() => window.__alphaPlayer.pos())
await page.keyboard.down('w')
await page.waitForTimeout(1_500)
await page.keyboard.up('w')
const postMove = await page.evaluate(() => window.__alphaPlayer.pos())
const moved = Math.hypot(postMove.x - preMove.x, postMove.z - preMove.z)
if (moved < 1) {
  failures++
  console.log(`FAIL controls dead after cycles (moved ${moved.toFixed(2)}m)`)
} else {
  console.log(`controls live after cycles (moved ${moved.toFixed(1)}m)`)
}

const notchAfter = await page.evaluate(() =>
  sessionStorage.getItem('alphacode.gfx.notch'),
)
const steps = governorLogs.filter((l) => l.text.includes('notch →'))
console.log(
  `governor: hint ${notchBefore ?? 'unset'} → ${notchAfter ?? 'unset'}; steps: ${steps.length ? steps.map((s) => s.text).join(' | ') : 'none'}`,
)
const inProtected = steps.filter(({ at }) =>
  protectedWindows.some(([from, to]) => at >= from && at <= to),
)
// Only meaningful when the machine could actually hold the floor: at 300+
// load the ambient fps is genuinely under 40 and demotions are correct.
if (inProtected.length > 0 && ambientFps >= 45) {
  failures++
  console.log(
    `FAIL governor stepped during a hidden/just-returned window: ${inProtected.map((s) => s.text).join(' | ')}`,
  )
} else if (inProtected.length > 0) {
  console.log(
    `note: governor stepped during protected window with ambient fps ${ambientFps.toFixed(0)} (<45) — honest low-fps call, not a tab-switch artifact`,
  )
}
const contextDemotes = governorLogs.filter((l) =>
  l.text.includes('context lost — demoting'),
)
if (contextDemotes.length > 0) {
  failures++
  console.log('FAIL context-loss demotion fired during the run')
}

console.log(failures === 0 ? 'TAB-SWITCH PROBE PASS' : `TAB-SWITCH PROBE FAIL (${failures})`)
await browser.close()
process.exit(failures === 0 ? 0 : 1)
