import type { QualityProfile } from '../../../lib/graphicsQuality'
import type { CityInteractable } from './interactables'

/* ============================================================================
   CityWorldObjects — render-free core.

   Two pure pieces the composition component (and its tests) share:

   - resolveCityQuality: collapse either a full QualityProfile or a minimal
     boolean bundle into the three switches the city objects actually gate on.
   - buildCityRenderPlan: project the interactable registry output onto typed
     render descriptors, one entry per world object this layer owns. Dojo and
     boss doors stay with the existing checkpoint renderer, and crystals render
     from the full placement list (the registry only carries harvestable ones),
     so both are deliberately absent here.
   ========================================================================== */

/** The minimal tier-gating switches the city world objects consume. */
export interface CityObjectsQuality {
  /** Floating DOM labels (crystal cluster counts). */
  labels: boolean
  /** Particle flourishes: pickup sparkles, delivery bursts, hoverboard trail. */
  particles: boolean
  /** Load the GLTF citizen rig; false = primitive fallback bot. */
  gltfNpc: boolean
}

/** Everything on — the default when no quality prop is provided. */
export const CITY_QUALITY_FULL: CityObjectsQuality = {
  labels: true,
  particles: true,
  gltfNpc: true,
}

function isQualityProfile(
  quality: QualityProfile | CityObjectsQuality,
): quality is QualityProfile {
  return 'tier' in quality
}

/**
 * Collapse a unified QualityProfile (or an explicit boolean bundle) into the
 * city-object switches. LOW keeps the pre-city cost floor: no DOM labels, no
 * particle pools, primitive NPC. MEDIUM takes labels + the rig but skips the
 * particle pools; HIGH/ULTRA take everything.
 */
export function resolveCityQuality(
  quality?: QualityProfile | CityObjectsQuality,
): CityObjectsQuality {
  if (!quality) return CITY_QUALITY_FULL
  if (!isQualityProfile(quality)) return quality
  switch (quality.tier) {
    case 'low':
      return { labels: false, particles: false, gltfNpc: false }
    case 'medium':
      return { labels: true, particles: false, gltfNpc: true }
    case 'high':
    case 'ultra':
      return CITY_QUALITY_FULL
  }
}

/**
 * Meshy model upgrade rung for the interactables, kept SEPARATE from
 * {@link CityObjectsQuality} so the established three-switch contract (and
 * its tests) stays byte-stable:
 * - 'none'   — LOW profiles and explicit boolean bundles (no tier info):
 *              primitives everywhere, zero Meshy fetches.
 * - 'medium' — Meshy prop shells (arcade/hoverbike/courier/photo).
 * - 'high'   — shells + the Meshy-rigged citizen replacing robot-sentinel.
 * Omitted quality means "everything on" (same rule as resolveCityQuality).
 */
export type MeshyUpgradeTier = 'none' | 'medium' | 'high'

export function meshyUpgradeTier(
  quality?: QualityProfile | CityObjectsQuality,
): MeshyUpgradeTier {
  if (!quality) return 'high'
  if (!isQualityProfile(quality)) return 'none'
  switch (quality.tier) {
    case 'low':
      return 'none'
    case 'medium':
      return 'medium'
    case 'high':
    case 'ultra':
      return 'high'
  }
}

/* ------------------------------------------------------------- render plan */

export interface NpcPlanEntry {
  key: string
  x: number
  z: number
  districtIndex: number
  npcName: string
}

export interface PhotoPlanEntry {
  key: string
  x: number
  z: number
  spotIndex: number
}

export interface CityRenderPlan {
  /** One rescued-citizen NPC per unlocked district. */
  npcs: NpcPlanEntry[]
  /** The plaza arcade cabinet (absent for guests). */
  arcade: { x: number; z: number; empty: boolean } | null
  /** The courier pickup depot (absent for guests). */
  courier: { x: number; z: number } | null
  /** The hoverboard pad; locked until the first delivery. */
  vehicle: { x: number; z: number; locked: boolean } | null
  /** Authored photo spots framing the district landmarks. */
  photos: PhotoPlanEntry[]
  /**
   * True when the registry carries any city-life site (equivalently: the
   * visitor is signed in). Gates the ambient extras that are not themselves
   * interactables — bit collectibles chiefly.
   */
  cityLifePresent: boolean
}

/**
 * Project the registry output onto render descriptors. Deterministic and
 * total: unknown/irrelevant kinds (dojo, boss, memoryCrystal, legacy lesson)
 * are skipped, everything else maps 1:1 onto a plan entry.
 */
export function buildCityRenderPlan(
  interactables: readonly CityInteractable[],
): CityRenderPlan {
  const plan: CityRenderPlan = {
    npcs: [],
    arcade: null,
    courier: null,
    vehicle: null,
    photos: [],
    cityLifePresent: false,
  }
  for (const { target, payload } of interactables) {
    switch (payload.kind) {
      case 'npc':
        plan.npcs.push({
          key: target.key,
          x: target.x,
          z: target.z,
          districtIndex: payload.districtIndex,
          npcName: payload.npcName,
        })
        break
      case 'arcade':
        plan.arcade = { x: target.x, z: target.z, empty: payload.empty }
        break
      case 'courier':
        plan.courier = { x: target.x, z: target.z }
        break
      case 'vehicle':
        plan.vehicle = { x: target.x, z: target.z, locked: target.locked }
        break
      case 'photo':
        plan.photos.push({
          key: target.key,
          x: target.x,
          z: target.z,
          spotIndex: payload.spotIndex,
        })
        break
      default:
        break
    }
  }
  plan.cityLifePresent =
    plan.arcade !== null || plan.courier !== null || plan.vehicle !== null
  return plan
}
