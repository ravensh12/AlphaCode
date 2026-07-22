import type { QualityTier } from '../components/game3d/cinematic/quality'

/* ============================================================================
   Unified graphics quality system — SMOOTH-FIRST EDITION.

   PRODUCT DECISION (July 2026): every player still *targets* ULTRA, but the
   ULTRA baseline is tuned for sustained 50+ fps on a typical laptop GPU, and
   a device-aware boot notch + the invisible FPS governor (graphicsGovernor.ts)
   walk weaker machines down before they grind or lose the WebGL context
   (which blacks out the city while the HUD survives — "buildings don't
   render"). There is no user-facing tier UI.

   The old LOW/MEDIUM/HIGH profiles remain as INTERNAL governor notches.
   Everything in here is pure and synchronous so it can be unit-tested in
   Node; browser reads are isolated in `readDeviceCaps` and fully guarded.
   ========================================================================== */

export const GRAPHICS_TIERS = ['low', 'medium', 'high', 'ultra'] as const
export type GraphicsTier = (typeof GRAPHICS_TIERS)[number]

/** Rank for comparisons and manifest `minTier` gating (low=0 .. ultra=3). */
export function tierRank(tier: GraphicsTier): number {
  return GRAPHICS_TIERS.indexOf(tier)
}

/** True when `tier` satisfies a manifest entry's minimum tier requirement. */
export function meetsTier(tier: GraphicsTier, minTier: GraphicsTier): boolean {
  return tierRank(tier) >= tierRank(minTier)
}

/* ------------------------------------------------------------- Device caps */

export interface DeviceCaps {
  /** WebGL2 available (used by capability warnings). */
  webgl2: boolean
  /** window.devicePixelRatio. */
  devicePixelRatio: number
  /** navigator.deviceMemory in GB when exposed; 0 if unknown. */
  deviceMemoryGb: number
  /** navigator.hardwareConcurrency when exposed; 0 if unknown. */
  hardwareConcurrency: number
  /** Coarse mobile / tablet UA hint (fill-rate constrained GPUs). */
  mobileLike: boolean
}

