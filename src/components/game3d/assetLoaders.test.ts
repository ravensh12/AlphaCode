import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Mock drei so the test never drags the full component library (and its DOM
   expectations) into Node — assetLoaders only touches useGLTF.setDecoderPath. */
const setDecoderPath = vi.fn()
vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(vi.fn(), {
    setDecoderPath: (path: string) => setDecoderPath(path),
    preload: vi.fn(),
    clear: vi.fn(),
  }),
}))

import {
  BASIS_TRANSCODER_PATH,
  DRACO_DECODER_PATH,
  configureAssetLoaders,
  createConfiguredGLTFLoader,
  extendGltfLoader,
  getDRACOLoader,
  getKTX2Loader,
  neutralFallbackTexture,
  resetAssetLoadersForTests,
} from './assetLoaders'

beforeEach(() => {
  resetAssetLoadersForTests()
  setDecoderPath.mockClear()
})

describe('decoder paths', () => {
  it('are self-hosted under /decoders/ (no CDN)', () => {
    expect(DRACO_DECODER_PATH).toBe('/decoders/draco/')
    expect(BASIS_TRANSCODER_PATH).toBe('/decoders/basis/')
    expect(DRACO_DECODER_PATH).not.toMatch(/gstatic|jsdelivr|unpkg/)
    expect(BASIS_TRANSCODER_PATH).not.toMatch(/gstatic|jsdelivr|unpkg/)
    expect(DRACO_DECODER_PATH.endsWith('/')).toBe(true)
    expect(BASIS_TRANSCODER_PATH.endsWith('/')).toBe(true)
  })
})

describe('configureAssetLoaders', () => {
  it('points drei useGLTF at the self-hosted DRACO decoder, once', () => {
    configureAssetLoaders()
    configureAssetLoaders()
    configureAssetLoaders()
    expect(setDecoderPath).toHaveBeenCalledTimes(1)
    expect(setDecoderPath).toHaveBeenCalledWith(DRACO_DECODER_PATH)
  })
})

describe('shared loader singletons', () => {
  it('KTX2Loader is created once with the self-hosted transcoder path', () => {
    const a = getKTX2Loader()
    const b = getKTX2Loader()
    expect(a).toBe(b)
    // three keeps the path on the instance; verify it took our directory.
    expect((a as unknown as { transcoderPath: string }).transcoderPath).toBe(
      BASIS_TRANSCODER_PATH,
    )
  })

  it('DRACOLoader is created once with the self-hosted decoder path', () => {
    const a = getDRACOLoader()
    expect(getDRACOLoader()).toBe(a)
    expect((a as unknown as { decoderPath: string }).decoderPath).toBe(DRACO_DECODER_PATH)
  })

  it('extendGltfLoader attaches the shared KTX2 transcoder to a GLTFLoader', () => {
    const fakeLoader = { setKTX2Loader: vi.fn() }
    extendGltfLoader()(fakeLoader as never)
    expect(fakeLoader.setKTX2Loader).toHaveBeenCalledWith(getKTX2Loader())
  })

  it('createConfiguredGLTFLoader wires DRACO + meshopt + KTX2', () => {
    const loader = createConfiguredGLTFLoader() as unknown as {
      dracoLoader: unknown
      ktx2Loader: unknown
      meshoptDecoder: unknown
    }
    expect(loader.dracoLoader).toBe(getDRACOLoader())
    expect(loader.ktx2Loader).toBe(getKTX2Loader())
    expect(loader.meshoptDecoder).toBeTruthy()
  })

  it('registers a REAL meshopt decoder (Meshy GLBs are EXT_meshopt_compression)', async () => {
    // Every Meshy-generated GLB ships meshopt-compressed geometry, so the
    // decoder must be the instantiated wasm API — not a stub. GLTFLoader
    // calls decodeGltfBuffer after awaiting `ready`; pin both.
    const decoder = (
      createConfiguredGLTFLoader() as unknown as {
        meshoptDecoder: {
          ready: Promise<void>
          supported: boolean
          decodeGltfBuffer: unknown
        }
      }
    ).meshoptDecoder
    expect(typeof decoder.decodeGltfBuffer).toBe('function')
    await decoder.ready
    expect(decoder.supported).toBe(true)
  })

  it('shares ONE meshopt decoder instance across loaders (single wasm init)', () => {
    const a = (createConfiguredGLTFLoader() as unknown as { meshoptDecoder: unknown })
      .meshoptDecoder
    const b = (createConfiguredGLTFLoader() as unknown as { meshoptDecoder: unknown })
      .meshoptDecoder
    expect(a).toBe(b)
  })
})

describe('fallback strategy', () => {
  it('provides a neutral 1×1 texture that never crashes a material', () => {
    const tex = neutralFallbackTexture()
    expect(tex.image.width).toBe(1)
    expect(tex.image.height).toBe(1)
    tex.dispose()
  })
})
