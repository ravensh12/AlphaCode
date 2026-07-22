import { memo, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { MeshyModel } from './meshyModels'

/* ============================================================================
   MeshyBatch — ALL placements of one Meshy prop as ONE InstancedMesh draw.

   Matrices are written once per items change (static dressing; nothing runs
   per frame), and computeBoundingSphere() unions the instance transforms so
   whole batches frustum-cull as a unit — a district cell's batch drops out
   of the draw list the moment the camera turns away. Geometry/material are
   owned by the meshyModels cache (retain/release), never by this component.

   Shadows follow the city convention: street props default to NOT casting —
   the player-following shadow frustum would re-render every batch each
   frame for a barely-visible payoff (see Instanced in Primitives3D).
   ========================================================================== */

export interface MeshyInstance {
  x: number
  z: number
  /** Yaw radians. */
  yaw: number
  /** Uniform scale multiplier over the model's normalized size. */
  scale: number
  y?: number
}

export const MeshyBatch = memo(function MeshyBatch({
  model,
  items,
  castShadow = false,
  frustumCulled = true,
}: {
  model: MeshyModel
  items: readonly MeshyInstance[]
  castShadow?: boolean
  frustumCulled?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  // Frame-pacing: the mesh is allocated with slack CAPACITY and re-used as
  // the live rings move — only `count` and the matrices change. The old
  // `key` per items.length remounted the InstancedMesh (fresh GPU buffer +
  // full three object teardown) on EVERY ring crossing, which stacked up
  // into visible hitches while sprinting. Capacity only ever grows.
  const capacityRef = useRef(0)
  if (items.length > capacityRef.current) {
    capacityRef.current = Math.max(16, Math.ceil(items.length * 1.5))
  }
  const capacity = capacityRef.current

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const d = new THREE.Object3D()
    items.forEach((it, i) => {
      d.position.set(it.x, it.y ?? 0, it.z)
      d.rotation.set(0, it.yaw, 0)
      d.scale.setScalar(it.scale)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    })
    mesh.count = items.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items, model, capacity])

  if (items.length === 0) return null
  return (
    <instancedMesh
      key={`${model.id}:${capacity}`}
      ref={ref}
      args={[model.geometry, model.material, capacity]}
      castShadow={castShadow}
      receiveShadow={false}
      frustumCulled={frustumCulled}
    />
  )
})
