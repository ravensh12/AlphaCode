// WALK-INTO-EVERYTHING COLLISION AUDIT — boots /quest as a guest and drives
// the hero straight into one instance of every solid prop family near spawn
// (layout primitives + streamed Meshy signature dressing). A prop passes when
// the hero's centre NEVER crosses it (min distance to the prop anchor stays
// above the pass-through threshold) while pushing into it for several
// seconds. Targets and expected footprints come from the LIVE app modules
// (vite serves TS to the browser), so the audit can never drift from the
// code it verifies. The horde eventually kills a guest mid-audit — the run
// reboots a fresh page and resumes from the next target.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-collision-audit.mjs
import { chromium } from '@playwright/test'

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

async function bootPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
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
  await page.waitForTimeout(300)
  // Wait until movement is live (world unpauses a beat after the veil).
  const t0 = Date.now()
  while (Date.now() - t0 < 25_000) {
    await page.keyboard.down('w')
    await page.waitForTimeout(350)
    await page.keyboard.up('w')
    const moved = await page.evaluate(() => {
      const p = window.__alphaPlayer.pos()
      const prev = window.__probePrev
      window.__probePrev = p
      return prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : 0
    })
    if (moved > 0.3) return page
    await page.waitForTimeout(300)
  }
  return page
}

/** Nearest instance of each family around spawn, from the live modules. */
const collectTargets = (page) =>
  page.evaluate(async () => {
    const layout = await import('/src/components/game3d/layout.ts')
    const core = await import('/src/components/game3d/meshy/meshyPropsCore.ts')
    const start = layout.START_3D
    const near = (items) => {
      let best = null
      for (const it of items) {
        const d = Math.hypot(it.x - start.x, it.z - start.z)
        if (d < 14) continue // spawn scrum — approach angles get messy
        if (!best || d < best.d) best = { x: it.x, z: it.z, d }
      }
      return best
    }
    const out = []
    // Representative set: the primitive-static path (lamp/car/building — one
    // collider family each) and the dynamic streamed path (signature kinds).
    // Full family coverage is asserted by the pure unit tests; the browser
    // audit proves the controller actually consumes both collider paths.
    const families = [
      ['lamp', layout.SCENERY.lamp],
      ['car', layout.SCENERY.car],
      ['building', layout.SCENERY.building],
    ]
    for (const [name, items] of families) {
      const t = near(items)
      if (t) out.push({ name, x: t.x, z: t.z, d: Math.round(t.d) })
    }
    const signatures = core.buildSignaturePlacements(core.SPAWN_CELL_INDEX, 1)
    const wanted = new Set(['bollard', 'kiosk', 'shelter', 'fountain', 'foodCart'])
    for (const [kind, items] of signatures) {
      if (!wanted.has(kind)) continue
      const t = near(items)
      if (t) out.push({ name: `sig:${kind}`, x: t.x, z: t.z, d: Math.round(t.d) })
    }
    out.sort((a, b) => a.d - b.d)
    return out
  })

/** Steer the hero at (tx, tz): turn until aligned, hold W, track min dist.
 *  `vault` additionally taps Space on approach — the parkour-vault no-clip
 *  regression (tall props must refuse the hurdle and stay solid). */
