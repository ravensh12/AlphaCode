/**
 * Cinematic score for the story beats (intro + The Threshold) — deliberately
 * DIFFERENT from the relentless in-game horror loop in `themeMusic.ts`. This is
 * slow, spacious, and emotional:
 *
 *  - 'intro'     : a dark-heroic orchestral bed — sustained string-like pads on a
 *                  rising minor progression, a soft sub for gravity, gentle
 *                  timpani on chord changes, and a noble melody line. "The city
 *                  has fallen, but we rise."
 *  - 'threshold' : ethereal / liminal ambient — a slowly evolving suspended pad,
 *                  sparse shimmering bells from a bright scale, drenched in a long
 *                  reverb. Awe and the unknown.
 *
 * It honours the SAME mute preference as the header music toggle (via
 * `isMuted()` from themeMusic), uses a Web Audio lookahead scheduler so the main
 * thread is never hammered, and fades in/out to avoid clicks. Start from a user
 * gesture (autoplay policy); fails silently if audio is unavailable.
 */

import { isMuted } from './themeMusic'

export type CinematicMood = 'intro' | 'threshold'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let reverb: ConvolverNode | null = null
let reverbReturn: GainNode | null = null
let schedulerTimer: number | null = null
let step = 0
let nextStepTime = 0
let playing = false
let mood: CinematicMood = 'intro'

const SCHED_MS = 30
const LOOKAHEAD = 0.4

// Per-mood pulse length (seconds per scheduler step / "beat").
const STEP_SEC: Record<CinematicMood, number> = { intro: 1.0, threshold: 1.5 }

// Dark-heroic progression (one chord per bar of 4 beats). Hz.
const INTRO_CHORDS: number[][] = [
  [110.0, 220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63, 349.23], // F
  [130.81, 196.0, 261.63, 329.63], // C
  [196.0, 293.66, 392.0, 493.88], // G
]
// A simple noble melody (one note per beat), indexed by absolute beat.
const INTRO_MELODY = [
  659.25, 0, 587.33, 0, 523.25, 0, 587.33, 0, // over Am / F
  659.25, 0, 698.46, 0, 783.99, 0, 0, 0, // over C / G — lift
]

// Threshold: a bright suspended pad + a pentatonic bell set for shimmer.
const THRESH_PAD = [130.81, 196.0, 293.66, 392.0] // C G D G — open, suspended
const THRESH_BELLS = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]

function makeReverbIR(seconds: number, decay: number, bright: number): AudioBuffer | null {
  if (!ctx) return null
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const ir = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < len; i++) {
      const t = i / len
      const env = Math.pow(1 - t, decay)
      // `bright` keeps more high end alive for the ethereal mood.
      d[i] = (Math.random() * 2 - 1) * env * (bright + (1 - bright) * Math.pow(1 - t, 2))
    }
  }
  return ir
}

function sendReverb(node: AudioNode, amount: number) {
  if (!ctx || !reverb) return
  const send = ctx.createGain()
  send.gain.value = amount
  node.connect(send)
  send.connect(reverb)
}

/** Lush sustained pad — stacked, slightly detuned saws through a soft lowpass. */
function pad(when: number, freqs: number[], dur: number, vol: number, cutoff: number, wet: number) {
  if (!ctx || !master) return
  const g = ctx.createGain()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = cutoff
  // Slow swell in, long release out — orchestral, not punchy.
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vol, when + dur * 0.4)
  g.gain.linearRampToValueAtTime(vol * 0.85, when + dur * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  const oscs: OscillatorNode[] = []
  for (const f of freqs) {
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f * (k === 0 ? 1 : 1.006) // gentle detune for warmth
      o.connect(g)
      o.start(when)
      o.stop(when + dur + 0.1)
      oscs.push(o)
    }
  }
  g.connect(lp).connect(master)
  if (wet > 0) sendReverb(lp, wet)
  oscs[0].onended = () => {
    for (const o of oscs) o.disconnect()
    g.disconnect()
    lp.disconnect()
  }
}

/** A soft, sustained sub for gravity (intro). */
function sub(when: number, freq: number, dur: number, vol: number) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.value = freq
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vol, when + 0.5)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  o.connect(g).connect(master)
  o.start(when)
  o.stop(when + dur + 0.1)
  o.onended = () => {
    o.disconnect()
    g.disconnect()
  }
}

