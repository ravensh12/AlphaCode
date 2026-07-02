import {
  Component,
  Suspense,
  memo,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import * as THREE from 'three'
import { applyRimLight, rimHandleOf } from './simulation'

export type AvatarAnim = 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'dance' | 'punch' | 'dash' | 'crouch'

/** Must match DASH_TIME in ThirdPersonController so the swing fills the lunge. */
const SLASH_TIME = 0.32

type AvatarProps = {
  anim?: AvatarAnim
  accent?: string
  fireRef?: MutableRefObject<number>
  /**
   * When provided, the current animation is read from this ref every frame
   * instead of the `anim` prop. This lets the controllers drive the rig
   * imperatively (no React state / re-render from inside the render loop).
   */
  animRef?: MutableRefObject<AvatarAnim>
  /** Clock time the most recent blade-dash slash started (drives the sword swing). */
  slashRef?: MutableRefObject<number>
}

/* ============================================================================
   M4 — THE HUMAN HERO.

   The hero is now a real mocap-animated human: the three.js example Soldier
   (MIT — mrdoob/three.js, examples/models/gltf/Soldier.glb, bundled under
   public/models so nothing is ever fetched from a CDN). Idle/Walk/Run are
   motion-captured clips, crossfaded by MEASURED ground speed and time-scaled
   to the actual velocity so the feet plant instead of skating. Everything the
   game needs beyond locomotion is layered proceduraly in bone space on top
   of the playing clips, every frame, zero allocations:

     - two-handed weapon aim (arms override, eased so clip sway bleeds through)
     - recoil: muzzle climb + a torso kick driven by fireRef
     - crouch: thighs/knees fold, hips drop to keep feet planted, chest hunch
     - jump: legs tuck with a touch of asymmetry, off-hand flares for balance
     - dash: full-body lunge lean + the big overhead-to-across sword arc
     - wave/dance/punch for cinematics

   The old hand-built robot stays below as <RobotAvatar> — it is the INSTANT
   fallback while the GLB parses and the permanent one if it ever fails, so a
   hero always renders. Same public API; ThirdPersonController is untouched.
   ========================================================================== */

const SOLDIER_URL = '/models/Soldier.glb'
useGLTF.preload(SOLDIER_URL)

// Reference speeds (m/s) at which each mocap cycle plays at 1×.
const WALK_REF = 1.55
const RUN_REF = 5.0

/** GLTFLoader sanitizes "mixamorig:Hips" → "mixamorigHips"; accept both. */
function findBone(root: THREE.Object3D, name: string): THREE.Bone {
  const b =
    (root.getObjectByName(`mixamorig${name}`) as THREE.Bone | undefined) ??
    (root.getObjectByName(`mixamorig:${name}`) as THREE.Bone | undefined)
  if (!b) throw new Error(`Soldier rig: missing bone ${name}`)
  return b
}

/** rest-pose quaternion × a local euler delta — precomputed pose targets. */
function poseFrom(rest: THREE.Quaternion, x: number, y: number, z: number): THREE.Quaternion {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))
  return rest.clone().multiply(q)
}

/** Frame-rate-independent ease toward a target (hoisted — no per-frame closures). */
function easeTo(v: number, target: number, dt: number, rate: number): number {
  return v + (target - v) * Math.min(1, dt * rate)
}

