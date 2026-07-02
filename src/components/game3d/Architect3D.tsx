import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  chromeMaterial,
  glassMaterial,
  moltenCore,
  makeSpring3,
  useQuality,
  type Spring3,
} from './cinematic'
import { applyRimLight, rimHandleOf } from './simulation'

/* ============================================================================
   THE ARCHITECT — the human mastermind behind Code City (the master VEX served).

   A realistic HUMAN supervillain, deliberately UNLIKE the armored VEX: real human
   proportions, a tailored high-collar long coat with metal trim, a half-face mask
   + glowing augmetic eye (kept partly masked to dodge the uncanny valley). He
   fights with telekinetic "reality-editing" — orbiting code-glyph blades and raw
   force, no greatsword. Realism comes from PBR fabric/metal under the cinematic
   IBL, believable breathing/weight, and spring-driven coat-tail + scarf.

   Phases (4):
     1 — composed, hands behind back, glyphs orbit calmly.
     2 — coat flares, more glyph-blades, faster.
     3 — mask cracks, augmetics flare, glitchy reality distortion.
     4 — desperation: he partly dissolves into raw code, maximum aggression.

   Fully REF-DRIVEN: the arena bumps refs; this never re-renders mid-fight.
   ========================================================================== */

export type ArchitectAnim = 'idle' | 'stride' | 'cast' | 'blink' | 'heavy' | 'stagger'
export type ArchitectPhase = 1 | 2 | 3 | 4

export interface Architect3DProps {
  accent?: string
  phaseRef: MutableRefObject<ArchitectPhase>
  animRef: MutableRefObject<ArchitectAnim>
  /** Bumped on each player hit landed. */
  hitRef: MutableRefObject<number>
  /** Bumped when the Architect begins an attack. */
  attackRef: MutableRefObject<number>
  /** Bumped on a successful player parry -> stagger recoil. */
  staggerRef: MutableRefObject<number>
  /** Bumped on a phase transition -> glyph/reality burst. */
  phaseBreakRef: MutableRefObject<number>
  dead: boolean
}

/** Death sequence (s): torn apart, sink to a knee, dissolve to light. */
export const ARCHITECT_DEATH_DUR = 3.5
/** Heavy force-slam length (s); the parry window lives inside it. */
export const ARCHITECT_HEAVY_DUR = 0.66

const ACCENT = '#8ea2ff'
const COAT = '#10121d'
const COAT_HI = '#1c2030'
const SKIN = '#c8a48c'
const HAIR = '#0c0c12'
/** Rim color the phase blend rages toward. */
const C_RIM_RAGE = new THREE.Color('#ff3b4e')

const C_WHITE = new THREE.Color('#ffffff')
const UP = new THREE.Vector3(0, 1, 0)

const GLYPH_POOL = 28

/* -------------------------------------------------- spring chain helper */

interface Chain {
  nodes: Spring3[]
  meshRefs: MutableRefObject<(THREE.Mesh | null)[]>
  segLen: number
  widthTop: number
  widthBot: number
}
function makeChain(
  n: number,
  anchor: THREE.Vector3,
  segLen: number,
  widthTop: number,
  widthBot: number,
  meshRefs: MutableRefObject<(THREE.Mesh | null)[]>,
  stiffness: number,
): Chain {
  const nodes: Spring3[] = []
  for (let i = 0; i < n; i++) {
    const start = anchor.clone()
    start.y -= segLen * i
    nodes.push(makeSpring3(start, stiffness))
  }
  return { nodes, meshRefs, segLen, widthTop, widthBot }
}
type ChainScratch = { dir: THREE.Vector3; mid: THREE.Vector3; q: THREE.Quaternion; tgt: THREE.Vector3 }
function drawChain(
  chain: Chain,
  ax: number,
  ay: number,
  az: number,
  billowZ: number,
  windX: number,
  windZ: number,
  dt: number,
  s: ChainScratch,
): void {
  const { nodes, meshRefs, segLen, widthTop, widthBot } = chain
  const last = nodes.length - 1
  nodes[0].setScalar(ax + windX, ay, az)
  nodes[0].step(dt)
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1].value
    const k = i / last
    s.tgt.set(prev.x + windX * k, prev.y - segLen, prev.z - billowZ * k - windZ * k)
    nodes[i].set(s.tgt)
    nodes[i].step(dt)
  }
  for (let i = 0; i < last; i++) {
    const mesh = meshRefs.current[i]
    if (!mesh) continue
    const a = nodes[i].value
    const b = nodes[i + 1].value
    s.dir.copy(b).sub(a)
    const len = s.dir.length() || 0.0001
    s.dir.multiplyScalar(1 / len)
    s.mid.copy(a).add(b).multiplyScalar(0.5)
    s.q.setFromUnitVectors(UP, s.dir)
    mesh.position.copy(s.mid)
    mesh.quaternion.copy(s.q)
    const k = i / last
    const w = widthTop + (widthBot - widthTop) * k
    mesh.scale.set(w, len, 0.05)
  }
}

