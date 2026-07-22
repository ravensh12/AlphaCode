import { describe, expect, it } from 'vitest'
import { trapFocusTarget } from './useModalOverlay'

/* The trap's wrap decision is pure — the DOM part of useModalOverlay only
   applies whatever index this returns (null = browser default order). */

describe('trapFocusTarget', () => {
  it('wraps Tab on the last focusable back to the first', () => {
    expect(trapFocusTarget(3, 2, false)).toBe(0)
    expect(trapFocusTarget(1, 0, false)).toBe(0)
  })

  it('wraps Shift+Tab on the first focusable to the last', () => {
    expect(trapFocusTarget(3, 0, true)).toBe(2)
    expect(trapFocusTarget(1, 0, true)).toBe(0)
  })

  it('sends Shift+Tab from the container itself (index -1) to the last item', () => {
    expect(trapFocusTarget(4, -1, true)).toBe(3)
  })

  it('leaves mid-list movement to the browser', () => {
    expect(trapFocusTarget(3, 0, false)).toBeNull()
    expect(trapFocusTarget(3, 1, false)).toBeNull()
    expect(trapFocusTarget(3, 1, true)).toBeNull()
    // Tab from the container: browser naturally enters the first item.
    expect(trapFocusTarget(3, -1, false)).toBeNull()
  })

  it('does nothing for an empty container', () => {
    expect(trapFocusTarget(0, -1, false)).toBeNull()
    expect(trapFocusTarget(0, -1, true)).toBeNull()
  })
})
