/* ============================================================================
   Living Code City — city-life reward bookkeeping (learning-integration PR7-9,
   extended for the city-life systems in PR4-6 prep).

   Every city-life reward channel awards player XP only — never
   mission/evidence progress — and this module is the single source of truth
   for how much. (The exhibit channel's earner — the Data Dojo interiors —
   was retired; its bookkeeping stays so historical XP grants and milestone
   counters remain readable and identity-scoped.)

   The design is shared by every city-life reward channel below —
   arcade sessions, courier deliveries, bit collectibles, photo cosmetics.
   All of it is XP/cosmetic only, all of it is daily-capped, and the tested
   invariant at the bottom guarantees the LEARNING path always outearns the
   grind path per minute.

   Everything here is pure over an injectable Storage so node tests can drive
   it without a DOM. Persisted shapes are versioned (`.v1`) and defensive:
   malformed JSON resets to the empty state instead of throwing.
   ========================================================================== */

import {
  CHECKPOINTS_3D,
  SCENERY,
  type Vec2,
} from '../components/game3d/layout'
import { SeededRandom } from './seededRandom'
import { answerXp } from './playerLevel'

/** Daily counters (exhibit XP granted today). */
export const CITY_CAPS_STORAGE_KEY = 'alphacode.city.caps.v1'
/** One-time exhibit flags (exhibit id → ISO timestamp of the first clear). */
export const CITY_EXHIBITS_STORAGE_KEY = 'alphacode.city.exhibits.v1'

/* ------------------------------------------------------ identity scoping -- */

/**
 * City-life bookkeeping is scoped per identity (the `alphacode.xp.${id}`
 * pattern from PlayerLevelContext): every persisted key below is suffixed
 * with the identity id so a second account on the same device never inherits
 * spent caps, first-clear flags, or lifetime milestones. Callers thread the
 * id through the claim/read options; anything that does not defaults to the
 * shared guest identity (auth never gets imported into this lib).
 */
export const CITY_GUEST_IDENTITY = 'guest'

/**
 * One-time migration marker: the pre-identity device-global keys are copied
 * into the FIRST identity that reads them (so an existing player keeps their
 * records), then never migrated again — later identities start fresh.
 */
export const CITY_MIGRATION_MARKER_KEY = 'alphacode.city.migrated.v1'

function cityIdentity(identityId?: string | null): string {
  return identityId && identityId.length > 0 ? identityId : CITY_GUEST_IDENTITY
}

/** The identity-scoped storage key for one of the versioned base keys. */
export function cityIdentityStorageKey(
  baseKey: string,
  identityId?: string | null,
): string {
  return `${baseKey}.${cityIdentity(identityId)}`
}

/** First clear of a flagship exhibit machine. */
export const EXHIBIT_FLAGSHIP_XP = 60
/** First clear of a standard (non-flagship, per-track) exhibit machine. */
export const EXHIBIT_STANDARD_XP = 40
/** Any later clear of the same machine, whatever its tier. */
export const EXHIBIT_REPLAY_XP = 10
/** Total exhibit XP a player can earn per local day. */
export const EXHIBIT_DAILY_XP_CAP = 300

/** Grant tier of an exhibit machine (realm flagship vs per-track standard). */
export type ExhibitTier = 'flagship' | 'standard'

/** First-clear grant for a tier (replays always pay EXHIBIT_REPLAY_XP). */
export function exhibitFirstClearXp(tier: ExhibitTier): number {
  return tier === 'standard' ? EXHIBIT_STANDARD_XP : EXHIBIT_FLAGSHIP_XP
}

export type CityLifeStorage = Pick<Storage, 'getItem' | 'setItem'> & {
  /** Optional: legacy keys are deleted after migration when available. */
  removeItem?: Storage['removeItem']
}

export interface CityCapsState {
  /** Local calendar day the counters belong to (YYYY-MM-DD). */
  day: string
  /** Exhibit XP already granted on `day`. */
  exhibitXp: number
}

/** Exhibit id → ISO timestamp of the first paid clear. */
export type CityExhibitFlags = Record<string, string>

export interface ExhibitAward {
  /** XP to grant now (0 when the daily cap is exhausted). */
  xp: number
  /** True when this clear consumed the one-time flagship grant. */
  firstClear: boolean
  /** True when the daily cap reduced (or zeroed) the grant. */
  capped: boolean
  /** Exhibit XP still grantable today after this award. */
  remainingToday: number
}

/** Local calendar day key — the cap is a "per play day" budget, not UTC. */
export function cityDayKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function emptyCaps(day: string): CityCapsState {
  return { day, exhibitXp: 0 }
}

/** Parse the persisted caps; a stale day or malformed payload resets to 0. */
export function normalizeCityCaps(raw: unknown, day: string): CityCapsState {
  if (typeof raw !== 'object' || raw === null) return emptyCaps(day)
  const candidate = raw as { day?: unknown; exhibitXp?: unknown }
  if (candidate.day !== day) return emptyCaps(day)
  const xp =
    typeof candidate.exhibitXp === 'number' &&
    Number.isFinite(candidate.exhibitXp)
      ? Math.max(0, Math.floor(candidate.exhibitXp))
      : 0
  return { day, exhibitXp: xp }
}

