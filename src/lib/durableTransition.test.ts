import { describe, expect, it, vi } from 'vitest'
import { runDurableTransition } from './durableTransition'

describe('durable progression transition', () => {
  it('does not advance when the local save rejects', async () => {
    const advance = vi.fn()
    const failure = new Error('quota exceeded')
    const result = await runDurableTransition(
      async () => {
        throw failure
      },
      advance,
    )
    expect(result).toEqual({ ok: false, error: failure })
    expect(advance).not.toHaveBeenCalled()
  })

  it('advances exactly once after the local save resolves', async () => {
    const advance = vi.fn()
    await expect(
      runDurableTransition(async () => undefined, advance),
    ).resolves.toEqual({ ok: true })
    expect(advance).toHaveBeenCalledOnce()
  })
})
