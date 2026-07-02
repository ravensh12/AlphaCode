import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM, FOG_DAY, FOG_NIGHT, SUN_DIR } from './simulation'

/* ============================================================================
   M2 — SHADER SKY: the roof of the Living Simulation.

   A camera-following dome drawn by one fragment shader. By DAY it is a
   physically-plausible atmosphere: a Rayleigh-style gradient (optical depth
   grows toward the horizon so blue saturates at the zenith and washes out
   into the haze), warm Mie forward-scatter around one TRUE sun direction
   (shared with the shadow light + baked environment), a hot sun disc with a
   soft halo, and faint cirrus streaks. The simulation identity stays as
   subtle accents — a whisper of aurora and the horizon grid.

   At NIGHT the atmosphere corrupts into the full red/magenta nebula: glitch
   bands shear the sky, stars pierce through, the sun pales into a cold moon.

   All animation reads the shared SIM clock uniforms (written once per frame
   by <SimulationDriver>); this component's only per-frame CPU work is copying
   the camera position onto the dome. Fog never touches it (classic skybox).
   ========================================================================== */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

const SKY_FRAG = /* glsl */ `
uniform float uSimTime;
uniform float uSimNight;
uniform float uSimFx;
uniform vec3 uHorizonDay;
uniform vec3 uHorizonNight;
uniform vec3 uSunDir;
varying vec3 vDir;

float hash13( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.zyx + 31.32 );
  return fract( ( p.x + p.y ) * p.z );
}
float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

void main() {
  vec3 d = normalize( vDir );
  float el = d.y;
  float az = atan( d.z, d.x );
  float night = uSimNight;
  float day = 1.0 - night;

  // --- Night glitch band: a corrupted scanline sweeping up the sky --------
  // Computed FIRST because it shears the azimuth used by everything below,
  // so the whole sky tears sideways inside the band.
  float sweep = fract( uSimTime * 0.09 );
  float win = step( 0.86, sweep ) * night * uSimFx;
  float bandY = mix( 0.02, 0.55, ( sweep - 0.86 ) / 0.14 );
  float band = win * ( 1.0 - smoothstep( 0.0, 0.045, abs( el - bandY ) ) );
  az += band * ( hash12( vec2( floor( uSimTime * 24.0 ), floor( el * 60.0 ) ) ) - 0.5 ) * 0.6;

  // === DAY: physically-plausible atmosphere ================================
  // Rayleigh-style gradient — pseudo optical depth rises toward the horizon.
  float zen = clamp( el, 0.0, 1.0 );
  float depth = 1.0 - exp( -0.85 / ( zen * 3.6 + 0.18 ) );
  vec3 zenBlue = vec3( 0.072, 0.24, 0.60 );
  vec3 dayCol = mix( zenBlue, uHorizonDay, depth * depth );

  // Mie forward-scatter: warm haze pooled around the sun, strongest low down.
  float mu = dot( d, uSunDir );
  float muPos = max( mu, 0.0 );
  dayCol += vec3( 1.0, 0.68, 0.38 ) * pow( muPos, 6.0 ) * 0.14 * ( 0.35 + 0.65 * depth );

  // Faint drifting cirrus streaks (reuses the swirl waves below at day).
  float neb = sin( d.x * 2.6 + uSimTime * 0.021 ) * sin( d.z * 3.3 - uSimTime * 0.017 )
    + 0.5 * sin( ( d.x + d.y * 2.0 ) * 5.1 + uSimTime * 0.013 );
  float cirrus = smoothstep( 0.55, 1.35, neb ) * smoothstep( 0.04, 0.16, el ) * ( 1.0 - smoothstep( 0.35, 0.62, el ) );
  dayCol += vec3( 1.0, 0.99, 0.96 ) * cirrus * 0.10;

  // === NIGHT: the corruption nebula ========================================
  vec3 nightCol = mix( uHorizonNight, vec3( 0.115, 0.022, 0.10 ), smoothstep( 0.0, 0.16, zen ) );
  nightCol = mix( nightCol, vec3( 0.030, 0.010, 0.055 ), smoothstep( 0.16, 0.72, zen ) );
  nightCol += vec3( 0.17, 0.03, 0.13 ) * ( 0.5 + 0.5 * neb ) * 0.72 * smoothstep( 0.0, 0.25, el );

  vec3 col = mix( dayCol, nightCol, night );

  // --- Sun disc / cold moon ------------------------------------------------
  // One hot disc with a soft edge + a tight halo; at night it pales and
  // shrinks into a moon. toneMapped=false, so >1 values feed the bloom pass.
  float disc = smoothstep( 0.99938, 0.99972, mu );
  float halo = pow( muPos, 260.0 );
  vec3 sunCol = vec3( 1.9, 1.55, 1.12 ) * disc + vec3( 1.0, 0.82, 0.55 ) * halo * 0.55;
  float moonDisc = smoothstep( 0.99968, 0.99988, mu );
  vec3 moonCol = vec3( 0.78, 0.86, 1.05 ) * moonDisc + vec3( 0.45, 0.55, 0.85 ) * pow( muPos, 420.0 ) * 0.35;
  col += sunCol * day * smoothstep( -0.03, 0.03, el );
  col += moonCol * night * smoothstep( -0.03, 0.03, el );

  // --- Aurora bands — a whisper by day, corrupted ribbons at night ---------
  float wave = sin( az * 3.0 + uSimTime * 0.10 + sin( el * 6.0 + uSimTime * 0.06 ) * 1.5 );
  float aur = smoothstep( 0.45, 1.0, wave )
    * smoothstep( 0.04, 0.30, el ) * ( 1.0 - smoothstep( 0.55, 0.9, el ) );
  vec3 aurCol = mix( vec3( 0.15, 0.75, 0.62 ), vec3( 0.85, 0.12, 0.38 ), night );
  col += aurCol * aur * ( 0.05 * day + 0.30 * night ) * uSimFx;

  // --- Point stars: fade in through dusk, gone by day ----------------------
  vec3 sp = d * 46.0;
  vec3 sf = fract( sp ) - 0.5;
  float sh = hash13( floor( sp ) );
  float star = ( 1.0 - smoothstep( 0.0, 0.16, length( sf ) ) ) * step( 0.80, sh );
  float twinkle = 0.65 + 0.35 * sin( uSimTime * ( 1.5 + sh * 5.0 ) + sh * 43.0 );
  col += vec3( 0.9, 0.95, 1.0 ) * star * twinkle * smoothstep( 0.25, 0.8, night ) * smoothstep( 0.05, 0.3, el );

  // --- Horizon grid — the edge of the simulation (MED/HIGH) ----------------
  // A receding perspective plane: parallels compress toward the horizon,
  // meridians converge. Dissolves both upward and right at the fog line.
  float persp = 0.045 / ( el + 0.028 );
  float rowLine = smoothstep( 0.80, 0.93, abs( fract( persp - uSimTime * 0.05 ) - 0.5 ) * 2.0 );
  float colLine = smoothstep( 0.88, 0.97, abs( fract( az * 9.549 ) - 0.5 ) * 2.0 );
  float gridFade = smoothstep( 0.012, 0.05, el ) * ( 1.0 - smoothstep( 0.10, 0.34, el ) );
  vec3 gridCol = mix( vec3( 0.30, 0.80, 1.0 ), vec3( 1.0, 0.22, 0.42 ), night );
  col += gridCol * max( rowLine, colLine * 0.7 ) * gridFade * ( 0.05 * day + 0.22 * night ) * uSimFx;

  // below the horizon: hold the fog wall color so the seam never shows
  vec3 hor = mix( uHorizonDay, uHorizonNight, night );
  col = mix( hor, col, smoothstep( -0.06, 0.0, el ) );

  // --- Glitch band body: hot magenta core + static inside the tear ---------
  float statc = hash12( vec2( az * 40.0, floor( uSimTime * 30.0 ) ) );
  col = mix( col, vec3( 1.0, 0.16, 0.55 ) * ( 0.7 + 0.6 * statc ), band * 0.8 );

  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}
`

