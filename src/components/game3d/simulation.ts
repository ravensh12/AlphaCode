import * as THREE from 'three'
import { CHECKPOINTS_3D } from './layout'

/* ============================================================================
   THE LIVING SIMULATION — the shared shader language of Code City.

   Lore: the endgame reveals Code City is a program authored by The Architect.
   This module makes that visible everywhere: distant buildings render as
   compiling holograms, roads carry data pulses, the horde de-rezzes on death.

   Architecture (perf-critical, do not regress):
   - ONE set of shared uniform objects (`SIM`). Every patched material points
     at the same objects, and <SimulationDriver> writes them ONCE per frame.
     No per-material updates, no React state, zero per-frame allocations.
   - Materials are patched via onBeforeCompile so they keep the full
     MeshStandardMaterial lighting/instancing pipeline. One material per
     family — never per-object.
   - Everything animates off `uSimTime` / `uSimNight` clock uniforms; the CPU
     does no per-frame work for any of these effects.
   ========================================================================== */

/** How far out geometry is fully holographic / fully solid (meters). */
export const HOLO_SOLID_DIST = 35
export const HOLO_FULL_DIST = 62

/** Shared fog palette: day haze vs the night "corruption" fog. The sky dome
 *  blends its horizon to these, and the overworld lerps its scene fog between
 *  them off the same night uniform, so sky and fog always agree. */
export const FOG_DAY = '#c6d4e0'
export const FOG_NIGHT = '#170b20'

/** Fog distances across the day↔night blend (driven by SimulationDriver):
 *  day is a clear morning haze; night closes in like a wall. */
export const FOG_NEAR_DAY = 48
export const FOG_FAR_DAY = 238
export const FOG_NEAR_NIGHT = 26
export const FOG_FAR_NIGHT = 168

/**
 * One TRUE sun direction shared by the sky dome (disc + Mie haze), the baked
 * environment light and the shadow-casting FollowLight, so the highlight on
 * every surface, the shadows on the ground and the disc in the sky all agree.
 * ~42° elevation — low enough for long, readable shadows.
 */
export const SUN_DIR = new THREE.Vector3(34, 38, 24).normalize()

const TINT_COUNT = CHECKPOINTS_3D.length

/**
 * Shared uniforms. `time`/`night` are driven once per frame by
 * <SimulationDriver>; `holo` / `fx` are quality-tier gates (0 = off).
 */
export const SIM = {
  /** Scene clock, seconds. */
  time: { value: 0 } as THREE.IUniform<number>,
  /** 0 = day … 1 = night ("system corruption"). Smoothly lerped. */
  night: { value: 0 } as THREE.IUniform<number>,
  /** Hologram-resolve master gate (0 on LOW tier). */
  holo: { value: 1 } as THREE.IUniform<number>,
  /** Extra-flourish gate (aurora, sky glitch bands): 0 LOW, 0.6 MED, 1 HIGH. */
  fx: { value: 1 } as THREE.IUniform<number>,
  /** District tint fields: xyz = (x, z, radius) in world meters. */
  tintPos: {
    value: CHECKPOINTS_3D.map((c) => new THREE.Vector3(c.flag.x, c.flag.z, 190)),
  } as THREE.IUniform<THREE.Vector3[]>,
  /** District accent colors (strong theme accents, linear-ish via Color). */
  tintCol: {
    value: CHECKPOINTS_3D.map((c) => new THREE.Color(c.world.theme.accent)),
  } as THREE.IUniform<THREE.Color[]>,
}

/**
 * GLSL helpers shared by every simulation shader: the district tint field
 * (accent-colored energy near each Academy, "simulation cyan" elsewhere,
 * corrupted red-magenta at night) plus the shared uniform declarations.
 */
const SIM_PARS = /* glsl */ `
uniform float uSimTime;
uniform float uSimNight;
uniform vec3 uSimTintPos[${TINT_COUNT}];
uniform vec3 uSimTintCol[${TINT_COUNT}];
vec3 simDistrictTint( vec2 xz ) {
  vec3 col = vec3( 0.30, 0.80, 1.0 );
  for ( int i = 0; i < ${TINT_COUNT}; i ++ ) {
    vec3 p = uSimTintPos[ i ];
    float k = 1.0 - smoothstep( p.z * 0.45, p.z, distance( xz, p.xy ) );
    col = mix( col, uSimTintCol[ i ], k * 0.9 );
  }
  return mix( col, vec3( 1.0, 0.24, 0.40 ), uSimNight * 0.55 );
}
`

