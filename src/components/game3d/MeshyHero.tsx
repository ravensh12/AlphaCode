import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { applyRimLight, rimHandleOf } from './simulation'
import { extendGltfLoader } from './assetLoaders'
import type { AvatarAnim } from './Avatar'
import {
  GUN_SEAT_UP_CM,
  GUN_SEAT_FORWARD_CM,
  GUN_VISUAL_SCALE,
  HERO_GUN_NODE,
} from './heroGunSeat'

/* ============================================================================
   THE MESHY HERO — the default player, animated with its OWN native clips.

   ROOT-CAUSE FIX (owner directive: "literally just take it straight from Meshy
   and import it"). The player character is the Meshy `character-hero-a` rig.
   Every movement clip it plays — idle/walk/run/sprint/jump/crouch/dash/slash/
   shoot/hit/victory AND the phase-2/3 vault/strafe/backpedal/turn/run-and-gun
   set — was authored by Meshy ON THIS EXACT 24-joint armature. They are bound
   by bone name onto the cloned mesh and played 1:1 — NO cross-rig retarget.

   The previous pipeline RETARGETED those same clips onto the legacy three.js
   Soldier rig, and that lossy transfer is what produced the glitches the user
   saw: the vault became a crumpled cower, run-and-gun arms flattened, etc.
   (before/after: e2e-shots/cmp-vault-retarget.png vs cmp-vault-native.png).
   Playing the clips natively removes the whole class of bug at the source, so
   this component carries NO procedural aim/crouch/sprint pose layers fighting
   the clips — only the additive recoil kick and the weapon/VFX tells.

   All clips live in ONE small side-loaded GLB (bones + quaternion tracks only,
   ~680 KB, baked by scripts/bake-meshy-hero-anims.mjs); the mesh/skeleton come
   from the idle GLB. Two fetches total. Root motion is stripped (Hips XZ) —
   the ThirdPersonController owns all horizontal travel.
   ========================================================================== */

const BASE = import.meta.env.BASE_URL ?? '/'

export type HeroVariant = 'a' | 'b' | 'cyborg'

/* ============================================================================
   CYBORG PLAYER (Meshy mesh + Mixamo motion, rest-delta retargeted in Blender).

   The production pipeline (scripts/pipeline/*, see Production.md §5) optimizes
   the Meshy auto-rigged cyborg and REST-DELTA-retargets the Mixamo clip set onto
   it, then sync_web.mjs lands ONE GLB — mesh + skeleton + every named clip — at
   public/world/characters/cyborg.glb. The clips are named to MeshyHero's own
   vocabulary (idle/walk/run/sprint/strafeL/strafeR/back/jump/vault/shoot/...),
   so the runtime reads them straight by name — no in-engine remap.
   ========================================================================== */
const CYBORG_URL = `${BASE}world/characters/cyborg.glb`

/** The consolidated native clip bank (shared rig — binds onto either variant). */
const ANIMS_URL = `${BASE}assets/meshy/character/character-hero-a-anims.glb`
const heroMeshUrl = (variant: HeroVariant) =>
  variant === 'cyborg'
    ? CYBORG_URL
    : `${BASE}assets/meshy/character/character-hero-${variant}-idle.glb`
/** Cyborg carries its clips in the SAME GLB as the mesh; a/b use the bank. */
const heroAnimsUrl = (variant: HeroVariant) => (variant === 'cyborg' ? CYBORG_URL : ANIMS_URL)

/* ---------------------------------------------------------------- weapon ---
   ANIMATION REWORK (owner directive): the big tactical machine gun that hung
   off the hand is DELETED. The hero carries the game's own compact energy
   blaster (the procedural Pattern-Cannon visual below — the same kit the
   Soldier hero uses), seated in the right hand so the new Meshy shooting
   clips read with a weapon that actually tracks the palm. */

useGLTF.preload(ANIMS_URL)
useGLTF.preload(CYBORG_URL)

/** Locomotion clips, weight-blended by MEASURED ground speed. */
type LocoKey = 'idle' | 'walk' | 'run' | 'sprint'
/** Reference speeds (m/s) at which each cycle plays at 1×.
 *  GLOBAL PACE PASS NOTE: these are CLIP-intrinsic (the ground speed each
 *  cycle's stride was authored to cover), so they deliberately did NOT scale
 *  with the -12% velocity pass. timeScale = measured speed / ref keeps feet
 *  planted at ANY game speed; shrinking the refs by 0.88 would instead make
 *  the feet over-stride the (slower) ground by ~13%. Verified frame-by-frame
 *  in the anim-QA review loop at the new velocities. */
