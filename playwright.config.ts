import { defineConfig, devices } from '@playwright/test'

const env =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Readonly<Record<string, string | undefined>> }
    }
  ).process?.env ?? {}

const isCi = Boolean(env.CI)

// Server selection: the default (and CI) path stays the on-demand dev server
// on 4173. E2E_PREVIEW=1 serves the production build instead (`npm run build`
// first) — static chunk loads, no transform-on-demand stalls, no HMR
// interference — and E2E_PORT moves the whole setup off 4173 (e.g. beside a
// running dev server). The Python-judge spec needs the dev server's /src
// module graph and annotates-skips itself under preview.
const port = Number(env.E2E_PORT ?? 4173)
const usePreview = env.E2E_PREVIEW === '1'
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  // One retry in CI: enough to absorb a software-GL hiccup without hiding a
  // real regression behind repeated attempts. Local runs stay strict.
  retries: isCi ? 1 : 0,
  // Several specs each hold a live WebGL scene; more than two at once starves
  // the GPU/CPU (frozen pages, teardown timeouts) on busy machines and in CI.
  // E2E_WORKERS overrides locally when the machine is idle.
  workers: isCi ? 2 : Number(env.E2E_WORKERS ?? 2),
  reporter: isCi
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    screenshot: 'only-on-failure',
    // Trace only the retry attempt: WebGL-heavy pages make always-on traces
    // expensive, and the first failure already keeps screenshot + video.
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional local override: E2E_CHANNEL=chromium runs the new headless
        // mode with hardware GPU access, which un-skips the overworld GPU
        // specs (they soft-skip on the default shell's SwiftShader).
        ...(env.E2E_CHANNEL ? { channel: env.E2E_CHANNEL } : {}),
      },
    },
  ],
  webServer: {
    command: usePreview
      ? `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`
      : `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run dev -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
})