/** Wire the shared uniform objects into a freshly compiled program. */
function bindSimUniforms(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uSimTime = SIM.time
  shader.uniforms.uSimNight = SIM.night
  shader.uniforms.uSimHolo = SIM.holo
  shader.uniforms.uSimFx = SIM.fx
  shader.uniforms.uSimTintPos = SIM.tintPos
  shader.uniforms.uSimTintCol = SIM.tintCol
}

/** Vertex-side: carry the (instancing-aware) world position to the fragment. */
const WORLDPOS_VERTEX_PARS = 'varying vec3 vSimWorldPos;'
const WORLDPOS_VERTEX = /* glsl */ `
{
  vec4 simWP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    simWP = instanceMatrix * simWP;
  #endif
  vSimWorldPos = ( modelMatrix * simWP ).xyz;
}
`

/**
 * M2 — world-space UVs: re-project every detail map onto the ground plane by
 * world position so one small tiling texture covers every road strip evenly,
 * whatever its size. `scale` = repeats per meter (e.g. 1/6 → 6m tiles).
 */
function worldUvVertex(scale: number): string {
  // NOTE: uv_vertex runs before begin_vertex, so `transformed` doesn't exist
  // yet — project the raw position attribute instead.
  return /* glsl */ `
#include <uv_vertex>
{
  vec4 simWuv4 = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
    simWuv4 = instanceMatrix * simWuv4;
  #endif
  vec2 simWuv = ( modelMatrix * simWuv4 ).xz * ${scale.toFixed(5)};
  #ifdef USE_MAP
    vMapUv = simWuv;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv = simWuv;
  #endif
  #ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv = simWuv;
  #endif
}
`
}

/* ------------------------------------------------------- Hologram resolve */

/**
 * M2 — LIT OFFICES. Extension of the building-facade patch: the emissive
 * window map stops being a constant glow and becomes a living office grid.
 * Each window cell (position hashed with the building's world location) keeps
 * its own schedule — some stay dark, late-night floors flick on and off over
 * minutes — and the whole field swells with `uSimNight` so dusk reads as a
 * thousand offices lighting up. Pure fragment math on the existing emissive
 * sample; zero CPU, zero extra draws.
 */
const OFFICE_WINDOWS_FRAGMENT = /* glsl */ `
#include <emissivemap_fragment>
#ifdef USE_EMISSIVEMAP
{
  vec2 simCell = floor( vec2( vEmissiveMapUv.x * 5.0, vEmissiveMapUv.y * 11.0 ) );
  vec2 simBld = floor( vSimWorldPos.xz * 0.043 );
  float simWSeed = fract( sin( dot( simCell + simBld * 7.31, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  // Each office toggles on its own slow schedule (offset so they never sync).
  float simTick = floor( uSimTime * 0.055 + simWSeed * 9.0 );
  float simOnR = fract( simWSeed * 61.7 + simTick * 0.618 );
  float simOn = step( simOnR, 0.38 + uSimNight * 0.5 );
  float simFlick = 1.0 + 0.06 * sin( uSimTime * ( 5.0 + simWSeed * 8.0 ) + simWSeed * 40.0 );
  totalEmissiveRadiance *= ( 0.16 + uSimNight * 1.55 ) * simOn * simFlick;
}
#endif
`

/**
 * M1 — HOLOGRAM-COMPILE WORLD. Patch a MeshStandardMaterial family (the city
 * buildings) so distant geometry renders as glowing scanline holograms that
 * visibly "compile" into solid architecture as the player approaches:
 *  - beyond ~62m: pure structured light (district-tinted scanlines + fresnel
 *    edge glow + a compile line marching up the facade)
 *  - a bright materialize shimmer band right at the resolve front (~38m)
 *  - inside 35m: the ordinary solid material, untouched.
 * Cost: a few fragment ALU ops; zero CPU, zero extra draw calls. `uSimHolo`
 * (LOW tier) collapses the whole effect to a single uniform branch.
 *
 * `officeWindows` additionally routes the emissive map through the living
 * office-light grid (see OFFICE_WINDOWS_FRAGMENT) — body facades only.
 */
