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

/** How far out geometry is fully holographic / fully solid (meters).
 *  These defaults are the CLOSE-IN cinematic values (IntroCinematic's ruined
 *  skyline "still being written"). The open-world city uses the pushed-out
 *  HOLO_CITY_* pair below so the mid-range reads as real architecture. */
export const HOLO_SOLID_DIST = 35
export const HOLO_FULL_DIST = 62

/** Realism rebuild: in the overworld the compile-hologram identity retreats
 *  to the far background — solid PBR facades own everything under ~150m and
 *  the scanline holograms only tint the skyline near the fog line. */
export const HOLO_CITY_SOLID_DIST = 150
export const HOLO_CITY_FULL_DIST = 260

/** Shared fog palette: day haze vs the night fog. The sky dome blends its
 *  horizon to these, and the overworld lerps its scene fog between them off
 *  the same night uniform, so sky and fog always agree.
 *  NYC-at-night rebuild: the night fog is a deep blue-black (moody metropolis
 *  air) instead of the old violet corruption soup — the corruption identity
 *  now lives in the DEEP-night band only (see NIGHT_DEEP_EDGE). */
export const FOG_DAY = '#c6d4e0'
export const FOG_NIGHT = '#0d1322'

/**
 * NYC AT NIGHT — the overworld's permanent visual identity (owner direction,
 * July 2026): the city always reads as a moody neon night metropolis. The
 * day/night GAMEPLAY cycle survives untouched (nightfall horde, shelters,
 * mission gating) but the calm phase now idles at this ambient floor instead
 * of full daylight: lit windows, lamp pools and neon carry every frame.
 * SimulationDriver eases SIM.night between the floor (calm) and 1 (horde).
 */
export const NIGHT_AMBIENT_FLOOR = 0.62

/** Where the "corruption" flourishes (red tint, nebula, glitch bands) start
 *  ramping in: only the deep-night horde phase reads corrupted — the calm
 *  night city stays a clean blue-black NYC. */
export const NIGHT_DEEP_EDGE = 0.78

/** Remap of the shared night blend that treats the ambient floor as "fully
 *  night" for lighting/emissive purposes (floor → 1, day 0 → 0). Arenas and
 *  cinematics that idle at night=0 are untouched by the remap. */
const NIGHT_LIT_GLSL = 'smoothstep( 0.0, 0.60, uSimNight )'

/** Fog distances across the day↔night blend (driven by SimulationDriver).
 *  LEGACY: the pre-rebuild wall (LOW keeps it — pinned look/cost contract).
 *  CLEAR: the realism-rebuild air for MEDIUM+ — a light morning haze that
 *  lets the skyline read to the horizon, and a night that stays dark but
 *  readable instead of closing to a violet soup at 168m. */
