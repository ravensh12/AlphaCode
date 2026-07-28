// FRAME BUDGET ATTRIBUTION — is a janky frame the main thread's fault or the
// GPU's? Patches requestAnimationFrame before any app code runs so every rAF
// callback's wall time is accumulated per frame (all callbacks scheduled for
// the same frame share one rAF timestamp), watches long tasks, and reports the
// JS-time distribution NEXT TO the frame-delta distribution.
//
//   frame delta 33ms with 6ms of JS  -> GPU / present bound
//   frame delta 33ms with 30ms of JS -> main-thread bound
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-frame-budget.mjs [--base=http://localhost:4173]
//     [--scenario=traversal|combat] [--secs=20]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:4173')
const scenario = arg('scenario', 'traversal')
const secs = Number(arg('secs', '20'))
// Extra query string appended to the scene URL — the QA graphics overrides
// (`qa_notch`, `qa_post`, `qa_bloomlevels`, `qa_shadows`; see src/lib/qaGfx.ts)
// that make A/B attribution runs comparable. e.g. --params=qa_notch=0&qa_post=off
const params = arg('params', '')
// `--vsync=off` unlocks the presentation cadence. WITH vsync the frame delta is
// quantised to the display interval, and on this machine the headless window
// presents at 30Hz — every capture reads p50 33.2ms no matter how cheap or
// expensive the scene is, which hides every A/B signal in the quantisation.
// Unlocked, the delta becomes what a frame actually COSTS (CPU submit + GPU
// draw + present), which is the only number that can attribute a saving to a
// subsystem. Jank counts, on the other hand, only mean something at the real
// cadence, so leave vsync ON for those captures.
const vsyncOff = arg('vsync', 'on') === 'off'

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    ...(vsyncOff ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
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

  // --- rAF instrumentation (must wrap before the app grabs a reference) ---
  const raf = window.requestAnimationFrame.bind(window)
  const perFrame = new Map() // rAF timestamp -> accumulated JS ms
  window.__frameJs = perFrame
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const s = performance.now()
      try {
        cb(t)
      } finally {
        perFrame.set(t, (perFrame.get(t) || 0) + (performance.now() - s))
        // Bound the map: only the recent window is ever read.
        if (perFrame.size > 4000) {
          const first = perFrame.keys().next().value
          perFrame.delete(first)
        }
      }
    })

  const longTasks = []
  window.__longTasks = longTasks
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    /* not supported */
  }
})

