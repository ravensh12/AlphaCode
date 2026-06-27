/**
 * Tiny Web-Audio UI sound effects (no assets). A single lazily-created
 * AudioContext drives short, cheap synth blips — every voice is torn down on
 * `onended` so nothing accumulates. All effects are mixed at modest volume and
 * respect a persisted global SFX mute (`alphacode.sfx.muted`), so callers can
 * fire-and-forget: each `play*` no-ops when muted or when audio is unavailable.
 *
 * This is the UI/feedback layer only — background music lives in `themeMusic.ts`
 * and the 3D arenas own their own combat audio.
 */

const MUTE_KEY = 'alphacode.sfx.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

// Cache the mute pref so the hot path never touches localStorage per call.
let muted: boolean = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.42
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function noise(): AudioBuffer | null {
  const c = ensure()
  if (!c) return null
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

/**
 * One short tonal blip with a fast attack + exponential decay. Optional pitch
 * glide to `slideTo`. Returns nothing; self-cleans on end.
 */
function blip(
  c: AudioContext,
  bus: GainNode,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo?: number,
) {
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, when)
  if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(slideTo, when + dur)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(vol, when + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  osc.connect(g).connect(bus)
  osc.start(when)
  osc.stop(when + dur + 0.03)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

/** A short filtered-noise transient (clicks / whooshes). */
function noiseBurst(
  c: AudioContext,
  bus: GainNode,
  when: number,
  dur: number,
  vol: number,
  hp: number,
  lp: number,
  sweepTo?: number,
) {
  const buf = noise()
  if (!buf) return
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f1 = c.createBiquadFilter()
  f1.type = 'highpass'
  f1.frequency.value = hp
  const f2 = c.createBiquadFilter()
  f2.type = 'lowpass'
  f2.frequency.setValueAtTime(lp, when)
  if (sweepTo != null) f2.frequency.exponentialRampToValueAtTime(sweepTo, when + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(vol, when + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  src.connect(f1).connect(f2).connect(g).connect(bus)
  src.start(when)
  src.stop(when + dur + 0.04)
  src.onended = () => {
    src.disconnect()
    f1.disconnect()
    f2.disconnect()
    g.disconnect()
  }
}

// --- Mute API --------------------------------------------------------------

export function isSfxMuted(): boolean {
  return muted
}

export function setSfxMuted(v: boolean): void {
  muted = v
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Toggle SFX mute; persists. Returns the new muted state. */
export function toggleSfx(): boolean {
  setSfxMuted(!muted)
  return muted
}

// --- Effects ---------------------------------------------------------------

/** A snappy laser-blaster "pew": fast downward pitch sweep + a noise click. */
export function playShot(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 880, 0.14, 'square', 0.18, 180)
  noiseBurst(c, master, now, 0.05, 0.16, 1800, 12000)
}

/** Soft UI tick — a quiet, short blip for primary button presses. */
export function playClick(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 420, 0.05, 'triangle', 0.1, 360)
  noiseBurst(c, master, now, 0.018, 0.05, 2400, 9000)
}

/** Slightly brighter pick — for selecting an option/tile. */
export function playSelect(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 620, 0.07, 'triangle', 0.11, 880)
}

/** Two-tone switch flip; pitch direction follows the on/off state. */
export function playToggle(on: boolean): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  if (on) {
    blip(c, master, now, 440, 0.06, 'triangle', 0.1)
    blip(c, master, now + 0.06, 660, 0.08, 'triangle', 0.11)
  } else {
    blip(c, master, now, 520, 0.06, 'triangle', 0.1)
    blip(c, master, now + 0.06, 340, 0.09, 'triangle', 0.1)
  }
}

/** Pleasant rising arpeggio for a correct answer. */
export function playCorrect(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  // C5 - E5 - G5 major triad, gentle.
  const notes = [523.25, 659.25, 783.99]
  notes.forEach((f, i) => blip(c, master!, now + i * 0.09, f, 0.18, 'triangle', 0.12))
}

/** Gentle low "not quite" buzz — soft and kid-friendly, never harsh. */
export function playWrong(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  // A soft minor-third dip on a mellow triangle, low-passed so it never bites.
  blip(c, master, now, 311.13, 0.16, 'triangle', 0.1, 246.94)
  blip(c, master, now + 0.1, 233.08, 0.2, 'sine', 0.09)
}

/** Short triumphant fanfare — power / level unlock. */
export function playUnlock(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  // G4 - C5 - E5 - G5 climb with a sparkle tail.
  const notes = [392.0, 523.25, 659.25, 783.99]
  notes.forEach((f, i) => blip(c, master!, now + i * 0.08, f, 0.22, 'triangle', 0.13))
  blip(c, master, now + 0.34, 1046.5, 0.4, 'sine', 0.1)
}

/** Airy navigation transition. */
export function playWhoosh(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  noiseBurst(c, master, now, 0.32, 0.12, 500, 1200, 5200)
}

/** Bigger celebratory flourish — lesson/section complete, victory. */
export function playVictory(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  // C major arpeggio up to the octave, then a ringing top note.
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => blip(c, master!, now + i * 0.1, f, 0.26, 'triangle', 0.13))
  blip(c, master, now + 0.42, 1318.51, 0.55, 'sine', 0.11)
  noiseBurst(c, master, now + 0.42, 0.4, 0.05, 4000, 14000)
}

