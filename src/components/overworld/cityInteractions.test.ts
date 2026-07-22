import { describe, expect, it } from 'vitest'
import { WORLDS } from '../../content/adventure'
import type { PlacedCrystal } from '../../lib/crystalPlacement'
import type {
  CityInteractable,
  CityInteractablePayload,
} from '../game3d/city/interactables'
import {
  COURIER_ARRIVE_RADIUS,
  chooseCourierRoute,
  courierArrived,
  courierElapsedSeconds,
  photoFileName,
  resolveCityInteraction,
  startCourierRun,
  type CityInteractContext,
} from './cityInteractions'

/* ------------------------------------------------------------- fixtures -- */

function interactable(
  payload: CityInteractablePayload,
  locked = false,
): CityInteractable {
  return {
    target: {
      key: `test-${payload.kind}`,
      world: WORLDS[0],
      kind: payload.kind,
      x: 0,
      z: 0,
      locked,
      cleared: false,
    },
    payload,
    prompt: { verb: 'Use', label: 'Test', lockedLabel: 'Locked' },
  }
}

function crystal(state: PlacedCrystal['state']): PlacedCrystal {
  return {
    id: 'crystal:problem:two-sum',
    kind: 'single',
    state,
    problemIds: ['problem:two-sum'],
    count: 1,
    worldIndex: 0,
    part: 0,
    x: 3,
    z: 4,
  }
}

const ON_FOOT: CityInteractContext = {
  hoverboardMounted: false,
  courierRunActive: false,
}
const RIDING: CityInteractContext = {
  hoverboardMounted: true,
  courierRunActive: false,
}

/* ------------------------------------------------------ E-press routing -- */

describe('resolveCityInteraction', () => {
  it('does nothing with no target on foot, dismounts with no target riding', () => {
    expect(resolveCityInteraction(null, ON_FOOT)).toEqual({
      decision: { action: 'none' },
      dismount: false,
    })
    expect(resolveCityInteraction(null, RIDING)).toEqual({
      decision: { action: 'dismountOnly' },
      dismount: true,
    })
  })

  it('blocks locked targets without dismounting', () => {
    const locked = interactable(
      { kind: 'vehicle', vehicleId: 'hover-scooter' },
      true,
    )
    expect(resolveCityInteraction(locked, RIDING)).toEqual({
      decision: { action: 'blocked' },
      dismount: false,
    })
  })

  it('routes dojo doors with their payload and dismounts a rider', () => {
    const dojo = interactable({
      kind: 'dojo',
      realmId: 'realm1',
      trackId: 'arrays-hashing',
      worldIndex: 0,
      part: 0,
      mode: 'active',
    })
    expect(resolveCityInteraction(dojo, ON_FOOT)).toEqual({
      decision: {
        action: 'enterDojo',
        realmId: 'realm1',
        trackId: 'arrays-hashing',
        worldIndex: 0,
        part: 0,
        mode: 'active',
      },
      dismount: false,
    })
    expect(resolveCityInteraction(dojo, RIDING).dismount).toBe(true)
  })

  it('routes boss doors', () => {
    const boss = interactable({ kind: 'boss', realmId: 'realm2', worldIndex: 1 })
    expect(resolveCityInteraction(boss, ON_FOOT).decision).toEqual({
      action: 'enterBoss',
      realmId: 'realm2',
      worldIndex: 1,
    })
  })

  it('harvests crystals: ripe plainly, pendingCloud with a cloud check', () => {
    const ripe = interactable({ kind: 'memoryCrystal', crystal: crystal('ripe') })
    expect(resolveCityInteraction(ripe, ON_FOOT).decision).toEqual({
      action: 'harvestCrystal',
      problemId: 'problem:two-sum',
      cloudCheck: false,
    })
    const pending = interactable({
      kind: 'memoryCrystal',
      crystal: crystal('pendingCloud'),
    })
    expect(resolveCityInteraction(pending, ON_FOOT).decision).toEqual({
      action: 'harvestCrystal',
      problemId: 'problem:two-sum',
      cloudCheck: true,
    })
  })

  it('opens arcade / NPC / photo overlays and dismounts a rider for them', () => {
    const arcade = interactable({ kind: 'arcade', empty: false })
    expect(resolveCityInteraction(arcade, ON_FOOT)).toEqual({
      decision: { action: 'openArcade' },
      dismount: false,
    })
    expect(resolveCityInteraction(arcade, RIDING).dismount).toBe(true)

    const npc = interactable({
      kind: 'npc',
      districtIndex: 2,
      realmId: 'realm3',
      trackId: 'binary-search',
      npcName: 'Pixel',
    })
    expect(resolveCityInteraction(npc, ON_FOOT).decision).toEqual({
      action: 'openNpc',
      districtIndex: 2,
      trackId: 'binary-search',
      npcName: 'Pixel',
    })

    const photo = interactable({ kind: 'photo', spotIndex: 4 })
    expect(resolveCityInteraction(photo, RIDING)).toEqual({
      decision: { action: 'openPhoto', spotIndex: 4 },
      dismount: true,
    })
  })

  it('starts a courier run when idle and cancels the active one, riding through', () => {
    const courier = interactable({ kind: 'courier', routeIds: ['r1', 'r2'] })
    expect(resolveCityInteraction(courier, RIDING)).toEqual({
      decision: { action: 'startCourier' },
      dismount: false,
    })
    expect(
      resolveCityInteraction(courier, {
        hoverboardMounted: true,
        courierRunActive: true,
      }),
    ).toEqual({ decision: { action: 'cancelCourier' }, dismount: false })
  })

  it('toggles the hoverboard at its pad', () => {
    const vehicle = interactable({ kind: 'vehicle', vehicleId: 'hover-scooter' })
    expect(resolveCityInteraction(vehicle, ON_FOOT)).toEqual({
      decision: { action: 'mountBoard' },
      dismount: false,
    })
    expect(resolveCityInteraction(vehicle, RIDING)).toEqual({
      decision: { action: 'dismountBoard' },
      dismount: true,
    })
  })
})