export function normalizeExhibitFlags(raw: unknown): CityExhibitFlags {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const flags: CityExhibitFlags = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && key) flags[key] = value
  }
  return flags
}

export interface ExhibitClaimInput {
  flags: CityExhibitFlags
  caps: CityCapsState
  exhibitId: string
  /** ISO timestamp recorded as the first-clear moment. */
  claimedAt: string
  /** Grant tier; omitted claims settle as flagship (the original behavior). */
  tier?: ExhibitTier
}

export interface ExhibitClaimResult {
  award: ExhibitAward
  flags: CityExhibitFlags
  caps: CityCapsState
}

/**
 * Pure settlement of one exhibit clear:
 * - first paid clear of an exhibit grants its tier amount (flagship 60,
 *   standard 40), replays grant EXHIBIT_REPLAY_XP;
 * - the grant is clipped to what is left of EXHIBIT_DAILY_XP_CAP for the day;
 * - the one-time flag is only consumed when some XP was actually paid, so a
 *   fully capped first clear stays "first" for the next day.
 */
export function settleExhibitClaim(input: ExhibitClaimInput): ExhibitClaimResult {
  const { flags, caps, exhibitId, claimedAt } = input
  const alreadyCleared = !!flags[exhibitId]
  const base = alreadyCleared
    ? EXHIBIT_REPLAY_XP
    : exhibitFirstClearXp(input.tier ?? 'flagship')
  const remainingBefore = Math.max(0, EXHIBIT_DAILY_XP_CAP - caps.exhibitXp)
  const xp = Math.min(base, remainingBefore)
  const capped = xp < base
  const paidFirstClear = !alreadyCleared && xp > 0

  const nextCaps: CityCapsState =
    xp > 0 ? { day: caps.day, exhibitXp: caps.exhibitXp + xp } : caps
  const nextFlags: CityExhibitFlags = paidFirstClear
    ? { ...flags, [exhibitId]: claimedAt }
    : flags

  return {
    award: {
      xp,
      firstClear: paidFirstClear,
      capped,
      remainingToday: Math.max(0, EXHIBIT_DAILY_XP_CAP - nextCaps.exhibitXp),
    },
    flags: nextFlags,
    caps: nextCaps,
  }
}

/* ----------------------------------------------------- storage wrappers -- */

function readJson(storage: CityLifeStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(storage: CityLifeStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable — awards still return, they just do not persist */
  }
}

function defaultStorage(): CityLifeStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Base keys whose pre-identity device-global values migrate on first read. */
const LEGACY_MIGRATED_BASE_KEYS = [
  CITY_CAPS_STORAGE_KEY,
  CITY_EXHIBITS_STORAGE_KEY,
  'alphacode.city.daily.v1',
] as const

/**
 * One-time move of the device-global (pre-identity) records into the reading
 * identity's keys. The marker makes it first-come-only: the first identity to
 * read after the update keeps the device's existing records, everyone after
 * that starts their own clean slate (the whole point of identity scoping).
 */
function migrateLegacyCityKeys(
  store: CityLifeStorage,
  identityId?: string | null,
): void {
  try {
    if (store.getItem(CITY_MIGRATION_MARKER_KEY) !== null) return
    let sawLegacy = false
    for (const baseKey of LEGACY_MIGRATED_BASE_KEYS) {
      const legacy = store.getItem(baseKey)
      if (legacy === null) continue
      sawLegacy = true
      const scopedKey = cityIdentityStorageKey(baseKey, identityId)
      if (store.getItem(scopedKey) === null) store.setItem(scopedKey, legacy)
      // Neutralize the legacy key so nothing else can inherit it. JSON `null`
      // normalizes to the empty state for every reader of the old key.
      if (store.removeItem) store.removeItem(baseKey)
      else store.setItem(baseKey, 'null')
    }
    if (sawLegacy) {
      store.setItem(CITY_MIGRATION_MARKER_KEY, cityIdentity(identityId))
    }
  } catch {
    /* storage unavailable — reads fall back to empty state anyway */
  }
}

/** Identity-scoped read with the legacy migration applied first. */
function readScopedJson(
  store: CityLifeStorage,
  baseKey: string,
  identityId?: string | null,
): unknown {
  migrateLegacyCityKeys(store, identityId)
  return readJson(store, cityIdentityStorageKey(baseKey, identityId))
}

export function readCityCaps(
  storage?: CityLifeStorage | null,
  now: Date = new Date(),
  identityId?: string | null,
): CityCapsState {
  const store = storage ?? defaultStorage()
  const day = cityDayKey(now)
  if (!store) return emptyCaps(day)
  return normalizeCityCaps(
    readScopedJson(store, CITY_CAPS_STORAGE_KEY, identityId),
    day,
  )
}

