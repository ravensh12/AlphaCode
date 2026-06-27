/**
 * Extreme procedural HORROR score for Code City — no audio asset. This is built
 * to genuinely unsettle: a cavernous convolution reverb, an unstable detuned
 * sub-bass "dread bed", atonal high string clusters (Psycho-style shower
 * stabs), slow tension risers that crest into impacts, a quickening heartbeat,
 * breathy whispered-noise textures, and sudden banshee shrieks as jump scares.
 *
 * Everything is scheduled with a Web Audio lookahead buffer so the main thread
 * is never hit with dozens of node allocations per step (which caused audible
 * lag). Nodes are torn down on `onended`. Must be started from a user gesture.
 */

const MUTE_KEY = 'alphacode.music.muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null // dry/main input bus (pre-compressor)
let reverb: ConvolverNode | null = null // shared cavernous space
let reverbReturn: GainNode | null = null // wet level into the compressor
let noiseBuf: AudioBuffer | null = null
let driveCurve: Float32Array<ArrayBuffer> | null = null
let schedulerTimer: number | null = null
let step = 0
let loopCount = 0
let playing = false
let nextStepTime = 0

// Atonal horror pitch set: stacked minor-2nds + a tritone. No key, no comfort.
const NOTES = [
  207.65, // G#3
  220.0, // A3
  233.08, // A#3  (b2 cluster)
  246.94, // B3
  277.18, // C#4
  293.66, // D4
  311.13, // D#4  (tritone over A)
  370.0, // F#4
]
// A creeping, never-resolving line that crawls up then collapses.
const RIFF = [0, 0, 1, 0, 2, 1, 0, 2, 0, 1, 2, 6, 4, 2, 1, 0]
// Sinking chromatic roots — the floor dropping out from under you.
const BASS_ROOTS = [55.0, 51.91, 49.0, 46.25]

const STEP_SEC = 0.13 // fast, relentless 16th-note pulse — a frantic chase
const LOOKAHEAD = 0.13
const SCHED_MS = 25

function noise(): AudioBuffer | null {
  if (!ctx) return null
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return noiseBuf
}

/** Soft-clip curve so the bass + stabs grit up and the mix feels aggressive. */
function distortion(): Float32Array<ArrayBuffer> {
  if (!driveCurve) {
    const n = 1024
    const curve = new Float32Array(n)
    const k = 28
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
    }
    driveCurve = curve
  }
  return driveCurve
}

/** Generate a long, dark decaying impulse response for a cavernous reverb. */
function makeReverbIR(seconds: number, decay: number): AudioBuffer | null {
  if (!ctx) return null
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const ir = ctx.createBuffer(2, len, rate)
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c)
    for (let i = 0; i < len; i++) {
      const t = i / len
      // Noise with an exponential tail; the high end rolls off faster so the
      // space sounds dark and stone-cold rather than bright.
      const env = Math.pow(1 - t, decay)
      d[i] = (Math.random() * 2 - 1) * env * (0.6 + 0.4 * Math.pow(1 - t, 2))
    }
  }
  return ir
}

/** Route a node into the shared reverb at a given send level. */
function sendReverb(node: AudioNode, amount: number) {
  if (!ctx || !reverb) return
  const send = ctx.createGain()
  send.gain.value = amount
  node.connect(send)
  send.connect(reverb)
}

function voice(
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  cutoff: number,
  wet = 0.25,
) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = cutoff
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vol, when + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  osc.connect(g).connect(lp)
  lp.connect(master)
  if (wet > 0) sendReverb(lp, wet)
  osc.start(when)
  osc.stop(when + dur + 0.04)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
    lp.disconnect()
  }
}

