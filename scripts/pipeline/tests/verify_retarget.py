# verify_retarget.py — VALIDATION HELPER. Proves bake_character_anims.py's
# rest-delta retarget is correct on the ACTUAL exported GLB (not just in theory).
#
# The defining invariant of a rest-delta retarget is that the WORLD-SPACE change
# from rest is preserved across rigs:
#
#     world_rot_source(t) @ world_rot_source_rest^-1
#       ==  world_rot_target(t) @ world_rot_target_rest^-1
#
# We measure the LEFT side from the source Mixamo FBX and the RIGHT side from the
# baked GLB (re-imported), for every matched bone at the clip's start and end,
# and assert they agree. This exercises the whole pipeline — local-basis
# reconstruction, parent chain, coordinate (Y-up) round-trip, NLA export naming,
# and glTF sampling — so any real bug breaks it. It is NOT a tautology against
# the bake code; it reads back independently-exported data.
#
# Also asserted:
#   * at the clip START (source at rest) the target's delta-from-rest is ~0
#     for every bone  → the "no arm splay" guarantee.
#   * the animated bone (mixamorig:RightArm→RightArm) actually MOVED by the
#     known ~1.0 rad  → the motion transferred (non-trivial, non-exploded).
#   * no target bone delta is non-finite or absurdly large  → non-exploded.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/tests/verify_retarget.py -- \
#     --fbx assets/source/mixamo/synth_wave.fbx \
#     --glb assets/build/characters-final/hero.glb --clip synth_wave
import sys
import os

import bpy
from mathutils import Quaternion

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _common as C  # noqa: E402
from bake_character_anims import MIXAMO_NAME_MAP  # noqa: E402

TOL_MATCH = 0.05   # rad (~2.9°) agreement between source & target world deltas
TOL_REST = 0.05    # rad: target must be ~rest at the clip start
KNOWN_MOVE = 1.0   # rad: the synthetic RightArm raise


def parse(args):
    out = {"clip": "synth_wave"}
    i = 0
    while i < len(args):
        if args[i] == "--fbx":
            out["fbx"] = args[i + 1]; i += 2
        elif args[i] == "--glb":
            out["glb"] = args[i + 1]; i += 2
        elif args[i] == "--clip":
            out["clip"] = args[i + 1]; i += 2
        else:
            i += 1
    return out


def bone_world_rot(arm, bone_name):
    return (arm.matrix_world @ arm.pose.bones[bone_name].matrix).to_quaternion()


def bone_rest_world_rot(arm, bone_name):
    return (arm.matrix_world @ arm.data.bones[bone_name].matrix_local).to_quaternion()


def measure(arm, names, f_start, f_end):
    """Return {bone: (delta_start_quat, delta_end_quat)} where delta = world @ rest^-1."""
    out = {}
    for n in names:
        rest_inv = bone_rest_world_rot(arm, n).inverted()
        bpy.context.scene.frame_set(f_start)
        d0 = bone_world_rot(arm, n) @ rest_inv
        bpy.context.scene.frame_set(f_end)
        d1 = bone_world_rot(arm, n) @ rest_inv
        out[n] = (d0, d1)
    return out


def main():
    opt = parse(C.script_args())

    # ---- source (Mixamo FBX) --------------------------------------------------
    C.reset_scene()
    C.import_asset(opt["fbx"])
    src = C.first_armature()
    act = C.action_of(src)
    if src.animation_data is None:
        src.animation_data_create()
    src.animation_data.action = act
    sf0, sf1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    src_bones = [b.name for b in src.data.bones]
    src_delta = measure(src, src_bones, sf0, sf1)

    # source bone → target bone name (same rule the bake uses)
    def to_target(sn):
        base = sn.split(":")[-1]
        return MIXAMO_NAME_MAP.get(base, base)

    # ---- target (baked GLB) ---------------------------------------------------
    C.reset_scene()
    C.import_asset(opt["glb"])
    tgt = C.first_armature()
    tgt_names = {b.name for b in tgt.data.bones}
    tgt_act = next((a for a in bpy.data.actions if opt["clip"] in a.name), C.action_of(tgt))
    if tgt_act is None:
        raise SystemExit("verify: no animation found in baked GLB")
    if tgt.animation_data is None:
        tgt.animation_data_create()
    tgt.animation_data.action = tgt_act
    tf0, tf1 = int(round(tgt_act.frame_range[0])), int(round(tgt_act.frame_range[1]))

    check = [(sn, to_target(sn)) for sn in src_bones if to_target(sn) in tgt_names]
    tgt_delta = measure(tgt, [t for _, t in check], tf0, tf1)

    # ---- compare --------------------------------------------------------------
    print(f"\n{'bone (mixamo→target)':38} {'Δstart(s/t)':>14} {'Δend(s/t)':>14} {'end-match':>10}")
    fails = []
    right_arm_moved = 0.0
    max_start_delta = 0.0
    for sn, tn in check:
        ds0, ds1 = src_delta[sn]
        dt0, dt1 = tgt_delta[tn]
        # magnitudes
        a_s0, a_s1 = ds0.angle, ds1.angle
        a_t0, a_t1 = dt0.angle, dt1.angle
        # agreement between source & target world delta-from-rest at END
        end_match = ds1.rotation_difference(dt1).angle
        start_match = ds0.rotation_difference(dt0).angle
        if not (end_match == end_match and start_match == start_match):  # NaN guard
            fails.append(f"{sn}: NaN delta")
        if end_match > TOL_MATCH:
            fails.append(f"{sn}→{tn}: end world-delta mismatch {end_match:.4f} rad > {TOL_MATCH}")
        if start_match > TOL_MATCH:
            fails.append(f"{sn}→{tn}: start world-delta mismatch {start_match:.4f} rad > {TOL_MATCH}")
        # non-exploded: target rest at clip start
        max_start_delta = max(max_start_delta, a_t0)
        if a_t0 > TOL_REST:
            fails.append(f"{tn}: target NOT at rest at clip start ({a_t0:.4f} rad)")
        if tn == "RightArm":
            right_arm_moved = a_t1
        print(f"{(sn+'→'+tn):38} {a_s0:6.3f}/{a_t0:6.3f} {a_s1:6.3f}/{a_t1:6.3f} {end_match:10.4f}")

    print()
    # the animated bone must actually have moved by ~the known amount
    if abs(right_arm_moved - KNOWN_MOVE) > 0.1:
        fails.append(f"RightArm end delta {right_arm_moved:.3f} rad != known {KNOWN_MOVE} rad")

    print(f"matched bones checked : {len(check)}")
    print(f"RightArm end delta    : {right_arm_moved:.4f} rad (expected ~{KNOWN_MOVE})")
    print(f"max target Δ at start : {max_start_delta:.4f} rad (expected ~0 → no splay)")
    if fails:
        print("\nFAIL:")
        for f in fails:
            print("  -", f)
        raise SystemExit(1)
    print("\nPASS: rest-delta retarget verified on the exported GLB.")


if __name__ == "__main__":
    main()
