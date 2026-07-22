// Measures how often the overworld page RE-RENDERS during combat (reads the
// dev-only window.__owRenders counter). Load-independent proxy for the React
// reconcile cost — the dominant CPU item found via CPU profiling.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-rerender-perf.mjs [--base=http://localhost:5173] [--secs=12]
import { chromium } from '@playwright/test'

const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:5173')
const secs = Number(arg('secs', '12'))

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
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

await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, { timeout: 90_000 })
await page.waitForTimeout(2500)
await page.locator('canvas').first().click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true }).catch(() => {})

// Engage combat.
await page.keyboard.down('f')
await page.keyboard.down('a')
await page.waitForTimeout(4000) // let horde build so kills are flowing

const result = await page.evaluate((durMs) => new Promise((resolve) => {
  const w = window
  const startRenders = w.__owRenders ?? 0
  const t0 = performance.now()
  setTimeout(() => {
    const endRenders = w.__owRenders ?? 0
    const dt = (performance.now() - t0) / 1000
    resolve({ renders: endRenders - startRenders, secs: +dt.toFixed(1), perSec: +((endRenders - startRenders) / dt).toFixed(1) })
  }, durMs)
}), secs * 1000)
await page.keyboard.up('a').catch(() => {})
await page.keyboard.up('f').catch(() => {})
console.log('RERENDERS:', JSON.stringify(result))
await browser.close()
