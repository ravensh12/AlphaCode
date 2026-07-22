import type { RealmId } from '../../types/curriculum'
import { meetsTier, type GraphicsTier } from '../../lib/graphicsQuality'
import GENERATED from './assetSizes.generated.json'

/* ============================================================================
   CC0 asset manifest — Phase 1 of the Living Code City.

   Every binary asset under public/assets/ is declared here with provenance
   (license + source URL), byte size, the city districts that use it, and the
   minimum unified graphics tier that should bother downloading it. The
   district streamer builds its per-district bundles from these entries and
   tests enforce license presence, on-disk existence, and byte budgets.

   Byte sizes come from assetSizes.generated.json, written by
   `npm run assets:optimize` — re-run it after changing the raw set or the
   encoder settings. When the pipeline ran in --placeholders mode the JSON is
   flagged and every entry below reports `placeholder: true`, so real CC0
   sources can drop in without code changes.
   ========================================================================== */

export type AssetLicense = 'CC0-1.0' | 'MIT'

export type AssetKind = 'hdri' | 'texture' | 'model'

/** Where an asset ships from (see THIRD_PARTY_CONTENT.md for license text). */
export type AssetSource = 'PolyHaven' | 'ambientCG' | 'Kenney' | 'Quaternius' | 'AlphaCode'

/**
 * District tag: one of the six realm districts of Code City, or 'shared' for
 * city-wide assets (skies, roads) that belong to no single district.
 */
export type DistrictTag = RealmId | 'shared'

export interface AssetManifestEntry {
  /** Stable id, referenced by streaming bundles and tests. */
  id: string
  /** Site-root-relative path (no leading slash), e.g. 'assets/hdri/day.hdr'. */
  path: string
  kind: AssetKind
  /** Exact size on disk of the shipped (optimized) file. */
  bytes: number
  license: AssetLicense
  /** Canonical source page for provenance. */
  sourceUrl: string
  author: string
  source: AssetSource
  /** Districts whose streaming bundle includes this asset. */
  districts: DistrictTag[]
  /** Minimum unified graphics tier that loads this asset. */
  minTier: GraphicsTier
  /** True = generated stand-in awaiting the real source (offline pipeline). */
  placeholder?: boolean
  /** Optional plain-image fallback for KTX2-less contexts. */
  fallbackPath?: string
}

const SIZES: Record<string, number> = GENERATED.bytes
const IS_PLACEHOLDER = GENERATED.placeholders === true

const ALL_DISTRICTS: DistrictTag[] = [
  'realm1',
  'realm2',
  'realm3',
  'realm4',
  'realm5',
  'realm6',
]

function bytesFor(path: string): number {
  return SIZES[path] ?? 0
}

/** A PolyHaven PBR texture set: diffuse (sRGB) + normal (UASTC) + ARM. */
function polyhavenTextureSet(
  set: string,
  slug: string,
  author: string,
  districts: DistrictTag[],
  minTier: GraphicsTier,
): AssetManifestEntry[] {
  const sourceUrl = `https://polyhaven.com/a/${slug}`
  const maps: { suffix: 'diff' | 'nor' | 'arm' }[] = [
    { suffix: 'diff' },
    { suffix: 'nor' },
    { suffix: 'arm' },
  ]
  return maps.map(({ suffix }) => {
    const path = `assets/textures/${set}/${set}_${suffix}.ktx2`
    return {
      id: `tex-${set}-${suffix}`,
      path,
      kind: 'texture' as const,
      bytes: bytesFor(path),
      license: 'CC0-1.0' as const,
      sourceUrl,
      author,
      source: 'PolyHaven' as const,
      districts,
      minTier,
      placeholder: IS_PLACEHOLDER || undefined,
    }
  })
}

