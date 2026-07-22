// NIGHT-CITY QA PROBE — boots /quest as a guest and produces everything the
// graphics review loop needs in one run:
//   1. veil timing: ms from navigation to the boot veil dropping (and whether
//      it ever re-raises afterwards — it must not),
//   2. pop-in burst: screenshots at +0 / +0.8 / +1.6 / +3.2s after veil drop
//      (static geometry arriving late shows up as diffs between these),
//   3. frame pacing: rAF deltas sampled during a scripted sprint through
//      several blocks (p50/p95/p99/max + counts of >55ms and >100ms frames),
//   4. staged shots: street level after the sprint, a rooftop 3/4 angle and
//      a high skyline angle via a per-frame camera override.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-night-qa.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/night-qa'
mkdirSync(outDir, { recursive: true })
const base = 'http://localhost:5173'

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
// Never leave a headless chromium tree running after a fatal error — stray
// GPU processes pile up across runs and starve the whole machine.
for (const sig of ['uncaughtException', 'unhandledRejection']) {
  process.on(sig, async (e) => {
    console.log('FATAL', String(e).slice(0, 300))
    try {
      await browser.close()
    } catch {
      /* already gone */
    }
    process.exit(1)
  })
}
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
// Screenshot with a bounded timeout + CDP fallback: page.screenshot() waits
// for a "stable" compositor frame, which intermittently stalls forever on
// the GPU-headless channel; the CDP capture grabs the last presented frame.
// Never fatal — a missed shot logs and the run continues.
const cdp = await page.context().newCDPSession(page)
const shoot = async (path) => {
  try {
    await page.screenshot({ path, timeout: 20_000 })
    return
  } catch {
    /* fall through to CDP */
  }
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(path, Buffer.from(data, 'base64'))
  } catch (e) {
    console.log(`[shot failed] ${path}: ${String(e).slice(0, 120)}`)
  }
}
const errors = []
page.on('pageerror', (e) => {
  errors.push(String(e))
  console.log('[pageerror]', String(e).slice(0, 300))
})
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
  // Camera tap + optional per-frame override (for staged rooftop shots).
  const hook = new EventTarget()
  hook.addEventListener('observe', (ev) => {
    const r = ev.detail
    if (!r || typeof r.render !== 'function' || r.__wrapped) return
    r.__wrapped = true
    const orig = r.render.bind(r)
    r.render = (scene, camera) => {
      if (camera && camera.isPerspectiveCamera && camera.fov > 1) {
        window.__cam = camera
        const o = window.__camOverride
        if (o) {
          camera.position.set(o.px, o.py, o.pz)
          camera.lookAt(o.lx, o.ly, o.lz)
        }
      }
      return orig(scene, camera)
    }
  })
  window.__THREE_DEVTOOLS__ = hook
})

const navAt = Date.now()
await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })

// --- 1. veil timing ---------------------------------------------------------
const veilUp = () =>
  page.evaluate(() => /RENDERING CODE CITY/i.test(document.body.innerText || ''))
let sawVeil = false
let veilDownAt = 0
for (let i = 0; i < 600; i++) {
  const up = await veilUp()
  if (up) sawVeil = true
  if (sawVeil && !up) {
    veilDownAt = Date.now()
    break
  }
  await page.waitForTimeout(200)
}
if (!veilDownAt) {
  console.log(JSON.stringify({ fail: 'veil never dropped (or never rose) within 120s' }))
  await browser.close()
  process.exit(1)
}
const veilMs = veilDownAt - navAt
console.log(`veil dropped ${veilMs}ms after navigation`)

// --- 2. pop-in burst (veil must also never re-raise) -------------------------
// Warm the compositor a few rAFs first — the GPU-headless channel sometimes
// stalls page.screenshot right after boot (same guard as probe-world-shot).
await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0
      const tick = () => (++n >= 8 ? res(null) : requestAnimationFrame(tick))
      requestAnimationFrame(tick)
    }),
)
let reRaised = false
await shoot(`${outDir}/pop-00-at-drop.png`)
for (const [name, wait] of [
  ['pop-01-plus800ms', 800],
  ['pop-02-plus1600ms', 800],
  ['pop-03-plus3200ms', 1600],
]) {
  await page.waitForTimeout(wait)
  if (await veilUp()) reRaised = true
  await shoot(`${outDir}/${name}.png`)
}
console.log(`veil re-raised after drop: ${reRaised}`)