/** Thick, gritty bass: two detuned saws + a sub sine, soft-clipped. */
function bass(when: number, freq: number, dur: number, vol: number, cutoff: number) {
  if (!ctx || !master) return
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  const sub = ctx.createOscillator()
  const g = ctx.createGain()
  const shaper = ctx.createWaveShaper()
  shaper.curve = distortion()
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(cutoff, when)
  o1.type = 'sawtooth'
  o2.type = 'sawtooth'
  sub.type = 'sine'
  o1.frequency.value = freq
  o2.frequency.value = freq * 1.014 // detune for a queasy beating
  sub.frequency.value = freq / 2
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vol, when + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  o1.connect(g)
  o2.connect(g)
  sub.connect(g)
  g.connect(shaper).connect(lp).connect(master)
  o1.start(when)
  o2.start(when)
  sub.start(when)
  o1.stop(when + dur + 0.04)
  o2.stop(when + dur + 0.04)
  sub.stop(when + dur + 0.04)
  o1.onended = () => {
    o1.disconnect()
    o2.disconnect()
    sub.disconnect()
    g.disconnect()
    shaper.disconnect()
    lp.disconnect()
  }
}

function kick(when: number, vol = 0.5) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(170, when)
  osc.frequency.exponentialRampToValueAtTime(40, when + 0.14)
  g.gain.setValueAtTime(vol, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.24)
  osc.connect(g).connect(master)
  osc.start(when)
  osc.stop(when + 0.26)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

function hit(when: number, dur: number, vol: number, hp: number, lp: number, wet = 0.18) {
  if (!ctx || !master) return
  const buf = noise()
  if (!buf) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  const f1 = ctx.createBiquadFilter()
  f1.type = 'highpass'
  f1.frequency.value = hp
  const f2 = ctx.createBiquadFilter()
  f2.type = 'lowpass'
  f2.frequency.value = lp
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  src.connect(f1).connect(f2).connect(g)
  g.connect(master)
  if (wet > 0) sendReverb(g, wet)
  src.start(when)
  src.stop(when + dur + 0.02)
  src.onended = () => {
    src.disconnect()
    f1.disconnect()
    f2.disconnect()
    g.disconnect()
  }
}

/**
 * Atonal high-string cluster — the classic horror "shower stab". A fistful of
 * detuned sawtooths a semitone apart, screaming through a resonant bandpass
 * with a razor-sharp attack. Drenched in reverb so it rings in the dark.
 */
function stringStab(when: number, root: number, vol = 0.12) {
  if (!ctx || !master) return
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = root * 4
  bp.Q.value = 5
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.006) // brutal attack
  g.gain.setValueAtTime(vol, when + 0.06)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.42)
  // Dissonant cluster: root, +1 semitone, +tritone, +octave-ish — pure shriek.
  const ratios = [1, 1.0595, Math.SQRT2, 2.04]
  const oscs: OscillatorNode[] = []
  for (let i = 0; i < ratios.length; i++) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = root * 4 * ratios[i] * (1 + (i - 1.5) * 0.004) // micro-detune
    o.connect(g)
    o.start(when)
    o.stop(when + 0.46)
    oscs.push(o)
  }
  g.connect(bp)
  bp.connect(master)
  sendReverb(bp, 0.5)
  oscs[0].onended = () => {
    for (const o of oscs) o.disconnect()
    g.disconnect()
    bp.disconnect()
  }
}

/**
 * The dread bed: a sustained, unstable sub-bass drone for a whole bar. Detuned
 * sub saws beating against each other, a slow tremolo, and a creeping pitch
 * wobble so it feels like something breathing in the dark.
 */