export function readExhibitFlags(
  storage?: CityLifeStorage | null,
  identityId?: string | null,
): CityExhibitFlags {
  const store = storage ?? defaultStorage()
  if (!store) return {}
  return normalizeExhibitFlags(
    readScopedJson(store, CITY_EXHIBITS_STORAGE_KEY, identityId),
  )
}

/**
 * Claim the XP for one exhibit clear and persist the updated bookkeeping.
 * Callers grant the returned `xp` through usePlayerLevel().addXp — exhibits
 * have no other reward channel.
 */
export function claimExhibitXp(
  exhibitId: string,
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    /** Grant tier of the machine; defaults to flagship. */
    tier?: ExhibitTier
    /** Identity the bookkeeping belongs to; defaults to the guest scope. */
    identityId?: string | null
  } = {},
): ExhibitAward {
  const store = options.storage ?? defaultStorage()
  const now = options.now ?? new Date()
  const caps = readCityCaps(store, now, options.identityId)
  const flags = store ? readExhibitFlags(store, options.identityId) : {}
  const result = settleExhibitClaim({
    flags,
    caps,
    exhibitId,
    claimedAt: now.toISOString(),
    tier: options.tier,
  })
  if (store) {
    writeJson(
      store,
      cityIdentityStorageKey(CITY_CAPS_STORAGE_KEY, options.identityId),
      result.caps,
    )
    writeJson(
      store,
      cityIdentityStorageKey(CITY_EXHIBITS_STORAGE_KEY, options.identityId),
      result.flags,
    )
  }
  return result.award
}

/* ========================================================================== */
/* City-life daily counters (arcade / courier / bits)                        */
/* ========================================================================== */

/** Shared daily counters for the non-exhibit city-life reward channels. */
export const CITY_DAILY_STORAGE_KEY = 'alphacode.city.daily.v1'

export interface CityDailyState {
  /** Local calendar day the counters belong to (YYYY-MM-DD). */
  day: string
  /** Arcade sessions started on `day`. */
  arcadeSessions: number
  /** XP-earning courier deliveries finished on `day`. */
  courierDeliveries: number
  /** Bit collectibles picked up on `day` (soft cap counts all pickups). */
  bitsCollected: number
}

function emptyCityDaily(day: string): CityDailyState {
  return { day, arcadeSessions: 0, courierDeliveries: 0, bitsCollected: 0 }
}

