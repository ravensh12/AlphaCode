// Boot the ACTUAL signed-in overworld on the PRODUCTION build, wait for the
// city to finish streaming, drive the player through the exact actions the user
// complained about, and capture a screenshot per action + measured FPS.
import { chromium } from '@playwright/test'

const PORT = process.env.PORT || '4173'
const BASE = `http://127.0.0.1:${PORT}`
const DIR = '/Users/raven/AlphaCode/e2e-shots'
const TAG = process.argv[2] || 'play'

const EMPTY_GUEST_PROGRESS = {
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

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (e) => console.error('[pageerror]', String(e)))

await page.addInitScript(
  ({ progress }) => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('alphacode.guest', 'true')
    localStorage.setItem('alphacode.progress.guest', JSON.stringify(progress))
    sessionStorage.setItem('alphacode.quest.introSeen', '1')
  },
  { progress: EMPTY_GUEST_PROGRESS },
)

const gl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  const g = c.getContext('webgl2') || c.getContext('webgl')
  const ext = g && g.getExtension('WEBGL_debug_renderer_info')
  return { renderer: g && ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'n/a' }
})
console.log('GL:', gl.renderer)

const measureFps = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0
        const t0 = performance.now()
        const loop = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(loop)
          else res(Math.round((n / (performance.now() - t0)) * 1000))
        }
        requestAnimationFrame(loop)
      }),
  )

await page.goto(`${BASE}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 45000 })

// Wait for the boot veil ("RENDERING CODE CITY … N/94 models") to disappear.
try {
  await page.waitForFunction(
    () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
    undefined,
    { timeout: 90000 },
  )
  console.log('city streamed (boot veil gone)')
} catch {
  console.log('WARN: boot veil still up after 90s —', (await page.evaluate(() => document.body.innerText)).slice(0, 120))
}
await page.waitForTimeout(3000)

const canvas = page.locator('canvas').first()
const shot = async (name) => {
  await canvas.screenshot({ path: `${DIR}/${TAG}-${name}.png` })
  console.log('  shot', name)
}

// Focus the canvas for key input.
await page.mouse.click(640, 400)
await page.waitForTimeout(500)

await shot('01-spawn-idle')

// Run forward.
await page.keyboard.down('w')
await page.waitForTimeout(1600)
await shot('02-run')

// Sprint.
await page.keyboard.down('Shift')
await page.waitForTimeout(1400)
await shot('03-sprint')

// Run-and-gun (fire while sprinting).
await page.keyboard.down('f')
await page.waitForTimeout(900)
await shot('04-run-and-gun')
await page.keyboard.up('f')

// Jump / vault (space while moving toward a car).
await page.keyboard.press('Space')
await page.waitForTimeout(180)
await shot('05-jump')
await page.keyboard.up('Shift')
await page.keyboard.up('w')
await page.waitForTimeout(800)

// Walk backward while shooting.
await page.keyboard.down('s')
await page.keyboard.down('f')
await page.waitForTimeout(1200)
await shot('06-walk-back-shoot')
await page.keyboard.up('f')
await page.keyboard.up('s')

// Dash (Q).
await page.keyboard.press('q')
await page.waitForTimeout(160)
await shot('07-dash')
await page.waitForTimeout(1200)

const fps = await measureFps()
console.log('FPS(measured ~2s, idle-ish):', fps)
await shot('08-final')
await browser.close()
process.exit(0)
