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

// Dedicated, boosted-then-limited submix for the player gun shot so it can sit
// clearly louder than the rest of the mix without ever clipping the master bus
// when many shots overlap during rapid fire. Built lazily, pooled forever.
let shotBus: GainNode | null = null
let shotComp: DynamicsCompressorNode | null = null
// Soft-clip curve for the gunshot "grit" — built once, shared by every crack
// voice (WaveShaper is stateless, so only the tiny per-voice node is created).
let shotCurve: Float32Array<ArrayBuffer> | null = null

// Real recorded-style gunshot sample: decoded once and cached, then fired as
// cheap per-shot BufferSources. Falls back to the synth if it can't load.
const SHOT_SAMPLE_URL = `${import.meta.env.BASE_URL ?? '/'}assets/audio/gunshot.wav`
let shotSampleBuf: AudioBuffer | null = null
let shotSampleState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'

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

/**
 * Lazily build the gun-shot submix: a gain boost feeding a fast limiter
 * (DynamicsCompressor tuned as a ceiling) into the master. The boost makes a
 * single shot punchy-loud; the limiter's fast attack lets the initial transient
 * snap through but clamps the summed level when many shots pile up, so rapid
 * fire never blows out the master. Pooled — created once, reused forever.
 */
function ensureShotBus(c: AudioContext, dest: GainNode): GainNode {
  if (!shotBus) {
    shotComp = c.createDynamicsCompressor()
    shotComp.threshold.value = -12
    shotComp.knee.value = 6
    shotComp.ratio.value = 8
    shotComp.attack.value = 0.002
    shotComp.release.value = 0.12
    shotBus = c.createGain()
    shotBus.gain.value = 1.9 // pre-limiter boost → loud, then tamed by the comp
    shotBus.connect(shotComp).connect(dest)
  }
  return shotBus
}

/** Classic soft-clip curve — adds firearm grit/saturation to the noise crack. */
function crackCurve(): Float32Array<ArrayBuffer> {
  if (!shotCurve) {
    const n = 2048
    shotCurve = new Float32Array(new ArrayBuffer(n * 4))
    const k = 2.4
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1
      shotCurve[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
    }
  }
  return shotCurve
}

/**
 * The core gunshot "report": a broadband noise burst with a HARD attack (full
 * level instantly, no ramp) and a tight exponential decay, driven through a
 * WaveShaper for grit. This is what makes it read as a firearm crack rather
 * than a tone. Self-cleans on end.
 */
function crack(
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
  const ws = c.createWaveShaper()
  ws.curve = crackCurve()
  ws.oversample = '2x'
  const g = c.createGain()
  // Hard, instantaneous attack = the percussive snap of a report.
  g.gain.setValueAtTime(vol, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  src.connect(f1).connect(f2).connect(ws).connect(g).connect(bus)
  src.start(when)
  src.stop(when + dur + 0.03)
  src.onended = () => {
    src.disconnect()
    f1.disconnect()
    f2.disconnect()
    ws.disconnect()
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

/**
 * Kick off a one-time fetch+decode of the recorded-style gunshot sample into
 * the pooled context. Fire-and-forget: sets `shotSampleState` and caches the
 * buffer on success; on any failure marks `failed` so callers fall back to the
 * synth forever (never retries, never throws into the hot path).
 */
function loadShotSample(c: AudioContext): void {
  if (shotSampleState !== 'idle') return
  shotSampleState = 'loading'
  fetch(SHOT_SAMPLE_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`shot sample ${r.status}`)
      return r.arrayBuffer()
    })
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      shotSampleBuf = buf
      shotSampleState = 'ready'
    })
    .catch(() => {
      shotSampleState = 'failed'
    })
}

/**
 * Synth fallback — used only until the sample decodes, or forever if it can't
 * load. A loud, gun-like report: a driven broadband crack + mechanical snap +
 * a short low thump, through the boosted+limited shot submix.
 */
function playShotSynth(c: AudioContext, bus: GainNode, now: number): void {
  const p = 0.94 + Math.random() * 0.12
  const lv = 0.9 + Math.random() * 0.2
  crack(c, bus, now, 0.06, 0.55 * lv, 850 * p, 8500 * p, 1600)
  crack(c, bus, now, 0.018, 0.34 * lv, 3600, 15000)
  blip(c, bus, now, 170 * p, 0.055, 'sine', 0.3 * lv, 55)
  noiseBurst(c, bus, now + 0.008, 0.06, 0.09 * lv, 180, 1200)
}

