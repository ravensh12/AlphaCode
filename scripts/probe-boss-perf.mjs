// Frame-pacing probe for the boss arenas — mounts an arena (same harness as
// probe-boss-qa) and samples rAF deltas mid-fight for ~10s.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-boss-perf.mjs --arena=boss --variant=2
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const ARENA = arg('arena', 'boss')
const VARIANT = Number(arg('variant', '0'))
const base = arg('base', 'http://localhost:5173')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.route('**/src/main.tsx*', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: 'export {}' }),
)
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })

const MODULE =
  ARENA === 'boss'
    ? '/src/components/game3d/BossArena.tsx'
    : ARENA === 'vex'
      ? '/src/components/game3d/CinematicBossArena.tsx'
      : '/src/components/game3d/ArchitectArena.tsx'
for (let warm = 0; warm < 3; warm++) {
  try {
    await page.evaluate(async (mod) => {
      await import('/@id/react')
      await import('/@id/react-dom/client')
      await import(mod)
    }, MODULE)
    await page.waitForTimeout(2000)
    await page.evaluate(() => true)
    break
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await page.waitForTimeout(1500)
  }
}

await page.evaluate(
  async ({ arena, variant }) => {
    const host = document.createElement('div')
    host.id = 'qa-host'
    host.style.cssText = 'position:fixed;inset:0;background:#000'
    document.body.appendChild(host)
    const ReactMod = await import('/@id/react')
    const React = ReactMod.default ?? ReactMod
    const domMod = await import('/@id/react-dom/client')
    const createRoot = (domMod.default ?? domMod).createRoot
    const done = { onWin: () => {}, onLose: () => {} }
    let el
    if (arena === 'boss') {
      const m = await import('/src/components/game3d/BossArena.tsx')
      el = React.createElement(m.BossArena, { accent: '#b48cff', variant, bossName: 'PERF', bonusQuestion: null, ...done })
    } else if (arena === 'vex') {
      const m = await import('/src/components/game3d/CinematicBossArena.tsx')
      el = React.createElement(m.CinematicBossArena, { ...done })
    } else {
      const m = await import('/src/components/game3d/ArchitectArena.tsx')
      el = React.createElement(m.ArchitectArena, { ...done })
    }
    createRoot(host).render(el)
  },
  { arena: ARENA, variant: VARIANT },
)
await page.locator('#qa-host canvas').waitFor({ state: 'visible', timeout: 60_000 })
await page.waitForTimeout(6000) // curtain + entrance + shader warmup

// Fight for a bit while sampling.
await page.keyboard.down('f')
await page.keyboard.down('a')
const stats = await page.evaluate(
  () =>
    new Promise((res) => {
      const deltas = []
      let last = performance.now()
      const tick = () => {
        const now = performance.now()
        deltas.push(now - last)
        last = now
        if (deltas.length >= 600) {
          deltas.sort((a, b) => a - b)
          const q = (p) => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))]
          res({
            frames: deltas.length,
            p50: +q(0.5).toFixed(1),
            p95: +q(0.95).toFixed(1),
            p99: +q(0.99).toFixed(1),
            max: +deltas[deltas.length - 1].toFixed(1),
            over17ms: deltas.filter((d) => d > 17.5).length,
            over34ms: deltas.filter((d) => d > 34).length,
          })
        } else {
          requestAnimationFrame(tick)
        }
      }
      requestAnimationFrame(tick)
    }),
)
await page.keyboard.up('f')
await page.keyboard.up('a')
console.log(`${ARENA}${ARENA === 'boss' ? `-v${VARIANT}` : ''}:`, JSON.stringify(stats))
await browser.close()