export const SimulationSky = memo(function SimulationSky({ radius = 470 }: { radius?: number }) {
  const ref = useRef<THREE.Mesh>(null)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        // Share the driver-written uniform objects — no per-frame work here.
        uniforms: {
          uSimTime: SIM.time,
          uSimNight: SIM.night,
          uSimFx: SIM.fx,
          uHorizonDay: { value: new THREE.Color(FOG_DAY) },
          uHorizonNight: { value: new THREE.Color(FOG_NIGHT) },
          uSunDir: { value: SUN_DIR },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    if (ref.current) ref.current.position.copy(state.camera.position)
  })

  return (
    <mesh ref={ref} material={material} frustumCulled={false} renderOrder={-10}>
      <sphereGeometry args={[radius, 40, 28]} />
    </mesh>
  )
})

/* ============================================================================
   M1 — IMAGE-BASED LIGHTING FROM THE SKY.

   Materials used to live off a flat ambient + hemisphere pair, which is why
   the city read like plastic. This bakes the sky above into two PMREM
   environment maps — a warm day atmosphere with a real sun hotspot (so window
   glass and car paint catch a believable sun glare) and the cold corruption
   nebula for night — then swaps `scene.environment` between them as the
   day/night blend crosses over. The maps are generated ONCE at mount from a
   tiny CPU-evaluated equirect (64×32); per frame the only work is one float
   write (environmentIntensity riding the shared night blend).
   ========================================================================== */

