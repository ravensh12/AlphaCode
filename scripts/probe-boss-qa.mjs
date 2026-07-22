// BOSS-FIGHT QA probe — mounts one boss arena component DIRECTLY (no auth /
// progression involved: the app entry module is stubbed out and the arena is
// imported through the Vite dev server, exactly like probe-anim-qa imports
// layout.ts) and plays the fight with a scripted bot, capturing frame bursts
// of every beat the review loop needs: entrance, telegraphs, player hits,
// boss hits, and the boss death.
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-boss-qa.mjs --arena=boss --variant=0 --out=e2e-shots/boss-qa/v0
//
//   --arena=boss       BossArena       (realm bosses; --variant=0..5)
//   --arena=vex        CinematicBossArena (VEX)
//   --arena=architect  ArchitectArena  (final boss)
//   --seconds=NN       hard cap on the fight loop (default 150)
//   --shot-every=MS    periodic capture cadence (default 700)
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const arg = (name, fallback = null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const ARENA = arg('arena', 'boss')
const VARIANT = Number(arg('variant', '0'))
const OUT = arg('out', `e2e-shots/boss-qa/${ARENA}${ARENA === 'boss' ? `-v${VARIANT}` : ''}`)
const SECONDS = Number(arg('seconds', '150'))
const SHOT_EVERY = Number(arg('shot-every', '700'))
const base = arg('base', 'http://localhost:5173')
// QA-only: keep the bot alive so a capture walks every finale phase.
const GOD = process.argv.includes('--god')
mkdirSync(OUT, { recursive: true })

/** Per-world accents (mirrors adventure.ts themes) + boss names. */
const REALM = [
  { name: 'The Hider', accent: '#b6ff5c' },
  { name: 'Mirror Mimic', accent: '#36e0ff' },
  { name: 'Twin-Key Golem', accent: '#b48cff' },
  { name: 'The Gatekeeper', accent: '#ffb44a' },
  { name: 'Bracket Beast', accent: '#ff5a6a' },
  { name: 'Sorted Sphinx', accent: '#5aa8ff' },
]

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 240)))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200))
})

// Stub the app entry: the page keeps Vite's dev client (module transforms,
// HMR endpoint) but never boots the router/auth/progress stack.
await page.route('**/src/main.tsx*', (route) =>
  route.fulfill({ contentType: 'application/javascript', body: 'export {}' }),
)
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' })

// Warm-up: import the arena module graph once so any Vite dep-optimization
// full-reload ("new dependencies optimized") happens BEFORE the fight mounts,
// not mid-capture (it destroys the evaluate context).
const ARENA_MODULE =
  ARENA === 'boss'
    ? '/src/components/game3d/BossArena.tsx'
    : ARENA === 'vex'
      ? '/src/components/game3d/CinematicBossArena.tsx'
      : '/src/components/game3d/ArchitectArena.tsx'
for (let warm = 0; warm < 3; warm++) {
  try {
    await page.evaluate(async (mod) => {
      await import('/@id/react')
      await import('/@id/react-dom/client')
      await import(mod)
    }, ARENA_MODULE)
    await page.waitForTimeout(2500)
    // A dep-reload may have fired during the import — probe the context.
    await page.evaluate(() => true)
    break
  } catch {
    await page.waitForLoadState('domcontentloaded').catch(() => {})
    await page.waitForTimeout(1500)
  }
}

/** Mount (or remount) the arena under test. */
async function mountArena() {
  await page.evaluate(
    async ({ arena, variant, realm, god }) => {
      window.__qaGod = god === true
      window.__won = false
      window.__lost = false
      document.getElementById('qa-host')?.remove()
      const host = document.createElement('div')
      host.id = 'qa-host'
      host.style.cssText = 'position:fixed;inset:0;background:#000;overflow:hidden'
      document.body.appendChild(host)
      const ReactMod = await import('/@id/react')
      const React = ReactMod.default ?? ReactMod
      const domMod = await import('/@id/react-dom/client')
      const createRoot = (domMod.default ?? domMod).createRoot ?? domMod.createRoot
      const done = { onWin: () => (window.__won = true), onLose: () => (window.__lost = true) }
      let el
      if (arena === 'boss') {
        const m = await import('/src/components/game3d/BossArena.tsx')
        el = React.createElement(m.BossArena, {
          accent: realm[variant].accent,
          variant,
          bossName: realm[variant].name,
          bonusQuestion: null,
          qaGodMode: window.__qaGod === true,
          qaHooks: true,
          ...done,
        })
      } else if (arena === 'vex') {
        const m = await import('/src/components/game3d/CinematicBossArena.tsx')
        el = React.createElement(m.CinematicBossArena, { bossName: 'VEX', ...done })
      } else {
        const m = await import('/src/components/game3d/ArchitectArena.tsx')
        el = React.createElement(m.ArchitectArena, {
          ...done,
          qaGodMode: window.__qaGod === true,
          qaHooks: true,
        })
      }
      window.__qaRoot?.unmount?.()
      window.__qaRoot = createRoot(host)
      window.__qaRoot.render(el)
    },
    { arena: ARENA, variant: VARIANT, realm: REALM, god: GOD },
  )
  await page.locator('#qa-host canvas').waitFor({ state: 'visible', timeout: 60_000 })
}