function HumanAvatar({ anim = 'idle', accent = '#6d4afe', fireRef, animRef, slashRef }: AvatarProps) {
  const gltf = useGLTF(SOLDIER_URL)
  const root = useRef<THREE.Group>(null)

  // Instance-local skeleton + instance-local materials (rim color = district
  // accent, so the outfit carries the district identity like the robot did).
  const rig = useMemo(() => {
    const scene = cloneSkeleton(gltf.scene)
    const bones = {
      hips: findBone(scene, 'Hips'),
      spine: findBone(scene, 'Spine'),
      spine2: findBone(scene, 'Spine2'),
      neck: findBone(scene, 'Neck'),
      head: findBone(scene, 'Head'),
      armL: findBone(scene, 'LeftArm'),
      foreL: findBone(scene, 'LeftForeArm'),
      handL: findBone(scene, 'LeftHand'),
      armR: findBone(scene, 'RightArm'),
      foreR: findBone(scene, 'RightForeArm'),
      handR: findBone(scene, 'RightHand'),
      upLegL: findBone(scene, 'LeftUpLeg'),
      legL: findBone(scene, 'LeftLeg'),
      footL: findBone(scene, 'LeftFoot'),
      upLegR: findBone(scene, 'RightUpLeg'),
      legR: findBone(scene, 'RightLeg'),
      footR: findBone(scene, 'RightFoot'),
    }
    // T-pose local rotations — the anchor all pose targets compose against.
    const rest = Object.fromEntries(
      Object.entries(bones).map(([k, b]) => [k, b.quaternion.clone()]),
    ) as Record<keyof typeof bones, THREE.Quaternion>

    // Validated bone-space pose targets (see scripts/pose-check.mjs).
    const pose = {
      aimArmR: poseFrom(rest.armR, 1.25, -0.35, 0),
      aimForeR: poseFrom(rest.foreR, 0.45, 0, 0),
      aimArmL: poseFrom(rest.armL, -1.25, 0.35, 0),
      aimForeL: poseFrom(rest.foreL, -0.55, 0, 0),
      crouchUpLegL: poseFrom(rest.upLegL, -0.82, 0, -0.14),
      crouchLegL: poseFrom(rest.legL, 1.05, 0, 0),
      crouchFootL: poseFrom(rest.footL, -0.3, 0, 0),
      crouchUpLegR: poseFrom(rest.upLegR, -0.9, 0, 0.14),
      crouchLegR: poseFrom(rest.legR, 1.15, 0, 0),
      crouchFootR: poseFrom(rest.footR, -0.35, 0, 0),
      jumpUpLegL: poseFrom(rest.upLegL, -0.4, 0, 0),
      jumpLegL: poseFrom(rest.legL, 0.7, 0, 0),
      jumpUpLegR: poseFrom(rest.upLegR, -0.55, 0, 0),
      jumpLegR: poseFrom(rest.legR, 0.85, 0, 0),
      waveArmL: poseFrom(rest.armL, 0, 0, -1.9),
      punchArmR: poseFrom(rest.armR, 1.35, -0.15, 0),
      punchForeR: poseFrom(rest.foreR, 0.1, 0, 0),
      slashWindR: poseFrom(rest.armR, 0.2, 0, 1.7),
      slashFollowR: poseFrom(rest.armR, 1.35, 0, -0.45),
      slashForeR: poseFrom(rest.foreR, 0.3, 0, 0),
      slashArmL: poseFrom(rest.armL, -0.7, 0.3, 0),
    }

    // Weapon anchors ride the right hand. The armature lives in centimeters
    // under a 0.01-scale root, so the holder scales back up to meters; its
    // position is therefore in hand-local centimeters.
    const holder = new THREE.Group()
    holder.scale.setScalar(100)
    holder.position.set(0, 8, 1.4)
    holder.rotation.set(-Math.PI / 2, 0, 0)
    bones.handR.add(holder)

    // Instance-local materials: the body gets the accent rim (district
    // identity + silhouette pop), the visor glows accent. Colors start
    // neutral; a live effect below retunes them when the district changes,
    // so a new accent never rebuilds the rig / restarts the mixer.
    let bodyMat: THREE.MeshStandardMaterial | null = null
    let visorMat: THREE.MeshStandardMaterial | null = null
    scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh
      if (!mesh.isSkinnedMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      const src = mesh.material as THREE.MeshStandardMaterial
      const inst = src.clone()
      if (/visor/i.test(src.name)) {
        inst.emissive = new THREE.Color('#7fd8ff')
        inst.emissiveIntensity = 0.55
        visorMat = inst
      } else {
        applyRimLight(inst, '#7fd8ff', 0.5)
        bodyMat = inst
      }
      mesh.material = inst
    })

    const mixer = new THREE.AnimationMixer(scene)
    const clip = (n: string): THREE.AnimationClip => {
      const c = THREE.AnimationClip.findByName(gltf.animations, n)
      if (!c) throw new Error(`Soldier rig: missing clip ${n}`) // → robot fallback
      return c
    }
    const actions = {
      idle: mixer.clipAction(clip('Idle')),
      walk: mixer.clipAction(clip('Walk')),
      run: mixer.clipAction(clip('Run')),
    }

    return { scene, bones, pose, holder, mixer, actions, bodyMat, visorMat }
  }, [gltf])

  useEffect(() => {
    const { mixer, scene, actions } = rig
    // (Re)activate the locomotion clips HERE, not in the useMemo that builds the
    // rig. React StrictMode dev-mounts run mount → cleanup → mount, and the
    // cleanup below calls mixer.stopAllAction(); since the useMemo does NOT
    // re-run on the second mount (its deps are unchanged), activating the actions
    // in it would leave the reused rig with every action stopped — the mixer
    // clock keeps ticking but drives no bones and the hero freezes mid-pose.
    // Doing it in the effect makes setup symmetric with the teardown so the
    // clips always resume after a remount.
    for (const a of Object.values(actions)) {
      a.reset()
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
    }
    actions.idle.setEffectiveWeight(1)
    return () => {
      // three.js frees NOTHING on React unmount. The Avatar mounts in the
      // overworld, every boss arena AND the intro, so a missed dispose here
      // leaks a full skinned rig (cloned materials + each clone's lazily-built
      // skeleton boneTexture) on every navigation. Free them explicitly.
      //
      // NOTE: only STOP the actions here — do NOT mixer.uncacheRoot(scene). This
      // effect's cleanup also runs on React StrictMode's dev mount→cleanup→mount
      // cycle, and uncacheRoot permanently forgets the actions' bindings, so the
      // re-play() above then corrupts the mixer's caches ("_cacheIndex of
      // undefined") and the hero freezes. The mixer is owned by this rig, so on a
      // real unmount it is garbage-collected with the component anyway — no
      // uncache needed to reclaim it.
      mixer.stopAllAction()
      scene.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh
        if (!mesh.isSkinnedMesh) return
        // Cloned skeleton owns its own boneTexture (a GPU DataTexture).
        mesh.skeleton?.dispose()
        // Instance-local cloned materials (bodyMat / visorMat). The GEOMETRY is
        // shared with the cached GLTF (SkeletonUtils.clone reuses it), so it is
        // deliberately NOT disposed — future clones still need it.
        const m = mesh.material
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
        else m?.dispose()
      })
    }
  }, [rig])

  // Keep the accent live without rebuilding the rig (rim handle mutates).
  useEffect(() => {
    if (rig.bodyMat) rimHandleOf(rig.bodyMat)?.color.set(accent)
    if (rig.visorMat) (rig.visorMat as THREE.MeshStandardMaterial).emissive.set(accent)
  }, [rig, accent])

  // Weapon visuals (same family as the old robot's kit).
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

  // Per-frame scratch — hoisted, never allocated in the loop.
  const scratch = useMemo(
    () => ({
      prev: new THREE.Vector3(),
      cur: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      started: false,
    }),
    [],
  )
  const spd = useRef(0)
  const aimW = useRef(1)
  const crouchAmt = useRef(0)
  const airW = useRef(0)
  const waveW = useRef(0)
  const wIdle = useRef(1)
  const wWalk = useRef(0)
  const wRun = useRef(0)

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    if (dt <= 0) return
    const t = state.clock.elapsedTime
    const r = root.current
    if (!r) return
    const { bones, pose, actions, mixer } = rig

    // --- Measured ground speed (drives blend + time-scale; no API changes) --
    r.getWorldPosition(scratch.cur)
    if (!scratch.started) {
      scratch.started = true
      scratch.prev.copy(scratch.cur)
    }
    const dx = scratch.cur.x - scratch.prev.x
    const dz = scratch.cur.z - scratch.prev.z
    scratch.prev.copy(scratch.cur)
    const rawSpeed = Math.min(18, Math.hypot(dx, dz) / dt)
    spd.current = easeTo(spd.current, rawSpeed, dt, 10)
    const speed = spd.current

    const a = animRef ? animRef.current : anim
    const crouching = a === 'crouch'
    const jumping = a === 'jump'
    const dashing = a === 'dash'
    const waving = a === 'wave'
    const dancing = a === 'dance'
    const punching = a === 'punch'

    const slashStart = slashRef ? slashRef.current : dashing ? t : -100
    const sp = THREE.MathUtils.clamp((t - slashStart) / SLASH_TIME, 0, 1)
    const slashing = (sp > 0 && sp < 1) || dashing

    // --- Locomotion mix: mocap idle/walk/run weights from measured speed ----
    const runT = THREE.MathUtils.smoothstep(speed, 3.2, 6.2)
    const walkT = THREE.MathUtils.smoothstep(speed, 0.35, 1.7) * (1 - runT)
    const idleT = Math.max(0, 1 - walkT - runT)
    wIdle.current = easeTo(wIdle.current, idleT, dt, 9)
    wWalk.current = easeTo(wWalk.current, walkT, dt, 9)
    wRun.current = easeTo(wRun.current, runT, dt, 9)
    actions.idle.setEffectiveWeight(wIdle.current)
    actions.walk.setEffectiveWeight(wWalk.current)
    actions.run.setEffectiveWeight(wRun.current)
    // Feet don't skate: cycle rate follows true velocity (clamped so extreme
    // sprint reads as a powerful stride, not a cartoon blur).
    actions.walk.timeScale = THREE.MathUtils.clamp(speed / WALK_REF, 0.7, 1.9)
    actions.run.timeScale = THREE.MathUtils.clamp(speed / RUN_REF, 0.75, 1.8)
    actions.idle.timeScale = 1

    mixer.update(dt)

    // --- Procedural bone-space layers (applied over the playing clips) ------
    const kick = fireRef ? THREE.MathUtils.clamp(1 - (t - fireRef.current) / 0.14, 0, 1) : 0

    // Weapon-ready arms: eased override so a hint of mocap sway bleeds through.
    aimW.current = easeTo(aimW.current, slashing || waving || dancing ? 0 : 0.9, dt, 8)
    const aw = aimW.current
    if (aw > 0.01) {
      bones.armR.quaternion.slerp(pose.aimArmR, aw)
      bones.foreR.quaternion.slerp(pose.aimForeR, aw)
      bones.armL.quaternion.slerp(pose.aimArmL, aw)
      bones.foreL.quaternion.slerp(pose.aimForeL, aw)
    }

    // Recoil: muzzle climb + torso kick, sharp in, fast decay.
    if (kick > 0.01) {
      bones.foreR.rotateX(0.5 * kick)
      bones.armR.rotateX(-0.12 * kick)
      bones.spine2.rotateX(-0.09 * kick)
    }

    // Crouch: fold the legs, drop the hips exactly enough to keep the feet
    // planted, hunch the chest, keep the eyes forward.
    crouchAmt.current = easeTo(crouchAmt.current, crouching ? 1 : 0, dt, 10)
    const cr = crouchAmt.current
    if (cr > 0.01) {
      bones.upLegL.quaternion.slerp(pose.crouchUpLegL, cr)
      bones.legL.quaternion.slerp(pose.crouchLegL, cr)
      bones.footL.quaternion.slerp(pose.crouchFootL, cr)
      bones.upLegR.quaternion.slerp(pose.crouchUpLegR, cr)
      bones.legR.quaternion.slerp(pose.crouchLegR, cr)
      bones.footR.quaternion.slerp(pose.crouchFootR, cr)
      bones.hips.position.z -= 33 * cr // cm: hips sink onto the folded legs
      bones.spine2.rotateX(0.3 * cr)
      bones.head.rotateX(-0.26 * cr)
    }

    // Airborne: tuck with a touch of asymmetry; off-hand flares for balance.
    airW.current = easeTo(airW.current, jumping ? 1 : 0, dt, 10)
    const air = airW.current
    if (air > 0.01) {
      bones.upLegL.quaternion.slerp(pose.jumpUpLegL, air)
      bones.legL.quaternion.slerp(pose.jumpLegL, air)
      bones.upLegR.quaternion.slerp(pose.jumpUpLegR, air)
      bones.legR.quaternion.slerp(pose.jumpLegR, air)
      bones.armL.rotateZ(-0.4 * air)
      bones.spine2.rotateX(0.12 * air)
    }

    // Blade dash: torso twists through a big overhead-to-across arc.
    if (slashing) {
      const swing = Math.sin(sp * Math.PI)
      scratch.q.slerpQuaternions(pose.slashWindR, pose.slashFollowR, sp)
      bones.armR.quaternion.copy(scratch.q)
      bones.foreR.quaternion.copy(pose.slashForeR)
      bones.armL.quaternion.slerp(pose.slashArmL, swing)
      bones.spine.rotateY(THREE.MathUtils.lerp(0.55, -0.75, sp))
      bones.spine.rotateX(0.28 * swing)
    } else if (dashing) {
      bones.spine.rotateX(0.3)
    }

    // Cinematic extras.
    waveW.current = easeTo(waveW.current, waving ? 1 : 0, dt, 8)
    if (waveW.current > 0.01) {
      bones.armL.quaternion.slerp(pose.waveArmL, waveW.current)
      bones.foreL.rotateZ(Math.sin(t * 7) * 0.35 * waveW.current)
    }
    if (dancing) {
      bones.spine.rotateY(Math.sin(t * 4.2) * 0.3)
      bones.hips.position.z += Math.abs(Math.sin(t * 8)) * 4
      bones.armL.rotateZ(-0.5 - Math.sin(t * 4.2) * 0.4)
      bones.armR.rotateZ(0.5 - Math.sin(t * 4.2 + Math.PI) * 0.4)
    }
    if (punching) {
      const jab = Math.abs(Math.sin(t * 6))
      bones.armR.quaternion.slerp(pose.punchArmR, jab)
      bones.foreR.quaternion.slerp(pose.punchForeR, jab)
    }

    // Idle life: breathing chest + a slow head sway (fades out with speed).
    const still = wIdle.current
    if (still > 0.05) {
      const breathe = 1 + Math.sin(t * 1.9) * 0.012 * still
      bones.spine2.scale.setScalar(breathe)
      bones.head.rotateZ(Math.sin(t * 1.25) * 0.035 * still)
      bones.head.rotateY(Math.sin(t * 0.6) * 0.06 * still)
    } else {
      bones.spine2.scale.setScalar(1)
    }

    // Weapon swap + muzzle flash (same tells as the old robot).
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
      {/* Soldier faces -Z in the file; the game's forward is +Z. */}
      <primitive object={rig.scene} rotation-y={Math.PI} />

      {/* Weapons live on the right-hand bone (portal into the holder). */}
      {createPortal(
        <>
          <group ref={gun}>
            {/* receiver */}
            <mesh castShadow>
              <boxGeometry args={[0.1, 0.13, 0.32]} />
              <meshStandardMaterial color={colors.joint} metalness={0.55} roughness={0.4} />
            </mesh>
            {/* barrel */}
            <mesh position={[0, 0.02, 0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.032, 0.042, 0.34, 12]} />
              <meshStandardMaterial color="#23283a" metalness={0.75} roughness={0.3} />
            </mesh>
            {/* glowing energy cell */}
            <mesh position={[0, -0.1, -0.03]}>
              <boxGeometry args={[0.07, 0.11, 0.12]} />
              <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.1} />
            </mesh>
            {/* sight rail */}
            <mesh position={[0, 0.1, 0.02]}>
              <boxGeometry args={[0.03, 0.045, 0.15]} />
              <meshStandardMaterial color={colors.bodyDark} roughness={0.5} />
            </mesh>
            {/* muzzle flash (toggled on fire) */}
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
          {/* Energy blade, drawn only during a dash. Blade runs along the
              holder's +Z (the fingers' reach), carving with the swing. */}
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
              <meshStandardMaterial color="#d6f7ff" emissive={colors.visor} emissiveIntensity={2.4} roughness={0.2} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, 1.16]} rotation={[0, Math.PI / 4, 0]}>
              <boxGeometry args={[0.07, 0.03, 0.09]} />
              <meshStandardMaterial color="#eaffff" emissive={colors.visor} emissiveIntensity={2.6} toneMapped={false} />
            </mesh>
          </group>
        </>,
        rig.holder,
      )}

      {/* Slash arc — a glowing crescent sweeping in front during a dash. */}
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

