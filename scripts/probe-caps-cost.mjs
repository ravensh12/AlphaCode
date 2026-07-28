// What did the device-caps read actually COST? readDeviceCaps() answered "is
// WebGL2 available" by allocating a throwaway WebGL2 context, and the
// overworld called it from a useMemo keyed on the governor notch — so every
// quality change paid it, synchronously, on the main thread, while a live
// WebGL context was already running.
//
// This times that exact operation inside the booted overworld page, which is
// the only place the number means anything: a second context has to be
// created alongside the real one, on a GPU already busy rendering the city.
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-caps-cost.mjs [--base=http://127.0.0.1:4173] [--n=8]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://127.0.0.1:4173')
const n = Number(arg('n', '8'))

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
})
await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, {
  timeout: 180_000,
})
await page.waitForTimeout(3000)

const result = await page.evaluate((count) => {
  const probe = []
  const dpr = []
  for (let i = 0; i < count; i++) {
    let t = performance.now()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('webgl2')
    ctx?.getExtension('WEBGL_lose_context')?.loseContext()
    probe.push(performance.now() - t)

    t = performance.now()
    void (window.devicePixelRatio || 1)
    dpr.push(performance.now() - t)
  }
  const stat = (a) => {
    const s = [...a].sort((x, y) => x - y)
    return {
      p50: +s[Math.floor(s.length / 2)].toFixed(2),
      min: +s[0].toFixed(2),
      max: +s[s.length - 1].toFixed(2),
    }
  }
  return { probe: stat(probe), dpr: stat(dpr), raw: probe.map((v) => +v.toFixed(1)) }
}, n)

console.log('COST OF ONE DEVICE-CAPS READ, inside the running overworld')
console.log(`  WebGL2 probe (was: every governor notch change): ${JSON.stringify(result.probe)} ms`)
console.log(`  devicePixelRatio read (now):                     ${JSON.stringify(result.dpr)} ms`)
console.log(`  every sample: ${result.raw.join(', ')} ms`)
await browser.close()