function drone(when: number, root: number) {
  if (!ctx || !master) return
  const dur = STEP_SEC * 16 + 0.3
  const osc = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const sub = ctx.createOscillator()
  const g = ctx.createGain()
  const lfo = ctx.createOscillator() // amplitude tremolo
  const lfoGain = ctx.createGain()
  const wob = ctx.createOscillator() // pitch wobble for unease
  const wobGain = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.value = root / 2
  osc2.type = 'sawtooth'
  osc2.frequency.value = root / 2 + 0.9 // beating
  sub.type = 'sine'
  sub.frequency.value = root / 4
  lfo.type = 'sine'
  lfo.frequency.value = 5.6
  lfoGain.gain.value = 0.035
  lfo.connect(lfoGain).connect(g.gain)
  wob.type = 'sine'
  wob.frequency.value = 0.23
  wobGain.gain.value = 3.2
  wob.connect(wobGain).connect(osc.frequency)
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(0.085, when + 0.9)
  g.gain.linearRampToValueAtTime(0.07, when + dur - 0.9)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 560
  osc.connect(g)
  osc2.connect(g)
  sub.connect(g)
  g.connect(lp).connect(master)
  sendReverb(lp, 0.35)
  osc.start(when)
  osc2.start(when)
  sub.start(when)
  lfo.start(when)
  wob.start(when)
  osc.stop(when + dur)
  osc2.stop(when + dur)
  sub.stop(when + dur)
  lfo.stop(when + dur)
  wob.stop(when + dur)
  osc.onended = () => {
    osc.disconnect()
    osc2.disconnect()
    sub.disconnect()
    lfo.disconnect()
    lfoGain.disconnect()
    wob.disconnect()
    wobGain.disconnect()
    g.disconnect()
    lp.disconnect()
  }
}

/**
 * Tension riser — a noise sweep + rising detuned tone that crescendos over
 * `bars`*bar-length and is meant to crest right into an impact/boom.
 */
function riser(when: number, dur: number) {
  if (!ctx || !master) return
  const buf = noise()
  if (!buf) return
  // Noise sweep through an opening bandpass.
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.2
  bp.frequency.setValueAtTime(300, when)
  bp.frequency.exponentialRampToValueAtTime(5200, when + dur)
  const ng = ctx.createGain()
  ng.gain.setValueAtTime(0.0001, when)
  ng.gain.exponentialRampToValueAtTime(0.16, when + dur)
  ng.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.12)
  src.connect(bp).connect(ng)
  ng.connect(master)
  sendReverb(ng, 0.3)
  // Rising detuned tone underneath.
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  const og = ctx.createGain()
  o1.type = 'sawtooth'
  o2.type = 'sawtooth'
  o1.frequency.setValueAtTime(120, when)
  o1.frequency.exponentialRampToValueAtTime(900, when + dur)
  o2.frequency.setValueAtTime(122, when)
  o2.frequency.exponentialRampToValueAtTime(912, when + dur)
  og.gain.setValueAtTime(0.0001, when)
  og.gain.exponentialRampToValueAtTime(0.07, when + dur)
  og.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.1)
  o1.connect(og)
  o2.connect(og)
  og.connect(master)
  o1.start(when)
  o2.start(when)
  src.start(when)
  o1.stop(when + dur + 0.16)
  o2.stop(when + dur + 0.16)
  src.stop(when + dur + 0.16)
  o1.onended = () => {
    o1.disconnect()
    o2.disconnect()
    og.disconnect()
    src.disconnect()
    bp.disconnect()
    ng.disconnect()
  }
}

/** Descending detuned horror sting — a banshee shriek through a bandpass. */
function shriek(when: number) {
  if (!ctx || !master) return
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  const g = ctx.createGain()
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1500
  bp.Q.value = 8
  o1.type = 'sawtooth'
  o2.type = 'sawtooth'
  o1.frequency.setValueAtTime(2300, when)
  o1.frequency.exponentialRampToValueAtTime(220, when + 0.7)
  o2.frequency.setValueAtTime(2360, when) // detuned twin
  o2.frequency.exponentialRampToValueAtTime(244, when + 0.7)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(0.1, when + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.72)
  o1.connect(g)
  o2.connect(g)
  g.connect(bp)
  bp.connect(master)
  sendReverb(bp, 0.55)
  o1.start(when)
  o2.start(when)
  o1.stop(when + 0.74)
  o2.stop(when + 0.74)
  o1.onended = () => {
    o1.disconnect()
    o2.disconnect()
    g.disconnect()
    bp.disconnect()
  }
}

