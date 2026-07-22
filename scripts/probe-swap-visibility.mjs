// SWAP-VISIBILITY PROBE — proves whether ring crossings are visible in-game.
// The chase camera is OVERRIDDEN to a fixed tripod shot aimed at the street
// band 80–150m ahead of spawn (the near-ring boundary zone). The player then
// sprints forward ~45m, moving every streaming ring (street shell, hero
// cars, building set) across that band, while the tripod view never moves.
// Frames are captured before, during (burst), and after; any solid blob in
// the before/after diff that is not a moving actor IS a visible swap.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-swap-visibility.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/swap-visibility'
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
    /* fall through */
  }
  try {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(data, 'base64'))
  } catch (e) {
    console.log(`[shot failed] ${path}: ${String(e).slice(0, 120)}`)
  }
}
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
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

await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
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
await page.waitForFunction(() => !!window.__alphaPlayer, undefined, { timeout: 30_000 })
await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(800)

// Tripod: 6m above the player's start, aimed at the street band ~110m north
// (the near-ring boundary for the ULTRA street shell sits at 110m).
const start = await page.evaluate(() => window.__alphaPlayer.pos())
await page.evaluate((s) => {
  window.__camOverride = {
    px: s.x,
    py: 7,
    pz: s.z - 4,
    lx: s.x,
    ly: 4,
    lz: s.z - 115,
  }
}, start)
await page.waitForTimeout(700)
await shoot(`${outDir}/tripod-before.png`)

// Sprint forward (heading 0 faces -z? — the controller's forward follows
// heading; spawn faces the guide. Push W+Shift for ~4.5s regardless: any
// 30-45m displacement moves every ring across the tripod band.)
await page.keyboard.down('Shift')
await page.keyboard.down('w')
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(700)
  await shoot(`${outDir}/tripod-during-${i}.png`)
}
await page.keyboard.up('w')
await page.keyboard.up('Shift')
await page.waitForTimeout(1500)
await shoot(`${outDir}/tripod-after.png`)

const end = await page.evaluate(() => window.__alphaPlayer.pos())
console.log(
  JSON.stringify({
    start: { x: Math.round(start.x), z: Math.round(start.z) },
    end: { x: Math.round(end.x), z: Math.round(end.z) },
    moved: Math.round(Math.hypot(end.x - start.x, end.z - start.z)),
  }),
)
await page.evaluate(() => {
  window.__camOverride = null
})
console.log('SWAP-VIS DONE')
await browser.close()