// Palette twins of the shader constants. Hex colors go through THREE.Color so
// they land in the same linear working space the shader math runs in.
const ENV_HOR_DAY = new THREE.Color(FOG_DAY)
const ENV_HOR_NIGHT = new THREE.Color(FOG_NIGHT)
const ENV_ZEN_DAY = new THREE.Color(0.072, 0.24, 0.6)
const ENV_MID_NIGHT = new THREE.Color(0.115, 0.022, 0.1)
const ENV_ZEN_NIGHT = new THREE.Color(0.03, 0.01, 0.055)
const ENV_BOUNCE_DAY = new THREE.Color(0.3, 0.28, 0.27)
const ENV_BOUNCE_NIGHT = new THREE.Color(0.05, 0.035, 0.06)

/** CPU twin of the sky shader's base gradient (no accents — just radiance). */
function skyRadiance(dir: THREE.Vector3, night: boolean, out: THREE.Color): THREE.Color {
  const el = dir.y
  const zen = THREE.MathUtils.clamp(el, 0, 1)
  if (!night) {
    const depth = 1 - Math.exp(-0.85 / (zen * 3.6 + 0.18))
    out.copy(ENV_ZEN_DAY).lerp(ENV_HOR_DAY, depth * depth)
    // Mie warmth toward the sun + the sun hotspot itself (feeds reflections).
    const mu = Math.max(0, dir.dot(SUN_DIR))
    const mie = Math.pow(mu, 6) * 0.14 * (0.35 + 0.65 * depth)
    const hot = Math.exp((mu - 1) * 220) * 14
    out.r += 1.0 * mie + 1.0 * hot
    out.g += 0.68 * mie + 0.86 * hot
    out.b += 0.38 * mie + 0.62 * hot
    if (el < 0) out.lerp(ENV_BOUNCE_DAY, THREE.MathUtils.clamp(-el * 4, 0, 1))
  } else {
    // Corruption nebula: magenta mid, near-black zenith, embers at horizon.
    const a = THREE.MathUtils.smoothstep(zen, 0, 0.16)
    const b = THREE.MathUtils.smoothstep(zen, 0.16, 0.72)
    out.copy(ENV_HOR_NIGHT).lerp(ENV_MID_NIGHT, a).lerp(ENV_ZEN_NIGHT, b)
    const mu = Math.max(0, dir.dot(SUN_DIR))
    const hot = Math.exp((mu - 1) * 320) * 1.6
    out.r += 0.78 * hot
    out.g += 0.86 * hot
    out.b += 1.05 * hot
    if (el < 0) out.lerp(ENV_BOUNCE_NIGHT, THREE.MathUtils.clamp(-el * 4, 0, 1))
  }
  return out
}

