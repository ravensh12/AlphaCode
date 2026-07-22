import { useSyncExternalStore } from 'react'
import type { RealmId } from '../../../types/curriculum'
import type { DistrictSnapshot } from './streamerCore'
import { getDistrictStore, subscribeDistricts } from './DistrictStreamer'

const IDLE_SNAPSHOT: DistrictSnapshot = { status: 'idle', bundle: null }

/**
 * Streamed assets for one realm district. Non-suspending and tear-free
 * (useSyncExternalStore): returns `{ status, bundle }` where `bundle` holds
 * the loaded manifest assets once status is 'ready'. Snapshots keep stable
 * identity between transitions, so this is safe to call from components that
 * render every frame.
 *
 *   const { status, bundle } = useDistrictAssets('realm1')
 *   const brick = bundle?.assets.find((a) => a.entry.id === 'tex-brick-diff')
 */
export function useDistrictAssets(district: RealmId): DistrictSnapshot {
  return useSyncExternalStore(
    subscribeDistricts,
    () => getDistrictStore()?.getSnapshot(district) ?? IDLE_SNAPSHOT,
    () => IDLE_SNAPSHOT,
  )
}
