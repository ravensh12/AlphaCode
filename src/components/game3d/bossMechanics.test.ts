import { describe, expect, it } from 'vitest'
import {
  ARCHITECT_SEALS,
  ARCHITECT_SIGILS,
  BRACKET,
  bracketShoot,
  bracketShotValid,
  bracketTargetIndex,
  createBracketState,
  createGateState,
  createHiderState,
  createMarkState,
  createMirrorState,
  createSphinxState,
  createTwinKeyState,
  GATE,
  gateDash,
  gateFlashOn,
  HIDER,
  hiderPing,
  hiderRealSignal,
  isOpener,
  MARK,
  markDashTransfer,
  MECH_SPECS,
  mechanicForVariant,
  MIRROR,
  mirrorPoint,
  mirrorReflect,
  rollBracketNodes,
  rollSphinxTiles,
  SPHINX,
  sphinxNextValue,
  sphinxRouteLength,
  sphinxStep,
  sphinxTileAt,
  tickBracket,
  tickGate,
  tickHider,
  tickMark,
  tickMirror,
  tickSphinx,
  tickTwinKey,
  TWINKEY,
  twinStrike,
  WARD_CHIP_MUL,
  type BracketChar,
  type MechEvent,
} from './bossMechanics'

/** Deterministic rng from a fixed sequence (repeats when exhausted). */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

const types = (events: MechEvent[]) => events.map((e) => e.type)

describe('mechanic registry', () => {
  it('maps the six realm variants to six distinct mechanics', () => {
    const ids = [0, 1, 2, 3, 4, 5].map(mechanicForVariant)
    expect(ids).toEqual(['hider', 'mirror', 'twinkey', 'gatekeeper', 'bracket', 'sphinx'])
    expect(new Set(ids).size).toBe(6)
  })

  it('every mechanic ships intro copy and a controls line', () => {
    for (const id of ['hider', 'mirror', 'twinkey', 'gatekeeper', 'bracket', 'sphinx'] as const) {
      const spec = MECH_SPECS[id]
      expect(spec.title.length).toBeGreaterThan(3)
      expect(spec.lines).toHaveLength(2)
      expect(spec.controls.length).toBeGreaterThan(10)
    }
  })
})

/* ------------------------------------------------------------- Hider */

describe('hider — signal lock', () => {
  it('starts cloaked with one real signal among three', () => {
    const s = createHiderState(seqRng([0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7]))
    expect(s.phase).toBe('cloak')
    expect(s.signals).toHaveLength(HIDER.signals)
    expect(s.signals.filter((x) => x.real)).toHaveLength(1)
  })

  it('pinging near the real signal opens the reveal window', () => {
    const s = createHiderState(seqRng([0.5]))
    const real = hiderRealSignal(s)
    const events = hiderPing(s, real.x + 0.5, real.z - 0.5)
    expect(types(events)).toContain('open')
    expect(s.phase).toBe('revealed')
    expect(s.windowT).toBeCloseTo(HIDER.revealDur)
  })

  it('pinging a decoy spawns adds and removes that decoy', () => {
    const s = createHiderState(seqRng([0.5]))
    const decoy = s.signals.find((x) => !x.real)!
    const before = s.signals.length
    const events = hiderPing(s, decoy.x, decoy.z)
    expect(types(events)).toEqual(['mistake', 'adds'])
    expect(s.signals.length).toBe(before - 1)
    expect(s.phase).toBe('cloak')
  })

  it('pinging empty ground whiffs (no reveal, cooldown spent)', () => {
    const s = createHiderState(seqRng([0.5]))
    const events = hiderPing(s, 99, 99)
    expect(types(events)).toEqual(['mistake'])
    expect(s.pingCd).toBeGreaterThan(0)
    // Cooldown blocks an immediate re-ping.
    const real = hiderRealSignal(s)
    expect(hiderPing(s, real.x, real.z)).toEqual([])
  })

  it('reveal window closes and reshuffles signals', () => {
    const s = createHiderState(seqRng([0.5]))
    const real = hiderRealSignal(s)
    hiderPing(s, real.x, real.z)
    const events = tickHider(s, HIDER.revealDur + 0.01, seqRng([0.3]))
    expect(types(events)).toEqual(['close', 'shuffle'])
    expect(s.phase).toBe('cloak')
  })

  it('cloaked signals reshuffle on a cadence', () => {
    const s = createHiderState(seqRng([0.5]))
    const events = tickHider(s, HIDER.shuffleEvery + 0.01, seqRng([0.9]))
    expect(types(events)).toEqual(['shuffle'])
  })
})

