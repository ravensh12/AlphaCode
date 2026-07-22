import { expect, test } from '@playwright/test'
import { readGlInfo, seedGuestState } from './support/state'

/* ============================================================================
   Meshy prop library — ULTRA-for-everyone streaming contract.

   HISTORY: this spec used to pin the opposite gate ("LOW never fetches
   /assets/meshy/"). The user-facing LOW tier died with the tier UI (owner
   directive): every player boots at ULTRA, so the Meshy library must stream
   on a plain default boot. Degradation on weak devices is now the invisible
   FPS governor's job — its step-down/step-up behavior is pure and covered by
   unit tests (src/lib/graphicsGovernor.test.ts), which is cheaper and less
   flaky than simulating a starved GPU in e2e.

   Same renderer policy as the other overworld specs: soft-skip on software
   GL; hardware GL runs (`E2E_CHANNEL=chromium` locally) execute in full.
   ========================================================================== */

test('a default boot streams the Meshy city library (ULTRA for everyone)', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const meshyRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/assets/meshy/')) meshyRequests.push(url)
  })

  await seedGuestState(page)
  const gl = await readGlInfo(page)
  test.skip(
    !gl.webgl2,
    'No WebGL2 in this environment — the overworld cannot mount its canvas',
  )
  test.skip(
    gl.software,
    `Software WebGL (${gl.renderer}) freezes the overworld boot for minutes — hardware-GL runs execute this spec`,
  )
  await page.goto('/quest')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 90_000 })

  // The street shell + landmarks + hero rigs all live under /assets/meshy/.
  await expect
    .poll(() => meshyRequests.length, { timeout: 120_000 })
    .toBeGreaterThan(0)
  await expect(page.getByText('Something broke')).toHaveCount(0)
})
