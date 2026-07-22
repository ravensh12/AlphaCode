# inspect_rigs.py — dump the bone hierarchies of a target character GLB and a
# Mixamo FBX so we can build the mixamorig -> character bone-name map.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/tests/inspect_rigs.py -- \
#     --glb assets/source/characters/.../Running_withSkin.glb \
#     --fbx assets/source/mixamo/X\ Bot.fbx
import sys
import os

import bpy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import _common as C  # noqa: E402


def parse(args):
    out = {}
    i = 0
    while i < len(args):
        if args[i] == "--glb":
            out["glb"] = args[i + 1]; i += 2
        elif args[i] == "--fbx":
            out["fbx"] = args[i + 1]; i += 2
        else:
            i += 1
    return out


def dump(label, path):
    C.reset_scene()
    C.import_asset(path)
    arm = C.first_armature()
    if arm is None:
        print(f"[{label}] NO ARMATURE in {path}")
        return [], None
    names = [b.name for b in arm.data.bones]
    print(f"\n===== {label}: {os.path.basename(path)} =====")
    print(f"armature object: {arm.name}  matrix_world scale: {arm.matrix_world.to_scale()}")
    print(f"bone count: {len(names)}")

    def line(b, depth):
        h = b.head_local
        t = b.tail_local
        print(f"{'  ' * depth}{b.name}  head=({h.x:.3f},{h.y:.3f},{h.z:.3f}) len={ (t-h).length:.3f}")
        for c in b.children:
            line(c, depth + 1)

    for b in arm.data.bones:
        if b.parent is None:
            line(b, 0)
    act = C.action_of(arm)
    if act is not None:
        print(f"action: {act.name}  frames {act.frame_range[0]:.0f}..{act.frame_range[1]:.0f}")
    return names, arm.name


def main():
    opt = parse(C.script_args())
    cyborg_names = []
    mixamo_names = []
    if "glb" in opt:
        cyborg_names, _ = dump("CHARACTER (cyborg)", opt["glb"])
    if "fbx" in opt:
        mixamo_names, _ = dump("MIXAMO", opt["fbx"])

    if cyborg_names and mixamo_names:
        cy_lower = {n.lower(): n for n in cyborg_names}
        cy_set = set(cyborg_names)
        print("\n===== NAIVE mixamorig -> cyborg name match =====")
        matched, unmatched = [], []
        for m in mixamo_names:
            base = m.split(":")[-1]
            if base in cy_set:
                matched.append((m, base)); continue
            if base.lower() in cy_lower:
                matched.append((m, cy_lower[base.lower()])); continue
            unmatched.append(m)
        for m, c in matched:
            print(f"  {m:32} -> {c}")
        print(f"\nMATCHED {len(matched)}/{len(mixamo_names)} mixamo bones by naive name")
        print("UNMATCHED mixamo bones:")
        for m in unmatched:
            print(f"  {m}")
        print("\nCYBORG bones NOT hit by any mixamo bone:")
        hit = {c for _, c in matched}
        for c in cyborg_names:
            if c not in hit:
                print(f"  {c}")


if __name__ == "__main__":
    main()
