import { useCallback, useEffect, useRef } from 'react'

/* ============================================================================
   Shared modal semantics for the overworld overlays (arcade, NPC dialog,
   photo mode): initial focus on the card, focus restored to the opener on
   close, a Tab/Shift+Tab focus trap, and Escape-to-close. The overlays render
   role="dialog" + aria-modal="true" and wire this hook's ref + key handler.

   The trap's wrap decision is pure (trapFocusTarget) so it unit-tests in
   node without a DOM.
   ========================================================================== */

/**
 * Which focusable index to force-focus for a Tab press, or null to let the
 * browser's natural tab order proceed:
 * - Tab on the last item wraps to the first;
 * - Shift+Tab on the first item (or on the container itself, index -1)
 *   wraps to the last;
 * - anything else (including an empty container) stays with the browser.
 */
export function trapFocusTarget(
  count: number,
  activeIndex: number,
  shiftKey: boolean,
): number | null {
  if (count <= 0) return null
  if (!shiftKey && activeIndex === count - 1) return 0
  if (shiftKey && activeIndex <= 0) return count - 1
  return null
}

/** Everything the overlays can contain that participates in tab order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface ModalOverlayHandle {
  /** Attach to the dialog card: focused on mount, the focus-trap container. */
  cardRef: React.RefObject<HTMLDivElement | null>
  /** Attach to the dialog root — keeps Tab cycling inside the card. */
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

/**
 * Modal behavior for a role="dialog" overlay: focuses the card on mount,
 * restores focus to the previously-focused element on unmount, closes on
 * Escape (window-level, so it works wherever focus sits), and traps Tab
 * inside the card.
 */
export function useModalOverlay(onClose: () => void): ModalOverlayHandle {
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    cardRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Tab') return
      const container = cardRef.current
      if (!container) return
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      const activeIndex = items.findIndex(
        (item) => item === document.activeElement,
      )
      const target = trapFocusTarget(items.length, activeIndex, event.shiftKey)
      if (target === null) return
      event.preventDefault()
      items[target]?.focus()
    },
    [],
  )

  return { cardRef, onKeyDown }
}
