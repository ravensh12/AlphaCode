import type { RealmId } from '../../../types/curriculum'
import type { GraphicsTier } from '../../../lib/graphicsQuality'
import { assetsForDistrict, type AssetManifestEntry } from '../../../content/assets/assetManifest'
import {
  DISTRICT_DISPOSE_RADIUS,
  DISTRICT_LOAD_RADIUS,
  DISTRICT_PREFETCH_RADIUS,
  type DistrictSpec,
} from './districts'

/* ============================================================================
   District streaming core — pure logic, no React, no three.js.

   The runtime (DistrictStreamer.tsx) drives `update(x, z)` from a coarse
   interval — NEVER from useFrame — and injects a bundle loader that does the
   real fetching/GPU upload. This module owns the decisions:

   - required:  district centre within LOAD radius
   - prefetch:  within PREFETCH radius, or quest-adjacent (index ± 1) to the
                nearest district so the next stop on the trail is always warm
   - dispose:   loaded bundle farther than DISPOSE radius (hysteresis band
                between prefetch and dispose prevents churn at boundaries)

   Loads run nearest-first with a small concurrency cap. A generation counter
   per district makes disposal safe against in-flight loads: results arriving
   for a stale generation are disposed immediately instead of resurrecting.

   `update` is allocation-free in steady state (plain arithmetic over
   pre-built slot records); scratch arrays are only touched when a load
   actually needs to start.
   ========================================================================== */

export type DistrictStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface StreamedAsset {
  entry: AssetManifestEntry
  /** The loaded resource (THREE.Texture, GLTF, …) — consumers narrow by kind. */
  resource: unknown
  /** Releases GPU + CPU memory for this asset. */
  dispose: () => void
}

export interface DistrictBundle {
  district: RealmId
  assets: StreamedAsset[]
}

/** Loads every manifest entry of one district bundle. */
export type BundleLoader = (
  district: RealmId,
  entries: AssetManifestEntry[],
) => Promise<StreamedAsset[]>

export interface DistrictSnapshot {
  status: DistrictStatus
  bundle: DistrictBundle | null
}

const IDLE_SNAPSHOT: DistrictSnapshot = { status: 'idle', bundle: null }

export interface StreamerOptions {
  districts: DistrictSpec[]
  tier: GraphicsTier
  loadBundle: BundleLoader
  loadRadius?: number
  prefetchRadius?: number
  disposeRadius?: number
  /** Bundles loading at once — 1 keeps streaming off the critical path. */
  maxConcurrentLoads?: number
  /** Entry source, injectable for tests. Defaults to the asset manifest. */
  entriesFor?: (district: RealmId, tier: GraphicsTier) => AssetManifestEntry[]
}

interface Slot {
  spec: DistrictSpec
  status: DistrictStatus
  bundle: DistrictBundle | null
  /** Streaming target from the last update pass. */
  wanted: boolean
  /** Squared distance scratch, refreshed each update. */
  d2: number
  /** Bumped on dispose; in-flight loads from older generations self-dispose. */
  generation: number
  snapshot: DistrictSnapshot
}

export class DistrictStreamerCore {
  private readonly slots: Slot[]
  private readonly byId = new Map<RealmId, Slot>()
  private readonly loadR2: number
  private readonly prefetchR2: number
  private readonly disposeR2: number
  private readonly maxLoads: number
  private readonly loadBundle: BundleLoader
  private readonly entriesFor: (district: RealmId, tier: GraphicsTier) => AssetManifestEntry[]
  private tier: GraphicsTier
  private activeLoads = 0
  private readonly listeners = new Set<() => void>()
  /** Scratch queue reused between update passes (cleared, never re-allocated). */
  private readonly pending: Slot[] = []

  constructor(options: StreamerOptions) {
    const loadRadius = options.loadRadius ?? DISTRICT_LOAD_RADIUS
    const prefetchRadius = options.prefetchRadius ?? DISTRICT_PREFETCH_RADIUS
    const disposeRadius = options.disposeRadius ?? DISTRICT_DISPOSE_RADIUS
    this.loadR2 = loadRadius * loadRadius
    this.prefetchR2 = prefetchRadius * prefetchRadius
    this.disposeR2 = disposeRadius * disposeRadius
    this.maxLoads = options.maxConcurrentLoads ?? 1
    this.loadBundle = options.loadBundle
    this.entriesFor = options.entriesFor ?? assetsForDistrict
    this.tier = options.tier
    this.slots = options.districts.map((spec) => ({
      spec,
      status: 'idle' as const,
      bundle: null,
      wanted: false,
      d2: Infinity,
      generation: 0,
      snapshot: IDLE_SNAPSHOT,
    }))
    for (const slot of this.slots) this.byId.set(slot.spec.id, slot)
  }

