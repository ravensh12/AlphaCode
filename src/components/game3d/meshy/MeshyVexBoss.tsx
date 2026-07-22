import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { extendGltfLoader } from '../assetLoaders'
import { meshyAsset } from '../../../content/assets/meshyManifest'
import { instantiateMeshyCitizen } from './meshyCitizen'
import { VEX_DEATH_DUR, VEX_HEAVY_DUR, type VexBoss3DProps } from '../VexBoss3D'

/* ============================================================================
   MeshyVexBoss — the real character-boss-vex rig (2.4m, origin at feet)
   behind the EXACT VexBoss3D ref contract, so the CinematicBossArena's fight
   logic, phases, parry windows and death flow run unchanged.

   Clip map (three GLBs, clips bound onto one cloned skeleton by bone name):
     idle  — loop, the breathing baseline
     walk  — loop, drives 'stride' (and a leaning 'leap' hold)
     slam  — one-shot for 'heavy' AND 'cast': for the parryable heavy its
             timeScale is fitted so the clip's MID-STRIKE lands exactly on
             the arena's damage tick (0.45 × VEX_HEAVY_DUR into the active
             window) — the AoE now lands the frame the fists do.

   Everything the old procedural boss expressed with geometry (phase glow,
   hit flash, rage jitter, stagger recoil, death topple) is driven here on
   the root transform + the rig's baked-emissive materials — no new lights
   beyond the single core point light the old boss already carried.
   ========================================================================== */

const modelUrl = (id: string) =>
  `/${meshyAsset(id)?.url ?? `assets/meshy/character/${id}.glb`}`
const IDLE_URL = modelUrl('character-boss-vex-idle')
const WALK_URL = modelUrl('character-boss-vex-walk')
const SLAM_URL = modelUrl('character-boss-vex-slam')

const C_CYAN = new THREE.Color('#37e6ff')
const C_MAGENTA = new THREE.Color('#ff48e0')

/** Fraction of the slam clip where the strike visually lands (mid-clip). */
const SLAM_STRIKE_FRACTION = 0.5
/** The arena's damage tick inside the heavy's active window. */
const ARENA_CONNECT_FRACTION = 0.45

