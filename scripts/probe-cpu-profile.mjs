// CPU profiler for the overworld combat loop. Boots /quest, engages the horde,
// records a V8 CPU profile via CDP for ~10s, then prints the top self-time
// functions (where the main thread actually spends its time) and top total.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-cpu-profile.mjs [--base=http://localhost:5173] [--path=/quest] [--secs=10]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:5173')
const path = arg('path', '/quest')
const secs = Number(arg('secs', '10'))

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

await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, { timeout: 90_000 })
await page.waitForTimeout(2500)
await page.locator('canvas').first().click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true }).catch(() => {})

await page.keyboard.down('f')
await page.keyboard.down('a')
await page.waitForTimeout(4000)

const client = await page.context().newCDPSession(page)
await client.send('Profiler.enable')
await client.send('Profiler.setSamplingInterval', { interval: 200 }) // 200us
await client.send('Profiler.start')
await page.waitForTimeout(secs * 1000)
// keep moving mid-profile
await page.keyboard.up('a')
await page.keyboard.down('d')
await page.waitForTimeout(1000)
const { profile } = await client.send('Profiler.stop')
await page.keyboard.up('d').catch(() => {})
await page.keyboard.up('f').catch(() => {})

// Aggregate self time by function (nodeId -> hitCount) and by function name.
const byId = new Map()
for (const node of profile.nodes) byId.set(node.id, node)
const selfByFn = new Map()
const label = (n) => {
  const cf = n.callFrame
  const name = cf.functionName || '(anonymous)'
  const url = (cf.url || '').split('/').slice(-1)[0]
  return url ? `${name} @ ${url}:${cf.lineNumber + 1}` : name
}
let totalSamples = 0
for (const node of profile.nodes) {
  const hits = node.hitCount || 0
  totalSamples += hits
  const key = label(node)
  selfByFn.set(key, (selfByFn.get(key) || 0) + hits)
}
const dur = (profile.endTime - profile.startTime) / 1000 // ms
const top = [...selfByFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
console.log(`profile: ${dur.toFixed(0)}ms wall, ${totalSamples} samples`)
console.log('TOP SELF-TIME FUNCTIONS (self% of samples):')
for (const [name, hits] of top) {
  const pct = ((hits / totalSamples) * 100).toFixed(1)
  if (Number(pct) < 0.5) continue
  console.log(`  ${pct.padStart(5)}%  ${name}`)
}

// Build child->parent so we can attribute jsxDEV to its app-code callers.
const parentOf = new Map()
for (const n of profile.nodes) for (const c of n.children || []) parentOf.set(c, n.id)
const isAppFrame = (n) => {
  const u = n.callFrame.url || ''
  return /Overworld3DPage|\/pages\/|\/components\/|\/game3d\//.test(u) && !/node_modules/.test(u)
}
const callerTally = new Map()
for (const n of profile.nodes) {
  const name = n.callFrame.functionName || ''
  if (!/jsxDEV|jsxDEVImpl|jsx|createElement/.test(name)) continue
  const hits = n.hitCount || 0
  if (!hits) continue
  // Walk up to the nearest app-code ancestor.
  let pid = parentOf.get(n.id)
  let guard = 0
  while (pid != null && guard++ < 40) {
    const p = byId.get(pid)
    if (p && isAppFrame(p)) {
      callerTally.set(label(p), (callerTally.get(label(p)) || 0) + hits)
      break
    }
    pid = parentOf.get(pid)
  }
}
const topCallers = [...callerTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
console.log('\nTOP APP-CODE CALLERS OF jsx/createElement (by descendant jsx self-time):')
for (const [name, hits] of topCallers) {
  const pct = ((hits / totalSamples) * 100).toFixed(1)
  if (Number(pct) < 0.3) continue
  console.log(`  ${pct.padStart(5)}%  ${name}`)
}
await browser.close()
