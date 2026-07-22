// Phase-3 clip fan-out — companion to scripts/meshy-wave2-clips.mjs and
// scripts/meshy-hero-clips2.mjs.
//
//   node scripts/meshy-phase3-clips.mjs
//
// Three clip groups, one script:
//   1. HERO motion fixes (rig already exists): vault/hurdle over obstacles,
//      dash candidates (charge burst + slide), run-takeoff jump, sprint-aim.
//      All RAW-ONLY retarget sources for scripts/bake-soldier-anims.mjs.
//   2. RESCUE civilian clips: cower / panic / relieved for the three EXISTING
//      citizen rigs (raw-only options) and the two NEW phase-3 civilians
//      (vendor/elder — cower+relieved SHIP via per-clip catalog entries;
//      panic and flee stay raw-only, walk/idle ship through the rig chain).
//      flee = the rig task's free Running clip, downloaded as -flee.glb.
//   3. BOSS Vex clips: ground-slam attack (ships) + zombie scream telegraph
//      (raw-only option).
//
// New-rig characters (vendor/elder/boss) are polled from state.json until
// meshy-generate.mjs (running concurrently) finishes their rig stage — same
// wait pattern as wave2. Sidecar: assets-src/meshy/phase3-clips.json;
// state.json stays owned by the generator.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MESHY_DIR = join(ROOT, 'assets-src/meshy')
const RAW_DIR = join(MESHY_DIR, 'raw')
const STATE_PATH = join(MESHY_DIR, 'state.json')
const SIDECAR_PATH = join(MESHY_DIR, 'phase3-clips.json')
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

const ANIM_COST = 3
const CONCURRENCY = 3
const POLL_MS = 8000
const WAIT_RIG_TIMEOUT_MS = 60 * 60 * 1000

/* --------------------------------------------------------------- the plan */
// action: style_02 library id; null = the rig task's free Running clip.
// Loop/one-shot semantics live in bake-soldier-anims.mjs / SOLDIER_CLIPS.md.

const RESCUE_CLIPS = {
  cower: { action: 258 }, // CrouchLookAroundBow — huddled crouch, scanning
  panic: { action: 333 }, // Look Around Dumbfounded — standing panicked scan
  relieved: { action: 298 }, // Cheer with Both Hands Up — rescued one-shot
}

const PLAN = {
  'character-hero-a': {
    vault: { action: 428 }, // Unarmed Vault — hand-plant vault over car-height obstacle
    hurdle: { action: 640 }, // Jump Over Obstacle (inplace) — running hurdle
    'dash-burst': { action: 673 }, // Standard Forward Charge (inplace) — burst-run dash candidate
    'dash-slide': { action: 516 }, // Slide Light — slide dash candidate
    'jump-run': { action: 463 }, // Run and Jump — moving takeoff/land (cleaner in-motion jump)
    'sprint-aim': { action: 654 }, // Rifle Charge (inplace) — sprint with weapon raised
  },
  'character-citizen-business': RESCUE_CLIPS,
  'character-citizen-hoodie': RESCUE_CLIPS,
  'character-citizen-worker': RESCUE_CLIPS,
  'character-civ-vendor': { ...RESCUE_CLIPS, flee: { action: null } },
  'character-civ-elder': { ...RESCUE_CLIPS, flee: { action: null } },
  'character-boss-vex': {
    slam: { action: 127 }, // Charged Ground Slam — AoE attack
    scream: { action: 386 }, // Zombie Scream — telegraph option (raw-only)
  },
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

async function ensureFleeClip(charId, rigTaskId) {
  const s = clipState(charId, 'flee')
  const dest = join(RAW_DIR, `${charId}-flee.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) return
  const task = await api(`/openapi/v1/rigging/${rigTaskId}`)
  const url = task.result?.basic_animations?.running_glb_url
  if (!url) throw new Error(`rig ${rigTaskId} has no running clip url`)
  const bytes = await download(url, dest)
  s.done = true
  s.source = `rig ${rigTaskId} (basic_animations.running — no extra credits)`
  s.bytes = bytes
  s.path = `assets-src/meshy/raw/${charId}-flee.glb`
  saveSidecar()
  log(charId, `flee clip (free rig running) → ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

async function runAnimClip(charId, clipKey, actionId, rigTaskId) {
  const s = clipState(charId, clipKey)
  const dest = join(RAW_DIR, `${charId}-${clipKey}.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) {
    log(`${charId}-${clipKey}`, 'already downloaded — skipped')
    return
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

/* ------------------------------------------------------------------- main */

const readGeneratorState = () => loadJson(STATE_PATH, { assets: {} })

async function main() {
  mkdirSync(RAW_DIR, { recursive: true })
  const before = await getBalance()
  const characters = Object.keys(PLAN)
  const pending = new Set(characters)
  const queue = []
  const rigIds = {}
  const started = Date.now()
  console.log(`phase-3 clip fan-out: ${characters.length} characters, concurrency ${CONCURRENCY}, balance ${before}`)

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
    if (queue.length > 0) await drain(queue, rigIds)
    await sleep(15_000)
  }
  await drain(queue, rigIds)

  const done = Object.values(sidecar.clips).filter((s) => s.done).length
  const failed = Object.values(sidecar.clips).filter((s) => s.gaveUp).length
  const after = await getBalance().catch(() => null)
  console.log(`\nphase-3 clip fan-out complete: ${done} downloaded, ${failed} given up`)
  console.log(`Balance: ${before} → ${after ?? '?'}`)
  if (failed > 0) process.exitCode = 1
}

async function drain(queue, rigIds) {
  async function worker() {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      try {
        if (job.actionId == null) await ensureFleeClip(job.charId, rigIds[job.charId])
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
