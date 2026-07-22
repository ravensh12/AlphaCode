import { describe, expect, it } from 'vitest'
import {
  ARCADE_QUESTIONS_PER_SESSION,
  ARCADE_SESSIONS_PER_DAY,
  BIT_ANCHOR_MAX_OFFSET,
  BIT_DAILY_SOFT_CAP,
  BIT_XP,
  CITY_CAPS_STORAGE_KEY,
  CITY_DAILY_STORAGE_KEY,
  CITY_EXHIBITS_STORAGE_KEY,
  CITY_GUEST_IDENTITY,
  CITY_LIFETIME_STORAGE_KEY,
  CITY_MIGRATION_MARKER_KEY,
  COURIER_DELIVERIES_PER_DAY,
  COURIER_ROUTES,
  COURIER_XP_FLOOR_RATIO,
  EXHIBIT_DAILY_XP_CAP,
  EXHIBIT_FLAGSHIP_XP,
  EXHIBIT_REPLAY_XP,
  EXHIBIT_STANDARD_XP,
  GRIND_DAY_MINIMUM_MINUTES,
  PHOTO_COSMETICS,
  STORM_NIGHT_EVERY,
  arcadeSessionsRemaining,
  bitPlacementSeed,
  cappedDailyGrindXp,
  cityDayKey,
  cityIdentityStorageKey,
  claimBitPickups,
  claimCourierDelivery,
  claimExhibitXp,
  courierDeliveryXp,
  courierRouteById,
  exhibitFirstClearXp,
  firstDeliveryDone,
  grindXpPerMinute,
  isPhotoCosmeticUnlocked,
  isStormNight,
  isoWeekKey,
  learningPathOutearnsGrind,
  markNpcChatToday,
  missionXpPerMinute,
  normalizeCityBitIds,
  normalizeCityCaps,
  normalizeCityDaily,
  normalizeCityLifetime,
  normalizeExhibitFlags,
  normalizeNpcChats,
  placeBitCollectibles,
  readCityCaps,
  readCityDaily,
  readCityLifetime,
  readCityMilestones,
  readCollectedBitIds,
  readExhibitFlags,
  readNpcChatsToday,
  recordCollectedBitIds,
  settleArcadeSessionStart,
  settleBitPickups,
  settleCourierDelivery,
  settleExhibitClaim,
  startArcadeSession,
  unlockedPhotoCosmeticIds,
  type BitAnchor,
  type CityCapsState,
  type CityDailyState,
  type CityExhibitFlags,
  type CityMilestones,
} from './cityLife'
import { CHECKPOINTS_3D } from '../components/game3d/layout'

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    dump: () => Object.fromEntries(map),
  }
}

/** memoryStorage plus removeItem, for the migration cleanup paths. */
function removableStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    dump: () => Object.fromEntries(map),
  }
}

const DAY = '2026-07-11'
const AT = '2026-07-11T12:00:00.000Z'

function claim(
  flags: CityExhibitFlags,
  caps: CityCapsState,
  exhibitId = 'realm1:window-mag-train',
) {
  return settleExhibitClaim({ flags, caps, exhibitId, claimedAt: AT })
}

