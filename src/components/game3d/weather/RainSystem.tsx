import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM } from '../simulation'

/* ============================================================================
   Phase 2 — RAIN. A camera-following volume of instanced rain streaks plus
   pooled ground-splash rings, fully GPU-driven:

   - Streak positions live in STATIC instanced attributes; the vertex shader
     advances the fall with the shared SIM clock and wraps each drop inside a
     box centered on the camera (world-space mod, so drops stay put in the
     world while the volume follows you). Per-frame CPU: zero — the material
     shares the SIM uniform objects the driver already writes.
   - Streaks are cylindrically billboarded quads slanted along the wind, so
     the rain reads as motion without any per-frame matrix uploads.
   - Splashes are a second instanced set of flat rings scattered on the ground
     plane, each looping its own expand+fade cycle phase-offset by seed.
   - Lightning: at night storms a small driver schedules distant strikes as a
     double-pulse on SIM.flash — CascadedSunlight adds it to the key light and
     the sky shader flashes, so bloom pulses with zero extra geometry.

   Instance budgets come from the unified quality profile (ULTRA ~9k, HIGH
   ~5k, MEDIUM ~2k, LOW 0 → component not mounted).
   ========================================================================== */

const RAIN_VERT = /* glsl */ `
uniform float uSimTime;
uniform float uSimRain;
uniform vec3 uVolume;
uniform vec2 uWind;
attribute vec3 aSeed;
attribute float aSpeed;
attribute float aLen;
varying float vAlpha;
varying float vY;

void main() {
  float fall = 11.0 * aSpeed;
  vec3 vel = vec3( uWind.x, -fall, uWind.y );
  vec3 base = aSeed * uVolume + vel * uSimTime;
  vec3 corner = cameraPosition - uVolume * 0.5;
  vec3 origin = mod( base - corner, uVolume ) + corner;

  // Cylindrical billboard: face the camera around Y, slant along the velocity.
  vec3 toCam = cameraPosition - origin;
  vec3 right = normalize( vec3( toCam.z, 0.0, -toCam.x ) + 1e-4 );
  vec3 streak = normalize( vel ) * -1.0; // up along the streak
  vec3 world = origin + right * position.x + streak * position.y * aLen;

  // Fade drops right at the camera (avoid a bright quad on the lens) and
  // stragglers at the volume corners; scale everything by the rain amount.
  float dCam = length( toCam );
  vAlpha = uSimRain * smoothstep( 0.8, 2.4, dCam )
    * ( 1.0 - smoothstep( 0.55, 0.78, dCam / max( uVolume.x, 1.0 ) ) );
  vY = position.y + 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`

const RAIN_FRAG = /* glsl */ `
uniform float uSimNight;
uniform float uSimFlash;
varying float vAlpha;
varying float vY;

void main() {
  // Soft ends so streaks never show hard quad edges.
  float tip = smoothstep( 0.0, 0.18, vY ) * ( 1.0 - smoothstep( 0.82, 1.0, vY ) );
  vec3 col = mix( vec3( 0.72, 0.78, 0.88 ), vec3( 0.40, 0.45, 0.66 ), uSimNight );
  col += vec3( 0.9, 0.95, 1.0 ) * uSimFlash * 0.7;
  float a = vAlpha * tip * 0.34;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( col, a );
}
`

const SPLASH_VERT = /* glsl */ `
uniform float uSimTime;
uniform float uSimRain;
uniform vec3 uVolume;
attribute vec3 aSeed;
attribute float aSpeed;
varying vec2 vUvL;
varying float vFade;

void main() {
  // Each splash loops its own expand+fade cycle, phase-offset by its seed,
  // re-scattering to a fresh golden-ratio lattice point every cycle so hits
  // never visibly repeat in place.
  float beat = uSimTime * ( 0.9 + aSpeed * 0.8 ) + aSeed.y * 7.31;
  float phase = fract( beat );
  float cyc = floor( beat );
  vec2 lattice = fract( aSeed.xz + vec2( cyc * 0.6180339, cyc * 0.7548776 ) ) * uVolume.xz;
  // Same world-space wrap as the streaks: stationary while alive, the box
  // follows the camera.
  vec2 corner = cameraPosition.xz - uVolume.xz * 0.5;
  vec2 world = mod( lattice - corner, uVolume.xz ) + corner;

  float scale = mix( 0.10, 0.62, phase );
  vec3 pos = vec3( world.x + position.x * scale, 0.055, world.y + position.y * scale );
  vUvL = position.xy * 2.0; // -1..1 across the quad
  vFade = ( 1.0 - phase ) * ( 1.0 - phase ) * uSimRain;
  gl_Position = projectionMatrix * viewMatrix * vec4( pos, 1.0 );
}
`

const SPLASH_FRAG = /* glsl */ `
uniform float uSimNight;
varying vec2 vUvL;
varying float vFade;

void main() {
  float r = length( vUvL );
  // Thin ring with a soft inner glow — reads as a ripple, not a decal.
  float ring = smoothstep( 0.55, 0.8, r ) * ( 1.0 - smoothstep( 0.86, 1.0, r ) );
  vec3 col = mix( vec3( 0.80, 0.86, 0.94 ), vec3( 0.42, 0.48, 0.68 ), uSimNight );
  float a = ring * vFade * 0.5;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col, a );
}
`