/* ------------------------------------------------------------ Fallback glue */

/** Render the human; if the GLB ever fails, fall back to the robot for good. */
class HeroBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export const Avatar = memo(function Avatar(props: AvatarProps) {
  const fallback = <RobotAvatar {...props} />
  // M5 — muzzle light: gunfire actually kicks light into the world for a few
  // frames (walls/zombies flash with each shot). Lives OUTSIDE the toggled
  // flash/gun groups and idles at intensity 0, so the renderer's light count
  // never changes (no shader recompiles) and it never casts shadows.
  const flashLight = useRef<THREE.PointLight>(null)
  const { fireRef } = props
  useFrame((state) => {
    const l = flashLight.current
    if (!l) return
    const kick = fireRef
      ? THREE.MathUtils.clamp(1 - (state.clock.elapsedTime - fireRef.current) / 0.14, 0, 1)
      : 0
    l.intensity = kick > 0.02 ? kick * (5.2 + Math.random() * 2.4) : 0
  })
  return (
    <>
      <HeroBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <HumanAvatar {...props} />
        </Suspense>
      </HeroBoundary>
      <pointLight
        ref={flashLight}
        position={[0.2, 1.25, 0.9]}
        intensity={0}
        distance={9}
        decay={2}
        color="#ffd27a"
      />
    </>
  )
})

