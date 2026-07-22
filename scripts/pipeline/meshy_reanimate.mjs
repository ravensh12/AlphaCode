// meshy_reanimate.mjs — FULL player-animation regeneration (owner directive:
// "delete all current animations and remake them with Meshy").
//
// Drives the Meshy REST API end-to-end for the CYBORG player character:
//   1. uploads the character's static bind-pose mesh (extract_static_mesh.mjs
//      output) as a Data URI to POST /openapi/v1/rigging → a FRESH rig task
//      on this exact character,
//   2. downloads the rig's free Walking/Running clips,
//   3. creates one animation task per entry in CLIP_PLAN below (the action ids
//      were hand-picked from api.meshy.ai/web/public/animations/resources) and
//      downloads each result into assets-src/meshy/raw/cyborg2-<clip>.glb.
//
// The downloaded GLBs are MOTION SOURCES for the rest-delta bake
// (build_cast.mjs → retarget_meshy_native.py): textures get stripped, the clip
// is re-anchored onto the shipped optimized cyborg rig, and sync_web.mjs lands
// the final single GLB at public/world/characters/cyborg.glb.
//
// Durable + resumable via assets-src/meshy/cyborg-reanim.json: re-runs skip
// completed work and re-poll in-flight tasks.
//
//   node scripts/pipeline/meshy_reanimate.mjs                 # everything
//   node scripts/pipeline/meshy_reanimate.mjs --only sprint   # one clip
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const RAW_DIR = join(ROOT, 'assets-src/meshy/raw')
const SIDECAR_PATH = join(ROOT, 'assets-src/meshy/cyborg-reanim.json')
const STATIC_MESH = join(ROOT, 'assets/build/cyborg-static.glb')
const API = 'https://api.meshy.ai'

try {
  process.loadEnvFile(join(ROOT, '.env'))
} catch {
  /* rely on ambient env */
}
const KEY = process.env.MESHY_API_KEY
if (!KEY) {
  console.error('MESHY_API_KEY missing — add it to .env')
  process.exit(1)
}

const ONLY = (() => {
  const i = process.argv.indexOf('--only')
  return i >= 0 ? process.argv[i + 1] : null
})()

const CONCURRENCY = 4
const POLL_MS = 8000
const ANIM_TIMEOUT_MS = 20 * 60 * 1000

/* ----------------------------------------------------------- THE CLIP PLAN
   Candidate-rich on purpose (owner: use as many credits as needed): several
   options per critical state; the visual pick happens on OUR character via
   scripts/view-model.mjs screenshots before the bake. action:null = the rig
   task's free basic animation ('walking' | 'running').                     */
export const CLIP_PLAN = {
  // locomotion
  'walk-free': { free: 'walking' }, // rig freebie — neutral walk
  'run-free': { free: 'running' }, // rig freebie — neutral run
  'walk-fight': { action: 689 }, // Walk Fight Forward (inplace) — combat walk
  'run-fast3': { action: 659 }, // Run Fast 3 (inplace)
  'run-fast7': { action: 663 }, // Run Fast 7 (inplace)
  sprint: { action: 644 }, // Lean Forward Sprint (inplace) — THE sprint
  'sprint-charge': { action: 673 }, // Standard Forward Charge (inplace) — alt
  // idle
  'idle-combat': { action: 89 }, // Combat Idle stance
  'idle-3': { action: 243 }, // neutral Idle 3
  // jump
  jump: { action: 466 }, // Regular Jump
  'jump-run': { action: 463 }, // Run and Jump — moving takeoff
  // parkour hurdle/vault candidates (the headline feature)
  'vault-parkour': { action: 429 }, // Parkour Vault
  'vault-parkour1': { action: 431 }, // Parkour Vault 1
  'vault-parkour2': { action: 432 }, // Parkour Vault 2
  'vault-parkour3': { action: 433 }, // Parkour Vault 3
  'vault-roll': { action: 651 }, // Parkour Vault with Roll (inplace)
  'vault-obstacle': { action: 640 }, // Jump Over Obstacle (inplace)
  'vault-rifle': { action: 425 }, // Vault with Rifle
  // shooting
  'shoot-walk': { action: 690 }, // Walk Forward While Shooting (inplace)
  'shoot-side': { action: 104 }, // Side Shot — standing fire one-shot
  'shoot-run': { action: 98 }, // Run and Shoot — THE sprint-shoot
  'shoot-charge': { action: 654 }, // Rifle Charge (inplace) — alt sprint-shoot
  // directional
  'strafe-gunL': { action: 694 }, // Walk Left with Gun (inplace)
  'strafe-fightL': { action: 630 }, // ForwardLeft Run Fight (inplace)
  'strafe-fightR': { action: 631 }, // ForwardRight Run Fight (inplace)
  'back-gun': { action: 685 }, // Walk Backward with Gun (inplace)
  // stance / one-shots
  crouch: { action: 616 }, // Cautious Crouch Walk Forward (inplace)
  slash: { action: 219 }, // Right-hand Sword Slash (blade dash swing)
  hit: { action: 178 }, // Hit Reaction
  death: { action: 183 }, // Shot and Fall Backward
  victory: { action: 403 }, // Victory Fist Pump
  'turn-left': { action: 573 }, // Rifle Turn Left
  'turn-right': { action: 585 }, // Rifle Aim Turn Right
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
  console.log(`${s}s  ${String(id).padEnd(18)} ${msg}`)
}

