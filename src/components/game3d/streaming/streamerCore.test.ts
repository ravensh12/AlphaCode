import { describe, expect, it, vi } from 'vitest'
import type { RealmId } from '../../../types/curriculum'
import type { AssetManifestEntry } from '../../../content/assets/assetManifest'
import { DistrictStreamerCore, type StreamedAsset } from './streamerCore'
import type { DistrictSpec } from './districts'

/* Six districts on a line, 400m apart — realistic spacing for Code City. */
const SPECS: DistrictSpec[] = Array.from({ length: 6 }, (_, i) => ({
  id: `realm${i + 1}` as RealmId,
  index: i,
  x: i * 400,
  z: 0,
}))

function fakeEntry(district: RealmId, i = 0): AssetManifestEntry {
  return {
    id: `${district}-asset-${i}`,
    path: `assets/test/${district}-${i}.ktx2`,
    kind: 'texture',
    bytes: 1000,
    license: 'CC0-1.0',
    sourceUrl: 'https://example.com',
    author: 'test',
    source: 'PolyHaven',
    districts: [district],
    minTier: 'low',
  }
}

interface Deferred {
  district: RealmId
  resolve: (assets: StreamedAsset[]) => void
  reject: (err: unknown) => void
}

/** Fake loader that parks every request until the test settles it. */
function makeFakeLoader() {
  const inFlight: Deferred[] = []
  const disposed: string[] = []
  const loader = vi.fn((district: RealmId, entries: AssetManifestEntry[]) => {
    return new Promise<StreamedAsset[]>((resolve, reject) => {
      inFlight.push({
        district,
        resolve: () =>
          resolve(
            entries.map((entry) => ({
              entry,
              resource: { fake: entry.id },
              dispose: () => disposed.push(entry.id),
            })),
          ),
        reject,
      })
    })
  })
  const settle = async (district?: RealmId) => {
    const i = district ? inFlight.findIndex((d) => d.district === district) : 0
    expect(i, `no in-flight load for ${district ?? 'any'}`).toBeGreaterThanOrEqual(0)
    const [deferred] = inFlight.splice(i, 1)
    deferred.resolve([])
    await Promise.resolve()
    await Promise.resolve()
  }
  const fail = async (district: RealmId) => {
    const i = inFlight.findIndex((d) => d.district === district)
    expect(i).toBeGreaterThanOrEqual(0)
    const [deferred] = inFlight.splice(i, 1)
    deferred.reject(new Error('network down'))
    await Promise.resolve()
    await Promise.resolve()
  }
  return { loader, inFlight, disposed, settle, fail }
}

function makeCore(opts?: {
  maxConcurrentLoads?: number
  entriesPerDistrict?: number
}) {
  const fake = makeFakeLoader()
  const core = new DistrictStreamerCore({
    districts: SPECS,
    tier: 'high',
    loadBundle: fake.loader,
    loadRadius: 260,
    prefetchRadius: 520,
    disposeRadius: 700,
    maxConcurrentLoads: opts?.maxConcurrentLoads ?? 1,
    entriesFor: (district) =>
      Array.from({ length: opts?.entriesPerDistrict ?? 2 }, (_, i) => fakeEntry(district, i)),
  })
  return { core, ...fake }
}

describe('district streamer — load priority', () => {
  it('loads the district underfoot first, then prefetches neighbours', async () => {
    const { core, loader, settle } = makeCore()
    core.update(0, 0) // standing on realm1
    expect(core.status('realm1')).toBe('loading')
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader.mock.calls[0][0]).toBe('realm1')

    await settle('realm1')
    expect(core.status('realm1')).toBe('ready')

    // Next pass starts the quest-adjacent prefetch (realm2 at 400m).
    core.update(0, 0)
    expect(core.status('realm2')).toBe('loading')
    await settle('realm2')
    expect(core.status('realm2')).toBe('ready')
    // realm3 (800m) is neither in prefetch range nor adjacent to the nearest.
    core.update(0, 0)
    expect(core.status('realm3')).toBe('idle')
  })

  it('a required district is never queued behind a prefetch load', async () => {
    const { core, loader, settle } = makeCore()
    core.update(0, 0)
    await settle('realm1')
    core.update(0, 0) // realm2 prefetch starts (concurrency cap now full)
    expect(core.status('realm2')).toBe('loading')

    // Player teleports onto realm4 while the prefetch is still in flight —
    // the required load must start immediately despite the cap.
    core.update(1200, 0)
    expect(core.status('realm4')).toBe('loading')
    const districtsLoaded = loader.mock.calls.map((c) => c[0])
    expect(districtsLoaded).toContain('realm4')
  })

  it('nearest district wins when several want loading at once', () => {
    const { core, loader } = makeCore()
    // Between realm2 (400) and realm3 (800), nearer realm3.
    core.update(650, 0)
    expect(loader.mock.calls[0][0]).toBe('realm3')
  })

  it('an empty bundle resolves to ready synchronously', () => {
    const fake = makeFakeLoader()
    const core = new DistrictStreamerCore({
      districts: SPECS,
      tier: 'high',
      loadBundle: fake.loader,
      entriesFor: () => [],
    })
    core.update(0, 0)
    expect(core.status('realm1')).toBe('ready')
    expect(fake.loader).not.toHaveBeenCalled()
  })
})