/* ------------------------------------------------------------ Mirror */

describe('mirror mimic — broken reflection', () => {
  it('reflects the player through the arena center', () => {
    expect(mirrorPoint(4, -7)).toEqual({ x: -4, z: 7 })
    expect(mirrorPoint(0, 0)).toEqual({ x: -0, z: -0 })
  })

  it('detonating the zone on the mimic shatters the mirror', () => {
    const s = createMirrorState(seqRng([0.25]))
    const z = s.zone!
    const events = tickMirror(s, MIRROR.zoneFuse + 0.01, z.x, z.z)
    expect(types(events)).toEqual(['open'])
    expect(s.guard).toBe(false)
    expect(s.windowT).toBeCloseTo(MIRROR.shatterDur)
  })

  it('detonating with the mimic elsewhere is a miss and respawns the zone', () => {
    const s = createMirrorState(seqRng([0.25]))
    const events = tickMirror(s, MIRROR.zoneFuse + 0.01, 99, 99)
    expect(types(events)).toEqual(['mistake', 'shuffle'])
    expect(s.guard).toBe(true)
    expect(s.zone).toBeNull()
    const respawn = tickMirror(s, MIRROR.zoneRespawn + 0.01, 0, 0, seqRng([0.7]))
    expect(types(respawn)).toEqual(['shuffle'])
    expect(s.zone).not.toBeNull()
  })

  it('the shatter window closes back to guard', () => {
    const s = createMirrorState(seqRng([0.25]))
    const z = s.zone!
    tickMirror(s, MIRROR.zoneFuse + 0.01, z.x, z.z)
    const events = tickMirror(s, MIRROR.shatterDur + 0.01, 0, 0)
    expect(types(events)).toEqual(['close'])
    expect(s.guard).toBe(true)
  })

  it('shots into the guarded mirror reflect back on a cooldown', () => {
    const s = createMirrorState(seqRng([0.25]))
    const first = mirrorReflect(s, 3, -4)
    expect(types(first)).toEqual(['adds', 'mistake'])
    expect(first[0]).toEqual({ type: 'adds', count: 1, x: 3, z: -4 })
    expect(mirrorReflect(s, 3, -4)).toEqual([]) // cooldown
    tickMirror(s, MIRROR.reflectCooldown + 0.01, 0, 0)
    expect(types(mirrorReflect(s, 0, 0))).toEqual(['adds', 'mistake'])
  })

  it('never reflects while the mirror is shattered', () => {
    const s = createMirrorState(seqRng([0.25]))
    const z = s.zone!
    tickMirror(s, MIRROR.zoneFuse + 0.01, z.x, z.z)
    expect(mirrorReflect(s, 0, 0)).toEqual([])
  })
})

/* ----------------------------------------------------------- TwinKey */

