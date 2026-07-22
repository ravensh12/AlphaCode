import type { ProgressState } from '../types/progress'
import type { BadgeCounts } from '../content/badges'
import {
  badgeCountsFromEarnedList,
  emptyBadgeCounts,
  normalizeBadgeCounts,
} from '../content/badges'
import { normalizeAcademyProgressState } from './academyProgress'

export function emptyState(): ProgressState {
  return { streak: { current: 0, longest: 0 }, lessons: {}, badgeCounts: emptyBadgeCounts() }
}

export function normalizeProgressState(
  parsed: Partial<ProgressState> & { earnedBadges?: string[] },
): ProgressState {
  const base = emptyState()
  let badgeCounts: BadgeCounts = base.badgeCounts
  if (parsed.badgeCounts) {
    badgeCounts = normalizeBadgeCounts(parsed.badgeCounts)
  } else if (Array.isArray(parsed.earnedBadges)) {
    badgeCounts = badgeCountsFromEarnedList(parsed.earnedBadges)
  }
  return {
    ...base,
    ...parsed,
    streak: { ...base.streak, ...parsed.streak },
    lessons: parsed.lessons ?? {},
    badgeCounts,
    academyProgress:
      parsed.academyProgress === undefined
        ? undefined
        : normalizeAcademyProgressState(parsed.academyProgress),
  }
}

const keyFor = (identityId: string) => `alphacode.progress.${identityId}`

export type ProgressStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>

export class ProgressStorageError extends Error {
  override readonly name = 'ProgressStorageError'

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

export type ProgressLoadResult =
  | { readonly status: 'ok'; readonly state: ProgressState }
  | {
      readonly status: 'error'
      readonly state: ProgressState
      readonly error: ProgressStorageError
      readonly originalPreserved: true
    }

export type ProgressWriteResult =
  | { readonly status: 'ok' }
  | {
      readonly status: 'error'
      readonly error: ProgressStorageError
      readonly originalPreserved: boolean
    }

type QuarantinedProgress = {
  readonly raw: string | null
  readonly unreadable: boolean
}

const quarantinedByStorage = new WeakMap<
  ProgressStorage,
  Map<string, QuarantinedProgress>
>()

const progressStorage = (storage?: ProgressStorage): ProgressStorage =>
  storage ?? globalThis.localStorage

function quarantineMap(storage: ProgressStorage): Map<string, QuarantinedProgress> {
  let entries = quarantinedByStorage.get(storage)
  if (!entries) {
    entries = new Map()
    quarantinedByStorage.set(storage, entries)
  }
  return entries
}

function decodeProgress(raw: string): ProgressState {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Local progress must be a JSON object')
  }
  return normalizeProgressState(
    parsed as Partial<ProgressState> & { earnedBadges?: string[] },
  )
}

export function loadLocalResult(
  identityId: string,
  storage?: ProgressStorage,
): ProgressLoadResult {
  let target: ProgressStorage
  try {
    target = progressStorage(storage)
  } catch (error) {
    return {
      status: 'error',
      state: emptyState(),
      error: new ProgressStorageError(
        'Local progress storage is unavailable',
        error,
      ),
      originalPreserved: true,
    }
  }

  const key = keyFor(identityId)
  let raw: string | null
  try {
    raw = target.getItem(key)
  } catch (error) {
    quarantineMap(target).set(key, { raw: null, unreadable: true })
    return {
      status: 'error',
      state: emptyState(),
      error: new ProgressStorageError('Unable to read local progress', error),
      originalPreserved: true,
    }
  }
  if (raw === null) {
    quarantineMap(target).delete(key)
    return { status: 'ok', state: emptyState() }
  }

  try {
    const state = decodeProgress(raw)
    quarantineMap(target).delete(key)
    return { status: 'ok', state }
  } catch (error) {
    quarantineMap(target).set(key, { raw, unreadable: false })
    return {
      status: 'error',
      state: emptyState(),
      error: new ProgressStorageError(
        'Local progress is invalid; original data was preserved',
        error,
      ),
      originalPreserved: true,
    }
  }
}

export function loadLocal(
  identityId: string,
  storage?: ProgressStorage,
): ProgressState {
  return loadLocalResult(identityId, storage).state
}

export function saveLocal(
  identityId: string,
  state: ProgressState,
  storage?: ProgressStorage,
): ProgressWriteResult {
  let target: ProgressStorage
  try {
    target = progressStorage(storage)
  } catch (error) {
    return {
      status: 'error',
      error: new ProgressStorageError(
        'Local progress storage is unavailable',
        error,
      ),
      originalPreserved: true,
    }
  }

  const key = keyFor(identityId)
  const quarantined = quarantineMap(target).get(key)
  if (quarantined) {
    if (quarantined.unreadable) {
      return {
        status: 'error',
        error: new ProgressStorageError(
          'Refused to overwrite unreadable local progress',
        ),
        originalPreserved: true,
      }
    }
    try {
      const current = target.getItem(key)
      if (current === quarantined.raw) {
        return {
          status: 'error',
          error: new ProgressStorageError(
            'Refused to overwrite invalid local progress',
          ),
          originalPreserved: true,
        }
      }
      if (current !== null) decodeProgress(current)
      quarantineMap(target).delete(key)
    } catch (error) {
      return {
        status: 'error',
        error: new ProgressStorageError(
          'Refused to overwrite unverified local progress',
          error,
        ),
        originalPreserved: true,
      }
    }
  }

  try {
    const existing = target.getItem(key)
    if (existing !== null) decodeProgress(existing)
    target.setItem(key, JSON.stringify(state))
    return { status: 'ok' }
  } catch (error) {
    return {
      status: 'error',
      error: new ProgressStorageError(
        'Unable to persist local progress',
        error,
      ),
      originalPreserved: true,
    }
  }
}

