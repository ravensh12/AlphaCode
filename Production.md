# AlphaCode — Production Notes

## §5 — Asset Pipeline: Meshy → Mixamo → Blender → Web

> **Meshy for meshes, Mixamo for motion, Blender for baking/optimizing.**

The player/NPC cast is built from three sources, each doing the one thing it is
best at:

- **Meshy** generates and auto-rigs the *character meshes* (and static props).
- **Mixamo** supplies the *motion* — a library of FBX clips on the shared
  `mixamorig` skeleton.
- **Blender** (headless) does the *baking and optimizing*: it decimates meshes,
  shrinks textures, and **rest-delta retargets** the Mixamo motion onto the
  Meshy rig, exporting one GLB per character with every clip named so the
  runtime can read it back by name.

Nothing is authored by hand: Meshy owns the look, Mixamo owns the movement,
Blender fuses them.

### Directory flow

```
assets/source/mixamo/*.fbx              # INPUT: Mixamo motion clips (mixamorig)
assets/source/characters/<name>/*.glb   # INPUT: Meshy auto-rigged character(s)
assets/source/weapons/*.glb             # INPUT: weapon meshes

assets/build/characters/<name>.glb          # raw Meshy-rigged (staged/generated)
assets/build/characters-opt/<name>.glb      # decimated ≤30k tris + textures ≤1024, anims OFF
assets/build/characters-final/<name>.glb    # mesh + skeleton + NAMED clips (retargeted)
assets/build/world/<name>.glb               # raw props/buildings
assets/build/world-opt/<name>.glb           # decimated props/buildings
assets/build/weapons/<name>.glb             # hard-optimized weapons (<~2 MB)
assets/build/anims/anim-library.glb         # every Mixamo clip on one master mixamorig

public/world/characters/<name>.glb          # FINAL web destination (synced)
public/world/weapons/<name>.glb
public/world/anims/anim-library.glb
```

> AlphaCode is **not** a monorepo, so Ram's `apps/web/public/world/` maps to this
> repo's real web root `public/world/`. That is the *only* deviation from the
> reference layout; every stage before it matches verbatim.

### `.mjs` (Node orchestrators) vs `.py` (Blender, headless)

All scripts live under `scripts/pipeline/`.

| Script | Kind | What it does |
| --- | --- | --- |
| `gen_character.mjs` | Node | Generate ONE rigged character with Meshy (reuses `scripts/meshy-generate.mjs`) → `assets/build/characters/`. |
| `batch_characters.mjs` | Node | Generate the whole rigged roster with Meshy, then hand off to `build_cast.mjs`. |
| `optimize_rigged.py` | Blender | Import a rigged GLB, decimate toward ~30k tris (collapse preserves skin weights), shrink textures ≤1024, re-export Y-up GLB **with animations OFF**. |
| `bake_character_anims.py` | Blender | The generic **rest-delta** retarget baker (configurable bone map + `--absolute`). |
| `retarget_native_mixamo_rest_delta.py` | Blender | Retarget Mixamo onto a **Meshy auto-rigged** character (bones NOT `mixamorig`). Carries the **cyborg bone map** (spine reversed — see below). This is what the cyborg uses. |
| `bake_native_mixamo_character.py` | Blender | Bake Mixamo clips onto a character that already wears the `mixamorig` skeleton (1:1 by name, no math). |
| `build_cast.mjs` | Node | Per-character orchestrator: `optimize_rigged` → bake, driven by a **`CAST_CLIPS`** subset (Mixamo file → game clip name, per character). |
| `gen_prop.mjs` | Node | Generate ONE static prop with Meshy (reuses `meshy-generate.mjs`) → `assets/build/world/`. |
| `batch_world.mjs` | Node | Run `optimize_world.py` over staged props/buildings **and weapons** (the tactical gun is hammered to <~2 MB). |
| `optimize_world.py` | Blender | Decimate non-skinned props (buildings ~40k, props ~15k), shrink textures, re-export. |
| `build_anims.py` | Blender | Stash every Mixamo clip as an NLA strip on ONE master `mixamorig` armature, drop meshes → `anim-library.glb`. |
| `sync_web.mjs` | Node | Copy finals into `public/world/`. **Refuses** to copy an animation-less GLB over the working cast (reads the glTF JSON chunk to count animations). |

Test/validation helpers (not shipped) live in `scripts/pipeline/tests/`:
`inspect_rigs.py`, `report_clips.py`, `make_synth_mixamo.py`, `verify_retarget.py`,
`verify_cyborg_retarget.py`.

### Blender conventions (in EVERY `.py`)

- Run headless: `blender --background --python <script>.py -- <args>`
  (Blender hardcoded at `/Applications/Blender.app/Contents/MacOS/Blender`,
  set in the `.mjs` orchestrators and `_common.py`).
- `wm.read_factory_settings(use_empty=True)` → deterministic empty scene.
- Scene **fps = 30**.
- Export **GLB, Y-up**, **JPEG** textures at quality **82**, animations via
  **`NLA_TRACKS`** with **forced sampling** (so the glTF writer emits one
  separately-named animation per clip).
- Args are read after the `--` separator; unsupported exporter kwargs are
  filtered per Blender build.

