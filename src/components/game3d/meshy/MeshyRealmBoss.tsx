import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { extendGltfLoader } from '../assetLoaders'
import { instantiateMeshyCitizen } from './meshyCitizen'
import { BOSS_HEIGHTS, BOSS_IDS, clipUrls } from './realmBossAssets'
import type { BossAnim } from '../Boss3D'

/* ============================================================================
   MeshyRealmBoss — the real tier-11 villain rigs behind the EXACT Boss3D ref
   contract, so BossArena's fight logic runs unchanged. One character per
   variant, matching the lore identity the procedural rig sketched:

     0 The Hider · 1 Mirror Mimic · 2 Twin-Key Golem · 3 The Gatekeeper ·
     4 Bracket Beast · 5 Sorted Sphinx

   Clip map (idle GLB carries the mesh; every other clip GLB is ANIMATION-ONLY
   — stripped by scripts/meshy-boss-clips.mjs --strip — and is bound onto the
   idle rig's cloned skeleton by track name):

     idle    — loop, breathing baseline
     run     — loop, chase/strafe locomotion ('run', and a leaning 'jump' hold)
     attack  — one-shot on every attackRef bump (the orb volley swing/cast)
     scream  — one-shot for the entrance beat (animRef 'scream')
     hit     — one-shot flinch on hitRef bumps (rate-limited so rapid fire
               reads as flashes, not a spasming rig)
     death   — one-shot on `dead`, with the procedural topple as a fallback

   Everything is driven on the root transform + the rig's materials — no
   setState, no re-render mid-fight (same pattern as MeshyVexBoss).
   ========================================================================== */

/** Minimum gap between hit-flinch one-shots (s) — rapid fire stays readable. */
const HIT_CLIP_GAP = 0.9

