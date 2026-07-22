// Intro-cinematic QA probe (timing-honest variant of probe-intro-frames):
// boots /intro as a guest and captures the whole scripted timeline via CDP
// Page.captureScreenshot ONLY — page.screenshot waits for a "stable"
// compositor frame, which under machine load stalls seconds per shot and
// silently skews every beat label after it. CDP grabs are near-instant, so
// the frame labeled t=6s is actually the 6s beat.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-intro-cine-qa.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/intro-cine-qa'
mkdirSync(outDir, { recursive: true })
const base = 'http://localhost:5173'

// Beats to capture, in seconds from cinematic start. Override with
// BEATS="11.8,12.1,12.4" for a focused pass (e.g. grip-closeup crops).
const BEATS = process.env.BEATS
  ? process.env.BEATS.split(',').map(Number)
  : [0.5, 1.5, 2.5, 3.5, 4.5, 5.2, 6, 6.8, 8, 10, 11.5, 12.6, 13.2, 14.5, 16, 17.5]

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
for (const sig of ['uncaughtException', 'unhandledRejection']) {
  process.on(sig, async (e) => {
    console.log('FATAL', String(e).slice(0, 300))
    try {
      await browser.close()
    } catch {
      /* already gone */
    }
    process.exit(1)
  })
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const cdp = await page.context().newCDPSession(page)
const errors = []
page.on('pageerror', (e) => {
  errors.push(String(e))
  console.log('[pageerror]', String(e).slice(0, 400))
})
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console error]', m.text().slice(0, 300))
  // Vite full-reloads restart the cinematic clock and invalidate every beat
  // label after them — surface them loudly.
  if (m.text().includes('[vite]')) console.log('[vite msg]', m.text().slice(0, 200))
})
page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) console.log('[navigated]', f.url())
})
await page.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
})
await page.goto(`${base}/intro`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
// Anchor "t=0" to first canvas paint (the scripted clock starts on the first
// rendered frame, so this is close enough for beat labels).
const t0 = Date.now()
for (const at of BEATS) {
  const wait = t0 + at * 1000 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  const label = String(at).padStart(4, '0')
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${outDir}/t${label}.png`, Buffer.from(data, 'base64'))
    const skew = ((Date.now() - t0) / 1000 - at).toFixed(2)
    console.log(`shot t=${at}s (skew +${skew}s)`)
  } catch (e) {
    console.log(`[shot failed] t=${at}: ${String(e).slice(0, 120)}`)
  }
}
console.log('page errors:', errors.length)
await browser.close()
process.exit(errors.length ? 1 : 0)