export const ASSET_MANIFEST: AssetManifestEntry[] = [
  /* ------------------------------------------------------- HDRI skies (2K) */
  {
    id: 'hdri-city-day',
    path: 'assets/hdri/city-day-2k.hdr',
    kind: 'hdri',
    bytes: bytesFor('assets/hdri/city-day-2k.hdr'),
    license: 'CC0-1.0',
    sourceUrl: 'https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky',
    author: 'Greg Zaal, Jarod Guest',
    source: 'PolyHaven',
    districts: ['shared'],
    minTier: 'medium',
    placeholder: IS_PLACEHOLDER || undefined,
  },
  // NOTE: the night HDRI (PolyHaven moonless_golf) was dropped from the ship
  // set (July 2026): the realism rebuild keeps the CPU corruption bake as the
  // night dome's only light (see SimulationSky.loadHdris), so the 6.4 MB file
  // was pure CDN weight that no code path ever fetched.

  /* ------------------------------------------- PBR texture sets (1K, KTX2) */
  // Roads + parks are city-wide; facade sets alternate across the districts.
  ...polyhavenTextureSet('asphalt', 'asphalt_02', 'Rob Tuytel', ALL_DISTRICTS, 'low'),
  ...polyhavenTextureSet('ground', 'park_dirt', 'Rob Tuytel', ALL_DISTRICTS, 'low'),
  ...polyhavenTextureSet(
    'concrete',
    'concrete_wall_004',
    'Rob Tuytel',
    ['realm2', 'realm3', 'realm5'],
    'low',
  ),
  ...polyhavenTextureSet(
    'brick',
    'red_brick_03',
    'Rob Tuytel',
    ['realm1', 'realm4', 'realm6'],
    'low',
  ),

  /* ------------------------------------------------------------ 3D models */
  {
    id: 'model-robot-sentinel',
    path: 'assets/models/robot-sentinel.glb',
    kind: 'model',
    bytes: bytesFor('assets/models/robot-sentinel.glb'),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/',
    author: 'Tomás Laulhé (Quaternius), CC0; conversion by Don McCurdy',
    source: 'Quaternius',
    districts: ['realm1'],
    minTier: 'low',
  },
  {
    // Phase 3 — VAT pedestrian crowd bundle: merged geometry + baked bone-
    // matrix clips derived from the CC0 Robot Expressive rig by
    // scripts/bake-citizen-anim.mjs. Loaded directly by CitizenCrowd (it is
    // city-wide ambient life, not a district bundle asset).
    id: 'model-citizen-bot',
    path: 'assets/models/citizen-bot.bin',
    kind: 'model',
    bytes: bytesFor('assets/models/citizen-bot.bin'),
    license: 'CC0-1.0',
    sourceUrl: 'https://quaternius.com/',
    author: 'Tomás Laulhé (Quaternius), CC0; conversion by Don McCurdy; VAT bake by AlphaCode',
    source: 'Quaternius',
    districts: ['shared'],
    minTier: 'medium',
  },
]

/** Total bytes of everything the manifest ships (budget-checked in tests). */
export const ASSET_MANIFEST_TOTAL_BYTES = ASSET_MANIFEST.reduce((sum, e) => sum + e.bytes, 0)

/** Budget for public/assets — Phase 3 adds the citizen crowd bundle (per the
 *  overhaul plan the hard ceiling is ~60 MB; we hold a much leaner line). */
export const ASSET_TOTAL_BUDGET_BYTES = 24 * 1024 * 1024

/** Per-district streamed budget (excludes 'shared' skies). */
export const DISTRICT_BUDGET_BYTES = 8 * 1024 * 1024

const BY_ID = new Map(ASSET_MANIFEST.map((e) => [e.id, e]))

export function assetById(id: string): AssetManifestEntry | undefined {
  return BY_ID.get(id)
}

/** Entries streamed for one district at a given tier (excludes 'shared'). */
export function assetsForDistrict(district: RealmId, tier: GraphicsTier): AssetManifestEntry[] {
  return ASSET_MANIFEST.filter(
    (e) => e.districts.includes(district) && meetsTier(tier, e.minTier),
  )
}

/** City-wide entries (skies etc.) at a given tier. */
export function sharedAssets(tier: GraphicsTier): AssetManifestEntry[] {
  return ASSET_MANIFEST.filter(
    (e) => e.districts.includes('shared') && meetsTier(tier, e.minTier),
  )
}
