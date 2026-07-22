# bake_character_anims.py — THE CENTERPIECE. Rest-delta retarget of Mixamo FBX
# motion clips onto an AlphaCode character rig, producing one GLB with the mesh,
# skeleton, and a set of separately-NAMED animation clips (via muted NLA tracks).
#
# ---------------------------------------------------------------------------
# REST-DELTA RETARGET (the correct fix; replaces the old world-delta baker that
# splayed arms). For every matched bone, we transfer the CHANGE FROM REST — the
# source's motion measured against its OWN rest pose, re-anchored onto the
# target's rest pose — using EXACTLY:
#
#     world_rot_target(t) = (world_rot_source(t) @ world_rot_source_rest^-1) @ world_rot_target_rest
#
# So when the source is at its rest pose (delta = identity), the target stays at
# ITS rest pose — no arm splay, no matter how the two bind poses differ. Hips
# additionally receive a SCALED world-translation delta; horizontal root motion
# is stripped for looping clips so the in-game controller owns travel.
# ---------------------------------------------------------------------------
#
# Bone matching: Mixamo skeletons name bones `mixamorig:<X>`. We strip the
# prefix and map <X> → the character's bone BY NAME, applying MIXAMO_NAME_MAP
# for the AlphaCode `hero-a` rig whose names differ (Spine1→Spine01,
# Spine2→Spine02, Neck→neck, HeadTop_End→head_end). Bones with no target
# (fingers, etc.) are skipped. The effective map is auto-built and printed.
#
# Each clip → its own Action, pushed as a MUTED NLA track, so the glTF exporter
# (NLA_TRACKS mode, force-sampled) writes one named animation per clip that
# three.js reads via AnimationClip.findByName().
#
# Run (Blender hardcoded at /Applications/Blender.app/Contents/MacOS/Blender):
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/bake_character_anims.py -- \
#     --char assets/build/characters-opt/hero.glb \
#     --out  assets/build/characters-final/hero.glb \
#     --fbx  assets/source/mixamo/Idle.fbx     --name idle --loop \
#     --fbx  assets/source/mixamo/Walking.fbx  --name walk --loop \
#     [--hips-scale 1.0]
#
# Or with a JSON manifest (used by build_cast.mjs):
#   ... --manifest /tmp/hero.bake.json
#   { "char": "...", "out": "...", "hips_scale": 1.0,
#     "clips": [ { "fbx": "...", "name": "idle", "loop": true }, ... ] }
import sys
import os
import json
import math

import bpy
from mathutils import Quaternion, Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

# --- Mixamo <base name> → AlphaCode hero-a bone name overrides ----------------
# hero-a's 24-joint rig (see scripts/inspect-rig.mjs) diverges from Mixamo's
# naming here; everything else matches 1:1 by base name. For a Mixamo-named rig
# (e.g. the legacy Soldier) NONE of these fire and matching is pure 1:1.
MIXAMO_NAME_MAP = {
    "Spine1": "Spine01",
    "Spine2": "Spine02",
    "Neck": "neck",
    "HeadTop_End": "head_end",
}

# Clips whose horizontal (X/Y in Blender's Z-up world) root motion is stripped
# so the ThirdPersonController owns travel. One-shots (jump/vault/dash/turns)
# keep their motion. Overridable per-clip via --loop / manifest "loop".
DEFAULT_LOOP_CLIPS = {
    "idle", "walk", "run", "sprint", "strafeL", "strafeR",
    "walkBackShoot", "runGun",
}


