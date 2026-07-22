import { describe, expect, it } from 'vitest'
import type { DemoGuaranteeEvaluationInput } from '../types/demoGuarantee'
import { createDemoGuaranteeSimulation } from './demoGuarantee'
import {
  demoGuaranteeStorageKey,
  LocalDemoGuaranteeStore,
  type DemoGuaranteeStorageLike,
} from './localDemoGuarantee'

class TestStorage implements DemoGuaranteeStorageLike {
  readonly values = new Map<string, string>()
  failReads = false
  failWrites = false

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('read blocked')
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('write blocked')
    this.values.set(key, value)
  }
}

const input = (
  simulationRunId: string,
  recordedAt = '2026-07-11T12:00:00.000Z',
): DemoGuaranteeEvaluationInput => ({
  simulationRunId,
  scenario: 'eligible-path',
  completedMissions: 150,
  delayedReviewAdherenceMet: true,
  remediationComplete: true,
  certificationAchieved: false,
  windowStartsAt: '2026-07-01T12:00:00.000Z',
  evaluatedAt: '2026-07-11T12:00:00.000Z',
  recordedAt,
})

describe('LocalDemoGuaranteeStore', () => {
  it('scopes simulation data to the exact identity', () => {
    const storage = new TestStorage()
    const store = new LocalDemoGuaranteeStore(storage)
    const guest = createDemoGuaranteeSimulation(input('guest-run'))
    const account = createDemoGuaranteeSimulation(input('account-run'))

    store.save('guest', guest)
    store.save('account-1', account)

    expect(store.load('guest')?.simulationRunId).toBe('guest-run')
    expect(store.load('account-1')?.simulationRunId).toBe('account-run')
    expect(demoGuaranteeStorageKey('guest')).not.toBe(
      demoGuaranteeStorageKey('account-1'),
    )
  })

  it('preserves malformed JSON on load and on a later save attempt', () => {
    const storage = new TestStorage()
    const key = demoGuaranteeStorageKey('guest')
    const original = '{"schemaVersion":1,"isSimulation":'
    storage.values.set(key, original)
    const store = new LocalDemoGuaranteeStore(storage)

    expect(() => store.load('guest')).toThrow(/preserved/i)
    expect(storage.values.get(key)).toBe(original)
    expect(() =>
      store.save(
        'guest',
        createDemoGuaranteeSimulation(input('replacement-run')),
      ),
    ).toThrow(/preserved/i)
    expect(storage.values.get(key)).toBe(original)
  })

  it('rejects isSimulation false without replacing the original bytes', () => {
    const storage = new TestStorage()
    const key = demoGuaranteeStorageKey('guest')
    const valid = createDemoGuaranteeSimulation(input('run-1'))
    const original = JSON.stringify({ ...valid, isSimulation: false })
    storage.values.set(key, original)
    const store = new LocalDemoGuaranteeStore(storage)

    expect(() => store.load('guest')).toThrow(/preserved/i)
    expect(() =>
      store.save(
        'guest',
        createDemoGuaranteeSimulation(input('replacement-run')),
      ),
    ).toThrow(/preserved/i)
    expect(storage.values.get(key)).toBe(original)
  })

  it('surfaces storage read and write exceptions without clearing bytes', () => {
    const storage = new TestStorage()
    const key = demoGuaranteeStorageKey('guest')
    const first = createDemoGuaranteeSimulation(input('run-1'))
    const store = new LocalDemoGuaranteeStore(storage)
    store.save('guest', first)
    const original = storage.values.get(key)

    storage.failReads = true
    expect(() => store.load('guest')).toThrow(/read/i)
    expect(storage.values.get(key)).toBe(original)

    storage.failReads = false
    storage.failWrites = true
    const newer = createDemoGuaranteeSimulation(
      input('run-2', '2026-07-12T12:00:00.000Z'),
    )
    expect(() => store.save('guest', newer)).toThrow(/persist/i)
    expect(storage.values.get(key)).toBe(original)
  })
})
