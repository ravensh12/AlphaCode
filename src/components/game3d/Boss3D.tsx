import { memo, useCallback, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { applyRimLight } from './simulation'

export type BossAnim = 'idle' | 'run' | 'jump'

type OneShot = { type: 'hit' | 'attack'; start: number } | null

/** Per-world villain identity — a distinct humanoid silhouette + weapon. */
type Villain = {
  /** Body bulk (1 = hero-ish, >1 = brute). */
  bulk: number
  /** Permanent forward hunch in radians. */
  hunch: number
  head: 'hood' | 'visor' | 'block' | 'helm' | 'beast' | 'crown'
  weapon: 'daggers' | 'saber' | 'fists' | 'halberd' | 'claws' | 'staff'
  shoulders: 'spikes' | 'crystals' | 'slabs' | 'pauldrons' | 'jagged' | 'royal'
  cape: boolean
  eyeColor: string
}

const VILLAINS: Villain[] = [
  // 0 — The Hider: a slim hooded assassin with twin daggers.
  { bulk: 0.92, hunch: 0.12, head: 'hood', weapon: 'daggers', shoulders: 'spikes', cape: true, eyeColor: '#d6ff5c' },
  // 1 — Mirror Mimic: a reflective duelist with a long saber.
  { bulk: 1.0, hunch: 0.0, head: 'visor', weapon: 'saber', shoulders: 'crystals', cape: false, eyeColor: '#7df0ff' },
  // 2 — Twin-Key Golem: a hulking brute that pounds with huge fists.
  { bulk: 1.35, hunch: 0.06, head: 'block', weapon: 'fists', shoulders: 'slabs', cape: false, eyeColor: '#cdb4ff' },
  // 3 — The Gatekeeper: an armored knight with shield + halberd.
  { bulk: 1.12, hunch: 0.0, head: 'helm', weapon: 'halberd', shoulders: 'pauldrons', cape: true, eyeColor: '#ffe08a' },
  // 4 — Bracket Beast: a hunched feral beast with raking claws.
  { bulk: 1.08, hunch: 0.34, head: 'beast', weapon: 'claws', shoulders: 'jagged', cape: false, eyeColor: '#ffc2c5' },
  // 5 — Sorted Sphinx: a regal pharaoh-mage with a glowing staff.
  { bulk: 1.0, hunch: 0.0, head: 'crown', weapon: 'staff', shoulders: 'royal', cape: true, eyeColor: '#bcd4ff' },
]

export const Boss3D = memo(function Boss3D({
  accent,
  variant,
  anim = 'idle',
  animRef,
  hitRef,
  attackRef,
  dead,
}: {
  accent: string
  variant: number
  anim?: BossAnim
  /** When set, the current anim is read from this ref each frame (no re-render). */
  animRef?: MutableRefObject<BossAnim>
  /** Bumped imperatively by the parent on each landed bolt (no re-render). */
  hitRef: MutableRefObject<number>
  /** Bumped imperatively by the parent each time the boss looses an attack. */
  attackRef: MutableRefObject<number>
  dead: boolean
}) {
  const v = VILLAINS[variant % VILLAINS.length]

  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const cape = useRef<THREE.Group>(null)
  const aura = useRef<THREE.Mesh>(null)
  const auraMat = useRef<THREE.MeshBasicMaterial>(null)
  const burst = useRef<THREE.Group>(null)

  // Materials that flash red/bright when struck. The collector is a STABLE
  // callback (useCallback) so the material refs attach exactly once on mount —
  // a fresh closure each render would churn the refs and risk leaving meshes
  // momentarily detached as the boss re-renders. It doubles as the rim-light
  // installer (M7): the collected mats are exactly the boss's big read
  // surfaces, so they get the strong accent-colored fresnel rim.
  const flashMats = useRef<THREE.MeshStandardMaterial[]>([])
  const collect = useCallback(
    (m: THREE.MeshStandardMaterial | null) => {
      if (m && !flashMats.current.includes(m)) {
        applyRimLight(m, accent, 0.8)
        flashMats.current.push(m)
      }
    },
    [accent],
  )

  // Hit/attack reactions are detected by polling the refs inside useFrame, so a
  // landed bolt NEVER re-renders this component. Critically, the one-shot start
  // time is now stamped with the SAME clock it is later measured against
  // (state.clock.elapsedTime) — the previous code stamped performance.now()/1000
  // but measured against the Three clock, so the elapsed time was a huge negative
  // number, exploding the hit reaction and flinging the body below the floor.
  const oneShot = useRef<OneShot>(null)
  const prevHit = useRef(hitRef.current)
  const prevAtk = useRef(attackRef.current)
  const deathStart = useRef<number | null>(null)
  const phase = useRef(0)
  const amp = useRef(0)

  const colors = useMemo(() => {
    const a = new THREE.Color(accent)
    return {
      body: accent,
      // Dark accents derived from the boss color so they read against the dark arena
      // (instead of near-black that vanished into the floor).
      dark: '#' + a.clone().multiplyScalar(0.62).getHexString(),
      limb: '#' + a.clone().lerp(new THREE.Color('#cfd2e6'), 0.32).multiplyScalar(0.62).getHexString(),
    }
  }, [accent])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const r = root.current
    const b = body.current
    if (!r || !b) return

    // Poll the hit/attack refs (no re-render). Stamp the start with the Three
    // clock so it is measured on the same timeline below.
    if (hitRef.current !== prevHit.current) {
      prevHit.current = hitRef.current
      oneShot.current = { type: 'hit', start: t }
    }
    if (attackRef.current !== prevAtk.current) {
      prevAtk.current = attackRef.current
      oneShot.current = { type: 'attack', start: t }
    }

    // Defeat — stagger back and TOPPLE onto the arena floor with a one-off burst
    // flash. The boss stays visible and on the ground (it used to sink straight
    // through the floor and shrink, which read as "disappearing" the instant it
    // died). A clear, readable knockout instead.
    if (dead) {
      if (deathStart.current == null) deathStart.current = t
      const e = Math.min(1, (t - deathStart.current) / 1.2)
      const ease = 1 - (1 - e) * (1 - e)
      r.rotation.x = -ease * 1.42 // topple backward, pivoting on the feet
      r.rotation.z = Math.sin(e * 22) * 0.14 * (1 - e) // brief death shudder
      r.position.y = -e * 0.12 // settle, not sink
      r.scale.setScalar(1 - e * 0.06)
      const flash = (1 - e) * 0.7
      for (const m of flashMats.current) {
        m.emissive.set('#ff2a2a')
        m.emissiveIntensity = flash
      }
      // Expanding defeat shockwave that lingers a moment on the kill.
      const bu = burst.current
      if (bu) {
        const bp = Math.min(1, (t - deathStart.current) / 0.7)
        if (bp < 1) {
          bu.visible = true
          const s = 0.5 + bp * 3.4
          bu.scale.set(s, s, s)
          const o = (1 - bp) * 0.9
          bu.traverse((child) => {
            const cm = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
            if (cm && 'opacity' in cm) cm.opacity = o
          })
        } else if (bu.visible) {
          bu.visible = false
        }
      }
      return
    }
    r.rotation.x = 0
    r.position.y = 0
    r.scale.setScalar(1)

    const a = animRef ? animRef.current : anim
    const running = a === 'run'
    const jumping = a === 'jump'
    const targetAmp = jumping ? 0 : running ? 1 : 0
    amp.current += (targetAmp - amp.current) * Math.min(1, dt * 9)
    const cadence = running ? 10 : 2.0
    phase.current += dt * cadence
    const swing = Math.sin(phase.current)

    // Legs.
    if (legL.current && legR.current) {
      if (jumping) {
        legL.current.rotation.x = -0.9
        legR.current.rotation.x = -0.5
      } else {
        legL.current.rotation.x = swing * 0.8 * amp.current
        legR.current.rotation.x = -swing * 0.8 * amp.current
      }
    }

    // One-shot timing. Clamped to [0,1] defensively so the reaction can only ever
    // nudge the rig, never fling it (the old time-base bug buried the body here).
    const os = oneShot.current
    let hitK = 0
    let atkK = 0
    if (os) {
      const e = t - os.start
      if (os.type === 'hit') {
        if (e >= 0 && e < 0.4) hitK = THREE.MathUtils.clamp(1 - e / 0.4, 0, 1)
        else oneShot.current = null
      } else {
        if (e >= 0 && e < 0.55) atkK = THREE.MathUtils.clamp(Math.sin((e / 0.55) * Math.PI), 0, 1)
        else oneShot.current = null
      }
    }

    // Arms: menacing forward reach; weapon arm swings on attack.
    if (armL.current && armR.current) {
      if (jumping) {
        armL.current.rotation.x = -2.2
        armR.current.rotation.x = -2.2
        armL.current.rotation.z = 0.35
        armR.current.rotation.z = -0.35
      } else {
        const pump = swing * 0.6 * amp.current
        armL.current.rotation.x = -0.35 + pump
        armR.current.rotation.x = -0.5 - pump - atkK * 1.8
        armL.current.rotation.z = 0.18
        armR.current.rotation.z = -0.12
      }
    }

    // Body: hunch + run bounce + breathing + hit reaction.
    // Hit produces a clear lean + small downward "impact" so damage is obvious
    // while the model silhouette stays stable and readable (no flipping).
    const bounce = running ? Math.abs(Math.sin(phase.current)) * 0.09 * amp.current : 0
    const breathe = (1 - amp.current) * Math.sin(t * 2.2) * 0.03
    b.position.y = bounce - hitK * 0.065
    b.rotation.x = v.hunch - Math.min(0.36, hitK * 0.36) + atkK * 0.11
    b.rotation.z = Math.sin(t * 0.8) * 0.035 * (1 - amp.current)
    b.scale.y = 1 + breathe - hitK * 0.03
    if (head.current) head.current.rotation.x = Math.sin(t * 1.3) * 0.05 * (1 - amp.current)

    // Subtle permanent self-glow in the boss's own color + hit flash.
    // The boss is lit primarily by the SCENE lights (so it always reads as a
    // solid, shaded model). The self-glow and hit flash are kept low on purpose:
    // a higher value plus Bloom turned the boss into a white/red glowing blob
    // that "disappeared" while you fired. The hit flash is capped well under the
    // Bloom luminance threshold so a struck boss reads as a solid red impact and
    // NEVER washes out, no matter how fast you fire.
    const baseGlow = 0.12
    for (const m of flashMats.current) {
      if (hitK > 0.01) {
        m.emissive.set('#ff2418')
        // Peaks at ~0.82 — punchy red impact that stays just under the Bloom
        // luminance threshold (0.92), so a struck boss reads as a solid red hit
        // and NEVER washes out, no matter how fast you fire.
        m.emissiveIntensity = baseGlow + hitK * 0.7
      } else {
        m.emissive.set(accent)
        m.emissiveIntensity = baseGlow
      }
    }

    // Spin/shudder on hit (the reaction you liked).
    r.rotation.z = THREE.MathUtils.lerp(r.rotation.z, Math.sin(t * 60) * 0.05 * hitK, 0.5)

    // Cape sway.
    if (cape.current) cape.current.rotation.x = -0.3 - swing * 0.25 * amp.current - bounce
    // Aura pulse.
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4)
    if (aura.current && auraMat.current) {
      aura.current.scale.setScalar(1.05 + pulse * 0.06)
      auraMat.current.opacity = 0.13 + pulse * 0.07
    }
  })

  const bulk = v.bulk

  return (
    <group ref={root}>
      {/* A light rigged to the boss so it always "pops" against the arena and
          casts a pool of its own color on the floor. Kept moderate so the boss
          stays a shaded, readable model rather than a blown-out glow. */}
      <pointLight position={[0, 2.2, 0.8]} color={accent} intensity={2.4} distance={10} decay={1.7} />
      <pointLight position={[0, 1.4, 1.4]} color={'#ffffff'} intensity={1.1} distance={9} decay={1.8} />

      {/* ground aura — boss-colored pool so its footprint reads clearly */}
      <mesh ref={aura} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.25, 36]} />
        <meshBasicMaterial
          ref={auraMat}
          color={accent}
          transparent
          opacity={0.16}
          toneMapped={false}
          fog={false}
          depthWrite={false}
        />
      </mesh>

      {/* Defeat shockwave — a flash + expanding ring driven only while `dead`. */}
      <group ref={burst} position={[0, 1.0, 0]} visible={false}>
        <mesh>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshBasicMaterial color="#fff2d8" transparent opacity={0} toneMapped={false} fog={false} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.92, 36]} />
          <meshBasicMaterial color={accent} transparent opacity={0} toneMapped={false} fog={false} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <group ref={body}>
        {/* torso */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.62 * bulk, 0.74, 0.4 * bulk]} />
          <meshStandardMaterial ref={collect} color={colors.body} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.5} metalness={v.head === 'visor' ? 0.6 : 0.2} />
        </mesh>
        {/* chest emblem */}
        <mesh position={[0, 1.16, 0.2 * bulk]}>
          <boxGeometry args={[0.26, 0.3, 0.05]} />
          <meshStandardMaterial color={colors.dark} emissive={v.eyeColor} emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
        {/* waist */}
        <mesh position={[0, 0.78, 0]} castShadow>
          <boxGeometry args={[0.5 * bulk, 0.2, 0.34 * bulk]} />
          <meshStandardMaterial color={colors.dark} roughness={0.6} />
        </mesh>

        <Shoulders kind={v.shoulders} accent={accent} dark={colors.dark} bulk={bulk} collect={collect} />

        {/* head */}
        <group ref={head} position={[0, 1.6, 0]}>
          <BossHead kind={v.head} accent={accent} dark={colors.dark} eye={v.eyeColor} collect={collect} />
        </group>

        {/* left arm */}
        <group ref={armL} position={[-0.42 * bulk, 1.34, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.1 * bulk, 0.42, 4, 10]} />
            <meshStandardMaterial ref={collect} color={colors.limb} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.55} />
          </mesh>
          <LeftHand weapon={v.weapon} accent={accent} dark={colors.dark} />
        </group>

        {/* right arm (weapon arm) */}
        <group ref={armR} position={[0.42 * bulk, 1.34, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.1 * bulk, 0.42, 4, 10]} />
            <meshStandardMaterial ref={collect} color={colors.limb} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.55} />
          </mesh>
          <RightHand weapon={v.weapon} accent={accent} dark={colors.dark} eye={v.eyeColor} />
        </group>

        {/* legs */}
        <group ref={legL} position={[-0.17 * bulk, 0.74, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow>
            <capsuleGeometry args={[0.13 * bulk, 0.5, 4, 10]} />
            <meshStandardMaterial color={colors.limb} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.74, 0.06]} castShadow>
            <boxGeometry args={[0.2, 0.14, 0.32]} />
            <meshStandardMaterial color={colors.dark} roughness={0.6} />
          </mesh>
        </group>
        <group ref={legR} position={[0.17 * bulk, 0.74, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow>
            <capsuleGeometry args={[0.13 * bulk, 0.5, 4, 10]} />
            <meshStandardMaterial color={colors.limb} roughness={0.55} />
          </mesh>
          <mesh position={[0, -0.74, 0.06]} castShadow>
            <boxGeometry args={[0.2, 0.14, 0.32]} />
            <meshStandardMaterial color={colors.dark} roughness={0.6} />
          </mesh>
        </group>

        {/* cape */}
        {v.cape && (
          <group ref={cape} position={[0, 1.4, -0.22 * bulk]}>
            <mesh position={[0, -0.5, 0]} castShadow>
              <boxGeometry args={[0.7 * bulk, 1.2, 0.06]} />
              <meshStandardMaterial color={colors.dark} roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  )
})

/* --------------------------------------------------------------- Heads */

function BossHead({
  kind,
  accent,
  dark,
  eye,
  collect,
}: {
  kind: Villain['head']
  accent: string
  dark: string
  eye: string
  collect: (m: THREE.MeshStandardMaterial | null) => void
}) {
  const eyeMesh = (
    <mesh position={[0, 0.14, 0.2]}>
      <boxGeometry args={[0.26, 0.06, 0.05]} />
      <meshStandardMaterial color="#fff7e6" emissive={eye} emissiveIntensity={1.8} />
    </mesh>
  )
  switch (kind) {
    case 'hood':
      return (
        <group>
          <mesh position={[0, 0.16, 0]} castShadow>
            <coneGeometry args={[0.3, 0.6, 6]} />
            <meshStandardMaterial ref={collect} color={dark} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.8} flatShading />
          </mesh>
          <mesh position={[0, 0.08, 0.08]}>
            <boxGeometry args={[0.3, 0.26, 0.26]} />
            <meshStandardMaterial color="#0d0b14" roughness={1} />
          </mesh>
          {eyeMesh}
        </group>
      )
    case 'visor':
      return (
        <group>
          <mesh position={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[0.38, 0.4, 0.36]} />
            <meshStandardMaterial ref={collect} color="#cde9ff" emissive="#ff2a2a" emissiveIntensity={0} metalness={0.8} roughness={0.15} />
          </mesh>
          <mesh position={[0, 0.16, 0.19]}>
            <boxGeometry args={[0.32, 0.1, 0.05]} />
            <meshStandardMaterial color="#0a1822" emissive={eye} emissiveIntensity={1.6} />
          </mesh>
        </group>
      )
    case 'block':
      return (
        <group>
          <mesh position={[0, 0.16, 0]} castShadow>
            <boxGeometry args={[0.46, 0.44, 0.42]} />
            <meshStandardMaterial ref={collect} color={dark} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.85} flatShading />
          </mesh>
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0.18, 0.22]}>
              <boxGeometry args={[0.1, 0.1, 0.05]} />
              <meshStandardMaterial color="#fff7e6" emissive={eye} emissiveIntensity={1.6} />
            </mesh>
          ))}
        </group>
      )
    case 'helm':
      return (
        <group>
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.4, 0.42, 0.4]} />
            <meshStandardMaterial ref={collect} color="#9aa3c4" emissive="#ff2a2a" emissiveIntensity={0} metalness={0.7} roughness={0.35} />
          </mesh>
          {/* visor slit */}
          <mesh position={[0, 0.13, 0.21]}>
            <boxGeometry args={[0.3, 0.05, 0.05]} />
            <meshStandardMaterial color="#0a0a12" emissive={eye} emissiveIntensity={1.4} />
          </mesh>
          {/* plume */}
          <mesh position={[0, 0.45, -0.04]} castShadow>
            <boxGeometry args={[0.08, 0.3, 0.22]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} />
          </mesh>
        </group>
      )
    case 'beast':
      return (
        <group>
          <mesh position={[0, 0.12, 0.04]} rotation={[0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.4, 0.36, 0.46]} />
            <meshStandardMaterial ref={collect} color={dark} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.9} flatShading />
          </mesh>
          {/* snout */}
          <mesh position={[0, 0.04, 0.28]} castShadow>
            <boxGeometry args={[0.24, 0.18, 0.2]} />
            <meshStandardMaterial color={dark} roughness={0.9} flatShading />
          </mesh>
          {/* horns */}
          {[-0.16, 0.16].map((x) => (
            <mesh key={x} position={[x, 0.34, -0.02]} rotation={[0, 0, x < 0 ? 0.4 : -0.4]} castShadow>
              <coneGeometry args={[0.07, 0.4, 5]} />
              <meshStandardMaterial color="#1a1620" flatShading />
            </mesh>
          ))}
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.16, 0.24]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color="#fff7e6" emissive={eye} emissiveIntensity={1.8} />
            </mesh>
          ))}
        </group>
      )
    case 'crown':
      return (
        <group>
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.36, 0.4, 0.36]} />
            <meshStandardMaterial ref={collect} color="#e9d8b0" emissive="#ff2a2a" emissiveIntensity={0} roughness={0.5} metalness={0.3} />
          </mesh>
          {/* nemes stripes */}
          <mesh position={[0, 0.16, 0.19]}>
            <boxGeometry args={[0.3, 0.3, 0.04]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} />
          </mesh>
          {/* tall crown */}
          {[-0.12, 0, 0.12].map((x, i) => (
            <mesh key={x} position={[x, 0.45 + (i === 1 ? 0.08 : 0), 0]} castShadow>
              <coneGeometry args={[0.06, i === 1 ? 0.34 : 0.24, 4]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} flatShading />
            </mesh>
          ))}
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0.16, 0.2]}>
              <boxGeometry args={[0.08, 0.05, 0.04]} />
              <meshStandardMaterial color="#fff7e6" emissive={eye} emissiveIntensity={1.6} />
            </mesh>
          ))}
        </group>
      )
  }
}

