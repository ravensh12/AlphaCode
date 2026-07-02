import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ============================================================================
   Impact feedback — the arcade juice layer.

   Two pooled, instanced systems (one draw call each, zero allocations):
   - DATA SPLATTER: every bolt that connects bursts a handful of glowing
     shards out of the wound. Zombies are corrupted data, so they bleed
     fragments of the simulation — cyan-green normally, gold on crits.
   - DAMAGE NUMBERS: a digit pops off the impact point and floats up, drawn
     from a canvas-baked 0-9 atlas via a per-instance UV offset. Crits are
     gold and bigger. Reading your damage is half the fun of a looter-shooter.
   ========================================================================== */

export type CombatFxApi = {
  /** Spawn splatter (+ a damage number when dmg > 0) at the impact point. */
  impact: (x: number, y: number, z: number, dmg: number, crit: boolean, kill: boolean) => void
}

const SHARD_POOL = 140
const SHARDS_PER_HIT = 6
const SHARD_LIFE = 0.42
const GRAVITY = -14

const NUM_POOL = 28
const NUM_LIFE = 0.75

type Shard = { born: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; big: number; gold: number }
type Num = { born: number; x: number; y: number; z: number; digit: number; crit: boolean }

/** Bake a 0-9 digit strip (plus a slash glyph at index 10 for dash kills). */
function makeDigitAtlas(): THREE.CanvasTexture {
  const CELL = 64
  const canvas = document.createElement('canvas')
  canvas.width = CELL * 11
  canvas.height = CELL
  const c = canvas.getContext('2d')!
  c.clearRect(0, 0, canvas.width, canvas.height)
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = '900 52px "Arial Black", system-ui, sans-serif'
  for (let d = 0; d <= 10; d++) {
    const label = d === 10 ? '/' : String(d)
    const cx = d * CELL + CELL / 2
    c.lineWidth = 10
    c.strokeStyle = 'rgba(8,12,24,0.9)'
    c.strokeText(label, cx, CELL / 2 + 2)
    c.fillStyle = '#ffffff'
    c.fillText(label, cx, CELL / 2 + 2)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  return tex
}

export const CombatFx = memo(
  forwardRef<CombatFxApi>(function CombatFx(_props, ref) {
    const shardMesh = useRef<THREE.InstancedMesh>(null)
    const numMesh = useRef<THREE.InstancedMesh>(null)

    const shards = useMemo<Shard[]>(
      () =>
        Array.from({ length: SHARD_POOL }, () => ({
          born: -10, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, big: 0, gold: 0,
        })),
      [],
    )
    const nums = useMemo<Num[]>(
      () => Array.from({ length: NUM_POOL }, () => ({ born: -10, x: 0, y: 0, z: 0, digit: 0, crit: false })),
      [],
    )
    const shardCursor = useRef(0)
    const numCursor = useRef(0)
    const clockRef = useRef(0)

    const assets = useMemo(() => {
      // Shard: a slim emissive triangle — reads as a flying fragment at any angle.
      const shardGeo = new THREE.BufferGeometry()
      shardGeo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 0.09, 0, -0.035, -0.05, 0, 0.035, -0.05, 0], 3),
      )
      shardGeo.computeVertexNormals()
      const shardMat = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })

      const numGeo = new THREE.PlaneGeometry(0.62, 0.62)
      // Per-instance digit → UV column offset (atlas is 11 cells wide).
      const digitAttr = new THREE.InstancedBufferAttribute(new Float32Array(NUM_POOL), 1)
      digitAttr.setUsage(THREE.DynamicDrawUsage)
      numGeo.setAttribute('aDigit', digitAttr)
      const atlas = makeDigitAtlas()
      const numMat = new THREE.MeshBasicMaterial({
        map: atlas,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      })
      numMat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aDigit;')
          .replace(
            '#include <uv_vertex>',
            `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vec2( ( vMapUv.x + aDigit ) / 11.0, vMapUv.y );\n#endif`,
          )
      }
      numMat.customProgramCacheKey = () => 'fx-digit-v1'
      return { shardGeo, shardMat, numGeo, numMat, atlas, digitAttr }
    }, [])

    useEffect(
      () => () => {
        assets.shardGeo.dispose()
        assets.shardMat.dispose()
        assets.numGeo.dispose()
        assets.numMat.dispose()
        assets.atlas.dispose()
      },
      [assets],
    )

    const scratch = useMemo(
      () => ({
        o: new THREE.Object3D(),
        col: new THREE.Color(),
        hidden: new THREE.Matrix4().makeScale(0, 0, 0),
        normal: new THREE.Color(0.45, 1.7, 1.35), // data-splatter cyan-green
        gold: new THREE.Color(2.0, 1.45, 0.35), // crit gold
        white: new THREE.Color(1.6, 1.6, 1.7),
      }),
      [],
    )

    // Hide + colour every instance up front so the instanceColor buffer exists
    // before the first visible frame (no mid-fight shader recompile hitch).
    useEffect(() => {
      const sm = shardMesh.current
      const nm = numMesh.current
      if (!sm || !nm) return
      for (let i = 0; i < SHARD_POOL; i++) {
        sm.setMatrixAt(i, scratch.hidden)
        sm.setColorAt(i, scratch.normal)
      }
      for (let i = 0; i < NUM_POOL; i++) {
        nm.setMatrixAt(i, scratch.hidden)
        nm.setColorAt(i, scratch.white)
      }
      sm.instanceMatrix.needsUpdate = true
      nm.instanceMatrix.needsUpdate = true
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true
      if (nm.instanceColor) nm.instanceColor.needsUpdate = true
    }, [scratch])

    useImperativeHandle(
      ref,
      () => ({
        impact(x, y, z, dmg, crit, kill) {
          const now = clockRef.current
          const burst = kill ? SHARDS_PER_HIT + 3 : SHARDS_PER_HIT
          for (let k = 0; k < burst; k++) {
            const s = shards[shardCursor.current]
            shardCursor.current = (shardCursor.current + 1) % SHARD_POOL
            const ang = Math.random() * Math.PI * 2
            const up = 2.2 + Math.random() * 3.4
            const out = 1.2 + Math.random() * 2.6
            s.born = now
            s.x = x
            s.y = y
            s.z = z
            s.vx = Math.cos(ang) * out
            s.vy = up
            s.vz = Math.sin(ang) * out
            s.big = kill ? 1 : 0
            s.gold = crit ? 1 : 0
          }
          if (dmg > 0) {
            const n = nums[numCursor.current]
            numCursor.current = (numCursor.current + 1) % NUM_POOL
            n.born = now
            n.x = x + (Math.random() - 0.5) * 0.3
            n.y = y + 0.35
            n.z = z + (Math.random() - 0.5) * 0.3
            n.digit = Math.min(9, Math.max(0, Math.round(dmg)))
            n.crit = crit
          }
        },
      }),
      [shards, nums],
    )

    useFrame((state) => {
      const now = state.clock.elapsedTime
      clockRef.current = now
      const sm = shardMesh.current
      const nm = numMesh.current
      if (!sm || !nm) return
      const { o, col, hidden, normal, gold, white } = scratch

      for (let i = 0; i < SHARD_POOL; i++) {
        const s = shards[i]
        const t = (now - s.born) / SHARD_LIFE
        if (t < 0 || t >= 1) {
          sm.setMatrixAt(i, hidden)
          continue
        }
        const age = t * SHARD_LIFE
        const px = s.x + s.vx * age
        const py = s.y + s.vy * age + 0.5 * GRAVITY * age * age
        const pz = s.z + s.vz * age
        if (py < 0.02) {
          sm.setMatrixAt(i, hidden)
          continue
        }
        o.position.set(px, py, pz)
        // Tumble: cheap deterministic spin from the slot index.
        o.rotation.set(now * (5 + (i % 5)), now * (7 + (i % 3)), i)
        const sc = (1 - t) * (0.9 + s.big * 0.7)
        o.scale.set(sc, sc, sc)
        o.updateMatrix()
        sm.setMatrixAt(i, o.matrix)
        col.copy(s.gold ? gold : normal).multiplyScalar(1 - t * 0.55)
        sm.setColorAt(i, col)
      }
      sm.instanceMatrix.needsUpdate = true
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true

      const digits = assets.digitAttr.array as Float32Array
      for (let i = 0; i < NUM_POOL; i++) {
        const n = nums[i]
        const t = (now - n.born) / NUM_LIFE
        if (t < 0 || t >= 1) {
          nm.setMatrixAt(i, hidden)
          continue
        }
        // Pop out, drift up, fade — always facing the camera.
        const rise = 0.9 * t + 0.25 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5)
        o.position.set(n.x, n.y + rise, n.z)
        o.quaternion.copy(state.camera.quaternion)
        const punch = t < 0.18 ? 0.7 + (t / 0.18) * 0.5 : 1.2 - (t - 0.18) * 0.25
        const sc = punch * (n.crit ? 1.5 : 1)
        o.scale.set(sc, sc, sc)
        o.updateMatrix()
        nm.setMatrixAt(i, o.matrix)
        digits[i] = n.digit
        col.copy(n.crit ? gold : white).multiplyScalar(1 - Math.max(0, t - 0.6) * 2.2)
        nm.setColorAt(i, col)
      }
      nm.instanceMatrix.needsUpdate = true
      assets.digitAttr.needsUpdate = true
      if (nm.instanceColor) nm.instanceColor.needsUpdate = true
    })

    return (
      <>
        <instancedMesh ref={shardMesh} args={[assets.shardGeo, assets.shardMat, SHARD_POOL]} frustumCulled={false} />
        <instancedMesh ref={numMesh} args={[assets.numGeo, assets.numMat, NUM_POOL]} frustumCulled={false} renderOrder={2} />
      </>
    )
  }),
)
