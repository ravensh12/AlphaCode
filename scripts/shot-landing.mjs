// Screenshot the landing page at desktop + mobile widths.
// Usage: PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers node scripts/shot-landing.mjs <outdir> [suffix]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const outDir = process.argv[2] ?? 'e2e-shots/landing'
const suffix = process.argv[3] ?? ''
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${outDir}/${name}${suffix}.png` })
    await page.screenshot({ path: `${outDir}/${name}${suffix}-full.png`, fullPage: true })
    await page.close()
  }
} finally {
  await browser.close()
}
console.log('done', outDir)
