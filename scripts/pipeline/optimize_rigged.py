# optimize_rigged.py — decimate + shrink a Meshy-rigged character GLB, keeping
# its skin/skeleton, and re-export WITHOUT animations.
#
# Stage 1 of the character pipeline: assets/build/characters/<name>.glb  →
#                                    assets/build/characters-opt/<name>.glb
#
# What it does:
#   * import the rigged GLB (armature + skinned mesh)
#   * DECIMATE (collapse) toward ~30k triangles — collapse preserves the vertex
#     groups, so skin weights survive the reduction
#   * shrink every texture so its longest side is <= 1024 px
#   * re-export a Y-up GLB, JPEG textures, animations OFF (clips are added later
#     by bake_character_anims.py; carrying Meshy's baked clips here would bloat
#     the -opt file and fight the retarget)
#
# Run (Blender hardcoded at /Applications/Blender.app/Contents/MacOS/Blender):
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/optimize_rigged.py -- \
#     --in  assets/build/characters/hero.glb \
#     --out assets/build/characters-opt/hero.glb \
#     [--tris 30000] [--tex 1024]
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402


def parse(args):
    out = {"tris": 30000, "tex": 1024}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--in":
            out["in"] = args[i + 1]; i += 2
        elif a == "--out":
            out["out"] = args[i + 1]; i += 2
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
        raise SystemExit("optimize_rigged: --in and --out are required")

    C.reset_scene()
    C.import_asset(opt["in"])

    arm = C.first_armature()
    if arm is None:
        raise SystemExit("optimize_rigged: no armature found in input (expected a rigged GLB)")
    print(f"[optimize_rigged] armature '{arm.name}' with {len(arm.data.bones)} bones")

    before, target = C.decimate_meshes(opt["tris"])
    C.shrink_textures(opt["tex"])

    # animations OFF — the -opt file is a clean mesh+skeleton the bake stage
    # loads and layers named clips onto.
    C.export_glb(opt["out"], animations=False, apply_modifiers=True)
    after = C.mesh_tri_count(evaluated=True)
    print(f"[optimize_rigged] done: {before} → {after} tris (target {target}); "
          f"skeleton preserved ({len(arm.data.bones)} bones)")


if __name__ == "__main__":
    main()
