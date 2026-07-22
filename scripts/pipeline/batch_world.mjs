// batch_world.mjs — optimize every staged world asset: run optimize_world.py
// (Blender, headless) over assets/build/world/*.glb and any staged weapons,
// writing decimated + texture-shrunk copies to assets/build/world-opt/ (and
// assets/build/weapons/ for weapons). Buildings budget to ~40k tris, small
// props to ~15k; the tactical gun is hammered to <~2 MB.
//
// New meshes are generated with Meshy via gen_prop.mjs (which reuses the repo's
// meshy-generate.mjs); this batch step is the pure-Blender optimization half.
//
//   node scripts/pipeline/batch_world.mjs                 # all staged world glbs + weapons
//   node scripts/pipeline/batch_world.mjs --only tactical-machine-gun
import { execFileSync } from 'node:child_process'
import { readdirSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PIPE = join(ROOT, 'scripts', 'pipeline')
const BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const ONLY = flag('only')

function blenderOptimize(inRel, outRel, { kind = 'prop', tris = null, tex = 1024 } = {}) {
  const args = ['--in', inRel, '--out', outRel, '--kind', kind, '--tex', String(tex)]
  if (tris) args.push('--tris', String(tris))
  console.log(`\n[batch_world] optimize_world ${inRel} -> ${outRel} (kind=${kind}${tris ? `, tris=${tris}` : ''})`)
  execFileSync(BLENDER, ['--background', '--python', join(PIPE, 'optimize_world.py'), '--', ...args],
    { cwd: ROOT, stdio: 'inherit' })
  try {
    console.log(`[batch_world] ${outRel} = ${(statSync(join(ROOT, outRel)).size / 1024).toFixed(0)} KB`)
  } catch { /* missing */ }
}

// 1) staged weapons → hard optimization (decimate + shrink), target <~2 MB
const weaponsSrc = join(ROOT, 'assets/source/weapons')
if (existsSync(weaponsSrc)) {
  mkdirSync(join(ROOT, 'assets/build/weapons'), { recursive: true })
  for (const f of readdirSync(weaponsSrc).filter((f) => f.toLowerCase().endsWith('.glb'))) {
    const name = basename(f, '.glb')
    if (ONLY && ONLY !== name) continue
    blenderOptimize(`assets/source/weapons/${f}`, `assets/build/weapons/${f}`,
      { kind: 'prop', tris: 12000, tex: 1024 })
  }
}

// 2) staged world props/buildings → world-opt
const worldSrc = join(ROOT, 'assets/build/world')
if (existsSync(worldSrc)) {
  mkdirSync(join(ROOT, 'assets/build/world-opt'), { recursive: true })
  for (const f of readdirSync(worldSrc).filter((f) => f.toLowerCase().endsWith('.glb'))) {
    const name = basename(f, '.glb')
    if (ONLY && ONLY !== name) continue
    const kind = /tower|building|block|structure|landmark/i.test(name) ? 'building' : 'prop'
    blenderOptimize(`assets/build/world/${f}`, `assets/build/world-opt/${f}`, { kind })
  }
}

console.log('\n[batch_world] DONE')
