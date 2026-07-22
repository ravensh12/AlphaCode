// gen_character.mjs — generate ONE rigged character mesh with Meshy and land it
// as assets/build/characters/<name>.glb (Ram's raw-Meshy-rigged stage).
//
// This is a THIN wrapper that REUSES AlphaCode's existing Meshy client
// (scripts/meshy-generate.mjs, driven by scripts/meshy-catalog.mjs) rather than
// re-implementing the Meshy REST flow — we align with the repo, we do not fork
// it. Meshy credits: text-to-3d preview 20 + refine 10 + rigging 5 per rig.
//
//   node scripts/pipeline/gen_character.mjs --only cyborg
//
// For the current production pass NO character is generated: the cyborg hero was
// supplied pre-rigged under assets/source/characters/ and staged into
// assets/build/characters/cyborg.glb by hand (0 Meshy credits). This script is
// the documented path for regenerating/adding a character later.
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
  console.error('gen_character: pass --only <catalog-id> (a rig:true entry in scripts/meshy-catalog.mjs)')
  process.exit(1)
}

// Delegate to the existing, credit-aware Meshy generator. It downloads to
// assets-src/meshy/raw/<id>.glb; the caller then stages that into
// assets/build/characters/<name>.glb for the Blender pipeline.
const args = ['scripts/meshy-generate.mjs', `--only=${only}`, ...process.argv.slice(2).filter((a) => !a.startsWith('--only'))]
console.log(`[gen_character] delegating to meshy-generate: node ${args.join(' ')}`)
execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' })
console.log('[gen_character] done — stage the downloaded GLB into assets/build/characters/<name>.glb, then run build_cast.mjs')