/** Static instanced attribute block for `count` particles (seeded locally). */
function buildInstanceAttrs(count: number, quad: THREE.PlaneGeometry) {
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = quad.index
  geo.attributes.position = quad.attributes.position
  geo.attributes.uv = quad.attributes.uv
  const seeds = new Float32Array(count * 3)
  const speeds = new Float32Array(count)
  const lens = new Float32Array(count)
  let s = 1234567
  const rnd = () => {
    // Tiny LCG — visual scatter only, deterministic so re-mounts look identical.
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = 0; i < count; i++) {
    seeds[i * 3] = rnd()
    seeds[i * 3 + 1] = rnd()
    seeds[i * 3 + 2] = rnd()
    speeds[i] = 0.8 + rnd() * 0.5
    lens[i] = 0.38 + rnd() * 0.34
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3))
  geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1))
  geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1))
  geo.instanceCount = count
  // The volume follows the camera — never let three cull the wrap box.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
  return geo
}

/* ------------------------------------------------------- lightning driver -- */

/** Seconds between strikes (uniform random within the band). */
const STRIKE_GAP_MIN = 4
const STRIKE_GAP_MAX = 13
/** SIM.flash decay rate — a strike reads for ~0.2s. */
const FLASH_DECAY = 7

function LightningDriver(): null {
  const nextAt = useRef(6)
  const clock = useRef(0)
  const restrike = useRef(0)

  useFrame((_, dt) => {
    // Envelope decay always runs so a flash never sticks.
    if (SIM.flash.value > 0) {
      SIM.flash.value = Math.max(0, SIM.flash.value - dt * FLASH_DECAY * SIM.flash.value - dt * 0.4)
    }
    const storming = SIM.rain.value > 0.5 && SIM.night.value > 0.55
    if (!storming) return
    clock.current += dt
    if (restrike.current > 0 && clock.current >= restrike.current) {
      restrike.current = 0
      SIM.flash.value = Math.min(1, SIM.flash.value + 0.5 + Math.random() * 0.4)
    }
    if (clock.current >= nextAt.current) {
      SIM.flash.value = 0.55 + Math.random() * 0.45
      // Real lightning double-strikes — schedule the echo ~90–180ms out.
      restrike.current = clock.current + 0.09 + Math.random() * 0.09
      nextAt.current = clock.current + STRIKE_GAP_MIN + Math.random() * (STRIKE_GAP_MAX - STRIKE_GAP_MIN)
    }
  })
  return null
}

/* --------------------------------------------------------------- component - */

export const RainSystem = memo(function RainSystem({ count }: { count: number }) {
  const group = useRef<THREE.Group>(null)

  // Both quads stay in the XY plane — the shaders build world positions from
  // position.x / position.y directly (streaks billboard, splashes lie flat).
  const quad = useMemo(() => new THREE.PlaneGeometry(0.03, 1), [])
  const splashQuad = useMemo(() => new THREE.PlaneGeometry(1, 1), [])

  const volume = useMemo(() => {
    // Denser tiers get a bigger envelope so heavy rain reads at distance too.
    const side = count >= 8000 ? 46 : count >= 4000 ? 42 : 34
    const height = count >= 8000 ? 30 : count >= 4000 ? 28 : 24
    return new THREE.Vector3(side, height, side)
  }, [count])

  const streakGeo = useMemo(() => buildInstanceAttrs(count, quad), [count, quad])
  const splashGeo = useMemo(
    () => buildInstanceAttrs(Math.max(32, Math.floor(count / 5)), splashQuad),
    [count, splashQuad],
  )

  const streakMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        uniforms: {
          uSimTime: SIM.time,
          uSimRain: SIM.rain,
          uSimNight: SIM.night,
          uSimFlash: SIM.flash,
          uVolume: { value: volume },
          uWind: { value: new THREE.Vector2(1.7, 0.9) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [volume],
  )
  const splashMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SPLASH_VERT,
        fragmentShader: SPLASH_FRAG,
        uniforms: {
          uSimTime: SIM.time,
          uSimRain: SIM.rain,
          uSimNight: SIM.night,
          uVolume: { value: volume },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [volume],
  )

  useEffect(
    () => () => {
      quad.dispose()
      splashQuad.dispose()
      streakGeo.dispose()
      splashGeo.dispose()
      streakMat.dispose()
      splashMat.dispose()
      // This system is the only SIM.flash writer — never leave a strike lit.
      SIM.flash.value = 0
    },
    [quad, splashQuad, streakGeo, splashGeo, streakMat, splashMat],
  )

  // Skip ALL rain draws while the sky is dry — one visibility write per frame.
  useFrame(() => {
    const g = group.current
    if (!g) return
    const on = SIM.rain.value > 0.004
    if (g.visible !== on) g.visible = on
  })

  return (
    <group ref={group} visible={false}>
      <mesh geometry={streakGeo} material={streakMat} frustumCulled={false} renderOrder={20} />
      <mesh geometry={splashGeo} material={splashMat} frustumCulled={false} renderOrder={19} />
      <LightningDriver />
    </group>
  )
})
