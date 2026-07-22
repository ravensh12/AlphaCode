import type { Page } from '@playwright/test'

/* ============================================================================
   Shared deterministic guest/local-state seeding for the e2e suite.

   Follows the academy.smoke pattern (guest identity + empty progress, no real
   Supabase), with one upgrade: seeding is marker-guarded so it runs ONCE per
   browser context. Reloads inside a test keep everything the app wrote since
   (e.g. a persisted graphics tier), which is exactly what the persistence
   specs need. Each Playwright test gets a fresh context, so the marker never
   leaks between tests.

   Storage keys are duplicated from src (with pointers to the owning module)
   instead of imported, so the spec files never break while sibling agents are
   mid-edit on app source.
   ========================================================================== */

/** localStorage marker that says "this context is already seeded". */
const SEED_MARKER = 'e2e.seeded'

/** src/context/AuthContext.tsx — guest identity flag. */
export const GUEST_FLAG_KEY = 'alphacode.guest'
/** src/lib/localProgress — guest progress snapshot. */
export const GUEST_PROGRESS_KEY = 'alphacode.progress.guest'
// NOTE: the persisted graphics override key is gone — every player boots at
// ULTRA and only the invisible FPS governor (session-scoped) adjusts quality.

export const EMPTY_GUEST_PROGRESS = {
  streak: { current: 0, longest: 0 },
  lessons: {},
  badgeCounts: {
    lightning: 0,
    quick: 0,
    'speed-demon': 0,
    flawless: 0,
  },
  academyProgress: {
    schemaVersion: 1,
    curriculumId: 'curriculum:neetcode150',
    curriculumVersion: 'v1.0.0',
    contentVersion: 'v1.0.0',
    missionCompletions: {},
    realmQuizzes: {},
    bossDefeats: {},
  },
} as const

export interface GuestStateOptions {
  /** Extra localStorage entries seeded alongside the guest identity. */
  localStorage?: Record<string, string>
  /** Extra sessionStorage entries (e.g. the quest intro-seen flag). */
  sessionStorage?: Record<string, string>
}

/**
 * Seed a deterministic guest identity + empty progress before the first
 * document of this context loads. Subsequent navigations/reloads in the same
 * test leave storage alone (marker-guarded), so app-side writes persist.
 */
export async function seedGuestState(
  page: Page,
  options: GuestStateOptions = {},
): Promise<void> {
  await page.addInitScript(
    ({ marker, guestKey, progressKey, progress, local, session }) => {
      // Storage access throws on opaque origins (about:blank hops between
      // app navigations) — those documents need no seeding anyway.
      try {
        if (localStorage.getItem(marker)) return
        localStorage.clear()
        sessionStorage.clear()
        localStorage.setItem(guestKey, 'true')
        localStorage.setItem(progressKey, JSON.stringify(progress))
        for (const [key, value] of Object.entries(local)) {
          localStorage.setItem(key, value)
        }
        for (const [key, value] of Object.entries(session)) {
          sessionStorage.setItem(key, value)
        }
        localStorage.setItem(marker, '1')
      } catch {
        /* opaque origin */
      }
    },
    {
      marker: SEED_MARKER,
      guestKey: GUEST_FLAG_KEY,
      progressKey: GUEST_PROGRESS_KEY,
      progress: EMPTY_GUEST_PROGRESS,
      local: options.localStorage ?? {},
      session: options.sessionStorage ?? {},
    },
  )
}

/**
 * Same WebGL2 capability probe the app runs (see readDeviceCaps in
 * src/lib/graphicsQuality.ts). Specs use it to soft-skip 3D-only assertions
 * where software GL is unavailable — the app legitimately falls back to 2D
 * there, so failing would be wrong.
 */
export async function hasWebgl2(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas')
      return !!canvas.getContext('webgl2')
    } catch {
      return false
    }
  })
}

export interface GlInfo {
  webgl2: boolean
  renderer: string
  /** True for SwiftShader/llvmpipe-class software rasterizers. */
  software: boolean
}

/**
 * WebGL renderer identification. Small interior scenes run fine on
 * software GL, but the full Code City overworld (hundreds of instanced draws
 * + the Living Simulation shader set) freezes the main thread for minutes
 * under SwiftShader — specs that must BOOT the overworld soft-skip on
 * software renderers and run for real on hardware GL.
 */
export async function readGlInfo(page: Page): Promise<GlInfo> {
  return page.evaluate(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl2 = canvas.getContext('webgl2')
      const gl = gl2 ?? canvas.getContext('webgl')
      if (!gl) return { webgl2: false, renderer: 'none', software: true }
      const debugExt = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = String(
        debugExt
          ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      )
      return {
        webgl2: !!gl2,
        renderer,
        software: /swiftshader|llvmpipe|softpipe|software|basic render/iu.test(
          renderer,
        ),
      }
    } catch {
      return { webgl2: false, renderer: 'probe failed', software: true }
    }
  })
}
