# Third-Party Content and Provenance

AlphaCode's NeetCode 150 curriculum manifest uses third-party projects only
for factual problem metadata, reference solutions, and general data-structures
pedagogy. AlphaCode prompts, statements, examples, hints, assessments, and
explanations must be written originally.

## Reference solutions

**neetcode-gh/leetcode**

- Copyright: neetcode-gh contributors
- License: MIT
- Pinned revision:
  [`9907b7fed441fa55083c0751e208b7197101dbba`](https://github.com/neetcode-gh/leetcode/commit/9907b7fed441fa55083c0751e208b7197101dbba)
- License text:
  [LICENSE](https://github.com/neetcode-gh/leetcode/blob/9907b7fed441fa55083c0751e208b7197101dbba/LICENSE)
- Use: primary reference-solution source. This foundation manifest links to
  the repository but copies no source code.

## Pedagogy references

**OpenDSA**

- Copyright: Ville Karavirta, Clifford A. Shaffer, and contributors
- License: MIT
- Pinned revision:
  [`f4e4afcee2fcc0b47a888ebb5648c8ebb659c53c`](https://github.com/OpenDSA/OpenDSA/commit/f4e4afcee2fcc0b47a888ebb5648c8ebb659c53c)
- License text:
  [MIT-license.txt](https://github.com/OpenDSA/OpenDSA/blob/f4e4afcee2fcc0b47a888ebb5648c8ebb659c53c/MIT-license.txt)
- Use: background pedagogy for algorithms and data structures. AlphaCode
  teaching content must be independently phrased.

**Open Data Structures**

- Copyright: Pat Morin and Open Data Structures contributors
- License: Creative Commons Attribution 2.5 Canada
- Pinned revision:
  [`9d22c44906dda2017b2ef0c762025bee644b58aa`](https://github.com/patmorin/ods/commit/9d22c44906dda2017b2ef0c762025bee644b58aa)
- License text:
  [CC BY 2.5 Canada](https://creativecommons.org/licenses/by/2.5/ca/)
- Use: background pedagogy for foundational data structures. Adapted content
  must preserve attribution and be independently phrased.

## Curriculum-list verification

**th-blitz/NeetCode-150**

- Copyright: Preetham Rakshith Prakasha and contributors
- License: MIT
- Pinned revision:
  [`7c6bbaf82765ca726fd54756fe7b59ba2e14e140`](https://github.com/th-blitz/NeetCode-150/commit/7c6bbaf82765ca726fd54756fe7b59ba2e14e140)
- License text:
  [LICENSE](https://github.com/th-blitz/NeetCode-150/blob/7c6bbaf82765ca726fd54756fe7b59ba2e14e140/LICENSE)
- Use: independent public cross-check for curriculum membership and factual
  metadata. No statements or solution code are copied.

## Game art assets (Living Code City)

All 3D/2D art assets shipped under `public/assets/` are CC0 (public domain)
or MIT. Every file is declared in `src/content/assets/assetManifest.ts` with
its exact source URL, author, license, and byte size; the records below cover
the approved sources. Raw sources are fetched by
`scripts/fetch-starter-assets.mjs` and compressed by
`scripts/optimize-assets.mjs` (KTX2 textures, meshopt geometry).

**Poly Haven**

- Copyright: Poly Haven contributors (individual authors credited per asset
  in the manifest)
- License: CC0 1.0 Universal
- License text: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Site: [polyhaven.com](https://polyhaven.com/)
- Use: HDRI skies and PBR texture sets. Shipped in Phase 1:
  - HDRI [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) — Greg Zaal, Jarod Guest
  - HDRI [Moonless Golf](https://polyhaven.com/a/moonless_golf) — Greg Zaal
  - Textures [Asphalt 02](https://polyhaven.com/a/asphalt_02),
    [Concrete Wall 004](https://polyhaven.com/a/concrete_wall_004),
    [Red Brick 03](https://polyhaven.com/a/red_brick_03),
    [Park Dirt](https://polyhaven.com/a/park_dirt) — Rob Tuytel

**ambientCG**

- Copyright: Lennart Demes / ambientCG
- License: CC0 1.0 Universal
- License text: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Site: [ambientcg.com](https://ambientcg.com/)
- Use: approved source for additional PBR materials (facades, decals,
  surface imperfections) in later phases. No files shipped yet.

**Kenney**

- Copyright: Kenney (kenney.nl)
- License: CC0 1.0 Universal
- License text: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Site: [kenney.nl/assets](https://kenney.nl/assets)
- Use: approved source for props, UI icons, and low-poly kits in later
  phases. No files shipped yet.

**Quaternius**

- Copyright: Tomás Laulhé (Quaternius)
- License: CC0 1.0 Universal
- License text: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Site: [quaternius.com](https://quaternius.com/)
- Use: low-poly character/prop models. Shipped in Phase 1:
  - [Robot Expressive](https://quaternius.com/) (`RobotExpressive.glb`,
    conversion by Don McCurdy for the three.js examples; also re-encoded as
    `public/assets/models/robot-sentinel.glb`)

  Shipped in Phase 3:
  - `public/assets/models/citizen-bot.bin` — a derived crowd-animation
    bundle (merged geometry + baked bone-matrix clips) generated from the
    same CC0 Robot Expressive rig by `scripts/bake-citizen-anim.mjs` for the
    overworld's VAT pedestrian citizens.

**three.js example assets**

- Copyright: three.js authors
- License: MIT
- License text:
  [LICENSE](https://github.com/mrdoob/three/blob/master/LICENSE)
- Use: `Soldier.glb` (Mixamo-rigged soldier from the three.js examples) and
  the self-hosted DRACO/Basis decoder runtimes copied from
  `three/examples/jsm/libs/` into `/decoders/` at build time.

**Meshy AI generated assets (project-generated)**

- Copyright: project-owned — generated under a paid
  [Meshy AI](https://www.meshy.ai) plan (private ownership per Meshy
  paid-plan terms). These assets are **not** CC0/MIT and are not covered by
  the CC0 manifest above.
- Use: the 187 game-ready GLB models under `public/assets/meshy/` (street
  furniture, vehicles, nature, interactables, landmarks, dojo and boss-arena
  set dressing, buildings, rooftop/storefront kits, and the animated
  character rigs with their clip files), plus
  `public/assets/models/soldier-anims.glb` (bones-only animation retargets
  baked from Meshy hero clips by `scripts/bake-soldier-anims.mjs`; phase-2
  clip sources are raw-only under `assets-src/meshy/raw/`, documented in
  `assets-src/meshy/SOLDIER_CLIPS.md`). Generated by
  `scripts/meshy-generate.mjs` (Text to 3D v2, Meshy-6) and optimized by
  `scripts/meshy-optimize.mjs` (gltf-transform: dedup/prune/weld/simplify,
  KTX2 textures, meshopt compression).
- Provenance: per-asset prompts, Meshy task ids, and pipeline settings are
  recorded in `assets-src/meshy/MESHY_ASSETS.md`; the runtime license blocks
  live in `src/content/assets/meshyManifest.ts` (one per asset, byte-exact).

## Problem metadata and prohibited material

Problem titles, LeetCode slugs, difficulty labels, and canonical problem URLs
are recorded as factual metadata. Links to LeetCode are references only.
LeetCode problem statements and editorials are not included.

The following material must not be copied into AlphaCode:

- neetcode.io pages or API responses
- LeetCode problem statements or editorials
- NeetCode editorials or written explanations
- NeetCode or LeetCode video transcripts

NeetCode and LeetCode names are used descriptively. Their trademarks remain
the property of their respective owners.
