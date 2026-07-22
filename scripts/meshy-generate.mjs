// Meshy AI batch generator — Living Code City asset library.
//
//   node scripts/meshy-generate.mjs [--tier=1|2|3] [--only=id,id] [--dry-run]
//                                   [--concurrency=4] [--reserve=900]
//
// For every catalog entry (scripts/meshy-catalog.mjs):
//   text-to-3d preview (mesh) → refine (PBR textures) → download GLB to
//   assets-src/meshy/raw/<id>.glb. Entries with rig:true additionally run
//   auto-rigging (walk clip included) + an Idle animation task and download
//   those GLBs alongside the static one.
//
// Durable: every task id / status / download is persisted to
// assets-src/meshy/state.json after each change, so re-runs resume exactly
// where the last run stopped (completed work is skipped, in-flight Meshy
// tasks are re-polled instead of re-created). Also rewrites
// assets-src/meshy/MESHY_ASSETS.md (provenance doc) from state after a run.
//
// Reads MESHY_API_KEY from process.env, loading .env via Node's built-in
// loadEnvFile (no dotenv dependency needed on Node ≥20.12).
//
// API reference (verified 2026-07): https://docs.meshy.ai
//   POST /openapi/v2/text-to-3d          create preview/refine task
//   GET  /openapi/v2/text-to-3d/:id      poll task
//   POST /openapi/v1/rigging             create rigging task
//   GET  /openapi/v1/rigging/:id         poll rigging task
//   POST /openapi/v1/animations          create animation task
//   GET  /openapi/v1/animations/:id      poll animation task
//   GET  /openapi/v1/balance             credit balance
// Credits (Meshy-6): preview 20, refine 10, rigging 5, animation 3.

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MESHY_CATALOG } from './meshy-catalog.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MESHY_DIR = join(ROOT, 'assets-src/meshy')
const RAW_DIR = join(MESHY_DIR, 'raw')
const STATE_PATH = join(MESHY_DIR, 'state.json')
const DOC_PATH = join(MESHY_DIR, 'MESHY_ASSETS.md')
const API = 'https://api.meshy.ai'

/* ------------------------------------------------------------------ env */

try {
  process.loadEnvFile(join(ROOT, '.env'))
} catch {
  /* no .env — rely on the ambient environment */
}
const KEY = process.env.MESHY_API_KEY
const AI_MODEL = process.env.MESHY_AI_MODEL || 'latest' // 'latest' == Meshy-6

/* ------------------------------------------------------------------ cli */

function flagValue(name, fallback) {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
  return arg ? arg.split('=').slice(1).join('=') : fallback
}
const DRY_RUN = process.argv.includes('--dry-run')
const TIER = flagValue('tier', null)
const ONLY = flagValue('only', null)?.split(',').map((s) => s.trim()).filter(Boolean)
const CONCURRENCY = Math.max(1, Number(flagValue('concurrency', 4)))
/** Stop creating new tasks when balance would drop below this. */
const RESERVE = Math.max(0, Number(flagValue('reserve', 900)))

const POLL_MS = 8000
const TASK_TIMEOUT_MS = 30 * 60 * 1000
/** Meshy-6 credit costs, used for --dry-run estimates and reserve guard. */
const COST = { preview: 20, refine: 10, rig: 5, anim: 3 }

/* ---------------------------------------------------------------- state */

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return { createdAt: new Date().toISOString(), assets: {} }
  }
}
const state = loadState()
state.assets ??= {}

function saveState() {
  state.updatedAt = new Date().toISOString()
  mkdirSync(MESHY_DIR, { recursive: true })
  const tmp = STATE_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n')
  renameSync(tmp, STATE_PATH)
}

function assetState(id) {
  state.assets[id] ??= {}
  return state.assets[id]
}

/* ------------------------------------------------------------------ api */

