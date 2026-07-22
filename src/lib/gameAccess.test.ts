import { beforeEach, describe, expect, it } from 'vitest'
import {
  canAccessAcademyBossEntry,
  canAccessAcademyMissionEntry,
  clearAcademyEntryTokens,
  grantAcademyBossEntry,
  grantAcademyTrackEntry,
  hasAcademyBossEntry,
  hasAcademyTrackEntry,
  type GameAccessStorage,
} from './gameAccess'

class MemoryStorage implements GameAccessStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('stable academy physical-entry tokens', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
  })

  it('rejects direct mission URLs until the matching checkpoint token exists', () => {
    expect(
      canAccessAcademyMissionEntry(
        'realm1',
        'arrays-hashing',
        { completed: false, guestPreview: false },
        storage,
      ),
    ).toBe(false)

    grantAcademyTrackEntry('realm1', 'arrays-hashing', storage)
    expect(hasAcademyTrackEntry('realm1', 'arrays-hashing', storage)).toBe(true)
    expect(
      canAccessAcademyMissionEntry(
        'realm1',
        'arrays-hashing',
        { completed: false, guestPreview: false },
        storage,
      ),
    ).toBe(true)
    expect(hasAcademyTrackEntry('realm1', 'arrays-hashing', storage)).toBe(true)
    expect(hasAcademyTrackEntry('realm1', 'two-pointers', storage)).toBe(false)
  })

  it('preserves completed review and the intentional first guest preview', () => {
    expect(
      canAccessAcademyMissionEntry(
        'realm3',
        'trees',
        { completed: true, guestPreview: false },
        storage,
      ),
    ).toBe(true)
    expect(
      canAccessAcademyMissionEntry(
        'realm1',
        'arrays-hashing',
        { completed: false, guestPreview: true },
        storage,
      ),
    ).toBe(true)
  })

  it('rejects direct boss URLs but permits a physical token or cleared rematch', () => {
    expect(canAccessAcademyBossEntry('realm2', false, storage)).toBe(false)

    grantAcademyBossEntry('realm2', storage)
    expect(hasAcademyBossEntry('realm2', storage)).toBe(true)
    expect(canAccessAcademyBossEntry('realm2', false, storage)).toBe(true)
    expect(canAccessAcademyBossEntry('realm3', false, storage)).toBe(false)

    clearAcademyEntryTokens(storage)
    expect(canAccessAcademyBossEntry('realm2', false, storage)).toBe(false)
    expect(canAccessAcademyBossEntry('realm2', true, storage)).toBe(true)
  })
})
