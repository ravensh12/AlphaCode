import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { RealmId } from '../../../types/curriculum'
import { CHECKPOINTS_3D } from '../layout'
import { DISTRICT_THEMES } from '../districtTheme'
import { applyWetResponse } from '../simulation'
import { useDistrictAssets } from '../streaming/useDistrictAssets'
import type { StreamedAsset } from '../streaming/streamerCore'

/* ============================================================================
   Phase 3 — DISTRICT PLAZA APRONS. The first on-screen consumer of the
   per-district streamed texture bundles: each Academy plaza gets a paved
   apron ring in its district's real PBR set (red brick for realms 1/4/6,
   concrete for 2/3/5 — exactly the manifest's district tagging), plus a thin
   accent trim ring in the realm color.

   The apron only mounts once its district bundle streams in (and unmounts
   when the streamer disposes it), so this also makes the streaming system's
   work visible: walk into a district and its plaza materializes in high
   fidelity. ≤2 draws per resident district.
   ========================================================================== */

const APRON_INNER = 24.5
const APRON_OUTER = 36

function findTexture(assets: StreamedAsset[], suffix: string): THREE.Texture | null {
  for (const a of assets) {
    if (a.entry.id.endsWith(suffix) && a.entry.kind === 'texture') {
      return a.resource as THREE.Texture
    }
  }
  return null
}

function DistrictApron({ district, index }: { district: RealmId; index: number }) {
  const { status, bundle } = useDistrictAssets(district)
  const theme = DISTRICT_THEMES[index]
  const center = CHECKPOINTS_3D[index].flag

  const maps = useMemo(() => {
    if (status !== 'ready' || !bundle) return null
    // Prefer the district's brick set; fall back to concrete (manifest tags
    // exactly one of the two per district).
    const diff = findTexture(bundle.assets, 'brick-diff') ?? findTexture(bundle.assets, 'concrete-diff')
    const nor = findTexture(bundle.assets, 'brick-nor') ?? findTexture(bundle.assets, 'concrete-nor')
    const arm = findTexture(bundle.assets, 'brick-arm') ?? findTexture(bundle.assets, 'concrete-arm')
    if (!diff) return null
    for (const tex of [diff, nor, arm]) {
      if (!tex) continue
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.anisotropy = 4
    }
    return { diff, nor, arm }
  }, [status, bundle])

  const mat = useMemo(() => {
    if (!maps) return null
    const m = new THREE.MeshStandardMaterial({
      map: maps.diff,
      normalMap: maps.nor ?? undefined,
      roughnessMap: maps.arm ?? undefined,
      roughness: 1,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    // Tile the paving ~1.5m per repeat across the ring's UV ring-space.
    maps.diff.repeat.set(10, 3)
    maps.nor?.repeat.set(10, 3)
    maps.arm?.repeat.set(10, 3)
    return applyWetResponse(m)
  }, [maps])

  // Dispose ONLY the material — the textures belong to the streamer bundle.
  useEffect(() => () => mat?.dispose(), [mat])

  if (!mat) return null
  return (
    <group position={[center.x, 0, center.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]} material={mat} receiveShadow>
        <ringGeometry args={[APRON_INNER, APRON_OUTER, 48]} />
      </mesh>
      {/* Accent trim ring in the realm color — subtle by day, reads at dusk. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[APRON_INNER, APRON_INNER + 0.6, 48]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  )
}

const REALMS: RealmId[] = ['realm1', 'realm2', 'realm3', 'realm4', 'realm5', 'realm6']

/** Mount once in the overworld; aprons appear as their bundles stream in. */
export const DistrictAprons = memo(function DistrictAprons() {
  return (
    <>
      {REALMS.map((realm, i) => (
        <DistrictApron key={realm} district={realm} index={i} />
      ))}
    </>
  )
})
