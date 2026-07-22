// ANIMATION QA probe — drives ONE player animation in the live game and
// captures a burst of frames for harsh visual review (smoothness, foot
// planting, transitions, T-pose flashes, clipping).
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-anim-qa.mjs --action=vault [--out=e2e-shots/anim-qa2]
//
// Actions: run | sprint | jump | vault | standshoot | sprintshoot
//        | shoottrans (sprint→fire→release edges + standfire→sprintfire)
//        | gunfit     (2× closeups: idle / stand-shoot / sprint-shoot)
//
// The vault leg imports the city layout module through the vite dev server,
// finds the nearest CAR collider (small footprint), steers the hero at it with
// the arrow keys (read-only use of collider data), sprints in and hits Space
// in the trigger window. It also verifies the physics contract: while the
// hero's XZ is inside the car footprint it must be airborne (y > 0.45), and
// it must exit on the far side — printed as VAULT_CONTRACT ok|FAIL.
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const ACTION = arg('action', 'run')
const OUT = arg('out', 'e2e-shots/anim-qa2')
const base = arg('base', 'http://localhost:5173')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
// Gun-fit closeups render at 2× so crops around the hand stay sharp.
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: ACTION === 'gunfit' ? 2 : 1,
})
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
await page.waitForFunction(
  () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
  undefined,
  { timeout: 90_000 },
)
await page.waitForTimeout(1500)
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 640, y: 400 }, force: true, noWaitAfter: true })
  .catch(() => {})
await page.waitForTimeout(300)

