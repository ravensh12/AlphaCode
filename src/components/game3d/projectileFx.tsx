import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type JSX } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { radialGlowTexture } from './proceduralTextures'

/* ============================================================================
   ENEMY PROJECTILE VFX — shared, pooled, instanced.

   Replaces the old "flat glowing circle" enemy shots (boss orbs + spitter
   acid) with a layered read that stays cheap:

   - HOT CORE: a small near-white sphere, motion-stretched along velocity.
   - GLOW HALO: an additive camera-facing sprite with a soft radial falloff
     (the procedural glow texture) — a graded bloom, not a hard disc.
   - MOTION TRAIL: crossed vertex-alpha quads trailing opposite the velocity,
     length scaled by speed — the shot visibly TRAVELS.

   All three layers are InstancedMesh pools (3 draw calls per system, total),
   written imperatively by the OWNER's frame loop through a handle, so the
   visuals update in the same frame as the simulation that moves them. No
   lights, no postprocessing, zero steady-state allocations.

   ImpactFlashes is the companion one-shot system (muzzle glow + hit splash):
   an expanding additive sprite plus a small spray of sparks, pooled in ring
   buffers and self-animating (2 more draw calls).
   ========================================================================== */

const _q = new THREE.Quaternion()
const _roll = new THREE.Quaternion()
const _axisZ = new THREE.Vector3(0, 0, 1)
const _axisY = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()
const _obj = new THREE.Object3D()
const _hidden = new THREE.Matrix4().makeScale(0, 0, 0)
/** Flat-on-the-ground orientation for ground-splat flashes. */
const _groundQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

/** Largest camera-facing quad that cannot dip below the floor plane and get
 *  depth-cut by it in a hard straight line (the old "clipped glow" artifact). */
function groundSafeScale(desired: number, y: number): number {
  return Math.min(desired, Math.max(0.2, (y - 0.05) * 2))
}

/** Crossed soft streaks along -Z: each plane is a 3-vertex-wide strip whose
 *  EDGES carry zero alpha (lateral falloff) while the center fades head →
 *  tail — an airbrushed motion smear, not a hard-edged dart. */
function makeTrailGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  const planes: [number, number][] = [
    [1, 0],
    [0, 1],
  ]
  // Rows along the streak: z (0 = head, -1 = tail), half-width, center alpha.
  const rows: [number, number, number][] = [
    [0.12, 0.2, 0.0],
    [0.0, 0.3, 0.75],
    [-0.35, 0.24, 0.42],
    [-1.0, 0.05, 0.0],
  ]
  let v = 0
  for (const [wx, wy] of planes) {
    for (const [z, w, a] of rows) {
      pos.push(-wx * w, -wy * w, z, 0, 0, z, wx * w, wy * w, z)
      col.push(1, 1, 1, 0, 1, 1, 1, a, 1, 1, 1, 0)
    }
    for (let r = 0; r < rows.length - 1; r++) {
      const base = v + r * 3
      idx.push(base, base + 1, base + 4, base, base + 4, base + 3)
      idx.push(base + 1, base + 2, base + 5, base + 1, base + 5, base + 4)
    }
    v += rows.length * 3
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  geo.setIndex(idx)
  return geo
}

export interface EnemyProjectilesHandle {
  /** Call once per frame before set()/hide() — caches the camera quaternion. */
  begin(camQuat: THREE.Quaternion): void
  /** Write one live projectile slot (world pos + velocity + clock time). */
  set(i: number, pos: THREE.Vector3, vx: number, vy: number, vz: number, t: number): void
  /** Park an inactive slot off-screen. */
  hide(i: number): void
  /** Flush instance matrices after the last set()/hide() of the frame. */
  commit(): void
}

export interface EnemyProjectilesProps {
  pool: number
  /** Theme accent — tints the halo + trail. */
  color: string
  /** Hot-center tint (defaults to the accent pushed most of the way to white). */
  coreColor?: string
  /** Overall visual radius (matches the old orb size; hitboxes are unaffected). */
  size?: number
  /** Trail length multiplier. */
  trail?: number
  /** Toxic/organic styling: queasy asymmetric pulse instead of a clean spin. */
  organic?: boolean
}

/**
 * Layered enemy-projectile renderer. Purely presentational: the owner keeps
 * its own projectile pool/sim and writes world transforms through the handle
 * from inside its `useFrame`, so pooling and gameplay timing stay intact.
 */
