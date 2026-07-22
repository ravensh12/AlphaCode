// Traversal jank probe: boots /quest?nohorde (base city, no combat), walks
// the hero through the streets for ~45s, and reports rAF long-frame counts in
// 5s buckets alongside the live governor notch (sessionStorage hint) and any
// [gfx-governor] console lines. Shows the jank-aware governor engaging
// (long frames high at boot notch → demote → long frames drop).
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-traversal-jank.mjs [--base=http://localhost:5173] [--secs=45]
import { chromium } from '@playwright/test'

const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:5173')
const secs = Number(arg('secs', '45'))

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
page.on('console', (m) => {
  const t = m.text()
  if (t.includes('[gfx-governor]')) console.log('CONSOLE:', t)
})
await page.addInitScript(() => {
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  localStorage.setItem('alphacode.progress.guest', JSON.stringify({
    streak: { current: 0, longest: 0 }, lessons: {},
    badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
    academyProgress: { schemaVersion: 1, curriculumId: 'curriculum:neetcode150', curriculumVersion: 'v1.0.0', contentVersion: 'v1.0.0', missionCompletions: {}, realmQuizzes: {}, bossDefeats: {} },
  }))
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
})

await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, { timeout: 90_000 })
await page.waitForTimeout(2000)
await page.locator('canvas').first().click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true }).catch(() => {})

// Walk: hold W, vary heading occasionally so the streamer keeps working.
await page.keyboard.down('w')
const steer = setInterval(async () => {
  await page.keyboard.down('ArrowLeft').catch(() => {})
  setTimeout(() => page.keyboard.up('ArrowLeft').catch(() => {}), 500)
}, 6000)

const result = await page.evaluate(
  (durMs) =>
    new Promise((resolve) => {
      const buckets = []
      let bStart = performance.now()
      let over33 = 0
      let over50 = 0
      let frames = 0
      let worst = 0
      let last = performance.now()
      const t0 = last
      const tick = (nowT) => {
        const now = performance.now()
        const dt = now - last
        last = now
        frames++
        if (dt > 33) over33++
        if (dt > 50) over50++
        if (dt > worst) worst = dt
        if (now - bStart >= 5000) {
          let notch = null
          try { notch = sessionStorage.getItem('alphacode.gfx.notch') } catch {}
          buckets.push({
            t: +((now - t0) / 1000).toFixed(0),
            frames, over33, over50, worst: +worst.toFixed(0), notch,
          })
          bStart = now; frames = 0; over33 = 0; over50 = 0; worst = 0
        }
        if (now - t0 < durMs) requestAnimationFrame(tick)
        else resolve(buckets)
      }
      requestAnimationFrame(tick)
    }),
  secs * 1000,
)
clearInterval(steer)
await page.keyboard.up('w').catch(() => {})
console.log('BUCKETS (5s each): t=end-sec, over33/over50 = long frames, notch = governor hint')
for (const b of result) console.log(' ', JSON.stringify(b))
await browser.close()
