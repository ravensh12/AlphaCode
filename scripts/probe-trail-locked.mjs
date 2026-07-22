// TRAIL + LOCKED-MISSION PROBE — guest with mission 1 (Contains Duplicate)
// already practiced. Verifies:
//   1. the guide trail is present and re-targets mission 2 after mission 1
//      (player spawns at the mission-1 site, exactly where a real run leaves
//      you) — screenshot shows the ribbon leading toward Valid Anagram;
//   2. a locked SAME-LEG beat (Two Sum) shows the "Mission not unlocked"
//      prompt, and pressing E answers with the Bit toast;
//   3. a locked FUTURE-LEG beat (Valid Palindrome, checkpoint 2) does too —
//      these had no interactable at all before this fix.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/trail-locked'
mkdirSync(outDir, { recursive: true })
const base = 'http://localhost:5173'

// Beat sites (deterministic, from src/lib/encounterBeats.ts WORLD_BEATS):
const BEAT_1 = { x: -293.6, z: 481 } // beat-0-0-0 Contains Duplicate (done)
const BEAT_2 = { x: -298.4, z: 385.125 } // beat-0-0-1 Valid Anagram (ACTIVE)
const BEAT_3 = { x: -293.6, z: 277.25 } // beat-0-0-2 Two Sum (locked, same leg)
const LEG2_BEAT_1 = { x: -293.8038, z: 325.4038 } // beat-0-1-0 Valid Palindrome (locked, future leg)

const NOW = '2026-07-20T12:00:00.000Z'
const PRACTICED_MISSION_1 = {
  evidenceVersion: 1,
  problemId: 'problem:contains-duplicate',
  acquiredAt: NOW,
  practicedAt: NOW,
  acquisitionPassed: true,
  transferPassed: true,
  codeTestsPassed: true,
  acquisitionEventIds: ['acquisition:problem:contains-duplicate'],
  transferEventIds: ['python:problem:contains-duplicate'],
  codeTestEventIds: ['python:problem:contains-duplicate'],
}

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

const results = []

/**
 * Boot /quest as a guest who has practiced mission 1, spawned at `pos`
 * facing `face`. Returns the page (caller closes it).
 */
async function bootAt(pos, face) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
  const heading = Math.atan2(face.x - pos.x, face.z - pos.z)
  await page.addInitScript(
    ({ practice, spawn }) => {
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
            missionPractices: { 'problem:contains-duplicate': practice },
            missionCompletions: {},
            realmQuizzes: {},
            bossDefeats: {},
          },
        }),
      )
      sessionStorage.setItem('alphacode.quest.introSeen', '1')
      // The saved position is only honored when the session tour names the
      // durable objective (see resolveQuestResume) — seed both.
      sessionStorage.setItem('alphacode.tour', JSON.stringify({ world: 0, stage: 0 }))
      sessionStorage.setItem('alphacode.quest.pos', JSON.stringify(spawn))
    },
    { practice: PRACTICED_MISSION_1, spawn: { x: pos.x, z: pos.z, h: heading } },
  )
  await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 120_000 })
  const veilUp = () =>
    page.evaluate(() => /RENDERING CODE CITY/i.test(document.body.innerText || ''))
  let sawVeil = false
  for (let i = 0; i < 900; i++) {
    const up = await veilUp()
    if (up) sawVeil = true
    if (sawVeil && !up) break
    await page.waitForTimeout(200)
  }
  // Dismiss any first-spawn milestone/intro dialog so the world unpauses
  // (interact() is a no-op while a blocking overlay is up). Poll until the
  // dialog is gone — under heavy load it can appear a beat after veil drop.
  await page.keyboard.press('Escape').catch(() => {})
  for (let i = 0; i < 20; i++) {
    const dialog = page.locator('.over3d-quest-intro button').first()
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.click({ timeout: 1500 }).catch(() => {})
    } else if (i >= 3) {
      break
    }
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(1200)
  return page
}

/**
 * Press E and poll for the city toast element. The toast auto-dismisses
 * after 3.2s and a loaded main thread can delay the keydown past a fixed
 * wait, so retry the press a few times and watch the DOM instead of a
 * single sleep. Returns the toast text, or null.
 */
