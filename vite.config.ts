/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const pyodideDirectory = normalizePath(
  fileURLToPath(new URL('./node_modules/pyodide/', import.meta.url)),
)
const pyodideRuntimeAssets = [
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
].map((fileName) => ({
  src: `${pyodideDirectory}${fileName}`,
  dest: 'pyodide',
  // v4 preserves source directory segments unless explicitly flattened.
  rename: { stripBase: true as const },
}))

// Self-hosted GLTF decoder/transcoder runtimes (no CDN): DRACO geometry
// decoder + Basis Universal KTX2 transcoder, copied from the pinned three.js
// release so the wasm always matches the loader code. Served at /decoders/*
// in dev and copied into dist/decoders/* for production (see
// src/components/game3d/assetLoaders.ts for the loader wiring).
const threeLibsDirectory = normalizePath(
  fileURLToPath(new URL('./node_modules/three/examples/jsm/libs/', import.meta.url)),
)
const gltfDecoderAssets = [
  ...['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'].map((fileName) => ({
    src: `${threeLibsDirectory}draco/gltf/${fileName}`,
    dest: 'decoders/draco',
    rename: { stripBase: true as const },
  })),
  ...['basis_transcoder.js', 'basis_transcoder.wasm'].map((fileName) => ({
    src: `${threeLibsDirectory}basis/${fileName}`,
    dest: 'decoders/basis',
    rename: { stripBase: true as const },
  })),
]

// https://vite.dev/config/
export default defineConfig({
  // Perf probes need renderer handles and the ?nohorde seam against a REAL
  // production bundle (dev's jsxDEV overhead distorts every frame-time number
  // by 3-5x). `VITE_QA_SEAMS=1 npm run build` keeps the seams; the normal
  // build folds this to `false` and the guarded blocks are dead-code stripped.
  define: { __QA_SEAMS__: JSON.stringify(process.env.VITE_QA_SEAMS === '1') },
  plugins: [
    react(),
    // loadPyodide requires these exact adjacent filenames. The plugin serves
    // them from node_modules in dev and copies only the runtime core in builds.
    viteStaticCopy({ targets: [...pyodideRuntimeAssets, ...gltfDecoderAssets] }),
  ],
  // Ensure a single three.js instance across fiber/drei/postprocessing so
  // instanceof checks (and the post-processing pipeline) work correctly.
  resolve: { dedupe: ['three', '@react-three/fiber'] },
  optimizeDeps: {
    include: ['three', 'postprocessing', '@react-three/postprocessing'],
    // Pyodide is dynamically imported by pythonJudge.worker.ts only.
    exclude: ['pyodide'],
  },
  // NOTE: no `server.watch.usePolling`. It was set to a 200ms poll in the
  // project's first commit, defensively ("some environments don't deliver
  // native FS events reliably") rather than to fix an observed failure. macOS
  // FSEvents is reliable, and the repo has since grown to thousands of files
  // plus ~100MB of assets: re-statting that tree five times a second costs a
  // continuous 20-30% of a core on this laptop, which is felt during a
  // gameplay session running beside the dev server. Native watching is the
  // default. Restore the poll only if edits genuinely stop triggering HMR
  // (an unusual filesystem — a network mount, or a container bind mount).
  test: {
    // Pure-logic unit tests (learner model, mastery, progress merge) run in
    // Node — no DOM needed. Co-located as `*.test.ts` next to the source.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
