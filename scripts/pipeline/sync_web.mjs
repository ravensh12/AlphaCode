// sync_web.mjs — copy the built final assets into AlphaCode's web root.
//
// Ram's flow ends at apps/web/public/world/; AlphaCode is NOT a monorepo, so
// that maps to this repo's real web root: public/world/. This is the ONLY
// adaptation to Ram's layout — every stage before this matches verbatim.
//
//   assets/build/characters-final/*.glb  -> public/world/characters/*.glb
//   assets/build/world-opt/*.glb         -> public/world/props/*.glb
//   assets/build/anims/anim-library.glb  -> public/world/anims/anim-library.glb
//   assets/build/weapons/*.glb           -> public/world/weapons/*.glb
//
// SAFETY (Ram's rule): a character-final GLB is only copied if it actually
// contains animations. This refuses to clobber a working, animated cast file
// with an animation-less -opt file — the class of mistake that would silently
// freeze the player in-game. We read the glTF JSON chunk directly (no Blender).
//
//   node scripts/pipeline/sync_web.mjs            # sync everything present
//   node scripts/pipeline/sync_web.mjs --dry-run  # report only
//   node scripts/pipeline/sync_web.mjs --force     # skip the anim guard
import { readdirSync, readFileSync, mkdirSync, copyFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DRY = process.argv.includes('--dry-run')
const FORCE = process.argv.includes('--force')

/** Count animations declared in a .glb by parsing its JSON chunk. */
function glbAnimationCount(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== 0x46546c67) return -1 // 'glTF' magic
  // header 12 bytes; first chunk: [length u32][type u32 'JSON'][data]
  const jsonLen = buf.readUInt32LE(12)
  const jsonType = buf.readUInt32LE(16)
  if (jsonType !== 0x4e4f534a) return -1 // 'JSON'
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  return Array.isArray(json.animations) ? json.animations.length : 0
}

function sizeKB(p) {
  return (statSync(p).size / 1024).toFixed(0) + ' KB'
}

function syncDir(srcRel, dstRel, { requireAnims = false } = {}) {
  const srcDir = join(ROOT, srcRel)
  const dstDir = join(ROOT, dstRel)
  if (!existsSync(srcDir)) {
    console.log(`[sync_web] skip ${srcRel} (not present)`)
    return
  }
  const files = readdirSync(srcDir).filter((f) => f.toLowerCase().endsWith('.glb'))
  if (!files.length) {
    console.log(`[sync_web] skip ${srcRel} (no .glb)`)
    return
  }
  if (!DRY) mkdirSync(dstDir, { recursive: true })
  for (const f of files) {
    const src = join(srcDir, f)
    const dst = join(dstDir, f)
    if (requireAnims && !FORCE) {
      const n = glbAnimationCount(src)
      if (n <= 0) {
        console.log(`[sync_web] REFUSE ${srcRel}/${f} — ${n === 0 ? 'no animations' : 'not a glb'} `
          + `(would clobber the working cast; use --force to override)`)
        continue
      }
    }
    console.log(`[sync_web] ${DRY ? '(dry) ' : ''}${srcRel}/${f} -> ${dstRel}/${f}  (${sizeKB(src)})`)
    if (!DRY) copyFileSync(src, dst)
  }
}

function syncFile(srcRel, dstRel) {
  const src = join(ROOT, srcRel)
  if (!existsSync(src)) {
    console.log(`[sync_web] skip ${srcRel} (not present)`)
    return
  }
  const dst = join(ROOT, dstRel)
  if (!DRY) mkdirSync(dirname(dst), { recursive: true })
  console.log(`[sync_web] ${DRY ? '(dry) ' : ''}${srcRel} -> ${dstRel}  (${sizeKB(src)})`)
  if (!DRY) copyFileSync(src, dst)
}

syncDir('assets/build/characters-final', 'public/world/characters', { requireAnims: true })
syncDir('assets/build/world-opt', 'public/world/props')
syncDir('assets/build/weapons', 'public/world/weapons')
syncFile('assets/build/anims/anim-library.glb', 'public/world/anims/anim-library.glb')
console.log('[sync_web] DONE')
void basename
