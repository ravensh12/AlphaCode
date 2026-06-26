import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type JSX,
  type RefObject,
} from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality, type QualityTier } from './quality'

/* ============================================================================
   Pooled, ref-driven VFX building blocks.

   Every effect here is allocation-free in steady state: pools are built once in
   useMemo, simulation runs in useFrame mutating refs, and NO React state is
   touched per frame. Emissive bits are `toneMapped={false}` + additive so the
   <CinematicStage> bloom pass picks them up.
   ========================================================================== */

const UP = new THREE.Vector3(0, 1, 0)
const HIDDEN_Y = -9999

/** Per-tier multiplier for particle/instance counts. */
function countScale(t: QualityTier): number {
  return t === 'high' ? 1 : t === 'med' ? 0.6 : 0.32
}

/* ------------------------------------------------------------- EmberField -- */

export interface EmberFieldProps {
  /** Base ember count at 'high' tier (scaled down on lower tiers). */
  count?: number
  /** Radius of the cylindrical area embers drift within. */
  area?: number
  /** Vertical extent embers rise through before wrapping. */
  height?: number
  color?: string
}

interface Ember {
  x: number
  z: number
  y: number
  rise: number
  swayAmp: number
  swayFreq: number
  phase: number
  scale: number
}

/** Instanced drifting embers / dust motes. Auto-animates; quality-scaled. */
export function EmberField({
  count = 220,
  area = 24,
  height = 16,
  color = '#ffb066',
}: EmberFieldProps): JSX.Element {
  const tier = useQuality()
  const n = Math.max(8, Math.round(count * countScale(tier)))

  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useRef(new THREE.Object3D())

  const embers = useMemo<Ember[]>(() => {
    const out: Ember[] = []
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * area
      const a = Math.random() * Math.PI * 2
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: Math.random() * height,
        rise: 0.4 + Math.random() * 1.1,
        swayAmp: 0.3 + Math.random() * 0.9,
        swayFreq: 0.4 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        scale: 0.025 + Math.random() * 0.06,
      })
    }
    return out
  }, [n, area, height])

  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), [])
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color,
        toneMapped: false,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    [color],
  )
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])

  useFrame((state, dtRaw) => {
    const m = meshRef.current
    if (!m) return
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const d = dummy.current
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i]
      e.y += e.rise * dt
      if (e.y > height) e.y -= height
      const sx = Math.sin(t * e.swayFreq + e.phase) * e.swayAmp
      const sz = Math.cos(t * e.swayFreq * 0.8 + e.phase) * e.swayAmp
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + e.phase) // gentle twinkle
      d.position.set(e.x + sx, e.y, e.z + sz)
      d.scale.setScalar(e.scale * tw)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geo, mat, n]} frustumCulled={false} renderOrder={4} />
}

/* ------------------------------------------------------------- SparkBurst -- */

export interface SparkBurstHandle {
  /** Spawn a burst of sparks at a world position. */
  burst(position: THREE.Vector3, color?: string, count?: number): void
}

export interface SparkBurstProps {
  /** Pool size (max simultaneous sparks). */
  pool?: number
  gravity?: number
}

interface Spark {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  life: number
  max: number
  scale: number
}

