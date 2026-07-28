// PRODUCTION smoothness harness — the one probe that produces the numbers the
// owner reads. Points at a `vite preview` build (dev's jsxDEV overhead is
// 3-5x prod and distorts every frame-time figure), drives one of three
// gameplay scenarios, and reports the distribution that matches "feels laggy":
//
//   p50 / p95 / p99 / max, plus counts of frames over 33 / 50 / 100 ms,
//   the full jank timeline, and renderer.info (draw calls, triangles, shader
//   program count) sampled once a second so compile stalls and draw-call
//   spikes line up against the jank timestamps.
//
// The renderer handle + `?nohorde` + `?qafight` seams only exist in a build
// made with VITE_QA_SEAMS=1 (see src/lib/qaSeams.ts) — a shipped bundle
// strips them. Build and serve with:
//   VITE_QA_SEAMS=1 npx vite build --outDir dist-qa
//   npx vite preview --outDir dist-qa --port 4173 --strictPort
//
// Usage:
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-smoothness.mjs --scenario=traversal \
//       [--base=http://localhost:4173] [--secs=25] [--runs=1] [--tag=before]
//
// Scenarios: traversal (base city, no horde) | combat (overworld horde fight)
//            | boss (BossArena via /battle/:world?qafight)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:4173')
const scenario = arg('scenario', 'traversal')
const secs = Number(arg('secs', '25'))
const runs = Number(arg('runs', '1'))
const tag = arg('tag', null)
// Must be a real world id from src/content/adventure.ts — an unknown id makes
// BossBattlePage redirect to /quest, and the probe then measures the overworld
// while labelling the numbers "boss".
const world = arg('world', 'arrays-and-loops')
const outDir = arg('out', 'logs/smoothness')

const GUEST_PROGRESS = {
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
}

/** Sample rAF deltas + renderer.info in the page for `durMs`. */
function samplerBody(durMs) {
  return new Promise((resolve) => {
    const deltas = []
    const janks = []
    const info = []
    const gl = window.__alphaGl
    let last = performance.now()
    const t0 = last
    let nextInfo = 0
    const tick = (now) => {
      const dt = now - last
      last = now
      const t = now - t0
      deltas.push(dt)
      if (dt > 33) janks.push({ t: +(t / 1000).toFixed(2), dt: +dt.toFixed(1) })
      if (gl && gl.info && t >= nextInfo) {
        nextInfo += 1000
        info.push({
          t: +(t / 1000).toFixed(1),
          calls: gl.info.render.calls,
          tris: gl.info.render.triangles,
          programs: gl.info.programs ? gl.info.programs.length : -1,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
        })
      }
      if (t < durMs) requestAnimationFrame(tick)
      else {
        const sorted = deltas.slice().sort((a, b) => a - b)
        const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(1)
        let notch = null
        try {
          notch = sessionStorage.getItem('alphacode.gfx.notch')
        } catch {
          /* storage blocked */
        }
        resolve({
          frames: deltas.length,
          seconds: +((performance.now() - t0) / 1000).toFixed(1),
          fps: +(deltas.length / ((performance.now() - t0) / 1000)).toFixed(1),
          p50: q(0.5),
          p95: q(0.95),
          p99: q(0.99),
          max: +sorted[sorted.length - 1].toFixed(1),
          over33: deltas.filter((d) => d > 33).length,
          over50: deltas.filter((d) => d > 50).length,
          over100: deltas.filter((d) => d > 100).length,
          notch,
          renders: window.__owRenders ?? null,
          janks,
          info,
        })
      }
    }
    requestAnimationFrame(tick)
  })
}

async function bootOverworld(page, path) {
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
  // Past the boot veil + the governor's 5s warmup window before sampling.
  await page.waitForTimeout(6000)
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
    .catch(() => {})
}

async function runOnce(index) {
  const browser = await chromium.launch({
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('[gfx-governor]')) console.log('CONSOLE:', t)
  })
  await page.addInitScript(
    ({ progress }) => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem('alphacode.guest', 'true')
      localStorage.setItem('alphacode.progress.guest', JSON.stringify(progress))
      sessionStorage.setItem('alphacode.quest.introSeen', '1')
    },
    { progress: GUEST_PROGRESS },
  )

  let held = []
  let steer = null
  if (scenario === 'traversal') {
    await bootOverworld(page, '/quest?nohorde')
    // Walk a long route, steering every 6s so the district streamer keeps
    // paging content in — traversal jank is a streaming + shadow-box story.
    await page.keyboard.down('w')
    held = ['w']
    steer = setInterval(() => {
      page.keyboard.down('ArrowLeft').catch(() => {})
      setTimeout(() => page.keyboard.up('ArrowLeft').catch(() => {}), 500)
    }, 6000)
  } else if (scenario === 'combat') {
    await bootOverworld(page, '/quest')
    await page.keyboard.down('f')
    await page.keyboard.down('a')
    await page.waitForTimeout(5000)
    await page.keyboard.up('a')
    await page.keyboard.down('d')
    held = ['f', 'd']
  } else if (scenario === 'boss') {
    await page.goto(`${base}/battle/${world}?qafight`, { waitUntil: 'domcontentloaded' })
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
    // A bad world id redirects to /quest, and the run silently becomes an
    // overworld capture wearing a "boss" label. Fail loudly instead.
    if (!/\/battle\//.test(page.url())) {
      throw new Error(`boss scenario left /battle (world "${world}" rejected) — now at ${page.url()}`)
    }
    // Curtain + entrance + first-encounter shader compiles.
    await page.waitForTimeout(9000)
    await page
      .locator('canvas')
      .first()
      .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
      .catch(() => {})
    await page.keyboard.down('f')
    await page.keyboard.down('a')
    held = ['f', 'a']
  } else {
    throw new Error(`unknown scenario: ${scenario}`)
  }

  const stats = await page.evaluate(samplerBody, secs * 1000)
  if (steer) clearInterval(steer)
  for (const k of held) await page.keyboard.up(k).catch(() => {})
  await browser.close()
  return { run: index, ...stats }
}

const results = []
for (let i = 0; i < runs; i++) results.push(await runOnce(i))

const brief = results.map((r) => ({
  run: r.run,
  frames: r.frames,
  fps: r.fps,
  p50: r.p50,
  p95: r.p95,
  p99: r.p99,
  max: r.max,
  over33: r.over33,
  over50: r.over50,
  over100: r.over100,
  notch: r.notch,
  renders: r.renders,
}))
console.log(`SCENARIO ${scenario}${tag ? ` [${tag}]` : ''} @ ${base} (${secs}s x ${runs})`)
for (const b of brief) console.log('  ', JSON.stringify(b))
const last = results[results.length - 1]
console.log('GL INFO (per ~1s):', JSON.stringify(last.info))
console.log('JANK TIMELINE:', JSON.stringify(last.janks))

if (tag) {
  mkdirSync(outDir, { recursive: true })
  const file = `${outDir}/${scenario}-${tag}.json`
  writeFileSync(file, JSON.stringify({ scenario, tag, base, secs, results }, null, 2))
  console.log('wrote', file)
}
