// Independent checker for the landing hero. Renders the real page at desktop
// and mobile, verifies poster-first -> canvas crossfade, reduced-motion
// poster-only behavior, the Google-interview claim in the rendered DOM, and
// zero console/page errors. Screenshots to e2e-shots/verify-landing/.
//   PLAYWRIGHT_BROWSERS_PATH=$PWD/.pw-browsers node scripts/verify-landing.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = 'e2e-shots/verify-landing'
mkdirSync(OUT, { recursive: true })

const results = []
const note = (name, pass, detail) => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({
  channel: 'chromium',
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
  timeout: 300_000,
})

async function checkViewport(label, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`))

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 120_000 })

  // Poster-first: the poster background must be present immediately, before
  // any canvas exists.
  const early = await page.evaluate(() => {
    const bg = document.querySelector('.landing-hero-bg')
    return {
      posterUrl: bg ? getComputedStyle(bg).backgroundImage : null,
      canvasCount: document.querySelectorAll('.landing-hero-live canvas').length,
      liveOpacity: (() => {
        const el = document.querySelector('.landing-hero-live')
        return el ? getComputedStyle(el).opacity : null
      })(),
    }
  })
  note(
    `${label}: poster paints first`,
    !!early.posterUrl?.includes('hero-rooftop') && early.canvasCount === 0,
    `bg=${early.posterUrl}, canvases at domcontentloaded=${early.canvasCount}`,
  )

  // Canvas hydrates and crossfades in.
  let canvasOk = true
  try {
    await page.locator('.landing-hero-live canvas').waitFor({ state: 'attached', timeout: 30_000 })
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.landing-hero-live')
        return el?.classList.contains('is-ready') && Number(getComputedStyle(el).opacity) > 0.9
      },
      { timeout: 30_000 },
    )
  } catch {
    canvasOk = false
  }
  note(`${label}: live canvas crossfades in`, canvasOk)

  // Google interview claim in the rendered DOM.
  const heroText = await page.evaluate(
    () => document.querySelector('.landing-hero-copy')?.textContent ?? '',
  )
  note(
    `${label}: Google interview claim rendered`,
    /google interview/i.test(heroText),
    heroText.match(/[^.]*google interview[^.]*/i)?.[0]?.trim().slice(0, 140) ?? 'NOT FOUND',
  )

  // Settle animation + crossfade fully, then screenshot the hero.
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/${label}-hero.png` })
  await page.screenshot({ path: `${OUT}/${label}-full.png`, fullPage: true })

  note(`${label}: zero console/page errors`, errors.length === 0, errors.join(' | ') || 'clean')
  await page.close()
}

async function checkReducedMotion(label, viewport) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  })
  await page.goto('http://localhost:5173/', { waitUntil: 'load', timeout: 120_000 })
  await page.waitForTimeout(5000) // past the idle-hydration window
  const state = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('.landing-hero-live canvas').length,
    posterUrl: (() => {
      const bg = document.querySelector('.landing-hero-bg')
      return bg ? getComputedStyle(bg).backgroundImage : null
    })(),
  }))
  note(
    `${label}: reduced-motion => poster only, no canvas`,
    state.canvasCount === 0 && !!state.posterUrl?.includes('hero-rooftop'),
    `canvases=${state.canvasCount}, bg=${state.posterUrl}`,
  )
  await page.screenshot({ path: `${OUT}/${label}-reduced-motion.png` })
  await page.close()
}

try {
  await checkViewport('desktop', { width: 1440, height: 900 })
  await checkViewport('mobile', { width: 390, height: 844 })
  await checkReducedMotion('desktop', { width: 1440, height: 900 })
  await checkReducedMotion('mobile', { width: 390, height: 844 })
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
