/* ============================================================================
   Per-realm boss-arena stage specs — pure data (no three/react imports).

   Owner directive: every realm fight gets its OWN arena identity, thematically
   matched to the boss, while staying inside the neon-night-city universe. The
   shared plaza bones (combat disk, boundary rail, skyline ring, rain) stay in
   BossArena; these specs recolor/relight them and pick the themed set
   dressing (RealmStageDressing.tsx renders the variant's props).

   Palette discipline: each stage owns ONE identity hue family distinct from
   its neighbours — Hider acid-green murk, Mimic ice-white glass, Golem amber
   worklights over violet, Gatekeeper gold stone, Beast rust-sodium, Sphinx
   lapis-and-gold marble.
   ========================================================================== */

export interface RealmStageSpec {
  /** Arena identity line shown under the boss name on the title card. */
  title: string
  /** Canvas clear color. */
  bg: string
  /** [color, near, far] — fog distance doubles as claustrophobia dial. */
  fog: [string, number, number]
  /** hemisphereLight args. */
  hemi: [string, string, number]
  ambient: number
  key: { color: string; intensity: number }
  fill: { color: string; intensity: number }
  /** Baked-IBL lightformer colors (key wash / cool rim / two horizon bands). */
  formers: { key: string; rim: string; horizonA: string; horizonB: string }
  /** Multiplier on every lightformer intensity (mirror floors need a much
   *  brighter environment to have anything to reflect). */
  formerBoost: number
  floor: {
    /** Outer city ground material. */
    outer: {
      color: string
      roughness: number
      metalness: number
      envMapIntensity: number
      /** Use the concrete detail maps instead of asphalt (quarry/marble). */
      concrete?: boolean
      /** Polished surface: near-flat normals + uniform roughness (no tiled
       *  detail grid) so the floor reads as marble/mirror, not gritty paving. */
      polished?: boolean
    }
    /** Inner combat-disk base color (accent pulse rides on top). */
    disk: string
  }
  skyline: { inner: number; countMul: number }
  /** Rain density multiplier over the quality-tier baseline (0 = dry). */
  rainMul: number
  embers: { color: string; count: number }
}

