/**
 * The former highest gun tier, now equipped for every run.
 *
 * Weapon resolution deliberately ignores progression, guest status, pickups,
 * and legacy saved loadouts. Keeping this as one frozen profile prevents the
 * overworld and boss arenas from quietly drifting back into separate tiers.
 */
export type WeaponProfile = Readonly<{
  id: 'pattern-cannon'
  name: 'Pattern Cannon'
  /** Seconds between trigger pulls. */
  cooldown: number
  /** Raw damage carried by each projectile. */
  damage: number
  /** Projectiles emitted by one trigger pull. */
  pellets: number
  /** Random yaw variance in radians. */
  spread: number
  /** Yaw separation between adjacent projectiles in radians. */
  fan: number
  /** Auto-aim cone, stored as cos(half-angle). */
  aimConeCos: number
  /** Projectile travel speed in metres per second. */
  boltSpeed: number
}>

export const MAX_TIER_WEAPON: WeaponProfile = Object.freeze({
  id: 'pattern-cannon',
  name: 'Pattern Cannon',
  cooldown: 0.11,
  damage: 3,
  pellets: 3,
  spread: 0.035,
  fan: 0.07,
  aimConeCos: Math.cos(0.16),
  boltSpeed: 118,
})

export type WeaponRunKind = 'default' | 'resume' | 'guest' | 'boss'

export type WeaponResolutionInput = Readonly<{
  run?: WeaponRunKind
  playerLevel?: number
  legacyLoadout?: unknown
  legacyPickupTier?: unknown
}>

/**
 * Resolve the equipped gun for any entry path.
 *
 * The argument is intentionally unused: old saves may still contain a tier,
 * pickup, or loadout, but those values must never weaken or strengthen the gun.
 */
export function resolveEquippedWeapon(
  _input: WeaponResolutionInput = {},
): WeaponProfile {
  return MAX_TIER_WEAPON
}

/** Deterministic fan offset plus the profile's bounded random spread. */
export function weaponPelletYaw(
  pelletIndex: number,
  random01 = Math.random(),
  weapon: WeaponProfile = MAX_TIER_WEAPON,
): number {
  const fanOffset =
    (pelletIndex - (weapon.pellets - 1) / 2) * weapon.fan
  const jitter = (Math.min(1, Math.max(0, random01)) * 2 - 1) * weapon.spread
  return fanOffset + jitter
}

/**
 * Boss armor multiplier that preserves an arena's prior ranged DPS while the
 * Pattern Cannon supplies its real cadence, raw damage, and three-bolt fan.
 */
export function bossProjectileDamageScale(
  previousCooldown: number,
  previousDamage = 1,
  weapon: WeaponProfile = MAX_TIER_WEAPON,
): number {
  const previousDps = previousDamage / previousCooldown
  const weaponDps = (weapon.damage * weapon.pellets) / weapon.cooldown
  return previousDps / weaponDps
}
