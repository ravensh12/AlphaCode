import { chromium } from '@playwright/test'
const PORT = process.env.PORT || '4173'
const BASE = `http://127.0.0.1:${PORT}`
const DIR = '/Users/raven/AlphaCode/e2e-shots'
const progress = {
  streak: { current: 0, longest: 0 }, lessons: {},
  badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
  academyProgress: { schemaVersion: 1, curriculumId: 'curriculum:neetcode150', curriculumVersion: 'v1.0.0', contentVersion: 'v1.0.0', missionCompletions: {}, realmQuizzes: {}, bossDefeats: {} },
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.error('[pageerror]', String(e)))
await page.addInitScript((p) => {
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  localStorage.setItem('alphacode.progress.guest', JSON.stringify(p))
}, progress)
const t0 = Date.now()
await page.goto(`${BASE}/intro`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 30000 })
console.log('intro canvas visible after', Date.now() - t0, 'ms')
const canvas = page.locator('canvas').first()
for (const [ms, name] of [[2600, 'sweep'], [6600, 'push'], [11500, 'reveal'], [14000, 'title']]) {
  await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)))
  await canvas.screenshot({ path: `${DIR}/intro-${name}.png` })
  console.log('  shot intro', name, 'at', Date.now() - t0, 'ms')
}
await browser.close()
process.exit(0)