/**
 * Fire the decoded gunshot sample as a cheap one-shot BufferSource with slight
 * per-shot pitch (playbackRate) and gain jitter, so full-auto reads as a real
 * machine gun rather than a copy-pasted loop. Routed through the boosted+limited
 * shot submix; overlapping tails during rapid fire are tamed by the limiter.
 * Self-cleans on end. Near-zero latency (starts at `now`).
 */
function playShotSample(c: AudioContext, bus: GainNode, buf: AudioBuffer, now: number): void {
  const src = c.createBufferSource()
  src.buffer = buf
  // ~±7% pitch + a touch of playback speed variance = distinct rounds.
  src.playbackRate.value = 0.93 + Math.random() * 0.14
  const g = c.createGain()
  g.gain.value = 0.82 + Math.random() * 0.18 // aggressive; submix+limiter cap it
  src.connect(g).connect(bus)
  src.start(now)
  src.onended = () => {
    src.disconnect()
    g.disconnect()
  }
}

/**
 * Player gun shot — a real, punchy machine-gun report from a decoded sample
 * (baked by scripts/bake-gunshot.mjs). Loud and aggressive but protected by the
 * pooled boosted+limited submix so sustained fire never clips. Reuses the
 * pooled AudioContext, respects the global mute, and preserves near-zero
 * latency. Falls back to the synth until/if the sample can't be decoded, so
 * audio never breaks. Shared by every fire path — upgrades everywhere.
 */
export function playShot(): void {
  if (muted) return
  const c = ensure()
  if (!c || !master) return
  const bus = ensureShotBus(c, master)
  const now = c.currentTime
  if (shotSampleState === 'ready' && shotSampleBuf) {
    playShotSample(c, bus, shotSampleBuf, now)
    return
  }
  if (shotSampleState === 'idle') loadShotSample(c)
  // Sample not ready yet (or failed) → synth keeps the shot instant + unbroken.
  playShotSynth(c, bus, now)
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

// --- Weather bed ------------------------------------------------------------
// Phase 2: a quiet looping rain wash for the overworld weather system. One
// filtered-noise voice (created lazily on the first drop), its gain eased
// toward the eased SIM.rain level by the caller's polling. Sits under the
// music/SFX mix and respects the same persisted SFX mute.

let rainSrc: AudioBufferSourceNode | null = null
let rainGain: GainNode | null = null
let rainLp: BiquadFilterNode | null = null
let rainBuf: AudioBuffer | null = null
const RAIN_MAX_GAIN = 0.16

/** The generic noise() buffer is 0.2s — far too short to loop without an
 *  audible flutter. Rain gets its own 2s bed, built once. */
function rainNoise(): AudioBuffer | null {
  const c = ensure()
  if (!c) return null
  if (!rainBuf) {
    rainBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
    const d = rainBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  return rainBuf
}

/**
 * Drive the rain loop toward `level` (0..1). Fire-and-forget: creates the
 * loop when level first rises, ramps smoothly on every call, and tears the
 * nodes down once fully faded out. Muted → treated as level 0.
 */
export function setRainLevel(level: number): void {
  const target = muted ? 0 : Math.max(0, Math.min(1, level))
  if (target <= 0.001) {
    if (rainSrc && rainGain && ctx) {
      const now = ctx.currentTime
      rainGain.gain.cancelScheduledValues(now)
      rainGain.gain.setTargetAtTime(0.0001, now, 0.4)
      const src = rainSrc
      const g = rainGain
      const lp = rainLp
      rainSrc = null
      rainGain = null
      rainLp = null
      // Give the fade time to land before releasing the voice.
      src.stop(now + 1.6)
      src.onended = () => {
        src.disconnect()
        g.disconnect()
        lp?.disconnect()
      }
    }
    return
  }
  const c = ensure()
  if (!c || !master) return
  if (!rainSrc) {
    const buf = rainNoise()
    if (!buf) return
    rainSrc = c.createBufferSource()
    rainSrc.buffer = buf
    rainSrc.loop = true
    // Rain = broadband noise with the top rolled off; a soft high-pass keeps
    // the low rumble out of the music's way.
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 320
    rainLp = c.createBiquadFilter()
    rainLp.type = 'lowpass'
    rainLp.frequency.value = 2600
    rainGain = c.createGain()
    rainGain.gain.value = 0.0001
    rainSrc.connect(hp).connect(rainLp).connect(rainGain).connect(master)
    rainSrc.start()
  }
  const now = c.currentTime
  // Heavier rain also opens the filter a little — a brighter, denser wash.
  rainLp?.frequency.setTargetAtTime(2200 + target * 2400, now, 0.6)
  rainGain?.gain.setTargetAtTime(RAIN_MAX_GAIN * target, now, 0.5)
}