// Warm-up: nudge W until the camera moves (world unpauses lazily post-veil).
// Defensive against a mid-boot vite full-reload (dep re-optimize): a reload
// wipes window.__cam and destroys the eval context — swallow and re-wait.
const t0 = Date.now()
while (Date.now() - t0 < 25_000) {
  await page.keyboard.down('w')
  const moved = await page
    .evaluate(
      () =>
        new Promise((res) => {
          const c = window.__cam
          if (!c) return res(0)
          const x = c.position.x
          const z = c.position.z
          setTimeout(() => res(Math.hypot(c.position.x - x, c.position.z - z)), 400)
        }),
    )
    .catch(() => 0)
  await page.keyboard.up('w').catch(() => {})
  if (moved > 0.3) break
  await page.waitForFunction(() => !!window.__cam, undefined, { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(300)
}
await page.waitForTimeout(400)

/** Player state estimated from the chase camera (trails CAM_DIST behind). */
const playerState = () =>
  page.evaluate(() => {
    const c = window.__cam
    const e = new (window.__cam.constructor.prototype.lookAt, Object)() // noop
    void e
    // Forward = where the camera looks, projected to the ground plane.
    const fwd = { x: 0, z: 0 }
    {
      const m = c.matrixWorld.elements
      // camera -Z in world space
      fwd.x = -m[8]
      fwd.z = -m[10]
      const l = Math.hypot(fwd.x, fwd.z) || 1
      fwd.x /= l
      fwd.z /= l
    }
    const CAM_DIST = 5.2
    return {
      x: c.position.x + fwd.x * CAM_DIST,
      z: c.position.z + fwd.z * CAM_DIST,
      camY: c.position.y,
      yaw: Math.atan2(fwd.x, fwd.z),
    }
  })

const shoot = (id) => page.screenshot({ path: `${OUT}/${ACTION}-${String(id).padStart(2, '0')}.png` })

async function burst(n, gapMs, startId = 0) {
  for (let i = 0; i < n; i++) {
    await shoot(startId + i)
    await page.waitForTimeout(gapMs)
  }
}

/** Rotate the camera yaw toward `target` using the arrow keys (TURN_RATE 2.5). */
async function faceYaw(target) {
  for (let i = 0; i < 30; i++) {
    const s = await playerState()
    let err = target - s.yaw
    err = Math.atan2(Math.sin(err), Math.cos(err))
    if (Math.abs(err) < 0.06) return
    // arrowright turns camYaw NEGATIVE (turn -= ... in the controller).
    const key = err > 0 ? 'ArrowLeft' : 'ArrowRight'
    const ms = Math.min(600, (Math.abs(err) / 2.5) * 1000)
    await page.keyboard.down(key)
    await page.waitForTimeout(ms)
    await page.keyboard.up(key)
    await page.waitForTimeout(120)
  }
}

/** Yaw of the most OPEN direction (max collider-free march) — read-only use
 *  of the city layout via the vite dev server, so locomotion legs run down
 *  clear road instead of pinning on a wall or tree. */
async function openYaw() {
  return page.evaluate(async () => {
    const m = await import('/src/components/game3d/layout.ts')
    const c = window.__cam
    const fx0 = -c.matrixWorld.elements[8]
    const fz0 = -c.matrixWorld.elements[10]
    const l0 = Math.hypot(fx0, fz0) || 1
    const px = c.position.x + (fx0 / l0) * 5.2
    const pz = c.position.z + (fz0 / l0) * 5.2
    let bestYaw = 0
    let bestClear = -1
    for (let i = 0; i < 24; i++) {
      const yaw = (i / 24) * Math.PI * 2
      const dx = Math.sin(yaw)
      const dz = Math.cos(yaw)
      let clear = 60
      outer: for (let d = 2; d <= 60; d += 1) {
        const x = px + dx * d
        const z = pz + dz * d
        for (const col of m.collidersNear(x, z)) {
          if (Math.abs(x - col.x) <= col.hw + 0.8 && Math.abs(z - col.z) <= col.hd + 0.8) {
            clear = d
            break outer
          }
        }
      }
      if (clear > bestClear) {
        bestClear = clear
        bestYaw = yaw
      }
    }
    return bestYaw
  })
}

if (ACTION === 'run' || ACTION === 'sprint') {
  await faceYaw(await openYaw())
  if (ACTION === 'sprint') await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await page.waitForTimeout(700) // settle into the cycle
  await burst(14, 110)
  await page.keyboard.up('w')
  // transition back to idle
  await burst(4, 150, 14)
  if (ACTION === 'sprint') await page.keyboard.up('Shift')
} else if (ACTION === 'jump') {
  await faceYaw(await openYaw())
  // standing jump — HOLD space for the full-height arc (a tap short-hops)
  await page.keyboard.down('Space')
  const standBurst = burst(10, 85)
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await standBurst
  await page.waitForTimeout(500)
  // running jump
  await page.keyboard.down('w')
  await page.waitForTimeout(500)
  await page.keyboard.down('Space')
  const runBurst = burst(10, 85, 10)
  await page.waitForTimeout(200)
  await page.keyboard.up('Space')
  await runBurst
  await page.keyboard.up('w')
} else if (ACTION === 'standshoot') {
  await page.keyboard.down('f')
  await page.waitForTimeout(350)
  await burst(12, 120)
  await page.keyboard.up('f')
  await burst(4, 150, 12) // release: aim eases out
} else if (ACTION === 'sprintshoot') {
  await faceYaw(await openYaw())
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await page.waitForTimeout(600)
  await page.keyboard.down('f')
  await page.waitForTimeout(350)
  await burst(14, 110)
  await page.keyboard.up('f')
  await burst(4, 130, 14)
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
} else if (ACTION === 'shoottrans') {
  // TRANSITION QA — the edges are where a bad blend "clanks":
  //   leg A: sprint → sprint-shoot (frames land right ON the f-down edge)
  //   leg B: sprint-shoot → sprint (frames land right ON the f-up edge)
  //   leg C: stand-shoot → sprint-shoot (fire held, sprint starts under it)
  await faceYaw(await openYaw())
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await page.waitForTimeout(900) // settle into the pure sprint cycle
  await page.keyboard.down('f')
  await burst(8, 70) // 00-07: fire-edge blend (~0.55s window)
  await page.waitForTimeout(500) // settled sprint-shoot
  await page.keyboard.up('f')
  await burst(8, 70, 8) // 08-15: release-edge blend back to sprint
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(700)
  // leg C: standing fire first, then sprint kicks in underneath the trigger.
  await page.keyboard.down('f')
  await page.waitForTimeout(600) // settled stand-shoot aim
  await shoot(16)
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await burst(8, 70, 17) // 17-24: stand-fire → sprint-fire handoff
  await page.keyboard.up('f')
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
} else if (ACTION === 'gunfit') {
  // GUN-FIT closeups (2× DPR): idle grip, stand-shoot aim, sprint-shoot.
  // The chase camera sits behind the hero, so a slow aim-drag between shots
  // varies the yaw a touch for slightly different sightlines on the grip.
  await faceYaw(await openYaw())
  await page.waitForTimeout(800)
  await shoot('idle-0')
  await page.waitForTimeout(400)
  await shoot('idle-1')
  await page.keyboard.down('f')
  await page.waitForTimeout(500)
  await shoot('standshoot-0')
  await page.waitForTimeout(300)
  await shoot('standshoot-1')
  await page.keyboard.up('f')
  await page.waitForTimeout(400)
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await page.keyboard.down('f')
  await page.waitForTimeout(500)
  await burst(6, 120, 0)
  await page.keyboard.up('f')
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
} else if (ACTION === 'vault') {
  // Import the layout module via the vite dev server (read-only collider data).
  const car = await page.evaluate(async () => {
    const m = await import('/src/components/game3d/layout.ts')
    const c = window.__cam
    const fwd = { x: -c.matrixWorld.elements[8], z: -c.matrixWorld.elements[10] }
    const l = Math.hypot(fwd.x, fwd.z) || 1
    const px = c.position.x + (fwd.x / l) * 5.2
    const pz = c.position.z + (fwd.z / l) * 5.2
    let best = null
    let bestD = Infinity
    for (const col of m.COLLIDERS) {
      if (col.hw > 3 || col.hd > 3) continue // cars/planters only
      if (col.hw < 0.8 || col.hd < 0.8) continue // skip tiny posts
      const d = Math.hypot(col.x - px, col.z - pz)
      // want a clear run-up: not too close, reachable
      if (d > 8 && d < 80 && d < bestD) {
        bestD = d
        best = col
      }
    }
    return { car: best, d: bestD, px, pz }
  })
  if (!car.car) {
    console.log('NO CAR FOUND near spawn — cannot vault-test')
    process.exit(1)
  }
  console.log('target car:', JSON.stringify(car))
  // Face the car and sprint at it; hit Space inside the trigger window.
  const yaw = Math.atan2(car.car.x - car.px, car.car.z - car.pz)
  await faceYaw(yaw)
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  // Trigger + record: poll distance, Space at <4.2m, then sample the physics
  // contract every frame while capturing screenshots on a parallel cadence.
  const contract = page.evaluate(
    ({ carBox }) =>
      new Promise((res) => {
        const c = window.__cam
        const out = { entered: false, insideLowY: null, crossed: false, minCamY: 99, maxCamY: -99, timeline: [] }
        const startT = performance.now()
        const tick = () => {
          const m = c.matrixWorld.elements
          const fx = -m[8]
          const fz = -m[10]
          const l = Math.hypot(fx, fz) || 1
          const px = c.position.x + (fx / l) * 5.2
          const pz = c.position.z + (fz / l) * 5.2
          const py = c.position.y - 2.7 // CAM_HEIGHT above the player
          const inside =
            Math.abs(px - carBox.x) <= carBox.hw && Math.abs(pz - carBox.z) <= carBox.hd
          if (inside) {
            out.entered = true
            out.insideLowY = out.insideLowY == null ? py : Math.min(out.insideLowY, py)
          }
          if (out.entered && !inside) out.crossed = true
          out.minCamY = Math.min(out.minCamY, c.position.y)
          out.maxCamY = Math.max(out.maxCamY, c.position.y)
          out.timeline.push([+(performance.now() - startT).toFixed(0), +px.toFixed(2), +pz.toFixed(2), +py.toFixed(2), inside ? 1 : 0])
          if (performance.now() - startT > 3500) res(out)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { carBox: car.car },
  )
  // Approach loop: press Space when close.
  let vaulted = false
  for (let i = 0; i < 100; i++) {
    const s = await playerState()
    const d = Math.hypot(car.car.x - s.x, car.car.z - s.z)
    if (d < 4.6 && !vaulted) {
      vaulted = true
      await page.keyboard.press('Space')
      await burst(12, 95)
      break
    }
    await page.waitForTimeout(50)
  }
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
  const result = await contract
  const insideSamples = result.timeline.filter((t) => t[4] === 1)
  const clipped = insideSamples.some((t) => t[3] < 0.45)
  console.log('vault result:', JSON.stringify({ ...result, timeline: undefined }))
  console.log('inside samples:', JSON.stringify(insideSamples))
  console.log(
    !vaulted
      ? 'VAULT_CONTRACT FAIL — never reached the trigger window'
      : !result.entered
        ? 'VAULT_CONTRACT WARN — never crossed the car footprint (probe may have missed)'
        : clipped
          ? 'VAULT_CONTRACT FAIL — hero was low inside the car footprint (clipping)'
          : result.crossed
            ? 'VAULT_CONTRACT ok — airborne across the footprint and out the far side'
            : 'VAULT_CONTRACT FAIL — entered the footprint but never exited',
  )
} else {
  console.log(`unknown --action=${ACTION}`)
  process.exit(1)
}

const dead = await page.evaluate(() => !!document.querySelector('.over3d-death'))
if (dead) console.log('WARN: hero died during the probe — frames after death are void')
console.log(`saved frames → ${OUT}/${ACTION}-*.png`)
await browser.close()
