import { DataUtils } from 'three'
import { assetById, type AssetManifestEntry } from '../../content/assets/assetManifest'
import type { GraphicsTier } from '../../lib/graphicsQuality'

/* ============================================================================
   Phase 2 — HDRI IBL calibration (pure, Node-testable).

   The overworld's image-based light comes from two PMREM'd sources per
   day/night slot: a tiny CPU-baked procedural equirect (instant, always
   available, the only source on LOW) and — on MEDIUM+ — a real 2K HDRI that
   hot-swaps in once decoded. The constants here keep the swap INVISIBLE in
   exposure terms: each HDRI's solid-angle-weighted mean luminance was
   measured offline against the CPU bake it replaces, and the gain rescales
   scene.environmentIntensity so total ambient energy stays on today's curve.

   Measured (scripts run against the shipped assets, three r180 conventions):
   - kloofendal day  mean 0.694  vs CPU day bake  0.358 → gain 0.52
   - moonless night  mean 0.167  vs CPU night bake 0.034 → gain 0.20
   - day HDRI sun azimuth 0.597 rad vs SUN_DIR azimuth 0.615 rad — aligned
     within ~1°, so no environmentRotation is needed for the sun glare to
     agree with the analytic sun/shadow direction (elevation 48° vs 42°).
   ========================================================================== */

export const SKY_HDRI_DAY_ID = 'hdri-city-day'
/** The night HDRI no longer ships (July 2026): the realism rebuild keeps the
 *  CPU corruption bake as the night light (see SimulationSky.loadHdris), so
 *  `skyHdriEntry('night')` now resolves to undefined by design and the 6.4 MB
 *  moonless_golf file was cut from public/assets to hold the shipping budget. */
export const SKY_HDRI_NIGHT_ID = 'hdri-city-night'

/** environmentIntensity gain applied while an HDRI map is live (CPU bake = 1).
 *  Night runs above its measured-parity value (0.2) on purpose — the realism
 *  rebuild lifts the night ambient floor so the city stays readable ("dark but
 *  readable", not a black pit); the extra energy reads as city glow bounce. */
export const SKY_HDRI_GAIN: Record<'day' | 'night', number> = {
  day: 0.52,
  night: 0.3,
}

/** Manifest entry for a sky slot; throws in tests if the manifest drifts. */
export function skyHdriEntry(slot: 'day' | 'night'): AssetManifestEntry | undefined {
  return assetById(slot === 'day' ? SKY_HDRI_DAY_ID : SKY_HDRI_NIGHT_ID)
}

/**
 * The one environmentIntensity curve (pre-Phase-2 semantics, verbatim):
 * full ambient by day, dimmed `nightDrop` at full corruption — multiplied by
 * the live map's calibration gain. LOW keeps the original 0.55 drop (pinned
 * look); MEDIUM+ profiles pass the shallower rebuild drop so night holds a
 * readable ambient floor.
 */
export function envIntensityFor(night: number, gain = 1, nightDrop = 0.55): number {
  return (1.0 - night * nightDrop) * gain
}

/** Realism-rebuild night ambient drop for HDRI-lit (MEDIUM+) profiles. */
export const NIGHT_DROP_CLEAR = 0.42

/** HDRI PMREM resolution policy: MEDIUM halves the equirect first (the PMREM
 *  render target shrinks ~4×; ambient light is low-frequency so nothing is
 *  visibly lost), HIGH/ULTRA feed the full 2K through. */
export function hdriMode(tier: GraphicsTier, enabled: boolean): 'off' | 'half' | 'full' {
  if (!enabled) return 'off'
  return tier === 'medium' ? 'half' : 'full'
}

/**
 * 2×2 box-filter one mip step down an equirect RGBA pixel block (pure,
 * tested). Accepts the RGBE loader's HalfFloatType (Uint16Array) or
 * FloatType (Float32Array) payloads; returns the same encoding.
 */
export function downsampleEquirect(
  data: Uint16Array | Float32Array,
  width: number,
  height: number,
): { data: Uint16Array | Float32Array; width: number; height: number } {
  const w = Math.max(1, width >> 1)
  const h = Math.max(1, height >> 1)
  const half = data instanceof Uint16Array
  const out = half ? new Uint16Array(w * h * 4) : new Float32Array(w * h * 4)
  const decode = half ? (v: number) => DataUtils.fromHalfFloat(v) : (v: number) => v
  const encode = half ? (v: number) => DataUtils.toHalfFloat(v) : (v: number) => v
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(2 * y, height - 1)
    const y1 = Math.min(2 * y + 1, height - 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(2 * x, width - 1)
      const x1 = Math.min(2 * x + 1, width - 1)
      const o = (y * w + x) * 4
      for (let c = 0; c < 4; c++) {
        const sum =
          decode(data[(y0 * width + x0) * 4 + c]) +
          decode(data[(y0 * width + x1) * 4 + c]) +
          decode(data[(y1 * width + x0) * 4 + c]) +
          decode(data[(y1 * width + x1) * 4 + c])
        out[o + c] = encode(sum * 0.25)
      }
    }
  }
  return { data: out, width: w, height: h }
}