interface GlyphSpec {
  radius: number
  height: number
  speed: number
  phase0: number
  tilt: number
  scale: number
  deathDir: THREE.Vector3
}

export const Architect3D = memo(function Architect3D({
  accent = ACCENT,
  phaseRef,
  animRef,
  hitRef,
  attackRef,
  staggerRef,
  phaseBreakRef,
  dead,
}: Architect3DProps) {
  const tier = useQuality()

  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const handR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const coatFront = useRef<THREE.Group>(null)
  const eyeLight = useRef<THREE.PointLight>(null)
  const maskCrack = useRef<THREE.Mesh>(null)

  // Coat-tail + scarf chains.
  const coatRefs = useRef<(THREE.Mesh | null)[]>([])
  const scarfRefs = useRef<(THREE.Mesh | null)[]>([])
  const chains = useMemo(() => {
    const coat = makeChain(9, new THREE.Vector3(0, 1.18, -0.18), 0.16, 0.7, 0.34, coatRefs, 75)
    const scarf = makeChain(5, new THREE.Vector3(0.16, 1.5, -0.06), 0.16, 0.18, 0.07, scarfRefs, 120)
    return { coat, scarf }
  }, [])

  /* --- shared material instances (mutated directly; no per-mesh allocation) --- */
  // Coat / skin / mask carry the phase-colored rim (M7) — retuned per frame
  // from the flare/rage blends via the userData handle, zero recompiles.
  const matCoat = useMemo(() => applyRimLight(new THREE.MeshStandardMaterial({ color: COAT, roughness: 0.8, metalness: 0.16 }), accent, 0.5), [accent])
  const matCoatHi = useMemo(() => applyRimLight(new THREE.MeshStandardMaterial({ color: COAT_HI, roughness: 0.74, metalness: 0.2, side: THREE.DoubleSide }), accent, 0.5), [accent])
  const matSkin = useMemo(() => applyRimLight(new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.62, metalness: 0 }), accent, 0.3), [accent])
  const matHair = useMemo(() => new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.5, metalness: 0.1 }), [])
  const matMask = useMemo(() => applyRimLight(new THREE.MeshPhysicalMaterial(chromeMaterial('#cdd6e6')), accent, 0.45), [accent])
  const matTrim = useMemo(() => new THREE.MeshPhysicalMaterial(chromeMaterial('#3a4255')), [])
  const matVisor = useMemo(() => new THREE.MeshPhysicalMaterial(glassMaterial(accent)), [accent])
  const matEye = useMemo(() => new THREE.MeshStandardMaterial(moltenCore(accent, 2)), [accent])
  const matCape = useMemo(() => new THREE.MeshStandardMaterial({ color: COAT, roughness: 0.78, metalness: 0.18, side: THREE.DoubleSide }), [])
  const rimMats = useMemo(() => [matCoat, matCoatHi, matSkin, matMask], [matCoat, matCoatHi, matSkin, matMask])
  const accentCol = useMemo(() => new THREE.Color(accent), [accent])

  // Glyph swarm.
  const glyphsMesh = useRef<THREE.InstancedMesh>(null)
  const glyphs = useMemo<GlyphSpec[]>(() => {
    const out: GlyphSpec[] = []
    for (let i = 0; i < GLYPH_POOL; i++) {
      const ring = i % 3
      out.push({
        radius: 1.4 + ring * 0.55 + Math.random() * 0.3,
        height: 0.6 + Math.random() * 2.2,
        speed: (0.4 + Math.random() * 0.4) * (i % 2 === 0 ? 1 : -1),
        phase0: (i / GLYPH_POOL) * Math.PI * 2,
        tilt: Math.random() * Math.PI,
        scale: 0.5 + Math.random() * 0.6,
        deathDir: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
      })
    }
    return out
  }, [])
  const glyphGeo = useMemo(() => new THREE.BoxGeometry(0.07, 0.6, 0.03), [])
  const glyphMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0b0e1c', emissive: new THREE.Color(accent), emissiveIntensity: 2, roughness: 0.3, metalness: 0.6, toneMapped: false }),
    [accent],
  )
  const coatGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

  useEffect(
    () => () => {
      matCoat.dispose(); matCoatHi.dispose(); matSkin.dispose(); matHair.dispose()
      matMask.dispose(); matTrim.dispose(); matVisor.dispose(); matEye.dispose(); matCape.dispose()
      glyphGeo.dispose(); glyphMat.dispose(); coatGeo.dispose()
    },
    [matCoat, matCoatHi, matSkin, matHair, matMask, matTrim, matVisor, matEye, matCape, glyphGeo, glyphMat, coatGeo],
  )

  // Reaction timers.
  const prevHit = useRef(hitRef.current)
  const prevAtk = useRef(attackRef.current)
  const prevStagger = useRef(staggerRef.current)
  const prevBreak = useRef(phaseBreakRef.current)
  const prevAnim = useRef<ArchitectAnim>('idle')
  const hitT = useRef(-100)
  const atkT = useRef(-100)
  const staggerT = useRef(-100)
  const breakT = useRef(-100)
  const animStart = useRef(-100)
  const flareAmt = useRef(0)
  const rage = useRef(0)
  const dissolve = useRef(0)
  const deathStart = useRef<number | null>(null)

  // Scratch.
  const dObj = useRef(new THREE.Object3D())
  const tmpColor = useRef(new THREE.Color())
  const chainScratch = useRef<ChainScratch>({ dir: new THREE.Vector3(), mid: new THREE.Vector3(), q: new THREE.Quaternion(), tgt: new THREE.Vector3() })

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const r = root.current
    if (!r) return
    const phase = phaseRef.current
    const sc = chainScratch.current

    /* ---------------------------------------------------- DEATH SEQUENCE */
    if (dead) {
      if (deathStart.current == null) deathStart.current = t
      const e = t - deathStart.current
      const eN = Math.min(1, e / ARCHITECT_DEATH_DUR)

      const shud = e < 0.7 ? (Math.random() - 0.5) * 0.4 : 0
      r.position.x = shud
      r.position.z = shud
      const kneel = THREE.MathUtils.clamp((e - 0.5) / 1.2, 0, 1)
      r.position.y = -kneel * 0.9
      if (body.current) body.current.rotation.x = kneel * 0.6
      if (legR.current) legR.current.rotation.x = -kneel * 1.4

      const m = glyphsMesh.current
      if (m) {
        const d = dObj.current
        for (let i = 0; i < glyphs.length; i++) {
          const g = glyphs[i]
          const dist = 1 + e * (5 + g.radius)
          d.position.set(g.deathDir.x * dist, 1.2 + g.deathDir.y * dist, g.deathDir.z * dist)
          d.rotation.set(t * 3, t * 3, t * 2)
          d.scale.setScalar(Math.max(0.001, g.scale * (1 - eN)))
          d.updateMatrix()
          m.setMatrixAt(i, d.matrix)
        }
        m.instanceMatrix.needsUpdate = true
      }
      matEye.emissive.copy(e % 0.1 < 0.05 ? C_WHITE : tmpColor.current.set(accent))
      matEye.emissiveIntensity = Math.max(0, (1 - eN) * 6)
      if (eyeLight.current) eyeLight.current.intensity = Math.max(0, (1 - eN) * 6)
      r.scale.setScalar(1 - eN * 0.25)
      return
    }

    /* ---------------------------------------------------- LIVE */

    if (hitRef.current !== prevHit.current) {
      prevHit.current = hitRef.current
      hitT.current = t
    }
    if (attackRef.current !== prevAtk.current) {
      prevAtk.current = attackRef.current
      atkT.current = t
    }
    if (staggerRef.current !== prevStagger.current) {
      prevStagger.current = staggerRef.current
      staggerT.current = t
    }
    if (phaseBreakRef.current !== prevBreak.current) {
      prevBreak.current = phaseBreakRef.current
      breakT.current = t
    }
    const anim = animRef.current
    if (anim !== prevAnim.current) {
      prevAnim.current = anim
      animStart.current = t
    }

    const hitK = THREE.MathUtils.clamp(1 - (t - hitT.current) / 0.28, 0, 1)
    const atkAge = t - atkT.current
    const atkK = atkAge >= 0 && atkAge < 0.45 ? Math.sin((atkAge / 0.45) * Math.PI) : 0
    const parryK = THREE.MathUtils.clamp(1 - (t - staggerT.current) / 0.6, 0, 1)
    const breakK = THREE.MathUtils.clamp(1 - (t - breakT.current) / 0.6, 0, 1)

    rage.current += ((phase >= 3 ? (phase - 2) / 2 : 0) - rage.current) * Math.min(1, dt * 1.5)
    const rg = rage.current
    dissolve.current += ((phase >= 4 ? 1 : 0) - dissolve.current) * Math.min(1, dt * 1.2)
    const diss = dissolve.current
    const flareTarget = phase === 1 ? 0 : phase === 2 ? 0.5 : phase === 3 ? 0.8 : 1
    flareAmt.current += (flareTarget - flareAmt.current) * Math.min(1, dt * 2)
    const flare = flareAmt.current

    // Phase-colored rim (M7): cool accent while composed, searing red as the
    // rage blend climbs. Uniform writes only — never a recompile.
    for (let ri = 0; ri < rimMats.length; ri++) {
      const rim = rimHandleOf(rimMats[ri])
      if (!rim) continue
      rim.color.copy(accentCol).lerp(C_RIM_RAGE, rg)
      rim.strength.value = 0.4 + flare * 0.35 + rg * 0.7 + breakK * 0.5
    }

    const moving = anim === 'stride'
    const heavyAge = t - animStart.current
    const heavyP = anim === 'heavy' ? THREE.MathUtils.clamp(heavyAge / ARCHITECT_HEAVY_DUR, 0, 1) : 0
    const blinkAge = anim === 'blink' ? heavyAge : 99
    const blinkK = blinkAge < 0.3 ? 1 - blinkAge / 0.3 : 0
    const staggering = anim === 'stagger'
    const recoil = Math.max(parryK, staggering ? THREE.MathUtils.clamp(1 - heavyAge / 0.8, 0, 1) : 0)

    const jitter = rg * 0.06 + breakK * 0.2 + blinkK * 0.15
    r.position.x = (Math.random() - 0.5) * jitter
    r.position.y = 0
    r.position.z = (Math.random() - 0.5) * jitter
    r.rotation.x = -recoil * 0.45
    r.rotation.z = (Math.random() - 0.5) * rg * 0.04

    const cadence = moving ? 6 : 1.4
    const stridePhase = t * cadence
    const swing = Math.sin(stridePhase)
    const legAmp = moving ? 0.55 : 0
    if (legL.current && legR.current) {
      legL.current.rotation.x = swing * legAmp
      legR.current.rotation.x = -swing * legAmp
    }

    if (body.current) {
      const bounce = moving ? Math.abs(Math.sin(stridePhase)) * 0.05 : 0
      const breathe = (moving ? 0 : 1) * Math.sin(t * 1.5) * 0.02
      body.current.position.y = 1.0 + bounce
      body.current.scale.y = 1 + breathe + bounce * 0.3
    }
    if (torso.current) {
      const lean = (moving ? 0.08 : 0) + atkK * 0.16 - recoil * 0.5 + heavyP * (heavyP < 0.45 ? -0.3 : 0.5)
      torso.current.rotation.x = lean
      torso.current.rotation.y = moving ? Math.sin(stridePhase) * 0.06 : Math.sin(t * 0.5) * 0.025
    }
    if (head.current) {
      head.current.rotation.x = -recoil * 0.4 + (anim === 'cast' ? -0.12 : 0)
      head.current.rotation.z = Math.sin(t * 1.0) * 0.025
    }

    if (armL.current && armR.current) {
      if (anim === 'heavy') {
        const raise = heavyP < 0.45 ? heavyP / 0.45 : 1
        const slam = heavyP < 0.45 ? 0 : (heavyP - 0.45) / 0.55
        armR.current.rotation.x = -2.7 * raise + slam * 3.2
        armR.current.rotation.z = -0.2
        armL.current.rotation.x = -0.6 - raise * 0.3
        armL.current.rotation.z = 0.5
      } else if (anim === 'cast' || anim === 'blink') {
        armR.current.rotation.x = -1.5 - atkK * 0.4
        armR.current.rotation.z = -0.35
        armL.current.rotation.x = -1.0
        armL.current.rotation.z = 0.45
      } else if (recoil > 0.1) {
        armR.current.rotation.x = -0.2 + recoil * 0.6
        armR.current.rotation.z = -0.5 - recoil * 0.4
        armL.current.rotation.x = -0.2 + recoil * 0.6
        armL.current.rotation.z = 0.5 + recoil * 0.4
      } else if (phase === 1 && !moving) {
        armR.current.rotation.x = 0.5
        armR.current.rotation.z = -0.5
        armL.current.rotation.x = 0.5
        armL.current.rotation.z = 0.5
      } else {
        const cs = moving ? -swing * 0.35 : 0
        armR.current.rotation.x = -0.4 + cs
        armR.current.rotation.z = -0.22
        armL.current.rotation.x = -0.3 - cs
        armL.current.rotation.z = 0.28
      }
    }
    if (handR.current) handR.current.scale.setScalar(1 + atkK * 0.4)

    /* ---- eye + flashes + glyph swarm ---- */
    const pulse = Math.sin(t * (2 + phase * 0.7 + rg * 4)) * 0.5 + 0.5
    {
      const c = tmpColor.current.set(accent)
      const white = Math.max(hitK * 0.7, atkK * 0.5, parryK * 0.8, blinkK * 0.6, rg * 0.3 * pulse)
      if (white > 0.02) c.lerp(C_WHITE, white)
      matEye.emissive.copy(c)
      matEye.emissiveIntensity = 2 + pulse * 0.8 + atkK + hitK + rg * 2
    }
    if (eyeLight.current) {
      eyeLight.current.color.set(accent)
      eyeLight.current.intensity = 1.6 + atkK * 2 + flare * 1.5 + rg * 1.5
    }
    if (maskCrack.current) {
      maskCrack.current.visible = phase >= 3
      const mm = maskCrack.current.material as THREE.MeshBasicMaterial
      mm.opacity = (phase >= 3 ? 0.5 + pulse * 0.3 : 0) + breakK * 0.4
    }

    // Hit-flash on coat + mask.
    const flash = Math.max(hitK, parryK * 0.8)
    matCoat.emissive.copy(tmpColor.current.copy(C_WHITE).multiplyScalar(flash * 0.7))
    matCoat.emissiveIntensity = flash
    matMask.emissive.copy(tmpColor.current.copy(C_WHITE).multiplyScalar(flash * 0.85))
    matMask.emissiveIntensity = flash

    const m = glyphsMesh.current
    if (m) {
      const d = dObj.current
      const qScale = tier === 'low' ? 0.45 : tier === 'med' ? 0.7 : 1
      const active = Math.round((8 + phase * 4) * qScale)
      const surge = atkK * 0.6
      glyphMat.emissiveIntensity = 1.6 + pulse * 0.5 + rg * 1.2
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i]
        if (i >= active) {
          d.position.set(0, -9999, 0)
          d.scale.setScalar(0)
          d.updateMatrix()
          m.setMatrixAt(i, d.matrix)
          continue
        }
        const spd = g.speed * (1 + rg * 0.8 + flare * 0.5)
        const ang = g.phase0 + t * spd
        const rad = g.radius * (1 + flare * 0.3) + surge + Math.sin(t * 2 + g.phase0) * 0.1
        const y = 0.7 + g.height + Math.sin(t * 0.8 + g.phase0) * 0.3
        d.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad)
        d.rotation.set(g.tilt + t * 0.5, ang + Math.PI / 2, t * (0.6 + rg))
        d.scale.setScalar(g.scale * (1 + pulse * 0.12) * (1 - diss * 0.1))
        d.updateMatrix()
        m.setMatrixAt(i, d.matrix)
      }
      m.instanceMatrix.needsUpdate = true
    }

    /* ---- coat-tail + scarf ---- */
    const lean = torso.current ? torso.current.rotation.x : 0
    const billow = (moving ? 0.3 : 0.1) + flare * 0.5 + atkK * 0.3 + lean * 0.6 + rg * 0.2
    const windX = Math.sin(t * 1.6) * 0.06
    const windZ = Math.cos(t * 1.2) * 0.05 + 0.05
    const bobY = body.current ? body.current.position.y : 1
    drawChain(chains.coat, 0, 1.08 + bobY, -0.18, billow, windX, windZ, dt, sc)
    drawChain(chains.scarf, 0.16, 0.56 + bobY, -0.06, billow * 0.7 + 0.1, windX * 1.4, windZ * 1.2, dt, sc)

    if (coatFront.current) coatFront.current.rotation.x = -flare * 0.4
  })

  return (
    <group ref={root}>
      <pointLight ref={eyeLight} position={[0.12, 1.62, 0.22]} color={accent} intensity={1.6} distance={14} decay={1.7} />

      <group ref={body} position={[0, 1.0, 0]}>
        <group ref={torso}>
          {/* coat torso */}
          <mesh position={[0, 0.42, 0]} material={matCoat} castShadow receiveShadow>
            <boxGeometry args={[0.62, 0.92, 0.4]} />
          </mesh>
          {/* lapels / chest trim */}
          <mesh position={[0, 0.5, 0.21]} material={matTrim} castShadow>
            <boxGeometry args={[0.34, 0.62, 0.05]} />
          </mesh>
          {/* augmetic chest sigil */}
          <mesh position={[0, 0.46, 0.235]}>
            <ringGeometry args={[0.06, 0.12, 6]} />
            <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.8} fog={false} />
          </mesh>
          {/* high collar (flares with phase) */}
          <group ref={coatFront} position={[0, 0.86, 0]}>
            <mesh position={[0, 0.06, -0.02]} material={matCoatHi} castShadow>
              <cylinderGeometry args={[0.2, 0.26, 0.34, 12, 1, true, -Math.PI / 2, Math.PI]} />
            </mesh>
          </group>
          {/* waist */}
          <mesh position={[0, -0.08, 0]} material={matCoatHi} castShadow>
            <boxGeometry args={[0.46, 0.3, 0.34]} />
          </mesh>

          {/* head */}
          <group ref={head} position={[0, 1.12, 0]}>
            <mesh material={matSkin} castShadow>
              <boxGeometry args={[0.26, 0.32, 0.28]} />
            </mesh>
            <mesh position={[0, 0.16, -0.02]} material={matHair} castShadow>
              <boxGeometry args={[0.28, 0.12, 0.3]} />
            </mesh>
            {/* half-face mask */}
            <mesh position={[0, -0.06, 0.11]} material={matMask} castShadow>
              <boxGeometry args={[0.27, 0.2, 0.1]} />
            </mesh>
            {/* mask crack seam (phase 3+) */}
            <mesh ref={maskCrack} position={[-0.06, 0.0, 0.165]} visible={false}>
              <boxGeometry args={[0.02, 0.24, 0.02]} />
              <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0} fog={false} />
            </mesh>
            {/* normal eye */}
            <mesh position={[-0.07, 0.04, 0.145]}>
              <boxGeometry args={[0.06, 0.03, 0.02]} />
              <meshStandardMaterial color="#0a0a12" roughness={0.4} />
            </mesh>
            {/* augmetic glowing eye */}
            <mesh position={[0.08, 0.04, 0.145]} material={matEye}>
              <boxGeometry args={[0.08, 0.05, 0.03]} />
            </mesh>
            {/* visor brow */}
            <mesh position={[0.08, 0.1, 0.15]} material={matVisor}>
              <boxGeometry args={[0.12, 0.04, 0.04]} />
            </mesh>
          </group>

          {/* arms */}
          <group ref={armL} position={[-0.4, 0.78, 0]}>
            <mesh position={[0, -0.32, 0]} material={matCoat} castShadow>
              <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            </mesh>
            <mesh position={[0, -0.62, 0]} material={matSkin} castShadow>
              <sphereGeometry args={[0.1, 12, 12]} />
            </mesh>
          </group>
          <group ref={armR} position={[0.4, 0.78, 0]}>
            <mesh position={[0, -0.32, 0]} material={matCoat} castShadow>
              <capsuleGeometry args={[0.1, 0.5, 4, 10]} />
            </mesh>
            <group ref={handR} position={[0, -0.64, 0]}>
              <mesh material={matSkin} castShadow>
                <sphereGeometry args={[0.1, 12, 12]} />
              </mesh>
              {/* telekinetic palm glow */}
              <mesh position={[0, -0.02, 0.08]}>
                <sphereGeometry args={[0.08, 10, 10]} />
                <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} fog={false} />
              </mesh>
            </group>
          </group>
        </group>
      </group>

      {/* legs */}
      <group ref={legL} position={[-0.16, 0.92, 0]}>
        <mesh position={[0, -0.46, 0]} material={matCoat} castShadow>
          <capsuleGeometry args={[0.13, 0.62, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.9, 0.06]} material={matTrim} castShadow>
          <boxGeometry args={[0.2, 0.12, 0.34]} />
        </mesh>
      </group>
      <group ref={legR} position={[0.16, 0.92, 0]}>
        <mesh position={[0, -0.46, 0]} material={matCoat} castShadow>
          <capsuleGeometry args={[0.13, 0.62, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.9, 0.06]} material={matTrim} castShadow>
          <boxGeometry args={[0.2, 0.12, 0.34]} />
        </mesh>
      </group>

      {/* coat-tail (spring chain) */}
      {chains.coat.nodes.slice(0, -1).map((_, i) => (
        <mesh
          key={`coat${i}`}
          ref={(el) => {
            coatRefs.current[i] = el
          }}
          geometry={coatGeo}
          material={matCape}
          frustumCulled={false}
        />
      ))}
      {/* scarf (spring chain) */}
      {chains.scarf.nodes.slice(0, -1).map((_, i) => (
        <mesh
          key={`scarf${i}`}
          ref={(el) => {
            scarfRefs.current[i] = el
          }}
          geometry={coatGeo}
          material={matCape}
          frustumCulled={false}
        />
      ))}

      {/* orbiting code-glyph blades */}
      <instancedMesh ref={glyphsMesh} args={[glyphGeo, glyphMat, GLYPH_POOL]} frustumCulled={false} />
    </group>
  )
})