/* ------------------------------------------------------------------- rig */
async function ensureRig() {
  sidecar.rig ??= {}
  const r = sidecar.rig
  if (r.taskId && r.status === 'SUCCEEDED') return r.taskId

  if (!r.taskId || r.status === 'FAILED' || r.status === 'CANCELED') {
    if (!existsSync(STATIC_MESH)) {
      throw new Error(`missing ${STATIC_MESH} — run extract_static_mesh.mjs first`)
    }
    const b64 = readFileSync(STATIC_MESH).toString('base64')
    log('rig', `uploading static mesh (${(b64.length / 1024 / 1024).toFixed(1)} MB base64)…`)
    const { result } = await api('/openapi/v1/rigging', {
      method: 'POST',
      body: {
        model_url: `data:model/gltf-binary;base64,${b64}`,
        height_meters: 1.8,
      },
    })
    r.taskId = result
    r.status = 'PENDING'
    saveSidecar()
    log('rig', `created rig task ${r.taskId}`)
  }

  const started = Date.now()
  for (;;) {
    if (Date.now() - started > 40 * 60 * 1000) throw new Error('rig timed out after 40 min')
    const task = await api(`/openapi/v1/rigging/${r.taskId}`)
    if (task.status === 'SUCCEEDED') {
      r.status = 'SUCCEEDED'
      r.result = {
        rigged: task.result?.rigged_character_glb_url,
        walking: task.result?.basic_animations?.walking_glb_url,
        running: task.result?.basic_animations?.running_glb_url,
      }
      saveSidecar()
      log('rig', 'SUCCEEDED')
      return r.taskId
    }
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      r.status = task.status
      r.error = task.task_error?.message || task.status
      saveSidecar()
      throw new Error(`rig ${task.status}: ${r.error}`)
    }
    log('rig', `${task.status} ${task.progress ?? ''}`)
    await sleep(POLL_MS)
  }
}

async function ensureRiggedDownload() {
  const dest = join(RAW_DIR, 'cyborg2.rigged.glb')
  if (existsSync(dest) && statSync(dest).size > 0) return
  const url = sidecar.rig?.result?.rigged
  if (!url) throw new Error('rig result has no rigged_character_glb_url')
  const bytes = await download(url, dest)
  log('rig', `rigged character → ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

/* ------------------------------------------------------------- clip logic */
function clipState(key) {
  sidecar.clips[key] ??= { key }
  return sidecar.clips[key]
}

async function ensureFreeClip(key, which, rigTaskId) {
  const s = clipState(key)
  const dest = join(RAW_DIR, `cyborg2-${key}.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) return
  let url = sidecar.rig?.result?.[which]
  if (!url) {
    const task = await api(`/openapi/v1/rigging/${rigTaskId}`)
    url = task.result?.basic_animations?.[`${which}_glb_url`]
  }
  if (!url) throw new Error(`rig has no free '${which}' clip url`)
  const bytes = await download(url, dest)
  s.done = true
  s.source = `rig ${rigTaskId} basic_animations.${which} (free)`
  s.bytes = bytes
  saveSidecar()
  log(key, `free ${which} clip → ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

async function runAnimClip(key, actionId, rigTaskId) {
  const s = clipState(key)
  const dest = join(RAW_DIR, `cyborg2-${key}.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) {
    log(key, 'already downloaded — skipped')
    return
  }

  for (;;) {
    if (!s.taskId || s.status === 'FAILED' || s.status === 'CANCELED' || s.status === 'TIMEOUT') {
      if ((s.attempts ?? 0) >= 3) {
        s.gaveUp = true
        saveSidecar()
        log(key, `FAILED ${s.attempts} times — moving on (${s.error ?? 'unknown'})`)
        return
      }
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
      log(key, `action ${actionId} → created ${s.taskId}`)
    }
    try {
      const started = Date.now()
      for (;;) {
        if (Date.now() - started > ANIM_TIMEOUT_MS) throw new Error('timed out')
        const task = await api(`/openapi/v1/animations/${s.taskId}`)
        if (task.status === 'SUCCEEDED') {
          const url = task.result?.animation_glb_url
          if (!url) throw new Error('succeeded but no animation_glb_url')
          const bytes = await download(url, dest)
          s.status = 'SUCCEEDED'
          s.done = true
          s.bytes = bytes
          saveSidecar()
          log(key, `SUCCEEDED → ${(bytes / 1024 / 1024).toFixed(2)} MB`)
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
      log(key, `${s.status}: ${s.error}`)
      // loop → retry via the create branch (bounded by attempts)
    }
  }
}

/* ------------------------------------------------------------------- main */
async function main() {
  mkdirSync(RAW_DIR, { recursive: true })
  const balance = (await api('/openapi/v1/balance')).balance
  log('start', `balance ${balance}`)

  const rigTaskId = await ensureRig()
  await ensureRiggedDownload()

  const jobs = Object.entries(CLIP_PLAN).filter(([k]) => !ONLY || k === ONLY)
  const queue = [...jobs]
  async function worker() {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      const [key, spec] = job
      try {
        if (spec.free) await ensureFreeClip(key, spec.free, rigTaskId)
        else await runAnimClip(key, spec.action, rigTaskId)
      } catch (err) {
        const s = clipState(key)
        s.gaveUp = true
        s.error = String(err.message ?? err).slice(0, 300)
        saveSidecar()
        log(key, `ABORTED: ${s.error}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const done = Object.values(sidecar.clips).filter((s) => s.done).length
  const failed = Object.values(sidecar.clips).filter((s) => s.gaveUp).length
  const after = (await api('/openapi/v1/balance').catch(() => null))?.balance
  console.log(`\nreanimate: ${done} clips downloaded, ${failed} failed. Balance ${balance} → ${after ?? '?'}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  saveSidecar()
  process.exit(1)
})
