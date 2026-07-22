// Wave-2 animation fan-out — companion to scripts/meshy-generate.mjs.
//
//   node scripts/meshy-wave2-clips.mjs           # poll rigs, create+download clips
//   node scripts/meshy-wave2-clips.mjs --merge   # fold results into state.json
//                                                # (ONLY after meshy-generate exits)
//
// The stock generator handles preview → refine → rig → walk + idle per rigged
// character. This wrapper adds the wave-2 clip fan-out the generator has no
// flag for:
//   1. downloads the rig task's FREE Running clip (already paid for by the
//      rig task; the generator only grabs Walking),
//   2. creates one animation task per (character × action) from the Meshy
//      animation action library and downloads each result GLB into
//      assets-src/meshy/raw/<character>-<clip>.glb — i.e. named as its own
//      catalog id so meshy-optimize.mjs ships it via a per-clip catalog entry,
//   3. bookkeeps into assets-src/meshy/wave2-clips.json while the generator
//      owns state.json (the generator rewrites state.json wholesale from its
//      own memory, so writing it concurrently would lose data). `--merge`
//      folds the sidecar into state.json as done entries once the generator
//      has exited.
//
// Durable + resumable: every task id / download is persisted to the sidecar
// after each change; re-runs skip completed work and re-poll in-flight tasks.
// Individual actions that fail twice are recorded and skipped (never fatal).
//
// Action ids come from https://api.meshy.ai/web/public/animations/resources
// (the docs' Animation Library). "inplace" variants are chosen for
// controller-driven locomotion so the game moves the character, not the clip.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MESHY_DIR = join(ROOT, 'assets-src/meshy')
const RAW_DIR = join(MESHY_DIR, 'raw')
const STATE_PATH = join(MESHY_DIR, 'state.json')
const SIDECAR_PATH = join(MESHY_DIR, 'wave2-clips.json')
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

const MERGE = process.argv.includes('--merge')
const RESERVE = 500
const ANIM_COST = 3
const CONCURRENCY = 3 // generator runs at 5 concurrently; Pro queue cap is 10
const POLL_MS = 8000
const WAIT_RIG_TIMEOUT_MS = 100 * 60 * 1000

/* --------------------------------------------------------------- the plan */
// clip key → { action id, ship } per character. `ship: true` means a per-clip
// catalog entry will ship the optimized GLB; ship:false clips stay raw-only
// (VAT bake sources / engine-agent options) to protect the 80 MB asset gate.
// Hero A carries the full showcase set; hero B ships the core controller set
// (cut order: B's exotic clips are the first budget cut). Both GENERATE the
// full set — raw downloads are cheap, shipping is the scarce resource.

const HERO_ACTIONS = {
  run: { action: null, ship: true }, // free — rig task Running clip
  sprint: { action: 644, ship: true }, // Lean Forward Sprint (inplace)
  jump: { action: 466, ship: true }, // Regular Jump
  crouch: { action: 616, ship: true }, // Cautious Crouch Walk Forward (inplace)
  'crouch-idle': { action: 258, ship: false }, // CrouchLookAroundBow (raw option)
  dash: { action: 158, ship: true }, // Roll Dodge
  slash: { action: 219, ship: true }, // Right-hand Sword Slash (blade dash swing)
  shoot: { action: 690, ship: true }, // Walk Forward While Shooting (inplace)
  aim: { action: 89, ship: false }, // Combat Stance (raw option)
  hit: { action: 178, ship: true }, // Hit Reaction
  victory: { action: 59, ship: true }, // Victory Cheer
  dance: { action: 64, ship: false }, // All Night Dance (cinematic option)
  punch: { action: 214, ship: false }, // Punch Forward with Both Fists (option)
}

/** Hero B generates everything but only ships the core controller set. */
const HERO_B_SHIP = new Set(['run', 'sprint', 'jump', 'crouch', 'dash', 'shoot'])

const CITIZEN_ACTIONS = {
  run: { action: null, ship: false }, // free rig clip — crowd-bake source
  wave: { action: 290, ship: false }, // Wave One Hand — bake-citizen-anim needs a Wave
}

const zombieActions = (walkAction) => ({
  shamble: { action: walkAction, ship: true }, // menacing gait (zombie walk)
  run: { action: null, ship: true }, // free rig clip
  attack: { action: 214, ship: true }, // Punch Forward with Both Fists → "Punch"
  scream: { action: 386, ship: true }, // Zombie Scream → telegraph/Idle_Attack
  hit: { action: 178, ship: false }, // Hit Reaction — VAT bake source
  death: { action: 183, ship: false }, // Shot and Fall Backward — VAT bake source
})

const PLAN = {
  'character-hero-a': HERO_ACTIONS,
  'character-hero-b': Object.fromEntries(
    Object.entries(HERO_ACTIONS).map(([k, v]) => [k, { ...v, ship: HERO_B_SHIP.has(k) }]),
  ),
  'character-citizen-business': CITIZEN_ACTIONS,
  'character-citizen-hoodie': CITIZEN_ACTIONS,
  'character-citizen-worker': CITIZEN_ACTIONS,
  'character-zombie-android': zombieActions(112), // Frankenstein/Monster Walk
  'character-zombie-secbot': zombieActions(123), // Unsteady Walk
  'character-zombie-flesh': zombieActions(112), // Frankenstein/Monster Walk
  'character-zombie-hulk': zombieActions(123), // Unsteady Walk
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
  console.log(`${s}s  ${String(id).padEnd(34)} ${msg}`)
}