export function applyHologramResolve<T extends THREE.Material>(
  mat: T,
  officeWindows = false,
): T {
  mat.onBeforeCompile = (shader) => {
    bindSimUniforms(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    if (officeWindows) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        OFFICE_WINDOWS_FRAGMENT,
      )
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vSimWorldPos;\nuniform float uSimHolo;\n${SIM_PARS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  float simD = distance( vSimWorldPos, cameraPosition );
  float simH = smoothstep( ${HOLO_SOLID_DIST.toFixed(1)}, ${HOLO_FULL_DIST.toFixed(1)}, simD ) * uSimHolo;
  if ( simH > 0.001 ) {
    vec3 simTint = simDistrictTint( vSimWorldPos.xz );
    vec3 simN = normalize( normal );
    vec3 simV = normalize( vViewPosition );
    float simFres = pow( 1.0 - abs( dot( simN, simV ) ), 2.0 );
    float simScan = 0.55 + 0.45 * sin( vSimWorldPos.y * ( 2.2 + uSimNight * 1.4 ) - uSimTime * 3.0 );
    float simTick = step( 0.92, fract( vSimWorldPos.y * 0.16 - uSimTime * 0.22 + vSimWorldPos.x * 0.002 ) );
    vec3 simHoloCol = simTint * ( 0.15 + ( 0.40 + 0.34 * uSimNight ) * simScan )
      + simTint * simFres * 1.6
      + simTint * simTick * 0.6;
    outgoingLight = mix( outgoingLight, simHoloCol, simH );
  }
  float simBand = ( 1.0 - smoothstep( 0.0, 7.0, abs( simD - ${(HOLO_SOLID_DIST + 3).toFixed(1)} ) ) ) * uSimHolo;
  if ( simBand > 0.001 ) {
    float simShimmer = 0.7 + 0.3 * sin( uSimTime * 12.0 + vSimWorldPos.y * 2.4 + vSimWorldPos.x * 0.5 );
    outgoingLight += simDistrictTint( vSimWorldPos.xz ) * simBand * simShimmer * ( 0.55 + 0.4 * uSimNight );
  }
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => (officeWindows ? 'sim-holo-office-v2' : 'sim-holo-v2')
  return mat
}

/* ------------------------------------------------------- Road data pulses */

/**
 * M3 — DATA-PULSE ROAD NETWORK. Patch the shared asphalt material so every
 * avenue carries the city's "data traffic": two emissive rails per road with
 * bright packets racing along them, tinted by the district accent field and
 * shifting to warning red as night corruption rises. The road grid is
 * analytic (74m pitch), so the whole effect is a few fract/mod ops in the
 * fragment shader — zero CPU, zero extra draw calls, one shared material.
 *
 * `worldUvScale` (repeats/meter) re-projects the material's detail maps in
 * world space so the asphalt PBR maps tile seamlessly across every strip.
 */
export function applyRoadPulse<T extends THREE.Material>(mat: T, worldUvScale = 0): T {
  mat.onBeforeCompile = (shader) => {
    bindSimUniforms(shader)
    if (worldUvScale > 0) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        worldUvVertex(worldUvScale),
      )
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vSimWorldPos;\nuniform float uSimFx;\n${SIM_PARS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  vec2 simXZ = vSimWorldPos.xz;
  float simDx = abs( mod( simXZ.x + 37.0, 74.0 ) - 37.0 );
  float simDz = abs( mod( simXZ.y + 37.0, 74.0 ) - 37.0 );
  float simLaneV = 1.0 - smoothstep( 0.14, 0.36, abs( simDx - 5.2 ) );
  float simLaneH = 1.0 - smoothstep( 0.14, 0.36, abs( simDz - 5.2 ) );
  float simSpd = 0.55 + uSimNight * 0.35;
  float simPv = smoothstep( 0.84, 0.985, fract( simXZ.y * 0.048 - uSimTime * simSpd ) );
  float simPh = smoothstep( 0.84, 0.985, fract( simXZ.x * 0.048 + uSimTime * simSpd ) );
  float simAmt = max( simLaneV * ( 0.06 + simPv ), simLaneH * ( 0.06 + simPh ) );
  simAmt *= ( 0.55 + 0.45 * uSimFx ) * ( 1.0 + uSimNight * 0.9 );
  outgoingLight += simDistrictTint( simXZ ) * simAmt * 1.7;
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => `sim-road-v2:${worldUvScale.toFixed(5)}`
  return mat
}

/**
 * M3b — centre-line dashes join the data-traffic system: at rest they dim to
 * faint tick marks; when a packet sweeps past (same phase as the asphalt
 * rails) they ignite in the district tint. Works on MeshBasicMaterial.
 */
export function applyDashPulse<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    bindSimUniforms(shader)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vSimWorldPos;\n${SIM_PARS}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  vec2 simXZ = vSimWorldPos.xz;
  float simDx = abs( mod( simXZ.x + 37.0, 74.0 ) - 37.0 );
  float simDz = abs( mod( simXZ.y + 37.0, 74.0 ) - 37.0 );
  float simSpd = 0.55 + uSimNight * 0.35;
  float simP = simDx < simDz
    ? smoothstep( 0.80, 0.985, fract( simXZ.y * 0.048 - uSimTime * simSpd ) )
    : smoothstep( 0.80, 0.985, fract( simXZ.x * 0.048 + uSimTime * simSpd ) );
  outgoingLight = mix( outgoingLight * 0.5, simDistrictTint( simXZ ) * 2.2, simP );
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-dash-v1'
  return mat
}

/* ------------------------------------------------------- Night street life */

/**
 * M3 — fade a transparent glow mesh (streetlight cones, ground light pools)
 * in with dusk: alpha rides uSimNight², so the street lighting blooms on
 * late in the sunset instead of ghosting at noon. Uniform-driven; zero CPU.
 */
export function applyNightFade<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimNight = SIM.night
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSimNight;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a *= uSimNight * uSimNight;',
      )
  }
  mat.customProgramCacheKey = () => 'sim-nightfade-v1'
  return mat
}

