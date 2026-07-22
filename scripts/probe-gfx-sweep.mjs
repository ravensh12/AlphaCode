// GRAPHICS-PURITY SWEEP — spawns the player at street points in EVERY
// district (seeded via the session position key), aims the camera down the
// street at several headings and distances, and captures screenshots for a
// blocky-asset review. Crash-resilient: each point runs in a fresh page and
// retries once, so a starved-GPU renderer crash never voids the whole sweep.
// Usage:
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-gfx-sweep.mjs [outDir] [pointName,pointName…]
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const outDir = process.argv[2] ?? 'e2e-shots/gfx-sweep'
const only = process.argv[3] ? new Set(process.argv[3].split(',')) : null
mkdirSync(outDir, { recursive: true })
const base = 'http://localhost:5173'

// One street point per district (off the quest-plaza clearings, on real
// blocks with cars/planters/benches), plus the spawn plaza street.
// Districts (districtTheme): 0 Verdant Downtown, 1 Harborfront, 2 Crystal
// Neon Quarter, 3 Old Town, 4 Container Port, 5 Mountain Outskirts.
const POINTS = [
  { name: 'spawn-street', x: -410, z: 330 },
  { name: 'downtown', x: -80, z: 60 },
  { name: 'harborfront', x: 320, z: 240 },
  { name: 'neon-quarter', x: 180, z: -320 },
  { name: 'old-town', x: -280, z: -180 },
  { name: 'container-port', x: 480, z: -80 },
  { name: 'outskirts', x: -480, z: -420 },
].filter((p) => !only || only.has(p.name))

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

const initScript = () => {
  localStorage.clear()
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
  // Camera tripod hook (same seam probe-swap-visibility uses).
  const hook = new EventTarget()
  hook.addEventListener('observe', (ev) => {
    const r = ev.detail
    if (!r || typeof r.render !== 'function' || r.__wrapped) return
    r.__wrapped = true
    const orig = r.render.bind(r)
    r.render = (scene, camera) => {
      if (camera && camera.isPerspectiveCamera && camera.fov > 1) {
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
}

async function capturePoint(point) {
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
  await page.addInitScript(initScript)
  await page.addInitScript(
    ({ px, pz }) => {
      sessionStorage.setItem('alphacode.tour', JSON.stringify({ world: 0, stage: 0 }))
      sessionStorage.setItem('alphacode.quest.pos', JSON.stringify({ x: px, z: pz, h: 0 }))
    },
    { px: point.x, pz: point.z },
  )

  try {
    await page.goto(`${base}/quest?nohorde`, { waitUntil: 'domcontentloaded' })
    // Generous budgets: this box often runs many probes at once (load 300+),
    // and the veil holds for the full preload however long that takes.
    await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 240_000 })

    // Wait for the boot veil to drop (and never re-raise).
    let sawVeil = false
    for (let i = 0; i < 1500; i++) {
      const up = await page.evaluate(() =>
        /RENDERING CODE CITY/i.test(document.body.innerText || ''),
      )
      if (up) sawVeil = true
      if (sawVeil && !up) break
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(2500) // street rings settle

    const pos = await page.evaluate(() => window.__alphaPlayer?.pos() ?? null)
    if (!pos) {
      console.log(`[${point.name}] no player hook — skipped`)
      await page.close()
      return false
    }
    console.log(`[${point.name}] player at ${Math.round(pos.x)},${Math.round(pos.z)}`)

    // Four headings × two framings: street-level (the 40–150m band the player
    // actually reads) and a raised mid shot (the 100–250m impostor band).
    for (const [hi, yaw] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
      const dx = Math.sin(yaw)
      const dz = Math.cos(yaw)
      await page.evaluate(
        ({ p, dx, dz }) => {
          window.__camOverride = {
            px: p.x - dx * 4,
            py: 3.2,
            pz: p.z - dz * 4,
            lx: p.x + dx * 90,
            ly: 2,
            lz: p.z + dz * 90,
          }
        },
        { p: pos, dx, dz },
      )
      await page.waitForTimeout(450)
      await shoot(`${outDir}/${point.name}-h${hi}-street.png`)
      await page.evaluate(
        ({ p, dx, dz }) => {
          window.__camOverride = {
            px: p.x - dx * 6,
            py: 14,
            pz: p.z - dz * 6,
            lx: p.x + dx * 180,
            ly: 0,
            lz: p.z + dz * 180,
          }
        },
        { p: pos, dx, dz },
      )
      await page.waitForTimeout(450)
      await shoot(`${outDir}/${point.name}-h${hi}-mid.png`)
    }
    await page.close()
    return true
  } catch (e) {
    console.log(`[${point.name}] attempt failed: ${String(e).slice(0, 160)}`)
    try {
      await page.close()
    } catch {
      /* renderer gone */
    }
    return false
  }
}

for (const point of POINTS) {
  let ok = await capturePoint(point)
  if (!ok) ok = await capturePoint(point) // one retry on a crashed renderer
  if (!ok) console.log(`[${point.name}] FAILED after retry`)
}

console.log('GFX SWEEP DONE →', outDir)
await browser.close()
