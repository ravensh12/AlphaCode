import { saveFreshRunTour, skipToLevel } from './questSession'

/* ============================================================================
   Skip-to-realm: the levels-page fast travel.

   Two concerns live here:
   1. Jumping the physical run to a realm (session-scoped, composes existing
      questSession APIs — that file is never edited from here).
   2. A durable, identity-scoped memory of every realm this account has ever
      reached or unlocked, so "Reset run" never re-locks skip destinations.
   ========================================================================== */

/**
 * Jump the physical run to a realm's first checkpoint from the levels page.
 *
 * Composes two existing progression APIs (no durable evidence is touched):
 * - `skipToLevel` writes the session tour + spawn (TOUR_KEY / POS_KEY),
 *   suppresses the how-to-play intro and queues the "Welcome to Level N"
 *   popup (LEVEL_WELCOME_KEY).
 * - `saveFreshRunTour` anchors a fresh-run at that position (FRESH_RUN_KEY),
 *   which the overworld treats as authoritative over durable progress — so
 *   the run stays where the player jumped instead of snapping back to the
 *   durable frontier. Solved missions and completion evidence stay saved;
 *   closing the tab ends the override and durable progress resumes control.
 *
 * The destination (and everything behind it) is also recorded in the durable
 * ever-reached set, so this skip stays available after any future run reset.
 */
export function skipRunToRealm(
  worldIndex: number,
  identityId?: string | null,
): void {
  skipToLevel(worldIndex, { welcome: true })
  saveFreshRunTour({ world: worldIndex, stage: 0 })
  recordRealmsReached(rangeInclusive(worldIndex), identityId)
}

/* ------------------------------------------------- Durable reach memory */

/** Versioned base key; the identity id is appended (postgame.ts convention). */
export const REALM_REACH_KEY = 'alphacode.realmskip.reached.v1'

/** Signed-out play records under the shared guest identity. */
const GUEST_IDENTITY = 'guest'

/** Storage seam for tests (mirrors PostgameStorage in postgame.ts). */
export type RealmReachStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): RealmReachStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function reachStorageKey(identityId?: string | null): string {
  const id = identityId && identityId.length > 0 ? identityId : GUEST_IDENTITY
  return `${REALM_REACH_KEY}.${id}`
}

function rangeInclusive(last: number): number[] {
  const end = Math.max(0, Math.floor(last))
  return Array.from({ length: end + 1 }, (_, i) => i)
}

/**
 * Every realm index this identity has ever reached or unlocked. Reading never
 * invents entries; malformed storage reads as empty.
 */
export function loadRealmsReached(
  identityId?: string | null,
  storage?: RealmReachStorage,
): ReadonlySet<number> {
  const store = storage ?? defaultStorage()
  if (!store) return new Set()
  try {
    const raw = store.getItem(reachStorageKey(identityId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter(
        (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0,
      ),
    )
  } catch {
    return new Set()
  }
}

/**
 * Merge realm indexes into the identity's ever-reached set and persist.
 * Returns the merged set. The set only ever grows — resetting the run, or
 * any other transient state, never removes entries.
 */
export function recordRealmsReached(
  indexes: Iterable<number>,
  identityId?: string | null,
  storage?: RealmReachStorage,
): ReadonlySet<number> {
  const store = storage ?? defaultStorage()
  const merged = new Set(store ? loadRealmsReached(identityId, store) : [])
  for (const index of indexes) {
    if (Number.isInteger(index) && index >= 0) merged.add(index)
  }
  if (store) {
    try {
      store.setItem(
        reachStorageKey(identityId),
        JSON.stringify([...merged].sort((a, b) => a - b)),
      )
    } catch {
      /* storage unavailable */
    }
  }
  return merged
}
