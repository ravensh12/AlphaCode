// Death-collapse verification (independent checker):
//  Force a real HP=0 defeat (stand still, eat the volleys), then WITHOUT
//  remounting capture the collapse + prone hold for ~3s. Then remount (retry)
//  and capture to confirm it clears back to idle/upright.
//    node scripts/probe-death-collapse.mjs --arena=architect|boss --variant=N
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const ARENA = arg('arena', 'architect')
const VARIANT = Number(arg('variant', '3'))
const OUT = arg('out', `e2e-shots/verify-boss-combined/${ARENA}-collapse${ARENA === 'boss' ? `-v${VARIANT}` : ''}`)
mkdirSync(OUT, { recursive: true })

const base = 'http://localhost:5173'
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
await page.route('**/src/main.tsx*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'export {}' }))
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })

const NAMES = ['The Hider', 'Mirror Mimic', 'Twin-Key Golem', 'The Gatekeeper', 'Bracket Beast', 'Sorted Sphinx']
const ACCENTS = ['#b6ff5c', '#36e0ff', '#b48cff', '#ffb44a', '#ff5a6a', '#5aa8ff']

async function mount() {
  await page.evaluate(
    async ({ arena, variant, name, accent }) => {
      document.getElementById('qa-host')?.remove()
      window.__won = false; window.__lost = false
      const host = document.createElement('div')
      host.id = 'qa-host'; host.style.cssText = 'position:fixed;inset:0;background:#000'
      document.body.appendChild(host)
      const Rm = await import('/@id/react'); const R = Rm.default ?? Rm
      const dom = await import('/@id/react-dom/client'); const createRoot = (dom.default ?? dom).createRoot
      const done = { onWin: () => (window.__won = true), onLose: () => (window.__lost = true) }
      let el
      if (arena === 'architect') {
        const m = await import('/src/components/game3d/ArchitectArena.tsx')
        el = R.createElement(m.ArchitectArena, { ...done, qaGodMode: false, qaHooks: true })
      } else {
        const m = await import('/src/components/game3d/BossArena.tsx')
        el = R.createElement(m.BossArena, { accent, variant, bossName: name, bonusQuestion: null, qaGodMode: false, qaHooks: true, ...done })
      }
      window.__r?.unmount?.(); window.__r = createRoot(host); window.__r.render(el)
    },
    { arena: ARENA, variant: VARIANT, name: NAMES[VARIANT], accent: ACCENTS[VARIANT] },
  )
  await page.locator('#qa-host canvas').waitFor({ state: 'visible', timeout: 60000 })
}

let sid = 0
const shot = async (tag) => { await page.screenshot({ path: `${OUT}/${String(sid++).padStart(2, '0')}-${tag}.png` }).catch(() => {}) }

await mount()
await page.waitForTimeout(9000) // curtain + entrance + teach card

// Stand still in the open and eat volleys. Nudge into the center where fire
// converges; never dodge. Poll for death.
await page.evaluate(() => {
  // walk toward boss a touch to be in range, then stop.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }))
})
await page.waitForTimeout(700)
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', bubbles: true })))

const t0 = Date.now()
let died = false
while (Date.now() - t0 < 75000) {
  if (await page.evaluate(() => window.__lost)) { died = true; break }
  await page.waitForTimeout(300)
}
console.log(`death reached=${died} after ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (!died) { await shot('never-died'); await browser.close(); process.exit(0) }

// Capture the collapse + prone hold over ~3.2s (NO remount).
for (let i = 0; i < 8; i++) { await shot(`collapse-${i}`); await page.waitForTimeout(400) }

// Retry: remount fresh and confirm the avatar is upright/idle again.
await mount()
await page.waitForTimeout(9500)
await shot('retry-cleared')
await page.waitForTimeout(600)
await shot('retry-cleared-2')

writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ arena: ARENA, variant: VARIANT, died }, null, 2))
console.log(`saved ${sid} frames → ${OUT}`)
await browser.close()