export const FOG_NEAR_DAY = 48
export const FOG_FAR_DAY = 238
export const FOG_NEAR_NIGHT = 26
export const FOG_FAR_NIGHT = 168
export const FOG_CLEAR_NEAR_DAY = 135
export const FOG_CLEAR_FAR_DAY = 460
export const FOG_CLEAR_NEAR_NIGHT = 85
export const FOG_CLEAR_FAR_NIGHT = 380

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
  /** Weather: 0 = dry … 1 = full rain front. Eased by SimulationDriver. */
  rain: { value: 0 } as THREE.IUniform<number>,
  /** Lightning flash envelope (0..~1), written by the weather system. */
  flash: { value: 0 } as THREE.IUniform<number>,
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
  // Corruption red belongs to the DEEP-night horde phase only — the calm
  // neon night keeps its cool accent language.
  float simDeepN = smoothstep( ${NIGHT_DEEP_EDGE.toFixed(2)}, 1.0, uSimNight );
  return mix( col, vec3( 1.0, 0.24, 0.40 ), simDeepN * 0.55 );
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
  float simNightLit = ${NIGHT_LIT_GLSL};
  float simThresh = 0.38 + simNightLit * 0.5;
  float simOn = step( simOnR, simThresh );
  // Half-lit band just past the cutoff (desk lamp / TV rooms) + per-window
  // brightness spread, so the lit grid never reads as a binary checkerboard.
  float simDim = ( 1.0 - simOn ) * step( simOnR, simThresh + 0.16 ) * 0.28;
  float simLevel = simOn * ( 0.55 + 0.45 * fract( simWSeed * 13.7 ) ) + simDim;
  float simFlick = 1.0 + 0.06 * sin( uSimTime * ( 5.0 + simWSeed * 8.0 ) + simWSeed * 40.0 );
  totalEmissiveRadiance *= ( 0.16 + simNightLit * 1.55 ) * simLevel * simFlick;
}
#endif
`

/** Hologram range presets: the overworld pushes the compile front to the far
 *  skyline (realism rebuild); cinematics keep the original close-in front. */
export type HoloRange = 'city' | 'close'

function holoRangeDists(range: HoloRange): { solid: number; full: number } {
  return range === 'close'
    ? { solid: HOLO_SOLID_DIST, full: HOLO_FULL_DIST }
    : { solid: HOLO_CITY_SOLID_DIST, full: HOLO_CITY_FULL_DIST }
}

/**
 * The hologram-compile block, shared by applyHologramResolve (legacy facades,
 * roofs) and applyFacadeAtlas (Phase 3 facades) so the Living Simulation's
 * signature effect survives the re-skin byte-for-byte. In the 'city' range
 * the effect also fades its own mix-in (holograms tint the skyline instead of
 * replacing it) so the far city keeps its lit-window silhouettes.
 */
function holoOpaqueBlock(range: HoloRange): string {
  const { solid, full } = holoRangeDists(range)
  // The city range caps the hologram override so distant facades stay legible
  // architecture with a scanline energy over them; cinematics keep the full
  // replace (the "still compiling" story beat needs it). NYC-at-night: the
  // permanent night city retreats the scanline wash to a whisper — the lit
  // windows own the skyline — while the deep horde band brings it back hot.
  const maxMix = range === 'close' ? '1.0' : '0.62'
  const nightDamp =
    range === 'close'
      ? '1.0'
      : `mix( 1.0, 0.06 + 0.66 * smoothstep( ${NIGHT_DEEP_EDGE.toFixed(2)}, 1.0, uSimNight ), ${NIGHT_LIT_GLSL} )`
  return /* glsl */ `
{
  float simD = distance( vSimWorldPos, cameraPosition );
  float simNDamp = ${nightDamp};
  float simH = smoothstep( ${solid.toFixed(1)}, ${full.toFixed(1)}, simD ) * uSimHolo * ${maxMix} * simNDamp;
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
  float simBand = ( 1.0 - smoothstep( 0.0, 7.0, abs( simD - ${(solid + 3).toFixed(1)} ) ) ) * uSimHolo * simNDamp;
  if ( simBand > 0.001 ) {
    float simShimmer = 0.7 + 0.3 * sin( uSimTime * 12.0 + vSimWorldPos.y * 2.4 + vSimWorldPos.x * 0.5 );
    outgoingLight += simDistrictTint( vSimWorldPos.xz ) * simBand * simShimmer * ( ${range === 'close' ? '0.55 + 0.4 * uSimNight' : '( 0.16 + 0.22 * uSimNight )'} );
  }
}
#include <opaque_fragment>`
}

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
  range: HoloRange = 'city',
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
      .replace('#include <opaque_fragment>', holoOpaqueBlock(range))
  }
  mat.customProgramCacheKey = () =>
    `${officeWindows ? 'sim-holo-office-v4' : 'sim-holo-v4'}:${range}`
  return mat
}

/* ------------------------------------------------------ Facade atlas (P3) */

/** Textures the facade-atlas patch samples (see facadeAtlas.ts). */
export interface FacadeAtlasPatchMaps {
  map: THREE.Texture
  emissive: THREE.Texture
  data: THREE.Texture
  rooms: THREE.Texture
}

