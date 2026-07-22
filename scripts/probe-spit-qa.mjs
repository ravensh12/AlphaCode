// SPITTER-PROJECTILE QA probe — boots the overworld (/quest, guest progress),
// lets the shooter-zombie waves engage, and captures periodic frames so the
// review loop can judge the acid projectiles in flight (fire → travel → hit).
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-spit-qa.mjs --out=e2e-shots/spit-qa --seconds=30
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const OUT = arg('out', 'e2e-shots/spit-qa')
const SECONDS = Number(arg('seconds', '30'))
const SHOT_EVERY = Number(arg('shot-every', '400'))
const base = arg('base', 'http://localhost:5173')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
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
})

await page.goto(`${base}/quest`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(
  () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
  undefined,
  { timeout: 90_000 },
)
await page.waitForTimeout(2000)
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 640, y: 400 }, force: true, noWaitAfter: true })
  .catch(() => {})

let shotId = 0
const shoot = () =>
  page.screenshot({ path: `${OUT}/${String(shotId++).padStart(3, '0')}.png`, timeout: 8_000 }).catch(() => {})

// Fight back while strafing so the bot survives long enough for the spitters
// to settle at standoff and volley; frames catch muzzle glows, bolts in
// flight and splashes. If the horde still wins, hit "Restart" and continue.
const t0 = Date.now()
let strafeKey = 'a'
await page.keyboard.down('f') // hold fire (auto-aim)
await page.keyboard.down(strafeKey)
let nextFlip = Date.now() + 1600
let lastShot = 0
let deaths = 0
while (Date.now() - t0 < SECONDS * 1000) {
  const restart = page.getByRole('button', { name: /Restart/i })
  if (await restart.isVisible({ timeout: 100 }).catch(() => false)) {
    deaths++
    await page.keyboard.up('f').catch(() => {})
    await page.keyboard.up(strafeKey).catch(() => {})
    await restart.click({ force: true, noWaitAfter: true }).catch(() => {})
    await page.waitForTimeout(2500)
    await page.keyboard.down('f')
    await page.keyboard.down(strafeKey)
    continue
  }
  if (Date.now() > nextFlip) {
    await page.keyboard.up(strafeKey).catch(() => {})
    strafeKey = strafeKey === 'a' ? 'd' : 'a'
    await page.keyboard.down(strafeKey)
    nextFlip = Date.now() + 1400 + Math.random() * 800
  }
  if (Date.now() - lastShot >= SHOT_EVERY) {
    lastShot = Date.now()
    await shoot()
  }
  await page.waitForTimeout(60)
}
await page.keyboard.up('f').catch(() => {})
await page.keyboard.up(strafeKey).catch(() => {})
console.log(`saved ${shotId} frames → ${OUT} (deaths=${deaths})`)
await browser.close()
