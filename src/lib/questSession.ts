import { GATES_PER_WORLD, START_3D, WORLD_GATES, questDoor } from '../components/game3d/layout'

/** Session keys for the 3D quest run (tour position, not lesson mastery). */
export const TOUR_KEY = 'alphacode.tour'
export const POS_KEY = 'alphacode.quest.pos'
export const PART_DONE_KEY = 'alphacode.partDone'
export const INTRO_KEY = 'alphacode.quest.introSeen'
/** Set when the player beats the boss fight THIS run (so the tour advances). */
export const BOSS_DONE_KEY = 'alphacode.bossDone'
/** Snapshot of live zombies, so the horde survives a trip to the list view. */
export const COMBAT_SNAP_KEY = 'alphacode.combat.snapshot'
/** Set when skipToLevel / placement spawns at the prev level's last checkpoint. */
export const SKIP_SPAWN_KEY = 'alphacode.quest.skipSpawn'
/**
 * Stores the level index (0-based) the player jumped to from the LIST view, so
 * the overworld greets them with a "Welcome to Level N" popup instead of the
 * full how-to-play intro (which is reserved for a fresh start / placement quiz).
 */
export const LEVEL_WELCOME_KEY = 'alphacode.quest.levelWelcome'

export type SpawnSave = { x: number; z: number; h: number }

/**
 * Where to physically spawn when the quest jumps to a given level (0-based).
 *
 * - Level 1 (index 0): start at the spawn plaza, facing its first checkpoint.
 * - Any later level N: stand at the END of the PREVIOUS level's LAST checkpoint,
 *   facing THIS level's FIRST checkpoint (which is the new objective once the
 *   tour stage is 0). e.g. placed at Level 2 → spawn at the end of
 *   Level 1 · Checkpoint 3, directed to Level 2 · Checkpoint 1.
 */
export function spawnAtLevel(worldIndex: number): SpawnSave {
  if (worldIndex <= 0) {
    const door = questDoor(WORLD_GATES[0][0])
    return {
      x: START_3D.x,
      z: START_3D.z,
      h: Math.atan2(door.x - START_3D.x, door.z - START_3D.z),
    }
  }
  // End of the previous level's last checkpoint (Checkpoint 3 of level N-1).
  const prevLastGate = WORLD_GATES[worldIndex - 1][GATES_PER_WORLD - 1]
  const here = questDoor(prevLastGate, 6.5)
  // Face this level's first checkpoint — the objective the tour points to.
  const target = questDoor(WORLD_GATES[worldIndex][0])
  return {
    x: here.x,
    z: here.z,
    h: Math.atan2(target.x - here.x, target.z - here.z),
  }
}

/**
 * Jump the guided tour to a level's Checkpoint 1 (for players who already
 * cleared earlier levels). Keeps lesson mastery; only moves the run forward.
 *
 * `welcome` distinguishes the two entry points:
 * - From the LIST view ("Skip to Level N") → the player already knows how to
 *   play, so greet them with the "Welcome to Level N" popup (intro suppressed).
 * - From the placement quiz / fresh start → show the full how-to-play intro.
 */
export function skipToLevel(worldIndex: number, opts: { welcome?: boolean } = {}) {
  const spawn = spawnAtLevel(worldIndex)
  try {
    sessionStorage.setItem(TOUR_KEY, JSON.stringify({ world: worldIndex, stage: 0 }))
    sessionStorage.setItem(POS_KEY, JSON.stringify(spawn))
    sessionStorage.setItem(SKIP_SPAWN_KEY, '1')
    sessionStorage.removeItem(PART_DONE_KEY)
    sessionStorage.removeItem(BOSS_DONE_KEY)
    sessionStorage.removeItem(COMBAT_SNAP_KEY)
    if (opts.welcome) {
      // Suppress the how-to-play intro and queue the level-welcome popup instead.
      sessionStorage.setItem(INTRO_KEY, '1')
      sessionStorage.setItem(LEVEL_WELCOME_KEY, String(worldIndex))
    } else {
      sessionStorage.removeItem(INTRO_KEY)
      sessionStorage.removeItem(LEVEL_WELCOME_KEY)
    }
  } catch {
    /* ignore */
  }
}

/** Clears in-progress tour / map position so the next visit starts at Level 1. */
export function clearQuestRun() {
  try {
    sessionStorage.removeItem(TOUR_KEY)
    sessionStorage.removeItem(POS_KEY)
    sessionStorage.removeItem(PART_DONE_KEY)
    sessionStorage.removeItem(INTRO_KEY)
    sessionStorage.removeItem(BOSS_DONE_KEY)
    sessionStorage.removeItem(COMBAT_SNAP_KEY)
    sessionStorage.removeItem(SKIP_SPAWN_KEY)
    sessionStorage.removeItem(LEVEL_WELCOME_KEY)
  } catch {
    /* ignore */
  }
}
