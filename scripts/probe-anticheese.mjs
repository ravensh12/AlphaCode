// Anti-cheese live spot-check (independent checker):
//  1) Golem Q+E MASH must never open the guard (window.__mechQA.open stays false).
//  2) Firing while GUARDED must deal ~0 damage (boss HP text unchanged).
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
await page.route('**/src/main.tsx*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export {}' }))
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })

async function mount(variant, name, accent) {
  await page.evaluate(
    async ({ variant, name, accent }) => {
      document.getElementById('qa-host')?.remove()
      window.__won = false; window.__lost = false
      const host = document.createElement('div')
      host.id = 'qa-host'; host.style.cssText = 'position:fixed;inset:0;background:#000'
      document.body.appendChild(host)
      const R = (await import('/@id/react')).default ?? (await import('/@id/react'))
      const dom = await import('/@id/react-dom/client')
      const createRoot = (dom.default ?? dom).createRoot
      const m = await import('/src/components/game3d/BossArena.tsx')
      const el = R.createElement(m.BossArena, {
        accent, variant, bossName: name, bonusQuestion: null,
        qaGodMode: true, qaHooks: true,
        onWin: () => (window.__won = true), onLose: () => (window.__lost = true),
      })
      window.__r?.unmount?.(); window.__r = createRoot(host); window.__r.render(el)
    },
    { variant, name, accent },
  )
  await page.locator('#qa-host canvas').waitFor({ state: 'visible', timeout: 60000 })
  await page.waitForTimeout(9000) // curtain + entrance + 7s teach card warmup
}

const hpNow = () =>
  page.evaluate(() => {
    const t = document.body.innerText || ''
    const m = t.match(/(\d+)\s*\/\s*(\d+)\s*HP/)
    return m ? { hp: +m[1], max: +m[2] } : null
  })
const openNow = () => page.evaluate(() => window.__mechQA?.open ?? null)

// ---- TEST 1: Golem Q+E mash never opens the guard ----
await mount(2, 'MASH-TEST', '#b48cff')
let mashOpenCount = 0
let samples = 0
const t0 = Date.now()
while (Date.now() - t0 < 22000) {
  // Same-instant mash: press Q and E together, repeatedly.
  await page.keyboard.down('q'); await page.keyboard.down('e')
  await page.waitForTimeout(30)
  await page.keyboard.up('q'); await page.keyboard.up('e')
  const open = await openNow()
  samples++
  if (open === true) mashOpenCount++
  await page.waitForTimeout(70)
}
const mashHp = await hpNow()
console.log(`MASH-TEST golem: samples=${samples} guardOpenedDuringMash=${mashOpenCount} bossHp=${JSON.stringify(mashHp)}`)

// ---- TEST 2: Firing while GUARDED deals ~0 damage ----
// Hider stays cloaked/guarded unless you ping the true signal. Hold F only.
await mount(0, 'GUARD-TEST', '#b6ff5c')
const before = await hpNow()
await page.keyboard.down('f')
// Sweep aim a bit so bolts cross the arena where the boss roams — but never ping.
const t1 = Date.now()
while (Date.now() - t1 < 16000) {
  await page.keyboard.down('a'); await page.waitForTimeout(500); await page.keyboard.up('a')
  await page.keyboard.down('d'); await page.waitForTimeout(500); await page.keyboard.up('d')
}
await page.keyboard.up('f')
const after = await hpNow()
console.log(`GUARD-TEST hider: before=${JSON.stringify(before)} after=${JSON.stringify(after)} (firing only, no ping)`) 

await browser.close()
