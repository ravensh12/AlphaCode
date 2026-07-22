// build_cast.mjs — orchestrate the CHARACTER half of the pipeline (Node driver
// for the Blender .py stages). For every character in CAST it runs, headless:
//
//   assets/build/characters/<name>.glb
//        --optimize_rigged.py-->  assets/build/characters-opt/<name>.glb
//        --<bake>.py------------>  assets/build/characters-final/<name>.glb
//
// where <bake> is retarget_native_mixamo_rest_delta.py for Meshy AUTO-rigged
// characters (bones NOT mixamorig — e.g. the cyborg) or
// bake_native_mixamo_character.py for characters already wearing the mixamorig
// skeleton. Each character declares a CAST_CLIPS subset: the Mixamo source file
// per game clip name (this is Ram's CAST_CLIPS analog). The final GLB carries
// the mesh + skeleton + every named clip as separate glTF animations that
// three.js reads by name (see MeshyHero.tsx).
//
// Blender is hardcoded (macOS). Runs are sequential and each Blender launch is
// isolated (factory settings), so one bad clip can't corrupt another character.
//
//   node scripts/pipeline/build_cast.mjs                 # whole cast
//   node scripts/pipeline/build_cast.mjs --only cyborg   # one character
//   node scripts/pipeline/build_cast.mjs --skip-optimize # reuse -opt files
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PIPE = join(ROOT, 'scripts', 'pipeline')
const BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'
const MIXAMO = 'assets/source/mixamo'

/* ============================================================================
   THE CAST. Each entry:
     rig:    'auto'    -> Meshy auto-rig (retarget_native_mixamo_rest_delta.py)
             'mixamo'  -> native mixamorig skeleton (bake_native_mixamo_character.py)
     source: raw rigged GLB under assets/build/characters/
     clips:  game-clip-name -> { fbx (under assets/source/mixamo), loop }
             loop clips get horizontal root motion stripped (controller owns
             travel); one-shots (jump/vault) keep their motion.

   The PLAYER hero (cyborg) clip names are chosen to match MeshyHero.tsx's
   animation vocabulary so the runtime reads them by name with no remapping.

   A clip source may also be a GLB (path containing '/'): the rest-delta baker
   imports .glb sources the same way as .fbx. That is how the Meshy-native
   hero-a clips (crouch / slash / hit / victory — states Mixamo's rifle set
   doesn't cover) ride onto the cyborg: hero-a is a Meshy auto-rig with the
   SAME 24-joint bone naming, so the map is pure 1:1 and the rest-delta
   transfer re-anchors the motion onto the cyborg's own bind pose.
   ========================================================================== */
export const CAST = {
  /* ==========================================================================
     ANIMATION REWORK (owner directive: "delete all current animations and
     remake them with Meshy"). Every clip below is a MESHY-NATIVE animation
     generated ON THIS CHARACTER'S OWN MESHY RIG (a fresh rigging task of the
     cyborg's bind-pose statue — scripts/pipeline/meshy_reanimate.mjs, rig task
     in assets-src/meshy/cyborg-reanim.json). Sources land in
     assets-src/meshy/raw/cyborg2-<key>.glb; build_cast strips textures and
     rest-delta-bakes them 1:1 by bone name (rig:'meshy' →
     retarget_meshy_native.py — the Mixamo name map would invert the spine).

     Meshy action ids (api.meshy.ai animation library), picked by visual QA
     over 31 baked candidates (e2e-shots/anim-rework/qa-*.png):
       idle    89 Combat Idle          walk    rig freebie Walking
       run     659 Run Fast 3 inplace  sprint  644 Lean Forward Sprint inplace
       strafes 630/631 Fwd L/R Run Fight inplace   back 685 Walk Back w/ Gun
       crouch  616 Cautious Crouch Walk inplace    jump 466 Regular Jump
       vault   432 Parkour Vault 2 — the lateral speed-vault (headline hurdle)
       shoot   690 Walk Fwd While Shooting inplace (upper-body standing fire)
       shootRun 98 Run and Shoot (full-body sprint-fire)
       slash   219 Right-hand Sword Slash          hit 178 Hit Reaction
       death   183 Shot and Fall Backward          victory 403 Victory Fist Pump
       turns   573 Rifle Turn Left / 585 Rifle Aim Turn Right

     Root motion: horizontal is stripped on EVERY clip (the controller owns
     travel); jump + vault also drop the vertical ride (strip_z — the physics
     arc owns height; clip vertical would stack into a double-height jump).
     ========================================================================== */
  cyborg: {
    rig: 'meshy',
    source: 'assets/build/characters/cyborg.glb',
    clips: {
      // locomotion + stance loops
      idle: { fbx: 'assets-src/meshy/raw/cyborg2-idle-combat.glb', loop: true },
      walk: { fbx: 'assets-src/meshy/raw/cyborg2-walk-free.glb', loop: true },
      run: { fbx: 'assets-src/meshy/raw/cyborg2-run-fast3.glb', loop: true },
      sprint: { fbx: 'assets-src/meshy/raw/cyborg2-sprint.glb', loop: true },
      strafeL: { fbx: 'assets-src/meshy/raw/cyborg2-strafe-fightL.glb', loop: true },
      strafeR: { fbx: 'assets-src/meshy/raw/cyborg2-strafe-fightR.glb', loop: true },
      back: { fbx: 'assets-src/meshy/raw/cyborg2-back-gun.glb', loop: true },
      crouch: { fbx: 'assets-src/meshy/raw/cyborg2-crouch.glb', loop: true },
      // run-and-gun loops
      shoot: { fbx: 'assets-src/meshy/raw/cyborg2-shoot-walk.glb', loop: true },
      shootRun: { fbx: 'assets-src/meshy/raw/cyborg2-shoot-run.glb', loop: true },
      // airborne one-shots: pose only (strip_z) — physics owns the arc
      jump: { fbx: 'assets-src/meshy/raw/cyborg2-jump.glb', loop: true, strip_z: true },
      vault: { fbx: 'assets-src/meshy/raw/cyborg2-vault-parkour2.glb', loop: true, strip_z: true },
      // grounded one-shots (horizontal stripped, vertical kept — death falls)
      slash: { fbx: 'assets-src/meshy/raw/cyborg2-slash.glb', loop: true },
      hit: { fbx: 'assets-src/meshy/raw/cyborg2-hit.glb', loop: true },
      death: { fbx: 'assets-src/meshy/raw/cyborg2-death.glb', loop: true },
      victory: { fbx: 'assets-src/meshy/raw/cyborg2-victory.glb', loop: true },
      turnL: { fbx: 'assets-src/meshy/raw/cyborg2-turn-left.glb', loop: true },
      turnR: { fbx: 'assets-src/meshy/raw/cyborg2-turn-right.glb', loop: true },
    },
  },
}

