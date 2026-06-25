import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure a single three.js instance across fiber/drei/postprocessing so
  // instanceof checks (and the post-processing pipeline) work correctly.
  resolve: { dedupe: ['three', '@react-three/fiber'] },
  optimizeDeps: { include: ['three', 'postprocessing', '@react-three/postprocessing'] },
  server: {
    // Some environments don't deliver native FS events reliably; poll so edits
    // are always detected and hot-reloaded.
    watch: { usePolling: true, interval: 200 },
  },
})