/**
 * M3 — emissive fixtures (streetlight heads) dim to a pilot glow by day and
 * flare up as the corruption night rolls in.
 */
export function applyNightEmissive<T extends THREE.Material>(
  mat: T,
  dayLevel = 0.12,
  nightLevel = 1.8,
): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimNight = SIM.night
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSimNight;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix( ${dayLevel.toFixed(3)}, ${nightLevel.toFixed(3)}, uSimNight );`,
      )
  }
  mat.customProgramCacheKey = () => `sim-nightem-v1:${dayLevel}:${nightLevel}`
  return mat
}

/**
 * M3 — traffic signals actually CYCLE: each intersection runs its own
 * green→amber→red schedule (phase hashed from world position), brighter
 * after dark. Replaces the head's static emissive; all in the fragment
 * shader, one shared material, zero CPU.
 */
export function applyTrafficCycle<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimTime = SIM.time
    shader.uniforms.uSimNight = SIM.night
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSimWorldPos;\nuniform float uSimTime;\nuniform float uSimNight;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
#include <emissivemap_fragment>
{
  float simSeed = fract( sin( dot( floor( vSimWorldPos.xz / 37.0 ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  float simPh = fract( uSimTime / 11.0 + simSeed );
  vec3 simSig = simPh < 0.46 ? vec3( 0.12, 1.0, 0.30 )
    : simPh < 0.58 ? vec3( 1.0, 0.62, 0.08 )
    : vec3( 1.0, 0.10, 0.10 );
  totalEmissiveRadiance = simSig * ( 0.8 + uSimNight * 1.5 );
}`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-traffic-v1'
  return mat
}

/**
 * M3 — gentle wind sway for instanced foliage: canopy tops circle a few
 * centimeters, phase-offset per instance from its matrix translation, so the
 * greenery never reads as frozen plastic. Vertex-only; zero CPU.
 */