/* ------------------------------------------------------------- clip logic */

/** Re-read state.json (written atomically by the generator — safe to read). */
const readGeneratorState = () => loadJson(STATE_PATH, { assets: {} })

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
  log(charId, `run clip (free from rig) → ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

async function runAnimClip(charId, clipKey, actionId, rigTaskId) {
  const s = clipState(charId, clipKey)
  const dest = join(RAW_DIR, `${charId}-${clipKey}.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) return

  for (;;) {
    if (!s.taskId || s.status === 'FAILED' || s.status === 'CANCELED' || s.status === 'TIMEOUT') {
      if ((s.attempts ?? 0) >= 2) {
        s.gaveUp = true
        saveSidecar()
        log(charId, `${clipKey} FAILED twice — moving on (${s.error ?? 'unknown'})`)
        return
      }
      const balance = await getBalance()
      if (balance - ANIM_COST < RESERVE) {
        s.gaveUp = true
        s.error = `skipped — balance ${balance} at reserve ${RESERVE}`
        saveSidecar()
        log(charId, `${clipKey} skipped — reserve floor reached (balance ${balance})`)
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
      log(charId, `${clipKey} (action ${actionId}) → created ${s.taskId} (balance ${balance})`)
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
          log(charId, `${clipKey} → SUCCEEDED (${s.credits} cr, ${(bytes / 1024 / 1024).toFixed(2)} MB)`)
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
      log(charId, `${clipKey} → ${s.status}: ${s.error}`)
      // loop → retry once via the create branch
    }
  }
}

/* ------------------------------------------------------------------ merge */

function merge() {
  const state = readGeneratorState()
  state.assets ??= {}
  let added = 0
  for (const [id, s] of Object.entries(sidecar.clips)) {
    // EVERY planned clip id gets done:true — the per-clip catalog entries must
    // never reach text-to-3d on a future meshy-generate resume (their "prompt"
    // is a provenance note, not a real prompt). Failed clips carry the error;
    // the optimizer already skips ids with no raw file on disk.
    state.assets[id] = {
      name: `${s.charId} — ${s.clipKey} clip`,
      wave2Clip: true,
      charId: s.charId,
      ...(s.taskId
        ? { anim: { taskId: s.taskId, actionId: s.actionId, status: s.status, credits: s.credits ?? ANIM_COST } }
        : { anim: { source: s.source ?? 'rig task basic_animations (free)' } }),
      ...(s.done
        ? { files: { raw: { path: s.path, bytes: s.bytes } } }
        : { error: s.error ?? 'not downloaded' }),
      done: true,
    }
    added++
  }
  state.updatedAt = new Date().toISOString()
  const tmp = STATE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  renameSync(tmp, STATE_PATH)
  console.log(`merged ${added} clip entries into state.json`)
}

/* ------------------------------------------------------------------- main */

async function main() {
  if (MERGE) {
    merge()
    return
  }
  mkdirSync(RAW_DIR, { recursive: true })

  // Build the work list: every (character, clip) pair still outstanding.
  const characters = Object.keys(PLAN)
  const pending = new Set(characters)
  const queue = []
  const started = Date.now()

  console.log(`clip fan-out: ${characters.length} characters, concurrency ${CONCURRENCY}, reserve ${RESERVE}`)

  // Poll state.json until each character's rig id shows up, then enqueue its
  // clip jobs. Characters whose generation ultimately failed are dropped when
  // the wait times out.
  const rigIds = {}
  while (pending.size > 0) {
    const state = readGeneratorState()
    for (const charId of [...pending]) {
      const rig = state.assets?.[charId]?.rig
      if (rig?.status === 'SUCCEEDED' && rig.taskId) {
        rigIds[charId] = rig.taskId
        pending.delete(charId)
        for (const [clipKey, spec] of Object.entries(PLAN[charId])) {
          queue.push({ charId, clipKey, actionId: spec.action })
        }
        log(charId, `rig ready (${rig.taskId}) — ${Object.keys(PLAN[charId]).length} clips queued`)
      }
    }
    if (pending.size === 0) break
    if (Date.now() - started > WAIT_RIG_TIMEOUT_MS) {
      for (const charId of pending) log(charId, 'rig never appeared — skipping its clips')
      break
    }
    // Drain whatever is already queued while waiting for the stragglers.
    if (queue.length > 0) await drain(queue, rigIds)
    await sleep(15_000)
  }
  await drain(queue, rigIds)

  const done = Object.values(sidecar.clips).filter((s) => s.done).length
  const failed = Object.values(sidecar.clips).filter((s) => s.gaveUp).length
  console.log(`\nclip fan-out complete: ${done} clips downloaded, ${failed} given up`)
  console.log('run `node scripts/meshy-wave2-clips.mjs --merge` AFTER meshy-generate exits')
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
        log(job.charId, `${job.clipKey} ABORTED: ${s.error}`)
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