/**
 * In-page autopilot driver: consumes window.__mechQA at 20Hz with synthetic
 * KeyboardEvents (same input path as a player's keys), eliminating the
 * Node↔CDP latency that made route mechanics (bracket/sphinx) crawl.
 */
async function installDriver() {
  await page.evaluate(() => {
    if (window.__mechDrive) clearInterval(window.__mechDrive)
    const held = new Set()
    const fire = { on: false }
    const ev = (k, type) => {
      const init = k === 'shift'
        ? { key: 'Shift', code: 'ShiftLeft', bubbles: true }
        : { key: k, code: k === ' ' ? 'Space' : undefined, bubbles: true }
      window.dispatchEvent(new KeyboardEvent(type, init))
    }
    let strafe = 'a'
    let strafeFlip = Date.now() + 2400
    window.__mechDrive = setInterval(() => {
      const r = window.__mechQA
      if (!r) return
      const want = new Set(r.keys)
      if (want.size === 0 && !r.hold) {
        // No steering target: keep a dodge rhythm (and chase on cinematic
        // arenas) so the bot never stands in volleys by accident.
        if (Date.now() > strafeFlip) {
          strafe = strafe === 'a' ? 'd' : 'a'
          strafeFlip = Date.now() + 2000 + Math.random() * 1400
        }
        want.add(strafe)
        if (window.__mechChase) want.add('w')
      }
      for (const k of [...held]) {
        if (!want.has(k)) {
          held.delete(k)
          ev(k, 'keyup')
        }
      }
      for (const k of want) {
        if (!held.has(k)) {
          held.add(k)
          ev(k, 'keydown')
        }
      }
      for (const p of r.press) {
        ev(p, 'keydown')
        ev(p, 'keyup')
      }
      if (r.fire !== fire.on) {
        fire.on = r.fire
        ev('f', r.fire ? 'keydown' : 'keyup')
      }
    }, 50)
  })
  await page.evaluate((chase) => {
    window.__mechChase = chase
  }, ARENA !== 'boss')
}

const cdp = await page.context().newCDPSession(page)
let shotId = 0
const manifest = []
async function shoot(tag) {
  const path = `${OUT}/${String(shotId).padStart(3, '0')}-${tag}.png`
  shotId++
  try {
    await page.screenshot({ path, timeout: 10_000 })
  } catch {
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(data, 'base64'))
    } catch (e) {
      console.log(`[shot failed] ${tag}: ${String(e).slice(0, 120)}`)
      return
    }
  }
  manifest.push({ path, tag, t: Date.now() })
}

const bodyText = () => page.evaluate(() => document.body.innerText || '')

await mountArena()

// --- Entrance beat -----------------------------------------------------
// The arena holds a black curtain over the mount until the boss GLB is
// resident (fail-safe lift at ~2.2s), then plays the title-card hero beat.
// Wait past the lift so entrance frames capture the boss + title card, not
// the black curtain (QA flagged pure-black entrance frames otherwise).
await page.waitForTimeout(3000)
await shoot('entrance-a')
await page.waitForTimeout(700)
await shoot('entrance-b')
await page.waitForTimeout(700)
await shoot('entrance-c')
await page.waitForTimeout(700)
await shoot('entrance-d')

// Click the canvas once (focus + resume audio ctx paths).
await page
  .locator('#qa-host canvas')
  .click({ position: { x: 640, y: 400 }, force: true, noWaitAfter: true })
  .catch(() => {})

