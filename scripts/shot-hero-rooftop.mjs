// Capture the landing hero's live rooftop scene: full-hero QA frames and
// high-res poster bakes (canvas only, copy/veil hidden).
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium node scripts/shot-hero-rooftop.mjs <outdir> [--poster]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const outDir = process.argv[2] ?? 'e2e-shots/hero-rooftop'
const poster = process.argv.includes('--poster')
mkdirSync(outDir, { recursive: true })

const shots = poster
  ? [
      ['poster-desktop', { width: 1920, height: 1000 }, 2],
      ['poster-mobile', { width: 480, height: 900 }, 2],
    ]
  : [
      ['desktop', { width: 1440, height: 900 }, 2],
      ['mobile', { width: 390, height: 844 }, 2],
    ]

async function launch() {
  return chromium.launch({
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
    timeout: 600_000,
  })
}

// Sibling QA jobs on this box pkill chromium wholesale, so every shot gets
// retries with a fresh browser.
let browser = await launch()
for (const [name, viewport, dpr] of shots) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const page = await browser.newPage({ viewport, deviceScaleFactor: dpr })
      page.on('console', (m) => {
        if (m.type() === 'error') console.log(`[console.error][${name}]`, m.text().slice(0, 240))
      })
      page.on('pageerror', (e) => console.log(`[pageerror][${name}]`, String(e).slice(0, 240)))
      await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 120_000 })
      await page.locator('.landing-hero-live canvas').waitFor({ state: 'attached', timeout: 120_000 })
      await page.waitForTimeout(3500) // settle: pose applied + poster crossfade complete
      if (poster) {
        // Bake only the raw scene: strip copy, veil, rain, nav.
        await page.addStyleTag({
          content:
            '.landing-hero-inner, .landing-hero-veil, .landing-rain, .landing-nav { display: none !important; }',
        })
        await page.waitForTimeout(200)
        await page.locator('.landing-hero-live').screenshot({ path: `${outDir}/${name}.png`, timeout: 60_000 })
      } else {
        await page.screenshot({ path: `${outDir}/${name}.png`, timeout: 60_000 })
      }
      await page.close()
      console.log('shot', name)
      break
    } catch (err) {
      console.log('retry', name, 'attempt', attempt, String(err).slice(0, 140))
      try {
        await browser.close()
      } catch {}
      browser = await launch()
    }
  }
}
await browser.close()
console.log('done', outDir)
