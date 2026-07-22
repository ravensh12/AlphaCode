// One-point diagnostic: boot at a seeded position, capture ALL console
// output + meshy swap-store state, then screenshot.
//   node scripts/probe-gfx-diag.mjs [x] [z] [out.png]
import { chromium } from '@playwright/test'

const x = Number(process.argv[2] ?? -410)
const z = Number(process.argv[3] ?? 330)
const out = process.argv[4] ?? 'e2e-shots/gfx-sweep/diag.png'
const base = 'http://localhost:5173'

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('console', (msg) => {
  const t = msg.text()
  if (/meshy|gfx|governor|fail|error|warn/i.test(t)) console.log('[console]', t.slice(0, 240))
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 240)))
page.on('requestfailed', (r) => {
  if (r.url().includes('/assets/')) console.log('[reqfail]', r.url(), r.failure()?.errorText)
})

await page.addInitScript(() => {
  localStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  localStorage.setItem(
    'alphacode.progress.guest',
    JSON.stringify({
      streak: { current: 0, longest: 0 },
      lessons: {},
      badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
      academyProgress: {
        schemaVersion: 1,
        curriculumId: 'curriculum:neetcode150',
        curriculumVersion: 'v1.0.0',
        contentVersion: 'v1.0.0',
        missionCompletions: {},
        realmQuizzes: {},
        bossDefeats: {},
      },
    }),
  )
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
  sessionStorage.setItem('alphacode.tour', JSON.stringify({ world: 0, stage: 0 }))
  sessionStorage.setItem(
    'alphacode.quest.pos',
    JSON.stringify({ x: window.__diagX ?? 0, z: window.__diagZ ?? 0, h: 0 }),
  )
})
// Position seeding needs the values inside the init script: re-add with them.
await page.addInitScript(
  ({ px, pz }) => {
    sessionStorage.setItem('alphacode.quest.pos', JSON.stringify({ x: px, z: pz, h: 0 }))
  },
  { px: x, pz: z },
)

await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 240_000 })
let sawVeil = false
const t0 = Date.now()
for (let i = 0; i < 1500; i++) {
  const up = await page.evaluate(() =>
    /RENDERING CODE CITY/i.test(document.body.innerText || ''),
  )
  if (up) sawVeil = true
  if (sawVeil && !up) break
  await page.waitForTimeout(250)
}
console.log(`veil: seen=${sawVeil} dropped at ${Date.now() - t0}ms`)
await page.waitForTimeout(4000)
const state = await page.evaluate(() => {
  const w = window
  return {
    pos: w.__alphaPlayer?.pos() ?? null,
    notchHint: sessionStorage.getItem('alphacode.gfx.notch'),
  }
})
console.log('state', JSON.stringify(state))
await page.screenshot({ path: out, timeout: 30_000 }).catch(() => {})
console.log('DIAG DONE', out)
await browser.close()
