// BEAT-SPREAD PROBE — fresh-guest /quest boot; verifies the opening objective
// is the hold-the-line terminal defense, reads the HUD distance readout, and
// screenshots the trail toward the first mission.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/beat-spread'
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
    } catch {}
    process.exit(1)
  })
}
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const cdp = await page.context().newCDPSession(page)
const shoot = async (path) => {
  try {
    await page.screenshot({ path, timeout: 20_000 })
    return
  } catch {}
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
})

await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 120_000 })

const veilUp = () =>
  page.evaluate(() => /RENDERING CODE CITY/i.test(document.body.innerText || ''))
let sawVeil = false
let dropped = false
for (let i = 0; i < 900; i++) {
  const up = await veilUp()
  if (up) sawVeil = true
  if (sawVeil && !up) {
    dropped = true
    break
  }
  await page.waitForTimeout(200)
}
console.log(`veil dropped: ${dropped}`)

await page.waitForTimeout(1500)
const text = await page.evaluate(() => document.body.innerText || '')
const defendLine = /defend it for 30s/i.test(text)
const containsDuplicate = /Contains Duplicate/i.test(text)
const mission1 = /mission 1 of 9/i.test(text)
const distMatch = text.match(/[·•]\s*(\d+)\s*m\b/)
const dist = distMatch ? parseInt(distMatch[1], 10) : null
console.log(
  JSON.stringify({
    defendGuideLine: defendLine,
    firstMissionIsContainsDuplicate: containsDuplicate,
    hudSaysMission1of9: mission1,
    hudDistanceMeters: dist,
    pageErrors: errors.length,
  }),
)
await shoot(`${outDir}/01-spawn-first-objective.png`)

// Turn toward the objective + walk a couple of seconds so the trail reads in
// the shot, then re-read the readout to prove it counts down as you travel.
await page.keyboard.press('Escape').catch(() => {})
await page.keyboard.down('Shift')
await page.keyboard.down('w')
await page.waitForTimeout(3500)
await page.keyboard.up('w')
await page.keyboard.up('Shift')
await page.waitForTimeout(600)
const text2 = await page.evaluate(() => document.body.innerText || '')
const dist2Match = text2.match(/[·•]\s*(\d+)\s*m\b/)
console.log(`distance after 3.5s sprint: ${dist2Match ? dist2Match[1] : '?'}m`)
await shoot(`${outDir}/02-trail-toward-first-mission.png`)

const pass =
  dropped && defendLine && containsDuplicate && dist != null && dist >= 80 && errors.length === 0
console.log(pass ? 'BEAT-SPREAD PASS' : 'BEAT-SPREAD FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