let lastCall = 0
/** Global throttle: ≥150 ms between API calls (limit is 20 req/s). */
async function throttle() {
  const wait = lastCall + 150 - Date.now()
  if (wait > 0) await sleep(wait)
  lastCall = Date.now()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class FatalApiError extends Error {}

/**
 * Meshy API call with retry/backoff. Retries 429 (rate limit / queue full)
 * and 5xx/network errors; 402 (out of credits) is fatal; other 4xx throw.
 */
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
    if (res.status === 402) {
      throw new FatalApiError(`402 Payment Required — out of credits (${text.slice(0, 200)})`)
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || delay
      if (attempt === 8) {
        throw new Error(`${method} ${pathname} → ${res.status} after ${attempt} attempts: ${text.slice(0, 200)}`)
      }
      await sleep(Math.min(retryAfter, 90_000))
      delay = Math.min(delay * 2, 60_000)
      continue
    }
    throw new Error(`${method} ${pathname} → ${res.status}: ${text.slice(0, 300)}`)
  }
  throw new Error('unreachable')
}

async function getBalance() {
  const { balance } = await api('/openapi/v1/balance')
  return balance
}

/** Download a (signed, no-auth) asset URL to disk atomically. */
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

/* ------------------------------------------------------- balance guard */

let stopCreating = false
let lastKnownBalance = null

/** True if we may spend `credits` while keeping the reserve intact. */
async function mayCreate(credits) {
  if (stopCreating) return false
  lastKnownBalance = await getBalance()
  if (lastKnownBalance - credits < RESERVE) {
    stopCreating = true
    log('!', `balance ${lastKnownBalance} would drop below reserve ${RESERVE} — no new tasks`)
    return false
  }
  return true
}

/* -------------------------------------------------------------- logging */

const t0 = Date.now()
function log(id, msg) {
  const s = ((Date.now() - t0) / 1000).toFixed(0).padStart(5)
  console.log(`${s}s  ${String(id).padEnd(26)} ${msg}`)
}

/* ----------------------------------------------------------- task steps */

/**
 * Poll a task endpoint until terminal status; logs status changes and 25%
 * progress steps. Returns the final task object.
 */
async function pollTask(pathname, label, id) {
  const started = Date.now()
  let lastLogged = ''
  for (;;) {
    if (Date.now() - started > TASK_TIMEOUT_MS) throw new Error(`${label} timed out after 30 min`)
    const task = await api(pathname)
    const marker = `${task.status}:${Math.floor((task.progress ?? 0) / 25)}`
    if (marker !== lastLogged) {
      lastLogged = marker
      if (task.status === 'IN_PROGRESS') log(id, `${label} → ${task.progress ?? 0}%`)
      else if (task.status === 'PENDING' && task.preceding_tasks > 0) {
        log(id, `${label} → queued behind ${task.preceding_tasks}`)
      }
    }
    if (task.status === 'SUCCEEDED') return task
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      const reason = task.task_error?.message || task.status
      throw new Error(`${label} ${task.status}: ${reason}`)
    }
    await sleep(POLL_MS)
  }
}

/**
 * Run one stage (preview/refine/rig/anim) with resume + one automatic retry.
 * `stage` state shape: { taskId, status, credits, error, attempts }.
 */
async function runStage(entry, stageKey, { cost, create, poll, label }) {
  const a = assetState(entry.id)
  a[stageKey] ??= {}
  const s = a[stageKey]
  if (s.status === 'SUCCEEDED') return s

  for (;;) {
    if (!s.taskId || s.status === 'FAILED' || s.status === 'CANCELED' || s.status === 'TIMEOUT') {
      if ((s.attempts ?? 0) >= 2) throw new Error(`${label} failed twice: ${s.error ?? 'unknown'}`)
      if (!(await mayCreate(cost))) throw new Error(`skipped ${label} — credit reserve reached`)
      s.taskId = await create()
      s.status = 'PENDING'
      s.error = null
      s.attempts = (s.attempts ?? 0) + 1
      saveState()
      log(entry.id, `${label} → created ${s.taskId} (balance ${lastKnownBalance})`)
    }
    try {
      const task = await poll(s.taskId)
      s.status = 'SUCCEEDED'
      s.credits = task.consumed_credits ?? cost
      s.finishedAt = new Date().toISOString()
      saveState()
      log(entry.id, `${label} → SUCCEEDED (${s.credits} credits)`)
      return { ...s, task }
    } catch (err) {
      if (err instanceof FatalApiError) throw err
      s.status = /timed out/.test(String(err)) ? 'TIMEOUT' : 'FAILED'
      s.error = String(err.message ?? err).slice(0, 500)
      saveState()
      log(entry.id, `${label} → ${s.status}: ${s.error}`)
      if ((s.attempts ?? 0) >= 2) throw err
      // loop → recreate once
    }
  }
}