describe('settleExhibitClaim', () => {
  it('grants the flagship amount on the first clear and records the flag', () => {
    const result = claim({}, { day: DAY, exhibitXp: 0 })
    expect(result.award).toEqual({
      xp: EXHIBIT_FLAGSHIP_XP,
      firstClear: true,
      capped: false,
      remainingToday: EXHIBIT_DAILY_XP_CAP - EXHIBIT_FLAGSHIP_XP,
    })
    expect(result.flags['realm1:window-mag-train']).toBe(AT)
    expect(result.caps).toEqual({ day: DAY, exhibitXp: EXHIBIT_FLAGSHIP_XP })
  })

  it('grants the replay amount once the exhibit was already cleared', () => {
    const result = claim(
      { 'realm1:window-mag-train': '2026-07-01T00:00:00.000Z' },
      { day: DAY, exhibitXp: 0 },
    )
    expect(result.award.xp).toBe(EXHIBIT_REPLAY_XP)
    expect(result.award.firstClear).toBe(false)
    // The original first-clear stamp is preserved.
    expect(result.flags['realm1:window-mag-train']).toBe(
      '2026-07-01T00:00:00.000Z',
    )
  })

  it('clips the grant to what is left of the daily cap', () => {
    const result = claim({}, { day: DAY, exhibitXp: EXHIBIT_DAILY_XP_CAP - 25 })
    expect(result.award).toEqual({
      xp: 25,
      firstClear: true,
      capped: true,
      remainingToday: 0,
    })
    expect(result.caps.exhibitXp).toBe(EXHIBIT_DAILY_XP_CAP)
  })

  it('grants nothing at the cap and keeps the one-time flag unconsumed', () => {
    const result = claim({}, { day: DAY, exhibitXp: EXHIBIT_DAILY_XP_CAP })
    expect(result.award).toEqual({
      xp: 0,
      firstClear: false,
      capped: true,
      remainingToday: 0,
    })
    expect(result.flags).toEqual({})
    expect(result.caps.exhibitXp).toBe(EXHIBIT_DAILY_XP_CAP)
  })

  it('grants the standard-tier amount for per-track machines (40 first clear)', () => {
    expect(exhibitFirstClearXp('standard')).toBe(EXHIBIT_STANDARD_XP)
    expect(exhibitFirstClearXp('flagship')).toBe(EXHIBIT_FLAGSHIP_XP)
    const result = settleExhibitClaim({
      flags: {},
      caps: { day: DAY, exhibitXp: 0 },
      exhibitId: 'realm1:hash-lockers',
      claimedAt: AT,
      tier: 'standard',
    })
    expect(result.award).toEqual({
      xp: EXHIBIT_STANDARD_XP,
      firstClear: true,
      capped: false,
      remainingToday: EXHIBIT_DAILY_XP_CAP - EXHIBIT_STANDARD_XP,
    })
    expect(result.flags['realm1:hash-lockers']).toBe(AT)
  })

  it('standard-tier replays pay the shared replay amount', () => {
    const replay = settleExhibitClaim({
      flags: { 'realm1:hash-lockers': '2026-07-01T00:00:00.000Z' },
      caps: { day: DAY, exhibitXp: 0 },
      exhibitId: 'realm1:hash-lockers',
      claimedAt: AT,
      tier: 'standard',
    })
    expect(replay.award.xp).toBe(EXHIBIT_REPLAY_XP)
    expect(replay.award.firstClear).toBe(false)
  })

  it('the daily cap clips standard grants exactly like flagship grants', () => {
    const result = settleExhibitClaim({
      flags: {},
      caps: { day: DAY, exhibitXp: EXHIBIT_DAILY_XP_CAP - 15 },
      exhibitId: 'realm2:search-vault',
      claimedAt: AT,
      tier: 'standard',
    })
    expect(result.award).toEqual({
      xp: 15,
      firstClear: true,
      capped: true,
      remainingToday: 0,
    })
  })

  it('tracks distinct exhibits independently', () => {
    const first = claim({}, { day: DAY, exhibitXp: 0 }, 'realm2:node-train-cars')
    const second = settleExhibitClaim({
      flags: first.flags,
      caps: first.caps,
      exhibitId: 'realm3:heap-crane',
      claimedAt: AT,
    })
    expect(second.award.xp).toBe(EXHIBIT_FLAGSHIP_XP)
    expect(Object.keys(second.flags).sort()).toEqual([
      'realm2:node-train-cars',
      'realm3:heap-crane',
    ])
    expect(second.caps.exhibitXp).toBe(2 * EXHIBIT_FLAGSHIP_XP)
  })
})

