// INDEPENDENT CHECKER probe — real-player victory flow.
//
// Seeds a legitimate "campaign complete + exam passed" GUEST progress state
// using the app's OWN reducers (imported through the Vite dev server), then
// boots the REAL app, navigates to /final/boss, and fights the Architect with
// NO god mode — exactly what a real player would experience. Captures the
// post-win flow (victory screen? progression recorded?).
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/checker-victory-flow.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = 'http://localhost:5173'
const OUT = 'e2e-shots/boss-qa/checker-victory-flow'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 240)))

let shotId = 0
const shoot = async (tag) => {
  const path = `${OUT}/${String(shotId++).padStart(2, '0')}-${tag}.png`
  await page.screenshot({ path, timeout: 10_000 }).catch(() => {})
  return path
}

// --- 1. Seed a durable, valid guest progress state via the app's reducers ---
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
const seedInfo = await page.evaluate(async () => {
  const academy = await import('/src/lib/academyProgress.ts')
  const localProgress = await import('/src/lib/localProgress.ts')
  const gauntlet = await import('/src/lib/gauntletProgress.ts')
  const { NEETCODE_150_MANIFEST } = await import(
    '/src/content/curricula/neetcode150/index.ts'
  )

  const DAY = 24 * 60 * 60 * 1000
  const past = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString()
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
        // Transfer + code-test evidence must share an event id (the reducer
        // rejects disjoint sets) — mirror the app's single-solve event.
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

  const campaignComplete = academy.isAcademyCampaignComplete(ap)
  state = {
    ...state,
    academyProgress: ap,
    interZoneComplete: true,
    interZoneCompletedAt: past(5),
  }
  const ready = academy.isAcademyFinalGauntletReady(ap, true)

  localStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  const saved = localProgress.saveLocal('guest', state)

  let g = gauntlet.emptyGauntletState()
  g = gauntlet.recordExamCompletion(g, 100, true)
  const gSaved = gauntlet.saveGauntlet('guest', g)
  const gBack = gauntlet.loadGauntlet('guest')

  return {
    campaignComplete,
    ready,
    saved: saved?.status ?? saved,
    gSaved,
    examPassedRoundTrip: gBack.examPassed,
  }
})
console.log('seed:', JSON.stringify(seedInfo))

// --- 2. Enter /final/boss as this guest ------------------------------------
await page.goto(`${base}/final/boss`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
console.log('url after nav:', page.url())
await shoot('final-boss-entry')

const introBtn = page.getByRole('button', { name: /Face the Architect/i })
if (!(await introBtn.isVisible().catch(() => false))) {
  console.log('FAIL: intro card not reachable. Body:', (await page.evaluate(() => document.body.innerText)).slice(0, 400))
  await browser.close()
  process.exit(1)
}

// --- 3. Fight for real (no god mode), up to 4 attempts ----------------------
const bodyText = () => page.evaluate(() => document.body.innerText || '')
let outcome = 'timeout'
for (let attempt = 1; attempt <= 4 && outcome !== 'won'; attempt++) {
  const again = page.getByRole('button', { name: /Fight again/i })
  if (attempt === 1) await introBtn.click()
  else await again.click()
  console.log(`attempt ${attempt} — arena mounting`)
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
  await page.waitForTimeout(6500) // curtain + entrance beat
  await shoot(`a${attempt}-fight-start`)
  await page.locator('canvas').first().click({ position: { x: 640, y: 400 }, force: true, noWaitAfter: true }).catch(() => {})

  // Kite at range: hold fire, strafe constantly, never face-tank. React to
  // each telegraph with its counter (jump force waves, parry heavies, dash
  // everything else) — the tactics a competent human uses.
  await page.keyboard.down('f')
  let strafe = 'a'
  await page.keyboard.down(strafe)
  let flip = Date.now() + 1800
  const t0 = Date.now()
  let lastTele = ''
  while (Date.now() - t0 < 170_000) {
    const text = await bodyText()
    if (/Dawn Over Code City|The Architect Falls/i.test(text)) { outcome = 'won'; break }
    if (/The Architect Stands|Overwritten/i.test(text)) { outcome = 'lost'; break }
    const tele = /PARRY \(L\)/.test(text) ? 'danger'
      : /JUMP/.test(text) ? 'jump'
      : /— (DODGE|DASH|MOVE|SIDESTEP|REPOSITION|SURVIVE|WATCH)/.test(text) ? 'warn' : ''
    if (tele && tele !== lastTele) {
      if (tele === 'danger') {
        for (let i = 0; i < 7; i++) { await page.keyboard.press('l'); await page.waitForTimeout(140) }
      } else if (tele === 'jump') {
        for (let i = 0; i < 4; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(320) }
      } else {
        await page.keyboard.press('Shift')
        await page.waitForTimeout(120)
        await page.keyboard.press('k')
      }
    }
    lastTele = tele
    if (Date.now() > flip) {
      await page.keyboard.up(strafe).catch(() => {})
      strafe = strafe === 'a' ? 'd' : 'a'
      await page.keyboard.down(strafe)
      flip = Date.now() + 1700 + Math.random() * 1200
    }
    await page.waitForTimeout(120)
  }
  for (const k of ['f', strafe]) await page.keyboard.up(k).catch(() => {})
  console.log(`attempt ${attempt}: ${outcome}`)
  await shoot(`a${attempt}-${outcome}`)
}

// --- 4. Post-win flow diagnostics -------------------------------------------
if (outcome === 'won') {
  await page.waitForTimeout(1200)
  await shoot('victory-screen')
  const text = await bodyText()
  console.log('victory text seen:', /Dawn Over Code City/.test(text), '| Back to Levels btn:', /Back to Levels/.test(text))
  const persisted = await page.evaluate(async () => {
    const gauntlet = await import('/src/lib/gauntletProgress.ts')
    const g = gauntlet.loadGauntlet('guest')
    return { bossBeaten: g.bossBeaten ?? null, finalBossDefeats: Object.keys(g.finalBossDefeats ?? {}).length, keys: Object.keys(g) }
  })
  console.log('persisted gauntlet after win:', JSON.stringify(persisted))
  // Follow the victory CTA back to the overworld/levels.
  const cta = page.getByRole('link', { name: /Back to Levels/i })
  if (await cta.isVisible().catch(() => false)) {
    await cta.click()
    await page.waitForTimeout(4000)
    console.log('post-victory url:', page.url())
    await shoot('post-victory-nav')
  }
} else {
  console.log('RESULT: bot never won a legitimate fight — victory flow unverified live')
}
console.log('FINAL OUTCOME:', outcome)
await browser.close()
