import * as THREE from 'three'

/* ============================================================================
   THE hero gun-seat calibration — ONE source of truth.

   MeshyHero seats the blaster with these constants (owner gun-fit pass 2,
   gameplay-approved); cinematics import the same values instead of keeping
   their own stale offsets. This lives in its own dependency-free module so
   IntroCinematic can share it WITHOUT statically importing MeshyHero.tsx
   (whose module scope preloads the Meshy GLBs — that import would break the
   lazy split that keeps LOW tier from ever fetching /assets/meshy/).
   ========================================================================== */

/** Holder offset above the wrist line, in hand-local centimeters. */
export const GUN_SEAT_UP_CM = 1.5
/** Holder offset forward into the fingers' curl, in hand-local centimeters. */
export const GUN_SEAT_FORWARD_CM = 8
/** Render scale of the blaster visual inside the calibrated holder. */
export const GUN_VISUAL_SCALE = 0.88
/** Scene-graph name of the seated gun group (find it to track the barrel). */
export const HERO_GUN_NODE = 'hero-gun'
/** Muzzle tip in the gun group's local space (the muzzle-flash origin; the
 *  group's own visual scale applies through its world matrix). */
export const HERO_GUN_MUZZLE_LOCAL = new THREE.Vector3(0, 0.02, 0.5)