function counter(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

/** Parse the persisted daily counters; stale day / bad payload resets to 0. */
export function normalizeCityDaily(raw: unknown, day: string): CityDailyState {
  if (typeof raw !== 'object' || raw === null) return emptyCityDaily(day)
  const candidate = raw as Partial<Record<keyof CityDailyState, unknown>>
  if (candidate.day !== day) return emptyCityDaily(day)
  return {
    day,
    arcadeSessions: counter(candidate.arcadeSessions),
    courierDeliveries: counter(candidate.courierDeliveries),
    bitsCollected: counter(candidate.bitsCollected),
  }
}

export function readCityDaily(
  storage?: CityLifeStorage | null,
  now: Date = new Date(),
  identityId?: string | null,
): CityDailyState {
  const store = storage ?? defaultStorage()
  const day = cityDayKey(now)
  if (!store) return emptyCityDaily(day)
  return normalizeCityDaily(
    readScopedJson(store, CITY_DAILY_STORAGE_KEY, identityId),
    day,
  )
}

function persistCityDaily(
  storage: CityLifeStorage | null,
  daily: CityDailyState,
  identityId?: string | null,
): void {
  if (storage) {
    writeJson(
      storage,
      cityIdentityStorageKey(CITY_DAILY_STORAGE_KEY, identityId),
      daily,
    )
  }
}

/* ========================================================================== */
/* Lifetime milestone counters (courier / bits) — never reset                */
/* ========================================================================== */

/**
 * Lifetime counters behind CityMilestones: unlike the daily counters above,
 * these NEVER reset at midnight, so photo cosmetics unlock durably and the
 * vehicle's first-delivery gate stays open once earned. Identity-scoped from
 * the start (no legacy device-global value ever existed for this key).
 */
export const CITY_LIFETIME_STORAGE_KEY = 'alphacode.city.lifetime.v1'

export interface CityLifetimeState {
  /** Lifetime courier deliveries finished (capped runs still count). */
  courierDeliveries: number
  /** Lifetime bit collectibles picked up (soft cap counts all pickups). */
  bitsCollected: number
}

function emptyCityLifetime(): CityLifetimeState {
  return { courierDeliveries: 0, bitsCollected: 0 }
}

/** Parse the persisted lifetime counters; malformed payloads reset to 0. */
export function normalizeCityLifetime(raw: unknown): CityLifetimeState {
  if (typeof raw !== 'object' || raw === null) return emptyCityLifetime()
  const candidate = raw as Partial<Record<keyof CityLifetimeState, unknown>>
  return {
    courierDeliveries: counter(candidate.courierDeliveries),
    bitsCollected: counter(candidate.bitsCollected),
  }
}

export function readCityLifetime(
  options: {
    storage?: CityLifeStorage | null
    identityId?: string | null
  } = {},
): CityLifetimeState {
  const store = options.storage ?? defaultStorage()
  if (!store) return emptyCityLifetime()
  return normalizeCityLifetime(
    readJson(
      store,
      cityIdentityStorageKey(CITY_LIFETIME_STORAGE_KEY, options.identityId),
    ),
  )
}

/** Add to the lifetime counters and persist the updated record. */
function bumpCityLifetime(
  storage: CityLifeStorage | null,
  delta: Partial<CityLifetimeState>,
  identityId?: string | null,
): CityLifetimeState {
  const current = readCityLifetime({ storage, identityId })
  const next: CityLifetimeState = {
    courierDeliveries:
      current.courierDeliveries + counter(delta.courierDeliveries),
    bitsCollected: current.bitsCollected + counter(delta.bitsCollected),
  }
  if (storage) {
    writeJson(
      storage,
      cityIdentityStorageKey(CITY_LIFETIME_STORAGE_KEY, identityId),
      next,
    )
  }
  return next
}

/**
 * The lifetime milestone counters the photo cosmetics (and the vehicle
 * unlock) check against: durable courier/bit tallies from the lifetime
 * record, plus the distinct first-cleared exhibit count derived from the
 * one-time exhibit flags.
 */
export function readCityMilestones(
  options: {
    storage?: CityLifeStorage | null
    identityId?: string | null
  } = {},
): CityMilestones {
  const store = options.storage ?? defaultStorage()
  const lifetime = readCityLifetime({ storage: store, identityId: options.identityId })
  return {
    exhibitsCleared: Object.keys(readExhibitFlags(store, options.identityId))
      .length,
    courierDeliveries: lifetime.courierDeliveries,
    bitsCollected: lifetime.bitsCollected,
  }
}

/** True once the identity has ever finished a courier delivery (vehicle gate). */
export function firstDeliveryDone(
  options: {
    storage?: CityLifeStorage | null
    identityId?: string | null
  } = {},
): boolean {
  return readCityLifetime(options).courierDeliveries > 0
}

/* ========================================================================== */
/* Pattern Arcade — spaced-retrieval mini-sessions, capped per day           */
/* ========================================================================== */

/** Arcade mini-sessions a player can start per local day. */
export const ARCADE_SESSIONS_PER_DAY = 3
/** Questions per arcade mini-session (mirrors buildWarmupSession's default). */
export const ARCADE_QUESTIONS_PER_SESSION = 6
/** Soft per-question timer; timing out counts as a wrong answer + reveal. */
export const ARCADE_QUESTION_SECONDS = 20

export interface ArcadeSessionStart {
  /** False once the daily session cap is spent. */
  allowed: boolean
  /** Sessions still startable today after this call. */
  remainingToday: number
  daily: CityDailyState
}

/** Pure settlement of "the player wants to start an arcade session". */
export function settleArcadeSessionStart(
  daily: CityDailyState,
): ArcadeSessionStart {
  const allowed = daily.arcadeSessions < ARCADE_SESSIONS_PER_DAY
  const next: CityDailyState = allowed
    ? { ...daily, arcadeSessions: daily.arcadeSessions + 1 }
    : daily
  return {
    allowed,
    remainingToday: Math.max(0, ARCADE_SESSIONS_PER_DAY - next.arcadeSessions),
    daily: next,
  }
}

/** Start (and persist) an arcade session against today's cap. */
export function startArcadeSession(
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): ArcadeSessionStart {
  const store = options.storage ?? defaultStorage()
  const now = options.now ?? new Date()
  const result = settleArcadeSessionStart(
    readCityDaily(store, now, options.identityId),
  )
  if (result.allowed) persistCityDaily(store, result.daily, options.identityId)
  return result
}

/** Arcade sessions still startable today (display helper). */
export function arcadeSessionsRemaining(daily: CityDailyState): number {
  return Math.max(0, ARCADE_SESSIONS_PER_DAY - daily.arcadeSessions)
}

/* ========================================================================== */
/* Courier deliveries — XP errands between district plazas                   */
/* ========================================================================== */

/** XP-earning deliveries per local day (later runs still complete, 0 XP). */
export const COURIER_DELIVERIES_PER_DAY = 5
/** Late deliveries never pay less than this share of the route's base XP. */
export const COURIER_XP_FLOOR_RATIO = 0.3

export interface CourierRoute {
  /** Stable id anchored to the two district plazas it runs between. */
  id: string
  label: string
  /** 0-based district (== world/realm) indices from the layout checkpoints. */
  fromDistrict: number
  toDistrict: number
  /** Plaza anchors in world metres (CHECKPOINTS_3D[i].flag). */
  from: Vec2
  to: Vec2
  /** Straight-line plaza distance in metres. */
  distance: number
  baseXp: number
  /** Soft timer: finishing within this many seconds pays full base XP. */
  targetSeconds: number
}

function courierRoute(fromDistrict: number, toDistrict: number): CourierRoute {
  const from = CHECKPOINTS_3D[fromDistrict].flag
  const to = CHECKPOINTS_3D[toDistrict].flag
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  return {
    id: `courier:realm${fromDistrict + 1}-realm${toDistrict + 1}`,
    label: `${CHECKPOINTS_3D[fromDistrict].world.name} → ${CHECKPOINTS_3D[toDistrict].world.name}`,
    fromDistrict,
    toDistrict,
    from,
    to,
    distance,
    // Longer runs pay more, inside a tight band so grinding can't outpace
    // missions (see the economy invariant at the bottom of this module).
    baseXp: Math.min(44, Math.max(24, Math.round(distance / 12))),
    // Full pay within a brisk ~5 m/s run, rounded up to a clean 10 s.
    targetSeconds: Math.ceil(distance / 5 / 10) * 10,
  }
}

/**
 * The daily delivery board: one XP-earning run per cap slot, each anchored to
 * a pair of district plazas from the layout checkpoints.
 */
export const COURIER_ROUTES: readonly CourierRoute[] = [
  courierRoute(0, 1),
  courierRoute(1, 2),
  courierRoute(2, 3),
  courierRoute(3, 4),
  courierRoute(5, 0),
]

export function courierRouteById(id: string): CourierRoute | undefined {
  return COURIER_ROUTES.find((route) => route.id === id)
}

/**
 * Soft-timer XP scaling: full base XP up to `targetSeconds`, then a linear
 * fade that bottoms out at the 30% floor once twice the target has elapsed.
 * A slow delivery still pays something — it's a chill errand, not a fail.
 */
export function courierDeliveryXp(
  route: Pick<CourierRoute, 'baseXp' | 'targetSeconds'>,
  elapsedSeconds: number,
): number {
  const elapsed = Math.max(0, elapsedSeconds)
  if (elapsed <= route.targetSeconds) return route.baseXp
  const overrun = Math.min(
    1,
    (elapsed - route.targetSeconds) / route.targetSeconds,
  )
  const floor = route.baseXp * COURIER_XP_FLOOR_RATIO
  return Math.round(Math.max(floor, route.baseXp * (1 - (1 - COURIER_XP_FLOOR_RATIO) * overrun)))
}

export interface CourierDeliveryResult {
  /** XP granted (0 once the daily XP-earning cap is spent). */
  xp: number
  /** True when the daily cap zeroed the grant. */
  capped: boolean
  /** XP-earning deliveries left today after this one. */
  remainingToday: number
  daily: CityDailyState
}

/** Pure settlement of one finished delivery against the daily cap. */
export function settleCourierDelivery(
  daily: CityDailyState,
  route: Pick<CourierRoute, 'baseXp' | 'targetSeconds'>,
  elapsedSeconds: number,
): CourierDeliveryResult {
  const capped = daily.courierDeliveries >= COURIER_DELIVERIES_PER_DAY
  const xp = capped ? 0 : courierDeliveryXp(route, elapsedSeconds)
  const next: CityDailyState = capped
    ? daily
    : { ...daily, courierDeliveries: daily.courierDeliveries + 1 }
  return {
    xp,
    capped,
    remainingToday: Math.max(
      0,
      COURIER_DELIVERIES_PER_DAY - next.courierDeliveries,
    ),
    daily: next,
  }
}

/** Settle + persist one finished delivery (daily cap + lifetime milestone). */
export function claimCourierDelivery(
  routeId: string,
  elapsedSeconds: number,
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): CourierDeliveryResult {
  const store = options.storage ?? defaultStorage()
  const now = options.now ?? new Date()
  const route = courierRouteById(routeId)
  const daily = readCityDaily(store, now, options.identityId)
  if (!route) {
    return {
      xp: 0,
      capped: false,
      remainingToday: Math.max(
        0,
        COURIER_DELIVERIES_PER_DAY - daily.courierDeliveries,
      ),
      daily,
    }
  }
  const result = settleCourierDelivery(daily, route, elapsedSeconds)
  if (!result.capped) {
    persistCityDaily(store, result.daily, options.identityId)
  }
  // Lifetime milestones count every finished delivery, capped ones included —
  // a capped run still completes (and must still flip firstDeliveryDone).
  bumpCityLifetime(store, { courierDeliveries: 1 }, options.identityId)
  return result
}

/* ========================================================================== */
/* Bit collectibles — glittering pocket change, reseeded weekly              */
/* ========================================================================== */

/** XP per collected bit. */
export const BIT_XP = 1
/** Bits that pay XP per local day; further pickups still collect (0 XP). */
export const BIT_DAILY_SOFT_CAP = 50
/** A bit never drifts farther than this from its anchor prop (metres). */
export const BIT_ANCHOR_MAX_OFFSET = 2
/** Bits spawned per weekly seed. */
export const BIT_SPAWN_COUNT = 120

export type BitAnchorKind = 'park' | 'bench' | 'carRoof'

export interface BitAnchor {
  kind: BitAnchorKind
  x: number
  z: number
}

export interface BitSpawn {
  /** Stable within a week: `bit:<weekKey>:<index>`. */
  id: string
  anchor: BitAnchorKind
  x: number
  z: number
  /** Hover height — car-roof bits sit on the roof line. */
  y: number
}

/**
 * ISO-8601 week key (e.g. '2026-W28') — the weekly reseed boundary. Uses the
 * standard Thursday rule so week 1 is the week containing January 4th.
 */
export function isoWeekKey(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The deterministic weekly placement seed. */
export function bitPlacementSeed(now: Date): string {
  return `bits|${isoWeekKey(now)}`
}

/** Default anchor candidates from the city scenery (parks, benches, cars). */
function defaultBitAnchors(): BitAnchor[] {
  const anchors: BitAnchor[] = []
  for (const tree of SCENERY.tree) anchors.push({ kind: 'park', x: tree.x, z: tree.z })
  for (const bench of SCENERY.bench) anchors.push({ kind: 'bench', x: bench.x, z: bench.z })
  for (const car of SCENERY.car) anchors.push({ kind: 'carRoof', x: car.x, z: car.z })
  return anchors
}

/**
 * Deterministic weekly bit placement: the same week (and anchor set) always
 * lays out the identical field; a new ISO week reshuffles everything. Every
 * bit stays within BIT_ANCHOR_MAX_OFFSET of its anchor prop; car-roof bits
 * hug the roof (small offset, raised y).
 */
export function placeBitCollectibles(
  now: Date,
  count = BIT_SPAWN_COUNT,
  anchors: readonly BitAnchor[] = defaultBitAnchors(),
): BitSpawn[] {
  if (anchors.length === 0 || count <= 0) return []
  const week = isoWeekKey(now)
  const rng = new SeededRandom(bitPlacementSeed(now))
  const picked = rng.shuffle(anchors).slice(0, Math.min(count, anchors.length))
  return picked.map((anchor, index) => {
    const onRoof = anchor.kind === 'carRoof'
    const maxOffset = onRoof ? 0.7 : BIT_ANCHOR_MAX_OFFSET
    const radius = rng.next() * maxOffset
    const angle = rng.next() * Math.PI * 2
    return {
      id: `bit:${week}:${index}`,
      anchor: anchor.kind,
      x: anchor.x + Math.cos(angle) * radius,
      z: anchor.z + Math.sin(angle) * radius,
      y: onRoof ? 1.55 : 0.45,
    }
  })
}

export interface BitPickupResult {
  /** XP granted (`BIT_XP` per bit within today's soft cap). */
  xp: number
  /** True when the soft cap reduced (or zeroed) the grant. */
  capped: boolean
  /** XP-earning pickups left today after this one. */
  remainingToday: number
  daily: CityDailyState
}

/** Pure settlement of `count` bit pickups against the daily soft cap. */
export function settleBitPickups(
  daily: CityDailyState,
  count = 1,
): BitPickupResult {
  const pickups = Math.max(0, Math.floor(count))
  const eligible = Math.max(
    0,
    Math.min(pickups, BIT_DAILY_SOFT_CAP - daily.bitsCollected),
  )
  const next: CityDailyState =
    pickups > 0
      ? { ...daily, bitsCollected: daily.bitsCollected + pickups }
      : daily
  return {
    xp: eligible * BIT_XP,
    capped: eligible < pickups,
    remainingToday: Math.max(0, BIT_DAILY_SOFT_CAP - next.bitsCollected),
    daily: next,
  }
}

/** Settle + persist bit pickups (daily soft cap + lifetime milestone). */
export function claimBitPickups(
  count = 1,
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): BitPickupResult {
  const store = options.storage ?? defaultStorage()
  const now = options.now ?? new Date()
  const pickups = Math.max(0, Math.floor(count))
  const result = settleBitPickups(
    readCityDaily(store, now, options.identityId),
    count,
  )
  persistCityDaily(store, result.daily, options.identityId)
  if (pickups > 0) {
    bumpCityLifetime(store, { bitsCollected: pickups }, options.identityId)
  }
  return result
}

/* ========================================================================== */
/* Collected bit ids — the weekly "which bits are gone" record               */
/* ========================================================================== */

/**
 * Which of the week's bit spawns were already swept up. Scoped per identity
 * and keyed to the ISO week so the record resets exactly when the field
 * reseeds. The XP soft cap above stays the daily counter; this is only the
 * visual/world state (collected bits render collapsed and never re-burst).
 */
export const CITY_BIT_IDS_STORAGE_KEY = 'alphacode.city.bitIds.v1'

export interface CityBitIdsState {
  /** ISO week the ids belong to (isoWeekKey). */
  week: string
  ids: string[]
}

/** Parse the persisted id list; a stale week or bad payload resets to []. */
export function normalizeCityBitIds(raw: unknown, week: string): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const candidate = raw as Partial<CityBitIdsState>
  if (candidate.week !== week || !Array.isArray(candidate.ids)) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const id of candidate.ids) {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

export function readCollectedBitIds(
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): string[] {
  const store = options.storage ?? defaultStorage()
  const week = isoWeekKey(options.now ?? new Date())
  if (!store) return []
  return normalizeCityBitIds(
    readJson(
      store,
      cityIdentityStorageKey(CITY_BIT_IDS_STORAGE_KEY, options.identityId),
    ),
    week,
  )
}

/**
 * Append newly swept bit ids to this week's record and persist it. Returns
 * the full de-duplicated list (the caller's next `collected` set).
 */
export function recordCollectedBitIds(
  newIds: readonly string[],
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): string[] {
  const store = options.storage ?? defaultStorage()
  const now = options.now ?? new Date()
  const week = isoWeekKey(now)
  const current = readCollectedBitIds({ storage: store, now, identityId: options.identityId })
  const seen = new Set(current)
  for (const id of newIds) {
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id)
      current.push(id)
    }
  }
  if (store) {
    writeJson(
      store,
      cityIdentityStorageKey(CITY_BIT_IDS_STORAGE_KEY, options.identityId),
      { week, ids: current } satisfies CityBitIdsState,
    )
  }
  return current
}

