import type { PlacedCrystal } from '../../../lib/crystalPlacement'
import {
  crystalRenderProfile,
  type CrystalState,
} from '../../../lib/memoryCrystals'

/* ============================================================================
   MemoryCrystals — render-free core (the exhibits *Core.ts pattern).

   Maps a crystal's projected STATE onto the visual channels the instanced
   renderer consumes. Pure and Node-testable; the component never invents its
   own state → look rules, it just reads these.

   | state        | body look                                  |
   |--------------|--------------------------------------------|
   | growing      | dim violet, small, slow, no pulse          |
   | ripe         | bright amber, full size, pulsing           |
   | pendingCloud | ripe body + a floating cloud glyph         |
   | cleared      | faint lime, smallest, near-still           |
   ========================================================================== */

export interface CrystalChannels {
  /** Instance tint (hex) fed to InstancedMesh.setColorAt. */
  color: string
  /** Luminance boost multiplied into the tint (unlit material, toneMapped off). */
  boost: number
  /** Uniform base scale of the crystal body. */
  scale: number
  /** Vertical bob amplitude in metres. */
  bobAmplitude: number
  /** Extra scale-pulse amplitude — the "harvest me" heartbeat (0 = none). */
  pulseAmplitude: number
  /** Idle spin rate around Y (rad/s). */
  spinRate: number
  /** Billboarded cloud glyph floating above the body (pendingCloud only). */
  cloudGlyph: boolean
}

const CHANNELS: Record<CrystalState, CrystalChannels> = {
  growing: {
    color: '#8f7bdc',
    boost: 0.5,
    scale: 0.68,
    bobAmplitude: 0.05,
    pulseAmplitude: 0,
    spinRate: 0.3,
    cloudGlyph: false,
  },
  ripe: {
    color: '#ffb347',
    boost: 1.55,
    scale: 1,
    bobAmplitude: 0.09,
    pulseAmplitude: 0.12,
    spinRate: 0.9,
    cloudGlyph: false,
  },
  pendingCloud: {
    color: '#ffb347',
    boost: 1.55,
    scale: 1,
    bobAmplitude: 0.09,
    pulseAmplitude: 0.12,
    spinRate: 0.9,
    cloudGlyph: true,
  },
  cleared: {
    color: '#9bf6c3',
    boost: 0.38,
    scale: 0.58,
    bobAmplitude: 0.03,
    pulseAmplitude: 0,
    spinRate: 0.18,
    cloudGlyph: false,
  },
}

/** Visual channels for one crystal state. */
export function crystalChannels(state: CrystalState): CrystalChannels {
  return CHANNELS[state]
}

/** Clusters read bigger so the collapsed count is legible from the street. */
export const CRYSTAL_CLUSTER_SCALE = 1.45

/** Final body scale: state scale × cluster multiplier. */
export function crystalBodyScale(
  crystal: Pick<PlacedCrystal, 'kind' | 'state'>,
): number {
  const base = CHANNELS[crystal.state].scale
  return crystal.kind === 'cluster' ? base * CRYSTAL_CLUSTER_SCALE : base
}

/** Hover height of the crystal body's centre above the pavement. */
export const CRYSTAL_BODY_Y = 0.85
/** Cloud glyph floats this far above the body centre. */
export const CRYSTAL_GLYPH_RISE = 0.95
/** Cluster count labels float this far above the pavement. */
export const CRYSTAL_LABEL_Y = 2.05

/**
 * DOM-cost cap: floating count labels render ONLY for cluster crystals whose
 * body draws ripe (states 'ripe' | 'pendingCloud'). Growing/cleared clusters
 * are scenery — no Html for them, and never any Html for singles.
 */
export function crystalCountLabelVisible(
  crystal: Pick<PlacedCrystal, 'kind' | 'state' | 'count'>,
): boolean {
  return (
    crystal.kind === 'cluster' &&
    crystal.count > 0 &&
    crystalRenderProfile(crystal.state).body === 'ripe'
  )
}

/**
 * Deterministic per-crystal animation phase in [0, 2π) so a field of crystals
 * never bobs in lockstep. Same id → same phase, forever.
 */
export function crystalPhase(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 4096) * ((Math.PI * 2) / 4096)
}
