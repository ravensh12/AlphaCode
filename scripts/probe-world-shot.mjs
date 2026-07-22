// P4 before/after: boot /quest as a guest and screenshot the SAME spawn view
// right after the boot veil clears (day). node scripts/probe-world-shot.mjs out.png
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'test-results/world-shot.png'
const base = 'http://localhost:5173'
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
await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
// The veil can re-raise when the Meshy preload kicks in — require it to stay
// down for a few consecutive checks before shooting.
let clear = 0
for (let i = 0; i < 120 && clear < 4; i++) {
  const up = await page.evaluate(() =>
    /RENDERING CODE CITY/i.test(document.body.innerText || ''),
  )
  clear = up ? 0 : clear + 1
  await page.waitForTimeout(1000)
}
await page.waitForTimeout(4000) // meshy street ring decode settles
// Warm the compositor a few rAFs so the screenshot can grab a surface (the
// GPU-headless channel sometimes stalls page.screenshot right after boot).
await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0
      const tick = () => (++n >= 12 ? res(null) : requestAnimationFrame(tick))
      requestAnimationFrame(tick)
    }),
)
await page.screenshot({ path: out, timeout: 90_000 })
console.log('saved', out)
await browser.close()
