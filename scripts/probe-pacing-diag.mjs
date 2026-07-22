// Diagnostic: idle vs sprint frame pacing + long-task timing correlation.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-pacing-diag.mjs
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
  window.__longTasks = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__longTasks.push({ t: e.startTime, d: e.duration })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {}
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

const sample = (ms) =>
  page.evaluate(
    (dur) =>
      new Promise((res) => {
        const spikes = []
        const deltas = []
        let last = performance.now()
        const t0 = last
        const tick = () => {
          const now = performance.now()
          const d = now - last
          deltas.push(d)
          if (d > 55) spikes.push({ at: +(now - t0).toFixed(0), d: +d.toFixed(1) })
          last = now
          if (now - t0 >= dur) res({ deltas, spikes })
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )

const stats = (deltas) => {
  const s = [...deltas].sort((a, b) => a - b)
  const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return {
    n: s.length,
    p50: +pct(0.5).toFixed(1),
    p95: +pct(0.95).toFixed(1),
    p99: +pct(0.99).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    over55: s.filter((d) => d > 55).length,
    over100: s.filter((d) => d > 100).length,
  }
}

// idle 8s
const idle = await sample(8000)
console.log('IDLE  ', JSON.stringify(stats(idle.deltas)), 'spikes:', JSON.stringify(idle.spikes))

// sprint 8s straight
await page.keyboard.down('Shift')
await page.keyboard.down('w')
const sprint = await sample(8000)
await page.keyboard.up('w')
await page.keyboard.up('Shift')
console.log('SPRINT', JSON.stringify(stats(sprint.deltas)), 'spikes:', JSON.stringify(sprint.spikes))

// second sprint (different streets)
await page.keyboard.down('a')
await page.waitForTimeout(500)
await page.keyboard.up('a')
await page.keyboard.down('Shift')
await page.keyboard.down('w')
const sprint2 = await sample(8000)
await page.keyboard.up('w')
await page.keyboard.up('Shift')
console.log('SPRIN2', JSON.stringify(stats(sprint2.deltas)), 'spikes:', JSON.stringify(sprint2.spikes))

const longTasks = await page.evaluate(() => window.__longTasks.slice(-40))
console.log('LONGTASKS', JSON.stringify(longTasks))
await browser.close()