/* ========================================================================== */
/* District NPC chats — one fresh quiz chain per district per day            */
/* ========================================================================== */

/**
 * Which district NPCs were already chatted with today. Drives the floating
 * chat glyph ("a chain is available") and resets at local midnight like the
 * other daily counters. Identity-scoped; no legacy value ever existed.
 */
export const CITY_NPC_CHATS_STORAGE_KEY = 'alphacode.city.npcChats.v1'

export interface CityNpcChatsState {
  /** Local calendar day the chats belong to (YYYY-MM-DD). */
  day: string
  /** District indices already chatted on `day`. */
  districts: number[]
}

/** Parse the persisted chat record; stale day / bad payload resets to []. */
export function normalizeNpcChats(raw: unknown, day: string): number[] {
  if (typeof raw !== 'object' || raw === null) return []
  const candidate = raw as Partial<CityNpcChatsState>
  if (candidate.day !== day || !Array.isArray(candidate.districts)) return []
  const districts: number[] = []
  const seen = new Set<number>()
  for (const value of candidate.districts) {
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      !seen.has(value)
    ) {
      seen.add(value)
      districts.push(value)
    }
  }
  return districts
}

export function readNpcChatsToday(
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): number[] {
  const store = options.storage ?? defaultStorage()
  const day = cityDayKey(options.now ?? new Date())
  if (!store) return []
  return normalizeNpcChats(
    readJson(
      store,
      cityIdentityStorageKey(CITY_NPC_CHATS_STORAGE_KEY, options.identityId),
    ),
    day,
  )
}

