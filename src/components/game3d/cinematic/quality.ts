import { createContext, useContext } from 'react'

/**
 * The three render tiers the cinematic engine scales between. 'high' is the
 * full premium look; 'low' is the lean, effect-stripped fallback that keeps
 * the frame rate up on weak GPUs.
 */
export type QualityTier = 'high' | 'med' | 'low'

/**
 * Internal context. Defaults to 'high' so any consumer rendered outside a
 * <CinematicStage> still gets a sensible (full-quality) value rather than
 * crashing — useful for one-off scenes or tests.
 */
const QualityContext = createContext<QualityTier>('high')

/**
 * Provider for the current quality tier. <CinematicStage> drives this from its
 * PerformanceMonitor; scenes and VFX read it through {@link useQuality} so they
 * inherit the auto quality scaling for free.
 */
export const CinematicQualityProvider = QualityContext.Provider

/** Read the current quality tier. Safe to call anywhere inside the R3F tree. */
export function useQuality(): QualityTier {
  return useContext(QualityContext)
}

/**
 * Sensible device-pixel-ratio clamps per tier. Returned as an R3F-compatible
 * [min, max] range so it can be fed straight into `setDpr()` or the Canvas
 * `dpr` prop.
 */
export function qualityDpr(t: QualityTier): [number, number] {
  // Capped low to keep fill cost down on Retina/HiDPI panels — fill rate, not
  // resolution, is the usual bottleneck once the post stack is running.
  switch (t) {
    case 'high':
      return [1, 1.5]
    case 'med':
      return [1, 1.25]
    case 'low':
      return [0.75, 1]
  }
}