/* ------------------------------------------------------------- Shoulders */

function Shoulders({
  kind,
  accent,
  dark,
  bulk,
  collect,
}: {
  kind: Villain['shoulders']
  accent: string
  dark: string
  bulk: number
  collect: (m: THREE.MeshStandardMaterial | null) => void
}) {
  const x = 0.42 * bulk
  const sides = [-1, 1]
  switch (kind) {
    case 'spikes':
      return (
        <group>
          {sides.map((s) => (
            <mesh key={s} position={[s * x, 1.5, 0]} rotation={[0, 0, s * -0.6]} castShadow>
              <coneGeometry args={[0.12, 0.4, 5]} />
              <meshStandardMaterial color={dark} flatShading />
            </mesh>
          ))}
        </group>
      )
    case 'crystals':
      return (
        <group>
          {sides.map((s) => (
            <mesh key={s} position={[s * x, 1.46, 0]} castShadow>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color={accent} metalness={0.7} roughness={0.2} emissive={accent} emissiveIntensity={0.3} flatShading />
            </mesh>
          ))}
        </group>
      )
    case 'slabs':
      return (
        <group>
          {sides.map((s) => (
            <mesh key={s} position={[s * (x + 0.06), 1.46, 0]} castShadow>
              <boxGeometry args={[0.3, 0.34, 0.5]} />
              <meshStandardMaterial ref={collect} color={dark} emissive="#ff2a2a" emissiveIntensity={0} roughness={0.85} flatShading />
            </mesh>
          ))}
        </group>
      )
    case 'pauldrons':
      return (
        <group>
          {sides.map((s) => (
            <mesh key={s} position={[s * x, 1.48, 0]} castShadow>
              <sphereGeometry args={[0.24, 12, 10]} />
              <meshStandardMaterial color="#9aa3c4" metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
        </group>
      )
    case 'jagged':
      return (
        <group>
          {sides.map((s) =>
            [0, 1, 2].map((i) => (
              <mesh key={`${s}-${i}`} position={[s * x, 1.42 + i * 0.12, -0.1 + i * 0.05]} rotation={[0, 0, s * -0.5]} castShadow>
                <coneGeometry args={[0.08, 0.3, 4]} />
                <meshStandardMaterial color={dark} flatShading />
              </mesh>
            )),
          )}
        </group>
      )
    case 'royal':
      return (
        <group>
          {sides.map((s) => (
            <mesh key={s} position={[s * x, 1.46, 0]} castShadow>
              <boxGeometry args={[0.28, 0.16, 0.42]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.35} roughness={0.4} metalness={0.3} />
            </mesh>
          ))}
        </group>
      )
  }
}

/* --------------------------------------------------------------- Hands */

function LeftHand({ weapon, accent, dark }: { weapon: Villain['weapon']; accent: string; dark: string }) {
  if (weapon === 'daggers') {
    return (
      <group position={[0, -0.58, 0.1]}>
        <mesh rotation={[1.3, 0, 0]} castShadow>
          <coneGeometry args={[0.05, 0.5, 4]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} metalness={0.6} flatShading />
        </mesh>
      </group>
    )
  }
  if (weapon === 'halberd') {
    // shield on the left arm
    return (
      <group position={[0, -0.5, 0.12]}>
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.7, 0.08]} />
          <meshStandardMaterial color="#9aa3c4" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.06]}>
          <octahedronGeometry args={[0.14, 0]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} flatShading />
        </mesh>
      </group>
    )
  }
  if (weapon === 'claws' || weapon === 'fists') {
    return (
      <mesh position={[0, -0.6, 0.04]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.24]} />
        <meshStandardMaterial color={dark} roughness={0.8} flatShading />
      </mesh>
    )
  }
  return (
    <mesh position={[0, -0.58, 0]} castShadow>
      <sphereGeometry args={[0.11, 12, 12]} />
      <meshStandardMaterial color={dark} roughness={0.6} />
    </mesh>
  )
}

