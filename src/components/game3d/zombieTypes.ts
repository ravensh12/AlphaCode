import type * as THREE from 'three'

/* Shared zombie sim/render contract: the CombatSystem owns the simulation and
 * mutates these slots; the ZombieHorde renderer derives clips/poses from them.
 * Kept in its own module so the two never import each other. */

export type ZombieSlot = {
  active: boolean
  state: 'walk' | 'die'
  pos: THREE.Vector3
  facing: number
  hp: number
  dieAt: number
  /** What killed it — picks the death visual (fall vs punch vs sliced de-rez). */
  dieHow: 'shot' | 'contact' | 'dash'
  /** Time of the last non-fatal arrow hit, for a stagger + pop. */
  hitAt: number
  /** Time the zombie spawned, for a rise-from-the-ground entrance. */
  bornAt: number
  seed: number
  /** Which breed this is — drives speed, toughness, size, colour + contact damage. */
  variant: number
  /** Spitters/brutes: clock time the next ranged shot / slam may begin. */
  cd: number
  /** >0 while winding up a telegraphed attack (acid charge or brute slam); the
   *  attack resolves at `castAt + windup`. 0 = not casting. */
  castAt: number
}

export const VAR_NORMAL = 0 // green shambler — the baseline
export const VAR_RUNNER = 1 // lean, sickly-yellow sprinter: very fast, very fragile
export const VAR_BRUTE = 2 // bloated dark-crimson tank: slow, huge, soaks damage, hits hard
export const VAR_MUTANT = 3 // glowing toxic mutant: quick, lunges, tougher than it looks
export const VAR_SPITTER = 4 // purple caster: hangs back and lobs acid bolts you must dodge
export const VAR_GLITCH = 5 // cyan "knowledge glitch": killing it triggers a concept question

export type VariantDef = {
  speedMul: number
  hpMul: number
  hpAdd: number
  scale: number
  /** Hearts removed when this breed reaches the player. */
  dmg: number
  /** Walk-cycle speed multiplier (brutes lumber, runners scramble). */
  gait: number
  /** Does it put on a closing burst of speed when it gets near? */
  lunge: boolean
  /** Ranged caster — holds its distance and fires acid bolts instead of rushing. */
  ranged: boolean
}

export const VARIANTS: VariantDef[] = [
  { speedMul: 1.0, hpMul: 1.0, hpAdd: 0, scale: 1.0, dmg: 1, gait: 1.0, lunge: false, ranged: false },
  { speedMul: 1.9, hpMul: 0.5, hpAdd: -1, scale: 0.82, dmg: 1, gait: 1.9, lunge: true, ranged: false },
  { speedMul: 0.58, hpMul: 2.4, hpAdd: 5, scale: 1.55, dmg: 2, gait: 0.64, lunge: false, ranged: false },
  { speedMul: 1.4, hpMul: 1.3, hpAdd: 1, scale: 1.06, dmg: 1, gait: 1.35, lunge: true, ranged: false },
  { speedMul: 0.95, hpMul: 1.1, hpAdd: 1, scale: 0.98, dmg: 1, gait: 1.0, lunge: false, ranged: true },
  // Glitch carrier — slow, conspicuous, tanky so the player must commit to it.
  { speedMul: 0.7, hpMul: 2.0, hpAdd: 4, scale: 1.25, dmg: 1, gait: 1.1, lunge: false, ranged: false },
]

/* Timings shared by the sim (gameplay) and the renderer (animation mapping). */
export const DIE_DURATION = 1.1
export const STAGGER_TIME = 0.22 // brief freeze after an arrow connects
export const SPAWN_RISE = 0.5 // seconds to rise out of the ground
/** Seconds the corpse's Death clip plays before the de-rez dissolve starts. */
export const DEATH_FALL = 0.72
/** Seconds for the glitch de-rez dissolve (after the fall). */
export const DEREZ_TIME = 0.38
export const SPIT_WINDUP = 0.42 // spitter acid charge telegraph
export const SLAM_WINDUP = 0.7 // brute slam telegraph
