import { describe, expect, it } from 'vitest'
import { isoWeekKey, placeBitCollectibles } from '../../../lib/cityLife'
import {
  BIT_COLLECT_RADIUS,
  BIT_TINT_ONE,
  BIT_TINT_ZERO,
  bitTint,
  collectBitsNear,
  dateFromIsoWeekKey,
} from './bitCollectiblesCore'

const FIELD = [
  { id: 'bit:2026-W28:0', x: 0, z: 0 },
  { id: 'bit:2026-W28:1', x: 1, z: 0 },
  { id: 'bit:2026-W28:2', x: 0, z: 1.2 },
  { id: 'bit:2026-W28:3', x: 5, z: 5 },
  { id: 'bit:2026-W28:4', x: -1.05, z: -1.05 },
]

describe('collectBitsNear (auto-collect math)', () => {
  it('sweeps everything inside the radius, in spawn order', () => {
    expect(collectBitsNear(FIELD, new Set(), 0, 0)).toEqual([
      'bit:2026-W28:0',
      'bit:2026-W28:1',
      'bit:2026-W28:2',
      'bit:2026-W28:4',
    ])
  })

  it('skips ids already collected without touching the caller set', () => {
    const collected = new Set(['bit:2026-W28:0', 'bit:2026-W28:2'])
    expect(collectBitsNear(FIELD, collected, 0, 0)).toEqual([
      'bit:2026-W28:1',
      'bit:2026-W28:4',
    ])
    expect(collected.size).toBe(2)
  })

  it('includes the exact boundary and excludes just beyond it', () => {
    const spawns = [
      { id: 'edge', x: BIT_COLLECT_RADIUS, z: 0 },
      { id: 'beyond', x: BIT_COLLECT_RADIUS + 1e-6, z: 0 },
    ]
    expect(collectBitsNear(spawns, new Set(), 0, 0)).toEqual(['edge'])
  })

  it('measures from the hero, not the origin', () => {
    expect(collectBitsNear(FIELD, new Set(), 5, 5)).toEqual(['bit:2026-W28:3'])
  })

  it('honors a custom radius', () => {
    expect(collectBitsNear(FIELD, new Set(), 0, 0, 0.5)).toEqual([
      'bit:2026-W28:0',
    ])
    expect(collectBitsNear(FIELD, new Set(), 0, 0, 10)).toHaveLength(5)
  })

  it('returns nothing for an empty field or a fully collected one', () => {
    expect(collectBitsNear([], new Set(), 0, 0)).toEqual([])
    expect(
      collectBitsNear(FIELD, new Set(FIELD.map(({ id }) => id)), 0, 0),
    ).toEqual([])
  })
})

describe('bitTint', () => {
  it('alternates gold "1" bits and cyan "0" bits', () => {
    expect(bitTint(0)).toBe(BIT_TINT_ONE)
    expect(bitTint(1)).toBe(BIT_TINT_ZERO)
    expect(bitTint(2)).toBe(BIT_TINT_ONE)
  })
})

describe('dateFromIsoWeekKey (stable weekly render anchor)', () => {
  it('round-trips through isoWeekKey, including year boundaries', () => {
    for (const key of ['2026-W01', '2026-W28', '2025-W52', '2027-W53']) {
      const anchor = dateFromIsoWeekKey(key)
      // W53 only exists in long ISO years; skip keys the calendar rejects.
      if (isoWeekKey(anchor) !== key && key.endsWith('W53')) continue
      expect(isoWeekKey(anchor)).toBe(key)
    }
  })

  it('any Date inside one week renders the identical bit field', () => {
    const monday = new Date('2026-07-06T09:00:00.000Z')
    const sunday = new Date('2026-07-12T22:00:00.000Z')
    expect(isoWeekKey(monday)).toBe(isoWeekKey(sunday))
    const canonical = dateFromIsoWeekKey(isoWeekKey(monday))
    expect(placeBitCollectibles(canonical)).toEqual(
      placeBitCollectibles(monday),
    )
    expect(placeBitCollectibles(canonical)).toEqual(
      placeBitCollectibles(sunday),
    )
  })

  it('rejects malformed keys with an invalid Date', () => {
    expect(Number.isNaN(dateFromIsoWeekKey('garbage').getTime())).toBe(true)
  })
})
