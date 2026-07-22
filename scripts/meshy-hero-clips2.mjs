// Phase-2 hero clip fan-out — companion to scripts/meshy-wave2-clips.mjs.
//
//   node scripts/meshy-hero-clips2.mjs
//
// Creates one animation task per (hero-a × action) from the Meshy animation
// action library and downloads each result GLB into
// assets-src/meshy/raw/character-hero-a-<clip>.glb. These clips are
// RAW-ONLY (no per-clip catalog entry, nothing ships under public/assets/
// meshy/) — they exist as retarget sources for scripts/bake-soldier-anims.mjs,
// which folds them into public/assets/models/soldier-anims.glb (bones +
// quaternion tracks only, ~KBs) for the default-player Soldier rig. Keeping
// them raw-only protects the 80 MB public/assets gate.
//
// Action ids come from https://api.meshy.ai/web/public/animations/resources
// (rigType style_02 — the Meshy auto-rig library). High-id entries (≥ ~600)
// are the "inplace" duplicates; preferred for locomotion because the
// controller owns all root translation (and the bake discards translation
// tracks anyway — rotation-only retarget).
//
// Durable + resumable via assets-src/meshy/hero-clips2.json (same sidecar
// pattern as wave2; state.json stays owned by meshy-generate.mjs).

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MESHY_DIR = join(ROOT, 'assets-src/meshy')
const RAW_DIR = join(MESHY_DIR, 'raw')
const STATE_PATH = join(MESHY_DIR, 'state.json')
const SIDECAR_PATH = join(MESHY_DIR, 'hero-clips2.json')
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

/* --------------------------------------------------------------- the plan */
// clip key → style_02 action id. All raw-only retarget sources for the
// Soldier bake (see header). Loop/one-shot semantics live in
// scripts/bake-soldier-anims.mjs CLIPS.
const HERO_A_CLIPS = {
  'sprint-shoot': 98, // Run and Shoot (no inplace variant exists; bake strips root motion)
  'strafe-left': 630, // ForwardLeft Run Fight (inplace) — guarded strafe-run L
  'strafe-right': 631, // ForwardRight Run Fight (inplace) — guarded strafe-run R
  'shoot-back': 680, // Walk Backward While Shooting (inplace) — backpedal fire
  'turn-left': 576, // Idle Turn Left — turn-in-place L
  'turn-right': 586, // Idle Turn Right — turn-in-place R
}
const CHAR_ID = 'character-hero-a'

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
  console.log(`${s}s  ${String(id).padEnd(30)} ${msg}`)
}

/* ------------------------------------------------------------- clip logic */

async function runAnimClip(clipKey, actionId, rigTaskId) {
  const id = `${CHAR_ID}-${clipKey}`
  sidecar.clips[id] ??= { charId: CHAR_ID, clipKey }
  const s = sidecar.clips[id]
  const dest = join(RAW_DIR, `${id}.glb`)
  if (s.done && existsSync(dest) && statSync(dest).size > 0) {
    log(id, 'already downloaded — skipped')
    return
  }

  for (;;) {
    if (!s.taskId || s.status === 'FAILED' || s.status === 'CANCELED' || s.status === 'TIMEOUT') {
      if ((s.attempts ?? 0) >= 2) {
        s.gaveUp = true
        saveSidecar()
        log(id, `FAILED twice — moving on (${s.error ?? 'unknown'})`)
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
      log(id, `action ${actionId} → created ${s.taskId} (balance ${balance})`)
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
          s.path = `assets-src/meshy/raw/${id}.glb`
          saveSidecar()
          log(id, `SUCCEEDED (${s.credits} cr, ${(bytes / 1024 / 1024).toFixed(2)} MB)`)
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
      log(id, `${s.status}: ${s.error}`)
      // loop → retry once via the create branch
    }
  }
}

/* ------------------------------------------------------------------- main */

async function main() {
  const state = loadJson(STATE_PATH, { assets: {} })
  const rig = state.assets?.[CHAR_ID]?.rig
  if (rig?.status !== 'SUCCEEDED' || !rig.taskId) {
    console.error(`${CHAR_ID} has no successful rig task in state.json`)
    process.exit(1)
  }
  mkdirSync(RAW_DIR, { recursive: true })
  const before = await getBalance()
  console.log(`hero clip fan-out: ${Object.keys(HERO_A_CLIPS).length} clips on rig ${rig.taskId}, balance ${before}`)

  const queue = Object.entries(HERO_A_CLIPS)
  async function worker() {
    for (;;) {
      const job = queue.shift()
      if (!job) return
      await runAnimClip(job[0], job[1], rig.taskId)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const done = Object.values(sidecar.clips).filter((s) => s.done).length
  const failed = Object.values(sidecar.clips).filter((s) => s.gaveUp).length
  const after = await getBalance().catch(() => null)
  console.log(`\nhero clip fan-out complete: ${done} downloaded, ${failed} given up`)
  console.log(`Balance: ${before} → ${after ?? '?'}`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  saveSidecar()
  process.exit(1)
})