const MeshyVexBoss = memo(function MeshyVexBoss({
  phaseRef,
  animRef,
  hitRef,
  attackRef,
  staggerRef,
  armorBreakRef,
  readyRef,
  dead,
}: VexBoss3DProps) {
  const gl = useThree((state) => state.gl)
  const gltfs = useGLTF([IDLE_URL, WALK_URL, SLAM_URL], true, true, extendGltfLoader(gl))
  const root = useRef<THREE.Group>(null)
  const coreLight = useRef<THREE.PointLight>(null)

  const rig = useMemo(() => {
    const base = instantiateMeshyCitizen(gltfs[0], 2.4)
    const idle = base.action
    const walkClip = gltfs[1].animations[0] ?? null
    const slamClip = gltfs[2].animations[0] ?? null
    const walk = walkClip ? base.mixer.clipAction(walkClip) : null
    const slam = slamClip ? base.mixer.clipAction(slamClip) : null
    if (slam) {
      slam.setLoop(THREE.LoopOnce, 1)
      slam.clampWhenFinished = true
    }
    // Emissive-capable material handles for hit flash / phase glow.
    const mats = base.materials.filter(
      (m): m is THREE.MeshStandardMaterial =>
        (m as THREE.MeshStandardMaterial).emissive !== undefined,
    )
    return { ...base, idle, walk, slam, mats }
  }, [gltfs])

  useEffect(() => {
    if (readyRef) readyRef.current += 1
  }, [readyRef])

  useEffect(() => {
    const { mixer, idle, walk } = rig
    for (const a of [idle, walk]) {
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
  const prevStagger = useRef(staggerRef.current)
  const prevBreak = useRef(armorBreakRef.current)
  const prevAnim = useRef<string>('idle')
  const hitT = useRef(-100)
  const staggerT = useRef(-100)
  const breakT = useRef(-100)
  const wWalk = useRef(0)
  const wSlam = useRef(0)
  const enrage = useRef(0)
  const deathStart = useRef<number | null>(null)
  const tmpColor = useRef(new THREE.Color())

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime
    const r = root.current
    if (!r) return
    const phase = phaseRef.current
    const { mixer, idle, walk, slam, mats } = rig

    /* ------------------------------------------------------ death topple */
    if (dead) {
      if (deathStart.current == null) deathStart.current = t
      const eN = Math.min(1, (t - deathStart.current) / VEX_DEATH_DUR)
      const shudder = eN < 0.2 ? (Math.random() - 0.5) * 0.25 : 0
      r.rotation.x = -eN * 1.35 + shudder
      // Settle onto the deck, never through it — sinking to -0.9 buried the
      // corpse and made the kill read as the boss vanishing (QA).
      r.position.y = -eN * eN * 0.18
      // Core overload: emissive strobes white-hot, then dies to a faint ember
      // — never fully black, so the corpse still reads on the dark emblem.
      const strobe = eN < 0.6 && t % 0.1 < 0.05
      for (const m of mats) {
        m.emissiveIntensity = Math.max(0.35, (1 - eN) * (strobe ? 6 : 2.4))
      }
      if (coreLight.current) {
        coreLight.current.intensity = Math.max(0, (1 - eN) * 7)
      }
      slam?.stop()
      walk?.setEffectiveWeight(0)
      idle?.setEffectiveWeight(0.25)
      if (idle) idle.timeScale = 0.2
      mixer.update(dt)
      return
    }

    /* --------------------------------------------------------- reactions */
    if (hitRef.current !== prevHit.current) {
      prevHit.current = hitRef.current
      hitT.current = t
    }
    if (attackRef.current !== prevAtk.current) {
      prevAtk.current = attackRef.current
    }
    if (staggerRef.current !== prevStagger.current) {
      prevStagger.current = staggerRef.current
      staggerT.current = t
    }
    if (armorBreakRef.current !== prevBreak.current) {
      prevBreak.current = armorBreakRef.current
      breakT.current = t
    }
    const anim = animRef.current
    if (anim !== prevAnim.current) {
      prevAnim.current = anim
      // One-shot triggers on state entry.
      if (slam && (anim === 'heavy' || anim === 'cast')) {
        slam.reset()
        // Heavy: land the clip's mid-strike exactly on the arena's damage
        // tick. Cast: a slower, menacing version sells the channel.
        const dur = slam.getClip().duration
        slam.timeScale =
          anim === 'heavy'
            ? (SLAM_STRIKE_FRACTION * dur) / (ARENA_CONNECT_FRACTION * VEX_HEAVY_DUR)
            : dur / 1.25
        slam.play()
      }
    }

    const hitK = THREE.MathUtils.clamp(1 - (t - hitT.current) / 0.28, 0, 1)
    const parryK = THREE.MathUtils.clamp(1 - (t - staggerT.current) / 0.6, 0, 1)
    const breakK = THREE.MathUtils.clamp(1 - (t - breakT.current) / 0.5, 0, 1)
    enrage.current += ((phase >= 3 ? 1 : 0) - enrage.current) * Math.min(1, dt * 1.5)
    const rage = enrage.current

    /* ------------------------------------------------------- clip mixing */
    const moving = anim === 'stride' || anim === 'leap'
    const slamming = anim === 'heavy' || anim === 'cast'
    wWalk.current += ((moving && !slamming ? 1 : 0) - wWalk.current) * Math.min(1, dt * 10)
    wSlam.current += ((slamming ? 1 : 0) - wSlam.current) * Math.min(1, dt * 14)
    const loco = Math.max(0, 1 - wSlam.current)
    walk?.setEffectiveWeight(wWalk.current * loco)
    idle?.setEffectiveWeight((1 - wWalk.current) * loco)
    slam?.setEffectiveWeight(wSlam.current)
    if (walk) walk.timeScale = anim === 'leap' ? 1.5 : 1.1 + rage * 0.4
    if (idle) idle.timeScale = 1 + rage * 0.3
    // Stagger: the whole rig hangs frozen mid-pose while the punish window
    // is open — the root recoil below sells the reel.
    mixer.update(anim === 'stagger' ? dt * 0.12 : dt)

    /* ---------------------------------------------------- root reactions */
    const recoil = Math.max(parryK, anim === 'stagger' ? 0.8 : 0)
    const jitter = rage * 0.05
    r.rotation.x = -recoil * 0.45 + (anim === 'leap' ? 0.2 : 0)
    r.rotation.z = (Math.random() - 0.5) * jitter
    r.position.x = (Math.random() - 0.5) * jitter
    r.position.y = 0

    /* ------------------------------------------------ emissive phase glow */
    const pulse = Math.sin(t * (2 + phase * 0.8 + rage * 6)) * 0.5 + 0.5
    const c = tmpColor.current.copy(C_CYAN).lerp(C_MAGENTA, Math.min(1, (phase - 1) / 2))
    const boost =
      1.1 + (phase - 1) * 0.5 + pulse * 0.5 + hitK * 2.2 + parryK * 1.4 + breakK * 2.6 + rage
    for (const m of mats) {
      m.emissiveIntensity = boost
    }
    if (coreLight.current) {
      coreLight.current.color.copy(c)
      coreLight.current.intensity = 2.2 + (phase - 1) * 1.2 + pulse * 0.8 + hitK * 2 + rage * 1.5
    }
  })

  return (
    <group ref={root}>
      {/* Same self-illumination convention the procedural boss carried. */}
      <pointLight
        ref={coreLight}
        position={[0, 1.6, 0.4]}
        color={C_CYAN}
        intensity={2.2}
        distance={16}
        decay={1.7}
      />
      <primitive object={rig.scene} scale={rig.scale} />
    </group>
  )
})

export default MeshyVexBoss
