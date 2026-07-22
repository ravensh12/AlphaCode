import { useMemo, useState } from 'react'
import type { PhotoCosmetic } from '../../lib/cityLife'
import { useModalOverlay } from './useModalOverlay'
import './PhotoModeOverlay.css'

/* ============================================================================
   Photo mode — a HUD-hidden framing overlay.

   The centre of the overlay is fully transparent (the live 3D scene shows
   through); this component only draws the frame chrome, the cosmetic rails,
   and the capture/exit controls. The actual snapshot is taken by an INJECTED
   capture() callback — no three.js (or canvas) code lives here, so the
   overlay stays a plain DOM component the integration PR can mount anywhere.
   Hosts hide the gameplay HUD while this overlay is up (`photo-overlay` is
   the hook they key off).
   ========================================================================== */

export interface PhotoSelection {
  frameId: string | null
  stickerId: string | null
}

export interface PhotoModeOverlayProps {
  /** The full cosmetics catalog (cityLife's PHOTO_COSMETICS). */
  cosmetics: readonly PhotoCosmetic[]
  /** Ids currently unlocked (cityLife's unlockedPhotoCosmeticIds). */
  unlockedIds: readonly string[]
  /** Injected snapshot hook — receives the chosen frame + sticker. */
  capture: (selection: PhotoSelection) => void
  onClose: () => void
}

export function PhotoModeOverlay(props: PhotoModeOverlayProps) {
  const unlocked = useMemo(
    () => new Set(props.unlockedIds),
    [props.unlockedIds],
  )
  const frames = useMemo(
    () => props.cosmetics.filter(({ kind }) => kind === 'frame'),
    [props.cosmetics],
  )
  const stickers = useMemo(
    () => props.cosmetics.filter(({ kind }) => kind === 'sticker'),
    [props.cosmetics],
  )

  const [frameId, setFrameId] = useState<string | null>(
    () => frames.find(({ id }) => unlocked.has(id))?.id ?? null,
  )
  const [stickerId, setStickerId] = useState<string | null>(null)

  const frameLabel =
    frames.find(({ id }) => id === frameId)?.label ?? 'No frame'
  const stickerLabel =
    stickers.find(({ id }) => id === stickerId)?.label ?? null

  // Photo mode has no single card — the full-screen overlay itself is the
  // dialog surface: it takes initial focus and hosts the trap.
  const modal = useModalOverlay(props.onClose)

  return (
    <div
      className="photo-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Photo mode"
      ref={modal.cardRef}
      tabIndex={-1}
      onKeyDown={modal.onKeyDown}
    >
      <div className="photo-topbar">
        <span className="photo-eyebrow">Photo mode · HUD hidden</span>
        <button type="button" className="photo-exit" onClick={props.onClose}>
          Exit
        </button>
      </div>

      {/* Transparent viewfinder — the live scene shows through. */}
      <div className="photo-viewfinder" data-frame={frameId ?? 'none'}>
        <span className="photo-corner is-tl" aria-hidden="true" />
        <span className="photo-corner is-tr" aria-hidden="true" />
        <span className="photo-corner is-bl" aria-hidden="true" />
        <span className="photo-corner is-br" aria-hidden="true" />
        <span className="photo-frame-label">{frameLabel}</span>
        {stickerLabel && (
          <span className="photo-sticker-preview">{stickerLabel}</span>
        )}
      </div>

      <div className="photo-rails">
        <div className="photo-rail" aria-label="Frames">
          <span className="photo-rail-title">Frame</span>
          <div className="photo-rail-items">
            <button
              type="button"
              className={`photo-item ${frameId === null ? 'is-active' : ''}`}
              onClick={() => setFrameId(null)}
            >
              None
            </button>
            {frames.map((frame) => {
              const isUnlocked = unlocked.has(frame.id)
              return (
                <button
                  key={frame.id}
                  type="button"
                  className={`photo-item ${frameId === frame.id ? 'is-active' : ''} ${
                    isUnlocked ? '' : 'is-locked'
                  }`}
                  disabled={!isUnlocked}
                  title={isUnlocked ? frame.label : frame.unlockHint}
                  onClick={() => setFrameId(frame.id)}
                >
                  {frame.label}
                  {!isUnlocked && (
                    <span className="photo-lock-hint">{frame.unlockHint}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="photo-rail" aria-label="Stickers">
          <span className="photo-rail-title">Sticker</span>
          <div className="photo-rail-items">
            <button
              type="button"
              className={`photo-item ${stickerId === null ? 'is-active' : ''}`}
              onClick={() => setStickerId(null)}
            >
              None
            </button>
            {stickers.map((sticker) => {
              const isUnlocked = unlocked.has(sticker.id)
              return (
                <button
                  key={sticker.id}
                  type="button"
                  className={`photo-item ${stickerId === sticker.id ? 'is-active' : ''} ${
                    isUnlocked ? '' : 'is-locked'
                  }`}
                  disabled={!isUnlocked}
                  title={isUnlocked ? sticker.label : sticker.unlockHint}
                  onClick={() => setStickerId(sticker.id)}
                >
                  {sticker.label}
                  {!isUnlocked && (
                    <span className="photo-lock-hint">{sticker.unlockHint}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          className="photo-capture"
          onClick={() => props.capture({ frameId, stickerId })}
        >
          Capture
        </button>
      </div>
    </div>
  )
}