async function pressEForToast(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.keyboard.press('e')
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(250)
      const toast = await page
        .locator('.over3d-city-toast')
        .textContent({ timeout: 400 })
        .catch(() => null)
      if (toast) return toast
    }
  }
  return null
}

const shoot = async (page, path) => {
  try {
    await page.screenshot({ path, timeout: 20_000 })
  } catch {
    try {
      const cdp = await page.context().newCDPSession(page)
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(data, 'base64'))
    } catch (e) {
      console.log(`[shot failed] ${path}: ${String(e).slice(0, 120)}`)
    }
  }
}

/* 1 — trail present after mission 1, pointing at mission 2 */
{
  const page = await bootAt(BEAT_1, BEAT_2)
  const text = await page.evaluate(() => document.body.innerText || '')
  const mission2 = /mission 2 of/i.test(text) || /2\/9/.test(text)
  const validAnagram = /Valid Anagram/i.test(text)
  const distMatch = text.match(/[·•]\s*(\d+)\s*m\b/)
  const dist = distMatch ? parseInt(distMatch[1], 10) : null
  // Objective ≈96 m from the mission-1 site (the readout tracks guidePos).
  const distOk = dist != null && dist > 60 && dist < 140
  results.push({ scene: 'trail-after-mission-1', mission2, validAnagram, dist, distOk })
  await shoot(page, `${outDir}/01-trail-after-mission1.png`)
  // Walk the trail for a couple of seconds — the ribbon should stay underfoot.
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  await page.waitForTimeout(2500)
  await page.keyboard.up('w')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(500)
  const text2 = await page.evaluate(() => document.body.innerText || '')
  const dist2 = text2.match(/[·•]\s*(\d+)\s*m\b/)
  results.push({
    scene: 'trail-walk',
    distAfterSprint: dist2 ? parseInt(dist2[1], 10) : null,
  })
  await shoot(page, `${outDir}/02-trail-walking-to-mission2.png`)
  await page.close()
}

/* 2 — locked same-leg beat (Two Sum): prompt + E toast */
{
  const page = await bootAt({ x: BEAT_3.x, z: BEAT_3.z + 2.4 }, BEAT_3)
  const text = await page.evaluate(() => document.body.innerText || '')
  const lockedPrompt = /Mission not unlocked — finish the current mission first/i.test(text)
  const bitLine = /isn.t unlocked yet — finish .Valid Anagram. first/i.test(text)
  await shoot(page, `${outDir}/03-locked-same-leg-prompt.png`)
  const toastText = await pressEForToast(page)
  const toast = /Mission not unlocked yet — finish .Valid Anagram. first/i.test(toastText ?? '')
  results.push({ scene: 'locked-same-leg', lockedPrompt, bitLine, eToast: toast })
  await shoot(page, `${outDir}/04-locked-same-leg-e-toast.png`)
  await page.close()
}

/* 3 — locked FUTURE-LEG beat (Valid Palindrome, checkpoint 2) */
{
  const page = await bootAt({ x: LEG2_BEAT_1.x, z: LEG2_BEAT_1.z + 2.4 }, LEG2_BEAT_1)
  const text = await page.evaluate(() => document.body.innerText || '')
  const lockedPrompt = /Mission not unlocked — finish the current mission first/i.test(text)
  const bitLine = /isn.t unlocked yet — finish .Valid Anagram. first/i.test(text)
  const toastText = await pressEForToast(page)
  const toast = /Mission not unlocked yet — finish .Valid Anagram. first/i.test(toastText ?? '')
  results.push({ scene: 'locked-future-leg', lockedPrompt, bitLine, eToast: toast })
  await shoot(page, `${outDir}/05-locked-future-leg-prompt.png`)
  await page.close()
}

console.log(JSON.stringify(results, null, 2))
const pass =
  results[0]?.validAnagram &&
  results[0]?.distOk &&
  results[2]?.lockedPrompt &&
  results[2]?.eToast &&
  results[3]?.lockedPrompt &&
  results[3]?.eToast
console.log(pass ? 'TRAIL-LOCKED PASS' : 'TRAIL-LOCKED FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
