/* ============================================================================
   Phase 3 — citizen crowd bundle parser (pure, Node-testable).

   Parses the single-file crowd bundle written by scripts/bake-citizen-anim.mjs:

     [u32 headerLen][JSON header][pos f32×3][normal f32×3][color f32×3]
     [bone f32×1][index u32][bone-matrix texture f32 RGBA]

   The header's vertex/index counts size every section, so parsing is pure
   offset math over one ArrayBuffer — no copies except the typed-array views.
   Geometry/texture construction stays in CitizenCrowd (three-side); this
   module owns the format so tests can feed synthetic buffers.
   ========================================================================== */

export interface CitizenClipMeta {
  name: string
  row: number
  frames: number
  fps: number
  duration: number
  loop: boolean
}

export interface CitizenBankHeader {
  version: number
  /** Bone texture width in texels (carriers × 4). */
  width: number
  /** Bone texture height in texels (total baked frames). */
  height: number
  carriers: number
  fps: number
  restHeight: number
  vertexCount: number
  indexCount: number
  clips: CitizenClipMeta[]
}

export interface CitizenBank {
  header: CitizenBankHeader
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  bones: Float32Array
  indices: Uint32Array
  /** RGBA32F bone-matrix texels (width × height × 4 floats). */
  texture: Float32Array
  clipByName: Map<string, CitizenClipMeta>
}

/** Parse a crowd bundle. Throws on malformed sizes so tests catch drift. */
export function parseCitizenBank(buf: ArrayBuffer): CitizenBank {
  const headerLen = new DataView(buf).getUint32(0, true)
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)),
  ) as CitizenBankHeader
  if (header.version !== 1) throw new Error(`citizen bank: unsupported version ${header.version}`)

  const v = header.vertexCount
  let offset = 4 + headerLen
  const take = (elements: number, bytesPer: number) => {
    const start = offset
    offset += elements * bytesPer
    if (offset > buf.byteLength) throw new Error('citizen bank: truncated buffer')
    return start
  }

  const positions = new Float32Array(buf, take(v * 3, 4), v * 3)
  const normals = new Float32Array(buf, take(v * 3, 4), v * 3)
  const colors = new Float32Array(buf, take(v * 3, 4), v * 3)
  const bones = new Float32Array(buf, take(v, 4), v)
  const indices = new Uint32Array(buf, take(header.indexCount, 4), header.indexCount)
  const texels = header.width * header.height * 4
  const texture = new Float32Array(buf, take(texels, 4), texels)
  if (offset !== buf.byteLength) {
    throw new Error(`citizen bank: ${buf.byteLength - offset} trailing bytes`)
  }

  const clipByName = new Map(header.clips.map((c) => [c.name, c]))
  for (const required of ['Idle', 'Walk']) {
    if (!clipByName.has(required)) throw new Error(`citizen bank: missing clip ${required}`)
  }
  return { header, positions, normals, colors, bones, indices, texture, clipByName }
}

/** Encode a bank back to bytes (test round-trip helper / synthetic fixtures). */
export function encodeCitizenBank(bank: Omit<CitizenBank, 'clipByName'>): ArrayBuffer {
  let headerJson = JSON.stringify(bank.header)
  while ((4 + headerJson.length) % 4 !== 0) headerJson += ' '
  const headerBytes = new TextEncoder().encode(headerJson)
  const sections = [
    bank.positions,
    bank.normals,
    bank.colors,
    bank.bones,
    bank.indices,
    bank.texture,
  ]
  const total = 4 + headerBytes.length + sections.reduce((s, a) => s + a.byteLength, 0)
  const out = new ArrayBuffer(total)
  new DataView(out).setUint32(0, headerBytes.length, true)
  new Uint8Array(out, 4, headerBytes.length).set(headerBytes)
  let offset = 4 + headerBytes.length
  for (const section of sections) {
    new Uint8Array(out, offset, section.byteLength).set(
      new Uint8Array(section.buffer, section.byteOffset, section.byteLength),
    )
    offset += section.byteLength
  }
  return out
}
