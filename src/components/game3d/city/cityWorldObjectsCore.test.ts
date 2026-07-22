import { describe, expect, it } from 'vitest'
import { emptyAcademyProgressState } from '../../../lib/academyProgress'
import { profileForTier } from '../../../lib/graphicsQuality'
import {
  ARCADE_SITE,
  COURIER_DEPOT_SITE,
  VEHICLE_PAD_SITE,
  buildCityInteractables,
  npcSite,
  photoSite,
  type CityInteractablesInput,
} from './interactables'
import {
  CITY_QUALITY_FULL,
  buildCityRenderPlan,
  resolveCityQuality,
} from './cityWorldObjectsCore'

function buildInput(
  overrides: Partial<CityInteractablesInput> = {},
): CityInteractablesInput {
  return {
    academyProgress: emptyAcademyProgressState(),
    isGuest: false,
    isShowcaseAccount: false,
    now: Date.parse('2026-07-11T12:00:00.000Z'),
    cloudEnabled: false,
    firstDeliveryDone: false,
    hasReviewHistory: false,
    ...overrides,
  }
}

describe('resolveCityQuality', () => {
  it('defaults to everything on', () => {
    expect(resolveCityQuality()).toEqual(CITY_QUALITY_FULL)
    expect(resolveCityQuality(undefined)).toEqual({
      labels: true,
      particles: true,
      gltfNpc: true,
    })
  })

  it('passes explicit boolean bundles straight through', () => {
    const custom = { labels: false, particles: true, gltfNpc: false }
    expect(resolveCityQuality(custom)).toBe(custom)
  })

  it('maps unified profiles: LOW keeps the cost floor, MEDIUM skips particles', () => {
    expect(resolveCityQuality(profileForTier('low', 1))).toEqual({
      labels: false,
      particles: false,
      gltfNpc: false,
    })
    expect(resolveCityQuality(profileForTier('medium', 1))).toEqual({
      labels: true,
      particles: false,
      gltfNpc: true,
    })
    expect(resolveCityQuality(profileForTier('high', 2))).toEqual(
      CITY_QUALITY_FULL,
    )
    expect(resolveCityQuality(profileForTier('ultra', 2))).toEqual(
      CITY_QUALITY_FULL,
    )
  })
})

describe('buildCityRenderPlan (registry → render mapping)', () => {
  it('maps the showcase registry onto every city-life object', () => {
    // Showcase opens all six districts without fabricating progress facts.
    const interactables = buildCityInteractables(
      buildInput({ isShowcaseAccount: true, hasReviewHistory: true }),
    )
    const plan = buildCityRenderPlan(interactables)

    expect(plan.npcs).toHaveLength(6)
    plan.npcs.forEach((npc, districtIndex) => {
      expect(npc.districtIndex).toBe(districtIndex)
      expect(npc.npcName.length).toBeGreaterThan(0)
      const site = npcSite(districtIndex)
      expect(npc.x).toBeCloseTo(site.x)
      expect(npc.z).toBeCloseTo(site.z)
    })

    expect(plan.arcade).toMatchObject({
      x: ARCADE_SITE.x,
      z: ARCADE_SITE.z,
      empty: false,
    })
    expect(plan.courier).toMatchObject({
      x: COURIER_DEPOT_SITE.x,
      z: COURIER_DEPOT_SITE.z,
    })
    expect(plan.vehicle).toMatchObject({
      x: VEHICLE_PAD_SITE.x,
      z: VEHICLE_PAD_SITE.z,
      locked: true, // firstDeliveryDone false
    })

    expect(plan.photos).toHaveLength(6)
    plan.photos.forEach((photo, spotIndex) => {
      expect(photo.spotIndex).toBe(spotIndex)
      const site = photoSite(spotIndex)
      expect(photo.x).toBeCloseTo(site.x)
      expect(photo.z).toBeCloseTo(site.z)
    })

    expect(plan.cityLifePresent).toBe(true)
  })

  it('reflects progress facts: empty history + first delivery', () => {
    const before = buildCityRenderPlan(
      buildCityInteractables(buildInput({ isShowcaseAccount: true })),
    )
    expect(before.arcade?.empty).toBe(true)

    const after = buildCityRenderPlan(
      buildCityInteractables(
        buildInput({ isShowcaseAccount: true, firstDeliveryDone: true }),
      ),
    )
    expect(after.vehicle?.locked).toBe(false)
  })

  it('renders no city life for guests (dojo + boss only)', () => {
    const plan = buildCityRenderPlan(
      buildCityInteractables(buildInput({ isGuest: true })),
    )
    expect(plan).toEqual({
      npcs: [],
      arcade: null,
      courier: null,
      vehicle: null,
      photos: [],
      cityLifePresent: false,
    })
  })

  it('never leaks dojo/boss/crystal targets into the plan', () => {
    const interactables = buildCityInteractables(
      buildInput({ isShowcaseAccount: true }),
    )
    expect(interactables.some(({ target }) => target.kind === 'dojo')).toBe(
      true,
    )
    expect(interactables.some(({ target }) => target.kind === 'boss')).toBe(
      true,
    )
    const plan = buildCityRenderPlan(interactables)
    const planCount =
      plan.npcs.length +
      plan.photos.length +
      (plan.arcade ? 1 : 0) +
      (plan.courier ? 1 : 0) +
      (plan.vehicle ? 1 : 0)
    const cityLifeKinds = new Set(['npc', 'arcade', 'courier', 'vehicle', 'photo'])
    expect(planCount).toBe(
      interactables.filter(({ payload }) => cityLifeKinds.has(payload.kind))
        .length,
    )
  })

  it('is deterministic for identical registries', () => {
    const interactables = buildCityInteractables(
      buildInput({ isShowcaseAccount: true }),
    )
    expect(buildCityRenderPlan(interactables)).toEqual(
      buildCityRenderPlan(interactables),
    )
  })
})
