// RAIN PROBE — boots /quest as a guest, lets the gameplay weather clock run
// past the first scheduled front (30–55s in, per weatherCore), and captures
// street-level shots while the storm is up so the review loop can judge the
// streaks / splashes / wet sheen.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-rain-shot.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/rain-probe'
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
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.addInitScript(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
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

await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
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
console.log('veil down — waiting out the first front gap')

const cam0 = await page.evaluate(() => {
  const c = window.__cam
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
const P = { x: cam0.x, z: cam0.z }
const stage = async (name, o) => {
  await page.evaluate((ov) => {
    window.__camOverride = ov
  }, o)
  await page.waitForTimeout(900)
  await shoot(`${outDir}/${name}.png`)
  console.log('shot', name)
}

// First front opens 30–55s into the gameplay clock and lasts 30–70s, so
// t≈48s and t≈65s bracket "storm rolling in" and "storm fully up". The
// weather clock PAUSES while any overlay is up (death included), so the bot
// must stay alive: keep sprinting in a wide loop the whole wait, and if the
// horde still lands a KO, restart and keep the clock moving.
await page.keyboard.press('Escape').catch(() => {})
const keepAlive = async (ms) => {
  const until = Date.now() + ms
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  let steer = 0
  while (Date.now() < until) {
    await page.waitForTimeout(2500)
    const dead = await page
      .evaluate(() => /overwhelmed/i.test(document.body.innerText || ''))
      .catch(() => false)
    if (dead) {
      console.log('bot died — restarting level to unpause the weather clock')
      await page.keyboard.up('w').catch(() => {})
      await page.keyboard.up('Shift').catch(() => {})
      await page.getByRole('button', { name: /restart/i }).click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1500)
      await page.keyboard.down('Shift')
      await page.keyboard.down('w')
    }
    // Weave: quarter-second steer taps keep the route unpredictable and off walls.
    const key = steer++ % 4 === 0 ? 'a' : steer % 7 === 0 ? 'd' : null
    if (key) {
      await page.keyboard.down(key)
      await page.waitForTimeout(300)
      await page.keyboard.up(key)
    }
  }
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
}

await keepAlive(48_000)
await stage('rain-t48-street', { px: P.x, py: 2.2, pz: P.z, lx: P.x, ly: 8, lz: P.z - 90 })
await page.evaluate(() => {
  window.__camOverride = null
})
await keepAlive(15_000)
await stage('rain-t65-street', { px: P.x, py: 2.2, pz: P.z, lx: P.x, ly: 8, lz: P.z - 90 })
await stage('rain-t65-avenue', {
  px: P.x + 3,
  py: 3.2,
  pz: P.z + 6,
  lx: P.x + 3,
  ly: 12,
  lz: P.z - 220,
})
await stage('rain-t65-mid', {
  px: P.x - 20,
  py: 18,
  pz: P.z + 20,
  lx: P.x + 80,
  ly: 14,
  lz: P.z - 80,
})
await browser.close()
console.log('done')
