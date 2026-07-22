# report_clips.py — one-shot report of every FBX clip in a folder: armature name,
# root bone, whether it's a mixamorig skeleton, action name + frame range.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/tests/report_clips.py -- --src assets/source/mixamo
import sys
import os
import glob

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _common as C  # noqa: E402


def parse(args):
    out = {"src": "assets/source/mixamo"}
    i = 0
    while i < len(args):
        if args[i] == "--src":
            out["src"] = args[i + 1]; i += 2
        else:
            i += 1
    return out


def main():
    opt = parse(C.script_args())
    fbxs = sorted(glob.glob(os.path.join(opt["src"], "*.fbx")) +
                  glob.glob(os.path.join(opt["src"], "*.FBX")))
    print(f"{'file':40} {'bones':>5} {'mixamorig':>9} {'frames':>10}  action")
    for fbx in fbxs:
        C.reset_scene()
        try:
            C.import_asset(fbx)
        except Exception as e:
            print(f"{os.path.basename(fbx):40}  IMPORT FAIL: {e}")
            continue
        arm = C.first_armature()
        if arm is None:
            print(f"{os.path.basename(fbx):40}  NO ARMATURE")
            continue
        names = [b.name for b in arm.data.bones]
        is_mix = any(n.startswith("mixamorig") for n in names)
        act = C.action_of(arm)
        fr = f"{act.frame_range[0]:.0f}..{act.frame_range[1]:.0f}" if act else "-"
        an = act.name if act else "-"
        print(f"{os.path.basename(fbx):40} {len(names):5} {str(is_mix):>9} {fr:>10}  {an}")


if __name__ == "__main__":
    main()
