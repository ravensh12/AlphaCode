import { resolveThresholdAccess, type FinalFlowAccess } from './finalFlowAccess'

/**
 * Post-campaign game modes (Boss Rush / Endless Siege): route gating and
 * local best-run records.
 *
 * These modes are a pure victory lap — they award XP only and never touch
 * mission/evidence/progress records (enforced by `postgameGuard.test.ts`).
 * Records live in localStorage under versioned keys so a future shape change
 * can roll the key instead of migrating.
 */

export const BOSS_RUSH_STORE_KEY = 'alphacode.postgame.bossrush.v1'
export const ENDLESS_STORE_KEY = 'alphacode.postgame.endless.v1'

/**
 * Best-run records are identity-scoped (the `alphacode.xp.${id}` pattern):
 * each versioned base key above is suffixed with the identity id so a second
 * account on the device never inherits someone else's leaderboard. Signed-out
 * play records under the shared guest identity.
 */
export const POSTGAME_GUEST_IDENTITY = 'guest'

/** Storage seam for tests (mirrors GameAccessStorage in gameAccess.ts). */
export type PostgameStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): PostgameStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The identity-scoped storage key for one of the versioned base keys. */
export function postgameIdentityStorageKey(
  baseKey: string,
  identityId?: string | null,
): string {
  const id =
    identityId && identityId.length > 0 ? identityId : POSTGAME_GUEST_IDENTITY
  return `${baseKey}.${id}`
}

/**
 * One-time move of a pre-identity device-global record into the reading
 * identity's key. Deleting the legacy key makes it first-come-only: the first
 * identity to read after the update keeps the device's existing best, later
 * identities start fresh (never inheriting someone else's records).
 */
function migrateLegacyRecord(
  store: PostgameStorage,
  baseKey: string,
  identityId?: string | null,
): void {
  try {
    const legacy = store.getItem(baseKey)
    if (legacy === null) return
    const scopedKey = postgameIdentityStorageKey(baseKey, identityId)
    if (store.getItem(scopedKey) === null) store.setItem(scopedKey, legacy)
    store.removeItem(baseKey)
  } catch {
    /* storage unavailable — reads fall back to null anyway */
  }
}

/**
 * Route gate for both post-campaign modes: identical to the Threshold gate the
 * final-flow pages use — hydration-guarded (never redirects while progress is
 * still loading), open once the campaign is complete, and the showcase
 * account may always enter.
 */
export function resolvePostgameAccess(
  isShowcaseAccount: boolean,
  ready: boolean,
  academyCampaignComplete: boolean,
): FinalFlowAccess {
  return resolveThresholdAccess(
    ready,
    isShowcaseAccount || academyCampaignComplete,
  )
}

export type BossRushRecord = {
  /** Fastest full-clear fight time, in milliseconds. */
  bestMs: number
}

export type EndlessRecord = {
  /** Highest wave reached before falling. */
  bestWave: number
  /** Most kills in a single run. */
  bestKills: number
}

function readJson(key: string, storage?: PostgameStorage): unknown {
  const store = storage ?? defaultStorage()
  if (!store) return null
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown, storage?: PostgameStorage): void {
  const store = storage ?? defaultStorage()
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {
    /* an unavailable localStorage only loses the leaderboard, never the run */
  }
}

const isPosInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0

/** Migration-aware identity-scoped read of one record key. */
function readRecordJson(
  baseKey: string,
  storage?: PostgameStorage,
  identityId?: string | null,
): unknown {
  const store = storage ?? defaultStorage()
  if (!store) return null
  migrateLegacyRecord(store, baseKey, identityId)
  return readJson(postgameIdentityStorageKey(baseKey, identityId), store)
}

export function loadBossRushRecord(
  storage?: PostgameStorage,
  identityId?: string | null,
): BossRushRecord | null {
  const raw = readRecordJson(BOSS_RUSH_STORE_KEY, storage, identityId) as {
    bestMs?: unknown
  } | null
  if (!raw || !isPosInt(raw.bestMs)) return null
  return { bestMs: Math.round(raw.bestMs as number) }
}

/** Persist a finished rush; keeps the fastest time. */
export function recordBossRushRun(
  elapsedMs: number,
  storage?: PostgameStorage,
  identityId?: string | null,
): { record: BossRushRecord; newBest: boolean } {
  const ms = Math.max(1, Math.round(elapsedMs))
  const prev = loadBossRushRecord(storage, identityId)
  const newBest = !prev || ms < prev.bestMs
  const record: BossRushRecord = { bestMs: newBest ? ms : prev.bestMs }
  writeJson(
    postgameIdentityStorageKey(BOSS_RUSH_STORE_KEY, identityId),
    record,
    storage,
  )
  return { record, newBest }
}

export function loadEndlessRecord(
  storage?: PostgameStorage,
  identityId?: string | null,
): EndlessRecord | null {
  const raw = readRecordJson(ENDLESS_STORE_KEY, storage, identityId) as {
    bestWave?: unknown
    bestKills?: unknown
  } | null
  if (!raw || !isPosInt(raw.bestWave)) return null
  return {
    bestWave: Math.round(raw.bestWave as number),
    bestKills: isPosInt(raw.bestKills) ? Math.round(raw.bestKills as number) : 0,
  }
}

/** Persist a finished siege; keeps the highest wave and the most kills. */
export function recordEndlessRun(
  wave: number,
  kills: number,
  storage?: PostgameStorage,
  identityId?: string | null,
): { record: EndlessRecord; newBest: boolean } {
  const w = Math.max(1, Math.round(wave))
  const k = Math.max(0, Math.round(kills))
  const prev = loadEndlessRecord(storage, identityId)
  const newBest = !prev || w > prev.bestWave
  const record: EndlessRecord = {
    bestWave: newBest ? w : prev.bestWave,
    bestKills: Math.max(k, prev?.bestKills ?? 0),
  }
  writeJson(
    postgameIdentityStorageKey(ENDLESS_STORE_KEY, identityId),
    record,
    storage,
  )
  return { record, newBest }
}

/** "m:ss.d" run-clock display (e.g. 83450 -> "1:23.4"). */
export function formatRunMs(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.floor(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const tenths = Math.floor((clamped % 1000) / 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}
