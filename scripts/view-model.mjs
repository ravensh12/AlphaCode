// Screenshot harness for the dev model viewer (viewer.html + src/devViewer.ts).
// Boots the vite DEV server (viewer.html is dev-only) if not already running,
// then captures one screenshot per spec.
//
//   node scripts/view-model.mjs out.png "model=/assets/...glb&clip=0&t=0.5&angle=30&height=1.76"
//   node scripts/view-model.mjs --batch specs.json   # [{ out, query }, ...]
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const PORT = 4174

async function serverUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/viewer.html`)
    return res.ok
  } catch {
    return false
  }
}

let devProc = null
if (!(await serverUp())) {
  devProc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    stdio: 'ignore',
    detached: false,
  })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await serverUp()) break
    if (i === 59) {
      console.error('vite dev server never came up')
      process.exit(1)
    }
  }
}

const specs = []
if (process.argv[2] === '--batch') {
  specs.push(...JSON.parse(readFileSync(process.argv[3], 'utf8')))
} else {
  specs.push({ out: process.argv[2], query: process.argv[3] })
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
for (const spec of specs) {
  const url = `http://127.0.0.1:${PORT}/viewer.html?${spec.query}`
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__viewerReady || window.__viewerError, undefined, {
    timeout: 60_000,
  })
  const error = await page.evaluate(() => window.__viewerError)
  if (error) {
    console.error(`[view-model] ${spec.out}: ${error}`)
  } else {
    await page.screenshot({ path: spec.out })
    console.log(`[view-model] saved ${spec.out}`)
  }
}
await browser.close()
if (devProc) devProc.kill()
process.exit(0)
