import { memo, useMemo } from 'react'
import {
  ARENA_DRESSING_MODELS,
  buildArenaDressingPlacements,
  buildArenaKitPlacements,
} from './meshyPropsCore'
import { useMeshyModels } from './useMeshyModels'
import { MeshyBatch } from './MeshyBatch'

/* ============================================================================
   MeshyArenaDressing — boss-arena set dressing (MEDIUM+; the arena
   components gate the mount). The base trio (corrupted obelisks between the
   framing pillars, energy pylons on thirds, shattered firewall panels as
   breach cover) sits between the play boundary and the wall, so combat,
   movement clamps, and camera framing are untouched.

   `kit` (the Vex fight remake) adds the full phase-3 nine-piece composition:
   the walkable floor emblem centrepiece, Vex's core-throne backdrop upstage,
   a tilted holo-ring hovering over the fight, conduit/holo pillars
   interleaving the obelisk diagonals, debris barricades as visual cover in
   the out-of-bounds ring, and glitch warning panels on the wall. All baked
   emissive — the arena's bloom carries the glow, no lights added.
   ========================================================================== */

const KIT_MODELS = [
  ...ARENA_DRESSING_MODELS,
  'arena-floor-emblem',
  'arena-core-throne',
  'arena-holo-ring',
  'arena-pillar-conduit',
  'arena-pillar-holo',
  'arena-debris-barricade',
  'arena-holo-warning',
]

export default memo(function MeshyArenaDressing({
  arenaRadius,
  kit = false,
}: {
  /** The arena's ARENA_R (playfield radius; wall sits ~2.6m outside it). */
  arenaRadius: number
  /** Full nine-piece boss-kit composition (the Vex fight). */
  kit?: boolean
}) {
  const models = useMeshyModels(kit ? KIT_MODELS : ARENA_DRESSING_MODELS)
  const placements = useMemo(
    () => buildArenaDressingPlacements(arenaRadius),
    [arenaRadius],
  )
  const kitPlacements = useMemo(
    () => (kit ? buildArenaKitPlacements(arenaRadius) : null),
    [kit, arenaRadius],
  )

  if (!models) return null
  return (
    <group>
      <MeshyBatch model={models['arena-corrupted-obelisk']} items={placements.obelisks} />
      <MeshyBatch model={models['arena-energy-pylon']} items={placements.pylons} />
      <MeshyBatch model={models['arena-firewall-panel']} items={placements.firewalls} />
      {kitPlacements && (
        <>
          <MeshyBatch model={models['arena-floor-emblem']} items={kitPlacements.emblem} />
          <MeshyBatch model={models['arena-core-throne']} items={kitPlacements.throne} />
          <MeshyBatch model={models['arena-pillar-conduit']} items={kitPlacements.pillarConduit} />
          <MeshyBatch model={models['arena-pillar-holo']} items={kitPlacements.pillarHolo} />
          <MeshyBatch model={models['arena-debris-barricade']} items={kitPlacements.barricades} />
          <MeshyBatch model={models['arena-holo-warning']} items={kitPlacements.warnings} />
          {/* The holo-ring hovers TILTED over the fight — MeshyBatch is
              yaw-only, so it renders as a plain mesh. Upstage lean keeps the
              ring out of the fight camera's near frustum. */}
          <mesh
            geometry={models['arena-holo-ring'].geometry}
            material={models['arena-holo-ring'].material}
            position={[0, 11.5, -4]}
            rotation={[0.42, 0, 0.1]}
            scale={2.4}
          />
        </>
      )}
    </group>
  )
})