const WALK_REF = 1.45
const RUN_REF = 4.6
const SPRINT_REF = 7.2
/** Must match DASH_TIME in ThirdPersonController so the swing fills the lunge. */
const SLASH_TIME = 0.32

/**
 * Full-body directional / stance LOOPS that TAKE OVER locomotion for their
 * exact state (feet agree with travel direction; each is its own authored
 * cycle). `back` and the strafes are Meshy's guarded-run / walk-backward-while-
 * shooting clips, so they already read as run-and-gun with no overlay.
 */
const LOOPS = {
  strafeL: { clip: 'strafeL', ref: 5.0 },
  strafeR: { clip: 'strafeR', ref: 5.0 },
  back: { clip: 'back', ref: 3.0 },
  crouch: { clip: 'crouch', ref: 1.3 },
} as const
type LoopKey = keyof typeof LOOPS

/**
 * The single one-shot override slot: exactly one clip owns the whole body at a
 * time, chosen by a strict priority ladder (death > hit > vault > jump > dash >
 * victory > turn). One slot makes one-shot stacking impossible by
 * construction — the class of "two poses fighting" bug the old rig had.
 */
type OverrideName = 'death' | 'hit' | 'vault' | 'jump' | 'dash' | 'victory' | 'turnL' | 'turnR'
const OVERRIDE_CLIP: Record<OverrideName, string> = {
  // Player death (presentation only): the cyborg's native retargeted `death`
  // clip — a full collapse. clampWhenFinished holds the body on the ground
  // until the state leaves 'death' (the page's respawn resets the anim).
  death: 'death',
  hit: 'hit',
  vault: 'vault',
  jump: 'jump',
  dash: 'slash', // the blade-dash body rides the sword-slash clip
  victory: 'victory',
  turnL: 'turnL',
  turnR: 'turnR',
}
/** How each one-shot enters (start time + play rate), tuned per NEW Meshy clip.
 *  Durations: hit 1.63s, vault 1.17s (Parkour Vault 2 — lateral speed-vault),
 *  jump 1.9s (Regular Jump, ~0.4s standing anticipation up front), victory
 *  1.53s, turns 1.5/1.8s. */
const OVERRIDE_START: Record<OverrideName, { time: number; timeScale: number }> = {
  // 3.5s authored collapse played at 1.25 (~2.8s to the ground): dramatic but
  // done before the death overlay's actions demand attention.
  death: { time: 0, timeScale: 1.25 },
  hit: { time: 0, timeScale: 1.3 },
  // The speed-vault (1.17s): plant → lateral sail → running recovery. Rate
  // 1.3 fits the whole clip into the raised ~0.85s vault arc: the horizontal
  // sail lands on the apex and the clip's own run-recovery tail plays out
  // just as the physics touches down — no prone-to-upright pop.
  vault: { time: 0.1, timeScale: 1.3 },
  // Start past the anticipation AND the arm-sweep push-off (reads as a face
  // wipe when the feet already left the ground); at 1× the ~0.6s hop covers
  // tuck → touchdown step, and the slot fade-out plays the landing absorb
  // right as the physics lands.
  jump: { time: 0.55, timeScale: 1.0 },
  dash: { time: 0, timeScale: 1 }, // resolved from the clip below
  victory: { time: 0, timeScale: 1 },
  turnL: { time: 0, timeScale: 1.5 },
  turnR: { time: 0, timeScale: 1.5 },
}

/** Upper-body bone set for the run-and-gun shoot overlay (aim over the legs). */
const UPPER_BODY = new Set([
  'Spine',
  'Spine01',
  'Spine02',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'neck',
  'Head',
  'head_end',
  'headfront',
])

/**
 * Standing-fire aim overlay super-weight. The mixer normalises by cumulative
 * weight, so a value above the ~1.0 locomotion base lets the aim own the
 * upper bones decisively without zeroing the legs' sway. ONE constant because
 * the gun-holder calibration must sample the pose at THIS exact blend — a
 * different weight there yields a different hand orientation and the seat
 * rotation comes out wrong (visible in cinematic closeups).
 */
const AIM_OVERLAY_WEIGHT = 2.2