/** A bell / mallet voice — fast attack, long shimmering decay (both moods). */
function bell(when: number, freq: number, vol: number, wet: number) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'triangle'
  o2.type = 'sine'
  o.frequency.value = freq
  o2.frequency.value = freq * 2.0 // soft octave overtone
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4)
  o.connect(g)
  const og = ctx.createGain()
  og.gain.value = 0.4
  o2.connect(og).connect(g)
  g.connect(master)
  if (wet > 0) sendReverb(g, wet)
  o.start(when)
  o2.start(when)
  o.stop(when + 2.5)
  o2.stop(when + 2.5)
  o.onended = () => {
    o.disconnect()
    o2.disconnect()
    g.disconnect()
    og.disconnect()
  }
}

/** Soft timpani-ish mallet for intro chord changes. */
function timp(when: number, freq: number, vol: number) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(freq, when)
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, when + 0.18)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.6)
  o.connect(g).connect(master)
  sendReverb(g, 0.3)
  o.start(when)
  o.stop(when + 0.64)
  o.onended = () => {
    o.disconnect()
    g.disconnect()
  }
}

function scheduleIntro(when: number) {
  const beat = step % 16
  const bar = Math.floor(step / 16) % INTRO_CHORDS.length
  const chord = INTRO_CHORDS[bar]
  const barSec = STEP_SEC.intro * 4

  // New chord pad + sub + timpani at the top of each 4-beat bar.
  if (beat % 4 === 0) {
    pad(when, chord, barSec + 0.6, 0.12, 1700, 0.4)
    sub(when, chord[0] / 2, barSec, 0.16)
    timp(when, chord[0], 0.18)
  }
  // Noble melody, one note per beat.
  const m = INTRO_MELODY[step % INTRO_MELODY.length]
  if (m > 0) bell(when, m, 0.07, 0.45)
}

function scheduleThreshold(when: number) {
  const beat = step % 12
  const padIdx = Math.floor(step / 12) % 2
  const barSec = STEP_SEC.threshold * 12

  // A single slowly-evolving suspended pad, re-voiced every long bar.
  if (beat === 0) {
    const voiced = padIdx === 0 ? THRESH_PAD : THRESH_PAD.map((f, i) => (i === 3 ? 440.0 : f))
    pad(when, voiced, barSec + 1.0, 0.1, 2600, 0.6)
    sub(when, THRESH_PAD[0] / 2, barSec, 0.1)
  }
  // Sparse shimmering bells — drift across the scale, never on a strict grid.
  if (beat === 2 || beat === 5 || beat === 9) {
    const f = THRESH_BELLS[(step * 3 + beat) % THRESH_BELLS.length]
    bell(when, f, 0.06, 0.75)
  }
  if (beat === 7 && padIdx === 1) {
    bell(when, THRESH_BELLS[THRESH_BELLS.length - 1] * 0.5, 0.05, 0.7)
  }
}

function scheduleStep(when: number) {
  if (mood === 'intro') scheduleIntro(when)
  else scheduleThreshold(when)
  step++
}

function scheduler() {
  if (!playing || !ctx) return
  const stepSec = STEP_SEC[mood]
  while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(nextStepTime)
    nextStepTime += stepSec
  }
  schedulerTimer = window.setTimeout(scheduler, SCHED_MS)
}

export function startCinematicMusic(nextMood: CinematicMood = 'intro') {
  if (playing || isMuted()) return
  try {
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.0001
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -20
      comp.knee.value = 24
      comp.ratio.value = 4
      comp.attack.value = 0.01
      comp.release.value = 0.4
      reverb = ctx.createConvolver()
      reverb.buffer = makeReverbIR(5.5, 2.0, 0.7) // long, fairly bright space
      reverbReturn = ctx.createGain()
      reverbReturn.gain.value = 0.95
      reverb.connect(reverbReturn).connect(comp)
      master.connect(comp).connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    mood = nextMood
    step = 0
    playing = true
    nextStepTime = ctx.currentTime + 0.12
    // Gentle fade-in.
    const peak = mood === 'threshold' ? 0.5 : 0.42
    master!.gain.cancelScheduledValues(ctx.currentTime)
    master!.gain.setValueAtTime(0.0001, ctx.currentTime)
    master!.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 2.2)
    if (schedulerTimer == null) scheduler()
  } catch {
    /* audio unavailable — ignore */
  }
}

export function stopCinematicMusic() {
  if (!playing) return
  playing = false
  if (schedulerTimer != null) {
    window.clearTimeout(schedulerTimer)
    schedulerTimer = null
  }
  // Fade out, then suspend so a re-entry starts clean.
  try {
    if (ctx && master) {
      const t = ctx.currentTime
      master.gain.cancelScheduledValues(t)
      master.gain.setValueAtTime(master.gain.value, t)
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.7)
      const c = ctx
      window.setTimeout(() => {
        if (!playing && c.state === 'running') void c.suspend()
      }, 800)
    }
  } catch {
    /* ignore */
  }
}