/** Download helper with state bookkeeping; skips existing files. */
async function ensureDownload(entry, key, url, destPath) {
  const a = assetState(entry.id)
  a.files ??= {}
  const rel = destPath.replace(ROOT + '/', '')
  if (a.files[key] && existsSync(destPath) && statSync(destPath).size > 0) return
  const bytes = await download(url, destPath)
  a.files[key] = { path: rel, bytes }
  saveState()
  log(entry.id, `download → ${rel} (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
}

/* ------------------------------------------------- per-asset pipeline */

async function processAsset(entry) {
  const a = assetState(entry.id)
  a.name = entry.name
  a.tier = entry.tier

  // 1. preview (mesh)
  const preview = await runStage(entry, 'preview', {
    cost: COST.preview,
    label: 'preview ',
    create: async () => {
      const body = {
        mode: 'preview',
        prompt: entry.prompt,
        ai_model: AI_MODEL,
        should_remesh: true,
        topology: 'triangle',
        target_polycount: entry.targetPolycount ?? (entry.sizeClass === 'hero' ? 30000 : 12000),
        target_formats: ['glb'],
        auto_size: true,
        origin_at: 'bottom',
      }
      // negative_prompt is deprecated (no-op) on v2 but still accepted; sent
      // for provenance parity with the catalog. art_style only exists < Meshy-6.
      if (entry.negativePrompt) body.negative_prompt = entry.negativePrompt
      if (AI_MODEL === 'meshy-5' && entry.artStyle) body.art_style = entry.artStyle
      if (entry.rig) body.pose_mode = 'a-pose'
      const { result } = await api('/openapi/v2/text-to-3d', { method: 'POST', body })
      return result
    },
    poll: (id) => pollTask(`/openapi/v2/text-to-3d/${id}`, 'preview ', entry.id),
  })

  // 2. refine (PBR textures)
  const refine = await runStage(entry, 'refine', {
    cost: COST.refine,
    label: 'refine  ',
    create: async () => {
      const { result } = await api('/openapi/v2/text-to-3d', {
        method: 'POST',
        body: {
          mode: 'refine',
          preview_task_id: preview.taskId,
          enable_pbr: true,
          ai_model: AI_MODEL,
          target_formats: ['glb'],
        },
      })
      return result
    },
    poll: (id) => pollTask(`/openapi/v2/text-to-3d/${id}`, 'refine  ', entry.id),
  })

  // 3. download textured GLB
  const glbUrl = refine.task?.model_urls?.glb ?? a.refine.glbUrl
  if (!glbUrl) {
    // resumed run where the refine task object wasn't kept — re-fetch it
    const task = await api(`/openapi/v2/text-to-3d/${a.refine.taskId}`)
    a.refine.glbUrl = task.model_urls?.glb
    saveState()
  } else {
    a.refine.glbUrl = glbUrl
  }
  if (!a.refine.glbUrl) throw new Error('refine task has no GLB url')
  await ensureDownload(entry, 'raw', a.refine.glbUrl, join(RAW_DIR, `${entry.id}.glb`))

  // 4. Tier 3 characters: auto-rig (includes walk clip) + Idle animation
  if (entry.rig) await rigAndAnimate(entry)

  a.done = true
  saveState()
}

async function rigAndAnimate(entry) {
  const a = assetState(entry.id)

  const rig = await runStage(entry, 'rig', {
    cost: COST.rig,
    label: 'rig     ',
    create: async () => {
      const { result } = await api('/openapi/v1/rigging', {
        method: 'POST',
        body: {
          input_task_id: a.refine.taskId,
          height_meters: entry.heightMeters ?? 1.7,
        },
      })
      return result
    },
    poll: (id) => pollTask(`/openapi/v1/rigging/${id}`, 'rig     ', entry.id),
  })

  let rigResult = rig.task?.result
  if (!rigResult) {
    rigResult = (await api(`/openapi/v1/rigging/${a.rig.taskId}`)).result
  }
  if (rigResult?.rigged_character_glb_url) {
    await ensureDownload(
      entry, 'rigged', rigResult.rigged_character_glb_url,
      join(RAW_DIR, `${entry.id}.rigged.glb`),
    )
  }
  if (rigResult?.basic_animations?.walking_glb_url) {
    await ensureDownload(
      entry, 'walk', rigResult.basic_animations.walking_glb_url,
      join(RAW_DIR, `${entry.id}.walk.glb`),
    )
  }

  // Idle clip via the animation library (action 0 = "Idle"; 11 = "Idle 1").
  for (const actionId of [0, 11]) {
    try {
      const anim = await runStage(entry, `anim-idle`, {
        cost: COST.anim,
        label: 'anim    ',
        create: async () => {
          const { result } = await api('/openapi/v1/animations', {
            method: 'POST',
            body: { rig_task_id: a.rig.taskId, action_id: actionId },
          })
          return result
        },
        poll: (id) => pollTask(`/openapi/v1/animations/${id}`, 'anim    ', entry.id),
      })
      let url = anim.task?.result?.animation_glb_url
      if (!url) url = (await api(`/openapi/v1/animations/${a['anim-idle'].taskId}`)).result?.animation_glb_url
      if (url) {
        await ensureDownload(entry, 'idle', url, join(RAW_DIR, `${entry.id}.idle.glb`))
      }
      break
    } catch (err) {
      if (err instanceof FatalApiError) throw err
      log(entry.id, `anim     → idle action ${actionId} failed (${err.message}); ${actionId === 0 ? 'trying fallback action 11' : 'giving up on idle'}`)
      delete a['anim-idle'] // reset stage so the fallback action can create fresh
      saveState()
    }
  }
}

/* ------------------------------------------------------- provenance doc */

function writeProvenanceDoc(entries) {
  const lines = [
    '# Meshy AI generated assets — provenance',
    '',
    'Generated with the [Meshy AI](https://www.meshy.ai) REST API',
    '(Text to 3D v2, Meshy-6) by `scripts/meshy-generate.mjs`. All assets were',
    'generated under a **paid Meshy plan → project-owned** (private ownership per',
    'Meshy paid-plan terms); they are **not** CC0. See',
    '`src/content/assets/meshyManifest.ts` for the per-asset license blocks used',
    'at runtime. Raw downloads live in `assets-src/meshy/raw/` (untracked);',
    'optimized runtime copies ship from `public/assets/meshy/`.',
    '',
    'Note: `negative_prompt` is deprecated (no functional effect) on the v2 API;',
    'values are recorded here for provenance anyway. Pipeline settings:',
    '`ai_model: latest` (Meshy-6), `should_remesh: true`, `topology: triangle`,',
    '`enable_pbr: true`, `auto_size: true` (origin at bottom), GLB only.',
    '',
    '| id | name | tier | preview task | refine task | extra tasks | credits | status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const entry of entries) {
    const a = state.assets[entry.id] ?? {}
    const extra = [
      a.rig?.taskId ? `rig ${a.rig.taskId}` : '',
      a['anim-idle']?.taskId ? `idle ${a['anim-idle'].taskId}` : '',
    ].filter(Boolean).join('<br>') || '—'
    const credits =
      (a.preview?.credits ?? 0) + (a.refine?.credits ?? 0) +
      (a.rig?.credits ?? 0) + (a['anim-idle']?.credits ?? 0)
    const status = a.done
      ? 'downloaded'
      : a.preview?.status
        ? `${a.preview.status}/${a.refine?.status ?? '—'}`
        : 'not started'
    lines.push(
      `| ${entry.id} | ${entry.name} | ${entry.tier} | ${a.preview?.taskId ?? '—'} | ${a.refine?.taskId ?? '—'} | ${extra} | ${credits || '—'} | ${status} |`,
    )
  }
  lines.push('', '## Prompts', '')
  for (const entry of entries) {
    lines.push(`### ${entry.id}`, '', `- **prompt:** ${entry.prompt}`)
    if (entry.negativePrompt) lines.push(`- **negative (deprecated/no-op):** ${entry.negativePrompt}`)
    lines.push(`- **placement:** ${entry.placementHint}`, '')
  }
  mkdirSync(MESHY_DIR, { recursive: true })
  writeFileSync(DOC_PATH, lines.join('\n') + '\n')
}

