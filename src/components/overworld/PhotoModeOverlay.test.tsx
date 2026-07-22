import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import photoSource from './PhotoModeOverlay.tsx?raw'
import { PhotoModeOverlay } from './PhotoModeOverlay'
import {
  PHOTO_COSMETICS,
  unlockedPhotoCosmeticIds,
} from '../../lib/cityLife'

const FRESH_UNLOCKS = unlockedPhotoCosmeticIds({
  exhibitsCleared: 0,
  courierDeliveries: 0,
  bitsCollected: 0,
})

function render(unlockedIds: readonly string[] = FRESH_UNLOCKS) {
  return renderToStaticMarkup(
    <PhotoModeOverlay
      cosmetics={PHOTO_COSMETICS}
      unlockedIds={unlockedIds}
      capture={() => undefined}
      onClose={() => undefined}
    />,
  )
}

describe('PhotoModeOverlay', () => {
  it('renders the HUD-hidden frame chrome with capture and exit', () => {
    const html = render()
    expect(html).toContain('photo-overlay')
    expect(html).toContain('Photo mode · HUD hidden')
    expect(html).toContain('photo-viewfinder')
    expect((html.match(/photo-corner/g) ?? []).length).toBe(4)
    expect(html).toContain('Capture')
    expect(html).toContain('Exit')
  })

  it('lists every catalog frame and sticker with locked ones disabled + hint', () => {
    const html = render()
    for (const cosmetic of PHOTO_COSMETICS) {
      expect(html).toContain(cosmetic.label)
    }
    // Locked entries render disabled with their unlock hint visible.
    expect(html).toContain('disabled=""')
    expect(html).toContain('Finish 5 deliveries')
    expect(html).toContain('Collect 100 bits')
  })

  it('preselects the first unlocked frame and shows it on the viewfinder', () => {
    const html = render()
    expect(html).toContain('data-frame="frame:city-glass"')
    expect(html).toContain('photo-frame-label')
  })

  it('unlocked-everything renders no locked entries', () => {
    const everything = PHOTO_COSMETICS.map(({ id }) => id)
    const html = render(everything)
    expect(html).not.toContain('is-locked')
  })

  it('imports no three.js and calls no progress or storage APIs', () => {
    expect(photoSource).not.toMatch(/from 'three'|from "three"/)
    expect(photoSource).not.toMatch(/@react-three/)
    expect(photoSource).not.toMatch(/useThree|useFrame/)
    expect(photoSource).not.toMatch(/useProgress|ProgressContext|usePlayerLevel/)
    expect(photoSource).not.toMatch(/localStorage|sessionStorage/)
    // The snapshot itself is injected by the host.
    expect(photoSource).toContain('capture: (selection: PhotoSelection) => void')
  })

  it('renders modal dialog semantics on the overlay surface', () => {
    const html = render()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    // No single card here — the overlay itself takes focus and hosts the trap.
    expect(html).toContain('tabindex="-1"')
  })

  it('wires the shared modal hook (initial focus, focus trap, Escape close)', () => {
    expect(photoSource).toContain("from './useModalOverlay'")
    expect(photoSource).toContain('useModalOverlay(props.onClose)')
    expect(photoSource).toContain('onKeyDown={modal.onKeyDown}')
    expect(photoSource).toContain('ref={modal.cardRef}')
  })
})
