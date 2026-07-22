# make_synth_mixamo.py — VALIDATION HELPER (not part of the shipping pipeline).
#
# Builds a synthetic humanoid armature using Mixamo's `mixamorig:` bone naming
# and a known animation (a clean shoulder raise on mixamorig:RightArm), then
# exports it as an FBX. This stands in for a real Mixamo clip so we can prove
# bake_character_anims.py's rest-delta retarget + bone-name matching end-to-end
# WITHOUT downloading anything or spending Meshy credits.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/tests/make_synth_mixamo.py -- \
#     --out assets/source/mixamo/synth_wave.fbx --name synth_wave
import sys
import os
import math

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _common as C  # noqa: E402

# (name, head, tail, parent) — Z-up metres. Names carry the mixamorig: prefix.
# RightHandIndex1 is intentionally UNMATCHED on hero-a (proves finger skipping).
B = [
    ("Hips",          (0, 0, 1.00), (0, 0, 1.10), None),
    ("Spine",         (0, 0, 1.10), (0, 0, 1.25), "Hips"),
    ("Spine1",        (0, 0, 1.25), (0, 0, 1.40), "Spine"),
    ("Spine2",        (0, 0, 1.40), (0, 0, 1.50), "Spine1"),
    ("Neck",          (0, 0, 1.50), (0, 0, 1.60), "Spine2"),
    ("Head",          (0, 0, 1.60), (0, 0, 1.75), "Neck"),
    ("HeadTop_End",   (0, 0, 1.75), (0, 0, 1.85), "Head"),
    ("LeftShoulder",  (0.05, 0, 1.48), (0.15, 0, 1.48), "Spine2"),
    ("LeftArm",       (0.15, 0, 1.48), (0.45, 0, 1.48), "LeftShoulder"),
    ("LeftForeArm",   (0.45, 0, 1.48), (0.70, 0, 1.48), "LeftArm"),
    ("LeftHand",      (0.70, 0, 1.48), (0.80, 0, 1.48), "LeftForeArm"),
    ("RightShoulder", (-0.05, 0, 1.48), (-0.15, 0, 1.48), "Spine2"),
    ("RightArm",      (-0.15, 0, 1.48), (-0.45, 0, 1.48), "RightShoulder"),
    ("RightForeArm",  (-0.45, 0, 1.48), (-0.70, 0, 1.48), "RightArm"),
    ("RightHand",     (-0.70, 0, 1.48), (-0.80, 0, 1.48), "RightForeArm"),
    ("RightHandIndex1", (-0.80, 0, 1.48), (-0.86, 0, 1.48), "RightHand"),
    ("LeftUpLeg",     (0.10, 0, 1.00), (0.10, 0, 0.55), "Hips"),
    ("LeftLeg",       (0.10, 0, 0.55), (0.10, 0, 0.15), "LeftUpLeg"),
    ("LeftFoot",      (0.10, 0, 0.15), (0.10, -0.15, 0.05), "LeftLeg"),
    ("RightUpLeg",    (-0.10, 0, 1.00), (-0.10, 0, 0.55), "Hips"),
    ("RightLeg",      (-0.10, 0, 0.55), (-0.10, 0, 0.15), "RightUpLeg"),
    ("RightFoot",     (-0.10, 0, 0.15), (-0.10, -0.15, 0.05), "RightLeg"),
]
PREFIX = "mixamorig:"


def parse(args):
    out = {"out": "assets/source/mixamo/synth_wave.fbx", "name": "synth_wave"}
    i = 0
    while i < len(args):
        if args[i] == "--out":
            out["out"] = args[i + 1]; i += 2
        elif args[i] == "--name":
            out["name"] = args[i + 1]; i += 2
        else:
            i += 1
    return out


def main():
    opt = parse(C.script_args())
    C.reset_scene()

    arm_data = bpy.data.armatures.new("mixamorig")
    arm = bpy.data.objects.new("SynthMixamo", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm

    bpy.ops.object.mode_set(mode="EDIT")
    ebones = {}
    for name, head, tail, parent in B:
        eb = arm_data.edit_bones.new(PREFIX + name)
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        if parent:
            eb.parent = ebones[parent]
        ebones[name] = eb
    bpy.ops.object.mode_set(mode="POSE")

    scn = bpy.context.scene
    scn.frame_start = 1
    scn.frame_end = 31
    arm.animation_data_create()
    act = bpy.data.actions.new(opt["name"])
    arm.animation_data.action = act

    # Animate mixamorig:RightArm: identity at f1 → a clean +1.0 rad raise about
    # its local X by f31. Every other bone stays at rest (delta = identity),
    # which is exactly what proves "source at rest ⇒ target at rest".
    ra = arm.pose.bones[PREFIX + "RightArm"]
    ra.rotation_mode = "QUATERNION"
    for f, ang in ((1, 0.0), (31, 1.0)):
        ra.rotation_quaternion = (math.cos(ang / 2), math.sin(ang / 2), 0, 0)
        ra.keyframe_insert("rotation_quaternion", frame=f)

    scn.frame_set(1)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.data.objects:
        o.select_set(o is arm)
    bpy.context.view_layer.objects.active = arm

    os.makedirs(os.path.dirname(os.path.abspath(opt["out"])), exist_ok=True)
    C.ensure_fbx_addon()
    from _common import _supported
    kw = _supported(bpy.ops.export_scene.fbx, dict(
        filepath=opt["out"], use_selection=True, add_leaf_bones=False,
        bake_anim=True, bake_anim_use_all_actions=True,
        bake_anim_use_nla_strips=False, object_types={"ARMATURE"},
        bake_anim_step=1.0, use_armature_deform_only=False,
    ))
    bpy.ops.export_scene.fbx(**kw)
    print(f"[synth] wrote {opt['out']} ({len(B)} mixamorig bones, clip '{opt['name']}')")


if __name__ == "__main__":
    main()