/** Record a district chat for today and persist; returns the updated list. */
export function markNpcChatToday(
  districtIndex: number,
  options: {
    storage?: CityLifeStorage | null
    now?: Date
    identityId?: string | null
  } = {},
): number[] {
  const store = options.storage ?? defaultStorage()
  const now = options.now ?? new Date()
  const day = cityDayKey(now)
  const districts = readNpcChatsToday({
    storage: store,
    now,
    identityId: options.identityId,
  })
  if (
    Number.isInteger(districtIndex) &&
    districtIndex >= 0 &&
    !districts.includes(districtIndex)
  ) {
    districts.push(districtIndex)
  }
  if (store) {
    writeJson(
      store,
      cityIdentityStorageKey(CITY_NPC_CHATS_STORAGE_KEY, options.identityId),
      { day, districts } satisfies CityNpcChatsState,
    )
  }
  return districts
}

/* ========================================================================== */
/* Photo cosmetics — frames & stickers unlocked by city milestones           */
/* ========================================================================== */

export type PhotoCosmeticKind = 'frame' | 'sticker'

export type PhotoCosmeticUnlock =
  | { kind: 'default' }
  | { kind: 'exhibits'; cleared: number }
  | { kind: 'courier'; deliveries: number }
  | { kind: 'bits'; collected: number }

