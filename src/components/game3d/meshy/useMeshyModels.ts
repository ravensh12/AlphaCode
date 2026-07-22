import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { releaseMeshyModel, retainMeshyModel, type MeshyModel } from './meshyModels'

/* ============================================================================
   useMeshyModels — non-suspending retain/release lifecycle for a fixed set
   of Meshy models. Returns null until EVERY id is decoded (callers keep
   rendering their primitive fallback), then a stable id→model map. A load
   failure keeps returning null forever — the primitive fallback simply
   stays, which is the intended degradation.
   ========================================================================== */

const NO_MODELS: readonly string[] = []

export function useMeshyModels(
  ids: readonly string[] | null,
): Record<string, MeshyModel> | null {
  const gl = useThree((state) => state.gl)
  const list = ids ?? NO_MODELS
  const key = list.join('|')
  const [models, setModels] = useState<Record<string, MeshyModel> | null>(null)

  useEffect(() => {
    setModels(null)
    if (key.length === 0) return
    const retained = key.split('|')
    let cancelled = false
    Promise.all(retained.map((id) => retainMeshyModel(id, gl))).then(
      (loaded) => {
        if (cancelled) return
        const map: Record<string, MeshyModel> = {}
        loaded.forEach((model, i) => {
          map[retained[i]] = model
        })
        setModels(map)
      },
      (error) => {
        // Primitive fallback stays — surface why (never an app error).
        console.warn(`[meshy] ${key} failed to stream:`, error)
      },
    )
    return () => {
      cancelled = true
      for (const id of retained) releaseMeshyModel(id)
    }
  }, [key, gl])

  return useMemo(() => (key.length === 0 ? null : models), [key, models])
}
