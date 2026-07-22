// Frame-pacing probe for the OVERWORLD combat path — boots /quest as a guest
// (same harness as probe-spit-qa), lets the zombie waves engage while the bot
// fires and strafes, then samples rAF deltas mid-combat for ~10s.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers node scripts/probe-overworld-perf.mjs
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const base = arg('base', 'http://localhost:5173')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
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
await page.waitForTimeout(6000)
await page.keyboard.up('a')
await page.keyboard.down('d')

// Sample rAF deltas for ~10s mid-combat.
const stats = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const deltas = []
      let last = performance.now()
      let n = 0
      const tick = (now) => {
        deltas.push(now - last)
        last = now
        if (++n < 600) requestAnimationFrame(tick)
        else {
          deltas.sort((a, b) => a - b)
          const q = (p) => deltas[Math.floor(p * deltas.length)]
          resolve({
            frames: deltas.length,
            p50: +q(0.5).toFixed(1),
            p95: +q(0.95).toFixed(1),
            p99: +q(0.99).toFixed(1),
            max: +deltas[deltas.length - 1].toFixed(1),
            over17ms: deltas.filter((d) => d > 17.4).length,
            over34ms: deltas.filter((d) => d > 34).length,
          })
        }
      }
      requestAnimationFrame(tick)
    }),
)
await page.keyboard.up('d').catch(() => {})
await page.keyboard.up('f').catch(() => {})
console.log('overworld:', JSON.stringify(stats))
await browser.close()