### The rest-delta bake (the correct fix)

For every matched bone we transfer the **change from rest**, never the absolute
pose:

```
world_rot_target(t) = (world_rot_source(t) @ world_rot_source_rest⁻¹) @ world_rot_target_rest
```

When the source sits at its rest (delta = identity) the target holds *its* rest,
so a Meshy auto-rig whose bind pose differs wildly from Mixamo's still comes out
clean — **no arm splay, no hunched torso**. The Hips additionally get a scaled
world-translation delta; horizontal root motion is stripped for looping clips so
the in-game `ThirdPersonController` owns travel. Each clip becomes a **muted NLA
track**, which is why the exported glTF carries separately-named animations.

### The cyborg bone map (make-or-break)

The Meshy cyborg auto-rig is a 24-joint biped whose **spine chain is reversed**
relative to Mixamo:

```
Mixamo : Hips → Spine   → Spine1  → Spine2 → (Neck, Shoulders)     (ascending)
Cyborg : Hips → Spine02 → Spine01 → Spine  → (neck, Shoulders)     (Spine = chest)
```

so the anatomically-correct map (in `retarget_native_mixamo_rest_delta.py`,
`CYBORG_BONE_MAP`) is:

| Mixamo | Cyborg | | Mixamo | Cyborg |
| --- | --- | --- | --- | --- |
| Hips | Hips | | LeftShoulder | LeftShoulder |
| **Spine** | **Spine02** | | LeftArm | LeftArm |
| Spine1 | Spine01 | | LeftForeArm | LeftForeArm |
| **Spine2** | **Spine** | | LeftHand | LeftHand |
| Neck | neck | | RightShoulder | RightShoulder |
| Head | Head | | RightArm | RightArm |
| HeadTop_End | head_end | | RightForeArm | RightForeArm |
| LeftUpLeg…RightToeBase | (1:1) | | RightHand | RightHand |

Fingers and `*Toe_End` have no cyborg target and are skipped; the cyborg's
decorative `headfront` bone has no Mixamo source and stays at rest. The naive
name match (`Spine2→Spine02`) would invert the torso and hunch the character —
this table is the fix.

### How the runtime consumes clips by name

`build_cast.mjs`'s `CAST_CLIPS` names the baked clips to match
`MeshyHero.tsx`'s animation vocabulary (`idle`, `walk`, `run`, `sprint`,
`strafeL`, `strafeR`, `back`, `jump`, `vault`, `shoot`, …). The runtime loads the
single `public/world/characters/cyborg.glb` (mesh + skeleton + clips) and resolves
each state with `THREE.AnimationClip.findByName(gltf.animations, '<state>')` — no
in-engine remap. One clip owns the body per state; states crossfade by eased
weight. The optimized tactical gun is loaded from
`public/world/weapons/tactical-machine-gun.glb` and parented to the cyborg's
`RightHand` bone (tunable `GUN_TUNE` offset), so it follows every animation.

### Commands

Per stage (Blender hardcoded):

```bash
BL=/Applications/Blender.app/Contents/MacOS/Blender

# optimize a rigged character
$BL --background --python scripts/pipeline/optimize_rigged.py -- \
  --in assets/build/characters/cyborg.glb \
  --out assets/build/characters-opt/cyborg.glb --tris 30000 --tex 1024

# retarget the Mixamo cast onto the cyborg (rest-delta, cyborg bone map)
$BL --background --python scripts/pipeline/retarget_native_mixamo_rest_delta.py -- \
  --char assets/build/characters-opt/cyborg.glb \
  --out  assets/build/characters-final/cyborg.glb \
  --fbx "assets/source/mixamo/rifle aiming idle.fbx" --name idle --loop \
  --fbx "assets/source/mixamo/walking.fbx"           --name walk --loop  # …etc

# optimize world props / weapons
node scripts/pipeline/batch_world.mjs --only tactical-machine-gun

# shared animation library
$BL --background --python scripts/pipeline/build_anims.py -- \
  --src assets/source/mixamo --out assets/build/anims/anim-library.glb
```

End-to-end (what the production pass runs):

```bash
node scripts/pipeline/batch_world.mjs --only tactical-machine-gun   # gun → <2 MB
node scripts/pipeline/build_cast.mjs  --only cyborg                  # optimize + retarget
node scripts/pipeline/sync_web.mjs                                  # → public/world/
```

### Dropping new inputs

- **Mixamo clips** → `assets/source/mixamo/*.fbx` (download "In Place",
  30 fps, "With Skin" or skeleton-only — both work; bones must be `mixamorig:*`).
- **A weapon** → `assets/source/weapons/*.glb`.
- **A new Meshy character** → `assets/build/characters/<name>.glb`, then add a
  `CAST` entry (+ its bone map if it isn't the cyborg naming) in `build_cast.mjs`.

Then, to rebuild everything and swap it into the game:

```bash
node scripts/pipeline/batch_world.mjs      # (re)optimize any staged weapon/props
node scripts/pipeline/build_cast.mjs       # optimize + retarget the whole cast
node scripts/pipeline/build_anims.py       # (via Blender) refresh the anim library
node scripts/pipeline/sync_web.mjs         # publish to public/world/
npm run build                              # ship
```
