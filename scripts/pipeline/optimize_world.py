# optimize_world.py — decimate + shrink non-skinned world props/buildings.
#
# Stage for static set-dressing (no armature, no skin): buildings budget to
# ~40k tris, small props to ~15k, textures <= 1024 px. Re-export a Y-up GLB
# with JPEG textures and NO animations.
#
#   assets/build/world/<name>.glb → assets/build/world-opt/<name>.glb
#
# Run (Blender hardcoded at /Applications/Blender.app/Contents/MacOS/Blender):
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/optimize_world.py -- \
#     --in  assets/build/world/tower.glb \
#     --out assets/build/world-opt/tower.glb \
#     [--kind building|prop] [--tris N] [--tex 1024]
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402

BUDGET = {"building": 40000, "prop": 15000}


def parse(args):
    out = {"kind": "prop", "tris": None, "tex": 1024}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--in":
            out["in"] = args[i + 1]; i += 2
        elif a == "--out":
            out["out"] = args[i + 1]; i += 2
        elif a == "--kind":
            out["kind"] = args[i + 1]; i += 2
        elif a == "--tris":
            out["tris"] = int(args[i + 1]); i += 2
        elif a == "--tex":
            out["tex"] = int(args[i + 1]); i += 2
        else:
            i += 1
    return out


def main():
    opt = parse(C.script_args())
    if "in" not in opt or "out" not in opt:
        raise SystemExit("optimize_world: --in and --out are required")
    target = opt["tris"] if opt["tris"] is not None else BUDGET.get(opt["kind"], 15000)

    C.reset_scene()
    C.import_asset(opt["in"])

    if C.first_armature() is not None:
        print("[optimize_world] NOTE: input has an armature — use optimize_rigged.py "
              "for skinned characters (this pass ignores skinning).")

    before, tgt = C.decimate_meshes(target)
    C.shrink_textures(opt["tex"])
    C.export_glb(opt["out"], animations=False, apply_modifiers=True)
    after = C.mesh_tri_count(evaluated=True)
    print(f"[optimize_world] done ({opt['kind']}): {before} → {after} tris (target {tgt})")


if __name__ == "__main__":
    main()