/**
 * Phase 3 — THE FACADE SYSTEM. Replaces the stretched 96×192 facade with a
 * meter-space projection of an 8-style atlas, per-instance styled, with the
 * flagship parallax interior-mapped windows:
 *
 * - The vertex stage measures each face in METERS (instance scale × unit-box
 *   position) and divides by the bay/floor rhythm (2.6m × 3.0m), so windows
 *   are always window-sized on every building. Per-instance `aFacade`
 *   attributes carry (atlas style, window lit-bias).
 * - The fragment stage samples the style tile with explicit gradients
 *   (`textureGrad` off the continuous facade coordinate), so the 4-cell tile
 *   repeat never shows mip seams.
 * - The M2 office-window schedule ports over 1:1 — cells are now TRUE
 *   bay/floor indices instead of the old fake 5×11 grid, seeded per building
 *   from the instance translation, swelling with uSimNight exactly as before.
 * - INTERIOR MAPPING (`interiorGate` uniform > 0.5, ULTRA/HIGH): a per-window
 *   tangent-space ray intersects a virtual room box behind the glass; back
 *   walls sample the room atlas (desks, shelves, a glowing code screen),
 *   sides/floor/ceiling shade analytically, distance-faded back to the flat
 *   emissive beyond ~150m. This is the night skyline money shot.
 * - The hologram-compile block (HOLO_OPAQUE_BLOCK) and the district tint
 *   field survive unchanged, and applyWetResponse composes when applied
 *   FIRST (facade keeps every standard chunk anchor intact).
 *
 * One material for all ~900 buildings; zero CPU per frame; the interior gate
 * is a uniform so tier switches never recompile.
 */