describe('twin-key golem — sequenced twin locks', () => {
  /** Advance to the 'first' arm with a deterministic first side. */
  function armed(first: 'L' | 'R' = 'L') {
    const s = createTwinKeyState(TWINKEY, seqRng([first === 'L' ? 0.1 : 0.9]))
    tickTwinKey(s, TWINKEY.cycle + 0.01, seqRng([first === 'L' ? 0.1 : 0.9]))
    expect(s.phase).toBe('first')
    expect(s.firstSide).toBe(first)
    return s
  }

  it('arms the FIRST lock after the cycle and cues it', () => {
    const s = createTwinKeyState(TWINKEY, seqRng([0.1]))
    const events = tickTwinKey(s, TWINKEY.cycle + 0.01, seqRng([0.1]))
    expect(types(events)).toEqual(['shuffle'])
    expect(s.phase).toBe('first')
  })

  it('the full sequence (glowing lock → charge → twin) opens the window', () => {
    const s = armed('L')
    expect(types(twinStrike(s, 'L'))).toEqual(['progress'])
    expect(s.phase).toBe('charge')
    const chargeCue = tickTwinKey(s, TWINKEY.chargeDelay + 0.01)
    expect(types(chargeCue)).toEqual(['shuffle'])
    expect(s.phase).toBe('second')
    expect(types(twinStrike(s, 'R'))).toEqual(['open'])
    expect(s.windowT).toBeCloseTo(TWINKEY.windowDur)
  })

  it('MASHING Q+E together always fails (the second lock is still charging)', () => {
    const s = armed('L')
    twinStrike(s, 'L')
    const events = twinStrike(s, 'R') // same-instant mash
    expect(types(events)).toEqual(['mistake', 'heal'])
    expect(events[0]).toEqual({ type: 'mistake', reason: 'too-early' })
    expect(s.phase).toBe('idle')
    expect(s.windowT).toBe(0)
  })

  it('striking the dormant twin first is punished', () => {
    const s = armed('L')
    const events = twinStrike(s, 'R')
    expect(types(events)).toEqual(['mistake', 'heal'])
    expect(events[0]).toEqual({ type: 'mistake', reason: 'wrong-lock' })
    expect(s.phase).toBe('idle')
  })

  it('missing the second-strike link regenerates the golem', () => {
    const s = armed('L')
    twinStrike(s, 'L')
    tickTwinKey(s, TWINKEY.chargeDelay + 0.01)
    const events = tickTwinKey(s, TWINKEY.link + 0.01)
    expect(types(events)).toEqual(['mistake', 'heal'])
    expect(events[1]).toEqual({ type: 'heal', amount: TWINKEY.regenHeal })
    expect(s.phase).toBe('idle')
  })

  it('striking while nothing is armed is a punished mistake', () => {
    const s = createTwinKeyState(TWINKEY, seqRng([0.1]))
    expect(types(twinStrike(s, 'L'))).toEqual(['mistake'])
  })

  it('re-tapping the already-struck lock is ignored (no cheese)', () => {
    const s = armed('L')
    twinStrike(s, 'L')
    expect(twinStrike(s, 'L')).toEqual([])
    tickTwinKey(s, TWINKEY.chargeDelay + 0.01)
    expect(twinStrike(s, 'L')).toEqual([])
    expect(s.windowT).toBe(0)
  })

  it('an unengaged first-lock window expires quietly (no free heal-farm)', () => {
    const s = armed('L')
    const events = tickTwinKey(s, TWINKEY.armDur + 0.01)
    expect(events).toEqual([])
    expect(s.phase).toBe('idle')
  })

  it('window closes and the cycle restarts', () => {
    const s = armed('L')
    twinStrike(s, 'L')
    tickTwinKey(s, TWINKEY.chargeDelay + 0.01)
    twinStrike(s, 'R')
    const events = tickTwinKey(s, TWINKEY.windowDur + 0.01)
    expect(types(events)).toEqual(['close'])
    expect(s.phase).toBe('idle')
  })
})

/* -------------------------------------------------------- Gatekeeper */

describe('gatekeeper — perfect passage', () => {
  function windupState() {
    const s = createGateState()
    tickGate(s, GATE.idle + 0.01, 5, false)
    return s
  }

  it('cycles idle → windup with a cue', () => {
    const s = createGateState()
    const events = tickGate(s, GATE.idle + 0.01, 5, false)
    expect(types(events)).toEqual(['shuffle'])
    expect(s.phase).toBe('windup')
  })

  it('the flash only lights in the final window of the windup', () => {
    const s = windupState()
    expect(gateFlashOn(s)).toBe(false)
    tickGate(s, GATE.windup - GATE.flash + 0.01, 5, false)
    expect(gateFlashOn(s)).toBe(true)
  })

  it('dashing early is spent and does not stagger', () => {
    const s = windupState()
    expect(gateDash(s, 5)).toBe('early')
    // Second press in the same windup is a free dash (already spent).
    expect(gateDash(s, 5)).toBe('free')
    const events = tickGate(s, GATE.windup + 0.01, 5, false)
    expect(types(events)).toEqual(['zap', 'mistake'])
  })

  it('dashing on the flash within range is perfect and opens the stagger', () => {
    const s = windupState()
    tickGate(s, GATE.windup - GATE.flash + 0.01, 5, false)
    expect(gateDash(s, 5)).toBe('perfect')
    const events = tickGate(s, GATE.flash, 5, true)
    expect(types(events)).toEqual(['open'])
    expect(s.phase).toBe('stagger')
    expect(s.windowT).toBeGreaterThan(0)
  })

  it('dashing on the flash but too far away cannot pass', () => {
    const s = windupState()
    tickGate(s, GATE.windup - GATE.flash + 0.01, 5, false)
    expect(gateDash(s, GATE.passRange + 1)).toBe('too-far')
  })

  it('the slam misses players outside its radius', () => {
    const s = windupState()
    const events = tickGate(s, GATE.windup + 0.01, GATE.slamRadius + 2, false)
    expect(events).toEqual([])
    expect(s.phase).toBe('idle')
  })

  it('the stagger window closes back to idle', () => {
    const s = windupState()
    tickGate(s, GATE.windup - GATE.flash + 0.01, 5, false)
    gateDash(s, 5)
    tickGate(s, GATE.flash, 5, true)
    const events = tickGate(s, GATE.staggerDur + 0.01, 5, false)
    expect(types(events)).toEqual(['close'])
    expect(s.phase).toBe('idle')
  })

  it('dashing outside a windup is just a free dodge', () => {
    const s = createGateState()
    expect(gateDash(s, 5)).toBe('free')
  })
})

