import type { ProgressState } from '../types/progress'

export function emptyState(): ProgressState {
  return { streak: { current: 0, longest: 0 }, lessons: {} }
}

const keyFor = (identityId: string) => `codetracer.progress.${identityId}`

export function loadLocal(identityId: string): ProgressState {
  try {
    const raw = localStorage.getItem(keyFor(identityId))
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as ProgressState
    return { ...emptyState(), ...parsed }
  } catch {
    return emptyState()
  }
}

export function saveLocal(identityId: string, state: ProgressState): void {
  try {
    localStorage.setItem(keyFor(identityId), JSON.stringify(state))
  } catch {
    // ignore quota / availability errors in the MVP
  }
}

export function removeLocal(identityId: string): void {
  try {
    localStorage.removeItem(keyFor(identityId))
  } catch {
    // ignore availability errors in the MVP
  }
}
