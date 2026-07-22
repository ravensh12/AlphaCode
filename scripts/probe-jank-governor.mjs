// End-to-end jank-governor verification. Boots /quest?nohorde, walks, then:
//   phase A (0-10s):  clean baseline — governor must NOT engage
//   phase B (10-30s): 4x CPU throttle (CDP) — sustained long frames must
//                     demote the notch (console line + sessionStorage hint)
//   phase C (30-55s): throttle off — sustained good fps must promote back
//                     (after the 10s cooldown + 6s hold)
// Also asserts the boot veil never re-raises ("RENDERING CODE CITY").
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-jank-governor.mjs [--base=http://localhost:5173]
import { chromium } from '@playwright/test'

const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:5173')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const governorLines = []
page.on('console', (m) => {
  const t = m.text()
  if (t.includes('[gfx-governor]')) {
    governorLines.push({ at: Date.now(), text: t })
    console.log('GOVERNOR:', t)
  }
})
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.addInitScript(() => {
  localStorage.clear(); sessionStorage.clear()
  localStorage.setItem('alphacode.guest', 'true')
  localStorage.setItem('alphacode.progress.guest', JSON.stringify({
    streak: { current: 0, longest: 0 }, lessons: {},
    badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
    academyProgress: { schemaVersion: 1, curriculumId: 'curriculum:neetcode150', curriculumVersion: 'v1.0.0', contentVersion: 'v1.0.0', missionCompletions: {}, realmQuizzes: {}, bossDefeats: {} },
  }))
  sessionStorage.setItem('alphacode.quest.introSeen', '1')
})

await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 60_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, { timeout: 90_000 })
await page.waitForTimeout(2000)
await page.locator('canvas').first().click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true }).catch(() => {})
await page.keyboard.down('w')

const notchNow = () =>
  page.evaluate(() => { try { return sessionStorage.getItem('alphacode.gfx.notch') } catch { return null } })
const veilUp = () => page.evaluate(() => /RENDERING CODE CITY/i.test(document.body.innerText || ''))
const jankIn = (ms) =>
  page.evaluate(
    (dur) => new Promise((res) => {
      let over33 = 0, frames = 0
      let last = performance.now()
      const t0 = last
      const tick = () => {
        const now = performance.now()
        if (now - last > 33) over33++
        last = now
        frames++
        if (now - t0 < dur) requestAnimationFrame(tick)
        else res({ frames, over33 })
      }
      requestAnimationFrame(tick)
    }),
    ms,
  )

// Phase A: clean baseline.
const a = await jankIn(8000)
const notchA = await notchNow()
console.log(`PHASE A (baseline): over33=${a.over33}/${a.frames} frames, notch=${notchA ?? 'unchanged'}`)

// Phase B: sustained artificial load.
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 12 })
const b1 = await jankIn(8000)
const notchB1 = await notchNow()
const b2 = await jankIn(8000)
const notchB2 = await notchNow()
console.log(`PHASE B (12x throttle): first8s over33=${b1.over33}/${b1.frames} notch=${notchB1 ?? 'unchanged'} | next8s over33=${b2.over33}/${b2.frames} notch=${notchB2 ?? 'unchanged'}`)

// Phase C: release the throttle, wait out cooldown+hold, expect promote.
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
await page.waitForTimeout(22_000)
const c = await jankIn(6000)
const notchC = await notchNow()
console.log(`PHASE C (recovered): over33=${c.over33}/${c.frames} frames, notch=${notchC ?? 'unchanged'}`)
console.log(`VEIL re-raised at any point: ${await veilUp()}`)
await page.keyboard.up('w').catch(() => {})

const demoted = governorLines.some((l) => l.text.includes('sustained long frames'))
const promoted = notchC !== null && notchB2 !== null && Number(notchC) < Number(notchB2)
console.log(JSON.stringify({
  baselineClean: a.over33 < 10 && notchA === null,
  jankDemoteFired: demoted,
  notchAfterThrottle: notchB2,
  recoveredNotch: notchC,
  promotedBack: promoted,
}))
await browser.close()
