// Tier-11 boss clip fan-out — companion to scripts/meshy-generate.mjs, same
// contract as scripts/meshy-phase3-clips.mjs (sidecar bookkeeping; the
// generator owns state.json).
//
//   node scripts/meshy-boss-clips.mjs           # poll rigs, create+download clips
//   node scripts/meshy-boss-clips.mjs --strip   # strip meshes/textures from the
//                                               # downloaded clip GLBs (anim-only)
//
// Per boss character: run (free rig Running clip — no credits), attack,
// scream, hit, death (Meshy animation-library tasks, 3 credits each). Action
// ids were picked from api.meshy.ai/web/public/animations/resources to match
// each villain's identity (dagger flurry / charged slash / ground slam / ...).
//
// --strip rewrites raw/<char>-<clip>.glb IN PLACE as an ANIMATION-ONLY GLB
// (meshes, skins, materials and textures pruned; node hierarchy + animation
// kept). The runtime binds these clips onto the idle GLB's skeleton by track
// name (see MeshyRealmBoss), so shipping the mesh+texture again in every clip
// file would be pure waste — this is what keeps seven bosses inside the
// asset gate. Run it AFTER the fan-out completes, BEFORE meshy-optimize.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MESHY_DIR = join(ROOT, 'assets-src/meshy')
const RAW_DIR = join(MESHY_DIR, 'raw')
const STATE_PATH = join(MESHY_DIR, 'state.json')
const SIDECAR_PATH = join(MESHY_DIR, 'boss-clips.json')
const API = 'https://api.meshy.ai'

try {
  process.loadEnvFile(join(ROOT, '.env'))
} catch {
  /* rely on ambient env */
}
const KEY = process.env.MESHY_API_KEY
const STRIP = process.argv.includes('--strip')
if (!KEY && !STRIP) {
  console.error('MESHY_API_KEY missing — add it to .env')
  process.exit(1)
}

const ANIM_COST = 3
const CONCURRENCY = 3
const POLL_MS = 8000
const WAIT_RIG_TIMEOUT_MS = 100 * 60 * 1000

/* --------------------------------------------------------------- the plan */
// clip key → animation-library action id (null = the rig task's free Running
// clip). Round 2 (owner: full per-boss animation identity): EVERY clip is
// now unique per boss — no shared scream/hit/death library picks. When an
// action id here changes, the script detects the sidecar mismatch and
// regenerates that clip in place (same filename → same manifest id).
const PLAN = {
  // Double Combo (dagger flurry) / Sword Shout / Slap Reaction / crumple forward
  'character-boss-hider': { run: null, attack: 92, scream: 101, hit: 173, death: 184 },
  // Charged Slash / Strike Battle Pose / Hit Reaction / Knock Down
  'character-boss-mimic': { run: null, attack: 242, scream: 377, hit: 178, death: 187 },
  // Charged Ground Slam / Angry Ground Stomp / Hit Reaction 1 / Knock Down 1
  'character-boss-golem': { run: null, attack: 127, scream: 255, hit: 179, death: 190 },
  // Sword Judgment / Chest Pound Taunt / Hit to Waist / Dying Backwards
  'character-boss-gatekeeper': { run: null, attack: 102, scream: 88, hit: 171, death: 189 },
  // Jump Attack (pounce) / Zombie Scream / Face Punch Reaction 2 / Blown Back
  'character-boss-beast': { run: null, attack: 86, scream: 386, hit: 176, death: 182 },
  // Charged Spell Cast / Mage Cast flourish / Face Punch Reaction 1 / slow regal fall
  'character-boss-sphinx': { run: null, attack: 125, scream: 129, hit: 175, death: 185 },
  // Mage Cast / Shouting Angrily / Gunshot Reaction / abdominal collapse +
  // parryable Force-Slam / Mummy Stagger
  'character-boss-architect': { run: null, attack: 130, scream: 51, hit: 177, death: 188, slam: 127, stagger: 113 },
}

/* ---------------------------------------------------------------- sidecar */

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}
const sidecar = loadJson(SIDECAR_PATH, { createdAt: new Date().toISOString(), clips: {} })
sidecar.clips ??= {}

function saveSidecar() {
  sidecar.updatedAt = new Date().toISOString()
  const tmp = SIDECAR_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(sidecar, null, 2) + '\n')
  renameSync(tmp, SIDECAR_PATH)
}

function clipState(charId, clipKey) {
  const id = `${charId}-${clipKey}`
  sidecar.clips[id] ??= { charId, clipKey }
  return sidecar.clips[id]
}

/* -------------------------------------------------------------------- api */

