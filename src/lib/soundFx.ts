/**
 * Tiny Web-Audio sound effects (no assets). Self-contained AudioContext, created
 * lazily on first use — by then the player has already clicked, so it resumes
 * fine under autoplay rules.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      master = ctx.createGain()
      master.gain.value = 0.5
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

/** A snappy laser-blaster "pew": fast downward pitch sweep + a noise click. */
export function playShot() {
  const c = ensure()
  if (!c || !master) return
  const now = c.currentTime

  // Tonal zap.
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.12)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.linearRampToValueAtTime(0.18, now + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
  osc.connect(g).connect(master)
  osc.start(now)
  osc.stop(now + 0.16)

  // Transient click for punch.
  const buf = noise()
  if (buf) {
    const src = c.createBufferSource()
    src.buffer = buf
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1800
    const ng = c.createGain()
    ng.gain.setValueAtTime(0.16, now)
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
    src.connect(hp).connect(ng).connect(master)
    src.start(now)
    src.stop(now + 0.06)
  }
}
