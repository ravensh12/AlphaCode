// DRAW-CALL SPIKE AUDIT — steady traversal issues 110-150 draw calls, but rare
// frames issue tens of thousands and stall for hundreds of ms. This probe finds
// out WHICH pass explodes and WHAT it is drawing.
//
// renderer.info.render.calls is cumulative once autoReset is off, so wrapping
// gl.render gives a per-PASS draw-call delta. Any pass over the threshold gets
// its scene walked: visible mesh count, the biggest contributing subtree by
// name, and whether the objects are instanced. That is enough to name the
// culprit instead of guessing at it.
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-spike-audit.mjs [--base=http://127.0.0.1:4173]
//     [--secs=45] [--threshold=800] [--params=qa_notch=0]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://127.0.0.1:4173')
const secs = Number(arg('secs', '45'))
const threshold = Number(arg('threshold', '800'))
const params = arg('params', 'qa_notch=0')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
  ],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
page.on('console', (m) => {
  const t = m.text()
  if (t.includes('[spike]')) console.log(t)
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

await page.goto(`${base}/quest?nohorde&${params}`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(() => !/RENDERING CODE CITY/i.test(document.body.innerText || ''), undefined, {
  timeout: 180_000,
})
await page
  .locator('canvas')
  .first()
  .click({ position: { x: 800, y: 500 }, force: true, noWaitAfter: true })
  .catch(() => {})

// Install the per-pass audit BEFORE driving the player, so the districts that
// stream in during the run are all captured.
await page.evaluate((limit) => {
  const gl = window.__alphaGl
  if (!gl || gl.__spikeAudit) return
  gl.__spikeAudit = true
  gl.info.autoReset = false
  const spikes = (window.__spikes = [])

  /** Describe what a scene is about to draw, grouped by top-level subtree. */
  const describe = (scene) => {
    const groups = new Map()
    let meshes = 0
    let instanced = 0
    const walk = (node, rootName) => {
      if (node.visible === false) return
      const isMesh = node.isMesh || node.isInstancedMesh || node.isBatchedMesh || node.isLine
      if (isMesh) {
        meshes++
        if (node.isInstancedMesh || node.isBatchedMesh) instanced++
        groups.set(rootName, (groups.get(rootName) ?? 0) + 1)
      }
      const kids = node.children
      for (let i = 0; i < kids.length; i++) {
        walk(kids[i], rootName ?? (kids[i].name || kids[i].type))
      }
    }
    for (const child of scene.children ?? []) {
      walk(child, child.name || child.type)
    }
    const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    return { meshes, instanced, top }
  }

  // Per-FRAME accounting, not just per-pass: a frame can explode either because
  // one pass draws the world twice over, or because something queues hundreds
  // of small passes (env/PMREM rebuilds, per-object warm draws). Both look
  // identical in renderer.info; only the pass list tells them apart.
  let frame = []
  let frameDraws = 0
  const orig = gl.render.bind(gl)
  gl.render = (scene, camera) => {
    const before = gl.info.render.calls
    orig(scene, camera)
    const drew = gl.info.render.calls - before
    frameDraws += drew
    const rt = gl.getRenderTarget()
    frame.push({
      drew,
      rt: rt ? `${rt.width}x${rt.height}` : 'screen',
      scene: scene?.name || scene?.type || '?',
      cam: camera?.type ?? '?',
      // Only walk the scene for passes big enough to be the culprit — the walk
      // itself is expensive and would distort what it measures.
      ...(drew >= 400 ? describe(scene) : {}),
    })
  }

  const endFrame = () => {
    if (frameDraws >= limit) {
      const byPass = frame
        .filter((p) => p.drew > 0)
        .sort((a, b) => b.drew - a.drew)
        .slice(0, 6)
      spikes.push({
        t: +performance.now().toFixed(0),
        total: frameDraws,
        passes: frame.length,
        byPass,
      })
      console.log(
        `[spike] frame total=${frameDraws} across ${frame.length} passes | ` +
          `biggest=${JSON.stringify(byPass.slice(0, 3))}`,
      )
    }
    frame = []
    frameDraws = 0
    requestAnimationFrame(endFrame)
  }
  requestAnimationFrame(endFrame)
}, threshold)

await page.keyboard.down('w')
const steer = setInterval(() => {
  page.keyboard.down('ArrowLeft').catch(() => {})
  setTimeout(() => page.keyboard.up('ArrowLeft').catch(() => {}), 500)
}, 6000)
await page.waitForTimeout(secs * 1000)
clearInterval(steer)
await page.keyboard.up('w').catch(() => {})

const spikes = await page.evaluate(() => window.__spikes ?? [])
console.log(`\nSPIKE FRAMES (>= ${threshold} draw calls in one frame): ${spikes.length}`)
for (const s of spikes.slice(0, 20)) {
  console.log(`  t=${s.t} total=${s.total} passes=${s.passes}`)
  for (const p of s.byPass) {
    console.log(
      `      ${String(p.drew).padStart(6)} draws  rt=${String(p.rt).padEnd(12)} ` +
        `scene=${p.scene} cam=${p.cam}` +
        (p.meshes != null ? `  visibleMeshes=${p.meshes} instanced=${p.instanced}` : '') +
        (p.top ? `\n             top: ${JSON.stringify(p.top)}` : ''),
    )
  }
}
await browser.close()
