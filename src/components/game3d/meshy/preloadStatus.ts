/* ============================================================================
   Meshy preload status — a tiny dependency-free store bridging the lazy
   MeshyCityLayer chunk (which decodes the full model inventory at boot) and
   the overworld's boot veil (main chunk), so the loader can hold until the
   whole city is GPU-resident and show live progress. Deliberately import-free
   to keep the overworld page chunk manifest-free.
   ========================================================================== */

export interface MeshyPreloadStatus {
  /** True once the preloader mounted and published its inventory size. */
  started: boolean
  total: number
  loaded: number
}

let status: MeshyPreloadStatus = { started: false, total: 0, loaded: 0 }
const listeners = new Set<() => void>()

export function publishMeshyPreload(total: number, loaded: number): void {
  if (status.started && status.total === total && status.loaded === loaded) return
  status = { started: total > 0, total, loaded }
  for (const listener of listeners) listener()
}

export function getMeshyPreload(): MeshyPreloadStatus {
  return status
}

export function subscribeMeshyPreload(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
