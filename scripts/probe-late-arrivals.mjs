// LATE-ARRIVAL HUNT — boots /quest as a guest, then sprints a long scripted
// route (several blocks, multiple districts, multiple swap-ring crossings).
// At each waypoint the player STOPS and the probe takes a screenshot pair
// 1.6s apart plus renderer.info + program-count snapshots. Anything that
// mounts/swaps AFTER gameplay reached a spot shows up as:
//   - a solid blob in the A/B pixel diff (static geometry arriving late),
//   - a draw-call / program-count delta while stationary.
// Moving actors (horde/traffic) cause small scattered diffs — judge blobs.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-late-arrivals.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/late-arrivals'
mkdirSync(outDir, { recursive: true })
const base = 'http://localhost:5173'

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
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
  // Camera tap so we can log where each waypoint physically is.
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

await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const veilUp = () =>
  page.evaluate(() => /RENDERING CODE CITY/i.test(document.body.innerText || ''))
let sawVeil = false
for (let i = 0; i < 600; i++) {
  const up = await veilUp()
  if (up) sawVeil = true
  if (sawVeil && !up) break
  await page.waitForTimeout(200)
}
console.log('veil down; starting route')
await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0
      const tick = () => (++n >= 8 ? res(null) : requestAnimationFrame(tick))
      requestAnimationFrame(tick)
    }),
)

// renderer.info render counters auto-reset per pass — the stable signals for
// "something new arrived" are the PROGRAM count (new shader = late compile),
// GPU geometry/texture counts, and the scene's visible-mesh census.
const info = () =>
  page.evaluate(() => {
    const gl = window.__alphaGl
    const cam = window.__cam
    return {
      programs: gl ? gl.info.programs.length : -1,
      geometries: gl ? gl.info.memory.geometries : -1,
      textures: gl ? gl.info.memory.textures : -1,
      x: cam ? Math.round(cam.position.x) : 0,
      z: cam ? Math.round(cam.position.z) : 0,
      dead: !!document.querySelector('.over3d-death'),
    }
  })

await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(200)

// Route: alternating long sprints + quarter turns — crosses several street
// cells, district boundaries, and multiple ring crossings. Turns use the
// ARROW keys (a/d strafe in this controller).
const legs = [
  { turn: 0, ms: 5200 },
  { turn: 0, ms: 5200 },
  { turn: 620, ms: 5200 }, // quarter-turn right, new avenue
  { turn: 0, ms: 5200 },
  { turn: -620, ms: 5200 }, // quarter-turn left
  { turn: 0, ms: 5200 },
  { turn: 620, ms: 5200 },
  { turn: 0, ms: 5200 },
]
const results = []
for (let i = 0; i < legs.length; i++) {
  const leg = legs[i]
  if (leg.turn > 0) {
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(leg.turn)
    await page.keyboard.up('ArrowRight')
  } else if (leg.turn < 0) {
    await page.keyboard.down('ArrowLeft')
    await page.waitForTimeout(-leg.turn)
    await page.keyboard.up('ArrowLeft')
  }
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await page.waitForTimeout(leg.ms)
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
  // Stop; give the compositor a beat, then A → wait → B.
  await page.waitForTimeout(350)
  const a = await info()
  const tag = String(i).padStart(2, '0')
  await shoot(`${outDir}/wp${tag}-a.png`)
  await page.waitForTimeout(1600)
  const b = await info()
  await shoot(`${outDir}/wp${tag}-b.png`)
  const row = {
    wp: i,
    x: b.x,
    z: b.z,
    progA: a.programs,
    progB: b.programs,
    geoA: a.geometries,
    geoB: b.geometries,
    texA: a.textures,
    texB: b.textures,
    dead: b.dead,
  }
  results.push(row)
  console.log(JSON.stringify(row))
  if (b.dead) {
    console.log('hero died — route truncated')
    break
  }
}
console.log('ROUTE DONE', JSON.stringify({ waypoints: results.length, pageErrors: errors.length }))
await browser.close()
process.exit(0)
