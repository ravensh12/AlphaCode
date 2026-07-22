import { describe, expect, it } from 'vitest'
import academyMissionFlowSource from '../hooks/useAcademyMissionFlow.ts?raw'
import academyMissionSource from './AcademyMissionPage.tsx?raw'
import bossBattleSource from './BossBattlePage.tsx?raw'
import overworldSource from './Overworld3DPage.tsx?raw'

describe('campaign routes require physical Code City entry', () => {
  it('grants matching academy and boss tokens only from the overworld', () => {
    // Dojo gates are decommissioned (July 2026): academy entry tokens are now
    // granted by the street-beat mission flow (openBeatMission / crystals /
    // due-mission pointers), boss tokens still by the boss lair gate.
    expect(overworldSource).toContain('grantAcademyTrackEntry(beat.realmId, beat.trackId)')
    expect(overworldSource).toContain('grantAcademyBossEntry(realmId)')
  })

  it('guards direct academy mission and boss battle URLs', () => {
    // The showcase-aware wrappers delegate to the original token gates for
    // every non-showcase account (see src/lib/showcaseOverride.ts). The
    // mission gate lives in the headless flow hook; the page renders its
    // blocked notice from the discriminated access state.
    expect(academyMissionFlowSource).toContain(
      'canAccessAcademyMissionEntryWithShowcase(',
    )
    expect(academyMissionFlowSource).toContain('if (!entryAuthorized)')
    expect(academyMissionSource).toContain("access.kind === 'entry-blocked'")
    expect(bossBattleSource).toContain('canAccessAcademyBossEntryWithShowcase(')
    expect(bossBattleSource).toContain('battleEntryAuthorized')
  })
})