/* -------------------------------------------------- courier run machine -- */

describe('courier run machine', () => {
  it('rotates routes by lifetime deliveries and survives odd counts', () => {
    const routes = ['a', 'b', 'c']
    expect(chooseCourierRoute(routes, 0)).toBe('a')
    expect(chooseCourierRoute(routes, 1)).toBe('b')
    expect(chooseCourierRoute(routes, 5)).toBe('c')
    expect(chooseCourierRoute(routes, -1)).toBe('c')
    expect(chooseCourierRoute([], 3)).toBeNull()
  })

  it('starts a run with the chosen route and stamps the start time', () => {
    expect(startCourierRun([], 0, 1000)).toBeNull()
    expect(startCourierRun(['a', 'b'], 3, 1000)).toEqual({
      routeId: 'b',
      startedAt: 1000,
    })
  })

  it('measures elapsed seconds, clamped at zero', () => {
    const run = { routeId: 'a', startedAt: 10_000 }
    expect(courierElapsedSeconds(run, 10_000)).toBe(0)
    expect(courierElapsedSeconds(run, 72_500)).toBeCloseTo(62.5, 6)
    expect(courierElapsedSeconds(run, 9_000)).toBe(0)
  })

  it('arrives exactly at the ring boundary and not a step before', () => {
    const dest = { x: 10, z: -20 }
    expect(courierArrived(dest, 10, -20)).toBe(true)
    expect(
      courierArrived(dest, 10 + COURIER_ARRIVE_RADIUS, -20),
    ).toBe(true)
    expect(
      courierArrived(dest, 10 + COURIER_ARRIVE_RADIUS + 0.01, -20),
    ).toBe(false)
    expect(courierArrived(dest, 12, -18, 1)).toBe(false)
  })
})

/* ------------------------------------------------------------ photo mode -- */

describe('photoFileName', () => {
  const WHEN = new Date(2026, 6, 12, 1, 42, 5) // local 2026-07-12 01:42:05

  it('is deterministic, 1-based, and filesystem-safe', () => {
    expect(photoFileName(2, null, WHEN)).toBe(
      'alphacode-photo-spot3-20260712-014205.png',
    )
  })

  it('folds a selected frame id into the name', () => {
    expect(photoFileName(0, 'frame:neon-grid', WHEN)).toBe(
      'alphacode-photo-spot1-frame-neon-grid-20260712-014205.png',
    )
  })
})
