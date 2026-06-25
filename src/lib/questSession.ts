import { CHECKPOINTS_3D, GATES_PER_WORLD, START_3D, WORLD_GATES, questDoor } from '../components/game3d/layout'

/** Session keys for the 3D quest run (tour position, not lesson mastery). */
export const TOUR_KEY = 'alphacode.tour'
export const POS_KEY = 'alphacode.quest.pos'
export const PART_DONE_KEY = 'alphacode.partDone'
export const INTRO_KEY = 'alphacode.quest.introSeen'
/** Set when the player beats the boss fight THIS run (so the tour advances). */
export const BOSS_DONE_KEY = 'alphacode.bossDone'

export type SpawnSave = { x: number; z: number; h: number }

/** Spawn at Checkpoint 1 of the given level (0-based world index). */
export function spawnAtLevel(worldIndex: number): SpawnSave {
  if (worldIndex <= 0) {
    const door = questDoor(WORLD_GATES[0][0])
    return {
      x: START_3D.x,
      z: START_3D.z,
      h: Math.atan2(door.x - START_3D.x, door.z - START_3D.z),
    }
  }
  const gate = WORLD_GATES[worldIndex][0]
  const here = questDoor(gate, 6.5)
  const nextGate =
    GATES_PER_WORLD > 1 ? WORLD_GATES[worldIndex][1] : CHECKPOINTS_3D[worldIndex].boss
  const next = questDoor(nextGate)
  return {
    x: here.x,
    z: here.z,
    h: Math.atan2(next.x - here.x, next.z - here.z),
  }
}

/**
 * Jump the guided tour to a level's Checkpoint 1 (for players who already
 * cleared earlier levels). Keeps lesson mastery; only moves the run forward.
 */
export function skipToLevel(worldIndex: number) {
  const spawn = spawnAtLevel(worldIndex)
  try {
    sessionStorage.setItem(TOUR_KEY, JSON.stringify({ world: worldIndex, stage: 0 }))
    sessionStorage.setItem(POS_KEY, JSON.stringify(spawn))
    sessionStorage.removeItem(PART_DONE_KEY)
    sessionStorage.removeItem(BOSS_DONE_KEY)
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
  } catch {
    /* ignore */
  }
}
