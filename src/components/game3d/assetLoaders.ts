import * as THREE from 'three'
import { DRACOLoader, KTX2Loader, MeshoptDecoder, GLTFLoader, RGBELoader } from 'three-stdlib'
import { BASIS_TRANSCODER_PATH, DRACO_DECODER_PATH } from './decoderConfig'

/* ============================================================================
   Shared GLTF/texture loader construction — Phase 1 asset pipeline runtime.

   Builds the loaders the district streamer (and any imperative load) uses,
   on top of the self-hosted decoder paths from decoderConfig.ts:

   - DRACO geometry decoder   → /decoders/draco/  (self-hosted, no gstatic CDN)
   - Basis/KTX2 transcoder    → /decoders/basis/  (self-hosted, no jsdelivr)
   - Meshopt decoder          → three-stdlib's inlined wasm (drei default)

   GLB consumers that only need drei's useGLTF import decoderConfig.ts
   directly (it is a fraction of this module's weight); this module is pulled
   in with the streaming framework.

   KTX2 fallback strategy: KTX2Loader itself transcodes to an uncompressed
   RGBA8 target when the GPU offers no compressed format, and
   `loadTextureWithFallback` additionally falls back to a plain image
   (entry.fallbackPath) — or a neutral 1×1 texture — if the transcoder wasm
   fails to load at all. A missing texture never crashes the city.
   ========================================================================== */

export {
  BASIS_TRANSCODER_PATH,
  DRACO_DECODER_PATH,
  configureAssetLoaders,
  resetAssetLoadersForTests,
} from './decoderConfig'

const BASE = import.meta.env.BASE_URL ?? '/'

/* ------------------------------------------------------------ KTX2 loader */

let ktx2Loader: KTX2Loader | null = null
let ktx2Detected = false

/**
 * Lazy shared KTX2Loader. Pass the WebGLRenderer once one exists so the
 * transcoder picks the best GPU target format (ASTC/ETC2/BC7/…); before
 * detection it would fall back to uncompressed RGBA8.
 */
export function getKTX2Loader(gl?: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader()
    ktx2Loader.setTranscoderPath(BASIS_TRANSCODER_PATH)
  }
  if (gl && !ktx2Detected) {
    ktx2Detected = true
    ktx2Loader.detectSupport(gl)
  }
  return ktx2Loader
}

/* --------------------------------------------------------- DRACO (manual) */

let dracoLoader: DRACOLoader | null = null

/** Shared DRACOLoader for manually-constructed GLTFLoaders (streamer path). */
export function getDRACOLoader(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH)
  }
  return dracoLoader
}

/* ------------------------------------------------- GLTFLoader composition */

/**
 * drei `useGLTF` extendLoader hook: attaches the shared KTX2 transcoder so
 * GLBs using KHR_texture_basisu decode. DRACO + meshopt are already wired by
 * drei itself (useDraco/useMeshopt default true) — combined with
 * {@link configureAssetLoaders} everything resolves to self-hosted decoders.
 *
 *   const gl = useThree((s) => s.gl)
 *   const gltf = useGLTF(url, true, true, extendGltfLoader(gl))
 */
export function extendGltfLoader(gl?: THREE.WebGLRenderer): (loader: GLTFLoader) => void {
  return (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl))
  }
}

// three-stdlib ships MeshoptDecoder as a factory; instantiate the wasm once
// and share it (drei does the same internally for useGLTF).
let meshoptDecoder: ReturnType<typeof MeshoptDecoder> | null = null

function getMeshoptDecoder(): ReturnType<typeof MeshoptDecoder> {
  if (!meshoptDecoder) {
    meshoptDecoder = typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder
  }
  return meshoptDecoder
}

/**
 * Fully-configured standalone GLTFLoader (DRACO + meshopt + KTX2) for
 * imperative loads outside the React tree (the district streamer).
 */
export function createConfiguredGLTFLoader(gl?: THREE.WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader()
  loader.setDRACOLoader(getDRACOLoader())
  loader.setMeshoptDecoder(getMeshoptDecoder())
  loader.setKTX2Loader(getKTX2Loader(gl))
  return loader
}

/* -------------------------------------------------------- Texture loading */

let rgbeLoader: RGBELoader | null = null
let imageLoader: THREE.TextureLoader | null = null

function getRGBELoader(): RGBELoader {
  if (!rgbeLoader) rgbeLoader = new RGBELoader()
  return rgbeLoader
}

function getImageTextureLoader(): THREE.TextureLoader {
  if (!imageLoader) imageLoader = new THREE.TextureLoader()
  return imageLoader
}

/** Neutral 1×1 mid-grey stand-in so a failed texture never crashes a scene. */
export function neutralFallbackTexture(): THREE.Texture {
  const data = new Uint8Array([128, 128, 128, 255])
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

export interface TextureRequest {
  /** Site-root-relative path, usually a manifest entry `path` (.ktx2 / .hdr / image). */
  path: string
  /** Plain-image fallback when the KTX2 transcode path is unavailable. */
  fallbackPath?: string
  /** Mark color textures sRGB (KTX2 files carry their own transfer flag). */
  srgb?: boolean
}

/**
 * Load a texture by extension with graceful KTX2 fallback:
 * .ktx2 → KTX2Loader (transcoder), on failure → fallbackPath (image) if
 * present, else a neutral 1×1 texture. .hdr → RGBELoader. Anything else →
 * TextureLoader.
 */
export async function loadTextureWithFallback(
  req: TextureRequest,
  gl?: THREE.WebGLRenderer,
): Promise<THREE.Texture> {
  const url = `${BASE}${req.path.replace(/^\//, '')}`
  try {
    if (req.path.endsWith('.ktx2')) {
      const tex = await getKTX2Loader(gl).loadAsync(url)
      return tex
    }
    if (req.path.endsWith('.hdr')) {
      const tex = await getRGBELoader().loadAsync(url)
      tex.mapping = THREE.EquirectangularReflectionMapping
      return tex
    }
    return await loadPlainImage(url, req.srgb)
  } catch {
    if (req.fallbackPath) {
      try {
        return await loadPlainImage(`${BASE}${req.fallbackPath.replace(/^\//, '')}`, req.srgb)
      } catch {
        /* fall through to neutral */
      }
    }
    return neutralFallbackTexture()
  }
}

async function loadPlainImage(url: string, srgb?: boolean): Promise<THREE.Texture> {
  const tex = await getImageTextureLoader().loadAsync(url)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
