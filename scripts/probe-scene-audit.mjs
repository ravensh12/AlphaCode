// SCENE AUDIT — what is actually in the overworld frame? Walks the live scene
// graph after it settles and reports the heaviest contributors by triangle
// count, instance count and material, so triangle-budget work targets the real
// offenders instead of guesses. Also counts shadow casters (every caster pays
// its geometry a second time in the sun's depth pass).
//
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers E2E_CHANNEL=chromium \
//     node scripts/probe-scene-audit.mjs [--base=http://localhost:4173] [--params=qa_notch=0]
import { chromium } from '@playwright/test'

const arg = (n, d = null) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const base = arg('base', 'http://localhost:4173')
const params = arg('params', 'qa_notch=0')

const browser = await chromium.launch({
  ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
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

await page.goto(`${base}/quest?nohorde&${params}`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 90_000 })
const start = page.getByRole('button', { name: 'Start playing' })
if (await start.isVisible({ timeout: 5_000 }).catch(() => false)) {
  await start.click({ force: true, noWaitAfter: true, timeout: 10_000 }).catch(() => {})
}
await page.waitForFunction(
  () => !/RENDERING CODE CITY/i.test(document.body.innerText || ''),
  undefined,
  { timeout: 120_000 },
)
await page.waitForTimeout(12000)

const audit = await page.evaluate(() => {
  const gl = window.__alphaGl
  // Reach the scene through any rendered object: the renderer keeps the last
  // rendered scene on its render lists, but the simplest handle is the camera's
  // root, so walk up from whatever the composer rendered.
  const scene = window.__alphaScene
  if (!scene) return { error: 'no scene handle' }
  const rows = []
  let total = 0
  let shadowTotal = 0
  scene.traverse((o) => {
    if (!o.visible) return
    const geo = o.geometry
    if (!geo || !geo.attributes || !geo.attributes.position) return
    const idx = geo.index
    const triPer = idx ? idx.count / 3 : geo.attributes.position.count / 3
    const instances = o.isInstancedMesh ? o.count : 1
    const tris = triPer * instances
    // A hidden ancestor means the object never reaches the render list.
    let p = o.parent
    let hidden = false
    while (p) {
      if (!p.visible) {
        hidden = true
        break
      }
      p = p.parent
    }
    if (hidden) return
    total += tris
    if (o.castShadow) shadowTotal += tris
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    rows.push({
      name: o.name || '(unnamed)',
      type: o.type,
      tris: Math.round(tris),
      triPer: Math.round(triPer),
      instances,
      castShadow: !!o.castShadow,
      mat: mat ? mat.type : '?',
      transparent: mat ? !!mat.transparent : false,
    })
  })
  rows.sort((a, b) => b.tris - a.tris)
  return {
    objects: rows.length,
    totalTris: Math.round(total),
    shadowCasterTris: Math.round(shadowTotal),
    top: rows.slice(0, 30),
    transparentTris: Math.round(
      rows.filter((r) => r.transparent).reduce((s, r) => s + r.tris, 0),
    ),
    info: gl ? { geometries: gl.info.memory.geometries, textures: gl.info.memory.textures } : null,
  }
})

if (audit.error) {
  console.log('AUDIT FAILED:', audit.error)
} else {
  console.log(
    `SCENE AUDIT — ${audit.objects} visible meshes, ${audit.totalTris.toLocaleString()} triangles ` +
      `(${audit.shadowCasterTris.toLocaleString()} of them also drawn in the shadow depth pass, ` +
      `${audit.transparentTris.toLocaleString()} transparent)`,
  )
  console.log('  memory:', JSON.stringify(audit.info))
  console.log('  TOP CONTRIBUTORS:')
  for (const r of audit.top) {
    console.log(
      `   ${String(r.tris).padStart(9)}  ${String(r.instances).padStart(5)}x${String(r.triPer).padStart(7)}` +
        `  shadow=${r.castShadow ? 'Y' : 'n'} ${r.transparent ? 'T' : ' '} ${r.mat.padEnd(22)} ${r.name}`,
    )
  }
}
await browser.close()