export const REALM_STAGES: RealmStageSpec[] = [
  // 0 — The Hider · Scanner Valley: a strangled back-alley pocket. Dense low
  // fog, acid-green murk, signage clutter pressing in close.
  {
    title: 'The Signal Alleys',
    bg: '#04070a',
    fog: ['#070d0b', 18, 74],
    hemi: ['#22352c', '#05080a', 0.42],
    ambient: 0.3,
    key: { color: '#cfe8b0', intensity: 0.85 },
    fill: { color: '#4d7a5e', intensity: 0.4 },
    formers: { key: '#b8ffb0', rim: '#3a5c4a', horizonA: '#b6ff5c', horizonB: '#ff5ad0' },
    formerBoost: 1.15,
    floor: {
      outer: { color: '#11151a', roughness: 0.42, metalness: 0.3, envMapIntensity: 1.7 },
      disk: '#12161b',
    },
    skyline: { inner: 46, countMul: 0.75 },
    rainMul: 1.2,
    embers: { color: '#9fb2a4', count: 45 },
  },
  // 1 — Mirror Mimic · Letter Lagoon: a mirrored glass atrium court. Bright,
  // cold, pristine — the one arena that is LIGHT instead of murky.
  {
    title: 'The Mirror Atrium',
    bg: '#131c28',
    fog: ['#22303f', 34, 130],
    hemi: ['#a8c4e0', '#2a3a4e', 1.05],
    ambient: 0.66,
    key: { color: '#f4f9ff', intensity: 2.1 },
    fill: { color: '#9fd0ff', intensity: 0.8 },
    formers: { key: '#ffffff', rim: '#9fe8ff', horizonA: '#36e0ff', horizonB: '#dff4ff' },
    // Modest boost + blurred floor reflections: at roughness 0.08 the mirror
    // floor reflected each IBL lightformer as a crisp white rect that crossed
    // the bloom threshold — QA read them as giant floating slabs. Brightness
    // now comes from the pale albedo + strong direct lights instead.
    formerBoost: 1.25,
    floor: {
      outer: { color: '#8fa3bd', roughness: 0.24, metalness: 0.55, envMapIntensity: 1.5, polished: true },
      disk: '#9db1c9',
    },
    skyline: { inner: 60, countMul: 1.15 },
    rainMul: 0,
    embers: { color: '#dff4ff', count: 60 },
  },
  // 2 — Twin-Key Golem · Memory Mines: a torn-up quarry / construction cut.
  // Amber worklights, dust, cracked concrete — heavy machinery world.
  {
    title: 'The Broken Quarry',
    bg: '#0a0708',
    fog: ['#120d0a', 24, 86],
    hemi: ['#4a3a2a', '#0c0806', 0.5],
    ambient: 0.24,
    key: { color: '#ffca7a', intensity: 1.0 },
    fill: { color: '#7a6aa8', intensity: 0.4 },
    formers: { key: '#ffb85c', rim: '#8a76c9', horizonA: '#ff9a3c', horizonB: '#b48cff' },
    formerBoost: 1,
    floor: {
      outer: { color: '#141110', roughness: 0.88, metalness: 0.08, envMapIntensity: 0.7, concrete: true },
      disk: '#16120f',
    },
    skyline: { inner: 66, countMul: 0.7 },
    rainMul: 0,
    embers: { color: '#ffb066', count: 90 },
  },
  // 3 — The Gatekeeper · Twin Bridges: the monumental city gate. Gold stone,
  // banner light, ceremonial symmetry.
  {
    title: 'The Great Gate',
    bg: '#0a0810',
    fog: ['#100c14', 28, 104],
    hemi: ['#4a3f5c', '#0d0a10', 0.5],
    ambient: 0.26,
    key: { color: '#ffdf9e', intensity: 1.1 },
    fill: { color: '#7a86c9', intensity: 0.45 },
    formers: { key: '#ffd98a', rim: '#8a96e8', horizonA: '#ffb44a', horizonB: '#e8c9ff' },
    formerBoost: 1,
    floor: {
      outer: { color: '#100e14', roughness: 0.4, metalness: 0.3, envMapIntensity: 1.6 },
      disk: '#14111a',
    },
    skyline: { inner: 62, countMul: 0.9 },
    rainMul: 0.6,
    embers: { color: '#ffd98a', count: 55 },
  },
  // 4 — Bracket Beast · Stack City: a collapsed industrial container yard.
  // Rust sodium-orange, hazard reds, broken structure.
  {
    title: 'The Rust Yards',
    bg: '#0a0605',
    fog: ['#120a06', 22, 82],
    hemi: ['#4d3226', '#0a0605', 0.46],
    ambient: 0.22,
    key: { color: '#ffb066', intensity: 0.85 },
    fill: { color: '#8a4a44', intensity: 0.42 },
    formers: { key: '#ff9a4d', rim: '#a84a3c', horizonA: '#ff5a3c', horizonB: '#ffb066' },
    formerBoost: 1,
    floor: {
      outer: { color: '#100b09', roughness: 0.6, metalness: 0.24, envMapIntensity: 1.1 },
      disk: '#130d0a',
    },
    skyline: { inner: 60, countMul: 0.65 },
    rainMul: 0.8,
    embers: { color: '#ff7a4a', count: 110 },
  },
  // 5 — Sorted Sphinx · Halving Heights: a gilded museum court. Polished
  // pale marble, gold trim, lapis-blue night sky — stately, not grimy.
  {
    title: 'The Gilded Court',
    bg: '#080a14',
    fog: ['#0d1020', 30, 112],
    hemi: ['#8080a8', '#2a2438', 0.75],
    ambient: 0.42,
    key: { color: '#ffe6b8', intensity: 1.5 },
    fill: { color: '#6a86e8', intensity: 0.5 },
    formers: { key: '#ffd98a', rim: '#7a96ff', horizonA: '#ffcf6a', horizonB: '#5aa8ff' },
    formerBoost: 1.25,
    floor: {
      outer: { color: '#b3a992', roughness: 0.18, metalness: 0.22, envMapIntensity: 2.0, polished: true },
      disk: '#c2b89f',
    },
    skyline: { inner: 64, countMul: 0.95 },
    rainMul: 0,
    embers: { color: '#ffdf9e', count: 60 },
  },
]

export function realmStage(variant: number): RealmStageSpec {
  return REALM_STAGES[variant % REALM_STAGES.length]
}