/* ----------------------------------------------------------- Bracket */

describe('bracket beast — match the pairs', () => {
  it('classifies openers and closers', () => {
    expect(isOpener('(')).toBe(true)
    expect(isOpener('{')).toBe(true)
    expect(isOpener(']')).toBe(false)
  })

  it('validates the classic stack rule', () => {
    expect(bracketShotValid([], '(')).toBe(true)
    expect(bracketShotValid([], ')')).toBe(false)
    expect(bracketShotValid(['('], ')')).toBe(true)
    expect(bracketShotValid(['(', '['], ')')).toBe(false)
    expect(bracketShotValid(['(', '['], ']')).toBe(true)
  })

  it('rolls all six labels exactly once', () => {
    const nodes = rollBracketNodes(seqRng([0.1, 0.9, 0.3, 0.7, 0.5, 0.2, 0.8]))
    expect(nodes.map((n) => n.label).sort()).toEqual(['(', ')', '[', ']', '{', '}'])
    expect(nodes.every((n) => n.alive)).toBe(true)
  })

  it('a full valid clear opens the damage window', () => {
    const s = createBracketState(seqRng([0.5]))
    // Destroy in a guaranteed-valid order: all openers, then matching closers.
    const order: BracketChar[] = ['(', '[', '{', '}', ']', ')']
    for (const label of order) {
      const i = s.nodes.findIndex((n) => n.alive && n.label === label)
      const events = bracketShoot(s, i, seqRng([0.5]))
      expect(types(events)).toContain('progress')
    }
    expect(s.windowT).toBeCloseTo(BRACKET.windowDur)
    expect(s.stack).toEqual([])
  })

  it('a wrong-order shot heals the beast and reshuffles', () => {
    const s = createBracketState(seqRng([0.5]))
    const i = s.nodes.findIndex((n) => n.label === ')')
    const events = bracketShoot(s, i, seqRng([0.4]))
    expect(types(events)).toEqual(['mistake', 'heal', 'shuffle'])
    expect(events[1]).toEqual({ type: 'heal', amount: BRACKET.wrongHeal })
    expect(s.nodes.every((n) => n.alive)).toBe(true)
    expect(s.stack).toEqual([])
  })

  it('mismatched closer against the stack top is wrong even mid-round', () => {
    const s = createBracketState(seqRng([0.5]))
    bracketShoot(s, s.nodes.findIndex((n) => n.label === '('), seqRng([0.5]))
    bracketShoot(s, s.nodes.findIndex((n) => n.label === '['), seqRng([0.5]))
    const events = bracketShoot(s, s.nodes.findIndex((n) => n.label === ')'), seqRng([0.5]))
    expect(types(events)).toEqual(['mistake', 'heal', 'shuffle'])
  })

  it('window expiry re-arms a fresh shuffled round', () => {
    const s = createBracketState(seqRng([0.5]))
    const order: BracketChar[] = ['(', '[', '{', '}', ']', ')']
    for (const label of order) {
      bracketShoot(s, s.nodes.findIndex((n) => n.alive && n.label === label), seqRng([0.5]))
    }
    const events = tickBracket(s, BRACKET.windowDur + 0.01, seqRng([0.3]))
    expect(types(events)).toEqual(['close', 'shuffle'])
    expect(s.nodes.every((n) => n.alive)).toBe(true)
  })

  it('targets the node the player stands in', () => {
    const s = createBracketState(seqRng([0.5]))
    const n = s.nodes[2]
    expect(bracketTargetIndex(s, n.x + 0.4, n.z - 0.4)).toBe(2)
    expect(bracketTargetIndex(s, 0, 0)).toBe(-1)
  })
})