/**
 * Breathy "whisper" texture — band-passed noise with a slow swell, panned by a
 * dark filter. Sounds like something exhaling just behind you.
 */
function whisper(when: number) {
  if (!ctx || !master) return
  const buf = noise()
  if (!buf) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.setValueAtTime(900, when)
  bp.frequency.linearRampToValueAtTime(1700, when + 0.5)
  bp.Q.value = 2.4
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, when)
  g.gain.linearRampToValueAtTime(0.05, when + 0.18)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.6)
  src.connect(bp).connect(g)
  g.connect(master)
  sendReverb(g, 0.5)
  src.start(when)
  src.stop(when + 0.64)
  src.onended = () => {
    src.disconnect()
    bp.disconnect()
    g.disconnect()
  }
}

/**
 * Fast tremolo string — a short, sharp dissonant note meant to be retriggered
 * many times a bar so the strings "shudder" the way frantic horror cues do.
 * Lighter than the full cluster stab so it can fire every step without choking
 * the audio graph.
 */
function tremolo(when: number, root: number, vol = 0.06) {
  if (!ctx || !master) return
  const o1 = ctx.createOscillator()
  const o2 = ctx.createOscillator()
  const g = ctx.createGain()
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = root * 4
  bp.Q.value = 6
  o1.type = 'sawtooth'
  o2.type = 'sawtooth'
  o1.frequency.value = root * 4
  o2.frequency.value = root * 4 * 1.06 // a screaming minor-2nd beat
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, when + STEP_SEC * 0.95)
  o1.connect(g)
  o2.connect(g)
  g.connect(bp)
  bp.connect(master)
  sendReverb(bp, 0.32)
  o1.start(when)
  o2.start(when)
  o1.stop(when + STEP_SEC + 0.02)
  o2.stop(when + STEP_SEC + 0.02)
  o1.onended = () => {
    o1.disconnect()
    o2.disconnect()
    g.disconnect()
    bp.disconnect()
  }
}

/** Pounding war-tom — a fast, tribal, dread-filled drum hit. */
function tom(when: number, freq: number, vol = 0.34) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, when)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, when + 0.16)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2)
  osc.connect(g).connect(master)
  sendReverb(g, 0.22)
  osc.start(when)
  osc.stop(when + 0.22)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

/** Quickening heartbeat — a low "lub-dub" thump pair. */
function heartbeat(when: number, vol = 0.34) {
  thump(when, vol)
  thump(when + STEP_SEC * 0.55, vol * 0.8)
}
function thump(when: number, vol: number) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(78, when)
  osc.frequency.exponentialRampToValueAtTime(34, when + 0.12)
  g.gain.setValueAtTime(0.0001, when)
  g.gain.exponentialRampToValueAtTime(vol, when + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2)
  osc.connect(g).connect(master)
  osc.start(when)
  osc.stop(when + 0.22)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

