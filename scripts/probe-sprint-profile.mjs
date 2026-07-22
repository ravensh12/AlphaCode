// CPU-profile an 8s sprint through the overworld and print the hottest
// functions by self time (CDP Profiler), to attribute movement hitches.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-sprint-profile.mjs
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
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
await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
let sawVeil = false
for (let i = 0; i < 600; i++) {
  const up = await page.evaluate(() =>
    /RENDERING CODE CITY/i.test(document.body.innerText || ''),
  )
  if (up) sawVeil = true
  if (sawVeil && !up) break
  await page.waitForTimeout(200)
}
await page.waitForTimeout(1000)
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 800, y: 450 }, force: true, noWaitAfter: true })
  .catch(() => {})

const cdp = await page.context().newCDPSession(page)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.keyboard.down('Shift')
await page.keyboard.down('w')
await page.waitForTimeout(8000)
await page.keyboard.up('w')
await page.keyboard.up('Shift')
const { profile } = await cdp.send('Profiler.stop')

// Aggregate self time per function.
const hitById = new Map()
for (const node of profile.nodes) hitById.set(node.id, { node, self: 0 })
const dt = profile.timeDeltas ?? []
const samples = profile.samples ?? []
for (let i = 0; i < samples.length; i++) {
  const rec = hitById.get(samples[i])
  if (rec) rec.self += dt[i] ?? 0
}
const rows = [...hitById.values()]
  .filter((r) => r.self > 0)
  .sort((a, b) => b.self - a.self)
  .slice(0, 40)
  .map((r) => {
    const f = r.node.callFrame
    const url = (f.url || '').split('/').slice(-1)[0]
    return `${(r.self / 1000).toFixed(1).padStart(8)}ms  ${f.functionName || '(anon)'}  [${url}:${f.lineNumber}]`
  })
console.log(rows.join('\n'))
await browser.close()
