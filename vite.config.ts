import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Some environments don't deliver native FS events reliably; poll so edits
    // are always detected and hot-reloaded.
    watch: { usePolling: true, interval: 200 },
  },
})
