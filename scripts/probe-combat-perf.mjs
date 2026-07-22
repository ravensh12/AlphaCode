// DEEP combat frame-pacing probe. Boots /quest as a guest, engages the horde
// (hold-fire + strafe), then samples rAF deltas for ~18s WHILE tracking:
//   - p50/p95/p99, over-33ms and over-50ms frame counts, max
//   - the TIMELINE of every janky (>33ms) frame (seconds since sampling start)
//   - WebGL renderer.info: shader PROGRAM count growth (compile hitches),
//     draw calls + triangles (draw-call spikes) sampled across the window.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-combat-perf.mjs [--base=http://localhost:5173] [--secs=18]
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const base = arg('base', 'http://localhost:5173')
const secs = Number(arg('secs', '18'))
const path = arg('path', '/quest')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
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

await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(
  () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
  undefined,
  { timeout: 90_000 },
)
await page.waitForTimeout(2500)
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
  .catch(() => {})

// Engage: hold fire + strafe so hordes/spitters activate and shots fly.
await page.keyboard.down('f')
await page.keyboard.down('a')
await page.waitForTimeout(5000)
await page.keyboard.up('a')
await page.keyboard.down('d')

const stats = await page.evaluate(
  (durMs) =>
    new Promise((resolve) => {
      const deltas = []
      const janks = [] // {t, dt}
      const info = [] // {t, calls, tris, programs}
      const gl = window.__alphaGl
      let last = performance.now()
      const t0 = last
      let nextInfo = 0
      const tick = (now) => {
        const dt = now - last
        last = now
        const t = now - t0
        deltas.push(dt)
        if (dt > 33) janks.push({ t: +(t / 1000).toFixed(2), dt: +dt.toFixed(1) })
        if (gl && gl.info && t >= nextInfo) {
          nextInfo += 1000
          info.push({
            t: +(t / 1000).toFixed(1),
            calls: gl.info.render.calls,
            tris: gl.info.render.triangles,
            programs: gl.info.programs ? gl.info.programs.length : -1,
          })
        }
        if (t < durMs) requestAnimationFrame(tick)
        else {
          const sorted = deltas.slice().sort((a, b) => a - b)
          const q = (p) => +sorted[Math.floor(p * sorted.length)].toFixed(1)
          resolve({
            frames: deltas.length,
            p50: q(0.5),
            p95: q(0.95),
            p99: q(0.99),
            max: +sorted[sorted.length - 1].toFixed(1),
            mean: +(deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1),
            over33: deltas.filter((d) => d > 33).length,
            over50: deltas.filter((d) => d > 50).length,
            over100: deltas.filter((d) => d > 100).length,
            janks,
            info,
          })
        }
      }
      requestAnimationFrame(tick)
    }),
  secs * 1000,
)
await page.keyboard.up('d').catch(() => {})
await page.keyboard.up('f').catch(() => {})
console.log('SUMMARY:', JSON.stringify({
  frames: stats.frames, p50: stats.p50, p95: stats.p95, p99: stats.p99,
  mean: stats.mean, max: stats.max, over33: stats.over33, over50: stats.over50, over100: stats.over100,
}))
console.log('JANK TIMELINE (t=s, dt=ms):', JSON.stringify(stats.janks))
console.log('GL INFO (per ~1s):', JSON.stringify(stats.info))
await browser.close()