let lastCall = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function throttle() {
  const wait = lastCall + 250 - Date.now()
  if (wait > 0) await sleep(wait)
  lastCall = Date.now()
}

async function api(pathname, { method = 'GET', body } = {}) {
  let delay = 2000
  for (let attempt = 1; attempt <= 8; attempt++) {
    await throttle()
    let res
    try {
      res = await fetch(API + pathname, {
        method,
        headers: {
          Authorization: `Bearer ${KEY}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      if (attempt === 8) throw err
      await sleep(delay)
      delay = Math.min(delay * 2, 60_000)
      continue
    }
    if (res.ok) return res.json()
    const text = await res.text().catch(() => '')
    if (res.status === 402) throw new Error(`402 out of credits: ${text.slice(0, 200)}`)
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || delay
      if (attempt === 8) throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 200)}`)
      await sleep(Math.min(retryAfter, 90_000))
      delay = Math.min(delay * 2, 60_000)
      continue
    }
    throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 300)}`)
  }
  throw new Error('unreachable')
}

const getBalance = async () => (await api('/openapi/v1/balance')).balance

async function download(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status} for ${destPath}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(destPath), { recursive: true })
  const tmp = destPath + '.tmp'
  writeFileSync(tmp, buf)
  renameSync(tmp, destPath)
  return buf.length
}

const t0 = Date.now()
function log(id, msg) {
  const s = ((Date.now() - t0) / 1000).toFixed(0).padStart(5)
  console.log(`${s}s  ${String(id).padEnd(36)} ${msg}`)
}

/* ------------------------------------------------------------- clip logic */

async function ensureRunClip(charId, rigTaskId) {
  const s = clipState(charId, 'run')
  const dest = join(RAW_DIR, `${charId}-run.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) return
  const task = await api(`/openapi/v1/rigging/${rigTaskId}`)
  const url = task.result?.basic_animations?.running_glb_url
  if (!url) throw new Error(`rig ${rigTaskId} has no running clip url`)
  const bytes = await download(url, dest)
  s.done = true
  s.source = `rig ${rigTaskId} (basic_animations.running — no extra credits)`
  s.bytes = bytes
  s.path = `assets-src/meshy/raw/${charId}-run.glb`
  saveSidecar()
  log(charId, `run clip (free rig running) → ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

async function runAnimClip(charId, clipKey, actionId, rigTaskId) {
  const s = clipState(charId, clipKey)
  const dest = join(RAW_DIR, `${charId}-${clipKey}.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) {
    if (s.actionId === actionId) {
      log(`${charId}-${clipKey}`, 'already downloaded — skipped')
      return
    }
    // The PLAN was re-pointed at a different library action — regenerate this
    // clip in place (same filename → same shipped manifest id).
    log(`${charId}-${clipKey}`, `action ${s.actionId} → ${actionId} — regenerating`)
    s.taskId = null
    s.status = null
    s.done = false
    s.attempts = 0
    s.error = null
    saveSidecar()
  }

  for (;;) {
    if (!s.taskId || s.status === 'FAILED' || s.status === 'CANCELED' || s.status === 'TIMEOUT') {
      if ((s.attempts ?? 0) >= 2) {
        s.gaveUp = true
        saveSidecar()
        log(`${charId}-${clipKey}`, `FAILED twice — moving on (${s.error ?? 'unknown'})`)
        return
      }
      const balance = await getBalance()
      const { result } = await api('/openapi/v1/animations', {
        method: 'POST',
        body: { rig_task_id: rigTaskId, action_id: actionId },
      })
      s.taskId = result
      s.status = 'PENDING'
      s.actionId = actionId
      s.error = null
      s.attempts = (s.attempts ?? 0) + 1
      saveSidecar()
      log(`${charId}-${clipKey}`, `action ${actionId} → created ${s.taskId} (balance ${balance})`)
    }
    try {
      const started = Date.now()
      for (;;) {
        if (Date.now() - started > 15 * 60 * 1000) throw new Error('timed out after 15 min')
        const task = await api(`/openapi/v1/animations/${s.taskId}`)
        if (task.status === 'SUCCEEDED') {
          const url = task.result?.animation_glb_url
          if (!url) throw new Error('succeeded but no animation_glb_url')
          const bytes = await download(url, dest)
          s.status = 'SUCCEEDED'
          s.done = true
          s.credits = task.consumed_credits ?? ANIM_COST
          s.bytes = bytes
          s.path = `assets-src/meshy/raw/${charId}-${clipKey}.glb`
          saveSidecar()
          log(`${charId}-${clipKey}`, `SUCCEEDED (${s.credits} cr, ${(bytes / 1024 / 1024).toFixed(2)} MB)`)
          return
        }
        if (task.status === 'FAILED' || task.status === 'CANCELED') {
          throw new Error(task.task_error?.message || task.status)
        }
        await sleep(POLL_MS)
      }
    } catch (err) {
      s.status = /timed out/.test(String(err)) ? 'TIMEOUT' : 'FAILED'
      s.error = String(err.message ?? err).slice(0, 300)
      saveSidecar()
      log(`${charId}-${clipKey}`, `${s.status}: ${s.error}`)
      // loop → retry once via the create branch
    }
  }
}