/* ------------------------------------------------------------ Sphinx */

describe('sorted sphinx — sorted steps', () => {
  it('rolls distinct values on distinct tiles', () => {
    const tiles = rollSphinxTiles(seqRng([0.11, 0.31, 0.51, 0.71, 0.91, 0.21, 0.41]))
    expect(tiles).toHaveLength(SPHINX.tileCount)
    expect(new Set(tiles.map((t) => t.value)).size).toBe(SPHINX.tileCount)
  })

  it('demands the smallest remaining value next', () => {
    const s = createSphinxState(seqRng([0.5]))
    const sorted = [...s.tiles].sort((a, b) => a.value - b.value)
    expect(sphinxNextValue(s)).toBe(sorted[0].value)
  })

  it('stepping ascending locks tiles then stuns the boss', () => {
    const s = createSphinxState(seqRng([0.5]))
    const sorted = [...s.tiles].sort((a, b) => a.value - b.value)
    for (let k = 0; k < sorted.length; k++) {
      const i = s.tiles.indexOf(sorted[k])
      const events = sphinxStep(s, i, seqRng([0.5]))
      expect(types(events)).toContain('progress')
    }
    expect(s.windowT).toBeCloseTo(SPHINX.windowDur)
  })

  it('a wrong step zaps, reshuffles, and resets the timer', () => {
    const s = createSphinxState(seqRng([0.5]))
    s.timer = 2
    const sorted = [...s.tiles].sort((a, b) => a.value - b.value)
    const wrongIdx = s.tiles.indexOf(sorted[sorted.length - 1])
    const events = sphinxStep(s, wrongIdx, seqRng([0.4]))
    expect(types(events)).toEqual(['mistake', 'zap', 'shuffle'])
    expect(s.timer).toBe(SPHINX.timer)
    expect(s.tiles.every((t) => !t.done)).toBe(true)
  })

  it('the round timer expiring reshuffles with a mistake cue', () => {
    const s = createSphinxState(seqRng([0.5]))
    const events = tickSphinx(s, SPHINX.timer + 0.01, seqRng([0.6]))
    expect(types(events)).toEqual(['mistake', 'shuffle'])
  })

  it('the stun window closes into a fresh shuffled round', () => {
    const s = createSphinxState(seqRng([0.5]))
    const sorted = [...s.tiles].sort((a, b) => a.value - b.value)
    for (const t of sorted) sphinxStep(s, s.tiles.indexOf(t), seqRng([0.5]))
    const events = tickSphinx(s, SPHINX.windowDur + 0.01, seqRng([0.6]))
    expect(types(events)).toEqual(['close', 'shuffle'])
    expect(s.timer).toBe(SPHINX.timer)
  })

  it('never rolls an ascending route longer than the beatable bound', () => {
    let worst = 0
    for (let seed = 0; seed < 200; seed++) {
      const rng = seqRng([
        ((seed * 37) % 100) / 100,
        ((seed * 61) % 100) / 100,
        ((seed * 13) % 100) / 100,
        ((seed * 89) % 100) / 100,
        ((seed * 7) % 100) / 100,
      ])
      worst = Math.max(worst, sphinxRouteLength(rollSphinxTiles(rng)))
    }
    expect(worst).toBeLessThanOrEqual(SPHINX.maxRoute)
  })

  it('locates the tile under the player', () => {
    const s = createSphinxState(seqRng([0.5]))
    const t = s.tiles[1]
    expect(sphinxTileAt(s, t.x + 0.3, t.z)).toBe(1)
    expect(sphinxTileAt(s, 999, 999)).toBe(-1)
  })

  it('registers the NEAREST plate when compressed layouts overlap', () => {
    const s = createSphinxState(seqRng([0.5]))
    // Force two overlapping plates: index 0 sits almost on top of index 2.
    s.tiles[0].x = 10
    s.tiles[0].z = 0
    s.tiles[2].x = 10.5
    s.tiles[2].z = 0
    // Standing right on tile 2's center must register tile 2, not the
    // lower-indexed overlapping tile 0.
    expect(sphinxTileAt(s, 10.5, 0)).toBe(2)
    expect(sphinxTileAt(s, 10, 0)).toBe(0)
  })
})