/** Deep impact boom — a dread "drop" that opens the loop. */
function boom(when: number) {
  if (!ctx || !master) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(130, when)
  osc.frequency.exponentialRampToValueAtTime(24, when + 0.6)
  g.gain.setValueAtTime(0.6, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.9)
  osc.connect(g).connect(master)
  sendReverb(g, 0.4)
  osc.start(when)
  osc.stop(when + 0.92)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

function scheduleStep(when: number) {
  const i = step % 16
  const bar = Math.floor(step / 16) % BASS_ROOTS.length
  const root = BASS_ROOTS[bar]

  // Sustained dread bed + opening impact at the top of each bar.
  if (i === 0) {
    drone(when, root)
    boom(when)
  }

  // RELENTLESS DRIVING BASS — gritty 8th-note pulse that never lets up.
  if (i % 2 === 0) {
    const accent = i % 4 === 0
    bass(when, root, accent ? 0.16 : 0.12, accent ? 0.22 : 0.15, accent ? 820 : 520)
  }

  // Pounding double-time kick: four-on-the-floor in 8ths + extra blast hits to
  // keep the pulse frantic.
  if (i % 2 === 0) kick(when, 0.5)
  if (i === 7 || i === 11 || i === 15) kick(when, 0.4) // syncopated blasts
  // Galloping ghost-kick on the &-of-beats deeper into the loop.
  if (loopCount % 2 === 1) kick(when + STEP_SEC * 0.5, 0.22)

  // Driving hi-hat ticks on EVERY 16th — the frantic motor underneath it all.
  if (i % 2 === 1) hit(when, 0.02, 0.05, 9000, 16500, 0.06)
  else hit(when, 0.018, 0.035, 10000, 17000, 0.05)

  // Snare-ish cracks on the backbeats — sharp and reverberant.
  if (i === 4 || i === 12) hit(when, 0.13, 0.2, 1500, 7000, 0.3)

  // Pounding war-toms — a tribal, sprinting drum figure (the chase).
  if (i === 0 || i === 6 || i === 10) tom(when, 150, 0.32)
  if (i === 13 || i === 14 || i === 15) tom(when, 120 - (i - 13) * 8, 0.26) // fast roll into the bar

  // SHUDDERING TREMOLO STRINGS — fast retriggered dissonant notes on every
  // step, the signature "something is coming RIGHT NOW" horror texture.
  tremolo(when, root, i % 2 === 0 ? 0.07 : 0.05)

  // Frantic atonal lead arpeggio sprinting through the dissonant set.
  voice(when, NOTES[RIFF[i]], 0.16, 'sawtooth', 0.06, 2400, 0.3)

  // Full screaming string-cluster stabs punch the strong beats.
  if (i === 0) stringStab(when, root, 0.13)
  if (i === 8) stringStab(when, BASS_ROOTS[(bar + 1) % BASS_ROOTS.length], 0.11)
  if (loopCount % 2 === 0 && (i === 5 || i === 11)) stringStab(when, NOTES[2] / 2, 0.09)

  // Tension riser across the back half of every bar, cresting into the next
  // bar's boom + stab — keeps re-winding the dread.
  if (i === 8) riser(when, STEP_SEC * 8)

  // Quickening heartbeat hammering under the kick.
  if (i === 0 || i === 8) heartbeat(when, 0.3)

  // Breathy whispers knife through the mix unpredictably.
  if (i === 3 || (loopCount % 2 === 0 && i === 9)) whisper(when)

  // Banshee shriek jump-scares — frequent and unpredictable so you never settle.
  if (i === 0 && loopCount % 2 === 1) shriek(when)
  if (i === 6 && loopCount % 2 === 0) shriek(when)
  if (i === 12 && loopCount % 3 === 1) shriek(when)

  step++
  if (step % 16 === 0) loopCount++
}

function scheduler() {
  if (!playing || !ctx) return
  while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(nextStepTime)
    nextStepTime += STEP_SEC
  }
  schedulerTimer = window.setTimeout(scheduler, SCHED_MS)
}

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
      master.gain.value = 0.3 // denser, faster mix — sits clearly under combat SFX
      // Punchy master bus: hard compressor glues + thickens the relentless assault.
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -22
      comp.knee.value = 20
      comp.ratio.value = 11
      comp.attack.value = 0.002
      comp.release.value = 0.16
      // Cavernous shared reverb on a parallel wet return into the compressor.
      reverb = ctx.createConvolver()
      reverb.buffer = makeReverbIR(3.2, 2.6)
      reverbReturn = ctx.createGain()
      reverbReturn.gain.value = 0.9
      reverb.connect(reverbReturn).connect(comp)
      master.connect(comp).connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    playing = true
    nextStepTime = ctx.currentTime + 0.08
    if (schedulerTimer == null) scheduler()
  } catch {
    /* audio unavailable — ignore */
  }
}

export function stopMusic() {
  playing = false
  if (schedulerTimer != null) {
    window.clearTimeout(schedulerTimer)
    schedulerTimer = null
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