def parse_cli(args):
    spec = {"clips": [], "hips_scale": None}
    i = 0
    pending = None  # last --fbx awaiting optional --name/--loop
    while i < len(args):
        a = args[i]
        if a == "--manifest":
            with open(args[i + 1]) as f:
                return json.load(f)
        elif a == "--char":
            spec["char"] = args[i + 1]; i += 2
        elif a == "--out":
            spec["out"] = args[i + 1]; i += 2
        elif a == "--hips-scale":
            spec["hips_scale"] = float(args[i + 1]); i += 2
        elif a == "--absolute":
            spec["absolute"] = True; i += 1
        elif a == "--fbx":
            pending = {"fbx": args[i + 1], "name": None, "loop": None}
            spec["clips"].append(pending); i += 2
        elif a == "--name":
            if pending:
                pending["name"] = args[i + 1]
            i += 2
        elif a == "--loop":
            if pending:
                pending["loop"] = True
            i += 1
        else:
            i += 1
    return spec


def clip_stem(path):
    base = os.path.splitext(os.path.basename(path))[0]
    return base.replace("mixamo.com", "").strip("._- ") or base


def build_bone_map(src_arm, tgt_arm, name_map=None):
    """mixamorig:<X> source bone name → target bone name (auto + overrides).

    name_map: Mixamo base-name → target bone-name overrides for rigs whose
    naming diverges from Mixamo (defaults to the hero-a MIXAMO_NAME_MAP; the
    Meshy auto-rig cast passes its own anatomically-correct table)."""
    if name_map is None:
        name_map = MIXAMO_NAME_MAP
    tgt_names = {b.name for b in tgt_arm.data.bones}
    tgt_lower = {b.name.lower(): b.name for b in tgt_arm.data.bones}
    mapping = {}
    for sb in src_arm.data.bones:
        base = sb.name.split(":")[-1]  # strip 'mixamorig:'
        cand = name_map.get(base, base)
        if cand in tgt_names:
            mapping[sb.name] = cand
        elif cand.lower() in tgt_lower:
            mapping[sb.name] = tgt_lower[cand.lower()]
        elif base.lower() in tgt_lower:
            mapping[sb.name] = tgt_lower[base.lower()]
        # else: unmatched (e.g. fingers) — skipped
    return mapping


def ordered_bones(arm):
    """Target bones, parents strictly before children."""
    out, seen = [], set()

    def visit(b):
        if b.name in seen:
            return
        if b.parent is not None:
            visit(b.parent)
        seen.add(b.name)
        out.append(b)

    for b in arm.data.bones:
        visit(b)
    return out


def find_hips(arm):
    for cand in ("Hips", "mixamorig:Hips", "hips"):
        if cand in arm.data.bones:
            return cand
    # fall back to the root-most bone
    roots = [b for b in arm.data.bones if b.parent is None]
    return roots[0].name if roots else None