/* -------------------------------------------------------------- stripping */

/** Rewrite a clip GLB as animation-only: drop meshes/skins/materials/textures,
 *  keep the node hierarchy the animation tracks target. */
async function stripClips() {
  const { NodeIO } = await import('@gltf-transform/core')
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
  const { prune } = await import('@gltf-transform/functions')
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  let total = 0
  for (const charId of Object.keys(PLAN)) {
    const files = [
      // the rig-chain walk clip ships too — strip its mesh copy as well
      join(RAW_DIR, `${charId}.walk.glb`),
      ...Object.keys(PLAN[charId]).map((k) => join(RAW_DIR, `${charId}-${k}.glb`)),
    ]
    for (const file of files) {
      if (!existsSync(file)) continue
      const doc = await io.read(file)
      const root = doc.getRoot()
      if (root.listAnimations().length === 0) {
        console.log(`skip (no animation): ${file}`)
        continue
      }
      const before = statSync(file).size
      for (const mesh of root.listMeshes()) mesh.dispose()
      for (const skin of root.listSkins()) skin.dispose()
      for (const mat of root.listMaterials()) mat.dispose()
      for (const tex of root.listTextures()) tex.dispose()
      await doc.transform(prune())
      const bytes = await io.writeBinary(doc)
      writeFileSync(file, bytes)
      total++
      console.log(
        `stripped ${file.replace(ROOT + '/', '')}: ` +
        `${(before / 1024 / 1024).toFixed(2)} MB → ${(bytes.length / 1024).toFixed(0)} KB`,
      )
    }
  }
  console.log(`\nstripped ${total} clip GLBs to animation-only`)
}

/* ------------------------------------------------------------------- main */

const readGeneratorState = () => loadJson(STATE_PATH, { assets: {} })

async function main() {
  if (STRIP) {
    await stripClips()
    return
  }
  mkdirSync(RAW_DIR, { recursive: true })
  const before = await getBalance()
  const characters = Object.keys(PLAN)
  const pending = new Set(characters)
  const queue = []
  const rigIds = {}
  const started = Date.now()
  console.log(`boss clip fan-out: ${characters.length} characters, concurrency ${CONCURRENCY}, balance ${before}`)

  while (pending.size > 0) {
    const state = readGeneratorState()
    for (const charId of [...pending]) {
      const rig = state.assets?.[charId]?.rig
      if (rig?.status === 'SUCCEEDED' && rig.taskId) {
        rigIds[charId] = rig.taskId
        pending.delete(charId)
        for (const [clipKey, actionId] of Object.entries(PLAN[charId])) {
          queue.push({ charId, clipKey, actionId })
        }
        log(charId, `rig ready (${rig.taskId}) — ${Object.keys(PLAN[charId]).length} clips queued`)
      }
    }
    if (pending.size === 0) break
    if (Date.now() - started > WAIT_RIG_TIMEOUT_MS) {
      for (const charId of pending) log(charId, 'rig never appeared — skipping its clips')
      break
    }
    if (queue.length > 0) await drain(queue, rigIds)
    await sleep(15_000)
  }
  await drain(queue, rigIds)

  const done = Object.values(sidecar.clips).filter((s) => s.done).length
  const failed = Object.values(sidecar.clips).filter((s) => s.gaveUp).length
  const after = await getBalance().catch(() => null)
  console.log(`\nboss clip fan-out complete: ${done} downloaded, ${failed} given up`)
  console.log(`Balance: ${before} → ${after ?? '?'}`)
  if (failed > 0) process.exitCode = 1
}

async function drain(queue, rigIds) {
  async function worker() {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      try {
        if (job.actionId == null) await ensureRunClip(job.charId, rigIds[job.charId])
        else await runAnimClip(job.charId, job.clipKey, job.actionId, rigIds[job.charId])
      } catch (err) {
        const s = clipState(job.charId, job.clipKey)
        s.gaveUp = true
        s.error = String(err.message ?? err).slice(0, 300)
        saveSidecar()
        log(`${job.charId}-${job.clipKey}`, `ABORTED: ${s.error}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

main().catch((err) => {
  console.error(err)
  saveSidecar()
  process.exit(1)
})