export const EnemyProjectiles = forwardRef<EnemyProjectilesHandle, EnemyProjectilesProps>(
  function EnemyProjectiles({ pool, color, coreColor, size = 0.34, trail = 1, organic = false }, ref): JSX.Element {
    const coreMesh = useRef<THREE.InstancedMesh>(null)
    const haloMesh = useRef<THREE.InstancedMesh>(null)
    const trailMesh = useRef<THREE.InstancedMesh>(null)
    const shadeMesh = useRef<THREE.InstancedMesh>(null)
    const camQuat = useRef(new THREE.Quaternion())

    const resolvedCore = useMemo(() => {
      if (coreColor) return coreColor
      // Hot but not clipped white — keep enough theme tint that shot identity
      // survives at gameplay distance where the halo is thin.
      const c = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35)
      return `#${c.getHexString()}`
    }, [color, coreColor])

    const assets = useMemo(() => {
      const coreGeo = new THREE.SphereGeometry(1, 14, 10)
      // Organic (acid) cores burn over-unity so the shot survives a lit night
      // street; boss cores keep ~12% theme tint so shot identity survives the
      // additive white-out at gameplay distance.
      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(resolvedCore).multiplyScalar(organic ? 2.2 : 1.0),
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const haloGeo = new THREE.PlaneGeometry(1, 1)
      // Pushed past 1.0 so the halo's center burns hotter (additive, untonemapped).
      const haloMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(organic ? 1.5 : 1.25),
        alphaMap: radialGlowTexture(),
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: organic ? 0.85 : 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const trailGeo = makeTrailGeometry()
      const trailMat = new THREE.MeshBasicMaterial({
        color,
        vertexColors: true,
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      // Normal-blend dark disc UNDER the additive stack: additive layers can
      // only brighten, so on a pale arena floor the shot lost its silhouette.
      // This grounds it with a soft contrast rim; on dark scenes it vanishes.
      // Strong enough that orbs keep distinct rims even when volley halos touch.
      const shadeMat = new THREE.MeshBasicMaterial({
        color: '#000000',
        alphaMap: radialGlowTexture(),
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
      return { coreGeo, coreMat, haloGeo, haloMat, trailGeo, trailMat, shadeMat }
    }, [color, resolvedCore, organic])
    useEffect(
      () => () => {
        assets.coreGeo.dispose()
        assets.coreMat.dispose()
        assets.haloGeo.dispose()
        assets.haloMat.dispose()
        assets.trailGeo.dispose()
        assets.trailMat.dispose()
        assets.shadeMat.dispose()
      },
      [assets],
    )

    // Park every instance before the first visible frame.
    useEffect(() => {
      for (const m of [coreMesh.current, haloMesh.current, trailMesh.current, shadeMesh.current]) {
        if (!m) continue
        for (let i = 0; i < pool; i++) m.setMatrixAt(i, _hidden)
        m.instanceMatrix.needsUpdate = true
      }
    }, [pool])

    useImperativeHandle(
      ref,
      () => ({
        begin(q: THREE.Quaternion) {
          camQuat.current.copy(q)
        },
        set(i: number, pos: THREE.Vector3, vx: number, vy: number, vz: number, t: number) {
          const core = coreMesh.current
          const halo = haloMesh.current
          const tr = trailMesh.current
          const shade = shadeMesh.current
          if (!core || !halo || !tr || !shade) return
          const speed = Math.hypot(vx, vy, vz)
          if (speed > 0.001) {
            _dir.set(vx / speed, vy / speed, vz / speed)
            _q.setFromUnitVectors(_axisZ, _dir)
          } else {
            _q.identity()
          }

          // Per-slot phase so a volley never pulses in copy-paste lockstep.
          const ph = i * 1.71
          const pulse = organic
            ? 1 + Math.sin(t * 21 + ph) * 0.13
            : 1 + Math.sin(t * 13 + ph) * 0.08
          // Organic shots wobble asymmetrically — a gooey glob, not a machined bolt.
          const squishX = organic ? 1 + Math.sin(t * 17 + ph) * 0.18 : 1
          const squishY = organic ? 1 + Math.cos(t * 15 + ph) * 0.18 : 1

          // HOT CORE — stretched along the velocity, slowly rolling.
          _roll.setFromAxisAngle(_axisZ, t * (organic ? 3.2 : 5.5) + ph)
          _obj.position.copy(pos)
          _obj.quaternion.copy(_q).multiply(_roll)
          const cs = size * 0.36 * pulse
          _obj.scale.set(cs * squishX, cs * squishY, cs * (speed > 6 ? 1.75 : 1.25))
          _obj.updateMatrix()
          core.setMatrixAt(i, _obj.matrix)

          // CONTRAST SHADE — same billboard, slightly larger, normal-blended
          // dark falloff so the shot keeps a silhouette over bright ground.
          // (Both billboards clamp near the floor so a low shot's quad never
          // depth-cuts into the ground plane as a hard straight edge.)
          _obj.quaternion.copy(camQuat.current)
          const ss = groundSafeScale(size * 4.6 * pulse, pos.y)
          _obj.scale.set(ss * squishX, ss * squishY, 1)
          _obj.updateMatrix()
          shade.setMatrixAt(i, _obj.matrix)

          // GLOW HALO — camera-facing soft falloff sprite. Kept tight so a
          // dense volley never fuses into one additive blob: the dodge gaps
          // between orbs must stay legible.
          const hs = groundSafeScale(size * (organic ? 3.9 : 2.9) * pulse, pos.y)
          _obj.scale.set(hs * squishX, hs * squishY, 1)
          _obj.updateMatrix()
          halo.setMatrixAt(i, _obj.matrix)

          // TRAIL — length rides the speed so slow lobs stay compact. Organic
          // shots whip their smear side-to-side so it reads as slung goo.
          _obj.quaternion.copy(_q)
          if (organic) {
            // Yaw around the local up axis = the smear whips laterally.
            _roll.setFromAxisAngle(_axisY, Math.sin(t * 9 + ph) * 0.45)
            _obj.quaternion.multiply(_roll)
          }
          const len = THREE.MathUtils.clamp(speed * 0.085, 0.45, 2.4) * trail
          _obj.scale.set(size * 2.4, size * 2.4, len)
          _obj.updateMatrix()
          tr.setMatrixAt(i, _obj.matrix)
        },
        hide(i: number) {
          coreMesh.current?.setMatrixAt(i, _hidden)
          haloMesh.current?.setMatrixAt(i, _hidden)
          trailMesh.current?.setMatrixAt(i, _hidden)
          shadeMesh.current?.setMatrixAt(i, _hidden)
        },
        commit() {
          for (const m of [coreMesh.current, haloMesh.current, trailMesh.current, shadeMesh.current]) {
            if (m) m.instanceMatrix.needsUpdate = true
          }
        },
      }),
      [size, trail, organic],
    )

    return (
      <>
        <instancedMesh ref={shadeMesh} args={[assets.haloGeo, assets.shadeMat, pool]} frustumCulled={false} renderOrder={3} />
        <instancedMesh ref={trailMesh} args={[assets.trailGeo, assets.trailMat, pool]} frustumCulled={false} renderOrder={4} />
        <instancedMesh ref={haloMesh} args={[assets.haloGeo, assets.haloMat, pool]} frustumCulled={false} renderOrder={5} />
        <instancedMesh ref={coreMesh} args={[assets.coreGeo, assets.coreMat, pool]} frustumCulled={false} renderOrder={6} />
      </>
    )
  },
)

/* ------------------------------------------------------------ ImpactFlashes */

export interface ImpactFlashesHandle {
  /** One-shot flash + spark spray (muzzle glow, projectile impact, fizzle). */
  spawn(x: number, y: number, z: number, color: string, scale?: number, sparks?: number): void
}

export interface ImpactFlashesProps {
  /** Max simultaneous flashes (ring buffer). */
  pool?: number
}

const FLASH_LIFE = 0.24
const SPARK_LIFE = 0.34
const SPARKS_PER = 6
const SPARK_GRAV = -16

type Flash = {
  born: number
  x: number
  y: number
  z: number
  scale: number
  r: number
  g: number
  b: number
  /** In-plane roll so star bars + blooms never repeat the same orientation. */
  rot: number
  /** Width:height of the quad — 1 for blooms, thin for the star bars. */
  aspect: number
  /** Low hits lie flat on the floor (splat) instead of billboarding into it. */
  ground: boolean
}
type FSpark = { born: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number }

/** Pooled, self-animating impact flashes + sparks (2 draw calls total). */
export const ImpactFlashes = forwardRef<ImpactFlashesHandle, ImpactFlashesProps>(
  function ImpactFlashes({ pool = 12 }, ref): JSX.Element {
    const flashMesh = useRef<THREE.InstancedMesh>(null)
    const sparkMesh = useRef<THREE.InstancedMesh>(null)
    const clockRef = useRef(0)
    const flashCursor = useRef(0)
    const sparkCursor = useRef(0)
    const tmpColor = useRef(new THREE.Color())

    const sparkPool = pool * SPARKS_PER
    const flashes = useMemo<Flash[]>(
      () =>
        Array.from({ length: pool }, () => ({
          born: -10,
          x: 0,
          y: 0,
          z: 0,
          scale: 1,
          r: 1,
          g: 1,
          b: 1,
          rot: 0,
          aspect: 1,
          ground: false,
        })),
      [pool],
    )
    const sparks = useMemo<FSpark[]>(
      () =>
        Array.from({ length: sparkPool }, () => ({ born: -10, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 })),
      [sparkPool],
    )

    const assets = useMemo(() => {
      const flashGeo = new THREE.PlaneGeometry(1, 1)
      const flashMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        alphaMap: radialGlowTexture(),
        toneMapped: false,
        fog: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sparkGeo = new THREE.SphereGeometry(1, 6, 5)
      const sparkMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      return { flashGeo, flashMat, sparkGeo, sparkMat }
    }, [])
    useEffect(
      () => () => {
        assets.flashGeo.dispose()
        assets.flashMat.dispose()
        assets.sparkGeo.dispose()
        assets.sparkMat.dispose()
      },
      [assets],
    )

    // Park + seed instance colours before the first visible frame so the
    // instanceColor buffer exists (no mid-fight shader recompile).
    useEffect(() => {
      const fm = flashMesh.current
      const sm = sparkMesh.current
      tmpColor.current.set('#ffffff')
      if (fm) {
        for (let i = 0; i < pool; i++) {
          fm.setMatrixAt(i, _hidden)
          fm.setColorAt(i, tmpColor.current)
        }
        fm.instanceMatrix.needsUpdate = true
        if (fm.instanceColor) fm.instanceColor.needsUpdate = true
      }
      if (sm) {
        for (let i = 0; i < sparkPool; i++) {
          sm.setMatrixAt(i, _hidden)
          sm.setColorAt(i, tmpColor.current)
        }
        sm.instanceMatrix.needsUpdate = true
        if (sm.instanceColor) sm.instanceColor.needsUpdate = true
      }
    }, [pool, sparkPool])

    useImperativeHandle(
      ref,
      () => ({
        spawn(x: number, y: number, z: number, color: string, scale = 1, sparkCount = SPARKS_PER) {
          const now = clockRef.current
          const sm = sparkMesh.current
          tmpColor.current.set(color)
          // Hits near the floor render as flat ground splats: a camera-facing
          // quad this low would dip under the floor plane and depth-cut into a
          // hard straight line (the "clipped glow" artifact).
          const ground = y < 0.45
          const rot = Math.random() * Math.PI * 2
          // Three stacked elements per hit: colored bloom + tight white-hot pop
          // + a thin star bar — the flash has a skeleton, not just soft blur.
          const fi = flashCursor.current
          flashCursor.current = (fi + 3) % pool
          const f = flashes[fi]
          f.born = now
          f.x = x
          f.y = y
          f.z = z
          f.scale = scale
          f.r = tmpColor.current.r
          f.g = tmpColor.current.g
          f.b = tmpColor.current.b
          f.rot = rot
          f.aspect = 1
          f.ground = ground
          const f2 = flashes[(fi + 1) % pool]
          f2.born = now
          f2.x = x
          f2.y = y
          f2.z = z
          f2.scale = scale * 0.45
          f2.r = 1.6
          f2.g = 1.6
          f2.b = 1.6
          f2.rot = rot
          f2.aspect = 1
          f2.ground = ground
          const f3 = flashes[(fi + 2) % pool]
          f3.born = now
          f3.x = x
          f3.y = y
          f3.z = z
          f3.scale = scale * 1.5
          f3.r = 1.8
          f3.g = 1.8
          f3.b = 1.8
          f3.rot = rot + 0.35
          f3.aspect = 0.14
          f3.ground = ground
          for (let k = 0; k < sparkCount; k++) {
            const si = sparkCursor.current
            sparkCursor.current = (si + 1) % sparkPool
            const s = sparks[si]
            const ang = Math.random() * Math.PI * 2
            const out = (2.2 + Math.random() * 3.6) * scale
            s.born = now
            s.x = x
            s.y = y
            s.z = z
            s.vx = Math.cos(ang) * out
            s.vy = (0.8 + Math.random() * 2.6) * scale
            s.vz = Math.sin(ang) * out
            s.size = 0.5 + Math.random()
            if (sm) sm.setColorAt(si, tmpColor.current)
          }
          if (sm && sm.instanceColor) sm.instanceColor.needsUpdate = true
        },
      }),
      [flashes, sparks, pool, sparkPool],
    )

    useFrame((state) => {
      const now = state.clock.elapsedTime
      clockRef.current = now
      const fm = flashMesh.current
      const sm = sparkMesh.current
      if (!fm || !sm) return

      const col = tmpColor.current
      for (let i = 0; i < pool; i++) {
        const f = flashes[i]
        const t = (now - f.born) / FLASH_LIFE
        if (t < 0 || t >= 1) {
          fm.setMatrixAt(i, _hidden)
          continue
        }
        // Punch out fast, then fade to black (additive → invisible).
        const grow = 1 - (1 - Math.min(1, t * 3)) ** 2
        let s = (0.4 + grow * 1.8) * f.scale
        if (f.ground) {
          // Ground splat: lies flat just above the floor.
          _obj.position.set(f.x, Math.max(f.y, 0.06), f.z)
          _obj.quaternion.copy(_groundQuat)
        } else {
          // Billboard, clamped so the quad never dips below the floor plane
          // (depth-cut = visible straight edge inside the gradient).
          s = groundSafeScale(s, f.y)
          _obj.position.set(f.x, f.y, f.z)
          _obj.quaternion.copy(state.camera.quaternion)
        }
        _roll.setFromAxisAngle(_axisZ, f.rot)
        _obj.quaternion.multiply(_roll)
        _obj.scale.set(s, s * f.aspect, 1)
        _obj.updateMatrix()
        fm.setMatrixAt(i, _obj.matrix)
        col.setRGB(f.r, f.g, f.b).multiplyScalar(1 - t * t)
        fm.setColorAt(i, col)
      }
      fm.instanceMatrix.needsUpdate = true
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true

      for (let i = 0; i < sparkPool; i++) {
        const s = sparks[i]
        const t = (now - s.born) / SPARK_LIFE
        if (t < 0 || t >= 1) {
          sm.setMatrixAt(i, _hidden)
          continue
        }
        const age = t * SPARK_LIFE
        const vy = s.vy + SPARK_GRAV * age
        const py = s.y + s.vy * age + 0.5 * SPARK_GRAV * age * age
        if (py < 0.02) {
          sm.setMatrixAt(i, _hidden)
          continue
        }
        _obj.position.set(s.x + s.vx * age, py, s.z + s.vz * age)
        // Stretch each spark along its CURRENT velocity — debris that flies
        // and arcs, not confetti that floats.
        const vlen = Math.hypot(s.vx, vy, s.vz)
        if (vlen > 0.001) {
          _dir.set(s.vx / vlen, vy / vlen, s.vz / vlen)
          _q.setFromUnitVectors(_axisZ, _dir)
          _obj.quaternion.copy(_q)
        } else {
          _obj.quaternion.identity()
        }
        const sc = 0.05 * s.size * (1 - t)
        _obj.scale.set(sc, sc, sc * 3.2)
        _obj.updateMatrix()
        sm.setMatrixAt(i, _obj.matrix)
      }
      sm.instanceMatrix.needsUpdate = true
    })

    return (
      <>
        <instancedMesh ref={flashMesh} args={[assets.flashGeo, assets.flashMat, pool]} frustumCulled={false} renderOrder={6} />
        <instancedMesh ref={sparkMesh} args={[assets.sparkGeo, assets.sparkMat, sparkPool]} frustumCulled={false} renderOrder={6} />
      </>
    )
  },
)
