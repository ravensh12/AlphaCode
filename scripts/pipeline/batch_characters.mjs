// batch_characters.mjs — generate the whole rigged-character roster with Meshy,
// then hand off to build_cast.mjs. REUSES scripts/meshy-generate.mjs (the
// repo's credit-aware Meshy client) for every rig:true catalog entry — we align
// with the existing generator instead of forking it.
//
//   node scripts/pipeline/batch_characters.mjs            # all rigged characters
//   node scripts/pipeline/batch_characters.mjs --dry-run  # plan only
//
// Production-pass note: the cyborg hero was supplied pre-rigged (0 Meshy
// credits), so this batch generator was NOT run for it. It remains the
// documented path for (re)building the rigged roster from the catalog.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const passthrough = process.argv.slice(2)

// The existing generator already filters catalog entries; rigged characters are
// the rig:true entries. We forward flags verbatim (e.g. --dry-run, --only=...).
const args = ['scripts/meshy-generate.mjs', ...passthrough]
console.log(`[batch_characters] delegating to meshy-generate: node ${args.join(' ')}`)
execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' })
console.log('[batch_characters] done — stage rigged GLBs into assets/build/characters/, then: node scripts/pipeline/build_cast.mjs')
