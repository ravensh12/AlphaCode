import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { PlacedCrystal } from '../../../lib/crystalPlacement'
import {
  CRYSTAL_BODY_Y,
  CRYSTAL_GLYPH_RISE,
  CRYSTAL_LABEL_Y,
  crystalBodyScale,
  crystalChannels,
  crystalCountLabelVisible,
  crystalPhase,
} from './memoryCrystalsCore'

/* ============================================================================
   MemoryCrystals — every placed crystal in ONE InstancedMesh.

   State → look comes from memoryCrystalsCore (growing dim violet, ripe
   pulsing amber, pendingCloud ripe + cloud glyph, cleared faint lime).
   Per-frame motion (bob/spin/pulse) writes instance matrices through hoisted
   scratch objects — no allocations, no React state. Cloud glyphs are a second
   tiny instanced quad batch billboarded in the same pass, and cluster counts
   are drei Html capped to ripe-bodied clusters only (see the core's rule).
   ========================================================================== */

export interface MemoryCrystalsProps {
  /** Full placeMemoryCrystals output — ALL states; scenery states included. */
  crystals: readonly PlacedCrystal[]
  /** Floating cluster-count labels (tier gate; DOM cost). Default on. */
  labels?: boolean
}

interface CrystalRenderSeed {
  x: number
  z: number
  phase: number
  scale: number
  bobAmplitude: number
  pulseAmplitude: number
  spinRate: number
}

