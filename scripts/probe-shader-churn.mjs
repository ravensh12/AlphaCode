// SHADER CHURN — which programs get compiled AFTER the boot veil drops?
// Every first-encounter program link is a synchronous driver stall on the
// frame that needs it (three calls getProgramInfoLog right after linking), so
// a program compiled during traversal is a visible hitch. Snapshots
// renderer.info.programs before and after a traversal window and diffs them by
// material type + name, so the warmup pass knows exactly what to precompile.
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-shader-churn.mjs [--base=http://localhost:4173]
//     [--scenario=traversal|combat] [--secs=30]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:4173')
const scenario = arg('scenario', 'traversal')
const secs = Number(arg('secs', '30'))

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
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
})

const path = scenario === 'traversal' ? '/quest?nohorde' : '/quest'
await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(
  () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
  undefined,
  { timeout: 120_000 },
)
await page.waitForTimeout(4000)
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
  .catch(() => {})

const snapshot = () =>
  page.evaluate(() => {
    const gl = window.__alphaGl
    if (!gl || !gl.info.programs) return []
    return gl.info.programs.map((p) => `${p.type ?? '?'} | ${p.name ?? ''} | ${String(p.cacheKey ?? '').slice(0, 60)}`)
  })

const before = await snapshot()

if (scenario === 'traversal') {
  await page.keyboard.down('w')
  var steer = setInterval(() => {
    page.keyboard.down('ArrowLeft').catch(() => {})
    setTimeout(() => page.keyboard.up('ArrowLeft').catch(() => {}), 500)
  }, 5000)
} else {
  await page.keyboard.down('f')
  await page.keyboard.down('a')
}
await page.waitForTimeout(secs * 1000)
if (typeof steer !== 'undefined') clearInterval(steer)
for (const k of ['w', 'f', 'a']) await page.keyboard.up(k).catch(() => {})

const after = await snapshot()
const beforeSet = new Map()
for (const p of before) beforeSet.set(p, (beforeSet.get(p) ?? 0) + 1)
const added = []
for (const p of after) {
  const n = beforeSet.get(p) ?? 0
  if (n > 0) beforeSet.set(p, n - 1)
  else added.push(p)
}
const afterSet = new Map()
for (const p of after) afterSet.set(p, (afterSet.get(p) ?? 0) + 1)
const removed = []
for (const p of before) {
  const n = afterSet.get(p) ?? 0
  if (n > 0) afterSet.set(p, n - 1)
  else removed.push(p)
}

console.log(`SHADER CHURN — ${scenario}: ${before.length} programs at veil-drop -> ${after.length} after ${secs}s`)
console.log(`ADDED (${added.length}) — each of these was a mid-gameplay compile stall:`)
for (const p of added) console.log('  +', p)
console.log(`REMOVED (${removed.length}) — disposed, and recompiled if the material returns:`)
for (const p of removed) console.log('  -', p)
await browser.close()