/** Build a small equirect radiance map of the sky (linear float RGBA). */
function makeSkyEquirect(night: boolean): THREE.DataTexture {
  const W = 64
  const H = 32
  const data = new Float32Array(W * H * 4)
  const dir = new THREE.Vector3()
  const col = new THREE.Color()
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H
    const e = Math.PI * (v - 0.5) // -π/2 (bottom row) … +π/2
    const y = Math.sin(e)
    const r = Math.cos(e)
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W
      const phi = (u - 0.5) * Math.PI * 2 // matches three's equirectUv(atan2(z, x))
      dir.set(r * Math.cos(phi), y, r * Math.sin(phi))
      skyRadiance(dir, night, col)
      const o = (j * W + i) * 4
      data[o] = col.r
      data[o + 1] = col.g
      data[o + 2] = col.b
      data[o + 3] = 1
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.needsUpdate = true
  return tex
}

/**
 * Mount ONE per canvas that wants sky-driven IBL. Generates both env maps at
 * mount and swaps `scene.environment` as the shared night blend crosses 0.5
 * (the CSS dusk overlay + fog lerp hide the swap). Never re-renders.
 */
export const SkyEnvironment = memo(function SkyEnvironment() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const isNightEnv = useRef(false)
  // Baked PMREM env targets live in a ref (not useMemo) so the context-restore
  // handler can rebuild them. After a WebGL context loss three.js re-uploads
  // ordinary textures/geometries by itself, but render-to-texture targets like
  // these PMREM maps come back BLANK — which would leave the entire city with a
  // black image-based light — unless we re-bake them here.
  const envRef = useRef<{
    day: THREE.WebGLRenderTarget
    night: THREE.WebGLRenderTarget
  } | null>(null)

  useEffect(() => {
    const bake = () => {
      const pmrem = new THREE.PMREMGenerator(gl)
      const dayEq = makeSkyEquirect(false)
      const nightEq = makeSkyEquirect(true)
      const day = pmrem.fromEquirectangular(dayEq)
      const night = pmrem.fromEquirectangular(nightEq)
      dayEq.dispose()
      nightEq.dispose()
      pmrem.dispose()
      return { day, night }
    }
    const apply = () => {
      const envs = envRef.current
      if (!envs) return
      scene.environment = isNightEnv.current ? envs.night.texture : envs.day.texture
      scene.environmentIntensity = 1.0 - SIM.night.value * 0.55
    }

    envRef.current = bake()
    apply()

    // Re-bake once the GPU context is restored (see note above) so the IBL
    // returns instead of staying black after a recovery.
    const canvas = gl.domElement
    const onRestore = () => {
      envRef.current?.day.dispose()
      envRef.current?.night.dispose()
      envRef.current = bake()
      apply()
    }
    canvas.addEventListener('webglcontextrestored', onRestore, false)

    return () => {
      canvas.removeEventListener('webglcontextrestored', onRestore, false)
      scene.environment = null
      scene.environmentIntensity = 1
      envRef.current?.day.dispose()
      envRef.current?.night.dispose()
      envRef.current = null
    }
  }, [gl, scene])

  useFrame(() => {
    const envs = envRef.current
    if (!envs) return
    const n = SIM.night.value
    // Ambient dims with the corruption; one float write per frame, no allocs.
    scene.environmentIntensity = 1.0 - n * 0.55
    const wantNight = n > 0.5
    if (wantNight !== isNightEnv.current) {
      isNightEnv.current = wantNight
      scene.environment = wantNight ? envs.night.texture : envs.day.texture
    }
  })

  return null
})
