// Sample cyborg clip/time combos for the landing rooftop pose.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium node scripts/probe-hero-pose.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const outDir = 'e2e-shots/hero-rooftop/poses'
mkdirSync(outDir, { recursive: true })

const combos = [
  ['idle', 0.2],
  ['idle', 0.8],
  ['idle', 1.3],
  ['crouch', 0.0],
  ['crouch', 0.8],
  ['shoot', 0.8],
  ['shoot', 1.6],
  ['victory', 1.2],
  ['turnL', 0.9],
]

async function launch() {
  return chromium.launch({
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
    timeout: 600_000,
  })
}

let browser = await launch()
for (const [clip, t] of combos) {
  const name = `${clip}-${String(t).replace('.', '_')}`
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(`http://localhost:5173/?heroPose=${clip}&heroT=${t}&heroRate=0.001`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      await page.locator('.landing-hero-live canvas').waitFor({ state: 'visible', timeout: 120_000 })
      await page.waitForTimeout(1800)
      await page.screenshot({
        path: `${outDir}/${name}.png`,
        clip: { x: 600, y: 100, width: 560, height: 520 },
      })
      await page.close()
      console.log('shot', name)
      break
    } catch (err) {
      console.log('retry', name, 'attempt', attempt, String(err).slice(0, 120))
      try {
        await browser.close()
      } catch {}
      browser = await launch()
    }
  }
}
await browser.close()
console.log('done')
