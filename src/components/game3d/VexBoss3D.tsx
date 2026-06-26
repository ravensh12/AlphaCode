import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  armorMaterial,
  chromeMaterial,
  glassMaterial,
  moltenCore,
  makeSpring3,
  useQuality,
  WeaponTrail,
  type Spring3,
  type WeaponTrailHandle,
} from './cinematic'

/* ============================================================================
   VEX, THE NULL HERALD — a procedural, PBR armored supervillain.

   Realism comes from materials (obsidian + brushed chrome plate, a transmissive
   glass visor, a molten emissive core) lit by the CinematicStage IBL — NOT from
   cartoon proportions. A long cape and shoulder mantle are driven by makeSpring3
   chains for secondary motion; a greatsword leaves a WeaponTrail on the heavy
   swing. Every bit of motion is REF-DRIVEN: the arena bumps refs and this never
   re-renders during the fight.

   Phases:
     1 — sealed obsidian plate, cyan core.
     2 — chest plates crack open, exposed core, magenta veins.
     3 — overload: core blows hot, faster, glitchy emissive.
   ========================================================================== */

export type VexAnim = 'idle' | 'stride' | 'leap' | 'cast' | 'heavy' | 'stagger'

export interface VexBoss3DProps {
  accent?: string
  phaseRef: MutableRefObject<1 | 2 | 3>
  animRef: MutableRefObject<VexAnim>
  /** Bumped on each player hit landed. */
  hitRef: MutableRefObject<number>
  /** Bumped when the boss starts an attack. */
  attackRef: MutableRefObject<number>
  /** Bumped on a successful player parry -> stagger recoil. */
  staggerRef: MutableRefObject<number>
  /** Bumped on a phase transition -> sheds armor shards. */
  armorBreakRef: MutableRefObject<number>
  dead: boolean
}

/** Death topple + shatter length (s). The arena calls onWin shortly after. */
export const VEX_DEATH_DUR = 3.0

/** Heavy overhead swing length (s) — the parryable window lives inside this. */
export const VEX_HEAVY_DUR = 0.62

const CYAN = '#37e6ff'
const MAGENTA = '#ff48e0'
const ARMOR = '#14121b'
const CLOTH = '#0b0a13'

const C_CYAN = new THREE.Color(CYAN)
const C_MAGENTA = new THREE.Color(MAGENTA)
const C_WHITE = new THREE.Color('#ffffff')
const UP = new THREE.Vector3(0, 1, 0)

const SHARD_POOL = 36

/** One cape/mantle chain: spring nodes + the segment meshes that bridge them. */
interface Chain {
  nodes: Spring3[]
  meshRefs: MutableRefObject<(THREE.Mesh | null)[]>
  anchor: THREE.Vector3
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
  return { nodes, meshRefs, anchor, segLen, widthTop, widthBot }
}

type ChainScratch = { dir: THREE.Vector3; mid: THREE.Vector3; q: THREE.Quaternion; tgt: THREE.Vector3 }

/** Step a spring chain toward its hanging target + billow, then orient meshes. */
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
  // Head node chases the (moving) anchor directly.
  nodes[0].setScalar(ax + windX, ay, az)
  nodes[0].step(dt)
  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1].value
    const k = i / last
    s.tgt.set(prev.x + windX * k, prev.y - segLen, prev.z - billowZ * k - windZ * k)
    nodes[i].set(s.tgt)
    nodes[i].step(dt)
  }
  // Bridge each pair of nodes with a tapered slab.
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
    mesh.scale.set(w, len, 0.06)
  }
}

type Shard = { active: boolean; pos: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3; life: number; max: number; scale: number }