const MeshyRealmBoss = memo(function MeshyRealmBoss({
  accent,
  variant,
  animRef,
  hitRef,
  attackRef,
  readyRef,
  dead,
}: {
  accent: string
  variant: number
  animRef?: MutableRefObject<BossAnim>
  hitRef: MutableRefObject<number>
  attackRef: MutableRefObject<number>
  /** Bumped once the real rig is mounted — arenas hold the entrance on it. */
  readyRef?: MutableRefObject<number>
  dead: boolean
}) {
  const gl = useThree((state) => state.gl)
  const urls = useMemo(() => clipUrls(variant), [variant])
  const gltfs = useGLTF(urls, true, true, extendGltfLoader(gl))
  const root = useRef<THREE.Group>(null)
  const coreLight = useRef<THREE.PointLight>(null)

  const rig = useMemo(() => {
    const base = instantiateMeshyCitizen(gltfs[0], BOSS_HEIGHTS[variant % BOSS_HEIGHTS.length])
    const idle = base.action
    const pick = (i: number) => {
      const clip = gltfs[i]?.animations[0] ?? null
      return clip ? base.mixer.clipAction(clip) : null
    }
    const run = pick(1)
    const attack = pick(2)
    const scream = pick(3)
    const hit = pick(4)
    const death = pick(5)
    for (const a of [attack, scream, hit, death]) {
      if (!a) continue
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
    }
    const mats = base.materials.filter(
      (m): m is THREE.MeshStandardMaterial =>
        (m as THREE.MeshStandardMaterial).emissive !== undefined,
    )
    // Per-identity material overrides — the Meshy albedo reads as uniform
    // matte plastic, so each boss gets the surface response its lore implies
    // (QA: mimic looked plastic, golem looked like painted metal not stone).
    const bossId = BOSS_IDS[variant % BOSS_IDS.length]
    if (bossId === 'mimic') {
      // Chrome duelist — a real mirror that throws the atrium back at you.
      for (const m of mats) {
        m.metalness = 0.9
        m.roughness = 0.16
        m.envMapIntensity = 1.8
      }
    } else if (bossId === 'golem') {
      // Twin-Key Golem — rough carved stone, not glossy metal. Kill the
      // specular so only the violet crack-glow (emissive) reads as "lit".
      for (const m of mats) {
        m.metalness = 0.0
        m.roughness = 0.96
        m.envMapIntensity = 0.45
      }
    }
    return { ...base, idle, run, attack, scream, hit, death, mats }
  }, [gltfs, variant])

  useEffect(() => {
    if (readyRef) readyRef.current += 1
  }, [readyRef])

  useEffect(() => {
    const { mixer, idle, run } = rig
    for (const a of [idle, run]) {
      if (!a) continue
      a.reset()
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
    }
    idle?.setEffectiveWeight(1)
    return () => {
      mixer.stopAllAction()
      for (const material of rig.materials) material.dispose()
    }
  }, [rig])

  // Reaction stamps (poll refs — never re-render mid-fight).
  const prevHit = useRef(hitRef.current)
  const prevAtk = useRef(attackRef.current)
  const prevAnim = useRef<string>('')
  const hitT = useRef(-100)
  const lastHitClip = useRef(-100)
  const wRun = useRef(0)
  const wOne = useRef(0) // one-shot overlay weight (attack/scream/hit/death)
  const oneShot = useRef<THREE.AnimationAction | null>(null)
  const deathStart = useRef<number | null>(null)
  const accentColor = useMemo(() => new THREE.Color(accent), [accent])

  /** Start (or restart) a one-shot overlay action. */
  function fireOneShot(action: THREE.AnimationAction | null, timeScale = 1) {
    if (!action) return
    if (oneShot.current && oneShot.current !== action) {
      oneShot.current.setEffectiveWeight(0)
      oneShot.current.stop()
    }
    oneShot.current = action
    action.reset()
    action.timeScale = timeScale
    action.play()
  }

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const r = root.current
    if (!r) return
    const { mixer, idle, run, attack, scream, hit, death, mats } = rig

    /* ------------------------------------------------------ death beat */
    if (dead) {
      if (deathStart.current == null) {
        deathStart.current = t
        fireOneShot(death, 1)
      }
      const eN = Math.min(1, (t - deathStart.current) / 1.35)
      const ease = 1 - (1 - eN) * (1 - eN)
      if (death) {
        // Real death clip drives the topple; fade locomotion out.
        wOne.current += (1 - wOne.current) * Math.min(1, dt * 14)
        death.setEffectiveWeight(wOne.current)
        run?.setEffectiveWeight(0)
        idle?.setEffectiveWeight(Math.max(0, 1 - wOne.current))
        // Guaranteed collapse floor: even if a clip failed to retarget onto
        // this rig, the root still visibly falls (QA: a boss stood upright at
        // 0 HP). A gentle forward pitch + sink reads as "down" under any clip.
        r.rotation.x = -ease * 0.5
        r.position.y = -ease * 0.1
      } else {
        // No clip shipped — full procedural backward topple (Boss3D's beat).
        r.rotation.x = -ease * 1.42
        r.position.y = -ease * 0.12
      }
      // Short ember flash that fades fast — a lingering full-red boss read as
      // a "stuck damage tint" (QA), so decay it inside the first ~0.5s.
      const flash = Math.max(0, 1 - eN * 2.4) * 0.8
      for (const m of mats) {
        m.emissive.set('#ff2a1e').lerp(accentColor, eN)
        m.emissiveIntensity = flash + 0.08
      }
      if (coreLight.current) coreLight.current.intensity = Math.max(0, (1 - eN) * 6)
      mixer.update(dt)
      return
    }

    /* ------------------------------------------------------- reactions */
    if (hitRef.current !== prevHit.current) {
      prevHit.current = hitRef.current
      // Rate-limit the flash: under sustained rapid fire a per-bolt restamp
      // held the boss permanently red (QA), erasing its color identity. A
      // short pulse with a forced gap reads as "taking hits", not "is red".
      if (t - hitT.current > 0.34) hitT.current = t
      // Flinch clip only occasionally; the emissive flash carries the rest.
      if (t - lastHitClip.current > HIT_CLIP_GAP && oneShot.current !== attack) {
        lastHitClip.current = t
        fireOneShot(hit, 1.4)
      }
    }
    if (attackRef.current !== prevAtk.current) {
      prevAtk.current = attackRef.current
      fireOneShot(attack, 1.15)
    }
    const anim = animRef?.current ?? 'idle'
    if (anim !== prevAnim.current) {
      prevAnim.current = anim
      if (anim === 'scream') fireOneShot(scream, 1)
    }

    /* ----------------------------------------------------- clip mixing */
    const one = oneShot.current
    let oneActive = false
    if (one) {
      const clipDur = one.getClip().duration
      oneActive = one.isRunning() && one.time < clipDur - 0.05
      if (!oneActive && !one.paused) {
        // finished — release the overlay
        one.setEffectiveWeight(0)
        one.stop()
        oneShot.current = null
      }
    }
    const moving = anim === 'run' || anim === 'jump'
    wOne.current += ((oneActive ? 1 : 0) - wOne.current) * Math.min(1, dt * 12)
    wRun.current += ((moving ? 1 : 0) - wRun.current) * Math.min(1, dt * 10)
    const loco = Math.max(0, 1 - wOne.current)
    run?.setEffectiveWeight(wRun.current * loco)
    idle?.setEffectiveWeight((1 - wRun.current) * loco)
    if (oneShot.current) oneShot.current.setEffectiveWeight(wOne.current)
    if (run) run.timeScale = anim === 'jump' ? 1.45 : 1.1
    mixer.update(dt)

    /* -------------------------------------------------- root reactions */
    // Airborne lean during leaps; small hit recoil lean.
    const hitK = THREE.MathUtils.clamp(1 - (t - hitT.current) / 0.14, 0, 1)
    r.rotation.x = (anim === 'jump' ? 0.18 : 0) - hitK * 0.07
    r.position.y = 0
    r.rotation.z = Math.sin(t * 60) * 0.03 * hitK

    /* ----------------------------------------------- emissive identity */
    const pulse = Math.sin(t * 2.6) * 0.5 + 0.5
    const boost = 0.16 + pulse * 0.1 + hitK * 0.75
    for (const m of mats) {
      if (hitK > 0.02) m.emissive.set('#ff3524').lerp(accentColor, 1 - hitK)
      else m.emissive.copy(accentColor)
      m.emissiveIntensity = boost
    }
    if (coreLight.current) {
      coreLight.current.intensity = 2.2 + pulse * 0.7 + hitK * 2.2
    }
  })

  return (
    <group ref={root}>
      {/* Same self-illumination convention the procedural boss carried. */}
      <pointLight
        ref={coreLight}
        position={[0, 1.8, 0.6]}
        color={accent}
        intensity={2.2}
        distance={12}
        decay={1.7}
      />
      {/* Accent ground pool so the boss's footprint reads on the dark asphalt. */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.35, 36]} />
        <meshBasicMaterial color={accent} transparent opacity={0.14} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
      <primitive object={rig.scene} scale={rig.scale} />
    </group>
  )
})

export default MeshyRealmBoss
