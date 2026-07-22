# _common.py — shared helpers for the AlphaCode Meshy→Blender→web pipeline.
#
# These functions are imported by every pipeline Blender script (they all run
# INSIDE Blender's bundled Python via `blender --background --python <script>`).
#
# Hardcoded Blender (macOS): /Applications/Blender.app/Contents/MacOS/Blender
# Every pipeline .py is invoked headless like:
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#       --python scripts/pipeline/<script>.py -- <args...>
#
# Conventions enforced here (shared by all scripts):
#   * read_factory_settings(use_empty=True)  — deterministic empty scene
#   * scene fps = 30
#   * GLB export is Y-up, JPEG textures (quality ~80-82), animations via
#     NLA_TRACKS with forced sampling (so three.js reads clips BY NAME).
#   * operator kwargs are filtered to what THIS Blender build supports, so the
#     scripts survive glTF/FBX exporter option renames across Blender versions.
import bpy
import sys
import os

FPS = 30
JPEG_QUALITY = 82
BLENDER_BIN = "/Applications/Blender.app/Contents/MacOS/Blender"


def script_args():
    """Return CLI args after the `--` separator (Blender ignores those)."""
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else []


def reset_scene():
    """Factory-reset to a deterministic empty scene at 30 fps."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.render.fps = FPS
    scn.render.fps_base = 1.0
    # Metric, 1 unit = 1 metre — matches glTF and keeps FBX scale sane.
    scn.unit_settings.system = "METRIC"
    scn.unit_settings.scale_length = 1.0


def _supported(op, kwargs):
    """Drop kwargs the current Blender build's operator doesn't expose."""
    try:
        props = set(op.get_rna_type().properties.keys())
    except Exception:
        return dict(kwargs)
    return {k: v for k, v in kwargs.items() if k in props}


def ensure_fbx_addon():
    """FBX IO is a bundled add-on/extension; enable it if the op is missing."""
    if hasattr(bpy.ops.import_scene, "fbx"):
        try:
            # Probe: poll() raises if the op truly isn't registered.
            bpy.ops.import_scene.fbx.poll()
            return
        except Exception:
            pass
    for name in ("io_scene_fbx", "bl_ext.blender_org.io_scene_fbx"):
        try:
            bpy.ops.preferences.addon_enable(module=name)
            return
        except Exception:
            continue


def import_asset(filepath):
    """Import a .glb/.gltf or .fbx into the current scene."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext in (".glb", ".gltf"):
        kw = _supported(bpy.ops.import_scene.gltf, dict(filepath=filepath, import_pack_images=True))
        bpy.ops.import_scene.gltf(**kw)
    elif ext == ".fbx":
        ensure_fbx_addon()
        # automatic_bone_orientation keeps Mixamo bone axes usable; global scale
        # 1.0 because we normalise units to metres in reset_scene().
        kw = _supported(
            bpy.ops.import_scene.fbx,
            dict(filepath=filepath, automatic_bone_orientation=True, use_anim=True, global_scale=1.0),
        )
        bpy.ops.import_scene.fbx(**kw)
    else:
        raise ValueError(f"unsupported input extension: {ext} ({filepath})")


def action_of(arm):
    """Best-effort single Action for an armature (FBX import may stash it on an
    NLA track rather than as the active action)."""
    ad = arm.animation_data
    if ad is None:
        return None
    if ad.action is not None:
        return ad.action
    for tr in ad.nla_tracks:
        for st in tr.strips:
            if st.action is not None:
                return st.action
    return None


def first_armature():
    for ob in bpy.data.objects:
        if ob.type == "ARMATURE":
            return ob
    return None


def all_armatures():
    return [ob for ob in bpy.data.objects if ob.type == "ARMATURE"]


def export_glb(filepath, animations=False, anim_mode="NLA_TRACKS", apply_modifiers=False):
    """Export the whole scene to a Y-up GLB with the pipeline conventions.

    animations=False  → skinned mesh + skeleton, NO clips (optimize passes).
    animations=True   → clips exported as NLA_TRACKS, force-sampled, so the
                        glTF writer emits one separately-NAMED animation per
                        track (three.js AnimationClip.findByName reads them).
    """
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    kwargs = dict(
        filepath=filepath,
        export_format="GLB",
        export_yup=True,
        export_apply=apply_modifiers,
        export_skins=True,
        export_morph=False,
        export_image_format="JPEG",
        export_jpeg_quality=JPEG_QUALITY,
        export_animations=animations,
        export_animation_mode=anim_mode,
        export_nla_strips=True,
        export_force_sampling=True,
        export_bake_animation=True,
        export_frame_range=False,
        export_optimize_animation_size=False,
        export_cameras=False,
        export_lights=False,
        use_visible=False,
    )
    kw = _supported(bpy.ops.export_scene.gltf, kwargs)
    bpy.ops.export_scene.gltf(**kw)
    size = os.path.getsize(filepath) if os.path.exists(filepath) else 0
    print(f"[pipeline] wrote {filepath}  ({size/1024:.1f} KB, animations={animations})")


def mesh_tri_count(evaluated=False):
    """Total triangle count across all meshes.

    evaluated=True counts the POST-modifier result (what export writes), via the
    dependency graph; False counts the raw base mesh.
    """
    total = 0
    deps = bpy.context.evaluated_depsgraph_get() if evaluated else None
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        src = ob.evaluated_get(deps) if evaluated else ob
        me = src.data
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
    return total


def decimate_meshes(target_tris):
    """Add a COLLAPSE decimate modifier to every mesh, budgeted to target_tris.

    Collapse preserves vertex groups (skin weights) and UVs, so skinned meshes
    stay riggable after the reduction.
    """
    before = mesh_tri_count()
    if before <= target_tris or before == 0:
        print(f"[pipeline] decimate skipped: {before} tris <= target {target_tris}")
        return before, before
    ratio = max(0.02, min(1.0, target_tris / before))
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        mod = ob.modifiers.new(name="pipeline_decimate", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
    print(f"[pipeline] decimate ratio={ratio:.4f} ({before} → ~{target_tris} tris target)")
    return before, target_tris


def shrink_textures(max_px=1024):
    """Downscale every image so its longest side is <= max_px.

    GLB-imported images are packed but NOT decoded, so img.size reads (0,0)
    until we touch the pixel buffer. We force a decode first (else 4K textures
    silently pass straight through — the bug that kept the gun at 28 MB)."""
    for img in bpy.data.images:
        # Force packed/embedded images to decode so .size is populated.
        if img.size[0] == 0:
            try:
                _ = len(img.pixels)  # triggers a lazy decode of the buffer
            except Exception:
                pass
        w, h = img.size[0], img.size[1]
        if w == 0 or h == 0:
            print(f"[pipeline] WARN image '{img.name}' has no decodable data — skipped")
            continue
        longest = max(w, h)
        if longest <= max_px:
            continue
        scale = max_px / longest
        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        try:
            img.scale(nw, nh)
            img.pack()  # re-pack from the scaled buffer so export writes the small one
            print(f"[pipeline] shrank image '{img.name}' {w}x{h} → {nw}x{nh}")
        except Exception as e:
            print(f"[pipeline] WARN could not scale '{img.name}': {e}")
