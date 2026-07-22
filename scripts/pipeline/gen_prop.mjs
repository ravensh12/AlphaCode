// gen_prop.mjs — generate ONE static world prop/building with Meshy and land it
// as assets/build/world/<name>.glb (Ram's raw world stage), ready for
// optimize_world.py. THIN wrapper that REUSES scripts/meshy-generate.mjs (the
// repo's credit-aware Meshy client) — align, don't fork.
//
//   node scripts/pipeline/gen_prop.mjs --only arena-energy-pylon
//
// Props are non-skinned, so there is no rigging/animation credit — text-to-3d
// preview 20 + refine 10 each. Production-pass note: no new props were
// generated (0 Meshy credits); the staged tactical gun is optimized directly
// via optimize_world.py.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}

const only = flag('only')
if (!only) {
  console.error('gen_prop: pass --only <catalog-id> (a prop entry in scripts/meshy-catalog.mjs)')
  process.exit(1)
}
const args = ['scripts/meshy-generate.mjs', `--only=${only}`, ...process.argv.slice(2).filter((a) => !a.startsWith('--only'))]
console.log(`[gen_prop] delegating to meshy-generate: node ${args.join(' ')}`)
execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' })
console.log('[gen_prop] done — stage the GLB into assets/build/world/<name>.glb, then run optimize_world.py (or batch_world.mjs)')