def retarget_clip(tgt_arm, src_arm, name, loop, hips_scale, name_map=None, absolute=False,
                  strip_z=False):
    """Bake one source action onto the target as a new Action; return it.

    absolute=False (default): rest-delta transfer (change-from-rest), the correct
    fix across differing bind poses.
    absolute=True: copy the source's ABSOLUTE world rotation onto the target.
    Only sane when the two rigs are authored in the same rest orientation; kept
    as an escape hatch for auto-rigged characters whose rest matches Mixamo's."""
    src_act = C.action_of(src_arm)
    if src_act is None:
        raise RuntimeError(f"{name}: source FBX has no action")
    # ensure the action drives the source rig while we sample frames
    if src_arm.animation_data is None:
        src_arm.animation_data_create()
    src_arm.animation_data.action = src_act
    fr = src_act.frame_range
    f0, f1 = int(math.floor(fr[0])), int(math.ceil(fr[1]))

    bmap = build_bone_map(src_arm, tgt_arm, name_map)
    inv = {v: k for k, v in bmap.items()}  # target bone name → source bone name
    print(f"[bake] '{name}': matched {len(bmap)}/{len(src_arm.data.bones)} bones, "
          f"frames {f0}..{f1}, loop={loop}")

    # Static (rest) data -------------------------------------------------------
    arm_tgt_wmat = tgt_arm.matrix_world.copy()
    arm_tgt_wrot = arm_tgt_wmat.to_quaternion()
    arm_tgt_wrot_inv = arm_tgt_wrot.inverted()
    arm_src_wrot = src_arm.matrix_world.to_quaternion()

    tgt_rest_local = {b.name: b.matrix_local.copy() for b in tgt_arm.data.bones}
    # rest of each target bone RELATIVE to its parent (armature space)
    rest_rel_rot = {}
    for b in tgt_arm.data.bones:
        if b.parent is not None:
            rel = b.parent.matrix_local.inverted() @ b.matrix_local
        else:
            rel = b.matrix_local
        rest_rel_rot[b.name] = rel.to_quaternion()

    # target rest world rotation per matched bone
    tgt_rest_wrot = {
        b.name: (arm_tgt_wrot @ b.matrix_local.to_quaternion())
        for b in tgt_arm.data.bones
    }
    # source rest world rotation per bone
    src_rest_wrot = {
        b.name: (arm_src_wrot @ b.matrix_local.to_quaternion())
        for b in src_arm.data.bones
    }

    hips = find_hips(tgt_arm)
    # source hips is whatever source bone maps to the target hips
    src_hips = next((s for s, t in bmap.items() if t == hips), None)
    tgt_hips_rest_wpos = (arm_tgt_wmat @ tgt_rest_local[hips]).to_translation() if hips else None
    src_hips_rest_wpos = None
    if src_hips:
        src_hips_rest_wpos = (src_arm.matrix_world @ src_arm.data.bones[src_hips].matrix_local).to_translation()

    # auto hips scale = target rest hip height / source rest hip height
    if hips_scale is None:
        if src_hips and tgt_hips_rest_wpos is not None and src_hips_rest_wpos is not None:
            sh = max(1e-4, abs(src_hips_rest_wpos.z))
            hips_scale = abs(tgt_hips_rest_wpos.z) / sh
        else:
            hips_scale = 1.0
    print(f"[bake] '{name}': hips='{hips}' src_hips='{src_hips}' hips_scale={hips_scale:.4f}")

    # Fresh action on the target ----------------------------------------------
    if tgt_arm.animation_data is None:
        tgt_arm.animation_data_create()
    act = bpy.data.actions.new(name)
    tgt_arm.animation_data.action = act

    tgt_pose = {pb.name: pb for pb in tgt_arm.pose.bones}
    for pb in tgt_pose.values():
        pb.rotation_mode = "QUATERNION"
    order = [b for b in ordered_bones(tgt_arm) if b.name in inv]

    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        pose_arm_rot = {}  # target bone name → armature-space pose rotation (this frame)

        for tb in order:
            tname = tb.name
            sname = inv[tname]
            spb = src_arm.pose.bones[sname]
            # source world rotation at t: (armature_world @ pose_matrix) rotation
            q_src_world = (src_arm.matrix_world @ spb.matrix).to_quaternion()

            # rest-delta transfer (THE formula in the header):
            if absolute:
                # ABSOLUTE mode: copy source world orientation verbatim.
                q_tgt_world = q_src_world
            else:
                q_tgt_world = (q_src_world @ src_rest_wrot[sname].inverted()) @ tgt_rest_wrot[tname]

            # world → armature space → local basis (parent already computed)
            q_pose_arm = arm_tgt_wrot_inv @ q_tgt_world
            pose_arm_rot[tname] = q_pose_arm
            parent = tb.parent
            parent_q = pose_arm_rot.get(parent.name, Quaternion()) if parent else Quaternion()
            basis_rot = rest_rel_rot[tname].inverted() @ parent_q.inverted() @ q_pose_arm

            pb = tgt_pose[tname]
            pb.rotation_quaternion = basis_rot
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f - f0)

            # Hips: scaled world-translation delta (root motion) --------------
            if tname == hips and src_hips is not None:
                src_wpos = (src_arm.matrix_world @ src_arm.pose.bones[src_hips].matrix).to_translation()
                delta = (src_wpos - src_hips_rest_wpos) * hips_scale
                if loop:
                    delta.x = 0.0
                    delta.y = 0.0  # Blender is Z-up: X/Y are horizontal, Z is the vertical bob
                if strip_z:
                    # Pose-only clips (jump/vault): the in-game physics arc owns
                    # the vertical ride; keeping the clip's own rise would stack
                    # the two into a double-height "elevator" jump.
                    delta.z = 0.0
                tgt_wpos = tgt_hips_rest_wpos + delta
                pose_arm_mat = Matrix.LocRotScale(
                    arm_tgt_wmat.inverted() @ tgt_wpos, q_pose_arm, Vector((1, 1, 1))
                )
                basis = tgt_rest_local[hips].inverted() @ pose_arm_mat
                pb.location = basis.to_translation()
                pb.keyframe_insert(data_path="location", frame=f - f0)

    # Interpolation is irrelevant: export_force_sampling bakes every frame. (The
    # per-fcurve tweak was dropped for Blender 4.4+ slotted-action compatibility.)
    return act