/** The shoot clip reduced to upper-body tracks (aim/fire over running legs). */
function upperBodyOnly(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => UPPER_BODY.has(t.name.split('.')[0]))
  return new THREE.AnimationClip(`${clip.name}-upper`, clip.duration, tracks)
}

function skinnedHeight(scene: THREE.Object3D): number {
  scene.updateMatrixWorld(true)
  const union = new THREE.Box3()
  const local = new THREE.Box3()
  let any = false
  scene.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    mesh.computeBoundingBox()
    if (!mesh.boundingBox) return
    local.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld)
    union.union(local)
    any = true
  })
  if (!any) union.setFromObject(scene)
  return union.max.y - union.min.y
}

/** Frame-rate-independent ease toward a target. */
function easeTo(v: number, target: number, dt: number, rate: number): number {
  return v + (target - v) * Math.min(1, dt * rate)
}

type HeroProps = {
  anim?: AvatarAnim
  accent?: string
  fireRef?: React.MutableRefObject<number>
  animRef?: React.MutableRefObject<AvatarAnim>
  slashRef?: React.MutableRefObject<number>
  jumpSeqRef?: React.MutableRefObject<number>
  variant?: HeroVariant
}

export function MeshyHeroAvatar({
  anim = 'idle',
  accent = '#6d4afe',
  fireRef,
  animRef,
  slashRef,
  jumpSeqRef,
  variant = 'a',
}: HeroProps) {
  const gl = useThree((s) => s.gl)
  const meshUrl = useMemo(() => heroMeshUrl(variant), [variant])
  const animsUrl = useMemo(() => heroAnimsUrl(variant), [variant])
  const meshGltf = useGLTF(meshUrl, true, true, extendGltfLoader(gl))
  const animsGltf = useGLTF(animsUrl, true, true, extendGltfLoader(gl))
  const root = useRef<THREE.Group>(null)

  const rig = useMemo(() => {
    const scene = cloneSkeleton(meshGltf.scene)

    // Instance-local materials: rim-lit body (district accent), shadows on.
    let bodyMat: THREE.MeshStandardMaterial | null = null
    scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.frustumCulled = false // bind-pose bounds are junk on Meshy rigs
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const inst = (src as THREE.MeshStandardMaterial).clone()
      applyRimLight(inst, '#7fd8ff', 0.42)
      bodyMat = inst
      mesh.material = inst
    })

    const mixer = new THREE.AnimationMixer(scene)
    const clip = (n: string): THREE.AnimationClip | null =>
      THREE.AnimationClip.findByName(animsGltf.animations, n)
    const action = (n: string): THREE.AnimationAction | null => {
      const c = clip(n)
      return c ? mixer.clipAction(c) : null
    }

    const loco: Record<LocoKey, THREE.AnimationAction | null> = {
      idle: action('idle'),
      walk: action('walk'),
      run: action('run'),
      sprint: action('sprint'),
    }
    const loops: Record<LoopKey, THREE.AnimationAction | null> = {
      strafeL: action('strafeL'),
      strafeR: action('strafeR'),
      back: action('back'),
      crouch: action('crouch'),
    }
    // One clip per override NAME (dash + any future alias can share a clip).
    const overrides: Record<string, THREE.AnimationAction | null> = {}
    for (const name of new Set(Object.values(OVERRIDE_CLIP))) overrides[name] = action(name)
    // The a/b clip bank carries no `death` — hold the hit reaction's clamped
    // final frame as a stand-in so the 'death' state never fades every action
    // to zero (which would snap the rig to bind pose). The production cyborg
    // bank has the real collapse clip.
    if (!overrides.death) overrides.death = overrides.hit

    // Run-and-gun (rework): the 'shoot' clip (Walk Forward While Shooting)
    // reduced to its UPPER BODY drives the standing/walking fire — the aim arm
    // rides over whatever the legs are doing. 'shootRun' (Run and Shoot) is a
    // FULL-BODY run-fire cycle that owns the whole body while firing on the
    // move — feet and gun agree, nothing fights the stride.
    const shootFull = clip('shoot')
    const shootUpper = shootFull ? mixer.clipAction(upperBodyOnly(shootFull.clone())) : null
    const shootRun = action('shootRun')

    // Weapon anchor on the right hand (armature is cm-scale under a 0.01 root,
    // so the holder scales back to meters). The holder rotation is CALIBRATED:
    // orient its +z (the barrel) along the character forward in world space.
    const handR = scene.getObjectByName('RightHand') as THREE.Bone | undefined
    const holder = new THREE.Group()
    holder.scale.setScalar(100)
    handR?.add(holder)

    // Normalize to the Soldier's capsule height (measure the settled idle).
    if (loco.idle) {
      loco.idle.play()
      mixer.update(0)
    }
    const rawHeight = skinnedHeight(scene)
    let scale = 1.76 / Math.max(1e-3, rawHeight)
    if (!Number.isFinite(scale) || scale <= 0) scale = 1
    scale = Math.min(1000, Math.max(0.001, scale))
    if (handR) {
      // Blaster seat: CALIBRATED IN THE AIM POSE AS IT ACTUALLY RENDERS. The
      // holder's +z (the barrel) must equal the character's forward exactly
      // in the standing-fire pose — sample that pose, cancel the hand's world
      // rotation there, and the gun tracks the palm through every clip.
      //
      // CRITICALLY, the sampled pose must be the RUNTIME blend, not the raw
      // clip: standing fire renders as the UPPER-BODY shoot overlay at the
      // 2.2 super-weight OVER idle (weight 1), hips staying on idle. The old
      // pass sampled the FULL-BODY shoot clip at an equal 1:1 blend with
      // idle — a pose that never renders — so the cancellation quaternion
      // carried a ~25° error: invisible at gameplay camera distance, but in
      // the intro cinematic's 44mm grip closeup the blaster visibly lay
      // across the torso instead of along the aim arm (intro-after-v2 QA).
      const calib = shootUpper ?? loco.idle
      if (calib) {
        calib.reset()
        calib.setEffectiveWeight(calib === shootUpper ? AIM_OVERLAY_WEIGHT : 1)
        calib.play()
        mixer.update(0.8) // the clip's arm-extended aim moment
      }
      scene.updateMatrixWorld(true)
      const handWorld = new THREE.Quaternion()
      handR.getWorldQuaternion(handWorld)
      holder.quaternion.copy(handWorld.invert())
      holder.position.set(0, 0, 0)
      // Seat CENTERED ON THE PALM, not the wrist (cm, in the calibrated
      // aim-forward frame): the hand bone origin sits at the wrist, so the
      // old +3cm forward left the receiver clamped to the forearm with the
      // empty fingers poking out past the muzzle (gun-fit QA closeups,
      // e2e-shots/anim-qa-v3). +8cm forward puts the grip in the fingers'
      // curl; +1.5 up keeps the receiver resting on the palm line.
      holder.translateY(GUN_SEAT_UP_CM)
      holder.translateZ(GUN_SEAT_FORWARD_CM)
      if (calib) calib.stop()
    }
    if (loco.idle) loco.idle.stop()

    return { scene, mixer, loco, loops, overrides, shootUpper, shootRun, holder, bodyMat, scale }
  }, [meshGltf, animsGltf])

  useEffect(() => {
    const { mixer, scene, loco, loops, overrides, shootUpper, shootRun } = rig
    // Locomotion + directional loops + run-and-gun overlays always PLAY (weight
    // eased in the frame loop). Activate here — StrictMode-safe (mount→cleanup→
    // mount reuses the memoized rig; the useMemo does not re-run).
    for (const a of Object.values(loco)) {
      if (!a) continue
      a.reset()
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
    }
    for (const a of Object.values(loops)) {
      if (!a) continue
      a.reset()
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
    }
    if (shootUpper) {
      shootUpper.reset()
      shootUpper.enabled = true
      shootUpper.setEffectiveWeight(0)
      shootUpper.play()
      // FROZEN at the clip's arm-extended aim frame (the same moment the gun
      // holder is calibrated against): the standing fire is a rock-steady aim
      // under the reticle; the ADDITIVE recoil kick + muzzle flash carry the
      // fire, not the clip's own bursty raise-lower cadence.
      shootUpper.time = 0.8
      shootUpper.timeScale = 0
    }
    if (shootRun) {
      shootRun.reset()
      shootRun.enabled = true
      shootRun.setEffectiveWeight(0)
      shootRun.play()
    }
    // Overrides are armed one-shots (hold the last frame), NOT played until a
    // state edge triggers them in the frame loop.
    for (const a of Object.values(overrides)) {
      if (!a) continue
      a.reset()
      a.enabled = true
      a.setEffectiveWeight(0)
      a.setLoop(THREE.LoopOnce, 1)
      a.clampWhenFinished = true
    }
    loco.idle?.setEffectiveWeight(1)
    return () => {
      mixer.stopAllAction()
      scene.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh
        if (!mesh.isSkinnedMesh) return
        mesh.skeleton?.dispose()
        const m = mesh.material
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
        else m?.dispose()
      })
    }
  }, [rig])

  // Live accent without a rig rebuild.
  useEffect(() => {
    if (rig.bodyMat) rimHandleOf(rig.bodyMat)?.color.set(accent)
  }, [rig, accent])

  // Weapon visuals (same kit as the Soldier hero).
  const gun = useRef<THREE.Group>(null)
  const flash = useRef<THREE.Group>(null)
  const sword = useRef<THREE.Group>(null)
  const slashArc = useRef<THREE.Mesh>(null)
  const slashMat = useRef<THREE.MeshBasicMaterial>(null)

  const colors = useMemo(() => {
    const a = new THREE.Color(accent)
    return {
      tip: accent,
      bodyDark: '#' + a.clone().multiplyScalar(0.65).getHexString(),
      joint: '#2b3040',
      visor: '#8fe9ff',
    }
  }, [accent])

  // Per-frame scratch + eased weights (never allocated in the loop).
  const scratch = useMemo(
    () => ({ prev: new THREE.Vector3(), cur: new THREE.Vector3(), started: false }),
    [],
  )
  const spd = useRef(0)
  const wLoco = useRef<Record<LocoKey, number>>({ idle: 1, walk: 0, run: 0, sprint: 0 })
  const wLoop = useRef<Record<LoopKey, number>>({ strafeL: 0, strafeR: 0, back: 0, crouch: 0 })
  const over = useRef<{ name: OverrideName | null; w: number }>({ name: null, w: 0 })
  const lastJumpSeq = useRef(0)
  const wShoot = useRef(0)
  const wShootRun = useRef(0)
  const wasRunFiring = useRef(false)

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    if (dt <= 0) return
    const t = state.clock.elapsedTime
    const r = root.current
    if (!r) return
    const { loco, loops, overrides, shootUpper, shootRun, mixer } = rig

    // Measured ground speed → locomotion blend + honest cycle rates.
    r.getWorldPosition(scratch.cur)
    if (!scratch.started) {
      scratch.started = true
      scratch.prev.copy(scratch.cur)
    }
    const dx = scratch.cur.x - scratch.prev.x
    const dz = scratch.cur.z - scratch.prev.z
    scratch.prev.copy(scratch.cur)
    const rawSpeed = Math.min(20, Math.hypot(dx, dz) / dt)
    spd.current = easeTo(spd.current, rawSpeed, dt, 10)
    const speed = spd.current

    const a = animRef ? animRef.current : anim
    const firing = fireRef ? fireRef.current > 0 && t - fireRef.current < 0.45 : false

    // --- The one-shot override slot (highest-priority active wins) -----------
    const victoryLike = a === 'wave' || a === 'dance' || a === 'victory'
    const desired: OverrideName | null =
      a === 'death'
        ? 'death'
        : a === 'hit'
          ? 'hit'
          : a === 'vault'
            ? 'vault'
            : a === 'jump'
              ? 'jump'
              : a === 'dash' || a === 'punch'
                ? 'dash'
                : victoryLike
                  ? 'victory'
                  : a === 'turnL' && !firing
                    ? 'turnL'
                    : a === 'turnR' && !firing
                      ? 'turnR'
                      : null
    const slot = over.current
    const jumpSeq = jumpSeqRef ? jumpSeqRef.current : 0
    const retriggerHop =
      desired !== null &&
      desired === slot.name &&
      (desired === 'jump' || desired === 'vault') &&
      jumpSeq !== lastJumpSeq.current
    if (desired !== null && (desired !== slot.name || retriggerHop)) {
      if (slot.name && slot.name !== desired) overrides[OVERRIDE_CLIP[slot.name]]?.setEffectiveWeight(0)
      const act = overrides[OVERRIDE_CLIP[desired]]
      if (act) {
        const start = OVERRIDE_START[desired]
        act.reset()
        act.time = start.time
        act.timeScale =
          desired === 'dash' ? Math.max(0.6, act.getClip().duration / 0.62) : start.timeScale
        act.play()
      }
      slot.name = desired
    }
    if (desired === 'jump' || desired === 'vault') lastJumpSeq.current = jumpSeq
    slot.w = easeTo(slot.w, desired !== null ? 1 : 0, dt, desired !== null ? 16 : 10)
    if (desired === null && slot.w < 0.01 && slot.name) {
      overrides[OVERRIDE_CLIP[slot.name]]?.setEffectiveWeight(0)
      slot.name = null
      slot.w = 0
    }
    if (slot.name) overrides[OVERRIDE_CLIP[slot.name]]?.setEffectiveWeight(slot.w)
    const override = slot.name ? slot.w : 0

    // --- Directional / stance loops: each owns its whole body for its state --
    const loco1 = 1 - override
    const loopState: LoopKey | null =
      a === 'crouch'
        ? 'crouch'
        : a === 'back'
          ? 'back'
          : a === 'strafeL'
            ? 'strafeL'
            : a === 'strafeR'
              ? 'strafeR'
              : null
    let loopW = 0
    for (const key of Object.keys(LOOPS) as LoopKey[]) {
      const target = loopState === key ? loco1 : 0
      const rate = target === 0 && override > 0.3 ? 18 : 11
      wLoop.current[key] = easeTo(wLoop.current[key], target, dt, rate)
      const act = loops[key]
      if (act) {
        act.setEffectiveWeight(wLoop.current[key])
        act.timeScale =
          key === 'crouch'
            ? THREE.MathUtils.clamp(speed / LOOPS.crouch.ref, 0.14, 2.1)
            : THREE.MathUtils.clamp(speed / LOOPS[key].ref, 0.7, 1.8)
      }
      loopW = Math.max(loopW, wLoop.current[key])
    }

    // --- RUN-AND-GUN (rework): firing on the move rides the dedicated
    //     full-body 'shootRun' cycle (Run and Shoot) — feet, torso and gun arm
    //     all come from ONE authored clip, so nothing fights the stride. It
    //     joins the loop layer: locomotion fades out under it below.
    const runFiring = firing && (a === 'run' || a === 'sprint') && !!shootRun
    // STRIDE PHASE-SYNC (sprint-shoot de-clank): the always-playing loco and
    // shootRun cycles sit at RANDOM relative stride phases, so the ~150ms
    // crossfade at each fire/release edge used to double-pose the legs (left
    // and right stride fighting — the "clank"). On each edge the INCOMING
    // cycle (weight ≈ 0, so the time snap is invisible) is re-phased to match
    // the outgoing stride. Offsets were fitted numerically over the leg-bone
    // tracks (scripts/probe-anim-qa.mjs review loop): shootRun leads sprint by
    // half a cycle and run by ~0.7 — at those offsets the average leg error
    // across the blend drops from ~36° to ~22°.
    if (runFiring !== wasRunFiring.current && shootRun) {
      wasRunFiring.current = runFiring
      const srDur = shootRun.getClip().duration
      const src = a === 'sprint' ? loco.sprint : loco.run
      const phaseOff = a === 'sprint' ? 0.5 : 0.7
      if (runFiring && src && wShootRun.current < 0.2) {
        const p = (src.time / src.getClip().duration + phaseOff) % 1
        shootRun.time = p * srDur
      } else if (!runFiring) {
        // Release: re-phase BOTH outgoing-side loco cycles (their weights are
        // ~0 after a full-weight fire hold) onto the shootRun stride.
        const p = shootRun.time / srDur
        if (loco.sprint && wLoco.current.sprint < 0.2) {
          loco.sprint.time = ((p - 0.5 + 1) % 1) * loco.sprint.getClip().duration
        }
        if (loco.run && wLoco.current.run < 0.2) {
          loco.run.time = ((p - 0.7 + 1) % 1) * loco.run.getClip().duration
        }
      }
    }
    wShootRun.current = easeTo(wShootRun.current, runFiring ? loco1 : 0, dt, 12)
    if (shootRun) {
      shootRun.setEffectiveWeight(wShootRun.current)
      // 0.67s cycle authored around a ~5.5 m/s jog. Ceiling 1.9 → 2.2 with
      // the de-clank pass: at the (slowed) 13.2 m/s sprint the old cap left
      // the feet covering only ~10.4 m/s of ground (~30% skate at the old 15
      // — a big part of the "clanky" read). 2.2 puts foot travel at ~12.1 m/s
      // (<9% skate) without tipping the legs into a cartoon scramble.
      shootRun.timeScale = THREE.MathUtils.clamp(speed / 5.5, 0.8, 2.2)
    }
    loopW = Math.max(loopW, wShootRun.current)

    // --- Locomotion mix (scaled down under overrides + directional loops) ----
    const baseLoco = loco1 * (1 - loopW)
    // Sprint band rescaled with the global pace pass (was 9.5..13.5 for the
    // old 15 m/s sprint): the new 13.2 m/s sprint must sit fully above it.
    const sprintT = a === 'sprint' ? 1 : THREE.MathUtils.smoothstep(speed, 8.4, 11.9)
    const runT = THREE.MathUtils.smoothstep(speed, 3.2, 6.2) * (1 - sprintT)
    const walkT = THREE.MathUtils.smoothstep(speed, 0.35, 1.7) * (1 - runT - sprintT)
    const idleT = Math.max(0, 1 - walkT - runT - sprintT)
    const wl = wLoco.current
    wl.idle = easeTo(wl.idle, idleT * baseLoco, dt, 9)
    wl.walk = easeTo(wl.walk, walkT * baseLoco, dt, 9)
    wl.run = easeTo(wl.run, runT * baseLoco, dt, 9)
    wl.sprint = easeTo(wl.sprint, sprintT * baseLoco, dt, 9)
    loco.idle?.setEffectiveWeight(wl.idle)
    if (loco.walk) {
      loco.walk.setEffectiveWeight(wl.walk)
      loco.walk.timeScale = THREE.MathUtils.clamp(speed / WALK_REF, 0.7, 1.9)
    }
    if (loco.run) {
      loco.run.setEffectiveWeight(wl.run)
      loco.run.timeScale = THREE.MathUtils.clamp(speed / RUN_REF, 0.75, 1.8)
    }
    if (loco.sprint) {
      loco.sprint.setEffectiveWeight(wl.sprint)
      loco.sprint.timeScale = THREE.MathUtils.clamp(speed / SPRINT_REF, 0.8, 1.7)
    }

    // --- STANDING FIRE: the 'shoot' clip's upper body (aim arm + braced
    //     torso) overlays the idle/walk legs while the trigger is held. The
    //     mixer's slerp accumulation normalises by cumulative weight, so a
    //     weight ABOVE the ~1.0 base makes the aim own the upper bones
    //     decisively without zeroing the legs' secondary sway. Suppressed
    //     while a loop owns the body (crouch/strafes/backpedal ship their own
    //     gun poses; shootRun owns moving fire) and under one-shots.
    const standFiring =
      firing && !runFiring && loopState === null && override < 0.5 &&
      (a === 'idle' || a === 'walk' || a === 'turnL' || a === 'turnR' || a === 'shoot')
    // Ease-out at 8/s (in stays 14/s): the overlay carries a 2.2 super-weight,
    // so a fast fade-out crossed under the incoming shootRun weight in ~1-2
    // frames and the stand-fire → sprint-fire handoff read as a pose POP
    // (QA sheet-shoottrans frames 17-19). The slower release keeps the aim
    // arms blending down across the same ~200ms the run-fire cycle blends up.
    wShoot.current = easeTo(
      wShoot.current,
      standFiring ? AIM_OVERLAY_WEIGHT : 0,
      dt,
      standFiring ? 14 : 8,
    )
    shootUpper?.setEffectiveWeight(wShoot.current)

    mixer.update(dt)

    // --- Additive recoil kick (the ONLY procedural pose layer) --------------
    const kick = fireRef ? THREE.MathUtils.clamp(1 - (t - fireRef.current) / 0.14, 0, 1) : 0
    if (kick > 0.01 && override < 0.5) {
      const foreR = rig.scene.getObjectByName('RightForeArm') as THREE.Bone | undefined
      const spine2 = rig.scene.getObjectByName('Spine02') as THREE.Bone | undefined
      foreR?.rotateX(0.35 * kick)
      spine2?.rotateX(-0.06 * kick)
    }

    // --- Weapon swap + muzzle flash + slash arc ------------------------------
    const slashStart = slashRef ? slashRef.current : a === 'dash' ? t : -100
    const sp = THREE.MathUtils.clamp((t - slashStart) / SLASH_TIME, 0, 1)
    const slashing = (sp > 0 && sp < 1) || a === 'dash'
    if (gun.current) gun.current.visible = !slashing
    if (sword.current) sword.current.visible = slashing
    if (flash.current) {
      flash.current.visible = kick > 0.04
      flash.current.scale.setScalar(0.0001 + kick * 0.28)
    }
    if (slashArc.current && slashMat.current) {
      const arcOn = sp > 0 && sp < 1
      slashArc.current.visible = arcOn
      if (arcOn) {
        const s = 0.7 + sp * 1.8
        slashArc.current.scale.set(s, s, s)
        slashArc.current.rotation.z = -1.3 + sp * 2.6
        slashMat.current.opacity = (1 - sp) * 0.95
      }
    }
  })

  return (
    <group ref={root}>
      {/* Rig faces +z in-file — the game's forward. No yaw correction. */}
      <primitive object={rig.scene} scale={rig.scale} />

      {createPortal(
        <>
          {/* Gun-fit calibration (owner pass 2): the overnight 0.82 shrink
              overcorrected — the blaster read toy-sized in the fist — while a
              trial 0.95 read oversized in the QA closeups. 0.88 + the palm
              re-seat above makes it read substantial and properly gripped;
              the holder ROTATION calib is unchanged so fire still tracks the
              aim line. */}
          {/* Named so cinematics can find the CALIBRATED gun transform and
              spawn tracers from the true muzzle (heroGunSeat.ts is the one
              source of truth for the whole seat). */}
          <group ref={gun} name={HERO_GUN_NODE} scale={GUN_VISUAL_SCALE}>
            {/* The game's compact energy blaster (Pattern-Cannon visual). */}
            <mesh castShadow>
              <boxGeometry args={[0.1, 0.13, 0.32]} />
              <meshStandardMaterial color={colors.joint} metalness={0.55} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.02, 0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.032, 0.042, 0.34, 12]} />
              <meshStandardMaterial color="#23283a" metalness={0.75} roughness={0.3} />
            </mesh>
            {/* Energy cell. At emissive 0.6 it read as a flat unlit slab in
                the intro's 44mm grip closeup ("placeholder box" QA note);
                1.3 matches the Soldier kit and reads as a powered gun part. */}
            <mesh position={[0, -0.1, -0.03]}>
              <boxGeometry args={[0.07, 0.11, 0.12]} />
              <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.3} />
            </mesh>
            {/* Grip post THROUGH the calibrated palm position (hand bone sits
                at gun-local z≈-0.10, y≈-0.02 — tmp-grip-probe): the rig has no
                finger bones to curl, so without a handle inside the fist the
                closeup read as a hand holding air beside a floating receiver
                (intro QA blocker). The RobotAvatar's kit always had this. */}
            <mesh position={[0, -0.1, -0.1]} rotation={[0.3, 0, 0]} castShadow>
              <boxGeometry args={[0.06, 0.16, 0.08]} />
              <meshStandardMaterial color={colors.joint} roughness={0.6} />
            </mesh>
            <group ref={flash} position={[0, 0.02, 0.5]} visible={false}>
              <mesh>
                <sphereGeometry args={[0.17, 10, 10]} />
                <meshBasicMaterial color="#fff6c0" transparent opacity={0.8} fog={false} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.14, 0.42, 8]} />
                <meshBasicMaterial color="#ffce3f" transparent opacity={0.75} fog={false} />
              </mesh>
            </group>
          </group>
          <group ref={sword} visible={false}>
            <mesh position={[0, 0, -0.04]}>
              <boxGeometry args={[0.05, 0.05, 0.16]} />
              <meshStandardMaterial color={colors.joint} metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0, 0.06]}>
              <boxGeometry args={[0.24, 0.07, 0.05]} />
              <meshStandardMaterial color={colors.bodyDark} metalness={0.5} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0, 0.62]}>
              <boxGeometry args={[0.09, 0.03, 1.02]} />
              <meshStandardMaterial
                color="#d6f7ff"
                emissive={colors.visor}
                emissiveIntensity={2.4}
                roughness={0.2}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 0, 1.16]} rotation={[0, Math.PI / 4, 0]}>
              <boxGeometry args={[0.07, 0.03, 0.09]} />
              <meshStandardMaterial
                color="#eaffff"
                emissive={colors.visor}
                emissiveIntensity={2.6}
                toneMapped={false}
              />
            </mesh>
          </group>
        </>,
        rig.holder,
      )}

      <mesh ref={slashArc} position={[0, 1.15, 0.55]} visible={false}>
        <ringGeometry args={[0.85, 1.22, 28, 1, Math.PI * 0.16, Math.PI * 1.08]} />
        <meshBasicMaterial
          ref={slashMat}
          color="#bff2ff"
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>
    </group>
  )
}
