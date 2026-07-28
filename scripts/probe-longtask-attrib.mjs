// LONG-TASK ATTRIBUTION — traversal's remaining hitches are 200-600ms long
// tasks, not steady cost. An aggregate CPU profile hides them: they are a
// fraction of a percent of total samples but they are the entire felt problem.
//
// This probe records longtask entries and a V8 CPU profile over the same
// window, then tallies self time ONLY from samples that fall inside a long
// task. What comes out is "the stalls are made of X", which is the thing worth
// fixing.
//
// Clock alignment: PerformanceObserver reports performance.now() ms, the
// profiler reports microseconds on its own monotonic epoch. Both are sampled
// at profile start and the offset is applied — a few ms of skew is irrelevant
// against 200ms+ tasks.
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-longtask-attrib.mjs [--base=http://127.0.0.1:4173]
//     [--secs=45] [--params=qa_notch=0] [--path=/quest?nohorde]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://127.0.0.1:4173')
const secs = Number(arg('secs', '45'))
const params = arg('params', 'qa_notch=0')
const path = arg('path', '/quest?nohorde')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
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
  window.__longTasks = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__longTasks.push({ start: e.startTime, dur: e.duration })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* unsupported */
  }
})

const sep = path.includes('?') ? '&' : '?'
await page.goto(`${base}${path}${params ? sep + params : ''}`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, {
  timeout: 180_000,
})
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
  .catch(() => {})
await page.waitForTimeout(2000)

const client = await page.context().newCDPSession(page)
await client.send('Profiler.enable')
await client.send('Profiler.setSamplingInterval', { interval: 250 })
const markStart = await page.evaluate(() => {
  window.__longTasks.length = 0
  return performance.now()
})
await client.send('Profiler.start')

await page.keyboard.down('w')
const steer = setInterval(() => {
  page.keyboard.down('ArrowLeft').catch(() => {})
  setTimeout(() => page.keyboard.up('ArrowLeft').catch(() => {}), 500)
}, 6000)
await page.waitForTimeout(secs * 1000)
clearInterval(steer)
const { profile } = await client.send('Profiler.stop')
await page.keyboard.up('w').catch(() => {})
const longTasks = await page.evaluate(() => window.__longTasks)

// ---- attribute samples to long-task windows -------------------------------
const byId = new Map()
for (const node of profile.nodes) byId.set(node.id, node)
const label = (n) => {
  const cf = n.callFrame
  const name = cf.functionName || '(anonymous)'
  const url = (cf.url || '').split('/').slice(-1)[0]
  return url ? `${name} @ ${url}:${cf.lineNumber + 1}` : name
}
// profile.startTime (us) corresponds to markStart (ms on performance.now()).
const usPerMs = 1000
const toProfileUs = (nowMs) => profile.startTime + (nowMs - markStart) * usPerMs

const windows = longTasks
  .filter((t) => t.dur >= 50)
  .map((t) => ({ from: toProfileUs(t.start), to: toProfileUs(t.start + t.dur), dur: t.dur }))

let t = profile.startTime
const inside = new Map()
const outside = new Map()
let insideSamples = 0
let outsideSamples = 0
let wi = 0
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i] ?? 0
  const node = byId.get(profile.samples[i])
  if (!node) continue
  while (wi < windows.length && windows[wi].to < t) wi++
  const hit = wi < windows.length && t >= windows[wi].from && t <= windows[wi].to
  const key = label(node)
  if (hit) {
    inside.set(key, (inside.get(key) ?? 0) + 1)
    insideSamples++
  } else {
    outside.set(key, (outside.get(key) ?? 0) + 1)
    outsideSamples++
  }
}

const durMs = (profile.endTime - profile.startTime) / 1000
const totalStallMs = longTasks.reduce((a, b) => a + b.dur, 0)
console.log(`profile: ${durMs.toFixed(0)}ms wall`)
console.log(
  `long tasks: ${longTasks.length} (>=50ms: ${windows.length}), ` +
    `total stalled ${totalStallMs.toFixed(0)}ms, worst ${Math.max(0, ...longTasks.map((l) => l.dur)).toFixed(0)}ms`,
)
console.log(`samples inside long tasks: ${insideSamples} / ${insideSamples + outsideSamples}`)

const show = (map, total, title) => {
  console.log(`\n${title}`)
  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)
  for (const [name, hits] of top) {
    const pct = ((hits / Math.max(1, total)) * 100).toFixed(1)
    if (Number(pct) < 0.8) continue
    console.log(`  ${pct.padStart(5)}%  ${name}`)
  }
}
show(inside, insideSamples, 'SELF TIME *INSIDE* LONG TASKS (this is the hitch):')
show(outside, outsideSamples, 'SELF TIME OUTSIDE LONG TASKS (steady-state cost):')

// A leaf name like "getContext" says nothing about WHO called it. Re-walk the
// inside-window samples and group them by their call stack so the app-code
// frame responsible for the stall is named.
const parentOf = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id)
const stackOf = (id, depth = 7) => {
  const out = []
  let cur = id
  let guard = 0
  while (cur != null && guard++ < depth) {
    const n = byId.get(cur)
    if (!n) break
    out.push(label(n))
    cur = parentOf.get(cur)
  }
  return out.reverse().join(' → ')
}
const insideStacks = new Map()
t = profile.startTime
wi = 0
for (let i = 0; i < profile.samples.length; i++) {
  t += profile.timeDeltas[i] ?? 0
  while (wi < windows.length && windows[wi].to < t) wi++
  if (!(wi < windows.length && t >= windows[wi].from && t <= windows[wi].to)) continue
  const key = stackOf(profile.samples[i])
  insideStacks.set(key, (insideStacks.get(key) ?? 0) + 1)
}
console.log('\nTOP STACKS INSIDE LONG TASKS (caller chain, outermost first):')
for (const [stack, hits] of [...insideStacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  const pct = ((hits / Math.max(1, insideSamples)) * 100).toFixed(1)
  if (Number(pct) < 1) continue
  console.log(`  ${pct.padStart(5)}%  ${stack}`)
}

console.log('\nLONG TASK TIMELINE (ms since capture start):')
for (const l of longTasks.filter((x) => x.dur >= 50).slice(0, 40)) {
  console.log(`  +${(l.start - markStart).toFixed(0).padStart(6)}ms  ${l.dur.toFixed(0)}ms`)
}
await browser.close()
