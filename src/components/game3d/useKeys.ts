import { useEffect, useRef } from 'react'

export type KeyState = Record<string, boolean>

/**
 * Tracks pressed movement keys in a ref (no re-render). WASD + arrows + Shift.
 * `enabled` lets the caller pause input (e.g. while pointer lock is off).
 */
export function useKeys(enabledRef: { current: boolean }) {
  const keys = useRef<KeyState>({})

  useEffect(() => {
    const tracked = new Set([
      'w',
      'a',
      's',
      'd',
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
      'shift',
    ])
    function down(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if (!tracked.has(k)) return
      if (!enabledRef.current) return
      keys.current[k] = true
      e.preventDefault()
    }
    function up(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if (!tracked.has(k)) return
      keys.current[k] = false
    }
    function blur() {
      keys.current = {}
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [enabledRef])

  return keys
}
