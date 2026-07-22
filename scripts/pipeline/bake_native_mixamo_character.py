# bake_native_mixamo_character.py — bake Mixamo FBX clips onto a character whose
# skeleton IS a native `mixamorig` skeleton (e.g. a Mixamo-exported or
# X-Bot-derived character). Because the bone names match 1:1, the source Actions
# are already bone-name compatible with the target — NO cross-rig math is needed,
# so we simply rename each imported Action onto the target and stash it as a
# muted NLA track (three.js then reads each clip by name).
#
# This is the trivial sibling of retarget_native_mixamo_rest_delta.py (which is
# for Meshy AUTO-rigged characters whose bones are NOT mixamorig). Use THIS when
# the character already wears the mixamorig skeleton.
#
# Conventions shared with the rest of the pipeline: read_factory_settings, fps
# 30, Y-up GLB, JPEG textures, NLA_TRACKS forced sampling.
#
# Run (Blender hardcoded at /Applications/Blender.app/Contents/MacOS/Blender):
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/bake_native_mixamo_character.py -- \
#     --char assets/build/characters-opt/xbot.glb \
#     --out  assets/build/characters-final/xbot.glb \
#     --fbx  "assets/source/mixamo/walking.fbx" --name walk --loop \
#     [--manifest /tmp/xbot.bake.json]
import sys
import os

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402
from bake_character_anims import (  # noqa: E402
    parse_cli, clip_stem, push_muted_nla, find_hips, DEFAULT_LOOP_CLIPS,
)


def strip_root_motion(act, arm, hips_name, loop):
    """For looping clips, zero the horizontal (X/Y in Blender Z-up) Hips
    translation fcurves so the in-game controller owns travel."""
    if not loop or hips_name is None:
        return
    ad = arm.animation_data
    for fc in list(act.fcurves):
        if fc.data_path == f'pose.bones["{hips_name}"].location' and fc.array_index in (0, 1):
            # flatten to the first keyframe value (kills horizontal drift)
            base = fc.keyframe_points[0].co[1] if fc.keyframe_points else 0.0
            for kp in fc.keyframe_points:
                kp.co[1] = base
                kp.handle_left[1] = base
                kp.handle_right[1] = base
    _ = ad


def main():
    spec = parse_cli(C.script_args())
    for req in ("char", "out"):
        if req not in spec:
            raise SystemExit(f"bake_native_mixamo_character: --{req} required")
    if not spec.get("clips"):
        raise SystemExit("bake_native_mixamo_character: at least one --fbx clip required")

    C.reset_scene()
    C.import_asset(spec["char"])
    tgt = C.first_armature()
    if tgt is None:
        raise SystemExit("bake_native_mixamo_character: no armature in --char")
    tgt.name = "TARGET_RIG"
    if tgt.animation_data is None:
        tgt.animation_data_create()
    tgt_bones = {b.name for b in tgt.data.bones}
    hips = find_hips(tgt)
    print(f"[native] target rig bones: {sorted(tgt_bones)}")

    baked = []
    for clip in spec["clips"]:
        name = clip.get("name") or clip_stem(clip["fbx"])
        loop = clip.get("loop")
        if loop is None:
            loop = name in DEFAULT_LOOP_CLIPS

        before = {o.name for o in bpy.data.objects if o.type == "ARMATURE"}
        C.import_asset(clip["fbx"])
        src = next((o for o in bpy.data.objects
                    if o.type == "ARMATURE" and o.name not in before), None)
        if src is None:
            raise SystemExit(f"native: no armature imported from {clip['fbx']}")
        act = C.action_of(src)
        if act is None:
            raise SystemExit(f"native: no action in {clip['fbx']}")

        # sanity: the source action must key bones the target actually has
        keyed = {fc.data_path.split('"')[1] for fc in act.fcurves if '"' in fc.data_path}
        overlap = keyed & tgt_bones
        if not overlap:
            print(f"[native] WARN '{name}': source keys {sorted(keyed)[:4]}... "
                  f"share NO bone names with target — is this really native mixamo?")
        act.name = name
        strip_root_motion(act, tgt, hips, loop)
        push_muted_nla(tgt, act)
        baked.append(name)

        # drop the imported source rig + meshes
        for o in list(bpy.data.objects):
            if o is src or o.type == "MESH":
                if o is src or (o.parent and o.parent.name == src.name):
                    bpy.data.objects.remove(o, do_unlink=True)

    tgt.animation_data.action = None
    C.export_glb(spec["out"], animations=True, anim_mode="NLA_TRACKS")
    print(f"[native] DONE → {spec['out']}  clips: {', '.join(baked)}")


if __name__ == "__main__":
    main()
