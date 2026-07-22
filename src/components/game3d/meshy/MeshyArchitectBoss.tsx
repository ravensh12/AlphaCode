import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { extendGltfLoader } from '../assetLoaders'
import { meshyAsset } from '../../../content/assets/meshyManifest'
import { instantiateMeshyCitizen } from './meshyCitizen'
import {
  ARCHITECT_DEATH_DUR,
  ARCHITECT_HEAVY_DUR,
  type Architect3DProps,
} from '../Architect3D'

/* ============================================================================
   MeshyArchitectBoss — the real character-boss-architect rig (2.1 m human
   mastermind: long black coat, silver hair, glowing chest sigil) behind the
   EXACT Architect3D ref contract, so ArchitectArena's four-phase fight,
   parry windows and death flow run unchanged.

   Clip map (idle GLB carries the mesh; the rest are ANIMATION-ONLY GLBs from
   scripts/meshy-boss-clips.mjs --strip, bound onto the cloned skeleton):

     idle    — loop, composed baseline
     run     — loop, drives 'stride'
     attack  — Mage Spell Cast one-shot for 'cast' AND 'blink' (sped up)
     slam    — Charged Ground Slam for the parryable 'heavy': timeScale is
               fitted so the clip's mid-strike lands exactly on the arena's
               damage tick (0.45 × ARCHITECT_HEAVY_DUR into the active window)
     stagger — Mummy Stagger reel while the parry-punish window is open
     scream  — Chest Pound Taunt one-shot on every phase break
     hit     — rate-limited flinch on hitRef bumps
     death   — Dying Backwards, stretched across ARCHITECT_DEATH_DUR

   Phase escalation is carried on the emissive channel (pale blue → furious
   red) + the core light, mirroring what the procedural rig did with geometry.
   ========================================================================== */

const modelUrl = (id: string) =>
  `/${meshyAsset(id)?.url ?? `assets/meshy/character/${id}.glb`}`

const URLS = [
  modelUrl('character-boss-architect-idle'),
  modelUrl('character-boss-architect-run'),
  modelUrl('character-boss-architect-attack'),
  modelUrl('character-boss-architect-slam'),
  modelUrl('character-boss-architect-stagger'),
  modelUrl('character-boss-architect-scream'),
  modelUrl('character-boss-architect-hit'),
  modelUrl('character-boss-architect-death'),
]

const C_CALM = new THREE.Color('#8ea2ff')
const C_RAGE = new THREE.Color('#ff3b4e')

/** Fraction of the slam clip where the strike visually lands (mid-clip). */
const SLAM_STRIKE_FRACTION = 0.5
/** The arena's damage tick inside the heavy's active window. */
const ARENA_CONNECT_FRACTION = 0.45
/** Minimum gap between hit-flinch one-shots (s). */
const HIT_CLIP_GAP = 0.9

