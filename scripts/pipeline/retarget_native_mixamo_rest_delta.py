# retarget_native_mixamo_rest_delta.py — retarget Mixamo FBX motion onto a
# Meshy AUTO-RIGGED character (bones are NOT `mixamorig:*`) using the rest-delta
# transfer. THIS is the script used for the AlphaCode cyborg protagonist.
#
# ---------------------------------------------------------------------------
# REST-DELTA RETARGET (transfer the CHANGE from rest, never the absolute pose):
#
#     world_rot_target(t) = (world_rot_source(t) @ world_rot_source_rest^-1) @ world_rot_target_rest
#
# When the source sits at its rest (delta = identity) the target holds ITS rest
# — so a Meshy auto-rig whose bind pose differs wildly from Mixamo's still comes
# out clean (no arm splay / hunched torso). Hips get a SCALED world-translation
# delta; horizontal root motion is stripped for looping clips so the in-game
# ThirdPersonController owns travel. Each clip → a muted NLA track so the glTF
# exporter writes one separately-NAMED animation three.js reads by name.
#
# --absolute switches to copying the source's ABSOLUTE world rotation (only sane
# when the auto-rig happens to share Mixamo's rest orientation; kept as an
# escape hatch — rest-delta is the default and the correct fix).
# ---------------------------------------------------------------------------
#
# THE MAKE-OR-BREAK BONE MAP. The Meshy cyborg auto-rig uses a 24-joint biped
# whose SPINE CHAIN IS REVERSED relative to Mixamo:
#
#     Mixamo : Hips -> Spine  -> Spine1 -> Spine2 -> (Neck, Shoulders)   (ascending)
#     Cyborg : Hips -> Spine02 -> Spine01 -> Spine -> (neck, Shoulders)   (Spine = chest)
#
# so `Spine` (Mixamo, lowest) must map to `Spine02` (cyborg, lowest) and
# `Spine2` (Mixamo, chest) to `Spine` (cyborg, chest) — the naive name match
# (Spine2->Spine02) inverts the torso and hunches the character. The table
# below is anatomically ordered. Fingers/toe-ends have no cyborg target and are
# skipped; the cyborg's decorative `headfront` bone has no Mixamo source and
# stays at rest.
#
# Run (Blender hardcoded at /Applications/Blender.app/Contents/MacOS/Blender):
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#     --python scripts/pipeline/retarget_native_mixamo_rest_delta.py -- \
#     --char assets/build/characters-opt/cyborg.glb \
#     --out  assets/build/characters-final/cyborg.glb \
#     --fbx  "assets/source/mixamo/rifle aiming idle.fbx" --name idle --loop \
#     --fbx  "assets/source/mixamo/walking.fbx"           --name walk --loop \
#     [--absolute]
#
# Or with a JSON manifest (used by build_cast.mjs):
#   ... --manifest /tmp/cyborg.bake.json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C  # noqa: E402
from bake_character_anims import bake, parse_cli  # noqa: E402

# Mixamo <base name> → cyborg (Meshy auto-rig) bone name. Anatomically ordered:
# the SPINE is intentionally reversed to match the cyborg's chain direction.
CYBORG_BONE_MAP = {
    "Hips": "Hips",
    "Spine": "Spine02",    # lowest spine (child of Hips)  -- REVERSED
    "Spine1": "Spine01",   # mid spine
    "Spine2": "Spine",     # upper spine / chest (carries shoulders + neck) -- REVERSED
    "Neck": "neck",
    "Head": "Head",
    "HeadTop_End": "head_end",
    "LeftShoulder": "LeftShoulder",
    "LeftArm": "LeftArm",
    "LeftForeArm": "LeftForeArm",
    "LeftHand": "LeftHand",
    "RightShoulder": "RightShoulder",
    "RightArm": "RightArm",
    "RightForeArm": "RightForeArm",
    "RightHand": "RightHand",
    "LeftUpLeg": "LeftUpLeg",
    "LeftLeg": "LeftLeg",
    "LeftFoot": "LeftFoot",
    "LeftToeBase": "LeftToeBase",
    "RightUpLeg": "RightUpLeg",
    "RightLeg": "RightLeg",
    "RightFoot": "RightFoot",
    "RightToeBase": "RightToeBase",
}


def main():
    spec = parse_cli(C.script_args())
    bake(spec, name_map=CYBORG_BONE_MAP, absolute=bool(spec.get("absolute")),
         label="retarget_native_mixamo")


if __name__ == "__main__":
    main()
