# build_anims.py — assemble a shared animation LIBRARY GLB from a folder of
# Mixamo FBX clips. Every Mixamo export shares the SAME `mixamorig` skeleton, so
# each clip's Action is bone-name-compatible with one master armature. We stash
# every action as a muted NLA strip on that single armature, drop all meshes,
# and export skeleton + named clips only → assets/build/anims/anim-library.glb.
#
# The result is a tiny (~bones+tracks) GLB whose clips three.js binds by bone
# name onto ANY mixamorig-compatible character at runtime (or that a future
# in-engine retargeter can consume). It is NOT character-specific.
#
# Run (Blender hardcoded at /Applications/Blender.app/Contents/MacOS/Blender):
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/build_anims.py -- \
#     --src assets/source/mixamo \
#     --out assets/build/anims/anim-library.glb
import sys
import os
import glob

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402


def parse(args):
    out = {"src": "assets/source/mixamo", "out": "assets/build/anims/anim-library.glb"}
    i = 0
    while i < len(args):
        if args[i] == "--src":
            out["src"] = args[i + 1]; i += 2
        elif args[i] == "--out":
            out["out"] = args[i + 1]; i += 2
        else:
            i += 1
    return out


def stem(path):
    return os.path.splitext(os.path.basename(path))[0].replace("mixamo.com", "").strip("._- ")


def main():
    opt = parse(C.script_args())
    fbxs = sorted(glob.glob(os.path.join(opt["src"], "*.fbx")) +
                  glob.glob(os.path.join(opt["src"], "*.FBX")))
    if not fbxs:
        raise SystemExit(f"build_anims: no .fbx clips in {opt['src']} "
                         f"(drop your Mixamo exports there first)")

    C.reset_scene()

    master = None
    baked = []
    for fbx in fbxs:
        before = {o.name for o in bpy.data.objects if o.type == "ARMATURE"}
        C.import_asset(fbx)
        new_arm = next((o for o in bpy.data.objects
                        if o.type == "ARMATURE" and o.name not in before), None)
        if new_arm is None:
            print(f"[build_anims] WARN no armature in {fbx}, skipping")
            continue
        act = C.action_of(new_arm)
        if act is None:
            print(f"[build_anims] WARN no action in {fbx}, skipping")
            continue
        name = stem(fbx)
        act.name = name

        if master is None:
            master = new_arm
            master.name = "MASTER_RIG"
            if master.animation_data is None:
                master.animation_data_create()
            # remove any child meshes of the master (skeleton only)
            for o in list(bpy.data.objects):
                if o.type == "MESH":
                    bpy.data.objects.remove(o, do_unlink=True)
        # push this clip onto the MASTER as a muted NLA track (actions are
        # bone-name keyed, so they apply to the shared mixamorig master).
        track = master.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, act)
        track.mute = True
        baked.append(name)

        # delete the just-imported armature (if not the master) + any meshes
        if new_arm is not master:
            for o in list(bpy.data.objects):
                if o.type == "MESH" or o is new_arm:
                    bpy.data.objects.remove(o, do_unlink=True)

    master.animation_data.action = None
    C.export_glb(opt["out"], animations=True, anim_mode="NLA_TRACKS")
    print(f"[build_anims] DONE → {opt['out']}  {len(baked)} clips: {', '.join(baked)}")


if __name__ == "__main__":
    main()