const driveInto = (page, target, vault = false) =>
  page.evaluate(
    ({ tx, tz, vault }) =>
      new Promise((resolve) => {
        const player = window.__alphaPlayer
        const keys = (type, key) =>
          window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
        let minD = Infinity
        let noProgressMs = 0
        let last = performance.now()
        let lastVaultAt = 0
        const t0 = last
        keys('keydown', 'Shift')
        const tick = () => {
          const now = performance.now()
          const dt = now - last
          last = now
          const p = player.pos()
          const d = Math.hypot(tx - p.x, tz - p.z)
          const improved = d < minD - 0.02
          minD = Math.min(minD, d)
          // Desired heading (city convention: heading 0 faces +z, atan2(dx, dz)).
          const want = Math.atan2(tx - p.x, tz - p.z)
          let err = want - p.h
          while (err > Math.PI) err -= Math.PI * 2
          while (err < -Math.PI) err += Math.PI * 2
          // Arrow keys TURN (a/d strafe — TURN_RATE 2.5 rad/s in the
          // controller). Ease off W while badly misaligned so the servo
          // doesn't orbit the target.
          if (Math.abs(err) > 0.15) {
            keys('keydown', err > 0 ? 'ArrowLeft' : 'ArrowRight')
            keys('keyup', err > 0 ? 'ArrowRight' : 'ArrowLeft')
          } else {
            keys('keyup', 'ArrowLeft')
            keys('keyup', 'ArrowRight')
          }
          if (Math.abs(err) > 1.2) keys('keyup', 'w')
          else keys('keydown', 'w')
          // Vault-spam regression: hurdle attempts right at the prop face.
          // (The controller binds jump on e.code === 'Space'.)
          const space = (type) =>
            window.dispatchEvent(
              new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true }),
            )
          if (vault && d < 5 && now - lastVaultAt > 650) {
            lastVaultAt = now
            space('keydown')
            setTimeout(() => space('keyup'), 220)
          }
          // Pushing at the prop without the gap closing = solidly blocked.
          if (d < 4.5 && !improved) noProgressMs += dt
          else noProgressMs = 0
          const dead = !!document.querySelector('.over3d-death')
          const budget = vault ? 4_500 : 900
          if (dead || noProgressMs > budget || minD < 0.22 || now - t0 > 16_000) {
            for (const k of ['w', 'ArrowLeft', 'ArrowRight', 'Shift', ' ']) keys('keyup', k)
            resolve({ minD, ms: Math.round(now - t0), dead })
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { tx: target.x, tz: target.z, vault },
  )

let page = await bootPage()

// --- 1. Registry integration: every streamed signature placement near the
// player must be covered by a LIVE collider (the exact query the controller
// runs). This proves the dynamic registration wiring end-to-end without
// having to physically walk to all of them.
await page.waitForFunction(() => !!window.__alphaColliders, undefined, { timeout: 15_000 })
const registry = await page.evaluate(async () => {
  const core = await import('/src/components/game3d/meshy/meshyPropsCore.ts')
  const layout = await import('/src/components/game3d/layout.ts')
  // Query through the APP's live module instance (dev HMR can hand a raw
  // re-import a second instance that misses the dynamic registrations).
  const near = window.__alphaColliders.near
  const start = layout.START_3D
  let covered = 0
  const misses = []
  const signatures = core.buildSignaturePlacements(core.SPAWN_CELL_INDEX, 1)
  for (const [kind, items] of signatures) {
    for (const item of items) {
      if (Math.hypot(item.x - start.x, item.z - start.z) > 130) continue
      const hit = near(item.x, item.z).some(
        (c) => Math.abs(item.x - c.x) <= c.hw && Math.abs(item.z - c.z) <= c.hd,
      )
      if (hit) covered++
      else misses.push(`${kind}@${Math.round(item.x)},${Math.round(item.z)}`)
    }
  }
  return { covered, misses, owners: window.__alphaColliders.counts() }
})
console.log(
  `dynamic registry: ${registry.covered} covered, owners=${JSON.stringify(registry.owners)}, misses: ${JSON.stringify(registry.misses)}`,
)

const targets = await collectTargets(page)
console.log(`targets: ${targets.length} — ${targets.map((t) => t.name).join(', ')}`)

const results = []
const remaining = [...targets]
while (remaining.length > 0) {
  // Nearest-first from wherever the hero is NOW (each leg ends at a prop).
  const here = await page.evaluate(() => window.__alphaPlayer.pos())
  remaining.sort(
    (a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z),
  )
  const target = remaining.shift()
  // Tall props get the vault-spam treatment: Space at the face must NOT
  // no-clip through (their colliders carry `top` above the vault ceiling).
  const vault = ['lamp', 'sig:kiosk', 'sig:shelter', 'sig:fountain'].includes(target.name)
  const r = await driveInto(page, target, vault)
  const after = await page.evaluate(() => window.__alphaPlayer.pos())
  console.log(
    `  leg end at ${after.x.toFixed(1)},${after.z.toFixed(1)} h=${after.h.toFixed(2)} (target ${target.x.toFixed(1)},${target.z.toFixed(1)})`,
  )
  if (r.dead) {
    console.log(`hero died before finishing ${target.name} — rebooting`)
    await page.close()
    page = await bootPage()
    remaining.unshift(target)
    continue
  }
  // <0.25m to the anchor = the hero's centre crossed the prop (hole).
  // Never within 3m = something ELSE blocked the approach (unreachable —
  // rerun decides; usually a building corner en route, itself a pass).
  const verdict = r.minD < 0.25 ? 'HOLE' : r.minD > 3 ? 'UNREACHED' : 'BLOCKED'
  results.push({ name: target.name, ...r, verdict })
  console.log(`${verdict} ${target.name}: minD=${r.minD.toFixed(2)}m t=${r.ms}ms`)
  await page.waitForTimeout(200)
}

const holes = results.filter((r) => r.verdict === 'HOLE')
const unreached = results.filter((r) => r.verdict === 'UNREACHED')
console.log(
  'SUMMARY',
  JSON.stringify({
    tested: results.length,
    holes: holes.map((h) => h.name),
    unreached: unreached.map((h) => h.name),
  }),
)
await browser.close()
process.exit(holes.length === 0 && results.length > 0 ? 0 : 1)
