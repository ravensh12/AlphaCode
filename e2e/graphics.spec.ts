import { expect, test, type Page } from '@playwright/test'
import { readGlInfo, seedGuestState } from './support/state'

/* ============================================================================
   ULTRA-for-everyone graphics contract (overworld).

   The tier picker, the persisted override, and the Graphics panel were
   REMOVED on the owner's directive: every player boots at ULTRA and the only
   quality authority is the invisible runtime FPS governor (pure-core
   unit-tested in src/lib/graphicsGovernor.test.ts). These specs pin the new
   product reality:
   - a default boot streams the ULTRA heavyweights (2K HDRI skies),
   - the Graphics button/panel no longer exists in the DOM.

   Renderer policy unchanged: soft-skip on software GL (SwiftShader cannot
   boot Code City in budget); hardware GL runs (`E2E_CHANNEL=chromium`
   locally) execute in full.
   ========================================================================== */

async function gotoOverworld(page: Page) {
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
}

test('a default boot is ULTRA: the HDRI environment skies stream for everyone', async ({
  page,
}) => {
  test.setTimeout(300_000)
  const hdriRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/assets/hdri/')) hdriRequests.push(request.url())
  })

  await gotoOverworld(page)

  await expect
    .poll(() => hdriRequests.length, { timeout: 120_000 })
    .toBeGreaterThan(0)
  expect(hdriRequests.join('\n')).toMatch(/city-(day|night)-2k\.hdr/u)
  await expect(page.getByText('Something broke')).toHaveCount(0)
})

test('the Graphics settings panel is gone (no tier picker, no FPS readout)', async ({
  page,
}) => {
  test.setTimeout(300_000)
  await gotoOverworld(page)

  // The right rail renders (Levels button is its anchor) …
  await expect(page.getByRole('link', { name: 'Levels' })).toBeVisible({
    timeout: 30_000,
  })
  // … but the Graphics toggle and its dialog are gone for good.
  await expect(page.getByRole('button', { name: 'Graphics' })).toHaveCount(0)
  await expect(
    page.getByRole('dialog', { name: 'Graphics quality settings' }),
  ).toHaveCount(0)
  await expect(page.getByText('Something broke')).toHaveCount(0)

  // Park on a blank page so closing the context never waits on a live
  // WebGL scene mid-frame.
  await page.goto('about:blank')
})
