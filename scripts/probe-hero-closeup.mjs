// P3 QA: boot /quest, take high-res screenshots of the hero (idle + running +
// dashing) and save tight crops for material inspection.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium node scripts/probe-hero-closeup.mjs
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
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
await page.waitForFunction(
  () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
  undefined,
  { timeout: 90_000 },
)
await page.waitForTimeout(4000)
await page.locator('canvas').first().click({ position: { x: 800, y: 600 }, force: true }).catch(() => {})

const clip = { x: 480, y: 380, width: 640, height: 620 } // hero sits low-center
await page.screenshot({ path: 'test-results/p3-game-idle.png', clip })
await page.keyboard.down('w')
await page.waitForTimeout(700)
await page.screenshot({ path: 'test-results/p3-game-run.png', clip })
await page.keyboard.up('w')
await page.keyboard.press('q')
await page.waitForTimeout(200)
await page.screenshot({ path: 'test-results/p3-game-dash.png', clip })
await page.waitForTimeout(1200)
await page.keyboard.down('f')
await page.waitForTimeout(600)
await page.screenshot({ path: 'test-results/p3-game-fire.png', clip })
await page.keyboard.up('f')
await page.screenshot({ path: 'test-results/p3-game-full.png' })
console.log('done')
await browser.close()