export function applyFacadeAtlas<T extends THREE.Material>(
  mat: T,
  maps: FacadeAtlasPatchMaps,
  interiorEnabled: boolean,
): T {
  const prevHook = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')
    ? mat.onBeforeCompile
    : null
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')
    ? mat.customProgramCacheKey.bind(mat)
    : null
  const uInterior = { value: interiorEnabled ? 1 : 0 }

  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer)
    bindSimUniforms(shader)
    shader.uniforms.uSimFacadeMap = { value: maps.map }
    shader.uniforms.uSimFacadeEmit = { value: maps.emissive }
    shader.uniforms.uSimFacadeData = { value: maps.data }
    shader.uniforms.uSimRoomAtlas = { value: maps.rooms }
    shader.uniforms.uSimInterior = uInterior

    // World-position varying (skip when a prior patch — wet — installed it).
    if (!shader.vertexShader.includes('vSimWorldPos')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute vec2 aFacade;
varying vec2 vFacadeUv;
varying float vFacadeStyle;
varying float vFacadeLit;
varying float vFacadeWall;
varying float vFacadeSeed;`,
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
{
  #ifdef USE_INSTANCING
    vec3 simSc = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
    vec2 simIT = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
  #else
    vec3 simSc = vec3( 1.0 );
    vec2 simIT = vec2( 0.0 );
  #endif
  // Horizontal facade axis follows cross(worldUp, faceNormal) so the parallax
  // interior ray agrees with the on-screen left/right on every face.
  float simU = abs( normal.x ) > 0.5
    ? -position.z * simSc.z * sign( normal.x )
    : position.x * simSc.x * sign( normal.z );
  vFacadeUv = vec2( simU / 2.6, position.y * simSc.y / 3.0 );
  vFacadeWall = step( 0.5, abs( normal.y ) );
  vFacadeStyle = aFacade.x;
  vFacadeLit = aFacade.y;
  vFacadeSeed = fract( sin( dot( simIT, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}`,
      )

    let frag = shader.fragmentShader
    if (!frag.includes('vSimWorldPos')) {
      frag = frag.replace('#include <common>', '#include <common>\nvarying vec3 vSimWorldPos;')
    }
    const pars = frag.includes('simDistrictTint') ? '' : SIM_PARS
    frag = frag
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec2 vFacadeUv;
varying float vFacadeStyle;
varying float vFacadeLit;
varying float vFacadeWall;
varying float vFacadeSeed;
uniform sampler2D uSimFacadeMap;
uniform sampler2D uSimFacadeEmit;
uniform sampler2D uSimFacadeData;
uniform sampler2D uSimRoomAtlas;
uniform float uSimInterior;
uniform float uSimHolo;
${pars}`,
      )
      // ---- Albedo + shared atlas sample (main-scope so later chunks reuse it)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
vec2 simFTileO = vec2( mod( vFacadeStyle, 4.0 ) * 0.25, ( 1.0 - floor( vFacadeStyle / 4.0 ) ) * 0.5 );
vec2 simFUv = simFTileO + fract( vFacadeUv * 0.25 ) * vec2( 0.25, 0.5 );
vec2 simFGx = dFdx( vFacadeUv ) * vec2( 0.0625, 0.125 );
vec2 simFGy = dFdy( vFacadeUv ) * vec2( 0.0625, 0.125 );
vec4 simFAlb = textureGrad( uSimFacadeMap, simFUv, simFGx, simFGy );
vec4 simFDat = textureGrad( uSimFacadeData, simFUv, simFGx, simFGy );
simFAlb = mix( simFAlb, vec4( 0.86, 0.87, 0.89, 1.0 ), vFacadeWall );
float simFacRough = mix( simFDat.g, 0.85, vFacadeWall );
float simFacWin = simFDat.b * ( 1.0 - vFacadeWall );
diffuseColor.rgb *= simFAlb.rgb;`,
      )
      // ---- Roughness from the atlas (wet response composes right after)
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = simFacRough;`,
      )
      // ---- Lit offices + interior mapping
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
{
  vec2 simCell = floor( vFacadeUv );
  float simWSeed = fract( sin( dot( simCell + vFacadeSeed * 61.7, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  float simTick = floor( uSimTime * 0.055 + simWSeed * 9.0 );
  float simOnR = fract( simWSeed * 61.7 + simTick * 0.618 );
  // Realism rebuild: fewer offices burn at night (a lived-in skyline of
  // scattered lights, not a wall of them) — the neon quarter's high litBias
  // still reads hot while sleepy districts go mostly dark. The NYC-night
  // remap makes the ambient floor count as full night for the schedule.
  float simNightLit = ${NIGHT_LIT_GLSL};
  float simThresh = vFacadeLit * 0.5 + simNightLit * 0.30;
  float simOn = step( simOnR, simThresh );
  // Night-city pass: lit rooms carry a per-window brightness spread and a
  // second HALF-LIT band (desk lamps, TV glow) sits just past the cutoff —
  // the skyline stops reading as a binary LED checkerboard.
  float simDim = ( 1.0 - simOn ) * step( simOnR, simThresh + 0.16 ) * 0.28;
  float simLevel = simOn * ( 0.55 + 0.45 * fract( simWSeed * 13.7 ) ) + simDim;
  float simFlick = 1.0 + 0.06 * sin( uSimTime * ( 5.0 + simWSeed * 8.0 ) + simWSeed * 40.0 );
  vec3 simEmitCol = textureGrad( uSimFacadeEmit, simFUv, simFGx, simFGy ).rgb;

  float simDCam = distance( vSimWorldPos, cameraPosition );
  // Parallax interiors fade to the flat emissive by ~115m — beyond that the
  // ray-march is invisible detail at full fragment price (perf: the facade
  // shader covers most of every frame's pixels).
  float simIntAmt = uSimInterior * simFacWin * ( 1.0 - smoothstep( 80.0, 115.0, simDCam ) );
  if ( simIntAmt > 0.01 ) {
    // Tangent frame in view space (boxes: world-up is never parallel to a wall).
    vec3 simNv = normalize( normal );
    vec3 simUpV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    vec3 simTv = normalize( cross( simUpV, simNv ) + vec3( 1e-5 ) );
    vec3 simBv = cross( simNv, simTv );
    vec3 simVv = normalize( vViewPosition );
    vec3 simVTS = vec3( dot( simVv, simTv ), dot( simVv, simBv ), dot( simVv, simNv ) );
    // Ray from the glass plane into a 0.62-deep virtual room.
    vec3 simRo = vec3( fract( vFacadeUv ), 0.0 );
    vec3 simRd = -simVTS;
    simRd.z = min( simRd.z, -0.06 );
    vec3 simT3 = ( vec3( step( 0.0, simRd.x ), step( 0.0, simRd.y ), -0.62 ) - simRo ) / simRd;
    float simTHit = min( simT3.x, min( simT3.y, simT3.z ) );
    vec3 simHit = simRo + simRd * simTHit;
    float simRoomId = floor( fract( simWSeed * 7.31 ) * 8.0 );
    vec2 simRoomO = vec2( mod( simRoomId, 4.0 ) * 0.25, ( 1.0 - floor( simRoomId / 4.0 ) ) * 0.5 );
    vec3 simRoomCol;
    if ( simTHit >= simT3.z - 1e-4 && simT3.z <= min( simT3.x, simT3.y ) ) {
      simRoomCol = texture2D( uSimRoomAtlas, simRoomO + clamp( simHit.xy, 0.0, 1.0 ) * vec2( 0.25, 0.5 ) ).rgb;
    } else {
      float simDepthT = clamp( -simHit.z / 0.62, 0.0, 1.0 );
      vec3 simSideCol = ( simTHit == simT3.y )
        ? ( simRd.y > 0.0 ? vec3( 0.95, 0.93, 0.86 ) : vec3( 0.34, 0.31, 0.29 ) )
        : vec3( 0.55, 0.52, 0.50 );
      vec3 simRoomTint = texture2D( uSimRoomAtlas, simRoomO + vec2( 0.125, 0.25 ) ).rgb;
      simRoomCol = simSideCol * simRoomTint * 1.7 * mix( 1.0, 0.35, simDepthT );
    }
    simEmitCol = mix( simEmitCol, simRoomCol, simIntAmt );
    // Dark offices still read as dim moonlit rooms through the parallax.
    totalEmissiveRadiance += simRoomCol * simIntAmt * 0.05 * ( 1.0 - simOn );
  }
  // Swell tuned so a lit office glows warm instead of blowing out white —
  // the bloom pass only catches the true neon (signs, lamps, kiosks).
  totalEmissiveRadiance += simEmitCol * ( ( 0.14 + simNightLit * 1.05 ) * simLevel * simFlick );
}`,
      )
      // ---- The hologram-compile world survives the re-skin untouched.
      .replace('#include <opaque_fragment>', holoOpaqueBlock('city'))
    shader.fragmentShader = frag
  }
  mat.customProgramCacheKey = () => `${prevKey?.() ?? 'sim-plain'}|facade-v3`
  return mat
}