def push_muted_nla(arm, act):
    """Stash `act` as a muted NLA track so glTF NLA_TRACKS export names it."""
    ad = arm.animation_data
    track = ad.nla_tracks.new()
    track.name = act.name
    strip = track.strips.new(act.name, 0, act)
    strip.name = act.name
    track.mute = True
    ad.action = None  # don't let the active action double-export


def bake(spec, name_map=None, absolute=False, label="bake"):
    """Shared bake entry point used by bake_character_anims,
    retarget_native_mixamo_rest_delta and bake_native_mixamo_character."""
    for req in ("char", "out"):
        if req not in spec:
            raise SystemExit(f"{label}: --{req} required")
    if not spec.get("clips"):
        raise SystemExit(f"{label}: at least one --fbx clip required")

    C.reset_scene()
    C.import_asset(spec["char"])
    tgt_arm = C.first_armature()
    if tgt_arm is None:
        raise SystemExit(f"{label}: no armature in --char")
    tgt_arm.name = "TARGET_RIG"
    print(f"[{label}] target rig '{tgt_arm.name}' bones: "
          f"{[b.name for b in tgt_arm.data.bones]}")
    if absolute:
        print(f"[{label}] ABSOLUTE transfer mode ON")

    baked = []
    for clip in spec["clips"]:
        name = clip.get("name") or clip_stem(clip["fbx"])
        loop = clip.get("loop")
        if loop is None:
            loop = name in DEFAULT_LOOP_CLIPS

        before = set(o.name for o in bpy.data.objects if o.type == "ARMATURE")
        C.import_asset(clip["fbx"])
        src_arm = next((o for o in bpy.data.objects
                        if o.type == "ARMATURE" and o.name not in before), None)
        if src_arm is None:
            raise SystemExit(f"{label}: no armature imported from {clip['fbx']}")

        act = retarget_clip(tgt_arm, src_arm, name, loop, spec.get("hips_scale"),
                            name_map=name_map, absolute=absolute,
                            strip_z=bool(clip.get("strip_z")))
        push_muted_nla(tgt_arm, act)
        baked.append(name)

        # tear the source rig + its meshes back out
        to_del = [o for o in bpy.data.objects
                  if o == src_arm or (o.parent == src_arm)]
        for o in list(bpy.data.objects):
            if o.type == "MESH" and o.parent and o.parent.name == src_arm.name:
                to_del.append(o)
        for o in set(to_del):
            try:
                bpy.data.objects.remove(o, do_unlink=True)
            except Exception:
                pass

    C.export_glb(spec["out"], animations=True, anim_mode="NLA_TRACKS")
    print(f"[{label}] DONE → {spec['out']}  clips: {', '.join(baked)}")
    return baked


def main():
    spec = parse_cli(C.script_args())
    bake(spec, name_map=MIXAMO_NAME_MAP, absolute=bool(spec.get("absolute")),
         label="bake_character_anims")


if __name__ == "__main__":
    main()