/* ------------------------------------------------------------------ cli */
function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const ONLY = flag('only')
const SKIP_OPT = process.argv.includes('--skip-optimize')

function blender(script, args) {
  const full = [
    '--background',
    '--python', join(PIPE, script),
    '--', ...args,
  ]
  console.log(`\n[build_cast] blender ${script} ${args.join(' ')}`)
  execFileSync(BLENDER, full, { cwd: ROOT, stdio: 'inherit' })
}

function sizeKB(p) {
  try {
    return (statSync(p).size / 1024).toFixed(0) + ' KB'
  } catch {
    return 'MISSING'
  }
}

function buildChar(name, spec) {
  const opt = `assets/build/characters-opt/${name}.glb`
  const final = `assets/build/characters-final/${name}.glb`
  mkdirSync(join(ROOT, 'assets/build/characters-opt'), { recursive: true })
  mkdirSync(join(ROOT, 'assets/build/characters-final'), { recursive: true })

  if (!existsSync(join(ROOT, spec.source))) {
    throw new Error(`[build_cast] ${name}: missing source ${spec.source}`)
  }

  if (!SKIP_OPT) {
    blender('optimize_rigged.py', ['--in', spec.source, '--out', opt, '--tris', '30000', '--tex', '1024'])
  }

  // manifest for the bake script. Bare filenames resolve under the Mixamo
  // library; paths containing '/' are repo-relative (e.g. Meshy-native GLB
  // clip sources — the baker imports .glb and .fbx alike). GLB sources are
  // first run through strip_textures.mjs: Meshy ships KTX2/BasisU textures,
  // which Blender's glTF importer refuses outright — the anim source only
  // needs bones + clip, so the textures are dropped, not transcoded.
  mkdirSync(join(ROOT, 'assets/build/anim-src'), { recursive: true })
  const clips = Object.entries(spec.clips).map(([clipName, c]) => {
    let src = c.fbx.includes('/') ? c.fbx : join(MIXAMO, c.fbx)
    if (src.toLowerCase().endsWith('.glb')) {
      const stripped = `assets/build/anim-src/${name}-${clipName}.glb`
      console.log(`[build_cast] strip textures: ${src} -> ${stripped}`)
      execFileSync('node', [join(PIPE, 'strip_textures.mjs'), src, stripped], {
        cwd: ROOT,
        stdio: 'inherit',
      })
      src = stripped
    }
    return { fbx: src, name: clipName, loop: !!c.loop, strip_z: !!c.strip_z }
  })
  // verify every source clip exists up-front (fail fast, before Blender)
  for (const c of clips) {
    if (!existsSync(join(ROOT, c.fbx))) {
      throw new Error(`[build_cast] ${name}: missing Mixamo clip ${c.fbx}`)
    }
  }
  const manifest = { char: opt, out: final, clips }
  const manifestPath = join(ROOT, `assets/build/${name}.bake.json`)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  const script = spec.rig === 'mixamo'
    ? 'bake_native_mixamo_character.py'
    : spec.rig === 'meshy'
      ? 'retarget_meshy_native.py' // Meshy-native sources: 1:1 bone map
      : 'retarget_native_mixamo_rest_delta.py'
  blender(script, ['--manifest', manifestPath])

  console.log(`[build_cast] ${name}: opt=${sizeKB(join(ROOT, opt))}  final=${sizeKB(join(ROOT, final))}  clips=${clips.length}`)
}

function main() {
  const names = ONLY ? [ONLY] : Object.keys(CAST)
  for (const name of names) {
    const spec = CAST[name]
    if (!spec) throw new Error(`[build_cast] unknown character '${name}' (have: ${Object.keys(CAST).join(', ')})`)
    buildChar(name, spec)
  }
  console.log(`\n[build_cast] DONE — ${names.length} character(s): ${names.join(', ')}`)
}

main()