/** Pooled spark particles fired imperatively via `ref.burst(...)`. */
export const SparkBurst = forwardRef<SparkBurstHandle, SparkBurstProps>(function SparkBurst(
  { pool = 160, gravity = -18 },
  ref,
): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useRef(new THREE.Object3D())
  const tmpColor = useRef(new THREE.Color())

  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: pool }, () => ({
        active: false,
        pos: new THREE.Vector3(0, HIDDEN_Y, 0),
        vel: new THREE.Vector3(),
        life: 0,
        max: 1,
        scale: 1,
      })),
    [pool],
  )

  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), [])
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        vertexColors: true,
        toneMapped: false,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])

  useImperativeHandle(
    ref,
    () => ({
      burst(position: THREE.Vector3, color = '#ffd9a0', count = 16) {
        const m = meshRef.current
        tmpColor.current.set(color)
        for (let i = 0, c = 0; i < sparks.length && c < count; i++) {
          const s = sparks[i]
          if (s.active) continue
          c++
          s.active = true
          s.pos.copy(position)
          const a = Math.random() * Math.PI * 2
          const up = Math.random() * 0.9 + 0.15
          const spread = 4 + Math.random() * 6
          s.vel.set(Math.cos(a) * spread, up * spread, Math.sin(a) * spread)
          s.life = 0.28 + Math.random() * 0.26
          s.max = s.life
          s.scale = 0.05 + Math.random() * 0.1
          if (m) m.setColorAt(i, tmpColor.current)
        }
        if (m && m.instanceColor) m.instanceColor.needsUpdate = true
      },
    }),
    [sparks],
  )

  useFrame((_state, dtRaw) => {
    const m = meshRef.current
    if (!m) return
    const dt = Math.min(dtRaw, 0.05)
    const d = dummy.current
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i]
      if (!s.active) {
        d.position.set(0, HIDDEN_Y, 0)
        d.scale.setScalar(0)
        d.updateMatrix()
        m.setMatrixAt(i, d.matrix)
        continue
      }
      s.vel.y += gravity * dt
      s.pos.addScaledVector(s.vel, dt)
      s.life -= dt
      if (s.life <= 0) {
        s.active = false
        d.position.set(0, HIDDEN_Y, 0)
        d.scale.setScalar(0)
        d.updateMatrix()
        m.setMatrixAt(i, d.matrix)
        continue
      }
      const k = s.life / s.max
      d.position.copy(s.pos)
      d.scale.setScalar(s.scale * k)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geo, mat, pool]} frustumCulled={false} renderOrder={6} />
})

/* ----------------------------------------------------------- ShockwaveRing - */

export interface ShockwaveRingHandle {
  /** Fire an expanding ground ring at a world position. */
  fire(position: THREE.Vector3, radius?: number, color?: string): void
}

export interface ShockwaveRingProps {
  /** Pool size (max simultaneous rings). */
  pool?: number
  /** Seconds for a ring to fully expand + fade. */
  duration?: number
}

interface Shock {
  active: boolean
  x: number
  z: number
  y: number
  t: number
  maxR: number
}

/** Pooled expanding shockwave rings fired via `ref.fire(...)`. */
export const ShockwaveRing = forwardRef<ShockwaveRingHandle, ShockwaveRingProps>(
  function ShockwaveRing({ pool = 4, duration = 0.7 }, ref): JSX.Element {
    const meshRefs = useRef<(THREE.Mesh | null)[]>([])
    const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])

    const shocks = useMemo<Shock[]>(
      () =>
        Array.from({ length: pool }, () => ({
          active: false,
          x: 0,
          z: 0,
          y: 0.08,
          t: 0,
          maxR: 6,
        })),
      [pool],
    )

    useImperativeHandle(
      ref,
      () => ({
        fire(position: THREE.Vector3, radius = 6, color = '#9fd4ff') {
          const i = shocks.findIndex((s) => !s.active)
          if (i < 0) return
          const s = shocks[i]
          s.active = true
          s.x = position.x
          s.y = position.y + 0.08
          s.z = position.z
          s.t = 0
          s.maxR = radius
          const mat = matRefs.current[i]
          if (mat) mat.color.set(color)
        },
      }),
      [shocks],
    )

    useFrame((_state, dtRaw) => {
      const dt = Math.min(dtRaw, 0.05)
      for (let i = 0; i < shocks.length; i++) {
        const s = shocks[i]
        const mesh = meshRefs.current[i]
        const mat = matRefs.current[i]
        if (!mesh || !mat) continue
        if (!s.active) {
          mesh.visible = false
          continue
        }
        s.t += dt
        const p = Math.min(1, s.t / duration)
        const r = 0.4 + p * s.maxR
        mesh.visible = true
        mesh.position.set(s.x, s.y, s.z)
        mesh.scale.set(r, r, r)
        mat.opacity = (1 - p) * 0.9
        if (p >= 1) {
          s.active = false
          mesh.visible = false
        }
      }
    })

    return (
      <>
        {shocks.map((_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              meshRefs.current[i] = el
            }}
            rotation-x={-Math.PI / 2}
            visible={false}
            frustumCulled={false}
            renderOrder={5}
          >
            <ringGeometry args={[0.82, 1, 48]} />
            <meshBasicMaterial
              ref={(el) => {
                matRefs.current[i] = el
              }}
              color="#9fd4ff"
              transparent
              opacity={0}
              toneMapped={false}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              fog={false}
            />
          </mesh>
        ))}
      </>
    )
  },
)

