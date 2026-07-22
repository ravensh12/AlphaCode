/// <reference types="node" />
import { statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ASSET_MANIFEST,
  ASSET_MANIFEST_TOTAL_BYTES,
  ASSET_TOTAL_BUDGET_BYTES,
  DISTRICT_BUDGET_BYTES,
  assetById,
  assetsForDistrict,
  sharedAssets,
} from './assetManifest'
import type { RealmId } from '../../types/curriculum'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../public')
const REALMS: RealmId[] = ['realm1', 'realm2', 'realm3', 'realm4', 'realm5', 'realm6']

describe('asset manifest — licensing & provenance', () => {
  it('declares at least the Phase 1 starter set', () => {
    expect(ASSET_MANIFEST.length).toBeGreaterThanOrEqual(15)
  })

  it('every entry carries a license, source URL, and author', () => {
    for (const entry of ASSET_MANIFEST) {
      expect(entry.license, entry.id).toMatch(/^(CC0-1\.0|MIT)$/)
      expect(entry.sourceUrl, entry.id).toMatch(/^https:\/\//)
      expect(entry.author.length, entry.id).toBeGreaterThan(0)
      expect(entry.source.length, entry.id).toBeGreaterThan(0)
    }
  })

  it('ids and paths are unique and site-root-relative (no leading slash)', () => {
    const ids = new Set(ASSET_MANIFEST.map((e) => e.id))
    const paths = new Set(ASSET_MANIFEST.map((e) => e.path))
    expect(ids.size).toBe(ASSET_MANIFEST.length)
    expect(paths.size).toBe(ASSET_MANIFEST.length)
    for (const entry of ASSET_MANIFEST) {
      expect(entry.path.startsWith('/'), entry.path).toBe(false)
      expect(entry.path.startsWith('assets/'), entry.path).toBe(true)
    }
  })

  it('every entry is tagged with at least one district (or shared)', () => {
    for (const entry of ASSET_MANIFEST) {
      expect(entry.districts.length, entry.id).toBeGreaterThan(0)
    }
  })
})

describe('asset manifest — files on disk', () => {
  it('non-placeholder entries exist with exactly the declared byte size', () => {
    for (const entry of ASSET_MANIFEST) {
      const file = join(PUBLIC_DIR, entry.path)
      expect(existsSync(file), `${entry.id} missing at public/${entry.path}`).toBe(true)
      if (!entry.placeholder) {
        expect(statSync(file).size, `${entry.id} bytes drifted — re-run assets:optimize`).toBe(
          entry.bytes,
        )
        expect(entry.bytes, entry.id).toBeGreaterThan(0)
      }
    }
  })

  it('fallback paths, when declared, also exist', () => {
    for (const entry of ASSET_MANIFEST) {
      if (!entry.fallbackPath) continue
      expect(existsSync(join(PUBLIC_DIR, entry.fallbackPath)), entry.id).toBe(true)
    }
  })
})

describe('asset manifest — byte budgets', () => {
  it('total shipped assets stay under the Phase 1 budget (~20 MB)', () => {
    expect(ASSET_MANIFEST_TOTAL_BYTES).toBeGreaterThan(0)
    expect(ASSET_MANIFEST_TOTAL_BYTES).toBeLessThanOrEqual(ASSET_TOTAL_BUDGET_BYTES)
  })

  it.each(REALMS)('district %s bundle stays under its streamed budget', (realm) => {
    const bundle = assetsForDistrict(realm, 'ultra')
    const bytes = bundle.reduce((sum, e) => sum + e.bytes, 0)
    expect(bytes).toBeLessThanOrEqual(DISTRICT_BUDGET_BYTES)
  })
})

describe('asset manifest — district & tier selection', () => {
  it('every district has a streamable bundle at every tier', () => {
    for (const realm of REALMS) {
      for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
        expect(assetsForDistrict(realm, tier).length, `${realm}@${tier}`).toBeGreaterThan(0)
      }
    }
  })

  it('minTier filtering is monotonic: higher tiers never lose assets', () => {
    for (const realm of REALMS) {
      const low = assetsForDistrict(realm, 'low').map((e) => e.id)
      const medium = assetsForDistrict(realm, 'medium').map((e) => e.id)
      const high = assetsForDistrict(realm, 'high').map((e) => e.id)
      const ultra = assetsForDistrict(realm, 'ultra').map((e) => e.id)
      for (const id of low) expect(medium).toContain(id)
      for (const id of medium) expect(high).toContain(id)
      for (const id of high) expect(ultra).toContain(id)
    }
  })

  it('district bundles exclude shared assets; the shared sky gates at medium+', () => {
    for (const realm of REALMS) {
      const ids = assetsForDistrict(realm, 'ultra').map((e) => e.id)
      expect(ids).not.toContain('hdri-city-day')
    }
    expect(sharedAssets('low').map((e) => e.id)).toEqual([])
    const atMedium = sharedAssets('medium').map((e) => e.id)
    expect(atMedium).toContain('hdri-city-day')
    // The night HDRI was cut from the ship set (July 2026) — the CPU bake
    // lights the night dome, so it must never come back as shared weight.
    expect(atMedium).not.toContain('hdri-city-night')
  })

  it('looks entries up by id', () => {
    expect(assetById('model-robot-sentinel')?.kind).toBe('model')
    expect(assetById('nope')).toBeUndefined()
  })
})
