import { describe, expect, it } from 'vitest'
import source from './GauntletContext.tsx?raw'

describe('GauntletContext durable cloud queue', () => {
  it('persists locally before cloud and retries at startup/online', () => {
    expect(source).toContain("throw new Error('Unable to save gauntlet progress locally')")
    expect(source).toContain('pendingCloudSync')
    expect(source).toContain("window.addEventListener('online', retry)")
    expect(source).toContain(
      "document.addEventListener('visibilitychange', visible)",
    )
    const persist = source.slice(
      source.indexOf('const persist'),
      source.indexOf('const recordOutcome'),
    )
    expect(persist.indexOf('saveGauntlet(id, next)')).toBeLessThan(
      persist.indexOf('void flushCloud()'),
    )
  })
})
