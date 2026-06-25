import { GATES_PER_WORLD } from '../components/game3d/layout'

/** A level = one lesson (6 total). Each level has 3 checkpoints + a boss. */
export const CHECKPOINTS_PER_LEVEL = GATES_PER_WORLD

export function levelNumber(worldIndex: number): number {
  return worldIndex + 1
}

export function checkpointNumber(stageIndex: number): number {
  return stageIndex + 1
}

/** e.g. "Level 1 · Checkpoint 2 of 3" or "Level 1 · Boss" */
export function questPositionLabel(
  worldIndex: number,
  stageIndex: number,
  atBoss: boolean,
): string {
  const level = levelNumber(worldIndex)
  if (atBoss) return `Level ${level} · Boss`
  return `Level ${level} · Checkpoint ${checkpointNumber(stageIndex)} of ${CHECKPOINTS_PER_LEVEL}`
}
