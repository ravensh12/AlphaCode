// QA harness: boots /quest as a guest (ULTRA for everyone — the tier arg is
// retired), captures console/page errors, measures REAL per-frame draw calls
// (WebGL2 draw* wrapped before the app loads), and saves day/night shots.
//   node scripts/debug-overworld-boot.mjs [label] [--shots]
// Optional QA flags (additive; defaults leave the canonical run untouched):
//   --pos=x,z[,h]  spawn the guest at world coords (heading radians)
//   --out=PREFIX   screenshot path prefix (default test-results/gfx-<label>)
//   --day-only     skip the night ride (shots/measure day only)
//   --settle=MS    extra wait before the day shot (Meshy decode settle)
//   --notch=N      seed the FPS governor's session hint (0=ULTRA..3=floor)
//   --throttle=R   CDP CPU throttle rate (governor rescue demo; logs notches)
import { chromium } from '@playwright/test'

const tier = process.argv[2] ?? 'ultra'
const notchArg = process.argv.find((a) => a.startsWith('--notch='))
const seedNotch = notchArg ? Number(notchArg.slice(8)) : null
const throttleArg = process.argv.find((a) => a.startsWith('--throttle='))
const throttleRate = throttleArg ? Number(throttleArg.slice(11)) : 0
const shots = process.argv.includes('--shots')
const lean = process.argv.includes('--lean') // small viewport, shots only
const dayOnly = process.argv.includes('--day-only')
const posArg = process.argv.find((a) => a.startsWith('--pos='))
const spawnPos = posArg
  ? (() => {
      const [x, z, h] = posArg.slice(6).split(',').map(Number)
      return { x, z, h: Number.isFinite(h) ? h : 0 }
    })()
  : null
const outPrefix =
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
  `test-results/gfx-${tier}`
const settleMs = Number(
  process.argv.find((a) => a.startsWith('--settle='))?.slice(9) ?? '0',
)
// E2E_CHANNEL=chromium → the new headless mode with REAL GPU access (same
// switch the e2e suite uses); default remains the software-GL headless shell.
// HEADED=1 additionally opens a real window (true compositor/vsync numbers).
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  ...(process.env.HEADED ? { headless: false } : {}),
})
const page = await browser.newPage({
  viewport: lean ? { width: 960, height: 540 } : { width: 1280, height: 720 },
})
const errors = []
let meshyRequests = 0
page.on('request', (r) => {
  if (r.url().includes('/assets/meshy/')) meshyRequests++
})
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push(m.text())
    console.log('[console error]', m.text().slice(0, 500))
  }
})
page.on('pageerror', (e) => {
  errors.push(String(e))
  console.log('[pageerror]', String(e).slice(0, 800))
})
await page.addInitScript(
  ({ gfxTier, spawn, notch }) => {
    localStorage.clear()
    sessionStorage.clear()
    if (spawn) {
      // Saved position is honored when the session tour matches the durable
      // tour — a fresh guest is at {world:0, stage:0}, so name that objective.
      sessionStorage.setItem('alphacode.tour', JSON.stringify({ world: 0, stage: 0 }))
      sessionStorage.setItem('alphacode.quest.pos', JSON.stringify(spawn))
    }
    if (notch != null && Number.isFinite(notch)) {
      // Governor session hint — measure a degraded notch deliberately.
      sessionStorage.setItem('alphacode.gfx.notch', String(notch))
    }
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
    // Retired: the override key is ignored by the app now (ULTRA for
    // everyone); kept as a label so old runs stay comparable in notes.
    localStorage.setItem('alphacode.graphics.override', gfxTier)
    // Skip the how-to-play overlay so the day/night cycle runs from mount.
    sessionStorage.setItem('alphacode.quest.introSeen', '1')
    // Wrap every WebGL2 draw entry point so we can measure real draw calls
    // AND vertex throughput per frame (includes shadow cascades + post
    // passes — the honest numbers for budget work).
    window.__drawCalls = 0
    window.__drawVerts = 0
    const proto = WebGL2RenderingContext.prototype
    const wrap = (fn, verts) => {
      const orig = proto[fn]
      proto[fn] = function (...args) {
        window.__drawCalls++
        window.__drawVerts += verts(args)
        return orig.apply(this, args)
      }
    }
    wrap('drawElements', (a) => a[1])
    wrap('drawArrays', (a) => a[2])
    wrap('drawElementsInstanced', (a) => a[1] * a[4])
    wrap('drawArraysInstanced', (a) => a[2] * a[3])
  },
  { gfxTier: tier, spawn: spawnPos, notch: seedNotch },
)
// Governor rescue demo: throttle the CPU via CDP and watch the notch logs.
if (throttleRate > 1) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttleRate })
  page.on('console', (m) => {
    if (m.text().includes('[gfx-governor]')) console.log('  ', m.text())
  })
  console.log(`[harness] CPU throttled ×${throttleRate} — watching governor`)
}
await page.goto('http://127.0.0.1:4173/quest', { waitUntil: 'domcontentloaded' })
await page.locator('canvas').waitFor({ state: 'visible', timeout: 60_000 })
// Dismiss the how-to-play overlay so the sim clock runs.
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 3_000 }).catch(() => false)) {
  // force: the intro card runs a float animation, so it never reads "stable";
  // noWaitAfter: software-GL keeps the page "busy", never settling navigations.
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForTimeout(9_000 + settleMs) // let streams/citizens land + shaders warm

const measure = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const frames = 30
        let count = 0
        requestAnimationFrame(() => {
          const startCalls = window.__drawCalls
          const tick = () => {
            count++
            if (count >= frames) res(Math.round((window.__drawCalls - startCalls) / frames))
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
      }),
  )

// Median rAF FPS over ~3s (headless is vsync-capped at 60 on most setups, so
// read this as "holds N fps", not a max-throughput number).
const measureFps = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const samples = []
        let last = performance.now()
        const tick = () => {
          const now = performance.now()
          samples.push(now - last)
          last = now
          if (samples.length >= 180) {
            samples.sort((a, b) => a - b)
            const median = samples[Math.floor(samples.length / 2)]
            res(Math.round(1000 / Math.max(0.5, median)))
          } else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )

// Waiting a few real frames "warms" the compositor so page.screenshot can
// grab a surface without timing out under software GL.
const warmFrames = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0
        const tick = () => (++n >= 10 ? res(null) : requestAnimationFrame(tick))
        requestAnimationFrame(tick)
      }),
  )

