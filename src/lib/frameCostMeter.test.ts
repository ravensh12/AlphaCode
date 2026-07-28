import { afterEach, describe, expect, it } from 'vitest'
import { createFrameCostMeter } from './frameCostMeter'
import { frameJustifiesDemote } from './graphicsGovernor'

const meters: { dispose: () => void }[] = []
function meter() {
  const m = createFrameCostMeter()
  meters.push(m)
  return m
}
afterEach(() => {
  for (const m of meters.splice(0)) m.dispose()
})

describe('frame cost meter', () => {
  it('reports the wall delta between frames, and nothing for the first', () => {
    const m = meter()
    expect(m.beginFrame(1000)).toBe(0)
    expect(m.beginFrame(1016.7)).toBeCloseTo(16.7, 5)
    expect(m.beginFrame(1050)).toBeCloseTo(33.3, 5)
  })

  it('tracks the cadence floor as the fastest frame recently observed', () => {
    const m = meter()
    let t = 0
    // A 60Hz beat with one slow frame in it: the floor is the beat, not the
    // average and not the slow frame.
    for (let i = 0; i < 10; i++) {
      t += i === 5 ? 60 : 16.7
      m.beginFrame(t)
    }
    expect(m.cost().floorMs).toBeCloseTo(16.7, 1)
  })

  it('lets the floor RISE when the display genuinely slows down', () => {
    const m = meter()
    let t = 0
    for (let i = 0; i < 60; i++) {
      t += 16.7
      m.beginFrame(t)
    }
    expect(m.cost().floorMs).toBeCloseTo(16.7, 1)
    // Window dragged to a 30Hz panel: after more than one floor window of
    // 33.3ms frames the floor must follow, otherwise every frame reads as a
    // cadence break forever.
    for (let i = 0; i < 300; i++) {
      t += 33.3
      m.beginFrame(t)
    }
    expect(m.cost().floorMs).toBeCloseTo(33.3, 1)
  })

  it('ignores implausibly short deltas when learning the floor', () => {
    const m = meter()
    let t = 0
    for (let i = 0; i < 20; i++) {
      t += 16.7
      m.beginFrame(t)
    }
    // A clock artifact / double-fired frame must not convince the meter the
    // display runs at 1000Hz, which would make every real frame a "break".
    t += 0.2
    m.beginFrame(t)
    expect(m.cost().floorMs).toBeCloseTo(16.7, 1)
  })

  it('revives itself after dispose, so a double-invoked mount effect is harmless', async () => {
    const m = meter()
    m.beginFrame(0)
    m.beginFrame(16.7)
    // Exactly what React StrictMode does: run the cleanup, then mount again
    // with the same retained object.
    m.dispose()
    expect(m.cost().workMs).toBeNaN()
    let t = 33.4
    for (let i = 0; i < 4; i++) {
      m.beginFrame((t += 16.7))
      await new Promise((r) => setTimeout(r, 5))
    }
    expect(Number.isFinite(m.cost().workMs)).toBe(true)
  })

  it('reports "no evidence" rather than a stale reading if a reply is lost', () => {
    const m = meter()
    m.beginFrame(0)
    m.beginFrame(16.7)
    // No event loop turn has happened, so the reply cannot have arrived and
    // the meter has nothing honest to say yet.
    expect(m.cost().workMs).toBeNaN()
    expect(frameJustifiesDemote(40, m.cost())).toBe(true)
  })

  it('feeds the governor a verdict of "capped, not struggling" on a steady beat', async () => {
    const m = meter()
    let t = 0
    for (let i = 0; i < 20; i++) {
      t += 33.3
      m.beginFrame(t)
    }
    // Let the posted message land so a real work measurement exists.
    await new Promise((r) => setTimeout(r, 20))
    m.beginFrame((t += 33.3))
    await new Promise((r) => setTimeout(r, 20))
    const cost = m.cost()
    expect(cost.floorMs).toBeCloseTo(33.3, 1)
    // The test does no rendering, so the measured work is ~0 — the same shape
    // as a capped display, and the governor must read it as "no evidence".
    expect(frameJustifiesDemote(33.4, cost)).toBe(false)
  })
})
