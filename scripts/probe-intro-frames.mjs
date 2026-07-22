// Intro-cinematic review probe: boots /intro as a guest and captures frames
// across the whole scripted timeline (default 18s) for pacing/visual review.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-intro-frames.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/intro-frames'
mkdirSync(outDir, { recursive: true })
const base = 'http://localhost:5173'

// Beats to capture, in seconds from cinematic start.
const BEATS = [0.5, 1.5, 2.5, 3.5, 4.5, 6, 8, 10, 11.5, 13, 14.5, 16, 17.5]

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
const shoot = async (path) => {
  try {
    await page.screenshot({ path, timeout: 15_000 })
    return
  } catch {
    /* fall through to CDP */
  }
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(data, 'base64'))
  } catch (e) {
    console.log(`[shot failed] ${path}: ${String(e).slice(0, 120)}`)
  }
}
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
// Anchor "t=0" to first canvas paint (the scripted clock starts on the first
// rendered frame, so this is close enough for beat labels).
const t0 = Date.now()
for (const at of BEATS) {
  const wait = t0 + at * 1000 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  await shoot(`${outDir}/t${String(at).padStart(4, '0')}.png`)
  console.log(`shot t=${at}s`)
}
console.log('page errors:', errors.length)
await browser.close()
process.exit(errors.length ? 1 : 0)
