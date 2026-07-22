import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* ============================================================================
   Prime-invariant guard for the city world objects: they are PURE
   PRESENTATION. No evidence/progress module, no ProgressContext, and — unlike
   the dojo exhibits — not even usePlayerLevel: XP for pickups/deliveries/
   chains flows exclusively through the integration layer and the overlays.

   The one exemption is interactables.ts: it is the registry PROJECTION whose
   entire job is reading progress selectors to compute gating facts. It is not
   a component, records nothing, and has its own test suite.
   ========================================================================== */

const CITY_DIR = dirname(fileURLToPath(import.meta.url))

/** Module specifiers city world-object components must never import. */
const BANNED_IMPORT_SPECIFIERS = [
  'context/ProgressContext',
  'context/PlayerLevelContext',
  'hooks/useAcademyMissionFlow',
  'lib/academyProgress',
  'lib/localLearning',
  'lib/cloudLearning',
  'lib/localProgress',
  'lib/cloudProgress',
  'lib/questSession',
]

/** Evidence/reward call names that must not appear in component source. */
const BANNED_CALLS = [
  'recordLearningAttempt',
  'recordConceptResult',
  'recordMissionPractice',
  'recordMissionRetention',
  'useProgress(',
  'usePlayerLevel(',
  'addXp(',
  // City-life reward settlement stays with the integration layer too.
  'claimExhibitXp(',
  'claimCourierDelivery(',
  'claimBitPickups(',
  'startArcadeSession(',
]

const importPattern =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g

function citySourceFiles(): string[] {
  return readdirSync(CITY_DIR)
    .filter(
      (name) =>
        /\.(ts|tsx|css)$/.test(name) &&
        !name.includes('.test.') &&
        !name.includes('.spec.') &&
        // Registry projection exemption (see the header comment).
        name !== 'interactables.ts',
    )
    .map((name) => join(CITY_DIR, name))
}

describe('city world objects presentation-only guard', () => {
  const files = citySourceFiles()

  it('covers the city component surface', () => {
    const names = files.map((file) => file.split('/').at(-1))
    for (const expected of [
      'MemoryCrystals.tsx',
      'ArcadeCabinet.tsx',
      'NpcCitizen.tsx',
      'BitCollectibles.tsx',
      'CourierBeacon.tsx',
      'Hoverboard.tsx',
      'PhotoSpot.tsx',
      'CityWorldObjects.tsx',
      'memoryCrystalsCore.ts',
      'arcadeCabinetCore.ts',
      'bitCollectiblesCore.ts',
      'hoverboardCore.ts',
      'courierBeaconCore.ts',
      'cityWorldObjectsCore.ts',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('no city component imports a progress/evidence module or an XP context', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1]
        for (const banned of BANNED_IMPORT_SPECIFIERS) {
          expect(
            specifier.includes(banned),
            `${file.split('/').at(-1)} imports banned module "${specifier}"`,
          ).toBe(false)
        }
      }
    }
  })

  it('no city component calls an evidence/reward API', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const banned of BANNED_CALLS) {
        expect(
          source.includes(banned),
          `${file.split('/').at(-1)} references banned API "${banned}"`,
        ).toBe(false)
      }
    }
  })
})