/** Soft white cloud glyph on a transparent square (drawn once, shared). */
function makeCloudGlyphTexture(): THREE.CanvasTexture {
  const size = 96
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#ffffff'
  // Three puffs over a flat base read as "cloud" from any distance.
  ctx.beginPath()
  ctx.arc(size * 0.34, size * 0.56, size * 0.17, 0, Math.PI * 2)
  ctx.arc(size * 0.52, size * 0.44, size * 0.2, 0, Math.PI * 2)
  ctx.arc(size * 0.68, size * 0.58, size * 0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(size * 0.3, size * 0.56, size * 0.42, size * 0.16)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Crystals farther than this from the camera park at zero scale — no
 *  bob/spin math, no matrix uploads (harvest/interaction logic untouched). */
const CRYSTAL_ACTIVE_RADIUS = 150

export const MemoryCrystals = memo(function MemoryCrystals({
  crystals,
  labels = true,
}: MemoryCrystalsProps) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const glyphRef = useRef<THREE.InstancedMesh>(null)

  const assets = useMemo(() => {
    const bodyGeo = new THREE.OctahedronGeometry(0.4, 0)
    bodyGeo.scale(1, 1.6, 1) // stretched shard silhouette
    const bodyMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      toneMapped: false,
    })
    const glyphGeo = new THREE.PlaneGeometry(0.62, 0.62)
    const glyphTex = makeCloudGlyphTexture()
    const glyphMat = new THREE.MeshBasicMaterial({
      map: glyphTex,
      color: '#ffe6b8',
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { bodyGeo, bodyMat, glyphGeo, glyphTex, glyphMat }
  }, [])
  useEffect(
    () => () => {
      assets.bodyGeo.dispose()
      assets.bodyMat.dispose()
      assets.glyphGeo.dispose()
      assets.glyphTex.dispose()
      assets.glyphMat.dispose()
    },
    [assets],
  )

  // Static per-crystal motion seeds + the pendingCloud subset for glyphs.
  const seeds = useMemo<CrystalRenderSeed[]>(
    () =>
      crystals.map((crystal) => {
        const channels = crystalChannels(crystal.state)
        return {
          x: crystal.x,
          z: crystal.z,
          phase: crystalPhase(crystal.id),
          scale: crystalBodyScale(crystal),
          bobAmplitude: channels.bobAmplitude,
          pulseAmplitude: channels.pulseAmplitude,
          spinRate: channels.spinRate,
        }
      }),
    [crystals],
  )
  const glyphSeeds = useMemo(
    () =>
      crystals
        .filter((crystal) => crystalChannels(crystal.state).cloudGlyph)
        .map((crystal) => ({
          x: crystal.x,
          z: crystal.z,
          phase: crystalPhase(crystal.id),
        })),
    [crystals],
  )
  const labelled = useMemo(
    () => (labels ? crystals.filter(crystalCountLabelVisible) : []),
    [crystals, labels],
  )

  // Instance tints change only when the crystal list (states) changes.
  useLayoutEffect(() => {
    const mesh = bodyRef.current
    if (!mesh) return
    const tint = new THREE.Color()
    crystals.forEach((crystal, i) => {
      const channels = crystalChannels(crystal.state)
      tint.set(channels.color).multiplyScalar(channels.boost)
      mesh.setColorAt(i, tint)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [crystals])

  // Hoisted scratch — the per-frame loop allocates nothing.
  const scratch = useRef(new THREE.Object3D())
  // 1 = instance parked at zero scale (outside the proximity bubble).
  const parkedBody = useRef(new Uint8Array(0))
  const parkedGlyph = useRef(new Uint8Array(0))

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const d = scratch.current
    const camX = state.camera.position.x
    const camZ = state.camera.position.z
    const r2 = CRYSTAL_ACTIVE_RADIUS * CRYSTAL_ACTIVE_RADIUS

    const body = bodyRef.current
    if (body) {
      if (parkedBody.current.length !== seeds.length) {
        parkedBody.current = new Uint8Array(seeds.length)
      }
      const parked = parkedBody.current
      let wrote = false
      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i]
        const dx = seed.x - camX
        const dz = seed.z - camZ
        // Far crystals park once at zero scale — no bob/spin math, no writes.
        if (dx * dx + dz * dz > r2) {
          if (!parked[i]) {
            parked[i] = 1
            d.position.set(seed.x, -10, seed.z)
            d.rotation.set(0, 0, 0)
            d.scale.setScalar(0.0001)
            d.updateMatrix()
            body.setMatrixAt(i, d.matrix)
            wrote = true
          }
          continue
        }
        parked[i] = 0
        d.position.set(
          seed.x,
          CRYSTAL_BODY_Y + Math.sin(t * 1.6 + seed.phase) * seed.bobAmplitude,
          seed.z,
        )
        d.rotation.set(0, seed.phase + t * seed.spinRate, 0)
        d.scale.setScalar(
          seed.scale *
            (1 +
              seed.pulseAmplitude *
                (0.5 + 0.5 * Math.sin(t * 3.4 + seed.phase))),
        )
        d.updateMatrix()
        body.setMatrixAt(i, d.matrix)
        wrote = true
      }
      if (wrote) body.instanceMatrix.needsUpdate = true
    }

    const glyphs = glyphRef.current
    if (glyphs) {
      if (parkedGlyph.current.length !== glyphSeeds.length) {
        parkedGlyph.current = new Uint8Array(glyphSeeds.length)
      }
      const parked = parkedGlyph.current
      let wrote = false
      // Billboard the handful of cloud glyphs toward the camera.
      d.rotation.set(0, 0, 0)
      d.quaternion.copy(state.camera.quaternion)
      d.scale.setScalar(1)
      for (let i = 0; i < glyphSeeds.length; i++) {
        const seed = glyphSeeds[i]
        const dx = seed.x - camX
        const dz = seed.z - camZ
        if (dx * dx + dz * dz > r2) {
          if (!parked[i]) {
            parked[i] = 1
            d.position.set(seed.x, -10, seed.z)
            d.scale.setScalar(0.0001)
            d.updateMatrix()
            glyphs.setMatrixAt(i, d.matrix)
            d.quaternion.copy(state.camera.quaternion)
            d.scale.setScalar(1)
            wrote = true
          }
          continue
        }
        parked[i] = 0
        d.position.set(
          seed.x,
          CRYSTAL_BODY_Y +
            CRYSTAL_GLYPH_RISE +
            Math.sin(t * 1.6 + seed.phase) * 0.07,
          seed.z,
        )
        d.updateMatrix()
        glyphs.setMatrixAt(i, d.matrix)
        wrote = true
      }
      if (wrote) glyphs.instanceMatrix.needsUpdate = true
    }
  })

  if (crystals.length === 0) return null
  return (
    <group>
      <instancedMesh
        key={crystals.length}
        ref={bodyRef}
        args={[assets.bodyGeo, assets.bodyMat, crystals.length]}
        frustumCulled={false}
      />
      {glyphSeeds.length > 0 && (
        <instancedMesh
          key={`glyphs-${glyphSeeds.length}`}
          ref={glyphRef}
          args={[assets.glyphGeo, assets.glyphMat, glyphSeeds.length]}
          frustumCulled={false}
          renderOrder={2}
        />
      )}
      {labelled.map((crystal) => (
        <Html
          key={crystal.id}
          position={[crystal.x, CRYSTAL_LABEL_Y, crystal.z]}
          center
          distanceFactor={42}
          occlude={false}
          zIndexRange={[30, 0]}
        >
          <div
            style={{
              padding: '2px 10px',
              borderRadius: 999,
              background: 'rgba(20, 14, 4, 0.78)',
              border: '1px solid rgba(255, 179, 71, 0.85)',
              color: '#ffd9a0',
              font: '700 13px/1.5 system-ui, sans-serif',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            ×{crystal.count}
          </div>
        </Html>
      ))}
    </group>
  )
})