// --- Fight loop ----------------------------------------------------------
// Bot: hold F (ranged), strafe in bursts, melee (Q) when close-ish, parry (L)
// whenever a danger telegraph is on screen, dash (Shift) on non-danger
// telegraphs. When the arena publishes the mechanic autopilot hook
// (window.__mechQA — kill-mechanic steering/press/fire recommendations), the
// bot OBEYS it, so it can actually execute each boss's unique kill mechanic.
const t0 = Date.now()
let lastShot = 0
let lastTelegraph = ''
let attempts = 1
let prevHp = 1

// The in-page driver owns movement/fire/mechanic keys at 20Hz. The Node loop
// only reacts to telegraphs (parry/melee on the cinematic arenas), captures
// frames, and watches win/lose.
await installDriver()

let lastTextPoll = 0
let text = ''
while (Date.now() - t0 < SECONDS * 1000) {
  const won = await page.evaluate(() => window.__won)
  const lost = await page.evaluate(() => window.__lost)
  if (won) break
  if (lost) {
    await shoot('player-down')
    if (attempts >= 3) break
    attempts++
    console.log(`bot died — remounting (attempt ${attempts})`)
    await mountArena()
    await installDriver()
    prevHp = 1
    continue
  }

  // Full-page text is expensive — poll it on a coarser cadence than the
  // autopilot (telegraph/HP reads tolerate ~0.4s of lag; steering doesn't).
  if (Date.now() - lastTextPoll > 400) {
    lastTextPoll = Date.now()
    text = await bodyText()
  }

  // Parry / dodge reactions on telegraphs (cinematic arenas only).
  const teleMatch = text.match(/([A-Z◆][A-Z\s◆—()/-]{6,60})\n/)
  const tele = /PARRY \(L\)/.test(text) ? 'danger' : /— (DODGE|JUMP|DASH|MOVE|SIDESTEP|REPOSITION|SURVIVE|WATCH)/.test(text) ? 'warn' : ''
  if (tele && tele !== lastTelegraph) {
    await shoot(`telegraph-${tele}`)
    if (tele === 'danger') {
      // Hold the parry across the strike window.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('l')
        await page.waitForTimeout(160)
      }
      await shoot('parry-window')
    } else {
      await page.keyboard.press('Shift')
    }
  }
  lastTelegraph = tele
  void teleMatch

  // Melee jab every loop on cinematic arenas.
  if (ARENA !== 'boss') await page.keyboard.press('q').catch(() => {})

  // --- Event-tagged captures driven by the published mechanic state. ---
  const rec = await page.evaluate(() => {
    const r = window.__mechQA
    return r ? { press: [...r.press], open: r.open } : null
  })
  if (rec) {
    if (
      rec.press.some((p) => p === ' ' || p === 'shift') &&
      Date.now() - (globalThis.__mechShotAt ?? 0) > 4000
    ) {
      globalThis.__mechShotAt = Date.now()
      await shoot('mech-action')
    }
    if (rec.open && !lastTelegraph) {
      // Capture the punish window the first loop it opens.
      if (!globalThis.__openShot) {
        globalThis.__openShot = true
        await shoot('guard-open')
      }
    } else {
      globalThis.__openShot = false
    }
  }

  // Boss HP milestones → tagged shots (parsed from the coarse text poll).
  const hpMatch = text.match(/(\d+)\s*\/\s*(\d+)\s*HP/)
  const hp = hpMatch ? Number(hpMatch[1]) / Number(hpMatch[2]) : null
  if (hp != null) {
    for (const mark of [0.75, 0.5, 0.25, 0.1]) {
      if (prevHp > mark && hp <= mark) await shoot(`bosshp-${Math.round(mark * 100)}`)
    }
    prevHp = hp
  }

  if (Date.now() - lastShot > SHOT_EVERY) {
    lastShot = Date.now()
    await shoot('fight')
  }
  await page.waitForTimeout(120)
}

// Stop the in-page driver and release everything it held.
await page.evaluate(() => {
  if (window.__mechDrive) clearInterval(window.__mechDrive)
  for (const k of ['w', 'a', 's', 'd', 'f']) {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }))
  }
}).catch(() => {})

// --- Death / victory beat --------------------------------------------------
const won = await page.evaluate(() => window.__won)
if (won) {
  console.log('BOSS DEFEATED — capturing death/victory beat')
} else {
  console.log('fight loop ended without a win (timeout or repeated deaths)')
}
for (let i = 0; i < 6; i++) {
  await shoot(won ? 'death' : 'end')
  await page.waitForTimeout(450)
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ arena: ARENA, variant: VARIANT, won, attempts, shots: manifest }, null, 2))
console.log(`saved ${manifest.length} frames → ${OUT} (won=${won}, attempts=${attempts})`)
await browser.close()