describe('normalization', () => {
  it('resets caps recorded on a different day', () => {
    expect(normalizeCityCaps({ day: '2026-07-10', exhibitXp: 240 }, DAY)).toEqual(
      { day: DAY, exhibitXp: 0 },
    )
  })

  it('floors and clamps malformed counters', () => {
    expect(normalizeCityCaps({ day: DAY, exhibitXp: 41.9 }, DAY)).toEqual({
      day: DAY,
      exhibitXp: 41,
    })
    expect(normalizeCityCaps({ day: DAY, exhibitXp: -5 }, DAY)).toEqual({
      day: DAY,
      exhibitXp: 0,
    })
    expect(normalizeCityCaps({ day: DAY, exhibitXp: 'lots' }, DAY)).toEqual({
      day: DAY,
      exhibitXp: 0,
    })
    expect(normalizeCityCaps('garbage', DAY)).toEqual({ day: DAY, exhibitXp: 0 })
  })

  it('drops non-string exhibit flags', () => {
    expect(
      normalizeExhibitFlags({ good: AT, bad: 7, worse: null }),
    ).toEqual({ good: AT })
    expect(normalizeExhibitFlags([AT])).toEqual({})
    expect(normalizeExhibitFlags(null)).toEqual({})
  })

  it('cityDayKey uses the local calendar date with zero padding', () => {
    expect(cityDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(cityDayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
})

describe('storage wrappers', () => {
  it('claimExhibitXp honors the standard tier end to end', () => {
    const storage = memoryStorage()
    const now = new Date(2026, 6, 11, 9, 30)
    const first = claimExhibitXp('realm6:orrery', {
      storage,
      now,
      tier: 'standard',
    })
    expect(first).toEqual({
      xp: EXHIBIT_STANDARD_XP,
      firstClear: true,
      capped: false,
      remainingToday: EXHIBIT_DAILY_XP_CAP - EXHIBIT_STANDARD_XP,
    })
    const replay = claimExhibitXp('realm6:orrery', {
      storage,
      now,
      tier: 'standard',
    })
    expect(replay.xp).toBe(EXHIBIT_REPLAY_XP)
  })

  it('claimExhibitXp persists caps and flags round-trippable by the readers', () => {
    const storage = memoryStorage()
    const now = new Date(2026, 6, 11, 9, 30)
    const award = claimExhibitXp('realm5:tile-floor', { storage, now })
    expect(award.xp).toBe(EXHIBIT_FLAGSHIP_XP)
    expect(readCityCaps(storage, now)).toEqual({
      day: cityDayKey(now),
      exhibitXp: EXHIBIT_FLAGSHIP_XP,
    })
    expect(Object.keys(readExhibitFlags(storage))).toEqual(['realm5:tile-floor'])

    const replay = claimExhibitXp('realm5:tile-floor', { storage, now })
    expect(replay.xp).toBe(EXHIBIT_REPLAY_XP)
    expect(readCityCaps(storage, now).exhibitXp).toBe(
      EXHIBIT_FLAGSHIP_XP + EXHIBIT_REPLAY_XP,
    )
  })

  it('a new local day resets the budget but keeps one-time flags', () => {
    const storage = memoryStorage()
    const day1 = new Date(2026, 6, 11, 22, 0)
    for (let i = 0; i < 6; i++) {
      claimExhibitXp(`realm${i + 1}:machine`, { storage, now: day1 })
    }
    // 5 × 60 = 300 hits the cap; the 6th first-clear stayed unconsumed.
    expect(readCityCaps(storage, day1).exhibitXp).toBe(EXHIBIT_DAILY_XP_CAP)
    expect(Object.keys(readExhibitFlags(storage))).toHaveLength(5)

    const day2 = new Date(2026, 6, 12, 8, 0)
    const award = claimExhibitXp('realm6:machine', { storage, now: day2 })
    expect(award).toEqual({
      xp: EXHIBIT_FLAGSHIP_XP,
      firstClear: true,
      capped: false,
      remainingToday: EXHIBIT_DAILY_XP_CAP - EXHIBIT_FLAGSHIP_XP,
    })
  })

  it('survives malformed persisted payloads', () => {
    const storage = memoryStorage({
      [CITY_CAPS_STORAGE_KEY]: '{not json',
      [CITY_EXHIBITS_STORAGE_KEY]: '[1,2,3]',
    })
    const now = new Date(2026, 6, 11, 9, 30)
    expect(readCityCaps(storage, now)).toEqual({
      day: cityDayKey(now),
      exhibitXp: 0,
    })
    expect(readExhibitFlags(storage)).toEqual({})
    expect(claimExhibitXp('realm4:power-grid', { storage, now }).xp).toBe(
      EXHIBIT_FLAGSHIP_XP,
    )
  })

  it('missing storage still settles awards in memory', () => {
    const award = claimExhibitXp('realm6:bit-switchboard', {
      storage: null,
      now: new Date(2026, 6, 11),
    })
    expect(award.xp).toBe(EXHIBIT_FLAGSHIP_XP)
  })
})

/* ------------------------------------------------------------ city daily -- */

const DAILY_EMPTY: CityDailyState = {
  day: DAY,
  arcadeSessions: 0,
  courierDeliveries: 0,
  bitsCollected: 0,
}

describe('city daily counters', () => {
  it('resets stale or malformed daily payloads', () => {
    expect(
      normalizeCityDaily(
        { day: '2026-07-10', arcadeSessions: 3, courierDeliveries: 5, bitsCollected: 50 },
        DAY,
      ),
    ).toEqual(DAILY_EMPTY)
    expect(normalizeCityDaily('garbage', DAY)).toEqual(DAILY_EMPTY)
    expect(
      normalizeCityDaily(
        { day: DAY, arcadeSessions: -2, courierDeliveries: 1.9, bitsCollected: 'many' },
        DAY,
      ),
    ).toEqual({ ...DAILY_EMPTY, courierDeliveries: 1 })
  })

  it('round-trips through storage and survives bad JSON', () => {
    const storage = memoryStorage({ [CITY_DAILY_STORAGE_KEY]: '{broken' })
    const now = new Date(2026, 6, 11, 9, 0)
    expect(readCityDaily(storage, now)).toEqual({
      ...DAILY_EMPTY,
      day: cityDayKey(now),
    })
    startArcadeSession({ storage, now })
    expect(readCityDaily(storage, now).arcadeSessions).toBe(1)
  })
})

describe('arcade session caps', () => {
  it('allows exactly 3 sessions per day, then refuses', () => {
    let daily = DAILY_EMPTY
    for (let session = 1; session <= ARCADE_SESSIONS_PER_DAY; session++) {
      const result = settleArcadeSessionStart(daily)
      expect(result.allowed).toBe(true)
      expect(result.remainingToday).toBe(ARCADE_SESSIONS_PER_DAY - session)
      daily = result.daily
    }
    const blocked = settleArcadeSessionStart(daily)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remainingToday).toBe(0)
    expect(blocked.daily.arcadeSessions).toBe(ARCADE_SESSIONS_PER_DAY)
    expect(arcadeSessionsRemaining(blocked.daily)).toBe(0)
  })

  it('a new local day restores the arcade budget', () => {
    const storage = memoryStorage()
    const day1 = new Date(2026, 6, 11, 21, 0)
    for (let i = 0; i < ARCADE_SESSIONS_PER_DAY + 1; i++) {
      startArcadeSession({ storage, now: day1 })
    }
    expect(readCityDaily(storage, day1).arcadeSessions).toBe(
      ARCADE_SESSIONS_PER_DAY,
    )
    const day2 = new Date(2026, 6, 12, 8, 0)
    expect(startArcadeSession({ storage, now: day2 }).allowed).toBe(true)
  })
})

/* --------------------------------------------------------------- courier -- */

describe('courier routes', () => {
  it('anchors every route to two district plazas from the layout', () => {
    expect(COURIER_ROUTES).toHaveLength(COURIER_DELIVERIES_PER_DAY)
    const ids = new Set(COURIER_ROUTES.map(({ id }) => id))
    expect(ids.size).toBe(COURIER_ROUTES.length)
    for (const route of COURIER_ROUTES) {
      expect(route.id).toBe(
        `courier:realm${route.fromDistrict + 1}-realm${route.toDistrict + 1}`,
      )
      expect(route.from).toEqual(CHECKPOINTS_3D[route.fromDistrict].flag)
      expect(route.to).toEqual(CHECKPOINTS_3D[route.toDistrict].flag)
      expect(route.distance).toBeCloseTo(
        Math.hypot(route.to.x - route.from.x, route.to.z - route.from.z),
        6,
      )
      expect(route.baseXp).toBeGreaterThanOrEqual(24)
      expect(route.baseXp).toBeLessThanOrEqual(44)
      expect(route.targetSeconds).toBeGreaterThan(0)
      expect(courierRouteById(route.id)).toBe(route)
    }
    expect(courierRouteById('courier:nowhere')).toBeUndefined()
  })

  it('pays full XP inside the soft timer, fading to the 30% floor', () => {
    const route = { baseXp: 40, targetSeconds: 60 }
    expect(courierDeliveryXp(route, 0)).toBe(40)
    expect(courierDeliveryXp(route, 60)).toBe(40)
    // Halfway into the overrun: 40 · (1 − 0.7 · 0.5) = 26.
    expect(courierDeliveryXp(route, 90)).toBe(26)
    // At 2× target the floor is reached and never undercut.
    expect(courierDeliveryXp(route, 120)).toBe(
      Math.round(40 * COURIER_XP_FLOOR_RATIO),
    )
    expect(courierDeliveryXp(route, 100_000)).toBe(
      Math.round(40 * COURIER_XP_FLOOR_RATIO),
    )
  })

  it('only the first 5 deliveries of a day earn XP', () => {
    const route = COURIER_ROUTES[0]
    let daily = DAILY_EMPTY
    for (let run = 1; run <= COURIER_DELIVERIES_PER_DAY; run++) {
      const result = settleCourierDelivery(daily, route, 0)
      expect(result.xp).toBe(route.baseXp)
      expect(result.capped).toBe(false)
      expect(result.remainingToday).toBe(COURIER_DELIVERIES_PER_DAY - run)
      daily = result.daily
    }
    const sixth = settleCourierDelivery(daily, route, 0)
    expect(sixth.xp).toBe(0)
    expect(sixth.capped).toBe(true)
    expect(sixth.daily.courierDeliveries).toBe(COURIER_DELIVERIES_PER_DAY)
  })

  it('claimCourierDelivery persists and ignores unknown routes', () => {
    const storage = memoryStorage()
    const now = new Date(2026, 6, 11, 10, 0)
    const paid = claimCourierDelivery(COURIER_ROUTES[0].id, 10, { storage, now })
    expect(paid.xp).toBe(COURIER_ROUTES[0].baseXp)
    expect(readCityDaily(storage, now).courierDeliveries).toBe(1)
    const unknown = claimCourierDelivery('courier:nowhere', 10, { storage, now })
    expect(unknown.xp).toBe(0)
    expect(readCityDaily(storage, now).courierDeliveries).toBe(1)
  })
})

/* ------------------------------------------------------------------ bits -- */

describe('bit collectibles', () => {
  const anchors: BitAnchor[] = [
    { kind: 'park', x: 10, z: 10 },
    { kind: 'bench', x: -30, z: 44 },
    { kind: 'carRoof', x: 100, z: -60 },
    { kind: 'park', x: -200, z: -200 },
    { kind: 'bench', x: 250, z: 30 },
  ]

  it('isoWeekKey follows the ISO Thursday rule', () => {
    expect(isoWeekKey(new Date(2026, 0, 1))).toBe('2026-W01')
    // 2026-07-11 is a Saturday inside ISO week 28.
    expect(isoWeekKey(new Date(2026, 6, 11))).toBe('2026-W28')
    // 2027-01-01 is a Friday — still ISO week 53 of 2026.
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe('2026-W53')
  })

  it('reseeds weekly: same week identical, next week different', () => {
    const saturday = new Date(2026, 6, 11, 9, 0)
    const sunday = new Date(2026, 6, 12, 22, 0) // same ISO week
    const nextMonday = new Date(2026, 6, 13, 8, 0) // week 29
    expect(bitPlacementSeed(saturday)).toBe('bits|2026-W28')

    const a = placeBitCollectibles(saturday, 5, anchors)
    const b = placeBitCollectibles(sunday, 5, anchors)
    const c = placeBitCollectibles(nextMonday, 5, anchors)
    expect(b).toEqual(a)
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('keeps every bit within 2 m of its anchor; car bits sit on the roof', () => {
    const spawns = placeBitCollectibles(new Date(2026, 6, 11), 5, anchors)
    expect(spawns).toHaveLength(5)
    for (const spawn of spawns) {
      const anchor = anchors.find(
        ({ x, z }) =>
          Math.hypot(spawn.x - x, spawn.z - z) <= BIT_ANCHOR_MAX_OFFSET + 1e-9,
      )
      expect(anchor, spawn.id).toBeDefined()
      expect(spawn.anchor).toBe(anchor!.kind)
      if (spawn.anchor === 'carRoof') {
        expect(spawn.y).toBeGreaterThan(1)
        expect(
          Math.hypot(spawn.x - anchor!.x, spawn.z - anchor!.z),
        ).toBeLessThanOrEqual(0.7 + 1e-9)
      } else {
        expect(spawn.y).toBeLessThan(1)
      }
    }
  })

  it('spawns a deterministic field from the real city scenery too', () => {
    const now = new Date(2026, 6, 11)
    const a = placeBitCollectibles(now)
    const b = placeBitCollectibles(now)
    expect(a.length).toBeGreaterThan(0)
    expect(b).toEqual(a)
  })

  it('soft-caps XP at 50/day while still counting extra pickups', () => {
    let daily = { ...DAILY_EMPTY, bitsCollected: BIT_DAILY_SOFT_CAP - 2 }
    const nearCap = settleBitPickups(daily, 5)
    expect(nearCap.xp).toBe(2 * BIT_XP)
    expect(nearCap.capped).toBe(true)
    expect(nearCap.daily.bitsCollected).toBe(BIT_DAILY_SOFT_CAP + 3)
    expect(nearCap.remainingToday).toBe(0)

    daily = nearCap.daily
    const past = settleBitPickups(daily, 1)
    expect(past.xp).toBe(0)
    expect(past.capped).toBe(true)
    expect(past.daily.bitsCollected).toBe(BIT_DAILY_SOFT_CAP + 4)
  })

  it('claimBitPickups persists the running count', () => {
    const storage = memoryStorage()
    const now = new Date(2026, 6, 11, 12, 0)
    expect(claimBitPickups(3, { storage, now }).xp).toBe(3 * BIT_XP)
    expect(readCityDaily(storage, now).bitsCollected).toBe(3)
  })
})

/* ------------------------------------------------------------- cosmetics -- */

describe('photo cosmetics', () => {
  const NOTHING: CityMilestones = {
    exhibitsCleared: 0,
    courierDeliveries: 0,
    bitsCollected: 0,
  }

  it('defaults are always unlocked; milestones gate the rest', () => {
    const fresh = unlockedPhotoCosmeticIds(NOTHING)
    // Former exhibit-gated cosmetics are grandfathered to default unlocks
    // (their earner, the Data Dojo, was retired).
    expect(fresh).toEqual([
      'frame:city-glass',
      'frame:neon-grid',
      'frame:gold-leaf',
      'sticker:bolt',
      'sticker:crystal',
      'sticker:first-clear',
      'sticker:city-legend',
    ])

    const veteran = unlockedPhotoCosmeticIds({
      exhibitsCleared: 18,
      courierDeliveries: 5,
      bitsCollected: 100,
    })
    expect(veteran).toHaveLength(PHOTO_COSMETICS.length)
  })

  it('each unlock kind checks its own counter at the exact threshold', () => {
    const byId = new Map(PHOTO_COSMETICS.map((c) => [c.id, c]))
    // No shipped cosmetic uses the exhibits kind anymore (earner retired);
    // the resolver branch stays covered via an inline literal.
    const exhibitGated = {
      id: 'test:exhibit-gated',
      kind: 'sticker',
      label: 'Test',
      unlock: { kind: 'exhibits', cleared: 1 },
      unlockHint: 'test',
    } as const
    expect(isPhotoCosmeticUnlocked(exhibitGated, NOTHING)).toBe(false)
    expect(
      isPhotoCosmeticUnlocked(exhibitGated, { ...NOTHING, exhibitsCleared: 1 }),
    ).toBe(true)

    const express = byId.get('frame:courier-express')!
    expect(
      isPhotoCosmeticUnlocked(express, { ...NOTHING, courierDeliveries: 4 }),
    ).toBe(false)
    expect(
      isPhotoCosmeticUnlocked(express, { ...NOTHING, courierDeliveries: 5 }),
    ).toBe(true)

    const swarm = byId.get('sticker:bit-swarm')!
    expect(
      isPhotoCosmeticUnlocked(swarm, { ...NOTHING, bitsCollected: 49 }),
    ).toBe(false)
    expect(
      isPhotoCosmeticUnlocked(swarm, { ...NOTHING, bitsCollected: 50 }),
    ).toBe(true)
  })

  it('has unique ids and both kinds represented', () => {
    const ids = PHOTO_COSMETICS.map(({ id }) => id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(PHOTO_COSMETICS.some(({ kind }) => kind === 'frame')).toBe(true)
    expect(PHOTO_COSMETICS.some(({ kind }) => kind === 'sticker')).toBe(true)
  })
})

/* ------------------------------------------------- lifetime & milestones -- */

describe('lifetime milestone counters', () => {
  const day1 = new Date(2026, 6, 11, 22, 0)
  const day2 = new Date(2026, 6, 12, 8, 0)

  it('accrues courier deliveries across day boundaries while the daily resets', () => {
    const storage = memoryStorage()
    // Six finished runs on day 1: the daily XP cap stops at 5, the lifetime
    // record counts all six (a capped run still completes).
    for (let i = 0; i < COURIER_DELIVERIES_PER_DAY + 1; i++) {
      claimCourierDelivery(COURIER_ROUTES[i % COURIER_ROUTES.length].id, 10, {
        storage,
        now: day1,
      })
    }
    expect(readCityDaily(storage, day1).courierDeliveries).toBe(
      COURIER_DELIVERIES_PER_DAY,
    )
    expect(readCityLifetime({ storage }).courierDeliveries).toBe(
      COURIER_DELIVERIES_PER_DAY + 1,
    )

    claimCourierDelivery(COURIER_ROUTES[0].id, 10, { storage, now: day2 })
    // Midnight reset the daily counter — never the lifetime record.
    expect(readCityDaily(storage, day2).courierDeliveries).toBe(1)
    expect(readCityLifetime({ storage }).courierDeliveries).toBe(
      COURIER_DELIVERIES_PER_DAY + 2,
    )
  })

  it('accrues bit pickups across days, unknown courier routes never count', () => {
    const storage = memoryStorage()
    claimBitPickups(3, { storage, now: day1 })
    claimBitPickups(4, { storage, now: day2 })
    expect(readCityLifetime({ storage }).bitsCollected).toBe(7)
    expect(readCityDaily(storage, day2).bitsCollected).toBe(4)

    claimCourierDelivery('courier:nowhere', 10, { storage, now: day1 })
    expect(readCityLifetime({ storage }).courierDeliveries).toBe(0)
    claimBitPickups(0, { storage, now: day1 })
    expect(readCityLifetime({ storage }).bitsCollected).toBe(7)
  })

  it('firstDeliveryDone flips on the first finished delivery and stays flipped', () => {
    const storage = memoryStorage()
    expect(firstDeliveryDone({ storage })).toBe(false)
    claimCourierDelivery(COURIER_ROUTES[0].id, 10, { storage, now: day1 })
    expect(firstDeliveryDone({ storage })).toBe(true)
    // Still true after midnight — the vehicle never re-locks.
    expect(readCityDaily(storage, day2).courierDeliveries).toBe(0)
    expect(firstDeliveryDone({ storage })).toBe(true)
  })

  it('a capped (0 XP) delivery still flips firstDeliveryDone', () => {
    const storage = memoryStorage()
    storage.setItem(
      cityIdentityStorageKey(CITY_DAILY_STORAGE_KEY, CITY_GUEST_IDENTITY),
      JSON.stringify({
        day: cityDayKey(day1),
        arcadeSessions: 0,
        courierDeliveries: COURIER_DELIVERIES_PER_DAY,
        bitsCollected: 0,
      }),
    )
    const result = claimCourierDelivery(COURIER_ROUTES[0].id, 10, {
      storage,
      now: day1,
    })
    expect(result.capped).toBe(true)
    expect(result.xp).toBe(0)
    expect(firstDeliveryDone({ storage })).toBe(true)
  })

  it('milestones combine the lifetime record with the exhibit-flag count', () => {
    const storage = memoryStorage()
    claimExhibitXp('realm1:window-mag-train', { storage, now: day1 })
    claimExhibitXp('realm1:hash-lockers', {
      storage,
      now: day1,
      tier: 'standard',
    })
    claimCourierDelivery(COURIER_ROUTES[0].id, 10, { storage, now: day1 })
    claimBitPickups(7, { storage, now: day1 })
    expect(readCityMilestones({ storage })).toEqual({
      exhibitsCleared: 2,
      courierDeliveries: 1,
      bitsCollected: 7,
    })
  })

  it('photo cosmetics unlock durably from lifetime totals spanning days', () => {
    const storage = memoryStorage()
    for (let i = 0; i < 3; i++) {
      claimCourierDelivery(COURIER_ROUTES[i].id, 10, { storage, now: day1 })
    }
    expect(
      unlockedPhotoCosmeticIds(readCityMilestones({ storage })),
    ).not.toContain('frame:courier-express')
    for (let i = 0; i < 2; i++) {
      claimCourierDelivery(COURIER_ROUTES[i].id, 10, { storage, now: day2 })
    }
    // 3 + 2 lifetime deliveries: the 5-delivery frame stays unlocked forever.
    expect(unlockedPhotoCosmeticIds(readCityMilestones({ storage }))).toContain(
      'frame:courier-express',
    )
  })

  it('normalizeCityLifetime resets malformed payloads', () => {
    expect(normalizeCityLifetime(null)).toEqual({
      courierDeliveries: 0,
      bitsCollected: 0,
    })
    expect(
      normalizeCityLifetime({ courierDeliveries: 2.9, bitsCollected: 'many' }),
    ).toEqual({ courierDeliveries: 2, bitsCollected: 0 })
    const storage = memoryStorage({
      [cityIdentityStorageKey(CITY_LIFETIME_STORAGE_KEY, CITY_GUEST_IDENTITY)]:
        '{broken',
    })
    expect(readCityLifetime({ storage })).toEqual({
      courierDeliveries: 0,
      bitsCollected: 0,
    })
  })
})

/* ------------------------------------------------------ identity scoping -- */

describe('identity-scoped city-life storage', () => {
  const now = new Date(2026, 6, 11, 12, 0)

  it('two identities never share caps, flags, daily counters, or lifetime', () => {
    const storage = memoryStorage()
    claimExhibitXp('realm1:window-mag-train', {
      storage,
      now,
      identityId: 'user-a',
    })
    claimCourierDelivery(COURIER_ROUTES[0].id, 10, {
      storage,
      now,
      identityId: 'user-a',
    })
    claimBitPickups(3, { storage, now, identityId: 'user-a' })

    // Identity A sees its own records…
    expect(readCityCaps(storage, now, 'user-a').exhibitXp).toBe(
      EXHIBIT_FLAGSHIP_XP,
    )
    expect(Object.keys(readExhibitFlags(storage, 'user-a'))).toHaveLength(1)
    expect(readCityLifetime({ storage, identityId: 'user-a' })).toEqual({
      courierDeliveries: 1,
      bitsCollected: 3,
    })
    expect(firstDeliveryDone({ storage, identityId: 'user-a' })).toBe(true)

    // …identity B starts clean instead of inheriting them.
    expect(readCityCaps(storage, now, 'user-b').exhibitXp).toBe(0)
    expect(readExhibitFlags(storage, 'user-b')).toEqual({})
    expect(readCityDaily(storage, now, 'user-b').courierDeliveries).toBe(0)
    expect(firstDeliveryDone({ storage, identityId: 'user-b' })).toBe(false)
    // B's first clear of the same machine pays the full first-clear grant.
    expect(
      claimExhibitXp('realm1:window-mag-train', {
        storage,
        now,
        identityId: 'user-b',
      }).firstClear,
    ).toBe(true)
  })

  it('omitted identity settles under the shared guest scope', () => {
    const storage = memoryStorage()
    claimBitPickups(2, { storage, now })
    expect(
      readCityLifetime({ storage, identityId: CITY_GUEST_IDENTITY })
        .bitsCollected,
    ).toBe(2)
    expect(
      storage.dump()[
        cityIdentityStorageKey(CITY_DAILY_STORAGE_KEY, CITY_GUEST_IDENTITY)
      ],
    ).toBeDefined()
  })

  it('migrates device-global records into the FIRST identity that reads', () => {
    const legacyFlags = { 'realm1:window-mag-train': AT }
    const storage = removableStorage({
      [CITY_CAPS_STORAGE_KEY]: JSON.stringify({
        day: cityDayKey(now),
        exhibitXp: 120,
      }),
      [CITY_EXHIBITS_STORAGE_KEY]: JSON.stringify(legacyFlags),
      [CITY_DAILY_STORAGE_KEY]: JSON.stringify({
        day: cityDayKey(now),
        arcadeSessions: 2,
        courierDeliveries: 3,
        bitsCollected: 10,
      }),
    })
    // The first reader inherits every device-global record…
    expect(readCityCaps(storage, now, 'user-a').exhibitXp).toBe(120)
    expect(readExhibitFlags(storage, 'user-a')).toEqual(legacyFlags)
    expect(readCityDaily(storage, now, 'user-a').courierDeliveries).toBe(3)
    expect(storage.dump()[CITY_MIGRATION_MARKER_KEY]).toBe('user-a')
    // …the legacy keys are gone, and later identities start fresh.
    expect(storage.dump()[CITY_CAPS_STORAGE_KEY]).toBeUndefined()
    expect(readCityCaps(storage, now, 'user-b').exhibitXp).toBe(0)
    expect(readExhibitFlags(storage, 'user-b')).toEqual({})
    expect(readCityDaily(storage, now, 'user-b').courierDeliveries).toBe(0)
  })

  it('neutralizes legacy keys via setItem when removeItem is unavailable', () => {
    const storage = memoryStorage({
      [CITY_CAPS_STORAGE_KEY]: JSON.stringify({
        day: cityDayKey(now),
        exhibitXp: 99,
      }),
    })
    expect(readCityCaps(storage, now, 'user-a').exhibitXp).toBe(99)
    expect(storage.dump()[CITY_CAPS_STORAGE_KEY]).toBe('null')
    expect(readCityCaps(storage, now, 'user-b').exhibitXp).toBe(0)
  })

  it('never clobbers an existing identity record with stale legacy data', () => {
    const scopedKey = cityIdentityStorageKey(CITY_CAPS_STORAGE_KEY, 'user-a')
    const storage = removableStorage({
      [CITY_CAPS_STORAGE_KEY]: JSON.stringify({
        day: cityDayKey(now),
        exhibitXp: 300,
      }),
      [scopedKey]: JSON.stringify({ day: cityDayKey(now), exhibitXp: 40 }),
    })
    expect(readCityCaps(storage, now, 'user-a').exhibitXp).toBe(40)
  })
})

/* ---------------------------------------------------------- storm nights -- */

describe('storm nights', () => {
  it('storms exactly every 3rd night', () => {
    expect(STORM_NIGHT_EVERY).toBe(3)
    const stormy = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(isStormNight)
    expect(stormy).toEqual([3, 6, 9])
  })

  it('never storms on non-positive or fractional night numbers', () => {
    expect(isStormNight(0)).toBe(false)
    expect(isStormNight(-3)).toBe(false)
    expect(isStormNight(2.5)).toBe(false)
  })
})

/* ------------------------------------------------- learning vs. grinding -- */

describe('the learning path outearns the grind path', () => {
  it('holds per minute against a fully capped, fastest-possible grind day', () => {
    expect(learningPathOutearnsGrind()).toBe(true)
    expect(missionXpPerMinute()).toBeGreaterThan(grindXpPerMinute())
    // …with real headroom, so small tuning nudges can't silently flip it.
    expect(missionXpPerMinute()).toBeGreaterThanOrEqual(
      grindXpPerMinute() * 1.2,
    )
  })

  it('derives the grind ceiling from the live cap constants', () => {
    const arcadeMax = ARCADE_SESSIONS_PER_DAY * ARCADE_QUESTIONS_PER_SESSION * 18
    const courierMax = COURIER_ROUTES.reduce((sum, { baseXp }) => sum + baseXp, 0)
    expect(cappedDailyGrindXp()).toBe(
      EXHIBIT_DAILY_XP_CAP + arcadeMax + courierMax + BIT_DAILY_SOFT_CAP * BIT_XP,
    )
    expect(grindXpPerMinute()).toBeCloseTo(
      cappedDailyGrindXp() / GRIND_DAY_MINIMUM_MINUTES,
      9,
    )
  })
})

/* --------------------------------------------- weekly collected bit ids -- */

describe('collected bit ids (weekly record)', () => {
  const NOW = new Date('2026-07-11T12:00:00')
  const WEEK = isoWeekKey(NOW)

  it('normalizes only same-week, de-duplicated string ids', () => {
    expect(normalizeCityBitIds(null, WEEK)).toEqual([])
    expect(normalizeCityBitIds({ week: '2026-W01', ids: ['a'] }, WEEK)).toEqual([])
    expect(
      normalizeCityBitIds(
        { week: WEEK, ids: ['a', 'a', 7, '', 'b'] },
        WEEK,
      ),
    ).toEqual(['a', 'b'])
  })

  it('records ids cumulatively and reads them back within the week', () => {
    const storage = memoryStorage()
    const first = recordCollectedBitIds([`bit:${WEEK}:0`, `bit:${WEEK}:3`], {
      storage,
      now: NOW,
      identityId: 'user-a',
    })
    expect(first).toEqual([`bit:${WEEK}:0`, `bit:${WEEK}:3`])
    const second = recordCollectedBitIds([`bit:${WEEK}:3`, `bit:${WEEK}:5`], {
      storage,
      now: NOW,
      identityId: 'user-a',
    })
    expect(second).toEqual([`bit:${WEEK}:0`, `bit:${WEEK}:3`, `bit:${WEEK}:5`])
    expect(
      readCollectedBitIds({ storage, now: NOW, identityId: 'user-a' }),
    ).toEqual(second)
  })

  it('resets when the ISO week flips and scopes per identity', () => {
    const storage = memoryStorage()
    recordCollectedBitIds([`bit:${WEEK}:0`], {
      storage,
      now: NOW,
      identityId: 'user-a',
    })
    const nextWeek = new Date('2026-07-20T12:00:00')
    expect(
      readCollectedBitIds({ storage, now: nextWeek, identityId: 'user-a' }),
    ).toEqual([])
    expect(
      readCollectedBitIds({ storage, now: NOW, identityId: 'user-b' }),
    ).toEqual([])
    expect(
      readCollectedBitIds({ storage, now: NOW, identityId: 'user-a' }),
    ).toEqual([`bit:${WEEK}:0`])
  })
})

/* ------------------------------------------------- daily NPC chat record -- */

describe('district NPC chats (daily record)', () => {
  const NOW = new Date('2026-07-11T12:00:00')
  const TODAY = cityDayKey(NOW)

  it('normalizes only same-day, valid district indices', () => {
    expect(normalizeNpcChats(null, TODAY)).toEqual([])
    expect(
      normalizeNpcChats({ day: '2026-07-01', districts: [1] }, TODAY),
    ).toEqual([])
    expect(
      normalizeNpcChats(
        { day: TODAY, districts: [2, 2, -1, 1.5, 'x', 0] },
        TODAY,
      ),
    ).toEqual([2, 0])
  })

  it('marks chats idempotently and resets at the next local day', () => {
    const storage = memoryStorage()
    expect(
      markNpcChatToday(1, { storage, now: NOW, identityId: 'user-a' }),
    ).toEqual([1])
    expect(
      markNpcChatToday(1, { storage, now: NOW, identityId: 'user-a' }),
    ).toEqual([1])
    expect(
      markNpcChatToday(4, { storage, now: NOW, identityId: 'user-a' }),
    ).toEqual([1, 4])
    expect(
      readNpcChatsToday({ storage, now: NOW, identityId: 'user-a' }),
    ).toEqual([1, 4])
    const tomorrow = new Date('2026-07-12T09:00:00')
    expect(
      readNpcChatsToday({ storage, now: tomorrow, identityId: 'user-a' }),
    ).toEqual([])
  })

  it('scopes the record per identity', () => {
    const storage = memoryStorage()
    markNpcChatToday(0, { storage, now: NOW, identityId: 'user-a' })
    expect(
      readNpcChatsToday({ storage, now: NOW, identityId: 'user-b' }),
    ).toEqual([])
  })
})
