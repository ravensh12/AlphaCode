// Deterministic close-up captures of the enemy-projectile VFX (all themes +
// the spitter acid) via the QA-only showcase scene, for the harsh review loop.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-projfx-showcase.mjs --out=e2e-shots/projfx-showcase
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const OUT = arg('out', 'e2e-shots/projfx-showcase')
const base = arg('base', 'http://localhost:5173')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.route('**/src/main.tsx*', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: 'export {}' }),
)
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })

for (let warm = 0; warm < 3; warm++) {
  try {
    await page.evaluate(async () => {
      await import('/@id/react')
      await import('/@id/react-dom/client')
      await import('/scripts/qa/ProjectileShowcase.tsx')
    })
    await page.waitForTimeout(2000)
    await page.evaluate(() => true)
    break
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await page.waitForTimeout(1500)
  }
}

await page.evaluate(async () => {
  const host = document.createElement('div')
  host.id = 'qa-host'
  host.style.cssText = 'position:fixed;inset:0;background:#000'
  document.body.appendChild(host)
  const ReactMod = await import('/@id/react')
  const React = ReactMod.default ?? ReactMod
  const domMod = await import('/@id/react-dom/client')
  const createRoot = (domMod.default ?? domMod).createRoot
  const m = await import('/scripts/qa/ProjectileShowcase.tsx')
  createRoot(host).render(React.createElement(m.ProjectileShowcase))
})
await page.locator('#qa-host canvas').waitFor({ state: 'visible', timeout: 60_000 })
await page.waitForTimeout(2500)

for (let i = 0; i < 10; i++) {
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}.png` })
  await page.waitForTimeout(280)
}
console.log(`saved 10 frames → ${OUT}`)
await browser.close()