// --- 3. staged rooftop / skyline angles ---------------------------------------
// Taken right after the burst — the spawn horde needs ~15s to reach the
// idle hero, so this is the safe window for clean scenery shots. The camera
// override runs per frame inside the render tap, so gameplay doesn't move it.
const cam0 = await page.evaluate(() => {
  const c = window.__cam
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const stage = async (name, o) => {
  await page.evaluate((ov) => {
    window.__camOverride = ov
  }, o)
  await page.waitForTimeout(700)
  await shoot(`${outDir}/${name}.png`)
}
await stage('angle-rooftop', {
  px: cam0.x + 26,
  py: 42,
  pz: cam0.z + 26,
  lx: cam0.x,
  ly: 4,
  lz: cam0.z,
})
await stage('angle-skyline', {
  px: cam0.x + 10,
  py: 110,
  pz: cam0.z + 120,
  lx: cam0.x,
  ly: 20,
  lz: cam0.z - 80,
})
await stage('angle-street-low', {
  px: cam0.x + 6,
  py: 1.6,
  pz: cam0.z + 10,
  lx: cam0.x,
  ly: 3,
  lz: cam0.z - 30,
})
await page.evaluate(() => {
  window.__camOverride = null
})

// --- 4. frame pacing during a scripted sprint --------------------------------
// Focus with a keyboard press, NOT a click: a click can land on an overlay
// button (death → "Study to revive" navigated a previous run to the lesson).
await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(200)

const samplePacing = (ms) =>
  page.evaluate(
    (dur) =>
      new Promise((res) => {
        const deltas = []
        let last = performance.now()
        const t0 = last
        const tick = () => {
          const now = performance.now()
          deltas.push(now - last)
          last = now
          if (now - t0 >= dur) res(deltas)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )

// Sprint pattern: forward 5s, quarter-turn, forward 4s — crosses ring
// boundaries and fresh cells, which is exactly where late uploads hitch.
await page.keyboard.down('Shift')
await page.keyboard.down('w')
const pacingA = samplePacing(5000)
const a = await pacingA
await page.keyboard.down('d')
await page.waitForTimeout(420)
await page.keyboard.up('d')
const pacingB = samplePacing(4000)
const b = await pacingB
await page.keyboard.up('w')
await page.keyboard.up('Shift')

const deltas = [...a, ...b].slice(1) // first sample is warm-up noise
deltas.sort((x, y) => x - y)
const pct = (p) => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * p))]
const pacing = {
  frames: deltas.length,
  p50: +pct(0.5).toFixed(1),
  p95: +pct(0.95).toFixed(1),
  p99: +pct(0.99).toFixed(1),
  max: +deltas[deltas.length - 1].toFixed(1),
  over55ms: deltas.filter((d) => d > 55).length,
  over100ms: deltas.filter((d) => d > 100).length,
}
console.log('frame pacing during sprint:', JSON.stringify(pacing))
await shoot(`${outDir}/street-after-sprint.png`)

const summary = { veilMs, reRaised, pacing, pageErrors: errors.length }
console.log('SUMMARY', JSON.stringify(summary))
await browser.close()
// Pass/fail gates: veil must not re-raise; sprint must hold 60fps-feel.
// (Headless-GL dev-server numbers: p50 ~16.7ms is locked 60fps; the adaptive
// resolution governor and rare lazy compiles own the residual single spikes.)
const pass = !reRaised && errors.length === 0 && pacing.over100ms <= 3 && pacing.p95 <= 45
console.log(pass ? 'NIGHT-QA PASS' : 'NIGHT-QA FAIL')
process.exit(pass ? 0 : 1)
