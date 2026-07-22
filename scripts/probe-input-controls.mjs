// P1 input verification: boots /quest as a guest on the DEV server and
// numerically verifies each control by sampling the live chase camera (which
// tracks the hero 1:1):
//   Space → camera y rises (jump arc)   Q → burst of ground speed (blade dash)
//   Shift → faster than plain run       C → slower than plain run
//   F → held-fire path keeps the page alive.
// All legs run inside the first ~20s after boot — an idle guest gets mauled by
// the spawn horde after that, and DEATH pauses input by design. If the hero
// dies mid-probe the whole attempt retries with a fresh page.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-input-controls.mjs [--base=http://localhost:5173]
import { chromium } from '@playwright/test'

const base =
  process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:5173'

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  ...(process.env.HEADED ? { headless: false } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})

async function attempt() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)))
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
    // Camera tap: three dispatches 'observe' with each renderer; wrap render()
    // to publish the live perspective (chase) camera every frame.
    const hook = new EventTarget()
    hook.addEventListener('observe', (ev) => {
      const r = ev.detail
      if (!r || typeof r.render !== 'function' || r.__wrapped) return
      r.__wrapped = true
      const orig = r.render.bind(r)
      r.render = (scene, camera) => {
        if (camera && camera.isPerspectiveCamera && camera.fov > 1) window.__cam = camera
        return orig(scene, camera)
      }
    })
    window.__THREE_DEVTOOLS__ = hook
  })

  await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
  const start = page.getByRole('button', { name: 'Start playing' })
  if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
  }
  await page.waitForFunction(() => !!window.__cam, undefined, { timeout: 60_000 })
  // The world is PAUSED while the boot veil ("Rendering Code City") is up.
  await page.waitForFunction(
    () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
    undefined,
    { timeout: 90_000 },
  )
  await page.waitForTimeout(1500)

  // Focus the page like a player would: click the canvas once.
  await page
    .locator('canvas')
    .first()
    .click({ position: { x: 640, y: 400 }, force: true, noWaitAfter: true })
    .catch(() => {})
  await page.waitForTimeout(300)

  // Sample the camera for `ms`: min/max y, path, and PEAK smoothed ground
  // speed (median-of-3 m/s) — peak is robust against a leg ending in a wall.
  const observe = (ms) =>
    page.evaluate(
      (dur) =>
        new Promise((res) => {
          const c = window.__cam
          const out = { minY: Infinity, maxY: -Infinity, path: 0, peak: 0 }
          let lx = c.position.x
          let lz = c.position.z
          let lt = performance.now()
          const speeds = []
          const t0 = lt
          const tick = () => {
            const now = performance.now()
            out.minY = Math.min(out.minY, c.position.y)
            out.maxY = Math.max(out.maxY, c.position.y)
            const step = Math.hypot(c.position.x - lx, c.position.z - lz)
            out.path += step
            const dt = (now - lt) / 1000
            if (dt > 0.001) speeds.push(step / dt)
            if (speeds.length >= 3) {
              const s = speeds.slice(-3).sort((a, b) => a - b)[1]
              out.peak = Math.max(out.peak, s)
            }
            lx = c.position.x
            lz = c.position.z
            lt = now
            if (now - t0 >= dur) res(out)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }),
      ms,
    )

  // Warm-up gate: the sim stays paused for a beat after the veil clears
  // (suspense mounts, shader warm). Nudge W until the camera actually moves,
  // then hand the world to the real legs. 25s of dead input = genuinely broken.
  const t0 = Date.now()
  let warm = false
  while (Date.now() - t0 < 25_000) {
    await page.keyboard.down('w')
    const probe = await observe(400)
    await page.keyboard.up('w')
    if (probe.path > 0.3) {
      warm = true
      break
    }
    await page.waitForTimeout(400)
  }
  if (!warm) {
    await page.close()
    return { warmUpFailed: true, diedDuringProbe: false }
  }
  await page.waitForTimeout(400)

  const results = {}
  const idle = await observe(500)

  // --- JUMP (Space): a quick tap AND a short hold both must clear ≥0.4m.
  const jumpAttempt = async (holdMs) => {
    const watch = observe(1100)
    await page.keyboard.down('Space')
    if (holdMs > 0) await page.waitForTimeout(holdMs)
    await page.keyboard.up('Space')
    const j = await watch
    await page.waitForTimeout(250)
    return +(j.maxY - idle.maxY).toFixed(3)
  }
  results.tapJump = await jumpAttempt(0)
  results.holdJump = await jumpAttempt(90)
  results.jumpOk = results.tapJump > 0.4 && results.holdJump > 0.4

  // --- DASH (Q): 26.4 m/s lunge for 0.32s — a standing tap must cover ground.
  const dashWatch = observe(800)
  await page.keyboard.press('q')
  const dash = await dashWatch
  results.dashPath = +dash.path.toFixed(1)
  results.dashOk = dash.path > 2.5
  await page.waitForTimeout(1000) // camera settles after the lunge

  // --- RUN vs SPRINT vs CROUCH: sustained speeds ≈ 7.04 / 13.2 / 4.22 m/s
  // (global -12% pace pass: was 8 / 15 / 4.8). Each leg settles 400ms after
  // keydown, then measures average speed over 900ms. Alternate direction
  // (W, then S) so the hero shuttles instead of hitting a wall. Ratios are
  // asserted, not absolutes — slow headless GL scales all legs down together
  // (dt clamp) — plus a CEILING per leg: a slow frame can only lower the
  // measured speed, so exceeding the tuned speed by >15% means the slowdown
  // regressed.
  const RUN_EXPECT = 7.04
  const SPRINT_EXPECT = 13.2
  const leg = async (keys) => {
    for (const k of keys) await page.keyboard.down(k)
    await page.waitForTimeout(400)
    const o = await observe(900)
    for (const k of keys) await page.keyboard.up(k)
    await page.waitForTimeout(500)
    return +(o.path / 0.9).toFixed(1)
  }
  results.runAvg = await leg(['w'])
  results.sprintAvg = await leg(['Shift', 's'])
  results.crouchAvg = await leg(['c', 's'])
  results.sprintOk =
    results.sprintAvg > results.runAvg * 1.3 &&
    results.sprintAvg <= SPRINT_EXPECT * 1.15
  results.crouchOk = results.crouchAvg > 0.5 && results.crouchAvg < results.runAvg * 0.85
  results.runCapOk = results.runAvg <= RUN_EXPECT * 1.15

  // --- FIRE (F): hold; the page must stay alive and rendering.
  await page.keyboard.down('f')
  await page.waitForTimeout(700)
  await page.keyboard.up('f')
  results.fireAlive = await page.evaluate(() => !!window.__cam)

  // Death check LAST: if the horde killed the hero mid-probe, input is paused
  // by design and this attempt's numbers are void — retry.
  results.diedDuringProbe = await page.evaluate(
    () => !!document.querySelector('.over3d-death'),
  )
  await page.close()
  return results
}

let results
for (let i = 0; i < 3; i++) {
  results = await attempt()
  if (!results.diedDuringProbe) break
  console.log(`attempt ${i + 1}: hero died mid-probe (world is live) — retrying`)
}
console.log(JSON.stringify(results, null, 2))
const pass =
  !results.diedDuringProbe &&
  results.jumpOk &&
  results.dashOk &&
  results.sprintOk &&
  results.crouchOk &&
  results.runCapOk &&
  results.fireAlive
console.log(pass ? 'ALL INPUT CHECKS PASSED' : 'INPUT CHECKS FAILED')
await browser.close()
process.exit(pass ? 0 : 1)