async function boot(path) {
  const url = params ? `${base}${path}${path.includes('?') ? '&' : '?'}${params}` : `${base}${path}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })
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
  await page.waitForTimeout(6000)
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
    .catch(() => {})
  await settle()
}

/**
 * Wait until the scene stops growing. The boot veil can drop while the Meshy
 * preloader is still streaming (the waiver is stall-based, not clock-based),
 * so two captures taken "6s after the veil" can contain materially different
 * cities — which swamps any A/B signal. Program + geometry counts holding
 * steady for several seconds means the scene under measurement is the same one
 * every run.
 */
async function settle(maxMs = 60_000) {
  const read = () =>
    page.evaluate(() => {
      const gl = window.__alphaGl
      if (!gl) return null
      return `${gl.info.programs ? gl.info.programs.length : 0}/${gl.info.memory.geometries}/${gl.info.memory.textures}`
    })
  let prev = null
  let stableFor = 0
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(1000)
    const now = await read()
    if (now == null) return
    stableFor = now === prev ? stableFor + 1 : 0
    prev = now
    if (stableFor >= 4) break
  }
  console.log(`  [settled after ${((Date.now() - t0) / 1000).toFixed(0)}s at ${prev}]`)
}

let steer = null
if (scenario === 'traversal') {
  await boot('/quest?nohorde')
  await page.keyboard.down('w')
  steer = setInterval(() => {
    page.keyboard.down('ArrowLeft').catch(() => {})
    setTimeout(() => page.keyboard.up('ArrowLeft').catch(() => {}), 500)
  }, 6000)
} else {
  await boot('/quest')
  await page.keyboard.down('f')
  await page.keyboard.down('a')
  await page.waitForTimeout(5000)
}

// Split the JS budget further: time spent inside WebGLRenderer.render (three's
// own scene graph walk + shadow passes + GL submission) vs everything else the
// app does in useFrame / React. Needs the QA renderer handle.
await page.evaluate(() => {
  const gl = window.__alphaGl
  if (!gl || gl.__split) return
  gl.__split = true
  window.__renderMs = 0
  window.__renderCalls = 0
  // renderer.info resets on every render() — with an 18-pass chain the values
  // read from a rAF callback describe the last fullscreen quad, not the frame.
  gl.info.autoReset = false
  // One frame's worth of pass identities: postprocessing drives every pass
  // through renderer.render(quadScene, quadCamera), so the fullscreen
  // material's type names the pass and the bound render target gives its size.
  // On a tile-based GPU each of these is a separate render pass with its own
  // store/load of a full-screen attachment, so the LIST is the cost model.
  window.__passDump = null
  let dumping = null
  window.__frameDraws = []
  let frameCalls = 0
  const orig = gl.render.bind(gl)
  gl.render = (scene, camera) => {
    if (window.__dumpPasses) {
      if (dumping == null) dumping = []
      const rt = gl.getRenderTarget()
      const child = scene && scene.children ? scene.children[0] : null
      const mat = child && child.material
      dumping.push({
        mat: mat ? mat.type || mat.constructor.name : scene ? scene.type : '?',
        rt: rt ? `${rt.width}x${rt.height}${rt.samples ? ` msaa${rt.samples}` : ''}` : 'screen',
        objs: scene && scene.children ? scene.children.length : 0,
      })
    }
    const t = performance.now()
    // Draw calls are counted HERE, per pass, and a frame is closed when a pass
    // targets the DEFAULT framebuffer — the composer's one output-to-screen
    // pass, so exactly one per presented frame.
    //
    // Sampling renderer.info from a separate rAF instead (the obvious way, and
    // what this probe used to do) lies badly: when the sampling callback is
    // starved, several frames of passes land in one bucket and the probe
    // reports a 14,000-draw "spike" that no frame ever issued. Timing-based
    // frame boundaries lie the other way — with vsync off, consecutive frames
    // run back to back and merge. Only the structure of the pass chain is
    // trustworthy.
    const toScreen = gl.getRenderTarget() == null
    const callsBefore = gl.info.render.calls
    orig(scene, camera)
    frameCalls += gl.info.render.calls - callsBefore
    if (toScreen) {
      window.__frameDraws.push(frameCalls)
      frameCalls = 0
    }
    window.__renderMs += performance.now() - t
    window.__renderCalls += 1
  }
  window.__grabPasses = () =>
    new Promise((res) => {
      dumping = null
      window.__dumpPasses = true
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          window.__dumpPasses = false
          res(dumping ?? [])
        }),
      )
    })
})

const passDump = await page.evaluate(() => window.__grabPasses?.() ?? [])
console.log(`PASS CHAIN (${passDump.length} renderer.render calls across 2 frames):`)
for (const p of passDump) console.log(`   ${p.rt.padEnd(18)} objs=${String(p.objs).padEnd(4)} ${p.mat}`)

const out = await page.evaluate(
  (durMs) =>
    new Promise((resolve) => {
      const rows = []
      let last = performance.now()
      const t0 = last
      const ltStart = window.__longTasks.length
      const canvas = document.querySelector('canvas')
      let lastRenderMs = window.__renderMs ?? 0
      const glr = window.__alphaGl
      const glInfo = []
      const tick = (t) => {
        const now = performance.now()
        const rm = window.__renderMs ?? 0
        rows.push({ t, dt: now - last, render: rm - lastRenderMs })
        lastRenderMs = rm
        last = now
        if (glr && glr.info) {
          glInfo.push({
            calls: glr.info.render.calls,
            tris: glr.info.render.triangles,
            programs: glr.info.programs ? glr.info.programs.length : -1,
          })
          glr.info.reset()
        }
        if (now - t0 < durMs) requestAnimationFrame(tick)
        else {
          // Join the frame deltas with the JS time recorded for that frame.
          const js = window.__frameJs
          const joined = rows
            .slice(1)
            .map((r) => ({ dt: r.dt, js: js.get(r.t) ?? 0, render: r.render }))
            .filter((r) => Number.isFinite(r.dt))
          const pick = (arr, p) => {
            const s = arr.slice().sort((a, b) => a - b)
            return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1)
          }
          const dts = joined.map((r) => r.dt)
          const jss = joined.map((r) => r.js)
          const rms = joined.map((r) => r.render)
          const janky = joined.filter((r) => r.dt > 33)
          const smooth = joined.filter((r) => r.dt <= 20)
          const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0)
          resolve({
            frames: joined.length,
            dt: { p50: pick(dts, 0.5), p95: pick(dts, 0.95), p99: pick(dts, 0.99), max: pick(dts, 1) },
            js: { p50: pick(jss, 0.5), p95: pick(jss, 0.95), p99: pick(jss, 0.99), max: pick(jss, 1) },
            render: { p50: pick(rms, 0.5), p95: pick(rms, 0.95), p99: pick(rms, 0.99), max: pick(rms, 1) },
            renderCallsPerFrame: +((window.__renderCalls ?? 0) / joined.length).toFixed(2),
            drawCalls: glInfo.length
              ? {
                  p50: pick(window.__frameDraws, 0.5),
                  p95: pick(window.__frameDraws, 0.95),
                  p99: pick(window.__frameDraws, 0.99),
                  max: pick(window.__frameDraws, 1),
                  trisP50: pick(glInfo.map((g) => g.tris), 0.5),
                  programsFirst: glInfo[0].programs,
                  programsLast: glInfo[glInfo.length - 1].programs,
                  programsMax: pick(glInfo.map((g) => g.programs), 1),
                }
              : null,
            jankyFrames: janky.length,
            jsOnJankyFrames: avg(janky.map((r) => r.js)),
            jsOnSmoothFrames: avg(smooth.map((r) => r.js)),
            // A janky frame whose JS was < 12ms had nothing to block on: the
            // time went to the GPU / compositor.
            jankyButIdleJs: janky.filter((r) => r.js < 12).length,
            longTasks: window.__longTasks.slice(ltStart),
            canvas: canvas
              ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight }
              : null,
            dpr: window.devicePixelRatio,
            notch: (() => {
              try {
                return sessionStorage.getItem('alphacode.gfx.notch')
              } catch {
                return null
              }
            })(),
          })
        }
      }
      requestAnimationFrame(tick)
    }),
  secs * 1000,
)
if (steer) clearInterval(steer)
for (const k of ['w', 'f', 'a', 'd']) await page.keyboard.up(k).catch(() => {})

console.log(
  `FRAME BUDGET — ${scenario} @ ${base} ${params ? `[${params}]` : ''} vsync:${vsyncOff ? 'OFF' : 'on'}`,
)
console.log('  canvas:', JSON.stringify(out.canvas), 'dpr:', out.dpr, 'notch:', out.notch)
console.log('  frame delta ms:', JSON.stringify(out.dt))
console.log('  JS-in-rAF ms:  ', JSON.stringify(out.js))
console.log('  gl.render ms:  ', JSON.stringify(out.render), `(${out.renderCallsPerFrame} render() calls/frame)`)
console.log('  draw calls:    ', JSON.stringify(out.drawCalls))
console.log(
  `  janky frames (>33ms): ${out.jankyFrames} / ${out.frames}` +
    `  | avg JS on janky: ${out.jsOnJankyFrames}ms  | avg JS on smooth: ${out.jsOnSmoothFrames}ms` +
    `  | janky-with-idle-JS: ${out.jankyButIdleJs}`,
)
console.log('  long tasks:', JSON.stringify(out.longTasks.slice(0, 25)))
await browser.close()
