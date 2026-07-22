import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* ============================================================================
   Post-campaign invariant guard:
   Boss Rush and Endless Siege award XP ONLY (usePlayerLevel.addXp). They must
   never write evidence — no evidence/progress module imports, no record* API
   calls, and the only ProgressContext usage allowed is the read-only route
   gate (`ready` + `academyCampaignComplete`). This greps the mode's source
   files so any regression fails loudly in the unit suite.
   ========================================================================== */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_SRC = join(HERE, '..')

/** Every source file that makes up the post-campaign modes. */
const POSTGAME_FILES = [
  'pages/BossRushPage.tsx',
  'pages/EndlessSiegePage.tsx',
  'components/game3d/EndlessArena.tsx',
  'lib/postgame.ts',
  'lib/bossRushCore.ts',
  'lib/endlessWaves.ts',
].map((rel) => join(REPO_SRC, rel))

/** Files that may read the route gate from ProgressContext (read-only). */
const GATE_PAGES = new Set(['BossRushPage.tsx', 'EndlessSiegePage.tsx'])

/** Module specifiers the modes must never import. */
const BANNED_IMPORT_SPECIFIERS = [
  'lib/academyProgress',
  'lib/localLearning',
  'lib/cloudLearning',
  'lib/localProgress',
  'lib/cloudProgress',
  'lib/questSession',
  'lib/gauntletProgress',
  'context/GauntletContext',
  'hooks/useAcademyMissionFlow',
]

/** Evidence-API call names that must not appear in the sources at all. */
const BANNED_CALLS = [
  'recordLearningAttempt',
  'recordRealmQuizAttempt',
  'recordRealmBossDefeat',
  'recordMissionPractice',
  'recordMissionRetention',
  'recordConceptResult',
  'logAttempt(',
]

/** The single ProgressContext usage the gate pages are allowed. */
const READ_ONLY_GATE_DESTRUCTURE =
  'const { ready, academyCampaignComplete } = useProgress()'

const importPattern =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

const nameOf = (file: string) => file.split('/').at(-1) ?? file

describe('post-campaign XP-only guard', () => {
  it('covers the post-campaign sources', () => {
    for (const file of POSTGAME_FILES) {
      expect(existsSync(file), `${nameOf(file)} exists`).toBe(true)
    }
  })

  it('no mode file imports an evidence/progress module', () => {
    for (const file of POSTGAME_FILES) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1]
        for (const banned of BANNED_IMPORT_SPECIFIERS) {
          expect(
            specifier.includes(banned),
            `${nameOf(file)} imports banned module "${specifier}"`,
          ).toBe(false)
        }
      }
    }
  })

  it('no mode file calls an evidence-recording API', () => {
    for (const file of POSTGAME_FILES) {
      const source = readFileSync(file, 'utf8')
      for (const banned of BANNED_CALLS) {
        expect(
          source.includes(banned),
          `${nameOf(file)} references banned API "${banned}"`,
        ).toBe(false)
      }
    }
  })

  it('ProgressContext is reachable only from the gate pages, read-only', () => {
    for (const file of POSTGAME_FILES) {
      const source = readFileSync(file, 'utf8')
      if (!GATE_PAGES.has(nameOf(file))) {
        expect(
          source.includes('ProgressContext'),
          `${nameOf(file)} must not touch ProgressContext`,
        ).toBe(false)
        continue
      }
      // Every useProgress() call in a gate page must be exactly the read-only
      // destructure of the two gate fields — nothing else may be pulled out.
      const calls = source.split('useProgress(').length - 1
      const readOnly = source.split(READ_ONLY_GATE_DESTRUCTURE).length - 1
      expect(calls, `${nameOf(file)} uses useProgress()`).toBeGreaterThan(0)
      expect(
        calls,
        `${nameOf(file)} has a non-read-only useProgress() usage`,
      ).toBe(readOnly)
    }
  })
})
