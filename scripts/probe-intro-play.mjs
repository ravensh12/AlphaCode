// P2 verification: load /intro as a guest and screenshot mid-cinematic frames.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium node scripts/probe-intro-play.mjs
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (e) => {
  errors.push(String(e))
  console.log('[pageerror]', String(e).slice(0, 400))
})
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console error]', m.text().slice(0, 300))
})
await page.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
})
await page.goto(`${base}/intro`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
// Screenshot a few beats across the 18s cinematic.
for (const [name, at] of [
  ['early', 2500],
  ['mid', 6000],
  ['late', 5000],
]) {
  await page.waitForTimeout(at)
  await page.screenshot({ path: `test-results/p2-intro-${name}.png` })
  console.log(`shot ${name}`)
}
console.log('page errors:', errors.length)
await browser.close()
process.exit(errors.length ? 1 : 0)
