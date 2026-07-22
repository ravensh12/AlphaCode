import type { DemoGuaranteeSimulation } from '../types/demoGuarantee'
import {
  mergeDemoGuaranteeSimulations,
  parseDemoGuaranteeSimulation,
} from './demoGuarantee'

export interface DemoGuaranteeStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export class DemoGuaranteeStorageError extends Error {
  override readonly name = 'DemoGuaranteeStorageError'

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

const identityKey = (identityId: string): string => {
  const trimmed = identityId.trim()
  if (!trimmed) throw new Error('identityId must not be empty')
  return trimmed
}

export const demoGuaranteeStorageKey = (identityId: string): string =>
  `alphacode.demo-guarantee.v1.${encodeURIComponent(identityKey(identityId))}`

function browserStorage(): DemoGuaranteeStorageLike {
  try {
    if (!globalThis.localStorage) {
      throw new Error('localStorage is unavailable')
    }
    return globalThis.localStorage
  } catch (error) {
    throw new DemoGuaranteeStorageError(
      'Local demo simulation storage is unavailable',
      error,
    )
  }
}

export class LocalDemoGuaranteeStore {
  constructor(private readonly suppliedStorage?: DemoGuaranteeStorageLike) {}

  private storage(): DemoGuaranteeStorageLike {
    return this.suppliedStorage ?? browserStorage()
  }

  private readRaw(identityId: string): string | null {
    try {
      return this.storage().getItem(demoGuaranteeStorageKey(identityId))
    } catch (error) {
      if (error instanceof DemoGuaranteeStorageError) throw error
      throw new DemoGuaranteeStorageError(
        'Unable to read the local demo simulation',
        error,
      )
    }
  }

  private decode(
    raw: string,
    preservedMessage: string,
  ): DemoGuaranteeSimulation {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch (error) {
      throw new DemoGuaranteeStorageError(preservedMessage, error)
    }
    try {
      return parseDemoGuaranteeSimulation(parsed)
    } catch (error) {
      throw new DemoGuaranteeStorageError(preservedMessage, error)
    }
  }

  load(identityId: string): DemoGuaranteeSimulation | null {
    const raw = this.readRaw(identityId)
    if (raw === null) return null
    return this.decode(
      raw,
      'Local demo simulation data is invalid; original data was preserved',
    )
  }

  save(
    identityId: string,
    simulation: DemoGuaranteeSimulation,
  ): DemoGuaranteeSimulation {
    let incoming: DemoGuaranteeSimulation
    try {
      incoming = parseDemoGuaranteeSimulation(simulation)
    } catch (error) {
      throw new DemoGuaranteeStorageError(
        'Refused to persist invalid demo simulation data',
        error,
      )
    }

    const raw = this.readRaw(identityId)
    const current =
      raw === null
        ? null
        : this.decode(
            raw,
            'Existing local demo simulation data is invalid; original data was preserved',
          )
    const next = current
      ? mergeDemoGuaranteeSimulations(current, incoming)
      : incoming

    let serialized: string
    try {
      serialized = JSON.stringify(next)
    } catch (error) {
      throw new DemoGuaranteeStorageError(
        'Unable to serialize the local demo simulation',
        error,
      )
    }

    try {
      this.storage().setItem(demoGuaranteeStorageKey(identityId), serialized)
    } catch (error) {
      throw new DemoGuaranteeStorageError(
        'Unable to persist the local demo simulation',
        error,
      )
    }
    return next
  }
}

export const localDemoGuaranteeStore = new LocalDemoGuaranteeStore()
