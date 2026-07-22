import { expect, test } from '@playwright/test'
import { readGlInfo } from './support/state'

/* ============================================================================
   Overworld graphics smoke — ULTRA for everyone: boot Code City on a plain
   default profile (there is no other) in a real browser and assert every
   Living Simulation shader (facade atlas + interior mapping, street decals,
   hover traffic, citizen VAT crowd, Meshy street shell, rain, 3 shadow
   cascades, god rays) compiles and renders without WebGL errors.

   The old per-tier boot matrix died with the tier system; the invisible FPS
   governor's step-down ladder is covered by unit tests
   (src/lib/graphicsGovernor.test.ts).

   Renderer note: SwiftShader cannot finish this boot within any sane budget —
   the spec soft-skips on software GL and runs in full on hardware GL (dev
   machines; locally `E2E_CHANNEL=chromium` uses the new headless mode with
   real GPU access).
   ========================================================================== */

const EMPTY_GUEST_PROGRESS = {
  streak: { current: 0, longest: 0 },
  lessons: {},
  badgeCounts: { lightning: 0, quick: 0, 'speed-demon': 0, flawless: 0 },
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

test('overworld boots clean at ULTRA (the only profile)', async ({ page }) => {
  test.setTimeout(120_000)
  const shaderErrors: string[] = []
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error' && /THREE|WebGL|shader|GLSL/iu.test(text)) {
      shaderErrors.push(text)
    }
  })
  page.on('pageerror', (err) => shaderErrors.push(String(err)))

  await page.addInitScript(
    ({ progress }) => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem('alphacode.guest', 'true')
      localStorage.setItem('alphacode.progress.guest', JSON.stringify(progress))
      // Skip the how-to-play overlay so the sim/day-night clocks run and the
      // full material set (night systems included) compiles inside the wait.
      sessionStorage.setItem('alphacode.quest.introSeen', '1')
    },
    { progress: EMPTY_GUEST_PROGRESS },
  )
  const gl = await readGlInfo(page)
  test.skip(!gl.webgl2, 'No WebGL2 in this environment')
  test.skip(
    gl.software,
    `Software WebGL (${gl.renderer}) cannot boot the full overworld in budget — hardware-GL runs execute this spec`,
  )
  await page.goto('/quest')

  await expect(page.locator('canvas')).toBeVisible({ timeout: 45_000 })

  // Let the renderer compile the full material set: facades, decals, traffic,
  // citizens, the Meshy street shell, sky, post. Then assert nothing blew up.
  await page.waitForTimeout(20_000)

  expect(shaderErrors, shaderErrors.join('\n---\n')).toEqual([])
  // The page must still be interactive (no context-loss death spiral).
  await expect(page.locator('canvas')).toBeVisible()
})
