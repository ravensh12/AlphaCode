import { describe, it, expect } from 'vitest'
import {
  badgeCountsFromEarnedList,
  computeBadgeCounts,
  emptyBadgeCounts,
  mergeBadgeCounts,
  normalizeBadgeCounts,
  reconcileBadgeCounts,
  totalBadgeCount,
  SPEED_DEMON_THRESHOLD,
} from './badges'

describe('normalizeBadgeCounts', () => {
  it('passes sane counts through and floors fractions', () => {
    const counts = normalizeBadgeCounts({ lightning: 3, quick: 2.9 })
    expect(counts.lightning).toBe(3)
    expect(counts.quick).toBe(2)
    expect(counts['speed-demon']).toBe(0)
    expect(counts.flawless).toBe(0)
  })

  it('returns empty counts for null/undefined/garbage input', () => {
    expect(normalizeBadgeCounts(null)).toEqual(emptyBadgeCounts())
    expect(normalizeBadgeCounts(undefined)).toEqual(emptyBadgeCounts())
    expect(
      normalizeBadgeCounts({ lightning: 'no' } as unknown as Record<string, number>),
    ).toEqual(emptyBadgeCounts())
  })

  // Regression: corrupted counts (Infinity/NaN/negative/absurd) reached
  // saveBadgesCloud's legacy fallback, where Array.from({ length }) threw
  // "RangeError: Invalid array length" and killed the whole cloud write.
  it('clamps corrupted values so cloud writes cannot blow up', () => {
    const counts = normalizeBadgeCounts({
      lightning: Infinity,
      quick: NaN,
      'speed-demon': -4,
      flawless: 1e12,
    })
    expect(Number.isSafeInteger(counts.lightning)).toBe(true)
    expect(counts.quick).toBe(0)
    expect(counts['speed-demon']).toBe(0)
    expect(counts.flawless).toBeLessThanOrEqual(100000)
    // The exact failure mode from the logs: expanding into a legacy id list.
    for (const [id, n] of Object.entries(counts)) {
      expect(() => Array.from({ length: n }, () => id)).not.toThrow()
    }
  })
})

describe('merge / reconcile', () => {
  it('mergeBadgeCounts adds only positive deltas', () => {
    const merged = mergeBadgeCounts(
      { lightning: 2, quick: 0, 'speed-demon': 1, flawless: 0 },
      { lightning: 1, quick: -5, flawless: 2 },
    )
    expect(merged).toEqual({ lightning: 3, quick: 0, 'speed-demon': 1, flawless: 2 })
  })

  it('reconcileBadgeCounts keeps the higher count per badge', () => {
    const rec = reconcileBadgeCounts(
      { lightning: 5, quick: 1, 'speed-demon': 0, flawless: 2 },
      { lightning: 2, quick: 4, 'speed-demon': 1, flawless: 2 },
    )
    expect(rec).toEqual({ lightning: 5, quick: 4, 'speed-demon': 1, flawless: 2 })
    expect(totalBadgeCount(rec)).toBe(12)
  })
})

describe('computeBadgeCounts', () => {
  it('awards speed-demon at the lightning threshold and flawless on perfect runs', () => {
    const counts = computeBadgeCounts(
      { lightningCount: SPEED_DEMON_THRESHOLD, quickCount: 1, correctFirstTry: 6 },
      6,
    )
    expect(counts.lightning).toBe(SPEED_DEMON_THRESHOLD)
    expect(counts['speed-demon']).toBe(1)
    expect(counts.flawless).toBe(1)
  })

  it('never awards flawless on lessons with no interactive steps', () => {
    const counts = computeBadgeCounts(
      { lightningCount: 0, quickCount: 0, correctFirstTry: 0 },
      0,
    )
    expect(counts.flawless).toBe(0)
  })
})

describe('badgeCountsFromEarnedList', () => {
  it('counts legacy ids and ignores unknown ones', () => {
    const counts = badgeCountsFromEarnedList(['lightning', 'lightning', 'quick', 'bogus'])
    expect(counts.lightning).toBe(2)
    expect(counts.quick).toBe(1)
    expect(totalBadgeCount(counts)).toBe(3)
  })
})