/** Alias flourish for hitting a new level — a touch brighter than victory. */
export function playLevelUp(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  const notes = [587.33, 739.99, 880.0, 1174.66]
  notes.forEach((f, i) => blip(c, master!, now + i * 0.09, f, 0.24, 'triangle', 0.13))
  blip(c, master, now + 0.38, 1479.98, 0.5, 'sine', 0.1)
}

// --- Combat effects --------------------------------------------------------
// These are the overworld zombie-fight voices. They're deliberately short and
// quiet so a churning horde never turns the mix to mush; callers throttle the
// high-frequency ones (hits/kills) on their side.

/** Wet, soft thud when a bolt connects with a walker (non-fatal). */
export function playEnemyHit(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  noiseBurst(c, master, now, 0.05, 0.07, 300, 2200, 600)
  blip(c, master, now, 150, 0.05, 'sine', 0.05, 90)
}

/** Crunchy squelch when a walker is put down. */
export function playEnemyKill(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  noiseBurst(c, master, now, 0.12, 0.12, 200, 1600, 400)
  blip(c, master, now, 120, 0.14, 'triangle', 0.08, 60)
}

/** Bright precision ping for a weak-point / crit hit. */
export function playCrit(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 1320, 0.1, 'square', 0.12, 1980)
  blip(c, master, now + 0.04, 1980, 0.12, 'sine', 0.08)
}

/** Heavy, low impact when the player takes damage. */
export function playPlayerHurt(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 220, 0.22, 'sawtooth', 0.16, 70)
  noiseBurst(c, master, now, 0.16, 0.14, 80, 900)
}

/** A telegraph whoomp — a heavy enemy is winding up a slam. */
export function playSlamWindup(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 90, 0.34, 'sine', 0.12, 200)
}

/** Acid spit charge — a short rising hiss so ranged shots are dodgeable. */
export function playSpitCharge(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  noiseBurst(c, master, now, 0.22, 0.07, 1200, 5000, 9000)
}

/** Warm chime when a dropped heart is collected. */
export function playHeartPickup(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 784, 0.12, 'triangle', 0.13)
  blip(c, master, now + 0.08, 1175, 0.18, 'sine', 0.11)
}

/** Low double-thump heartbeat for the low-health warning. */
export function playHeartbeat(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime
  blip(c, master, now, 70, 0.12, 'sine', 0.16, 52)
  blip(c, master, now + 0.16, 64, 0.16, 'sine', 0.13, 46)
}

// --- Ergonomic hook --------------------------------------------------------

/**
 * Convenience accessor returning the stable play/mute functions. They're module
 * singletons, so this object is fine to call inline (no memoization needed).
 */
export function useUiSound() {
  return {
    playShot,
    playClick,
    playSelect,
    playToggle,
    playCorrect,
    playWrong,
    playUnlock,
    playWhoosh,
    playVictory,
    playLevelUp,
    isSfxMuted,
    setSfxMuted,
    toggleSfx,
  }
}
