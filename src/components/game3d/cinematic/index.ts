/* ============================================================================
   Cinematic render engine — public API.

   Import everything from here:
     import {
       CinematicStage, useQuality, qualityDpr,
       armorMaterial, glassMaterial, moltenCore, wetFloorProps,
       EmberField, SparkBurst, ShockwaveRing, WeaponTrail, GroundDecal,
       makeSpring, makeSpring3, CameraDirector,
     } from '../cinematic'
   ========================================================================== */

export { CinematicQualityProvider, useQuality, qualityDpr, type QualityTier } from './quality'

export { CinematicStage, type CinematicStageProps } from './CinematicStage'

export {
  armorMaterial,
  chromeMaterial,
  glassMaterial,
  moltenCore,
  wetFloorProps,
  glossyFloorProps,
  type WetFloorParams,
} from './materials'

export {
  EmberField,
  SparkBurst,
  ShockwaveRing,
  WeaponTrail,
  GroundDecal,
  type EmberFieldProps,
  type SparkBurstProps,
  type SparkBurstHandle,
  type ShockwaveRingProps,
  type ShockwaveRingHandle,
  type WeaponTrailProps,
  type WeaponTrailHandle,
  type GroundDecalProps,
  type GroundDecalHandle,
} from './vfx'

export { makeSpring, makeSpring3, CameraDirector, type Spring, type Spring3 } from './useSpringRig'
