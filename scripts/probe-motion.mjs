import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const PORT = process.env.PORT || '4173'
const BASE = `http://127.0.0.1:${PORT}`
const DIR = '/tmp/motion'
mkdirSync(DIR, { recursive: true })
const progress = {
  streak: { current: 0, longest: 0 }, lessons: {},
  badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
  academyProgress: { schemaVersion: 1, curriculumId: 'curriculum:neetcode150', curriculumVersion: 'v1.0.0', contentVersion: 'v1.0.0', missionCompletions: {}, realmQuizzes: {}, bossDefeats: {} },
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 900, height: 600 } })
await page.addInitScript((p) => {
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  localStorage.setItem('alphacode.progress.guest', JSON.stringify(p))
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
}, progress)
await page.goto(`${BASE}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 45000 })
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, { timeout: 90000 })
await page.waitForTimeout(2500)
const canvas = page.locator('canvas').first()
await page.mouse.click(450, 300)
await page.waitForTimeout(300)

const burst = async (name, n, gapMs, action) => {
  for (let i = 0; i < n; i++) {
    if (action) await action(i)
    await canvas.screenshot({ path: `${DIR}/${name}-${String(i).padStart(2, '0')}.png` })
    await page.waitForTimeout(gapMs)
  }
  console.log('burst', name, 'done')
}

// RUN burst.
await page.keyboard.down('w')
await page.waitForTimeout(500)
await burst('run', 16, 70)

// JUMP/VAULT burst: fire a jump mid-run, capture the arc. Repeat a couple hops
// to raise the odds of clearing a kerb car (contextual vault).
await burst('jump', 20, 55, (i) => (i % 10 === 0 ? page.keyboard.press('Space') : null))
await page.keyboard.up('w')

// WALK-BACKWARD while shooting burst (turn 180 handled by moving back).
await page.waitForTimeout(400)
await page.keyboard.down('s')
await page.keyboard.down('f')
await burst('back', 16, 70)
await page.keyboard.up('s')
await page.keyboard.up('f')

await browser.close()
console.log('frames in', DIR)
process.exit(0)
