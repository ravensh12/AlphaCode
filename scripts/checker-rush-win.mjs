// INDEPENDENT CHECKER probe — real-player win on a realm boss (no god mode).
// Seeds the same campaign-complete guest state as checker-victory-flow, then
// plays Boss Rush fight 1 (The Hider, BossArena variant 0) for real and
// verifies the post-win flow: interlude card + run progression.
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const OUT = 'e2e-shots/boss-qa/checker-rush-win'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 240)))
let shotId = 0
const shoot = async (tag) => {
  await page
    .screenshot({ path: `${OUT}/${String(shotId++).padStart(2, '0')}-${tag}.png`, timeout: 10_000 })
    .catch(() => {})
}

// Seed campaign-complete guest progress with the app's own reducers.
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
const seed = await page.evaluate(async () => {
  const academy = await import('/src/lib/academyProgress.ts')
  const localProgress = await import('/src/lib/localProgress.ts')
  const { NEETCODE_150_MANIFEST } = await import('/src/content/curricula/neetcode150/index.ts')
  const DAY = 24 * 60 * 60 * 1000
  const past = (d) => new Date(Date.now() - d * DAY).toISOString()
  let state = localProgress.emptyState()
  let ap = state.academyProgress ?? {}
  let i = 0
  for (const track of NEETCODE_150_MANIFEST.tracks) {
    for (const problemId of track.problemIds) {
      i++
      ap = academy.recordMissionPractice(ap, {
        problemId,
        acquisitionPassed: true,
        transferPassed: true,
        codeTestsPassed: true,
        acquiredAt: past(30),
        practicedAt: past(30),
        acquisitionEventIds: [`chk-acq-${i}`],
        transferEventIds: [`chk-tc-${i}`],
        codeTestEventIds: [`chk-tc-${i}`],
      })
      ap = academy.recordMissionRetention(ap, {
        problemId,
        delayedRetrievalPassed: true,
        retainedAt: past(20),
        delayedRetrievalEventIds: [`chk-ret-${i}`],
      })
    }
  }
  for (const realm of NEETCODE_150_MANIFEST.realms) {
    ap = academy.recordRealmQuizAttempt(ap, {
      realmId: realm.id,
      attemptId: `chk-quiz-${realm.id}`,
      attemptedAt: past(10),
      score: 100,
      openEndedTransferPassed: true,
      learningEventIds: [`chk-quiz-ev-${realm.id}`],
    })
    ap = academy.recordRealmBossDefeat(ap, {
      realmId: realm.id,
      defeatId: `chk-boss-${realm.id}`,
      defeatedAt: past(9),
      learningEventIds: [`chk-boss-ev-${realm.id}`],
    })
  }
  state = { ...state, academyProgress: ap, interZoneComplete: true, interZoneCompletedAt: past(5) }
  localStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  const saved = localProgress.saveLocal('guest', state)
  return { complete: academy.isAcademyCampaignComplete(ap), saved: saved?.status ?? saved }
})
console.log('seed:', JSON.stringify(seed))

await page.goto(`${base}/gauntlet/boss-rush`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
console.log('url:', page.url())
await shoot('rush-intro')
const startBtn = page.getByRole('button', { name: /Start the rush/i })
if (!(await startBtn.isVisible().catch(() => false))) {
  console.log('FAIL: Boss Rush intro not reachable')
  await browser.close()
  process.exit(1)
}
await startBtn.click()
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
await page.waitForTimeout(6000) // curtain + entrance
await shoot('fight1-start')
await page.locator('canvas').first().click({ position: { x: 640, y: 400 }, force: true, noWaitAfter: true }).catch(() => {})

// Real fight: hold F, strafe. No god mode anywhere in this path.
const bodyText = () => page.evaluate(() => document.body.innerText || '')
await page.keyboard.down('f')
let strafe = 'a'
await page.keyboard.down(strafe)
let flip = Date.now() + 2200
const t0 = Date.now()
let outcome = 'timeout'
while (Date.now() - t0 < 150_000) {
  const text = await bodyText()
  if (/Fight 2 of|Continue the rush/i.test(text)) { outcome = 'won'; break }
  if (/knocked you out|Run over/i.test(text)) { outcome = 'lost'; break }
  if (Date.now() > flip) {
    await page.keyboard.up(strafe).catch(() => {})
    strafe = strafe === 'a' ? 'd' : 'a'
    await page.keyboard.down(strafe)
    flip = Date.now() + 2000 + Math.random() * 1300
  }
  await page.waitForTimeout(150)
}
for (const k of ['f', strafe]) await page.keyboard.up(k).catch(() => {})
console.log('fight 1 outcome:', outcome)
await shoot(`fight1-${outcome}`)

if (outcome === 'won') {
  const text = await bodyText()
  console.log(
    'interlude card:', /Continue the rush/i.test(text),
    '| progression header (Fight 2 of 7):', /Fight 2 of/i.test(text),
    '| heart restore line:', /heart restored/i.test(text),
  )
}
await browser.close()
console.log('DONE')