/* ------------------------------------------------------------ WeaponTrail -- */

export interface WeaponTrailHandle {
  /** Push the current tip world-position; call each frame while swinging. */
  setTip(v: THREE.Vector3): void
}

export interface WeaponTrailProps {
  /** Number of trail segments (more = longer, smoother ribbon). */
  segments?: number
  /** Ribbon half-width at the head. */
  width?: number
  color?: string
  /** Seconds the ribbon takes to fade once setTip stops being called. */
  fade?: number
  /**
   * Optional object whose world position is read as the tip each frame, as an
   * alternative to calling `setTip` manually.
   */
  tipRef?: RefObject<THREE.Object3D | null>
}

/** A fading ribbon trail that follows a tip point each frame. */
export const WeaponTrail = forwardRef<WeaponTrailHandle, WeaponTrailProps>(function WeaponTrail(
  { segments = 20, width = 0.18, color = '#cdfbff', fade = 0.22, tipRef },
  ref,
): JSX.Element {
  const meshRef = useRef<THREE.Mesh>(null)
  const tip = useRef(new THREE.Vector3(0, HIDDEN_Y, 0))
  const hasTip = useRef(false)
  const idle = useRef(fade) // start fully faded
  const history = useRef<THREE.Vector3[]>(
    Array.from({ length: segments }, () => new THREE.Vector3(0, HIDDEN_Y, 0)),
  )

  // Scratch.
  const tangent = useRef(new THREE.Vector3())
  const side = useRef(new THREE.Vector3())
  const tmpWorld = useRef(new THREE.Vector3())

  const baseColor = useMemo(() => new THREE.Color(color), [color])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const verts = segments * 2
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 4), 4))
    const idx: number[] = []
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2
      const b = i * 2 + 1
      const c = (i + 1) * 2
      const d = (i + 1) * 2 + 1
      idx.push(a, b, c, b, d, c)
    }
    g.setIndex(idx)
    return g
  }, [segments])

  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        toneMapped: false,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )
  useEffect(() => () => {
    geo.dispose()
    mat.dispose()
  }, [geo, mat])

  useImperativeHandle(
    ref,
    () => ({
      setTip(v: THREE.Vector3) {
        tip.current.copy(v)
        hasTip.current = true
        idle.current = 0
      },
    }),
    [],
  )

  useFrame((_state, dtRaw) => {
    const mesh = meshRef.current
    if (!mesh) return
    const dt = Math.min(dtRaw, 0.05)

    // Pull tip from a tracked object if provided.
    if (tipRef?.current) {
      tipRef.current.getWorldPosition(tmpWorld.current)
      tip.current.copy(tmpWorld.current)
      hasTip.current = true
      idle.current = 0
    } else {
      idle.current += dt
    }

    const hist = history.current
    // Shift history toward the tail, push current tip onto the head.
    for (let i = hist.length - 1; i > 0; i--) hist[i].copy(hist[i - 1])
    if (hasTip.current) hist[0].copy(tip.current)

    const globalAlpha = THREE.MathUtils.clamp(1 - idle.current / fade, 0, 1)
    if (globalAlpha <= 0) {
      mesh.visible = false
      return
    }
    mesh.visible = true

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute
    const pos = posAttr.array as Float32Array
    const col = colAttr.array as Float32Array
    const last = hist.length - 1

    for (let i = 0; i < hist.length; i++) {
      const node = hist[i]
      const prev = hist[Math.max(0, i - 1)]
      const next = hist[Math.min(last, i + 1)]
      tangent.current.copy(prev).sub(next)
      if (tangent.current.lengthSq() < 1e-8) tangent.current.set(0, 0, 1)
      side.current.crossVectors(tangent.current, UP)
      if (side.current.lengthSq() < 1e-8) side.current.set(1, 0, 0)
      side.current.normalize()
      const taper = 1 - i / last
      const w = width * taper
      const a = i * 2 * 3
      const b = a + 3
      pos[a] = node.x + side.current.x * w
      pos[a + 1] = node.y + side.current.y * w
      pos[a + 2] = node.z + side.current.z * w
      pos[b] = node.x - side.current.x * w
      pos[b + 1] = node.y - side.current.y * w
      pos[b + 2] = node.z - side.current.z * w

      const alpha = taper * globalAlpha
      const ca = i * 2 * 4
      const cb = ca + 4
      col[ca] = baseColor.r
      col[ca + 1] = baseColor.g
      col[ca + 2] = baseColor.b
      col[ca + 3] = alpha
      col[cb] = baseColor.r
      col[cb + 1] = baseColor.g
      col[cb + 2] = baseColor.b
      col[cb + 3] = alpha
    }
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true
  })

  return (
    <mesh ref={meshRef} geometry={geo} material={mat} frustumCulled={false} renderOrder={7} />
  )
})