// --shots-first: capture before the (slow) measurements — an idle guest only
// survives the spawn siege for so long, and a death overlay ruins the frame.
const shotsFirst = process.argv.includes('--shots-first')
if (shots && shotsFirst) {
  await warmFrames()
  await page.screenshot({ path: `${outPrefix}-day.png`, timeout: 90_000 })
  console.log(`[${tier}] day shot saved (early)`)
}
if (!lean) {
  const dayCalls = await measure()
  console.log(`[${tier}] day draw calls/frame ≈ ${dayCalls}`)
  const verts = await page.evaluate(
    () =>
      new Promise((res) => {
        requestAnimationFrame(() => {
          const start = window.__drawVerts
          let n = 0
          const tick = () => (++n >= 30 ? res(Math.round((window.__drawVerts - start) / 30)) : requestAnimationFrame(tick))
          requestAnimationFrame(tick)
        })
      }),
  )
  console.log(`[${tier}] day vertices/frame ≈ ${(verts / 1e6).toFixed(2)}M`)
  const dayFps = await measureFps()
  console.log(`[${tier}] day median fps ≈ ${dayFps}`)
  const backing = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return c ? `${c.width}x${c.height}` : 'none'
  })
  console.log(`[${tier}] canvas backing ≈ ${backing}`)
  const heap = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  )
  console.log(`[${tier}] JS heap ≈ ${heap} MB`)
}
if (shots && !shotsFirst) {
  await warmFrames()
  await page.screenshot({ path: `${outPrefix}-day.png`, timeout: 90_000 })
  console.log(`[${tier}] day shot saved`)
}

if (!dayOnly) {
  // Ride the cycle into night (32s day → 18s night), dismissing any milestone
  // overlays that would pause the clock, then measure again mid-night.
  const nightStarted = Date.now()
  while (Date.now() - nightStarted < 120_000) {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    if (await gotIt.isVisible({ timeout: 250 }).catch(() => false)) {
      await gotIt.click({ force: true }).catch(() => {})
    }
    if (await page.locator('.over3d-night.is-on').count()) break
    await page.waitForTimeout(1_000)
  }
  await page.waitForTimeout(4_000) // let the corruption blend ease in
  // Screenshot FIRST — night lasts 18s and software-GL measures take longer.
  if (shots) {
    await warmFrames()
    await page.screenshot({ path: `${outPrefix}-night.png`, timeout: 90_000 })
    console.log(`[${tier}] night shot saved`)
  }
  if (!lean) {
    const nightCalls = await measure()
    console.log(`[${tier}] night draw calls/frame ≈ ${nightCalls}`)
  }
}

console.log(`[${tier}] /assets/meshy/ requests: ${meshyRequests}`)
console.log(`[${tier}] console errors: ${errors.length}`)
await browser.close()
process.exit(errors.length > 0 ? 1 : 0)