export interface PhotoCosmetic {
  id: string
  kind: PhotoCosmeticKind
  label: string
  unlock: PhotoCosmeticUnlock
  /** Short unlock hint shown on locked entries in the photo overlay. */
  unlockHint: string
}

/** Lifetime milestone counters the cosmetics unlock against. */
export interface CityMilestones {
  /** Distinct exhibit machines first-cleared (readExhibitFlags size). */
  exhibitsCleared: number
  /** Lifetime courier deliveries finished. */
  courierDeliveries: number
  /** Lifetime bits collected. */
  bitsCollected: number
}

export const PHOTO_COSMETICS: readonly PhotoCosmetic[] = [
  /* frames */
  {
    id: 'frame:city-glass',
    kind: 'frame',
    label: 'City Glass',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
  {
    id: 'frame:neon-grid',
    kind: 'frame',
    label: 'Neon Grid',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
  {
    id: 'frame:courier-express',
    kind: 'frame',
    label: 'Courier Express',
    unlock: { kind: 'courier', deliveries: 5 },
    unlockHint: 'Finish 5 deliveries',
  },
  {
    id: 'frame:bitstream',
    kind: 'frame',
    label: 'Bitstream',
    unlock: { kind: 'bits', collected: 100 },
    unlockHint: 'Collect 100 bits',
  },
  {
    id: 'frame:gold-leaf',
    kind: 'frame',
    label: 'Gold Leaf',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
  /* stickers */
  {
    id: 'sticker:bolt',
    kind: 'sticker',
    label: 'Bolt',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
  {
    id: 'sticker:crystal',
    kind: 'sticker',
    label: 'Crystal',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
  {
    id: 'sticker:first-clear',
    kind: 'sticker',
    label: 'First Clear',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
  {
    id: 'sticker:hover-parcel',
    kind: 'sticker',
    label: 'Hover Parcel',
    unlock: { kind: 'courier', deliveries: 1 },
    unlockHint: 'Finish a delivery',
  },
  {
    id: 'sticker:bit-swarm',
    kind: 'sticker',
    label: 'Bit Swarm',
    unlock: { kind: 'bits', collected: 50 },
    unlockHint: 'Collect 50 bits',
  },
  {
    id: 'sticker:city-legend',
    kind: 'sticker',
    label: 'City Legend',
    unlock: { kind: 'default' },
    unlockHint: 'Always available',
  },
]

export function isPhotoCosmeticUnlocked(
  cosmetic: PhotoCosmetic,
  milestones: CityMilestones,
): boolean {
  switch (cosmetic.unlock.kind) {
    case 'default':
      return true
    case 'exhibits':
      return milestones.exhibitsCleared >= cosmetic.unlock.cleared
    case 'courier':
      return milestones.courierDeliveries >= cosmetic.unlock.deliveries
    case 'bits':
      return milestones.bitsCollected >= cosmetic.unlock.collected
  }
}

export function unlockedPhotoCosmeticIds(
  milestones: CityMilestones,
): string[] {
  return PHOTO_COSMETICS.filter((cosmetic) =>
    isPhotoCosmeticUnlocked(cosmetic, milestones),
  ).map(({ id }) => id)
}

/* ========================================================================== */
/* Storm nights                                                              */
/* ========================================================================== */

/** Every Nth night is a storm night (bit bonuses, moody skies). */
export const STORM_NIGHT_EVERY = 3

/**
 * Storm-night cadence: nights are counted from 1 (the first night of a run),
 * and every 3rd one storms — 3, 6, 9, … Non-positive inputs never storm.
 */
export function isStormNight(nightNumber: number): boolean {
  return (
    Number.isInteger(nightNumber) &&
    nightNumber > 0 &&
    nightNumber % STORM_NIGHT_EVERY === 0
  )
}

/* ========================================================================== */
/* Economy invariant — the learning path outearns the grind path             */
/* ========================================================================== */

/**
 * Conservative mission pace: an engaged learner resolves about two assessed
 * answers per minute inside a mission (reading + thinking included), each
 * paying the mid first-try tier of `answerXp` (≤6 s ≈ 12 XP).
 */
export const MISSION_ANSWERS_PER_MINUTE = 2
export const MISSION_XP_PER_ANSWER = answerXp(true, true, 5_000)

/** XP per minute of actually doing missions (the learning path). */
export function missionXpPerMinute(): number {
  return MISSION_ANSWERS_PER_MINUTE * MISSION_XP_PER_ANSWER
}

/**
 * A HARD lower bound on the minutes needed to exhaust every daily grind cap:
 * ~5 flagship exhibit clears to hit the 300 XP cap (puzzles + cross-district
 * travel ≈ 17 min), 3 arcade sessions × 6 × 20 s (≈ 6 min), all courier legs
 * at full-pay pace (≈ 7 min of running), and 50 scattered bits (≈ 12 min).
 * Real players take longer; using the floor makes the invariant strict.
 */
export const GRIND_DAY_MINIMUM_MINUTES = 45

/** Every XP a full grind day can pay, straight from the cap constants. */
export function cappedDailyGrindXp(): number {
  const arcadeMax =
    ARCADE_SESSIONS_PER_DAY *
    ARCADE_QUESTIONS_PER_SESSION *
    answerXp(true, true, 0)
  const courierMax = COURIER_ROUTES.reduce(
    (total, { baseXp }) => total + baseXp,
    0,
  )
  return (
    EXHIBIT_DAILY_XP_CAP +
    arcadeMax +
    courierMax +
    BIT_DAILY_SOFT_CAP * BIT_XP
  )
}

/** Grind XP per minute under the (generous-to-grind) fastest-day estimate. */
export function grindXpPerMinute(
  minutes = GRIND_DAY_MINIMUM_MINUTES,
): number {
  return cappedDailyGrindXp() / minutes
}

/**
 * The tested design promise: minute for minute, doing missions always pays
 * more than the most efficient possible grind day.
 */
export function learningPathOutearnsGrind(): boolean {
  return missionXpPerMinute() > grindXpPerMinute()
}
