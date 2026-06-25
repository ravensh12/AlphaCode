/**
 * Intense, procedural zombie-survival theme for Code City — no audio asset.
 * A driving pulse of minor bass, a harmonic-minor menace riff, a heartbeat
 * kick with noise hats + snare, dissonant tritone stabs, and an eerie tremolo
 * drone — all built live with the Web Audio API.
 * Must be started from a user gesture (browser autoplay policy).
 */

const MUTE_KEY = 'alphacode.music.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let timer: number | null = null
let step = 0
let playing = false

// Dark register for the menace riff (A harmonic-minor flavour: includes G#).
const NOTES = [
  220.0, // 0 A3
  246.94, // 1 B3
  261.63, // 2 C4
  293.66, // 3 D4
  329.63, // 4 E4
  349.23, // 5 F4
  392.0, // 6 G4
  415.3, // 7 G#4 (leading-tone tension)
  440.0, // 8 A4
]
// A creepy, driving lick that climbs the harmonic minor and stumbles back down.
const RIFF = [0, 2, 4, 7, 8, 7, 4, 2, 0, 2, 4, 5, 4, 2, 1, 0]

// Menacing root progression (i – VI – VII – V): Am · F · G · E. One per bar.
const BASS_ROOTS = [110.0, 87.31, 98.0, 82.41] // A2 F2 G2 E2

// Fast and relentless — 16 driving eighth-ish steps per phrase.
const STEP_MS = 196

/* ------------------------------------------------------------- synth voices */

function noise(): AudioBuffer | null {
  if (!ctx) return null
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

/** A filtered oscillator note (gritty saw/square with a lowpass). */
function voice(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  cutoff: number,
) {
  if (!ctx || !master) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = cutoff
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(vol, now + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(g).connect(lp).connect(master)
  osc.start(now)
  osc.stop(now + dur + 0.04)
  osc.onended = () => g.disconnect()
}

/** Heartbeat kick — a punchy sine that drops in pitch fast. */
function kick(vol = 0.5) {
  if (!ctx || !master) return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, now)
  osc.frequency.exponentialRampToValueAtTime(46, now + 0.13)
  g.gain.setValueAtTime(vol, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  osc.connect(g).connect(master)
  osc.start(now)
  osc.stop(now + 0.22)
  osc.onended = () => g.disconnect()
}

/** Noise burst — snare (lowpass) or hat (highpass). */
function hit(dur: number, vol: number, hp: number, lp: number) {
  if (!ctx || !master) return
  const buf = noise()
  if (!buf) return
  const now = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f1 = ctx.createBiquadFilter()
  f1.type = 'highpass'
  f1.frequency.value = hp
  const f2 = ctx.createBiquadFilter()
  f2.type = 'lowpass'
  f2.frequency.value = lp
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  src.connect(f1).connect(f2).connect(g).connect(master)
  src.start(now)
  src.stop(now + dur + 0.02)
  src.onended = () => g.disconnect()
}

/** Dissonant tritone stab — a short, aggressive cluster for menace. */
function stab(root: number) {
  voice(root, 0.5, 'sawtooth', 0.1, 1400)
  voice(root * 1.1892, 0.5, 'sawtooth', 0.08, 1400) // minor third
  voice(root * Math.SQRT2, 0.5, 'sawtooth', 0.09, 1400) // tritone (the tension)
}

/** Long, eerie tremolo drone an octave low — restarted each phrase. */
function drone(root: number) {
  if (!ctx || !master) return
  const now = ctx.currentTime
  const dur = (STEP_MS / 1000) * 16 + 0.2
  const osc = ctx.createOscillator()
  const sub = ctx.createOscillator()
  const g = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = root / 2
  sub.type = 'sine'
  sub.frequency.value = root / 4
  // Tremolo: LFO wobbles the gain for an uneasy, breathing pad.
  lfo.type = 'sine'
  lfo.frequency.value = 5.5
  lfoGain.gain.value = 0.018
  lfo.connect(lfoGain).connect(g.gain)
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.05, now + 0.6)
  g.gain.linearRampToValueAtTime(0.045, now + dur - 0.8)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 700
  osc.connect(g)
  sub.connect(g)
  g.connect(lp).connect(master)
  osc.start(now)
  sub.start(now)
  lfo.start(now)
  osc.stop(now + dur)
  sub.stop(now + dur)
  lfo.stop(now + dur)
  osc.onended = () => {
    g.disconnect()
    lfoGain.disconnect()
  }
}

/* ----------------------------------------------------------------- sequencer */

function tick() {
  const i = step % 16
  const bar = Math.floor(step / 8) % BASS_ROOTS.length
  const root = BASS_ROOTS[bar]

  // Pumping bass on every step — relentless, driving.
  const accent = i % 2 === 0
  voice(root, accent ? 0.18 : 0.12, 'sawtooth', accent ? 0.17 : 0.11, 600)

  // Heartbeat kick on the beat; a deeper double-thump every phrase start.
  if (i % 2 === 0) kick(0.5)
  if (i === 0) kick(0.42)

  // Snare on the backbeat, hats driving underneath.
  if (i % 4 === 2) hit(0.16, 0.22, 1200, 6000)
  hit(0.04, i % 2 === 0 ? 0.09 : 0.05, 7000, 14000)

  // Menace riff — gritty saw lead with a hint of bite.
  voice(NOTES[RIFF[i]], 0.22, 'sawtooth', 0.085, 2200)
  // Octave-up ghost note every few steps for a frantic edge.
  if (i % 4 === 1) voice(NOTES[RIFF[i]] * 2, 0.12, 'square', 0.03, 4000)

  // Dissonant stab + fresh drone at the top of each phrase.
  if (i === 0) {
    stab(root)
    drone(root)
  }
  // A second jolt mid-phrase keeps the dread up.
  if (i === 8) stab(BASS_ROOTS[(bar + 2) % BASS_ROOTS.length])

  step++
}

/* -------------------------------------------------------------- public API */

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function isPlaying(): boolean {
  return playing
}

export function startMusic() {
  if (playing || isMuted()) return
  try {
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.3
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    playing = true
    if (timer == null) timer = window.setInterval(tick, STEP_MS)
  } catch {
    /* audio unavailable — ignore */
  }
}

export function stopMusic() {
  playing = false
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
  if (ctx && ctx.state === 'running') void ctx.suspend()
}

/** Toggle mute; persists the preference. Returns the new muted state. */
export function toggleMusic(): boolean {
  const nextMuted = !isMuted()
  try {
    localStorage.setItem(MUTE_KEY, nextMuted ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (nextMuted) stopMusic()
  else startMusic()
  return nextMuted
}