export function applyTreeSway<T extends THREE.Material>(mat: T, amp = 0.055): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimTime = SIM.time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSimTime;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec2 simIP = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
  #else
    vec2 simIP = vec2( 0.0 );
  #endif
  float simPh = uSimTime * 1.25 + dot( simIP, vec2( 0.131, 0.173 ) );
  float simBend = max( 0.0, transformed.y - 1.5 ) * ${amp.toFixed(4)};
  transformed.x += sin( simPh ) * simBend;
  transformed.z += cos( simPh * 0.83 ) * simBend;
}`,
      )
  }
  mat.customProgramCacheKey = () => `sim-sway-v1:${amp}`
  return mat
}

/* ---------------------------------------------------- Glitch death dissolve */

/**
 * M4 — GLITCH DEATH DISSOLVE. Zombies are corrupted data, so death de-rezzes
 * them: a chunky object-space noise-threshold discard driven by a per-instance
 * `aDissolve` progress attribute (0 alive → 1 fully de-rezzed), with a
 * channel-split (chromatic) emissive burst along the dissolve front. Layered
 * on top of the existing die animation — gameplay timing untouched. Living
 * instances (aDissolve = 0) skip the whole block.
 */
export function applyGlitchDissolve<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimNight = SIM.night
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nattribute float aDissolve;\nvarying float vSimDis;\nvarying vec3 vSimLocal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvSimDis = aDissolve;\nvSimLocal = position;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying float vSimDis;
varying vec3 vSimLocal;
uniform float uSimNight;
float simHash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
if ( vSimDis > 0.001 ) {
  float simH = simHash13( floor( vSimLocal * 9.0 ) + 0.5 );
  if ( simH < vSimDis ) discard;
  float simEr = 1.0 - smoothstep( 0.0, 0.24, simH - vSimDis );
  float simEg = 1.0 - smoothstep( 0.0, 0.12, simH - vSimDis );
  float simEb = 1.0 - smoothstep( 0.0, 0.34, simH - vSimDis );
  float simBurst = sin( min( vSimDis * 2.2, 1.0 ) * 3.14159 );
  vec3 simEdge = mix( vec3( simEr * 1.2, simEg * 2.4, simEb * 2.8 ),
    vec3( simEr * 2.8, simEg * 0.9, simEb * 1.6 ), uSimNight );
  outgoingLight += simEdge * simBurst;
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-derez-v1'
  return mat
}

/* --------------------------------------------------------------- Rim light */

/** Live handle to a rim-lit material's uniforms (mutate, never reassign). */
export type RimHandle = {
  color: THREE.Color
  strength: THREE.IUniform<number>
}

const RIM_KEY = '__simRim'

/**
 * M7 — CHARACTER RIM / FRESNEL. Adds a view-dependent additive rim so
 * silhouettes pop against the denser sky/city. Works on standard + physical
 * materials (lit pipeline preserved). The returned material carries a
 * {@link RimHandle} in userData so bosses can retune color/strength per phase
 * at zero recompile cost — see {@link rimHandleOf}.
 */
export function applyRimLight<T extends THREE.Material>(
  mat: T,
  color: THREE.ColorRepresentation = '#7fd8ff',
  strength = 0.4,
): T {
  const handle: RimHandle = { color: new THREE.Color(color), strength: { value: strength } }
  mat.userData[RIM_KEY] = handle
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimRimCol = { value: handle.color }
    shader.uniforms.uSimRimStr = handle.strength
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uSimRimCol;\nuniform float uSimRimStr;',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  float simRim = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 3.0 );
  outgoingLight += uSimRimCol * simRim * uSimRimStr;
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-rim-v1'
  return mat
}

/** Fetch the rim handle installed by {@link applyRimLight} (null if absent). */
export function rimHandleOf(mat: THREE.Material): RimHandle | null {
  const h = mat.userData[RIM_KEY] as RimHandle | undefined
  return h ?? null
}

/* ------------------------------------------------------- Arena floor pulse */

/**
 * M8 — arena floors join the data-traffic language: concentric accent-colored
 * energy rings radiate from the arena center (world origin), like the floor is
 * streaming the fight to The Architect. Clock-uniform driven; one material.
 */
export function applyArenaPulse<T extends THREE.Material>(
  mat: T,
  color: THREE.ColorRepresentation,
): T {
  const uCol = { value: new THREE.Color(color) }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimTime = SIM.time
    shader.uniforms.uSimArenaCol = uCol
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSimWorldPos;\nuniform float uSimTime;\nuniform vec3 uSimArenaCol;',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  float simR = length( vSimWorldPos.xz );
  float simRing = smoothstep( 0.86, 0.99, fract( simR * 0.16 - uSimTime * 0.4 ) );
  float simGrid = max(
    smoothstep( 0.93, 1.0, abs( fract( vSimWorldPos.x * 0.25 ) - 0.5 ) * 2.0 ),
    smoothstep( 0.93, 1.0, abs( fract( vSimWorldPos.z * 0.25 ) - 0.5 ) * 2.0 ) );
  float simFade = 1.0 - smoothstep( 4.0, 18.0, simR );
  outgoingLight += uSimArenaCol * ( simRing * 0.7 + simGrid * 0.12 ) * simFade;
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-arena-v1'
  return mat
}