/* ---------------------------------------------------------- Street decals */

/**
 * Phase 3 — STREET DECALS. One instanced quad draw carries every manhole,
 * drain, lane arrow, crack, oil stain, rain puddle, and crosswalk band in
 * the city. Per-instance `aDecal = (atlasTile, rainOnly)`:
 * - the fragment re-projects the quad UV into the tile's atlas cell,
 * - `rainOnly` instances fade in with SIM.rain (puddles simply don't exist
 *   on dry streets) and drop their roughness to a near-mirror so the sky
 *   environment reflects out of them — the decal layer feeds the same wet
 *   language applyWetResponse gives the asphalt.
 * Standard-material pipeline preserved (decals receive sun/cascade shadows).
 */
export function applyStreetDecal<T extends THREE.Material>(mat: T, atlas: THREE.Texture): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSimRain = SIM.rain
    shader.uniforms.uSimDecalMap = { value: atlas }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aDecal;\nvarying vec2 vDecalUv;\nvarying float vDecalRain;',
      )
      .replace(
        '#include <uv_vertex>',
        /* glsl */ `#include <uv_vertex>
{
  vec2 simDTile = vec2( mod( aDecal.x, 4.0 ) * 0.25, ( 1.0 - floor( aDecal.x / 4.0 ) ) * 0.5 );
  vDecalUv = simDTile + uv * vec2( 0.25, 0.5 );
  vDecalRain = aDecal.y;
}`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vDecalUv;\nvarying float vDecalRain;\nuniform float uSimRain;\nuniform sampler2D uSimDecalMap;',
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
vec4 simDecalTex = texture2D( uSimDecalMap, vDecalUv );
simDecalTex.a *= mix( 1.0, uSimRain * uSimRain, vDecalRain );
diffuseColor *= simDecalTex;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, 0.05, vDecalRain );`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-decal-v1'
  return mat
}

/* ---------------------------------------------------------- Hover traffic */

/**
 * Phase 3 — HOVER TRAFFIC MOTION. Pods cruise the avenues entirely in the
 * vertex shader: static per-instance route attributes
 * (`aRoute = (axis, dirSpeed, phase, unused)`) advance an `along` coordinate
 * off the shared SIM clock and add it in WORLD space after the instance
 * matrix (which carries the pod's cross-axis position, altitude, and facing).
 * Zero CPU per frame, one draw for the whole fleet.
 *
 * Fragment side: the pod geometry marks its light strip in uv.y — headlights
 * idle by day and flare with uSimNight, plus a red tail tint against travel.
 */
export function applyTrafficMotion<T extends THREE.Material>(mat: T, span: number, emissiveStrip = false): T {
  const prevHook = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')
    ? mat.onBeforeCompile
    : null
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')
    ? mat.customProgramCacheKey.bind(mat)
    : null
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer)
    shader.uniforms.uSimTime = SIM.time
    shader.uniforms.uSimNight = SIM.night
    // NOTE: this REPLACES three's project_vertex — mvPosition must stay in
    // main scope (no brace block) because fog_vertex reads it afterwards.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aRoute;\nuniform float uSimTime;\nvarying float vPodStrip;',
      )
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
float simSpan = ${span.toFixed(2)};
float simAlong = mod( aRoute.z * simSpan + uSimTime * aRoute.y, simSpan ) - simSpan * 0.5;
vec3 simPodOff = aRoute.x < 0.5 ? vec3( 0.0, 0.0, simAlong ) : vec3( simAlong, 0.0, 0.0 );
// Gentle hover bob, phase-desynced per pod.
simPodOff.y = sin( uSimTime * 1.7 + aRoute.z * 41.0 ) * 0.12;
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition.xyz += simPodOff;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
vPodStrip = uv.y;`,
      )
    if (emissiveStrip) {
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vPodStrip;\nuniform float uSimNight;',
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
{
  float simStrip = step( 0.75, vPodStrip );
  totalEmissiveRadiance += vec3( 1.0, 0.92, 0.72 ) * simStrip * ( 0.3 + ${NIGHT_LIT_GLSL} * 2.2 );
}`,
        )
    } else {
      // No uSimNight here — a composed applyNightFade declares its own.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vPodStrip;',
      )
    }
  }
  mat.customProgramCacheKey = () =>
    `${prevKey?.() ?? 'sim-plain'}|podmove-v2:${span.toFixed(0)}:${emissiveStrip ? 1 : 0}`
  return mat
}

/* ------------------------------------------------------- Road data pulses */

/**
 * M3 — ROAD SURFACE PATCH. The emissive "data-pulse" side rails were retired
 * (they read as too much visual noise next to the navigation ribbon), but the
 * asphalt still needs this patch for two things: `worldUvScale`
 * (repeats/meter) re-projects the material's detail maps in world space so
 * the asphalt PBR maps tile seamlessly across every strip, and the
 * `vSimWorldPos` varying stays exposed as the anchor the composed wet-weather
 * patch reuses.
 */
export function applyRoadPulse<T extends THREE.Material>(mat: T, worldUvScale = 0): T {
  mat.onBeforeCompile = (shader) => {
    if (worldUvScale > 0) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        worldUvVertex(worldUvScale),
      )
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vSimWorldPos;',
    )
  }
  mat.customProgramCacheKey = () => `sim-road-v3:${worldUvScale.toFixed(5)}`
  return mat
}

/* ------------------------------------------------------------ Wet weather */

/**
 * Phase 2 — WET GROUND. Patches a ground/road MeshStandardMaterial so rising
 * `SIM.rain` soaks it: albedo darkens, micro-roughness drops toward glossy,
 * and an organic world-space interference pattern pools near-mirror puddles
 * (which then drink from the sky environment map — real reflections for free).
 *
 * Composes with the existing Living Simulation patches: if the material was
 * already patched (e.g. applyRoadPulse's world-space UVs), the prior hook runs
 * first and this one reuses its `vSimWorldPos` varying — the same anchor point
 * the world-space re-skin uses. Standalone materials get their own varying.
 * Cost: a few fragment ALU behind a coherent uniform branch; zero CPU.
 */
export function applyWetResponse<T extends THREE.Material>(mat: T): T {
  const prevHook = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')
    ? mat.onBeforeCompile
    : null
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')
    ? mat.customProgramCacheKey.bind(mat)
    : null

  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer)
    shader.uniforms.uSimRain = SIM.rain
    shader.uniforms.uSimNight = SIM.night
    // Reuse the prior patch's world position varying when present; otherwise
    // inject the standard one (same anchor points as every other sim patch).
    if (!shader.fragmentShader.includes('vSimWorldPos')) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${WORLDPOS_VERTEX_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${WORLDPOS_VERTEX}`)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vSimWorldPos;',
      )
    }
    // Guard the uniform declarations — a composed patch (street decals /
    // night fade) may have declared them already.
    if (!shader.fragmentShader.includes('uniform float uSimRain;')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uSimRain;',
      )
    }
    if (!shader.fragmentShader.includes('uniform float uSimNight;')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uSimNight;',
      )
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
#include <roughnessmap_fragment>
{
  // NYC night: streets keep a recently-rained sheen after dark (specular
  // asphalt catching the neon) even between real weather fronts.
  float simWetIn = max( uSimRain, ${NIGHT_LIT_GLSL} * 0.55 );
  if ( simWetIn > 0.001 ) {
    vec2 simWXZ = vSimWorldPos.xz;
    float simPud = sin( simWXZ.x * 0.437 + sin( simWXZ.y * 0.311 ) * 2.1 )
      * sin( simWXZ.y * 0.383 + sin( simWXZ.x * 0.269 ) * 1.7 );
    float simWet = simWetIn * ( 0.72 + 0.28 * smoothstep( -0.35, 0.75, simPud ) );
    float simPool = simWetIn * smoothstep( 0.45, 0.85, simPud );
    diffuseColor.rgb *= 1.0 - 0.42 * simWet;
    roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.38, simWet );
    roughnessFactor = mix( roughnessFactor, 0.07, simPool );
  }
}`,
      )
  }
  mat.customProgramCacheKey = () => `${prevKey?.() ?? 'sim-plain'}|wet-v2`
  return mat
}

/* ------------------------------------------------------- Night street life */

/**
 * M3 — fade a transparent glow mesh (streetlight cones, ground light pools)
 * in with dusk: alpha rides uSimNight², so the street lighting blooms on
 * late in the sunset instead of ghosting at noon. Uniform-driven; zero CPU.
 */
export function applyNightFade<T extends THREE.Material>(mat: T): T {
  const prevHook = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')
    ? mat.onBeforeCompile
    : null
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')
    ? mat.customProgramCacheKey.bind(mat)
    : null
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer)
    shader.uniforms.uSimNight = SIM.night
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSimNight;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n{ float simNf = ${NIGHT_LIT_GLSL}; diffuseColor.a *= simNf * simNf; }`,
      )
  }
  mat.customProgramCacheKey = () => `${prevKey?.() ?? 'sim-plain'}|nightfade-v2`
  return mat
}