describe('district streamer — dispose on far leave', () => {
  it('disposes every asset of a bundle once past the dispose radius', async () => {
    const { core, disposed, settle } = makeCore()
    core.update(0, 0)
    await settle('realm1')
    expect(core.status('realm1')).toBe('ready')

    // Walk far away (realm1 at 2000m > 700m dispose radius, not adjacent).
    core.update(2000, 0)
    expect(core.status('realm1')).toBe('idle')
    expect(disposed).toEqual(['realm1-asset-0', 'realm1-asset-1'])
  })

  it('keeps bundles inside the hysteresis band (no churn at the boundary)', async () => {
    const { core, disposed, settle } = makeCore()
    core.update(0, 0)
    await settle('realm1')

    // 600m: outside prefetch (520) but inside dispose (700) — realm1 is also
    // quest-adjacent to nearest realm2, so it must stay resident either way.
    core.update(600, 0)
    expect(core.status('realm1')).toBe('ready')
    expect(disposed).toEqual([])
  })

  it('a load that finishes after its district was disposed self-disposes', async () => {
    const { core, disposed, settle } = makeCore()
    core.update(0, 0)
    expect(core.status('realm1')).toBe('loading')

    // Teleport away before the load settles → slot disposed while in flight.
    core.update(2400, 0)
    expect(core.status('realm1')).toBe('idle')

    // Now the stale load arrives with real assets: they must be disposed
    // immediately, and the district must NOT resurrect to ready.
    await settle('realm1')
    expect(disposed).toEqual(['realm1-asset-0', 'realm1-asset-1'])
    expect(core.status('realm1')).toBe('idle')
    expect(core.getSnapshot('realm1').bundle).toBeNull()
  })

  it('disposeAll clears every resident bundle (page unmount)', async () => {
    const { core, disposed, settle } = makeCore()
    core.update(0, 0)
    await settle('realm1')
    core.update(0, 0)
    await settle('realm2')
    core.disposeAll()
    expect(core.status('realm1')).toBe('idle')
    expect(core.status('realm2')).toBe('idle')
    expect(disposed.length).toBe(4)
  })
})

describe('district streamer — errors & snapshots', () => {
  it('a failed load reports error, then retries after leaving and returning', async () => {
    const { core, loader, fail } = makeCore()
    core.update(0, 0)
    await fail('realm1')
    expect(core.status('realm1')).toBe('error')

    // Leaving past the dispose ring resets to idle…
    core.update(2400, 0)
    expect(core.status('realm1')).toBe('idle')
    // …and coming back retries the load.
    core.update(0, 0)
    expect(core.status('realm1')).toBe('loading')
    expect(loader.mock.calls.filter((c) => c[0] === 'realm1').length).toBe(2)
  })

  it('publishes stable snapshots and notifies subscribers on transitions', async () => {
    const { core, settle } = makeCore()
    const events: string[] = []
    const unsubscribe = core.subscribe(() => events.push(core.status('realm1')))

    const idle = core.getSnapshot('realm1')
    expect(idle).toEqual({ status: 'idle', bundle: null })
    expect(core.getSnapshot('realm1')).toBe(idle) // stable identity

    core.update(0, 0)
    await settle('realm1')
    const ready = core.getSnapshot('realm1')
    expect(ready.status).toBe('ready')
    expect(ready.bundle?.district).toBe('realm1')
    expect(core.getSnapshot('realm1')).toBe(ready) // cached between changes
    expect(events).toEqual(['loading', 'ready'])

    unsubscribe()
    core.disposeAll()
    expect(events).toEqual(['loading', 'ready'])
  })

  it('unknown districts return the idle snapshot', () => {
    const { core } = makeCore()
    expect(core.getSnapshot('realm1')).toEqual({ status: 'idle', bundle: null })
    expect(core.status('realm1')).toBe('idle')
  })
})
