#!/usr/bin/env node
/**
 * Asset budget gate — pure Node, no dependencies, no writes.
 *
 * Measures every file shipped under public/assets (recursive, on-disk bytes)
 * and cross-checks the generated size ledger the asset manifest reads
 * (src/content/assets/assetSizes.generated.json) when it exists.
 *
 * Fails (exit 1) when either budget is exceeded:
 *   - total bytes under public/assets  >  TOTAL_BUDGET_BYTES  (112 MB)
 *   - any single file                  >  SINGLE_FILE_BUDGET_BYTES (12 MB)
 *
 * Ledger drift (generated JSON disagreeing with the disk) is reported as a
 * warning only — the unit suite owns manifest consistency; this gate owns
 * the shipping weight.
 *
 * Usage: node scripts/check-asset-budget.mjs
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/** Hard ceiling for everything under public/assets combined.
 *  Raised 80 → 100 → 112 MB (July 2026, owner's "unlimited assets"
 *  direction): 100 admitted the phase-2 skyline + street pack; 112 admits
 *  the phase-3 finale kit (boss-vex + civilian rigs, arena nine-piece set,
 *  hero clip bank). The tier-13 per-boss arena identities (owner: "a
 *  different background setting per boss") fit UNDER this ceiling: the five
 *  signature set pieces are encoded at 512px (distant background dressing)
 *  for ≈1.7 MB total, so no raise was needed. Everything is lazy-streamed
 *  KTX2/meshopt — the gate bounds CDN weight, not boot cost (the boot
 *  preloader shows progress for what it fronts). */
const TOTAL_BUDGET_BYTES = 112 * 1024 * 1024
/** Hard ceiling for any single shipped asset file. */
const SINGLE_FILE_BUDGET_BYTES = 12 * 1024 * 1024
/** How many of the largest files to print in the summary. */
const TOP_FILES_SHOWN = 10

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const assetsRoot = path.join(repoRoot, 'public', 'assets')
const generatedSizesPath = path.join(
  repoRoot,
  'src',
  'content',
  'assets',
  'assetSizes.generated.json',
)

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Recursively list files under `dir` as repo-relative posix paths + bytes. */
async function walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else if (entry.isFile()) {
      const { size } = await stat(full)
      files.push({
        // Report site-root-relative paths, matching the manifest convention.
        path: path.relative(path.join(repoRoot, 'public'), full).split(path.sep).join('/'),
        bytes: size,
      })
    }
  }
  return files
}

async function readGeneratedLedger() {
  try {
    const raw = await readFile(generatedSizesPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.bytes && typeof parsed.bytes === 'object') {
      return parsed
    }
    return null
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

const files = await walk(assetsRoot)
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
const failures = []
const warnings = []

if (files.length === 0) {
  warnings.push(`no files found under ${path.relative(repoRoot, assetsRoot)}`)
}

for (const file of files) {
  if (file.bytes > SINGLE_FILE_BUDGET_BYTES) {
    failures.push(
      `${file.path} is ${formatMb(file.bytes)} — over the ${formatMb(SINGLE_FILE_BUDGET_BYTES)} single-file budget`,
    )
  }
}

if (totalBytes > TOTAL_BUDGET_BYTES) {
  failures.push(
    `public/assets totals ${formatMb(totalBytes)} — over the ${formatMb(TOTAL_BUDGET_BYTES)} total budget`,
  )
}

const ledger = await readGeneratedLedger()
if (ledger) {
  const declared = Object.entries(ledger.bytes)
  const declaredTotal = declared.reduce((sum, [, bytes]) => sum + Number(bytes || 0), 0)
  const onDisk = new Map(files.map((file) => [file.path, file.bytes]))
  for (const [declaredPath, declaredBytes] of declared) {
    const diskBytes = onDisk.get(declaredPath)
    if (diskBytes === undefined) {
      warnings.push(`ledger entry ${declaredPath} has no file on disk`)
    } else if (diskBytes !== Number(declaredBytes)) {
      warnings.push(
        `ledger drift: ${declaredPath} declares ${declaredBytes} bytes, disk has ${diskBytes} — re-run npm run assets:optimize`,
      )
    }
  }
  console.log(
    `Ledger: ${declared.length} entries declaring ${formatMb(declaredTotal)}` +
      (ledger.placeholders === true ? ' (placeholder pipeline)' : ''),
  )
} else {
  console.log('Ledger: assetSizes.generated.json not present — disk sizes only')
}

const largest = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, TOP_FILES_SHOWN)
console.log(
  `\npublic/assets: ${files.length} files, ${formatMb(totalBytes)} total ` +
    `(budget ${formatMb(TOTAL_BUDGET_BYTES)}; per-file ${formatMb(SINGLE_FILE_BUDGET_BYTES)})`,
)
for (const file of largest) {
  console.log(`  ${formatMb(file.bytes).padStart(9)}  ${file.path}`)
}

for (const warning of warnings) {
  console.warn(`\nWARN: ${warning}`)
}

if (failures.length > 0) {
  console.error('\nASSET BUDGET EXCEEDED:')
  for (const failure of failures) {
    console.error(`  - ${failure}`)
  }
  process.exit(1)
}

console.log('\nAsset budget OK.')