/* ------------------------------------------------------------- GroundDecal - */

export interface GroundDecalHandle {
  /** Show a telegraph decal on the floor for `duration` seconds. */
  show(position: THREE.Vector3, radius: number, color: string, duration: number): void
}

export interface GroundDecalProps {
  /** Pool size (max simultaneous decals). */
  pool?: number
}

interface Decal {
  active: boolean
  x: number
  z: number
  y: number
  r: number
  t: number
  dur: number
}

/** Pooled floor telegraph decals shown via `ref.show(...)`. */
export const GroundDecal = forwardRef<GroundDecalHandle, GroundDecalProps>(function GroundDecal(
  { pool = 8 },
  ref,
): JSX.Element {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([])

  const decals = useMemo<Decal[]>(
    () =>
      Array.from({ length: pool }, () => ({
        active: false,
        x: 0,
        z: 0,
        y: 0.05,
        r: 1,
        t: 0,
        dur: 1,
      })),
    [pool],
  )

  useImperativeHandle(
    ref,
    () => ({
      show(position: THREE.Vector3, radius: number, color: string, duration: number) {
        const i = decals.findIndex((d) => !d.active)
        if (i < 0) return
        const d = decals[i]
        d.active = true
        d.x = position.x
        d.y = position.y + 0.05
        d.z = position.z
        d.r = radius
        d.t = 0
        d.dur = duration
        const mat = matRefs.current[i]
        if (mat) mat.color.set(color)
      },
    }),
    [decals],
  )

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i]
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue
      if (!d.active) {
        mesh.visible = false
        continue
      }
      d.t += dt
      const p = Math.min(1, d.t / d.dur)
      mesh.visible = true
      mesh.position.set(d.x, d.y, d.z)
      mesh.scale.set(d.r, d.r, d.r)
      // Pulse while warning, fade out as it fills.
      mat.opacity = (0.35 + Math.sin(t * 16) * 0.14 + p * 0.35) * (1 - p * p)
      if (d.t >= d.dur) {
        d.active = false
        mesh.visible = false
      }
    }
  })

  return (
    <>
      {decals.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
          frustumCulled={false}
          renderOrder={3}
        >
          <ringGeometry args={[0.72, 1, 48]} />
          <meshBasicMaterial
            ref={(el) => {
              matRefs.current[i] = el
            }}
            color="#ff5a4a"
            transparent
            opacity={0}
            toneMapped={false}
            side={THREE.DoubleSide}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      ))}
    </>
  )
})
