import { useGLTF } from '@react-three/drei'

/* ============================================================================
   Decoder path configuration — the tiny, dependency-light half of the asset
   pipeline runtime. GLB consumers (Avatar, ZombieHorde, …) import THIS so
   their lazy chunks stay lean; the heavy loader construction (KTX2Loader,
   RGBELoader, standalone GLTFLoader) lives in assetLoaders.ts and is only
   pulled in by the district streamer.

   The decoder/transcoder files are copied out of the pinned three.js release
   by vite-plugin-static-copy (see vite.config.ts), so the wasm can never
   drift from the loader code and everything works offline.
   ========================================================================== */

const BASE = import.meta.env.BASE_URL ?? '/'

/** Self-hosted DRACO decoder directory (trailing slash, as DRACOLoader wants). */
export const DRACO_DECODER_PATH = `${BASE}decoders/draco/`
/** Self-hosted Basis Universal transcoder directory for KTX2Loader. */
export const BASIS_TRANSCODER_PATH = `${BASE}decoders/basis/`

let configured = false

/**
 * Point drei's shared DRACOLoader at the self-hosted decoder. Idempotent and
 * cheap — call it from any module that loads GLBs (module bodies run before
 * the first load kicks off).
 */
export function configureAssetLoaders(): void {
  if (configured) return
  configured = true
  useGLTF.setDecoderPath(DRACO_DECODER_PATH)
}

/** Test-only reset so idempotence is verifiable. */
export function resetAssetLoadersForTests(): void {
  configured = false
}
