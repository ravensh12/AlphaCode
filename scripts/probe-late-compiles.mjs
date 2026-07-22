// Detect mid-run shader compiles: samples renderer.info.programs during a
// sprint and prints any program created AFTER the veil dropped.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-late-compiles.mjs
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
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
let sawVeil = false
for (let i = 0; i < 600; i++) {
  const up = await page.evaluate(() =>
    /RENDERING CODE CITY/i.test(document.body.innerText || ''),
  )
  if (up) sawVeil = true
  if (sawVeil && !up) break
  await page.waitForTimeout(200)
}
const snapshot = () =>
  page.evaluate(() => {
    const gl = window.__alphaGl
    if (!gl) return null
    return gl.info.programs.map((p) => `${p.id}|${p.cacheKey.slice(0, 140)}`)
  })
const atDrop = await snapshot()
console.log(`programs at veil drop: ${atDrop.length}`)
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 800, y: 450 }, force: true, noWaitAfter: true })
  .catch(() => {})
await page.keyboard.down('Shift')
await page.keyboard.down('w')
await page.waitForTimeout(9000)
await page.keyboard.up('w')
await page.keyboard.up('Shift')
// Turn and run a different direction too.
await page.keyboard.down('a')
await page.waitForTimeout(600)
await page.keyboard.up('a')
await page.keyboard.down('Shift')
await page.keyboard.down('w')
await page.waitForTimeout(8000)
await page.keyboard.up('w')
await page.keyboard.up('Shift')
const after = await snapshot()
console.log(`programs after sprint: ${after.length}`)
const before = new Set(atDrop)
const late = after.filter((k) => !before.has(k))
console.log('LATE COMPILES:')
for (const k of late) console.log('  ', k)
await browser.close()
