/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { encodeCitizenBank, parseCitizenBank, type CitizenBankHeader } from './citizenBank'

const BIN_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../public/assets/models/citizen-bot.bin',
)

function syntheticBank() {
  const header: CitizenBankHeader = {
    version: 1,
    width: 8, // 2 carriers × 4 texels
    height: 3,
    carriers: 2,
    fps: 24,
    restHeight: 2,
    vertexCount: 3,
    indexCount: 3,
    clips: [
      { name: 'Idle', row: 0, frames: 2, fps: 24, duration: 0.05, loop: true },
      { name: 'Walk', row: 2, frames: 1, fps: 24, duration: 0.04, loop: true },
    ],
  }
  return {
    header,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    colors: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    bones: new Float32Array([0, 1, 1]),
    indices: new Uint32Array([0, 1, 2]),
    texture: new Float32Array(8 * 3 * 4).fill(0.5),
  }
}

describe('citizen crowd bundle format', () => {
  it('round-trips encode → parse byte-exactly', () => {
    const bank = syntheticBank()
    const parsed = parseCitizenBank(encodeCitizenBank(bank))
    expect(parsed.header).toEqual(bank.header)
    expect([...parsed.positions]).toEqual([...bank.positions])
    expect([...parsed.colors]).toEqual([...bank.colors])
    expect([...parsed.bones]).toEqual([...bank.bones])
    expect([...parsed.indices]).toEqual([...bank.indices])
    expect(parsed.texture.length).toBe(bank.texture.length)
    expect(parsed.clipByName.get('Walk')?.row).toBe(2)
  })

  it('rejects truncated buffers and missing required clips', () => {
    const bank = syntheticBank()
    const bytes = encodeCitizenBank(bank)
    expect(() => parseCitizenBank(bytes.slice(0, bytes.byteLength - 8))).toThrow(/truncated/)
    const noWalk = {
      ...bank,
      header: { ...bank.header, clips: bank.header.clips.filter((c) => c.name !== 'Walk') },
    }
    expect(() => parseCitizenBank(encodeCitizenBank(noWalk))).toThrow(/missing clip Walk/)
  })

  it('parses the SHIPPED citizen bundle (pins the asset the crowd renders)', () => {
    const raw = readFileSync(BIN_PATH)
    const bank = parseCitizenBank(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
    )
    expect(bank.header.version).toBe(1)
    expect(bank.header.carriers).toBeGreaterThanOrEqual(10)
    expect(bank.header.vertexCount).toBeGreaterThan(1000)
    expect(bank.header.restHeight).toBeGreaterThan(1)
    // The runtime depends on these clips existing.
    for (const clip of ['Idle', 'Walk', 'Run', 'Wave']) {
      expect(bank.clipByName.has(clip), `clip ${clip}`).toBe(true)
    }
    // Bone texture rows must cover every clip frame.
    const lastClip = bank.header.clips[bank.header.clips.length - 1]
    expect(lastClip.row + lastClip.frames).toBe(bank.header.height)
    // Every vertex references a valid carrier.
    for (let i = 0; i < bank.header.vertexCount; i++) {
      expect(bank.bones[i]).toBeGreaterThanOrEqual(0)
      expect(bank.bones[i]).toBeLessThan(bank.header.carriers)
    }
  })
})