/** Gather live capabilities. Safe to call anywhere (SSR/tests get defaults). */
export function readDeviceCaps(gl?: WebGLRenderingContext | WebGL2RenderingContext): DeviceCaps {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      webgl2: false,
      devicePixelRatio: 1,
      deviceMemoryGb: 0,
      hardwareConcurrency: 0,
      mobileLike: false,
    }
  }
  let webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
  if (!gl) {
    try {
      const canvas = document.createElement('canvas')
      const probe = canvas.getContext('webgl2')
      if (probe) {
        webgl2 = true
        probe.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch {
      /* detection only */
    }
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const ua = navigator.userAgent || ''
  return {
    webgl2,
    devicePixelRatio: window.devicePixelRatio || 1,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 0,
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    mobileLike: /Mobi|Android|iPhone|iPad|iPod/i.test(ua),
  }
}

/* ---------------------------------------------------------------- Profile */

/**
 * Phase 3 — building facade pipeline:
 * - 'legacy':   the pre-Phase-3 96×192 procedural facade (today's LOW look).
 * - 'atlas':    8-style meter-space facade atlas, flat emissive windows.
 * - 'interior': atlas + parallax interior-mapped windows (flagship night).
 */
export type FacadeMode = 'legacy' | 'atlas' | 'interior'

/** Phase 3 — ambient city-life instance budgets (0 = system not mounted). */
export interface CityLifeBudget {
  /** Hover-traffic pods cruising the avenues. */
  traffic: number
  /** VAT robot pedestrians on the sidewalks (despawn at night). */
  citizens: number
  /** Gulls orbiting the district landmarks (day only). */
  birds: number
  /** Rooftop AC / manhole steam wisps. */
  steam: number
  /** Wind-blown leaves around park trees. */
  leaves: number
}

export interface QualityProfile {
  /** The internal notch tier this profile was built for. */
  tier: GraphicsTier
  /** Overworld adaptive-resolution window. */
  dpr: {
    /** First-frame dpr (already clamped to the device's real ratio). */
    start: number
    /** PerformanceMonitor step-down floor. */
    min: number
    /** PerformanceMonitor step-up ceiling. */
    max: number
  }
  /** Ceiling for the overworld's dpr-derived sim tier (holo/sky/post budget). */
  simTierCap: QualityTier
  /** CinematicStage tier machine bounds. */
  cinematic: {
    initial: QualityTier
    max: QualityTier
  }
  /* ---- Phase 2 (HDRI lighting / cascaded shadows / post v2 / weather) ---- */
  /** Overworld sun-shadow cascade count (concentric follow boxes, 1–3). */
  shadowCascades: 1 | 2 | 3
  /**
   * Live shadow-map resolution multiplier. This is the governor's ONE lever on
   * the heaviest always-on GPU cost (the sun's depth passes + PCF taps) that
   * does NOT recompile any shader: the cascade light count is unchanged, only
   * the shadow render-target is resized. 1 = authored resolution.
   */
  shadowMapScale: number
  /** Tallest city buildings join the shadow casters (one extra depth draw). */
  buildingShadowCasters: boolean
  /** Real 2K HDRI environment maps replace the CPU-baked sky IBL. */
  hdriEnvironment: boolean
  /** Rain streak instance budget for the weather system (0 = visuals off). */
  rainParticles: number
  /** ULTRA post extras: dawn/dusk light-shaft pass + tone-mapping tweak. */
  godRays: boolean
  /* ---- Phase 3 (facade re-skin / street decals / city life) -------------- */
  /** Building facade pipeline (see FacadeMode). */
  facadeMode: FacadeMode
  /** Street decal layer: manholes, road paint, cracks, rain puddles. */
  streetDecals: boolean
  /** Facade atlas resolution: full 512px tiles vs half for MEDIUM. */
  facadeAtlasFull: boolean
  /** Ambient life instance budgets. */
  cityLife: CityLifeBudget
  /**
   * Proximity-cull bubble radius (meters) around the player: instanced city
   * sets, quest structures and landmarks outside it neither render nor spend
   * per-frame CPU. The overworld fog far-plane is capped to this distance so
   * the cull boundary reads as atmosphere. Higher notch = wider bubble.
   */
  cullRadius: number
}

const NO_CITY_LIFE: CityLifeBudget = { traffic: 0, citizens: 0, birds: 0, steam: 0, leaves: 0 }

const SIM_TIER_ORDER: QualityTier[] = ['low', 'med', 'high']

/** Clamp a cinematic tier to a ceiling ('low' < 'med' < 'high'). */
export function clampSimTier(tier: QualityTier, max: QualityTier): QualityTier {
  return SIM_TIER_ORDER.indexOf(tier) <= SIM_TIER_ORDER.indexOf(max) ? tier : max
}

/**
 * Overworld sim tier for the current adaptive dpr, clamped by the profile.
 * The dpr thresholds are the pre-Phase-1 derivation, kept verbatim so a HIGH
 * profile reproduces the old behavior exactly; the cap is what LOW/MEDIUM
 * profiles use to hold the floor.
 */
export function simTierForDpr(dpr: number, profile: QualityProfile): QualityTier {
  const derived: QualityTier = dpr >= 1.15 ? 'high' : dpr >= 0.95 ? 'med' : 'low'
  return clampSimTier(derived, profile.simTierCap)
}

/**
 * Build the typed profile for an INTERNAL notch tier. `deviceDpr` is the
 * device's real pixel ratio — start values never exceed it (no point
 * supersampling a 1x panel).
 *
 * Only ULTRA is user-visible; the lower ladders exist as the invisible FPS
 * governor's step-down notches (graphicsGovernor.ts). LOW is the deepest
 * safety floor a struggling device can be walked down to.
 */
export function profileForTier(tier: GraphicsTier, deviceDpr: number): QualityProfile {
  const device = Math.max(0.5, deviceDpr || 1)
  switch (tier) {
    case 'ultra':
      return {
        tier,
        // Boot at native-ish (never supersampled). The heavy HIGH post stack
        // (CA + SMAA + grain) only mounts when simTier climbs past 1.15 dpr —
        // starting at 1.0 keeps the first frames on bloom+vignette only, and
        // the PerformanceMonitor climbs once there is real headroom.
        dpr: { start: Math.min(1.0, device), min: 0.75, max: 1.15 },
        simTierCap: 'high',
        cinematic: { initial: 'med', max: 'high' },
        // ONE shadow cascade: a second mid-box (±110m) was a full extra depth
        // pass every frame for shadows the fog already softens. Near ±34m
        // stays crisp under the player.
        shadowCascades: 1,
        shadowMapScale: 1,
        // Tall-tower shadow casters were a third ~900-instance depth draw for
        // a silhouette the fog mostly hides — off by default.
        buildingShadowCasters: false,
        hdriEnvironment: true,
        rainParticles: 3000,
        godRays: false,
        // Atlas facades (not interior parallax): the per-pixel room ray-march
        // was the #1 fragment cost on the skyline and a common trigger for
        // WebGL context loss on integrated / retina GPUs. Atlas still reads
        // as a real city; night windows stay lit via the emissive schedule.
        facadeMode: 'atlas',
        streetDecals: true,
        facadeAtlasFull: true,
        // Skinned citizens are drawn in the camera pass AND every shadow
        // cascade — keep the street alive without crowding the GPU.
        cityLife: { traffic: 28, citizens: 14, birds: 10, steam: 36, leaves: 48 },
        cullRadius: 300,
      }
    case 'high':
      return {
        tier,
        dpr: { start: Math.min(0.95, device), min: 0.75, max: 1.1 },
        simTierCap: 'high',
        cinematic: { initial: 'low', max: 'high' },
        shadowCascades: 1,
        shadowMapScale: 1,
        buildingShadowCasters: false,
        hdriEnvironment: true,
        rainParticles: 2000,
        godRays: false,
        facadeMode: 'atlas',
        streetDecals: true,
        facadeAtlasFull: true,
        cityLife: { traffic: 20, citizens: 10, birds: 8, steam: 28, leaves: 0 },
        cullRadius: 250,
      }
    case 'medium':
      return {
        tier,
        dpr: { start: Math.min(0.9, device), min: 0.7, max: 1.0 },
        simTierCap: 'med',
        cinematic: { initial: 'low', max: 'med' },
        shadowCascades: 1,
        shadowMapScale: 0.85,
        buildingShadowCasters: false,
        hdriEnvironment: true,
        rainParticles: 1200,
        godRays: false,
        facadeMode: 'atlas',
        streetDecals: true,
        facadeAtlasFull: false,
        cityLife: { traffic: 14, citizens: 8, birds: 0, steam: 20, leaves: 0 },
        cullRadius: 200,
      }
    case 'low':
      // The governor's deepest safety floor: single small shadow map,
      // CPU-baked IBL, no weather visuals, no extra post, legacy facades,
      // no city life.
      return {
        tier,
        dpr: { start: Math.min(0.8, device), min: 0.65, max: 0.9 },
        simTierCap: 'low',
        cinematic: { initial: 'low', max: 'low' },
        shadowCascades: 1,
        shadowMapScale: 0.7,
        buildingShadowCasters: false,
        hdriEnvironment: false,
        rainParticles: 0,
        godRays: false,
        facadeMode: 'legacy',
        streetDecals: false,
        facadeAtlasFull: false,
        cityLife: NO_CITY_LIFE,
        cullRadius: 150,
      }
  }
}

/**
 * THE one entry point for non-overworld callers: ULTRA profile shape.
 *
 * The overworld boots via `resolveBootNotch()` + `governedProfile()` so weak
 * devices never grind through a full ULTRA first frame.
 */
export function resolveQualityProfile(caps?: Partial<DeviceCaps>): QualityProfile {
  return profileForTier('ultra', (caps?.devicePixelRatio ?? readDeviceCaps().devicePixelRatio))
}