export const VexBoss3D = memo(function VexBoss3D({
  accent = CYAN,
  phaseRef,
  animRef,
  hitRef,
  attackRef,
  staggerRef,
  armorBreakRef,
  dead,
}: VexBoss3DProps) {
  const tier = useQuality()

  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const torsoLean = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const weapon = useRef<THREE.Group>(null)
  const swordTip = useRef<THREE.Object3D>(null)
  const trailRef = useRef<WeaponTrailHandle>(null)

  // Plates that slide open across phases to reveal the core.
  const plateRefs = useRef<(THREE.Group | null)[]>([])

  // Core glow / lighting.
  const coreMat = useRef<THREE.MeshStandardMaterial>(null)
  const coreGlowMat = useRef<THREE.MeshBasicMaterial>(null)
  const coreLight = useRef<THREE.PointLight>(null)
  // Armor plates that flash on hit.
  const flashMats = useRef<(THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | null)[]>([])

  // Cape + two shoulder mantle chains.
  const capeRefs = useRef<(THREE.Mesh | null)[]>([])
  const mantleLRefs = useRef<(THREE.Mesh | null)[]>([])
  const mantleRRefs = useRef<(THREE.Mesh | null)[]>([])
  const chains = useMemo(() => {
    const cape = makeChain(8, new THREE.Vector3(0, 2.08, -0.34), 0.26, 0.66, 0.26, capeRefs, 90)
    const mantleL = makeChain(3, new THREE.Vector3(-0.62, 2.16, -0.16), 0.22, 0.5, 0.2, mantleLRefs, 130)
    const mantleR = makeChain(3, new THREE.Vector3(0.62, 2.16, -0.16), 0.22, 0.5, 0.2, mantleRRefs, 130)
    return { cape, mantleL, mantleR }
  }, [])

  // Armor-break shard pool.
  const shardsMesh = useRef<THREE.InstancedMesh>(null)
  const shards = useMemo<Shard[]>(
    () =>
      Array.from({ length: SHARD_POOL }, () => ({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        max: 1,
        scale: 1,
      })),
    [],
  )
  const shardGeo = useMemo(() => new THREE.TetrahedronGeometry(0.26, 0), [])
  const shardMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: ARMOR, emissive: new THREE.Color(CYAN), emissiveIntensity: 0.7, roughness: 0.4, metalness: 0.8, flatShading: true }),
    [],
  )
  const capeGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const capeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.92, metalness: 0.1, side: THREE.DoubleSide }),
    [],
  )
  useEffect(
    () => () => {
      shardGeo.dispose()
      shardMat.dispose()
      capeGeo.dispose()
      capeMat.dispose()
    },
    [shardGeo, shardMat, capeGeo, capeMat],
  )

  // Reaction timers (clock-stamped; polled — no re-render).
  const prevHit = useRef(hitRef.current)
  const prevAtk = useRef(attackRef.current)
  const prevStagger = useRef(staggerRef.current)
  const prevBreak = useRef(armorBreakRef.current)
  const prevAnim = useRef<VexAnim>('idle')
  const hitT = useRef(-100)
  const atkT = useRef(-100)
  const staggerT = useRef(-100)
  const animStart = useRef(-100)
  const openAmt = useRef(0)
  const enrage = useRef(0)
  const deathStart = useRef<number | null>(null)

  // Scratch.
  const dObj = useRef(new THREE.Object3D())
  const tmpColor = useRef(new THREE.Color())
  const tmpVec = useRef(new THREE.Vector3())
  const chainScratch = useRef<ChainScratch>({
    dir: new THREE.Vector3(),
    mid: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    tgt: new THREE.Vector3(),
  })

  function spawnShards(n: number) {
    for (let i = 0, c = 0; i < shards.length && c < n; i++) {
      const s = shards[i]
      if (s.active) continue
      c++
      s.active = true
      // Burst from the chest core outward.
      s.pos.set((Math.random() - 0.5) * 0.6, 1.45 + (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.3)
      const a = Math.random() * Math.PI * 2
      const up = 2 + Math.random() * 4
      const spread = 3 + Math.random() * 4
      s.vel.set(Math.cos(a) * spread, up, Math.sin(a) * spread + 2)
      s.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8)
      s.life = 0.7 + Math.random() * 0.5
      s.max = s.life
      s.scale = 0.5 + Math.random() * 0.9
    }
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const r = root.current
    if (!r) return
    const phase = phaseRef.current
    const sc = chainScratch.current

    /* ---------------------------------------------------- DEATH SEQUENCE */
    if (dead) {
      if (deathStart.current == null) {
        deathStart.current = t
        spawnShards(SHARD_POOL)
      }
      const e = t - deathStart.current
      const eN = Math.min(1, e / VEX_DEATH_DUR)

      // Topple over: tilt forward + sink, with a violent early shudder.
      const shudder = e < 0.5 ? (Math.random() - 0.5) * 0.3 : 0
      r.rotation.x = -eN * 1.4 + shudder
      r.rotation.z = Math.sin(e * 8) * 0.15 * (1 - eN)
      r.position.y = -eN * eN * 1.1

      // Core overloads white then dies out.
      if (coreMat.current) {
        coreMat.current.emissive.copy(e % 0.1 < 0.05 ? C_WHITE : C_MAGENTA)
        coreMat.current.emissiveIntensity = Math.max(0, (1 - eN) * 8)
      }
      if (coreLight.current) coreLight.current.intensity = Math.max(0, (1 - eN) * 7)
      if (coreGlowMat.current) coreGlowMat.current.opacity = (1 - eN) * 0.5

      // Plates blow off.
      for (let i = 0; i < plateRefs.current.length; i++) {
        const g = plateRefs.current[i]
        if (!g) continue
        g.position.z = 0.18 + eN * 2.4 + i * 0.05
        g.rotation.x += dt * 5
      }

      updateShards(dt, t)
      return
    }

    /* ---------------------------------------------------- LIVE BOSS */

    // --- poll reaction refs ---
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
    if (armorBreakRef.current !== prevBreak.current) {
      prevBreak.current = armorBreakRef.current
      spawnShards(tier === 'low' ? 10 : tier === 'med' ? 18 : 28)
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

    // Ease enrage + plate-open toward phase targets.
    enrage.current += ((phase >= 3 ? 1 : 0) - enrage.current) * Math.min(1, dt * 1.5)
    const rage = enrage.current
    const openTarget = phase === 1 ? 0 : phase === 2 ? 0.6 : 1
    openAmt.current += (openTarget - openAmt.current) * Math.min(1, dt * 2.2)
    const open = openAmt.current

    /* ---- per-anim drive ------------------------------------------------- */
    const moving = anim === 'stride'
    const leaping = anim === 'leap'
    const heavyAge = t - animStart.current
    const heavyP = anim === 'heavy' ? THREE.MathUtils.clamp(heavyAge / VEX_HEAVY_DUR, 0, 1) : 0
    const staggering = anim === 'stagger'
    const recoil = Math.max(parryK, staggering ? THREE.MathUtils.clamp(1 - heavyAge / 0.8, 0, 1) : 0)

    const cadence = moving ? 7 : 1.6
    const stridePhase = t * cadence
    const swing = Math.sin(stridePhase)
    const legAmp = moving ? 0.7 : 0

    // Glitch jitter scales with rage; recoil knocks the whole frame back.
    const jitter = rage * 0.06
    r.position.x = (Math.random() - 0.5) * jitter
    r.position.y = 0 // grounded; the arena translates the boss group for hops
    r.rotation.x = -recoil * 0.5
    r.rotation.z = (Math.random() - 0.5) * rage * 0.03

    // Legs.
    if (legL.current && legR.current) {
      if (leaping) {
        legL.current.rotation.x = -0.9
        legR.current.rotation.x = -0.5
      } else {
        legL.current.rotation.x = swing * legAmp
        legR.current.rotation.x = -swing * legAmp
      }
    }

    // Body: weight-shifted footwork bob + breathing, lean into motion, recoil back.
    if (body.current) {
      const bounce = moving ? Math.abs(Math.sin(stridePhase)) * 0.07 : 0
      const breathe = (moving ? 0 : 1) * Math.sin(t * 1.6) * 0.025
      body.current.position.y = 1.0 + bounce
      body.current.scale.y = 1 + breathe + bounce * 0.3
      body.current.rotation.y = moving ? Math.sin(stridePhase) * 0.08 : Math.sin(t * 0.5) * 0.03
    }
    if (torsoLean.current) {
      const lean = (moving ? 0.12 : 0) + (leaping ? 0.25 : 0) + atkK * 0.18 - recoil * 0.5
      torsoLean.current.rotation.x = lean
    }
    if (head.current) {
      head.current.rotation.x = -recoil * 0.4 + (anim === 'cast' ? -0.15 : 0)
      head.current.rotation.z = Math.sin(t * 1.1) * 0.03
    }

    // Arms.
    if (armL.current && armR.current) {
      if (anim === 'heavy') {
        // Overhead chop: raise (anticipation) then slam down (follow-through).
        const raise = heavyP < 0.45 ? heavyP / 0.45 : 1
        const chop = heavyP < 0.45 ? 0 : (heavyP - 0.45) / 0.55
        armR.current.rotation.x = -2.6 * raise + chop * 3.4
        armR.current.rotation.z = -0.3 + chop * 0.4
        armL.current.rotation.x = -0.8 - raise * 0.4
        armL.current.rotation.z = 0.6
      } else if (anim === 'cast') {
        armR.current.rotation.x = -1.4 - atkK * 0.5
        armR.current.rotation.z = -0.3
        armL.current.rotation.x = -1.2
        armL.current.rotation.z = 0.5
      } else if (staggering || recoil > 0.1) {
        armR.current.rotation.x = -0.2 + recoil * 0.6
        armR.current.rotation.z = -0.5 - recoil * 0.5
        armL.current.rotation.x = -0.2 + recoil * 0.6
        armL.current.rotation.z = 0.5 + recoil * 0.5
      } else {
        // Idle/stride: weapon held low to the side, arms counter-swing.
        const cs = moving ? -swing * 0.4 : 0
        armR.current.rotation.x = -0.5 + cs
        armR.current.rotation.z = -0.25
        armL.current.rotation.x = -0.35 - cs
        armL.current.rotation.z = 0.3
      }
    }

    // Weapon trail on the heavy swing's strike window.
    if (anim === 'heavy' && heavyP > 0.4 && heavyP < 0.92) {
      const tip = swordTip.current
      if (tip && trailRef.current) {
        tip.getWorldPosition(tmpVec.current)
        r.worldToLocal(tmpVec.current)
        trailRef.current.setTip(tmpVec.current)
      }
    }

    /* ---- core look ------------------------------------------------------ */
    const pulse = Math.sin(t * (2 + phase * 0.8 + rage * 6)) * 0.5 + 0.5
    if (coreMat.current) {
      const c = tmpColor.current
      c.copy(C_CYAN).lerp(C_MAGENTA, Math.min(1, (phase - 1) / 2))
      const white = Math.max(hitK * 0.7, atkK * 0.4, parryK * 0.8, rage * 0.2 * pulse)
      if (white > 0.02) c.lerp(C_WHITE, white)
      coreMat.current.emissive.copy(c)
      coreMat.current.emissiveIntensity = 1.5 + pulse * 0.8 + open * 1.5 + hitK + atkK + rage * 1.5
    }
    if (coreGlowMat.current) {
      coreGlowMat.current.opacity = 0.12 + open * 0.22 + pulse * 0.1 + atkK * 0.2
    }
    if (coreLight.current) {
      coreLight.current.color.copy(tmpColor.current)
      coreLight.current.intensity = 2.4 + open * 2 + pulse * 0.6 + atkK * 1.5 + rage * 1.5
    }

    // Armor hit-flash.
    const flash = Math.max(hitK, parryK * 0.8)
    for (const m of flashMats.current) {
      if (!m) continue
      m.emissive.copy(tmpColor.current.copy(C_WHITE).multiplyScalar(flash * 0.9))
      m.emissiveIntensity = flash
    }

    // Plates slide open to reveal the cracked core.
    for (let i = 0; i < plateRefs.current.length; i++) {
      const g = plateRefs.current[i]
      if (!g) continue
      const dir = i % 2 === 0 ? 1 : -1
      g.position.x = dir * open * 0.34
      g.position.z = 0.18 + open * 0.12
      g.rotation.y = dir * open * 0.5
    }

    /* ---- cape + mantle secondary motion --------------------------------- */
    // Anchor follows the (leaning, bobbing) torso; billow grows with motion.
    const lean = torsoLean.current ? torsoLean.current.rotation.x : 0
    const billow = (moving ? 0.32 : 0.1) + (leaping ? 0.9 : 0) + atkK * 0.3 + lean * 0.6
    const windX = Math.sin(t * 1.7) * 0.05
    const windZ = Math.cos(t * 1.3) * 0.05 + 0.06
    const bobY = body.current ? body.current.position.y : 1
    drawChain(chains.cape, 0, 1.08 + bobY, -0.34, billow, windX, windZ, dt, sc)
    drawChain(chains.mantleL, -0.62, 1.16 + bobY * 0.4, -0.16, billow * 0.5, windX, windZ * 0.6, dt, sc)
    drawChain(chains.mantleR, 0.62, 1.16 + bobY * 0.4, -0.16, billow * 0.5, -windX, windZ * 0.6, dt, sc)

    updateShards(dt, t)
  })

  function updateShards(dt: number, t: number) {
    const m = shardsMesh.current
    if (!m) return
    const d = dObj.current
    for (let i = 0; i < shards.length; i++) {
      const s = shards[i]
      if (!s.active) {
        d.position.set(0, -9999, 0)
        d.scale.setScalar(0)
        d.updateMatrix()
        m.setMatrixAt(i, d.matrix)
        continue
      }
      s.vel.y += -14 * dt
      s.pos.addScaledVector(s.vel, dt)
      s.life -= dt
      if (s.life <= 0 || s.pos.y < 0) {
        s.active = false
        d.position.set(0, -9999, 0)
        d.scale.setScalar(0)
        d.updateMatrix()
        m.setMatrixAt(i, d.matrix)
        continue
      }
      d.position.copy(s.pos)
      d.rotation.set(t * s.spin.x, t * s.spin.y, t * s.spin.z)
      d.scale.setScalar(s.scale * Math.min(1, s.life / s.max + 0.2))
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  }

  const armorBody = useMemo(() => armorMaterial(ARMOR), [])
  const chrome = useMemo(() => chromeMaterial('#c9d2e0'), [])
  const glass = useMemo(() => glassMaterial(accent), [accent])
  const core = useMemo(() => moltenCore(CYAN, 1.6), [])

  return (
    <group ref={root}>
      {/* Self-illumination from the core so VEX reads against bloom. */}
      <pointLight ref={coreLight} position={[0, 1.45, 0.25]} color={CYAN} intensity={2.4} distance={16} decay={1.7} />

      <group ref={body} position={[0, 1.0, 0]}>
        <group ref={torsoLean}>
          {/* --- torso shell --- */}
          <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.86, 0.92, 0.5]} />
            <meshPhysicalMaterial
              ref={(el) => {
                flashMats.current[0] = el
              }}
              {...armorBody}
            />
          </mesh>
          {/* abdomen taper */}
          <mesh position={[0, -0.06, 0]} castShadow>
            <boxGeometry args={[0.6, 0.4, 0.42]} />
            <meshPhysicalMaterial {...armorBody} />
          </mesh>
          {/* chrome collar */}
          <mesh position={[0, 1.02, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.34, 0.2, 12]} />
            <meshPhysicalMaterial {...chrome} />
          </mesh>

          {/* --- chest core (cracked, glowing) --- */}
          <mesh position={[0, 0.5, 0.18]}>
            <icosahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial ref={coreMat} {...core} />
          </mesh>
          <mesh position={[0, 0.5, 0.18]}>
            <sphereGeometry args={[0.34, 16, 16]} />
            <meshBasicMaterial ref={coreGlowMat} color={CYAN} transparent opacity={0.14} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
          </mesh>

          {/* --- sliding chest plates that crack open over the core --- */}
          {[0, 1, 2, 3].map((i) => {
            const dir = i % 2 === 0 ? -1 : 1
            const row = i < 2 ? 0.64 : 0.36
            return (
              <group
                key={i}
                ref={(el) => {
                  plateRefs.current[i] = el
                }}
                position={[dir * 0.2, row, 0.18]}
              >
                <mesh castShadow>
                  <boxGeometry args={[0.34, 0.3, 0.14]} />
                  <meshPhysicalMaterial
                    ref={(el) => {
                      flashMats.current[1 + i] = el
                    }}
                    {...armorBody}
                  />
                </mesh>
                {/* glowing crack seam on the inner edge */}
                <mesh position={[dir * -0.16, 0, 0.08]}>
                  <boxGeometry args={[0.03, 0.26, 0.04]} />
                  <meshBasicMaterial color={MAGENTA} toneMapped={false} transparent opacity={0.8} fog={false} />
                </mesh>
              </group>
            )
          })}

          {/* --- shoulder pauldrons (chrome) --- */}
          <mesh position={[-0.62, 0.86, 0]} castShadow>
            <sphereGeometry args={[0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
            <meshPhysicalMaterial {...chrome} />
          </mesh>
          <mesh position={[0.62, 0.86, 0]} castShadow>
            <sphereGeometry args={[0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
            <meshPhysicalMaterial {...chrome} />
          </mesh>

          {/* --- head + glass visor --- */}
          <group ref={head} position={[0, 1.28, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.34, 0.38, 0.36]} />
              <meshPhysicalMaterial {...armorBody} />
            </mesh>
            {/* crested helm ridge */}
            <mesh position={[0, 0.22, -0.02]} castShadow>
              <boxGeometry args={[0.06, 0.2, 0.34]} />
              <meshPhysicalMaterial {...chrome} />
            </mesh>
            {/* visor (transmissive glass) */}
            <mesh position={[0, 0.02, 0.18]}>
              <boxGeometry args={[0.28, 0.12, 0.06]} />
              <meshPhysicalMaterial {...glass} emissive={accent} emissiveIntensity={0.6} />
            </mesh>
          </group>

          {/* --- arms (pivot at shoulder) --- */}
          <group ref={armL} position={[-0.6, 0.84, 0]}>
            <mesh position={[0, -0.34, 0]} castShadow>
              <capsuleGeometry args={[0.13, 0.5, 4, 10]} />
              <meshPhysicalMaterial {...armorBody} />
            </mesh>
            <mesh position={[0, -0.66, 0]} castShadow>
              <sphereGeometry args={[0.14, 12, 12]} />
              <meshPhysicalMaterial {...chrome} />
            </mesh>
          </group>
          <group ref={armR} position={[0.6, 0.84, 0]}>
            <mesh position={[0, -0.34, 0]} castShadow>
              <capsuleGeometry args={[0.13, 0.5, 4, 10]} />
              <meshPhysicalMaterial {...armorBody} />
            </mesh>
            <mesh position={[0, -0.66, 0]} castShadow>
              <sphereGeometry args={[0.14, 12, 12]} />
              <meshPhysicalMaterial {...chrome} />
            </mesh>

            {/* --- greatsword held in the right hand --- */}
            <group ref={weapon} position={[0, -0.72, 0.06]} rotation={[0.2, 0, 0]}>
              <mesh position={[0, 0.1, 0]} castShadow>
                <boxGeometry args={[0.06, 0.3, 0.06]} />
                <meshPhysicalMaterial {...chrome} />
              </mesh>
              <mesh position={[0, -0.06, 0]} castShadow>
                <boxGeometry args={[0.42, 0.06, 0.08]} />
                <meshPhysicalMaterial {...armorBody} />
              </mesh>
              {/* blade */}
              <mesh position={[0, -0.95, 0]} castShadow>
                <boxGeometry args={[0.16, 1.7, 0.04]} />
                <meshPhysicalMaterial {...chrome} emissive={accent} emissiveIntensity={0.5} />
              </mesh>
              {/* glowing edge */}
              <mesh position={[0.09, -0.95, 0]}>
                <boxGeometry args={[0.02, 1.7, 0.05]} />
                <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.85} fog={false} />
              </mesh>
              <object3D ref={swordTip} position={[0, -1.85, 0]} />
            </group>
          </group>
        </group>
      </group>

      {/* --- legs (pivot at hip) --- */}
      <group ref={legL} position={[-0.24, 0.92, 0]}>
        <mesh position={[0, -0.46, 0]} castShadow>
          <capsuleGeometry args={[0.16, 0.6, 4, 10]} />
          <meshPhysicalMaterial {...armorBody} />
        </mesh>
        <mesh position={[0, -0.9, 0.08]} castShadow>
          <boxGeometry args={[0.24, 0.16, 0.42]} />
          <meshPhysicalMaterial {...chrome} />
        </mesh>
      </group>
      <group ref={legR} position={[0.24, 0.92, 0]}>
        <mesh position={[0, -0.46, 0]} castShadow>
          <capsuleGeometry args={[0.16, 0.6, 4, 10]} />
          <meshPhysicalMaterial {...armorBody} />
        </mesh>
        <mesh position={[0, -0.9, 0.08]} castShadow>
          <boxGeometry args={[0.24, 0.16, 0.42]} />
          <meshPhysicalMaterial {...chrome} />
        </mesh>
      </group>

      {/* --- cape + shoulder mantle (spring-driven) --- */}
      {chains.cape.nodes.slice(0, -1).map((_, i) => (
        <mesh
          key={`cape${i}`}
          ref={(el) => {
            capeRefs.current[i] = el
          }}
          geometry={capeGeo}
          material={capeMat}
          frustumCulled={false}
        />
      ))}
      {chains.mantleL.nodes.slice(0, -1).map((_, i) => (
        <mesh
          key={`mantleL${i}`}
          ref={(el) => {
            mantleLRefs.current[i] = el
          }}
          geometry={capeGeo}
          material={capeMat}
          frustumCulled={false}
        />
      ))}
      {chains.mantleR.nodes.slice(0, -1).map((_, i) => (
        <mesh
          key={`mantleR${i}`}
          ref={(el) => {
            mantleRRefs.current[i] = el
          }}
          geometry={capeGeo}
          material={capeMat}
          frustumCulled={false}
        />
      ))}

      {/* --- armor-break shard burst (instanced, local space) --- */}
      <instancedMesh ref={shardsMesh} args={[shardGeo, shardMat, SHARD_POOL]} frustumCulled={false} />

      {/* --- greatsword trail (local to VEX root) --- */}
      <WeaponTrail ref={trailRef} color={accent} width={0.5} segments={18} fade={0.18} />
    </group>
  )
})
