# retarget_meshy_native.py — rest-delta transfer of MESHY-NATIVE clip GLBs onto
# a Meshy auto-rigged character (the AlphaCode cyborg). Both rigs use the SAME
# 24-joint naming scheme (Hips / Spine02→Spine01→Spine / neck / Head / ...),
# so the bone map is PURE 1:1 BY NAME.
#
# Why not retarget_native_mixamo_rest_delta.py? Its CYBORG_BONE_MAP translates
# MIXAMO names, where 'Spine' is the LOWEST spine bone — so it remaps
# 'Spine'→'Spine02'. A Meshy-native source's 'Spine' is the CHEST: running a
# Meshy clip through the Mixamo map collapses the chest onto the pelvis bone
# and leaves the real chest at rest (the class of torso glitch the owner saw).
# This script passes an EMPTY name map, so build_bone_map matches 1:1.
#
# Manifest additions (per clip):
#   "loop": true    → strip horizontal (X/Y in Blender Z-up) hips root motion
#   "strip_z": true → ALSO zero the vertical hips delta (jump/vault: the
#                     in-game physics arc owns the body's rise, the clip owns
#                     only the pose — without this the two vertical motions add
#                     and the jump reads double-height "elevator")
#
# Run:
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/retarget_meshy_native.py -- --manifest m.json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402
from bake_character_anims import bake, parse_cli  # noqa: E402


def main():
    spec = parse_cli(C.script_args())
    # Empty map → build_bone_map falls through to exact/lowercase name match.
    bake(spec, name_map={}, absolute=bool(spec.get("absolute")),
         label="retarget_meshy_native")


if __name__ == "__main__":
    main()