/* --------------------------------------------------------- Architect */

describe('architect — twisted reprises + deletion mark', () => {
  it('ward chip damage is a small fraction', () => {
    expect(WARD_CHIP_MUL).toBeGreaterThan(0)
    expect(WARD_CHIP_MUL).toBeLessThan(0.25)
  })

  it('phase-2 seals are a movement twist on the twin locks', () => {
    expect(ARCHITECT_SEALS.regenHeal).toBeGreaterThan(0)
    const s = createTwinKeyState(ARCHITECT_SEALS, seqRng([0.1]))
    tickTwinKey(s, ARCHITECT_SEALS.cycle + 0.01, seqRng([0.1]))
    expect(s.firstSide).toBe('L')
    twinStrike(s, 'L')
    tickTwinKey(s, ARCHITECT_SEALS.chargeDelay + 0.01)
    tickTwinKey(s, ARCHITECT_SEALS.link * 0.5)
    expect(types(twinStrike(s, 'R'))).toEqual(['open'])
    expect(s.windowT).toBeCloseTo(ARCHITECT_SEALS.windowDur)
  })

  it('phase-3 sigils are a tighter sphinx (fewer tiles, less time, harder zap)', () => {
    expect(ARCHITECT_SIGILS.tileCount).toBeLessThan(SPHINX.tileCount)
    expect(ARCHITECT_SIGILS.timer).toBeLessThan(SPHINX.timer)
    expect(ARCHITECT_SIGILS.wrongZap).toBeGreaterThan(SPHINX.wrongZap)
    const s = createSphinxState(seqRng([0.5]), ARCHITECT_SIGILS)
    expect(s.tiles).toHaveLength(4)
    const sorted = [...s.tiles].sort((a, b) => a.value - b.value)
    for (const t of sorted) sphinxStep(s, s.tiles.indexOf(t), seqRng([0.5]))
    expect(s.windowT).toBeCloseTo(ARCHITECT_SIGILS.windowDur)
  })

  it('brands the player on a cadence', () => {
    const s = createMarkState()
    const events = tickMark(s, MARK.every)
    expect(types(events)).toEqual(['shuffle'])
    expect(s.phase).toBe('branded')
  })

  it('an unreturned mark detonates on the player', () => {
    const s = createMarkState()
    tickMark(s, MARK.every)
    const events = tickMark(s, MARK.fuse + 0.01)
    expect(types(events)).toEqual(['zap', 'mistake'])
    expect(events[0]).toEqual({ type: 'zap', amount: MARK.playerDamage })
    expect(s.phase).toBe('idle')
  })

  it('dashing through the boss returns the mark, detonating it on HIM', () => {
    const s = createMarkState()
    tickMark(s, MARK.every)
    expect(types(markDashTransfer(s, MARK.transferRadius - 0.5))).toEqual(['progress'])
    expect(s.phase).toBe('returned')
    const events = tickMark(s, MARK.returnFuse + 0.01)
    expect(types(events)).toEqual(['heal', 'open'])
    expect(events[0]).toEqual({ type: 'heal', amount: -MARK.bossDamage })
    expect(s.windowT).toBeCloseTo(MARK.windowDur)
  })

  it('a dash out of transfer range does nothing', () => {
    const s = createMarkState()
    tickMark(s, MARK.every)
    expect(markDashTransfer(s, MARK.transferRadius + 1)).toEqual([])
    expect(s.phase).toBe('branded')
  })

  it('the post-detonation window closes cleanly', () => {
    const s = createMarkState()
    tickMark(s, MARK.every)
    markDashTransfer(s, 1)
    tickMark(s, MARK.returnFuse + 0.01)
    const events = tickMark(s, MARK.windowDur + 0.01)
    expect(types(events)).toEqual(['close'])
    expect(s.windowT).toBe(0)
  })
})
