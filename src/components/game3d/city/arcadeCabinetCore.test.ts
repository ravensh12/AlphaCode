import { describe, expect, it } from 'vitest'
import {
  ARCADE_SCREEN_MAX_COUNT,
  arcadeScreenContent,
  arcadeScreenKey,
  marqueePulse,
} from './arcadeCabinetCore'

describe('arcadeScreenContent', () => {
  it('shows the standby copy before any review history exists', () => {
    expect(arcadeScreenContent(0, true)).toEqual({
      title: 'PATTERN ARCADE',
      big: 'READY',
      sub: 'NO PATTERNS YET',
    })
    // Empty wins even if a stale count sneaks in.
    expect(arcadeScreenContent(7, true).big).toBe('READY')
  })

  it('celebrates a clear queue', () => {
    expect(arcadeScreenContent(0, false).big).toBe('CLEAR')
    expect(arcadeScreenContent(-3, false).big).toBe('CLEAR')
  })

  it('pluralizes the due line', () => {
    expect(arcadeScreenContent(1, false)).toMatchObject({
      big: '1',
      sub: 'PATTERN DUE',
    })
    expect(arcadeScreenContent(7, false)).toMatchObject({
      big: '7',
      sub: 'PATTERNS DUE',
    })
  })

  it('floors fractions and caps the display at 99+', () => {
    expect(arcadeScreenContent(3.9, false).big).toBe('3')
    expect(arcadeScreenContent(ARCADE_SCREEN_MAX_COUNT, false).big).toBe('99')
    expect(arcadeScreenContent(100, false).big).toBe('99+')
    expect(arcadeScreenContent(500, false).big).toBe('99+')
  })
})

describe('arcadeScreenKey (canvas regeneration guard)', () => {
  it('is stable for identical content', () => {
    expect(arcadeScreenKey(5, false)).toBe(arcadeScreenKey(5, false))
    expect(arcadeScreenKey(0, true)).toBe(arcadeScreenKey(0, true))
  })

  it('changes exactly when the DISPLAYED content changes', () => {
    expect(arcadeScreenKey(3, false)).not.toBe(arcadeScreenKey(4, false))
    expect(arcadeScreenKey(0, false)).not.toBe(arcadeScreenKey(0, true))
    expect(arcadeScreenKey(1, false)).not.toBe(arcadeScreenKey(2, false))
  })

  it('never repaints when counts render identically (99+ band, fractions)', () => {
    expect(arcadeScreenKey(120, false)).toBe(arcadeScreenKey(130, false))
    expect(arcadeScreenKey(3, false)).toBe(arcadeScreenKey(3.7, false))
    // Any due count is irrelevant while the screen shows the standby copy.
    expect(arcadeScreenKey(3, true)).toBe(arcadeScreenKey(9, true))
  })
})

describe('marqueePulse', () => {
  it('breathes inside [0.55, 1]', () => {
    for (let t = 0; t < 12; t += 0.13) {
      const value = marqueePulse(t)
      expect(value).toBeGreaterThanOrEqual(0.55 - 1e-9)
      expect(value).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('actually moves over time', () => {
    expect(marqueePulse(0)).not.toBeCloseTo(marqueePulse(0.7), 3)
  })
})