  /** Tier for entry filtering; affects bundles loaded after the change. */
  setTier(tier: GraphicsTier): void {
    this.tier = tier
  }

  /**
   * One streaming decision pass for the player at (x, z). Call on a coarse
   * interval (hundreds of ms), never per frame.
   */
  update(x: number, z: number): void {
    // 1. Distances + nearest district (pure arithmetic, no allocations).
    let nearest: Slot | null = null
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      const dx = slot.spec.x - x
      const dz = slot.spec.z - z
      slot.d2 = dx * dx + dz * dz
      if (nearest === null || slot.d2 < nearest.d2) nearest = slot
    }
    if (nearest === null) return
    const nearestIndex = nearest.spec.index

    // 2. Targets: required, radius-prefetch, or quest-adjacent prefetch.
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      const adjacent = Math.abs(slot.spec.index - nearestIndex) === 1
      slot.wanted = slot.d2 <= this.prefetchR2 || adjacent || slot === nearest
    }

    // 3. Dispose far bundles (only past the dispose ring — hysteresis).
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot.wanted && slot.d2 > this.disposeR2 && slot.status !== 'idle') {
        this.disposeSlot(slot)
      }
    }

    // 4. Start loads nearest-first. The concurrency cap throttles PREFETCH
    // loads only — a district the player is actually standing in (inside the
    // load ring) starts immediately, even while a neighbour prefetch is still
    // in flight, so spawning/teleporting never waits behind background work.
    this.pending.length = 0
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (slot.wanted && slot.status === 'idle') this.pending.push(slot)
    }
    if (this.pending.length === 0) return
    this.pending.sort((a, b) => a.d2 - b.d2)
    for (const slot of this.pending) {
      const required = slot.d2 <= this.loadR2
      if (!required && this.activeLoads >= this.maxLoads) continue
      this.startLoad(slot)
    }
    this.pending.length = 0
  }

  private startLoad(slot: Slot): void {
    const entries = this.entriesFor(slot.spec.id, this.tier)
    if (entries.length === 0) {
      slot.status = 'ready'
      slot.bundle = { district: slot.spec.id, assets: [] }
      this.publish(slot)
      return
    }
    slot.status = 'loading'
    this.publish(slot)
    const generation = slot.generation
    this.activeLoads++
    this.loadBundle(slot.spec.id, entries).then(
      (assets) => {
        this.activeLoads--
        if (slot.generation !== generation) {
          // Disposed while in flight — release immediately, stay idle.
          for (const asset of assets) asset.dispose()
          return
        }
        slot.bundle = { district: slot.spec.id, assets }
        slot.status = 'ready'
        this.publish(slot)
      },
      () => {
        this.activeLoads--
        if (slot.generation !== generation) return
        // Sticky until the player leaves the dispose ring (which resets to
        // idle), so a flaky network retries on the next approach.
        slot.status = 'error'
        this.publish(slot)
      },
    )
  }

  private disposeSlot(slot: Slot): void {
    slot.generation++
    if (slot.bundle) {
      for (const asset of slot.bundle.assets) asset.dispose()
    }
    slot.bundle = null
    if (slot.status !== 'idle') {
      slot.status = 'idle'
      this.publish(slot)
    }
  }

  /** Dispose every loaded bundle (page unmount). */
  disposeAll(): void {
    for (const slot of this.slots) this.disposeSlot(slot)
  }

  /* ----------------------------------------------------- external store -- */

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Cached per-district snapshot (stable identity between transitions). */
  getSnapshot(district: RealmId): DistrictSnapshot {
    return this.byId.get(district)?.snapshot ?? IDLE_SNAPSHOT
  }

  status(district: RealmId): DistrictStatus {
    return this.byId.get(district)?.status ?? 'idle'
  }

  private publish(slot: Slot): void {
    slot.snapshot =
      slot.status === 'idle' ? IDLE_SNAPSHOT : { status: slot.status, bundle: slot.bundle }
    for (const listener of this.listeners) listener()
  }
}
