# verify_cyborg_retarget.py — numeric proof that the rest-delta retarget landed
# cleanly on the Meshy cyborg auto-rig, using the anatomically-correct
# CYBORG_BONE_MAP (spine reversed).
#
# The defining invariant of a rest-delta retarget is that the WORLD-SPACE change
# from rest is preserved across rigs, at EVERY frame:
#
#     world_rot_source(t) @ world_rot_source_rest^-1
#       == world_rot_target(t) @ world_rot_target_rest^-1
#
# We measure the LEFT side from the source Mixamo FBX and the RIGHT side from the
# re-imported baked GLB, for every mapped bone, sampled across the clip, and
# assert they agree within tolerance. A per-bone max-deviation table doubles as a
# splay detector: any bone that reads a large mismatch is exactly the bone that
# would visibly splay in-game.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/tests/verify_cyborg_retarget.py -- \
#     --fbx "assets/source/mixamo/rifle aiming idle.fbx" \
#     --glb /tmp/cyborg-idle-test.glb --clip idle
import sys
import os
import math

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _common as C  # noqa: E402
from retarget_native_mixamo_rest_delta import CYBORG_BONE_MAP  # noqa: E402

TOL = 0.06  # rad (~3.4°): agreement between source & target world delta-from-rest


def parse(args):
    out = {"clip": "idle"}
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


def geodesic(qa, qb):
    """Smallest angle (rad) between two rotations, folded into [0, pi] so the
    quaternion double-cover (q ~ -q) doesn't read as a 2*pi mismatch."""
    d = abs(max(-1.0, min(1.0, qa.normalized().dot(qb.normalized()))))
    return 2.0 * math.acos(d)


def wrot(arm, bone):
    return (arm.matrix_world @ arm.pose.bones[bone].matrix).to_quaternion()


def rest_wrot(arm, bone):
    return (arm.matrix_world @ arm.data.bones[bone].matrix_local).to_quaternion()


def main():
    opt = parse(C.script_args())

    # ---- source (Mixamo FBX) ----
    C.reset_scene()
    C.import_asset(opt["fbx"])
    src = C.first_armature()
    act = C.action_of(src)
    if src.animation_data is None:
        src.animation_data_create()
    src.animation_data.action = act
    sf0, sf1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    src_names = {b.name for b in src.data.bones}

    # mixamo bone -> cyborg bone (same rule the retarget uses)
    pairs = []
    for sb in src.data.bones:
        base = sb.name.split(":")[-1]
        tgt = CYBORG_BONE_MAP.get(base)
        if tgt:
            pairs.append((sb.name, tgt))

    src_rest_inv = {s: rest_wrot(src, s).inverted() for s, _ in pairs}

    # sample source deltas across the clip
    nsamp = 6
    frames = [sf0 + round((sf1 - sf0) * k / (nsamp - 1)) for k in range(nsamp)]
    src_delta = {s: [] for s, _ in pairs}
    for f in frames:
        bpy.context.scene.frame_set(f)
        for s, _ in pairs:
            src_delta[s].append(wrot(src, s) @ src_rest_inv[s])

    # ---- target (baked GLB) ----
    C.reset_scene()
    C.import_asset(opt["glb"])
    tgt = C.first_armature()
    tgt_names = {b.name for b in tgt.data.bones}
    tgt_act = next((a for a in bpy.data.actions if opt["clip"] in a.name), C.action_of(tgt))
    if tgt_act is None:
        raise SystemExit("verify: no animation in baked GLB")
    if tgt.animation_data is None:
        tgt.animation_data_create()
    tgt.animation_data.action = tgt_act
    tf0, tf1 = int(round(tgt_act.frame_range[0])), int(round(tgt_act.frame_range[1]))
    tframes = [tf0 + round((tf1 - tf0) * k / (nsamp - 1)) for k in range(nsamp)]

    tgt_rest_inv = {t: rest_wrot(tgt, t).inverted() for _, t in pairs if t in tgt_names}
    tgt_delta = {t: [] for _, t in pairs if t in tgt_names}
    for f in tframes:
        bpy.context.scene.frame_set(f)
        for _, t in pairs:
            if t in tgt_names:
                tgt_delta[t].append(wrot(tgt, t) @ tgt_rest_inv[t])

    # ---- compare per bone across frames ----
    print(f"\n{'mixamo -> cyborg':40} {'maxΔdev(rad)':>12} {'srcMotion':>10}")
    fails = []
    worst = []
    for s, t in pairs:
        if t not in tgt_delta:
            continue
        devs = [geodesic(src_delta[s][k], tgt_delta[t][k]) for k in range(nsamp)]
        motion = max(geodesic(d, type(d)()) for d in src_delta[s])  # bone travel
        mx = max(devs)
        worst.append((mx, s, t, motion))
        flag = "  <-- MISMATCH" if mx > TOL else ""
        print(f"{(s.split(':')[-1] + ' -> ' + t):40} {mx:12.4f} {motion:10.4f}{flag}")
        if mx > TOL:
            fails.append(f"{s}->{t}: max world-delta mismatch {mx:.4f} rad > {TOL}")
        if mx != mx:  # NaN
            fails.append(f"{s}->{t}: NaN")

    worst.sort(reverse=True)
    print(f"\nchecked {len(worst)} mapped bones; worst deviation "
          f"{worst[0][0]:.4f} rad on {worst[0][1]}->{worst[0][2]}")
    if fails:
        print("\nFAIL:")
        for f in fails:
            print("  -", f)
        raise SystemExit(1)
    print("\nPASS: rest-delta retarget verified on the cyborg — every mapped bone's "
          "world change-from-rest matches the Mixamo source (no splay).")


if __name__ == "__main__":
    main()
