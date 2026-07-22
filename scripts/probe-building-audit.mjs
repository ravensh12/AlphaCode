// BUILDING AUDIT PROBE — boots /quest as a guest and captures the night city
// from a battery of street / rooftop cameras around the spawn plaza, so the
// graphics review loop can judge which building families read as fake.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-building-audit.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/building-audit'
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
await page.waitForTimeout(3500) // let rings settle
await page.evaluate(
  () =>
    new Promise((res) => {
      let n = 0
      const tick = () => (++n >= 10 ? res(null) : requestAnimationFrame(tick))
      requestAnimationFrame(tick)
    }),
)

const cam0 = await page.evaluate(() => {
  const c = window.__cam
  return { x: c.position.x, y: c.position.y, z: c.position.z }
})
console.log('cam0', JSON.stringify(cam0))
const stage = async (name, o) => {
  await page.evaluate((ov) => {
    window.__camOverride = ov
  }, o)
  await page.waitForTimeout(900)
  await shoot(`${outDir}/${name}.png`)
  console.log('shot', name)
}

// Battery: four compass street views + two mid-height + two long looks.
const P = { x: cam0.x, z: cam0.z }
await stage('street-north', { px: P.x, py: 2.2, pz: P.z, lx: P.x, ly: 8, lz: P.z - 90 })
await stage('street-south', { px: P.x, py: 2.2, pz: P.z, lx: P.x, ly: 8, lz: P.z + 90 })
await stage('street-east', { px: P.x, py: 2.2, pz: P.z, lx: P.x + 90, ly: 8, lz: P.z })
await stage('street-west', { px: P.x, py: 2.2, pz: P.z, lx: P.x - 90, ly: 8, lz: P.z })
await stage('mid-northeast', {
  px: P.x - 20,
  py: 18,
  pz: P.z + 20,
  lx: P.x + 80,
  ly: 14,
  lz: P.z - 80,
})
await stage('mid-southwest', {
  px: P.x + 20,
  py: 18,
  pz: P.z - 20,
  lx: P.x - 80,
  ly: 14,
  lz: P.z + 80,
})
await stage('long-avenue', {
  px: P.x + 3,
  py: 3.2,
  pz: P.z + 6,
  lx: P.x + 3,
  ly: 12,
  lz: P.z - 220,
})
await stage('rooftop-wide', {
  px: P.x - 40,
  py: 55,
  pz: P.z + 40,
  lx: P.x + 60,
  ly: 8,
  lz: P.z - 60,
})
await browser.close()
console.log('done')