function RightHand({
  weapon,
  accent,
  dark,
  eye,
}: {
  weapon: Villain['weapon']
  accent: string
  dark: string
  eye: string
}) {
  switch (weapon) {
    case 'daggers':
      return (
        <group position={[0, -0.58, 0.1]}>
          <mesh rotation={[1.3, 0, 0]} castShadow>
            <coneGeometry args={[0.05, 0.5, 4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.5} metalness={0.6} flatShading />
          </mesh>
        </group>
      )
    case 'saber':
      return (
        <group position={[0, -0.62, 0.05]}>
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
            <meshStandardMaterial color={dark} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.07, 1.2, 0.03]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} metalness={0.7} roughness={0.2} />
          </mesh>
        </group>
      )
    case 'fists':
      return (
        <mesh position={[0, -0.62, 0.04]} castShadow>
          <boxGeometry args={[0.3, 0.3, 0.34]} />
          <meshStandardMaterial color={dark} roughness={0.85} flatShading />
        </mesh>
      )
    case 'halberd':
      return (
        <group position={[0, -0.5, 0.06]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 1.8, 8]} />
            <meshStandardMaterial color={dark} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.95, 0]} rotation={[0, 0, 0]} castShadow>
            <coneGeometry args={[0.12, 0.4, 4]} />
            <meshStandardMaterial color="#cfd6ea" metalness={0.7} roughness={0.3} flatShading />
          </mesh>
          <mesh position={[0.16, 0.8, 0]} rotation={[0, 0, -0.6]}>
            <boxGeometry args={[0.3, 0.18, 0.04]} />
            <meshStandardMaterial color="#cfd6ea" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      )
    case 'claws':
      return (
        <group position={[0, -0.62, 0.06]}>
          {[-0.1, 0, 0.1].map((x) => (
            <mesh key={x} position={[x, -0.05, 0.1]} rotation={[1.1, 0, 0]} castShadow>
              <coneGeometry args={[0.03, 0.34, 4]} />
              <meshStandardMaterial color="#f2efe9" emissive={eye} emissiveIntensity={0.3} flatShading />
            </mesh>
          ))}
          <mesh castShadow>
            <boxGeometry args={[0.22, 0.18, 0.22]} />
            <meshStandardMaterial color={dark} roughness={0.85} flatShading />
          </mesh>
        </group>
      )
    case 'staff':
      return (
        <group position={[0, -0.5, 0.06]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 1.9, 8]} />
            <meshStandardMaterial color={dark} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <icosahedronGeometry args={[0.18, 0]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} flatShading />
          </mesh>
          <mesh position={[0, 1.2, 0]}>
            <torusGeometry args={[0.26, 0.03, 8, 20]} />
            <meshStandardMaterial color={eye} emissive={eye} emissiveIntensity={0.8} />
          </mesh>
        </group>
      )
  }
}
