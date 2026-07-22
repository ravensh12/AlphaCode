import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphicsTier } from '../../../lib/graphicsQuality'
import type { AssetManifestEntry } from '../../../content/assets/assetManifest'
import { configureAssetLoaders } from '../decoderConfig'
import { DISTRICTS } from './districts'
import {
  DistrictStreamerCore,
  type BundleLoader,
  type StreamedAsset,
} from './streamerCore'

/* ============================================================================
   DistrictStreamer — mounts inside the overworld <Canvas> and keeps the six
   realm districts' asset bundles streamed in around the player.

   All decisions live in DistrictStreamerCore (pure, tested); this component
   only wires the runtime pieces together:
   - player position from the shared ref, sampled on a coarse interval
     (allocation-free; nothing runs per frame),
   - the real bundle loader (KTX2 textures / RGBE skies / meshopt GLBs via
     the shared decoder config in assetLoaders.ts) — dynamically imported on
     the first actual bundle load, so the loader stack (KTX2/zstd, RGBE,
     standalone GLTFLoader) never weighs down the overworld page chunk,
   - GPU disposal when the player leaves a district far behind.

   Scene components consume the streamed bundles through useDistrictAssets().
   ========================================================================== */

configureAssetLoaders()

const BASE = import.meta.env.BASE_URL ?? '/'

/** Deep-dispose a GLTF scene graph: geometries, materials, textures. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (!material) return
    const list = Array.isArray(material) ? material : [material]
    for (const mat of list) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) value.dispose()
      }
      mat.dispose()
    }
  })
}

type LoaderRuntime = typeof import('../assetLoaders')

async function loadEntry(
  loaders: LoaderRuntime,
  entry: AssetManifestEntry,
  gl: THREE.WebGLRenderer,
): Promise<StreamedAsset> {
  if (entry.kind === 'model') {
    const gltf = await loaders.createConfiguredGLTFLoader(gl).loadAsync(`${BASE}${entry.path}`)
    return {
      entry,
      resource: gltf,
      dispose: () => disposeObject3D(gltf.scene),
    }
  }
  // 'texture' | 'hdri' — color maps are sRGB, data maps (normal/ARM) linear.
  const texture = await loaders.loadTextureWithFallback(
    {
      path: entry.path,
      fallbackPath: entry.fallbackPath,
      srgb: entry.id.endsWith('-diff'),
    },
    gl,
  )
  return { entry, resource: texture, dispose: () => texture.dispose() }
}

function makeRuntimeBundleLoader(gl: THREE.WebGLRenderer): BundleLoader {
  return async (_district, entries) => {
    const loaders = await import('../assetLoaders')
    return Promise.all(entries.map((entry) => loadEntry(loaders, entry, gl)))
  }
}

/* -------------------------------------------------------- store singleton */

// The store outlives Canvas mounts (bundles re-stream on return visits) and
// useDistrictAssets subscribes through a module-level relay, so consumers
// never need to know when the store was created.
let store: DistrictStreamerCore | null = null
const relay = new Set<() => void>()

function notifyRelay(): void {
  for (const listener of relay) listener()
}

/** Subscribe to any district status/bundle change (useDistrictAssets). */
export function subscribeDistricts(listener: () => void): () => void {
  relay.add(listener)
  return () => relay.delete(listener)
}

/** The live streamer store (null until the overworld mounts one). */
export function getDistrictStore(): DistrictStreamerCore | null {
  return store
}

function installStore(next: DistrictStreamerCore): DistrictStreamerCore {
  store = next
  store.subscribe(notifyRelay)
  notifyRelay()
  return next
}

export interface DistrictStreamerProps {
  playerPosRef: React.MutableRefObject<THREE.Vector3>
  tier: GraphicsTier
  /** Decision cadence in ms — distance checks run here, not per frame. */
  intervalMs?: number
}

export function DistrictStreamer({
  playerPosRef,
  tier,
  intervalMs = 500,
}: DistrictStreamerProps): null {
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const core =
      store ??
      installStore(
        new DistrictStreamerCore({
          districts: DISTRICTS,
          tier,
          loadBundle: makeRuntimeBundleLoader(gl),
        }),
      )
    core.setTier(tier)
    const tick = () => {
      const p = playerPosRef.current
      core.update(p.x, p.z)
    }
    tick()
    const id = window.setInterval(tick, intervalMs)
    return () => {
      window.clearInterval(id)
      // Leaving the overworld: free every streamed GPU resource. The store
      // stays installed so a return visit reuses the same instance.
      core.disposeAll()
    }
  }, [gl, tier, playerPosRef, intervalMs])

  return null
}