/* ----------------------------------------------------------------- main */

function selectEntries() {
  let entries = MESHY_CATALOG
  if (TIER) entries = entries.filter((e) => String(e.tier) === TIER)
  if (ONLY) {
    const missing = ONLY.filter((id) => !MESHY_CATALOG.some((e) => e.id === id))
    if (missing.length) {
      console.error(`Unknown --only ids: ${missing.join(', ')}`)
      process.exit(1)
    }
    entries = entries.filter((e) => ONLY.includes(e.id))
  }
  return entries
}

function estimateCredits(entry) {
  const a = state.assets[entry.id] ?? {}
  let cost = 0
  if (a.preview?.status !== 'SUCCEEDED') cost += COST.preview
  if (a.refine?.status !== 'SUCCEEDED') cost += COST.refine
  if (entry.rig) {
    if (a.rig?.status !== 'SUCCEEDED') cost += COST.rig
    if (a['anim-idle']?.status !== 'SUCCEEDED') cost += COST.anim
  }
  return cost
}

async function main() {
  if (!KEY) {
    console.error('MESHY_API_KEY missing — add it to .env')
    process.exit(1)
  }
  const entries = selectEntries()
  if (entries.length === 0) {
    console.error('No catalog entries match the filters.')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log(`Dry run — ${entries.length} entries selected` +
      `${TIER ? ` (tier ${TIER})` : ''}${ONLY ? ` (only ${ONLY.join(',')})` : ''}\n`)
    let total = 0
    for (const e of entries) {
      const cost = estimateCredits(e)
      total += cost
      const a = state.assets[e.id] ?? {}
      console.log(
        `  ${e.id.padEnd(26)} tier ${e.tier}  ${String(cost).padStart(3)} credits` +
        `  ${a.done ? '(done — skipped)' : a.preview?.taskId ? '(resumes)' : ''}`,
      )
    }
    console.log(`\nEstimated credits needed: ${total}`)
    try {
      console.log(`Current balance: ${await getBalance()} (reserve ${RESERVE})`)
    } catch (err) {
      console.log(`Balance check failed: ${err.message}`)
    }
    return
  }

  const balance = await getBalance()
  console.log(
    `Meshy batch: ${entries.length} entries, concurrency ${CONCURRENCY}, ` +
    `balance ${balance}, reserve ${RESERVE}, model ${AI_MODEL}\n`,
  )

  mkdirSync(RAW_DIR, { recursive: true })
  const queue = [...entries]
  const failures = []
  let completed = 0

  async function worker() {
    for (;;) {
      const entry = queue.shift()
      if (!entry) return
      if (state.assets[entry.id]?.done) {
        completed++
        log(entry.id, `already done — skipped (${completed}/${entries.length})`)
        continue
      }
      try {
        await processAsset(entry)
        completed++
        log(entry.id, `COMPLETE (${completed}/${entries.length})`)
      } catch (err) {
        failures.push({ id: entry.id, error: String(err.message ?? err) })
        log(entry.id, `ABORTED: ${err.message}`)
        if (err instanceof FatalApiError) {
          stopCreating = true
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  writeProvenanceDoc(MESHY_CATALOG)

  const finalBalance = await getBalance().catch(() => null)
  console.log(`\nDone: ${completed}/${entries.length} complete, ${failures.length} failed.`)
  for (const f of failures) console.log(`  FAILED ${f.id}: ${f.error}`)
  console.log(`Balance: ${balance} → ${finalBalance ?? '?'} (spent ${finalBalance != null ? balance - finalBalance : '?'})`)
  if (failures.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  saveState()
  process.exit(1)
})