/* ============================================================================
   The original hand-built low-poly "explorer bot" (~1.8m, feet at y=0).
   Kept as the always-renders fallback: primitives can't fail to load, and
   every joint is hand-animated with the same Disney principles.
   ========================================================================== */

export const RobotAvatar = memo(function RobotAvatar({
  anim = 'idle',
  accent = '#6d4afe',
  fireRef,
  animRef,
  slashRef,
}: AvatarProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const antenna = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const gun = useRef<THREE.Group>(null)
  const flash = useRef<THREE.Group>(null)
  const sword = useRef<THREE.Group>(null)
  const slashArc = useRef<THREE.Mesh>(null)
  const slashMat = useRef<THREE.MeshBasicMaterial>(null)

  const phase = useRef(0)
  const amp = useRef(0) // eased stride amplitude (0 idle .. 1 run)
  const crouchAmt = useRef(0) // eased lay-low crouch (0 standing .. 1 hunkered)
  const antennaVel = useRef(0)
  const antennaAng = useRef(0)

  const colors = useMemo(() => {
    const a = new THREE.Color(accent)
    return {
      body: accent,
      bodyDark: '#' + a.clone().multiplyScalar(0.65).getHexString(),
      limb: '#d7dded',
      joint: '#2b3040',
      visor: '#8fe9ff',
      tip: accent,
    }
  }, [accent])

  // Living Simulation rim light (M7): the hero's big read surfaces share two
  // fresnel-rimmed materials so the silhouette pops against the dense city.
  const rimMats = useMemo(
    () => ({
      body: applyRimLight(
        new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.15 }),
        '#8fe9ff',
        0.45,
      ),
      limb: applyRimLight(
        new THREE.MeshStandardMaterial({ color: '#d7dded', roughness: 0.5, metalness: 0.2 }),
        '#8fe9ff',
        0.45,
      ),
    }),
    [accent],
  )
  useEffect(
    () => () => {
      rimMats.body.dispose()
      rimMats.limb.dispose()
    },
    [rimMats],
  )

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const t = state.clock.elapsedTime

    const a = animRef ? animRef.current : anim
    const crouching = a === 'crouch'
    const running = (a === 'run' || a === 'walk') && !crouching
    const jumping = a === 'jump'
    const dashing = a === 'dash'

    // Ease the lay-low crouch in/out so it settles smoothly to the ground.
    crouchAmt.current += ((crouching ? 1 : 0) - crouchAmt.current) * Math.min(1, dt * 10)

    // Blade-dash slash progress: 0 (wind-up) → 1 (follow-through).
    const slashStart = slashRef ? slashRef.current : -100
    const sp = THREE.MathUtils.clamp((t - slashStart) / SLASH_TIME, 0, 1)
    const slashing = sp > 0 && sp < 1

    // Ease stride amplitude in/out (slow in / slow out). Crouching kills the
    // stride so the legs fold under instead of swinging.
    const targetAmp = jumping || crouching ? 0 : running ? 1 : 0
    amp.current += (targetAmp - amp.current) * Math.min(1, dt * 8)

    const cadence = running ? 11 : 2.2
    phase.current += dt * cadence

    const swing = Math.sin(phase.current)
    const legAmp = 0.7 * amp.current

    if (legL.current && legR.current) {
      if (jumping) {
        legL.current.rotation.x = -0.7
        legR.current.rotation.x = -0.4
      } else {
        legL.current.rotation.x = swing * legAmp
        legR.current.rotation.x = -swing * legAmp
      }
    }

    // Sharp, quick recoil kick from the most recent shot.
    const kick = fireRef ? THREE.MathUtils.clamp(1 - (t - fireRef.current) / 0.14, 0, 1) : 0

    if (armL.current && armR.current) {
      if (jumping) {
        armL.current.rotation.x = -2.0
        armR.current.rotation.x = -2.0
        armL.current.rotation.z = 0.3
        armR.current.rotation.z = -0.3
      } else {
        // Gun-ready stance: both hands reach forward to hold the blaster, with a
        // gentle bob; the trigger arm kicks up briefly on recoil.
        const bob = Math.sin(phase.current) * 0.06 * amp.current
        armR.current.rotation.x = -1.42 - kick * 0.5 + bob
        armL.current.rotation.x = -1.26 + bob
        armR.current.rotation.z = -0.18
        armL.current.rotation.z = 0.5
      }
    }
    if (body.current) body.current.rotation.x = -0.06 * kick

    // Gun recoil + muzzle flash.
    if (gun.current) gun.current.position.z = 0.34 - kick * 0.12
    if (flash.current) {
      flash.current.visible = kick > 0.04
      flash.current.scale.setScalar(0.0001 + kick * 0.28)
    }

    // --- Blade dash: hide the gun, draw the sword, swing a big diagonal arc ---
    if (gun.current) gun.current.visible = !dashing
    if (sword.current) sword.current.visible = dashing
    if (slashing && armR.current && armL.current && body.current) {
      const swing = Math.sin(sp * Math.PI) // 0 → 1 → 0 over the slash
      // Right (sword) arm: raise overhead, then whip across the body.
      armR.current.rotation.x = -2.4 + sp * 3.0
      armR.current.rotation.z = -1.5 + sp * 3.0
      // Left arm flares out for balance.
      armL.current.rotation.x = -0.9 - swing * 0.6
      armL.current.rotation.z = 0.7
      // Torso twists through the swing; whole body leans into the lunge.
      body.current.rotation.y = THREE.MathUtils.lerp(0.7, -0.8, sp)
      body.current.rotation.x = -0.16 - swing * 0.18
    } else if (body.current) {
      // Settle the twist back to neutral once the slash is done.
      body.current.rotation.y *= 0.72
    }
    if (slashArc.current && slashMat.current) {
      slashArc.current.visible = slashing
      if (slashing) {
        const s = 0.7 + sp * 1.8
        slashArc.current.scale.set(s, s, s)
        slashArc.current.rotation.z = -1.3 + sp * 2.6 // sweep the crescent across
        slashMat.current.opacity = (1 - sp) * 0.95
      }
    }

    // Body bounce + breathing squash & stretch.
    if (body.current) {
      const bounce = running ? Math.abs(Math.sin(phase.current)) * 0.08 * amp.current : 0
      const breathe = (1 - amp.current) * Math.sin(t * 2) * 0.02
      body.current.position.y = bounce
      body.current.scale.y = 1 + breathe + bounce * 0.4
      body.current.scale.x = 1 - breathe * 0.5
    }
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 1.3) * 0.04 * (1 - amp.current)
    }

    // --- Lay-low crouch: a real knee-bend squat with planted feet --------
    // No knee joint on this rig, so we fake a believable bend: COMPRESS the legs
    // (squash) and drop the hips by exactly the amount the legs shortened, so the
    // feet stay glued to the ground instead of sinking or floating.
    const cr = crouchAmt.current
    if (cr > 0.001) {
      const legScale = 1 - cr * 0.4 // legs fold to ~60% height at full crouch
      const drop = 0.78 * (1 - legScale) // hip-to-foot reach * compression
      const breath = Math.sin(t * 2.6) * 0.01 * cr // subtle "held breath" sway

      if (legL.current && legR.current) {
        legL.current.scale.y = legScale
        legR.current.scale.y = legScale
        // Thighs angle slightly forward + knees splay out, like a braced squat.
        legL.current.rotation.x += cr * 0.18
        legR.current.rotation.x += cr * 0.18
        legL.current.rotation.z = -cr * 0.26
        legR.current.rotation.z = cr * 0.26
      }
      if (body.current) {
        body.current.position.y -= drop - breath
        body.current.rotation.x -= cr * 0.28 // chest hunches forward over the knees
      }
      if (armL.current && armR.current && !dashing && !slashing) {
        // Forearms drop and tuck in — a compact, low silhouette.
        armL.current.rotation.x += cr * 0.45
        armR.current.rotation.x += cr * 0.35
        armL.current.rotation.z += cr * 0.18
        armR.current.rotation.z -= cr * 0.18
      }
      if (head.current) head.current.rotation.x = cr * 0.28 // counter the hunch — keep eyes forward
    } else {
      if (legL.current) {
        legL.current.scale.y = 1
        legL.current.rotation.z = 0
      }
      if (legR.current) {
        legR.current.scale.y = 1
        legR.current.rotation.z = 0
      }
      if (head.current) head.current.rotation.x = 0
    }

    // Antenna follow-through: a damped spring chasing the body's motion.
    if (antenna.current && body.current) {
      const drive = -body.current.position.y * 6 - (running ? Math.cos(phase.current) * 0.6 * amp.current : 0)
      antennaVel.current += (drive - antennaAng.current) * dt * 60
      antennaVel.current *= 0.86
      antennaAng.current += antennaVel.current * dt
      antenna.current.rotation.z = THREE.MathUtils.clamp(antennaAng.current, -0.7, 0.7)
    }

    if (root.current) root.current.rotation.y = 0
  })

  return (
    <group ref={root}>
      <group ref={body} position={[0, 0, 0]}>
        {/* torso */}
        <mesh position={[0, 1.12, 0]} castShadow receiveShadow material={rimMats.body}>
          <boxGeometry args={[0.52, 0.62, 0.36]} />
        </mesh>
        {/* chest panel */}
        <mesh position={[0, 1.14, 0.19]} castShadow>
          <boxGeometry args={[0.3, 0.34, 0.04]} />
          <meshStandardMaterial color={colors.bodyDark} emissive={colors.visor} emissiveIntensity={0.25} roughness={0.4} />
        </mesh>
        {/* hips */}
        <mesh position={[0, 0.84, 0]} castShadow>
          <boxGeometry args={[0.46, 0.18, 0.32]} />
          <meshStandardMaterial color={colors.joint} roughness={0.6} />
        </mesh>
        {/* backpack / jetpack */}
        <mesh position={[0, 1.12, -0.22]} castShadow>
          <boxGeometry args={[0.34, 0.4, 0.14]} />
          <meshStandardMaterial color={colors.joint} roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[-0.1, 0.9, -0.3]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[0.1, 0.9, -0.3]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.6} />
        </mesh>

        {/* head */}
        <group ref={head} position={[0, 1.5, 0]}>
          <mesh position={[0, 0.13, 0]} castShadow material={rimMats.limb}>
            <boxGeometry args={[0.36, 0.34, 0.34]} />
          </mesh>
          {/* visor */}
          <mesh position={[0, 0.15, 0.18]}>
            <boxGeometry args={[0.28, 0.14, 0.04]} />
            <meshStandardMaterial color={colors.visor} emissive={colors.visor} emissiveIntensity={0.9} roughness={0.2} />
          </mesh>
          {/* ears */}
          <mesh position={[-0.2, 0.13, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.06, 10]} />
            <meshStandardMaterial color={colors.joint} />
          </mesh>
          <mesh position={[0.2, 0.13, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.06, 10]} />
            <meshStandardMaterial color={colors.joint} />
          </mesh>
          {/* antenna with follow-through */}
          <group ref={antenna} position={[0, 0.3, 0]}>
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.012, 0.018, 0.2, 6]} />
              <meshStandardMaterial color={colors.joint} />
            </mesh>
            <mesh position={[0, 0.22, 0]}>
              <sphereGeometry args={[0.045, 12, 12]} />
              <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.8} />
            </mesh>
          </group>
        </group>

        {/* arms (pivot at shoulder) — posed forward to hold the blaster */}
        <group ref={armL} position={[-0.34, 1.34, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow material={rimMats.limb}>
            <capsuleGeometry args={[0.09, 0.4, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.56, 0]} castShadow material={rimMats.body}>
            <sphereGeometry args={[0.11, 12, 12]} />
          </mesh>
        </group>
        <group ref={armR} position={[0.34, 1.34, 0]}>
          <mesh position={[0, -0.28, 0]} castShadow material={rimMats.limb}>
            <capsuleGeometry args={[0.09, 0.4, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.56, 0]} castShadow material={rimMats.body}>
            <sphereGeometry args={[0.11, 12, 12]} />
          </mesh>
          {/* Glowing energy blade, drawn only during a dash. Extends from the
              hand so it carves a wide arc through the swing. */}
          <group ref={sword} position={[0, -0.62, 0]} visible={false}>
            {/* grip */}
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[0.05, 0.16, 0.05]} />
              <meshStandardMaterial color={colors.joint} metalness={0.6} roughness={0.3} />
            </mesh>
            {/* cross-guard */}
            <mesh position={[0, -0.04, 0]}>
              <boxGeometry args={[0.24, 0.05, 0.07]} />
              <meshStandardMaterial color={colors.bodyDark} metalness={0.5} roughness={0.35} />
            </mesh>
            {/* blade */}
            <mesh position={[0, -0.58, 0]}>
              <boxGeometry args={[0.09, 1.02, 0.03]} />
              <meshStandardMaterial color="#d6f7ff" emissive={colors.visor} emissiveIntensity={2.4} roughness={0.2} toneMapped={false} />
            </mesh>
            {/* tip */}
            <mesh position={[0, -1.12, 0]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.07, 0.09, 0.03]} />
              <meshStandardMaterial color="#eaffff" emissive={colors.visor} emissiveIntensity={2.6} toneMapped={false} />
            </mesh>
          </group>
        </group>

        {/* blaster held in front of the chest, pointing forward (+Z) */}
        <group ref={gun} position={[0.2, 1.16, 0.34]}>
          {/* receiver */}
          <mesh castShadow>
            <boxGeometry args={[0.12, 0.15, 0.34]} />
            <meshStandardMaterial color={colors.joint} metalness={0.55} roughness={0.4} />
          </mesh>
          {/* barrel */}
          <mesh position={[0, 0.02, 0.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.36, 12]} />
            <meshStandardMaterial color="#23283a" metalness={0.75} roughness={0.3} />
          </mesh>
          {/* glowing energy cell */}
          <mesh position={[0, -0.13, -0.03]}>
            <boxGeometry args={[0.08, 0.13, 0.13]} />
            <meshStandardMaterial color={colors.tip} emissive={colors.tip} emissiveIntensity={1.1} />
          </mesh>
          {/* grip */}
          <mesh position={[0, -0.17, -0.1]} rotation={[0.32, 0, 0]} castShadow>
            <boxGeometry args={[0.07, 0.2, 0.09]} />
            <meshStandardMaterial color={colors.joint} roughness={0.6} />
          </mesh>
          {/* sight rail */}
          <mesh position={[0, 0.11, 0.02]}>
            <boxGeometry args={[0.03, 0.05, 0.16]} />
            <meshStandardMaterial color={colors.bodyDark} roughness={0.5} />
          </mesh>
          {/* muzzle flash (toggled on fire) */}
          <group ref={flash} position={[0, 0.02, 0.52]} visible={false}>
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

        {/* legs (pivot at hip) */}
        <group ref={legL} position={[-0.15, 0.82, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow material={rimMats.limb}>
            <capsuleGeometry args={[0.12, 0.5, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.78, 0.06]} castShadow>
            <boxGeometry args={[0.18, 0.12, 0.3]} />
            <meshStandardMaterial color={colors.joint} roughness={0.6} />
          </mesh>
        </group>
        <group ref={legR} position={[0.15, 0.82, 0]}>
          <mesh position={[0, -0.4, 0]} castShadow material={rimMats.limb}>
            <capsuleGeometry args={[0.12, 0.5, 4, 10]} />
          </mesh>
          <mesh position={[0, -0.78, 0.06]} castShadow>
            <boxGeometry args={[0.18, 0.12, 0.3]} />
            <meshStandardMaterial color={colors.joint} roughness={0.6} />
          </mesh>
        </group>

        {/* Slash arc — a glowing crescent that flashes out in front during a
            dash and sweeps across as the blade carves through the horde. */}
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
    </group>
  )
})
