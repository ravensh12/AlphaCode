#!/usr/bin/env node
/**
 * Bake a rich, "recorded-style" single machine-gun / assault-rifle shot to a
 * tiny mono WAV. Pure Node, no deps. The runtime decodes this once and fires
 * cheap BufferSources per shot (with pitch/gain jitter) — so we play a real
 * decoded sample instead of rebuilding oscillators live.
 *
 * The synthesis is intentionally layered to read as a firearm, not a beep:
 *   1. Ignition crack   — hard-attack broadband noise, very fast decay (the report).
 *   2. Body boom        — low-passed noise tail for the heavy mid "whump".
 *   3. Sub thump        — a short pitch-dropping sine for chest punch.
 *   4. Mechanism click  — an ultra-short bright tick (the action cycling).
 *   5. Room slap tail   — a few decaying delayed reflections so it sounds like
 *                         it was fired in a space (the "scary"/aggressive size).
 * Everything is soft-clipped for grit, then peak-normalized.
 *
 * Output: public/assets/audio/gunshot.wav
 * Usage:  node scripts/bake-gunshot.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const DUR = 0.34 // seconds — punchy but with a real tail; overlaps into full-auto
const N = Math.floor(SR * DUR)

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const outDir = path.join(repoRoot, 'public', 'assets', 'audio')
const outPath = path.join(outDir, 'gunshot.wav')

// Deterministic PRNG so rebuilds are byte-stable (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(0x9e3779b9)
const white = new Float32Array(N)
for (let i = 0; i < N; i++) white[i] = rnd() * 2 - 1

const out = new Float32Array(N)

// --- 1) Ignition crack: hard attack, very fast decay, broadband. ------------
// One-pole high-passed white noise (emphasise the snap) + raw for fullness.
{
  const tau = 0.03
  let hpPrev = 0
  let hpY = 0
  const hpCoef = 0.85 // higher = brighter
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const env = Math.exp(-t / tau)
    const x = white[i]
    hpY = hpCoef * (hpY + x - hpPrev)
    hpPrev = x
    out[i] += (0.75 * hpY + 0.35 * x) * env
  }
}

// --- 2) Body boom: low-passed noise tail for the heavy mid whump. -----------
{
  const tau = 0.11
  let lp = 0
  const lpCoef = 0.16 // one-pole LP, low cutoff → dark body
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const env = Math.exp(-t / tau)
    lp += lpCoef * (white[i] - lp)
    out[i] += lp * env * 0.9
  }
}

// --- 3) Sub thump: pitch-dropping sine for chest punch. ---------------------
{
  const tau = 0.07
  let phase = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    const f = 120 * Math.exp(-t / 0.04) + 42 // glides ~162Hz → 42Hz fast
    phase += (2 * Math.PI * f) / SR
    const env = Math.exp(-t / tau)
    out[i] += Math.sin(phase) * env * 0.8
  }
}

// --- 4) Mechanism click: ultra-short bright tick. ---------------------------
{
  const tau = 0.0035
  let hpPrev = 0
  let hpY = 0
  for (let i = 0; i < N; i++) {
    const t = i / SR
    if (t > 0.02) break
    const env = Math.exp(-t / tau)
    const x = white[i]
    hpY = 0.92 * (hpY + x - hpPrev)
    hpPrev = x
    out[i] += hpY * env * 0.5
  }
}

// --- 5) Room slap tail: decaying delayed reflections of what we have. -------
// Adds the sense of firing in a real space — the aggressive "size".
{
  const taps = [
    { ms: 11, g: 0.5 },
    { ms: 23, g: 0.34 },
    { ms: 37, g: 0.22 },
    { ms: 53, g: 0.15 },
    { ms: 71, g: 0.09 },
  ]
  const dry = out.slice()
  for (const { ms, g } of taps) {
    const d = Math.floor((ms / 1000) * SR)
    for (let i = d; i < N; i++) out[i] += dry[i - d] * g
  }
}

// --- Saturation (grit) + peak normalize. ------------------------------------
{
  const drive = 1.8
  for (let i = 0; i < N; i++) {
    const x = out[i] * drive
    // Rational soft clip — smooth, musical saturation.
    out[i] = x / (1 + Math.abs(x))
  }
  let peak = 0
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]))
  const norm = peak > 0 ? 0.97 / peak : 1
  // Tiny fade-out on the last 4ms so the tail never clicks off.
  const fade = Math.floor(SR * 0.004)
  for (let i = 0; i < N; i++) {
    let s = out[i] * norm
    if (i > N - fade) s *= (N - i) / fade
    out[i] = s
  }
}

// --- Encode 16-bit mono PCM WAV. --------------------------------------------
function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2
  const dataLen = samples.length * bytesPerSample
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // PCM chunk size
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28) // byte rate
  buf.writeUInt16LE(bytesPerSample, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    buf.writeInt16LE(s | 0, off)
    off += 2
  }
  return buf
}

const wav = encodeWav(out, SR)
await mkdir(outDir, { recursive: true })
await writeFile(outPath, wav)
console.log(
  `Wrote ${path.relative(repoRoot, outPath)} — ${(wav.length / 1024).toFixed(1)} KB, ${DUR}s mono @ ${SR}Hz`,
)
