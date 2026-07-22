import type { RealmId } from '../../../types/curriculum'
import { BIOME_TINTS } from '../layout'

/* ============================================================================
   District geography — the six realm districts of Code City.

   Districts are centred on each realm's Academy plaza (the same points that
   drive the pavement biome tints in layout.ts), in realm order: index 0 is
   realm1, …, index 5 is realm6. The streamer prefetches along this order —
   quest-adjacent districts (index ± 1) are the ones a player is most likely
   to walk into next.
   ========================================================================== */

export interface DistrictSpec {
  id: RealmId
  /** 0-based quest order (== world index). */
  index: number
  /** District centre in world metres. */
  x: number
  z: number
}

export const DISTRICTS: DistrictSpec[] = BIOME_TINTS.map((biome, index) => ({
  id: `realm${index + 1}` as RealmId,
  index,
  x: biome.center.x,
  z: biome.center.z,
}))

/** Inside this range a district's bundle is required (biome tint radius+80). */
export const DISTRICT_LOAD_RADIUS = 260
/** Within this range (or quest-adjacent to the nearest district) → prefetch. */
export const DISTRICT_PREFETCH_RADIUS = 520
/** Beyond this range a loaded bundle is disposed (hysteresis vs prefetch). */
export const DISTRICT_DISPOSE_RADIUS = 700