const MeshyArchitectBoss = memo(function MeshyArchitectBoss({
  accent = '#8ea2ff',
  phaseRef,
  animRef,
  hitRef,
  attackRef,
  staggerRef,
  phaseBreakRef,
  readyRef,
  ghost = false,
  projection = false,
  dead,
}: Architect3DProps) {
  const gl = useThree((state) => state.gl)
  const gltfs = useGLTF(URLS, true, true, extendGltfLoader(gl))
  const root = useRef<THREE.Group>(null)
  const coreLight = useRef<THREE.PointLight>(null)

  const rig = useMemo(() => {
    const base = instantiateMeshyCitizen(gltfs[0], 2.1)
    const idle = base.action
    const pick = (i: number) => {
      const clip = gltfs[i]?.animations[0] ?? null
      return clip ? base.mixer.clipAction(clip) : null
    }
    const run = pick(1)
    const attack = pick(2)
    const slam = pick(3)
    const stagger = pick(4)
    const scream = pick(5)
    const hit = pick(6)
    const death = pick(7)
    for (const a of [attack, slam, stagger, scream, hit, death]) {
      if (!a) continue
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
    }
    const mats = base.materials.filter(
      (m): m is THREE.MeshStandardMaterial =>
        (m as THREE.MeshStandardMaterial).emissive !== undefined,
    )
    // Echo-clones render as translucent pale-blue ghosts so the REAL
    // Architect is unmistakable (QA: identical clones hid the target).
    if (ghost) {
      for (const m of mats) {
        m.transparent = true
        m.opacity = 0.42
        m.depthWrite = false
        m.color.lerp(new THREE.Color('#9fd0ff'), 0.55)
      }
    }
    // The colossal sky projection: a fog-immune spectral hologram. Very low
    // opacity (it spans the whole skyline), no depth writes, additive-ish
    // pale body that the emissive phase tint colors.
    if (projection) {
      // Solid spectral hologram, NOT additive — additive washed out to faint
      // smears against the bright corrupted sky (QA). A translucent pale body
      // carrying a HOT phase-driven emissive silhouettes cleanly at any sky
      // brightness (the glow is what reads at 100m; see the boost below).
      // No shadow casting: a colossus-scale skinned mesh in the shadow
      // frustum re-rendered the whole shadow map every frame (~8ms).
      base.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false
      })
      for (const m of mats) {
        m.transparent = true
        m.opacity = 0.6
        m.depthWrite = false
        m.fog = false
        m.color.lerp(new THREE.Color('#8aa8cc'), 0.85)
      }
    }
    return { ...base, idle, run, attack, slam, stagger, scream, hit, death, mats }
  }, [gltfs, ghost, projection])

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
  const prevStagger = useRef(staggerRef.current)
  const prevBreak = useRef(phaseBreakRef.current)
  const prevAnim = useRef<string>('')
  const hitT = useRef(-100)
  const lastHitClip = useRef(-100)
  const breakT = useRef(-100)
  const wRun = useRef(0)
  const wOne = useRef(0)
  const oneShot = useRef<THREE.AnimationAction | null>(null)
  const deathStart = useRef<number | null>(null)
  const rage = useRef(0)
  const tmpColor = useRef(new THREE.Color())
  void accent

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
    // The sky projection idles offstage until phase 2 — skip its mixer and
    // material work entirely while any ancestor is hidden.
    if (projection) {
      let n: THREE.Object3D | null = r
      while (n) {
        if (!n.visible) return
        n = n.parent
      }
    }
    const phase = phaseRef.current
    const { mixer, idle, run, attack, slam, stagger, scream, hit, death, mats } = rig

    /* ------------------------------------------------------ death beat */
    if (dead) {
      if (deathStart.current == null) {
        deathStart.current = t
        if (death) {
          const dur = death.getClip().duration
          // Land the fall inside the arena's long death orbit, then hold.
          fireOneShot(death, dur / Math.min(ARCHITECT_DEATH_DUR, dur * 2.2))
        }
      }
      const eN = Math.min(1, (t - deathStart.current) / ARCHITECT_DEATH_DUR)
      if (death) {
        wOne.current += (1 - wOne.current) * Math.min(1, dt * 10)
        death.setEffectiveWeight(wOne.current)
        run?.setEffectiveWeight(0)
        idle?.setEffectiveWeight(Math.max(0, 1 - wOne.current))
      } else {
        const ease = 1 - (1 - eN) * (1 - eN)
        r.rotation.x = -ease * 1.3
        r.position.y = -eN * eN * 0.4
      }
      // Reality dissolving: strobing sigil glow that dies with him.
      const strobe = eN < 0.7 && t % 0.12 < 0.06
      for (const m of mats) {
        m.emissiveIntensity = Math.max(0, (1 - eN) * (strobe ? 5 : 2))
      }
      if (coreLight.current) coreLight.current.intensity = Math.max(0, (1 - eN) * 7)
      mixer.update(dt)
      return
    }

    /* --------------------------------------------------------- reactions */
    if (hitRef.current !== prevHit.current) {
      prevHit.current = hitRef.current
      // Rate-limited pulse: a per-bolt restamp held the rig permanently red
      // under sustained fire (QA). The sky projection never flinches — a
      // skyline-sized red flash per bolt would strobe the whole frame.
      if (!projection) {
        if (t - hitT.current > 0.34) hitT.current = t
        if (t - lastHitClip.current > HIT_CLIP_GAP && oneShot.current == null) {
          lastHitClip.current = t
          fireOneShot(hit, 1.5)
        }
      }
    }
    if (attackRef.current !== prevAtk.current) {
      prevAtk.current = attackRef.current
    }
    if (staggerRef.current !== prevStagger.current) {
      prevStagger.current = staggerRef.current
      fireOneShot(stagger, 1)
    }
    if (phaseBreakRef.current !== prevBreak.current) {
      prevBreak.current = phaseBreakRef.current
      breakT.current = t
      fireOneShot(scream, 1.1)
    }
    const anim = animRef.current
    if (anim !== prevAnim.current) {
      prevAnim.current = anim
      if (anim === 'heavy' && slam) {
        const dur = slam.getClip().duration
        fireOneShot(
          slam,
          (SLAM_STRIKE_FRACTION * dur) / (ARENA_CONNECT_FRACTION * ARCHITECT_HEAVY_DUR),
        )
      } else if (anim === 'cast') {
        fireOneShot(attack, 1.2)
      } else if (anim === 'blink') {
        fireOneShot(attack, 1.7)
      }
    }

    const hitK = THREE.MathUtils.clamp(1 - (t - hitT.current) / 0.14, 0, 1)
    const breakK = THREE.MathUtils.clamp(1 - (t - breakT.current) / 0.6, 0, 1)
    rage.current += ((phase >= 3 ? 1 : 0) - rage.current) * Math.min(1, dt * 1.4)

    /* ------------------------------------------------------- clip mixing */
    const one = oneShot.current
    let oneActive = false
    if (one) {
      const clipDur = one.getClip().duration
      oneActive = one.isRunning() && one.time < clipDur - 0.05
      if (!oneActive && !one.paused) {
        one.setEffectiveWeight(0)
        one.stop()
        oneShot.current = null
      }
    }
    const moving = anim === 'stride'
    wOne.current += ((oneActive ? 1 : 0) - wOne.current) * Math.min(1, dt * 12)
    wRun.current += ((moving ? 1 : 0) - wRun.current) * Math.min(1, dt * 10)
    const loco = Math.max(0, 1 - wOne.current)
    run?.setEffectiveWeight(wRun.current * loco)
    idle?.setEffectiveWeight((1 - wRun.current) * loco)
    if (oneShot.current) oneShot.current.setEffectiveWeight(wOne.current)
    if (run) run.timeScale = 1.15 + rage.current * 0.35
    if (idle) idle.timeScale = 1 + rage.current * 0.25
    // Stagger reel plays near-frozen so the punish window reads.
    mixer.update(anim === 'stagger' && oneShot.current === stagger ? dt * 0.55 : dt)

    /* ---------------------------------------------------- root reactions */
    const jitter = rage.current * 0.035
    r.rotation.x = -hitK * 0.06
    r.rotation.z = (Math.random() - 0.5) * jitter
    r.position.x = (Math.random() - 0.5) * jitter
    r.position.y = 0

    /* ------------------------------------------------ emissive phase glow */
    // Kept LOW: the Meshy emissive map covers more than the chest sigil, so
    // anything past ~1.5 turned his head into a blown-out bloom balloon (QA).
    const pulse = Math.sin(t * (2 + phase * 0.9)) * 0.5 + 0.5
    // Ghost clones NEVER inherit the rage palette — staying pale blue is what
    // keeps them distinguishable from the enraged boss at a glance (QA). The
    // sky projection DOES rage: the city turning red with him is the finale.
    const c = ghost && !projection
      ? tmpColor.current.copy(C_CALM)
      : tmpColor.current.copy(C_CALM).lerp(C_RAGE, Math.min(1, (phase - 1) / 3))
    // The sky projection runs MUCH hotter than the deck rig: at 100m+ and
    // ~26x scale a subtle glow disappears entirely (QA: "faint smears"), and
    // its emissive map spread is a feature at that size — the whole figure
    // silhouettes as a burning hologram against the corrupted sky.
    const boost = projection
      ? 2.0 + pulse * 0.6 + (phase - 1) * 0.25
      : Math.min(
          1.5,
          0.3 + (phase - 1) * 0.12 + pulse * 0.14 + hitK * 0.8 + breakK * 1.0 + rage.current * 0.2,
        ) * (ghost ? 0.5 : 1)
    for (const m of mats) {
      if (hitK > 0.4) m.emissive.set('#ff2418')
      else m.emissive.copy(c)
      m.emissiveIntensity = boost
    }
    if (coreLight.current) {
      coreLight.current.color.copy(c)
      // The projection's point light would scale with the giant group —
      // a skyline-wide light — so it stays off.
      coreLight.current.intensity =
        (2.2 + (phase - 1) * 0.9 + pulse * 0.6 + hitK * 1.6 + breakK * 2.4) *
        (projection ? 0 : ghost ? 0.3 : 1)
    }
  })

  return (
    <group ref={root}>
      {/* Same self-illumination convention the procedural boss carried. */}
      <pointLight
        ref={coreLight}
        position={[0, 1.6, 0.5]}
        color={C_CALM}
        intensity={2.4}
        distance={16}
        decay={1.7}
      />
      <primitive object={rig.scene} scale={rig.scale} />
    </group>
  )
})

export default MeshyArchitectBoss