/**
 * NYC-at-night: multiply a material's albedo down as night rises. Bright
 * daytime surfaces (sidewalk concrete, flat roofs) read as glowing gray
 * sheets under the night IBL without this — real cities go near-black on
 * top. Composes with prior sim patches. Uniform-driven; zero CPU.
 */
export function applyNightDim<T extends THREE.Material>(mat: T, nightFactor = 0.55): T {
  const prevHook = Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')
    ? mat.onBeforeCompile
    : null
  const prevKey = Object.prototype.hasOwnProperty.call(mat, 'customProgramCacheKey')
    ? mat.customProgramCacheKey.bind(mat)
    : null
  mat.onBeforeCompile = (shader, renderer) => {
    prevHook?.call(mat, shader, renderer)
    shader.uniforms.uSimNight = SIM.night
    if (!shader.fragmentShader.includes('uniform float uSimNight;')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uSimNight;',
      )
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>\ndiffuseColor.rgb *= mix( 1.0, ${nightFactor.toFixed(3)}, ${NIGHT_LIT_GLSL} );`,
    )
  }
  mat.customProgramCacheKey = () => `${prevKey?.() ?? 'sim-plain'}|nightdim-v1:${nightFactor}`
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
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix( ${dayLevel.toFixed(3)}, ${nightLevel.toFixed(3)}, ${NIGHT_LIT_GLSL} );`,
      )
  }
  mat.customProgramCacheKey = () => `sim-nightem-v2:${dayLevel}:${nightLevel}`
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
  totalEmissiveRadiance = simSig * ( 0.8 + ${NIGHT_LIT_GLSL} * 1.5 );
}`,
      )
  }
  mat.customProgramCacheKey = () => 'sim-traffic-v2'
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
