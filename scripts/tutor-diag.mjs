// Throwaway diagnostic: loads a target origin as a guest, opens the mission
// tutor, and records console errors + every tutor/edge-function network call.
// Usage: node scripts/tutor-diag.mjs <baseUrl> <label>
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const baseUrl = process.argv[2] ?? 'https://alpha-code-one.vercel.app'
const label = process.argv[3] ?? 'prod'
const outDir = 'e2e-shots/tutor-diag'
const supabaseUrl = process.env.VITE_SUPABASE_URL ?? ''
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? ''

const log = []
const say = (line) => {
  console.log(line)
  log.push(line)
}

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ channel: 'chromium' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    say(`[console.${msg.type()}] ${msg.text()}`)
  }
})
page.on('pageerror', (err) => say(`[pageerror] ${err.message}`))

const interesting = (url) =>
  /functions\/v1|chat\/completions|truefoundry|openai/i.test(url)

page.on('request', (req) => {
  if (interesting(req.url())) say(`[request] ${req.method()} ${req.url()}`)
})
page.on('requestfailed', (req) => {
  if (interesting(req.url()))
    say(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`)
})
page.on('response', async (res) => {
  if (!interesting(res.url())) return
  const headers = res.headers()
  say(`[response] ${res.status()} ${res.url()}`)
  say(`  access-control-allow-origin: ${headers['access-control-allow-origin']}`)
  try {
    say(`  body: ${(await res.text()).slice(0, 600)}`)
  } catch {
    say('  body: <unavailable>')
  }
})

const shot = async (name) => {
  const file = `${outDir}/${label}-${name}.png`
  await page.screenshot({ path: file })
  say(`[shot] ${file}`)
}

say(`=== ${label}: ${baseUrl} ===`)

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await shot('01-landing')

// Guest path: /auth -> "Continue as guest".
await page.goto(`${baseUrl}/auth`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await shot('02-auth')
const guest = page.getByRole('button', { name: /continue as guest/i })
if (await guest.count()) {
  await guest.first().click()
  say('[step] clicked Continue as guest')
} else {
  say('[step] NO guest button found')
}
await page.waitForTimeout(2500)

// Mission pages need a Code City checkpoint token; the academy's first mission
// is explicitly guest-previewable. Seed the (stable) track token anyway.
await page.addInitScript(() => {
  sessionStorage.setItem(
    'alphacode.game.academyTrackEntry',
    JSON.stringify({ realmId: 'realm1', trackId: 'arrays-hashing' }),
  )
})

await page.goto(`${baseUrl}/academy/realm1/arrays-hashing/contains-duplicate`, {
  waitUntil: 'domcontentloaded',
})
await page.waitForTimeout(8000)
say(
  `[probe] page text = ${JSON.stringify(
    (await page.locator('body').innerText()).slice(0, 300),
  )}`,
)
await shot('03-mission')

const launcher = page.getByRole('button', { name: /^Tutor$/ })
say(`[probe] tutor launcher count = ${await launcher.count()}`)
if (await launcher.count()) {
  const cls = await launcher.first().getAttribute('class')
  say(`[probe] launcher class = ${cls}`)
  await launcher.first().click()
  await page.waitForTimeout(1200)
  await shot('04-tutor-open')
  const panelText = await page
    .locator('#tutor-panel')
    .innerText()
    .catch(() => '<no panel>')
  say(`[probe] panel text = ${JSON.stringify(panelText.slice(0, 400))}`)

  const input = page.getByLabel('Ask the tutor')
  if (await input.count()) {
    await input.fill('give me a hint')
    await page.getByRole('button', { name: 'Send question' }).click()
    say('[step] submitted a tutor question')
    await page.waitForTimeout(9000)
    await shot('05-tutor-answer')
    say(
      `[probe] panel after ask = ${JSON.stringify(
        (await page.locator('#tutor-panel').innerText()).slice(0, 600),
      )}`,
    )
  } else {
    say('[probe] no composer input — tutor reports itself UNCONFIGURED')
  }
}

// Direct edge-function call from the real page origin: proves CORS + upstream.
// String-form evaluate so Playwright doesn't have to serialize a function that
// closes over `import.meta`.
const edge = await page.evaluate(`(async () => {
  const url = ${JSON.stringify(supabaseUrl)} + '/functions/v1/ai-tutor'
  const key = ${JSON.stringify(anonKey)}
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'hint please',
        context: { prompt: 'two sum', concept: 'Hash Maps', hint: 'use a dict', answered: false },
        history: [],
      }),
    })
    return { status: res.status, body: (await res.text()).slice(0, 500) }
  } catch (err) {
    return { error: String(err) }
  }
})()`)
say(`[probe] edge fn from page origin = ${JSON.stringify(edge)}`)

await browser.close()
await writeFile(`${outDir}/${label}-log.txt`, `${log.join('\n')}\n`)
say(`[done] wrote ${outDir}/${label}-log.txt`)
