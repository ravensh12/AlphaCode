import { describe, expect, it } from 'vitest'
import {
  bossProjectileDamageScale,
  MAX_TIER_WEAPON,
  resolveEquippedWeapon,
  weaponPelletYaw,
  type WeaponRunKind,
} from './weaponProfile'

describe('always-equipped weapon resolution', () => {
  it('preserves the former top-tier Pattern Cannon profile exactly', () => {
    expect(MAX_TIER_WEAPON).toEqual({
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
    expect(Object.isFrozen(MAX_TIER_WEAPON)).toBe(true)
  })

  it.each<WeaponRunKind>(['default', 'resume', 'guest', 'boss'])(
    'equips the same max-tier profile for a %s run',
    (run) => {
      expect(resolveEquippedWeapon({ run })).toBe(MAX_TIER_WEAPON)
    },
  )

  it('ignores legacy levels, saved loadouts, and temporary pickup tiers', () => {
    const legacyInputs = [
      {
        run: 'resume' as const,
        playerLevel: 1,
        legacyLoadout: { name: 'Rusty Slinger', level: 0 },
        legacyPickupTier: 0,
      },
      {
        run: 'resume' as const,
        playerLevel: 35,
        legacyLoadout: { name: 'Pulse Rifle', level: 4 },
        legacyPickupTier: 99,
      },
      {
        run: 'guest' as const,
        playerLevel: Number.MAX_SAFE_INTEGER,
        legacyLoadout: 'corrupt-save-value',
        legacyPickupTier: Number.NaN,
      },
    ]

    for (const input of legacyInputs) {
      expect(resolveEquippedWeapon(input)).toBe(MAX_TIER_WEAPON)
    }
  })

  it('keeps every pellet inside the established fan and spread bounds', () => {
    expect(weaponPelletYaw(0, 0)).toBeCloseTo(-0.105)
    expect(weaponPelletYaw(1, 0.5)).toBe(0)
    expect(weaponPelletYaw(2, 1)).toBeCloseTo(0.105)
  })

  it.each([0.14, 0.15, 0.16])(
    'preserves the prior %.2fs boss-gun DPS instead of multiplying it by the fan',
    (previousCooldown) => {
      const scale = bossProjectileDamageScale(previousCooldown)
      const balancedDps =
        (MAX_TIER_WEAPON.damage *
          scale *
          MAX_TIER_WEAPON.pellets) /
        MAX_TIER_WEAPON.cooldown

      expect(balancedDps).toBeCloseTo(1 / previousCooldown)
      expect(
        MAX_TIER_WEAPON.damage * scale,
      ).toBeLessThan(MAX_TIER_WEAPON.damage)
    },
  )
})
