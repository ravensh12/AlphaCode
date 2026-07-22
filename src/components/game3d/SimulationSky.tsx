import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM, FOG_DAY, FOG_NIGHT, SUN_DIR } from './simulation'
import {
  NIGHT_DROP_CLEAR,
  SKY_HDRI_GAIN,
  downsampleEquirect,
  envIntensityFor,
  skyHdriEntry,
} from './skyIbl'

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
uniform float uSimRain;
uniform float uSimFlash;
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
  // NYC-at-night remaps: the ambient floor (calm gameplay phase) counts as
  // full night for the dome; the corruption flourishes belong ONLY to the
  // deep-night horde band so the calm city reads as a clean metropolis.
  float nMix = smoothstep( 0.0, 0.60, night );
  float deep = smoothstep( 0.78, 1.0, night );
  float day = 1.0 - nMix;

  // --- Deep-night glitch band: a corrupted scanline sweeping up the sky ---
  // Computed FIRST because it shears the azimuth used by everything below,
  // so the whole sky tears sideways inside the band.
  float sweep = fract( uSimTime * 0.09 );
  float win = step( 0.86, sweep ) * deep * uSimFx;
  float bandY = mix( 0.02, 0.55, ( sweep - 0.86 ) / 0.14 );
  float band = win * ( 1.0 - smoothstep( 0.0, 0.045, abs( el - bandY ) ) );
  az += band * ( hash12( vec2( floor( uSimTime * 24.0 ), floor( el * 60.0 ) ) ) - 0.5 ) * 0.6;

  // === DAY: physically-plausible atmosphere ================================
  // Rayleigh-style gradient — pseudo optical depth rises toward the horizon.
  // Zenith recalibrated against the kloofendal HDRI light (a touch deeper and
  // warmer-teal) so the visible dome agrees with what the IBL says the sky is.
  float zen = clamp( el, 0.0, 1.0 );
  float depth = 1.0 - exp( -0.85 / ( zen * 3.6 + 0.18 ) );
  vec3 zenBlue = vec3( 0.066, 0.228, 0.565 );
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

  // === NIGHT: NYC blue-black metropolis dome ===============================
  // A deep blue-black gradient with a warm sodium light-pollution glow
  // hugging the skyline — the classic New-York-at-night halo. The corruption
  // nebula/magenta shift only bleeds in through the DEEP horde band.
  vec3 nightCol = mix( uHorizonNight, vec3( 0.030, 0.048, 0.096 ), smoothstep( 0.0, 0.16, zen ) );
  nightCol = mix( nightCol, vec3( 0.006, 0.010, 0.026 ), smoothstep( 0.16, 0.72, zen ) );
  // (City light-pollution halo is added AFTER the below-horizon hold at the
  // bottom of main() — adding it here clipped at the horizon line and read
  // as a floating "sunset stripe" from high cameras.)
  // Deep corruption night: the nebula returns and the dome shifts magenta.
  nightCol += vec3( 0.10, 0.022, 0.10 ) * ( 0.5 + 0.5 * neb ) * 0.55 * smoothstep( 0.0, 0.25, el ) * deep;
  nightCol = mix( nightCol, nightCol * vec3( 1.5, 0.55, 1.05 ) + vec3( 0.022, 0.002, 0.016 ), deep * 0.6 );

  vec3 col = mix( dayCol, nightCol, nMix );

  // --- Weather: rain fronts grey the dome down; lightning washes it out ----
  float greyL = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( col, vec3( greyL ) * mix( vec3( 0.82, 0.86, 0.94 ), vec3( 0.75, 0.72, 0.9 ), night ), uSimRain * 0.55 );
  col += vec3( 0.75, 0.82, 1.0 ) * uSimFlash * ( 0.22 + 0.5 * smoothstep( 0.0, 0.25, el ) );

  // --- Sun disc / cold moon ------------------------------------------------
  // One hot disc with a soft edge + a tight halo; the sun only exists while
  // the blend sits under the ambient floor (arenas / cinematics) — the night
  // city gets the moon. toneMapped=false, so >1 values feed the bloom pass.
  float disc = smoothstep( 0.99938, 0.99972, mu );
  float halo = pow( muPos, 260.0 );
  vec3 sunCol = vec3( 1.92, 1.52, 1.06 ) * disc + vec3( 1.0, 0.80, 0.52 ) * halo * 0.55;
  float moonDisc = smoothstep( 0.99968, 0.99988, mu );
  vec3 moonCol = vec3( 0.78, 0.86, 1.05 ) * moonDisc + vec3( 0.45, 0.55, 0.85 ) * pow( muPos, 420.0 ) * 0.35;
  // Overcast hides the discs behind the rain deck.
  float overcast = 1.0 - uSimRain * 0.85;
  float sunVis = 1.0 - smoothstep( 0.30, 0.55, night );
  float moonVis = smoothstep( 0.35, 0.60, night );
  col += sunCol * sunVis * smoothstep( -0.03, 0.03, el ) * overcast;
  col += moonCol * moonVis * smoothstep( -0.03, 0.03, el ) * overcast;

  // --- Aurora bands — a whisper by day, corrupted ribbons at DEEP night ----
  float wave = sin( az * 3.0 + uSimTime * 0.10 + sin( el * 6.0 + uSimTime * 0.06 ) * 1.5 );
  float aur = smoothstep( 0.45, 1.0, wave )
    * smoothstep( 0.04, 0.30, el ) * ( 1.0 - smoothstep( 0.55, 0.9, el ) );
  vec3 aurCol = mix( vec3( 0.15, 0.75, 0.62 ), vec3( 0.85, 0.12, 0.38 ), deep );
  col += aurCol * aur * ( 0.05 * day + 0.05 * nMix + 0.26 * deep ) * uSimFx;

  // --- Point stars: full through the night city, pierce the corruption -----
  vec3 sp = d * 46.0;
  vec3 sf = fract( sp ) - 0.5;
  float sh = hash13( floor( sp ) );
  float star = ( 1.0 - smoothstep( 0.0, 0.16, length( sf ) ) ) * step( 0.80, sh );
  float twinkle = 0.65 + 0.35 * sin( uSimTime * ( 1.5 + sh * 5.0 ) + sh * 43.0 );
  col += vec3( 0.9, 0.95, 1.0 ) * star * twinkle * smoothstep( 0.25, 0.58, night ) * smoothstep( 0.05, 0.3, el );

  // --- Horizon grid — the edge of the simulation (MED/HIGH) ----------------
  // A receding perspective plane: parallels compress toward the horizon,
  // meridians converge. Dissolves both upward and right at the fog line.
  // Kept as a whisper through the calm night; flares red in the horde band.
  float persp = 0.045 / ( el + 0.028 );
  float rowLine = smoothstep( 0.80, 0.93, abs( fract( persp - uSimTime * 0.05 ) - 0.5 ) * 2.0 );
  float colLine = smoothstep( 0.88, 0.97, abs( fract( az * 9.549 ) - 0.5 ) * 2.0 );
  float gridFade = smoothstep( 0.012, 0.05, el ) * ( 1.0 - smoothstep( 0.10, 0.34, el ) );
  vec3 gridCol = mix( vec3( 0.30, 0.80, 1.0 ), vec3( 1.0, 0.22, 0.42 ), deep );
  col += gridCol * max( rowLine, colLine * 0.7 ) * gridFade * ( 0.05 * day + 0.04 * nMix + 0.20 * deep ) * uSimFx;

  // below the horizon: hold the fog wall color so the seam never shows.
  // The deep-night corruption shift applies here too (and the scene fog
  // mirrors it in SimulationDriver) — otherwise the horde-night sky meets a
  // blue fog wall in a hard line at the horizon.
  vec3 hor = mix( uHorizonDay, uHorizonNight, nMix );
  hor = mix( hor, hor * vec3( 1.5, 0.55, 1.05 ) + vec3( 0.022, 0.002, 0.016 ), deep * 0.6 );
  col = mix( hor, col, smoothstep( -0.06, 0.0, el ) );

  // City light-pollution halo — applied across BOTH sides of the horizon so
  // the below-horizon hold can't slice it into a hard-edged band. A gentle
  // bump centred just above the skyline, gone by ~16° up and fading smoothly
  // into the fog color a few degrees below the horizon line.
  float cityGlow = smoothstep( -0.05, 0.06, el ) * ( 1.0 - smoothstep( 0.06, 0.28, el ) );
  col += vec3( 0.052, 0.034, 0.018 ) * cityGlow * cityGlow * nMix * ( 1.0 - deep );

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
          uSimRain: SIM.rain,
          uSimFlash: SIM.flash,
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
const ENV_ZEN_DAY = new THREE.Color(0.066, 0.228, 0.565)
// Twins of the NYC blue-black night dome above.
const ENV_MID_NIGHT = new THREE.Color(0.03, 0.048, 0.096)
const ENV_ZEN_NIGHT = new THREE.Color(0.006, 0.01, 0.026)
// Warm sodium city-glow hugging the skyline (light pollution — the ambient
// bounce that keeps the neon city readable at street level).
const ENV_GLOW_NIGHT = new THREE.Color(0.052, 0.034, 0.018)
const ENV_BOUNCE_DAY = new THREE.Color(0.3, 0.28, 0.27)
const ENV_BOUNCE_NIGHT = new THREE.Color(0.055, 0.045, 0.055)

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
    // NYC night: blue-black dome, warm city-glow band at the horizon, a cold
    // moon hotspot for glass/car-paint reflections.
    const a = THREE.MathUtils.smoothstep(zen, 0, 0.16)
    const b = THREE.MathUtils.smoothstep(zen, 0.16, 0.72)
    out.copy(ENV_HOR_NIGHT).lerp(ENV_MID_NIGHT, a).lerp(ENV_ZEN_NIGHT, b)
    const g1 =
      THREE.MathUtils.smoothstep(el, -0.05, 0.06) *
      (1 - THREE.MathUtils.smoothstep(el, 0.06, 0.28))
    const glow = g1 * g1
    out.r += ENV_GLOW_NIGHT.r * glow
    out.g += ENV_GLOW_NIGHT.g * glow
    out.b += ENV_GLOW_NIGHT.b * glow
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

/** One day/night slot of the sky IBL: the live PMREM target + its gain. */
type EnvSlot = {
  target: THREE.WebGLRenderTarget
  /** environmentIntensity calibration for this map (CPU bake = 1). */
  gain: number
}

/**
 * Mount ONE per canvas that wants sky-driven IBL. Generates both env maps at
 * mount and swaps `scene.environment` as the shared night blend crosses 0.5
 * (the CSS dusk overlay + fog lerp hide the swap). Never re-renders.
 *
 * Phase 2 (`hdri`): on MEDIUM+ profiles the two shipped 2K HDRIs (see the
 * asset manifest + skyIbl.ts) lazily replace the CPU bakes. The first frame
 * ALWAYS lights with the instant CPU equirects; each HDRI hot-swaps in the
 * moment it decodes, with a measured gain keeping ambient energy on the same
 * curve so the swap is invisible in exposure terms. The decoded HDR pixels
 * are retained for the app session (module cache) so a WebGL context restore
 * OR a route remount can re-PMREM them without re-downloading/re-decoding;
 * LOW never pays any of this.
 */
/**
 * Decoded (and density-adjusted) HDR equirects, cached for the app session.
 * Re-fetching + RGBE-decoding the 2K sky on every /quest remount burned
 * 100-300ms of main thread right at re-entry; the pixels never change, so
 * decode once and keep them. GPU copies are tracked per-renderer, so a fresh
 * canvas re-uploads from these retained CPU pixels automatically.
 */
const hdrDecoded = new Map<string, Promise<THREE.Texture | null>>()

export const SkyEnvironment = memo(function SkyEnvironment({
  hdri = 'off',
}: {
  /** 'full' = PMREM the 2K HDRIs, 'half' = downsample once first (MEDIUM),
   *  'off' = CPU bakes only (LOW / arenas). */
  hdri?: 'off' | 'half' | 'full'
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const isNightEnv = useRef(false)
  // Baked PMREM env targets live in a ref (not useMemo) so the context-restore
  // handler can rebuild them. After a WebGL context loss three.js re-uploads
  // ordinary textures/geometries by itself, but render-to-texture targets like
  // these PMREM maps come back BLANK — which would leave the entire city with a
  // black image-based light — unless we re-bake them here.
  const envRef = useRef<{ day: EnvSlot; night: EnvSlot } | null>(null)
  // Live gain for the ACTIVE map, read by the per-frame intensity write.
  const gainRef = useRef(1)

  useEffect(() => {
    // Decoded HDR equirects, kept for the life of the mount so a context
    // restore can re-PMREM without re-fetching.
    const hdrRaw: { day?: THREE.Texture; night?: THREE.Texture } = {}
    let disposed = false

    const bakeCpu = () => {
      const pmrem = new THREE.PMREMGenerator(gl)
      const dayEq = makeSkyEquirect(false)
      const nightEq = makeSkyEquirect(true)
      const day: EnvSlot = { target: pmrem.fromEquirectangular(dayEq), gain: 1 }
      const night: EnvSlot = { target: pmrem.fromEquirectangular(nightEq), gain: 1 }
      dayEq.dispose()
      nightEq.dispose()
      pmrem.dispose()
      return { day, night }
    }
    const disposeEnvs = () => {
      envRef.current?.day.target.dispose()
      envRef.current?.night.target.dispose()
      envRef.current = null
    }
    const apply = () => {
      const envs = envRef.current
      if (!envs) return
      const slot = isNightEnv.current ? envs.night : envs.day
      gainRef.current = slot.gain
      scene.environment = slot.target.texture
      scene.environmentIntensity = envIntensityFor(
        SIM.night.value,
        slot.gain,
        hdri === 'off' ? 0.55 : NIGHT_DROP_CLEAR,
      )
    }

    /** PMREM a decoded HDRI into its slot (idempotent; safe on restore). */
    const upgradeSlot = (slot: 'day' | 'night', raw: THREE.Texture) => {
      const envs = envRef.current
      if (!envs) return
      const pmrem = new THREE.PMREMGenerator(gl)
      const next: EnvSlot = {
        target: pmrem.fromEquirectangular(raw),
        gain: SKY_HDRI_GAIN[slot],
      }
      pmrem.dispose()
      envs[slot].target.dispose()
      envs[slot] = next
      apply()
    }

    const loadHdris = async () => {
      // The loader stack (RGBE parser etc.) is dynamically imported so the
      // overworld page chunk stays lean; the .hdr files themselves are static
      // assets fetched on demand.
      //
      // Realism rebuild: only the DAY slot upgrades to the shipped HDRI. The
      // night asset (PolyHaven moonless_golf) is a floodlit grass field — as
      // an environment light it tinted the entire night city mint green. The
      // CPU corruption bake IS the night dome's palette twin, so night keeps
      // it: deep blue-violet ambient that lets the neon carry the scene.
      const loaders = await import('./assetLoaders')
      const decode = async (
        entry: NonNullable<ReturnType<typeof skyHdriEntry>>,
      ): Promise<THREE.Texture | null> => {
        let tex = await loaders.loadTextureWithFallback(
          { path: entry.path, fallbackPath: entry.fallbackPath },
          gl,
        )
        // A failed fetch falls back to a neutral 1×1 stand-in — keep the CPU
        // bake in that case (never PMREM the fallback into the scene light).
        if (tex.mapping !== THREE.EquirectangularReflectionMapping) {
          tex.dispose()
          return null
        }
        // MEDIUM: one mip step down before PMREM — ~4× smaller PMREM target
        // and retained pixels; ambient light is low-frequency anyway.
        if (hdri === 'half') {
          const image = tex.image as { data: Uint16Array | Float32Array; width: number; height: number }
          if (image?.data && image.width > 64) {
            const small = downsampleEquirect(image.data, image.width, image.height)
            const smallTex = new THREE.DataTexture(
              small.data,
              small.width,
              small.height,
              THREE.RGBAFormat,
              small.data instanceof Uint16Array ? THREE.HalfFloatType : THREE.FloatType,
            )
            smallTex.mapping = THREE.EquirectangularReflectionMapping
            // Preserve the loader's orientation/color handling or the halved
            // sky would flip upside down relative to the full-res path.
            smallTex.flipY = tex.flipY
            smallTex.colorSpace = tex.colorSpace
            smallTex.needsUpdate = true
            tex.dispose()
            tex = smallTex
          }
        }
        return tex
      }
      const load = async (slot: 'day' | 'night') => {
        const entry = skyHdriEntry(slot)
        if (!entry) return
        const key = `${entry.path}|${hdri}`
        let pending = hdrDecoded.get(key)
        if (!pending) {
          pending = decode(entry)
          hdrDecoded.set(key, pending)
        }
        const tex = await pending
        if (!tex) {
          // Failed fetch: don't poison the cache — a later mount may succeed.
          hdrDecoded.delete(key)
          return
        }
        if (disposed) return
        hdrRaw[slot] = tex
        upgradeSlot(slot, tex)
      }
      await load('day')
    }

    envRef.current = bakeCpu()
    apply()
    if (hdri !== 'off') void loadHdris()

    // Re-bake once the GPU context is restored (see note above) so the IBL
    // returns instead of staying black after a recovery. Any HDRIs already
    // decoded re-PMREM from their retained pixels.
    const canvas = gl.domElement
    const onRestore = () => {
      disposeEnvs()
      envRef.current = bakeCpu()
      if (hdrRaw.day) upgradeSlot('day', hdrRaw.day)
      if (hdrRaw.night) upgradeSlot('night', hdrRaw.night)
      apply()
    }
    canvas.addEventListener('webglcontextrestored', onRestore, false)

    return () => {
      disposed = true
      canvas.removeEventListener('webglcontextrestored', onRestore, false)
      scene.environment = null
      scene.environmentIntensity = 1
      disposeEnvs()
      // hdrRaw textures are owned by the module-level decode cache now —
      // deliberately NOT disposed, so the next mount skips fetch + decode.
    }
  }, [gl, scene, hdri])

  useFrame(() => {
    const envs = envRef.current
    if (!envs) return
    const n = SIM.night.value
    // Ambient dims with the corruption; one float write per frame, no allocs.
    scene.environmentIntensity = envIntensityFor(
      n,
      gainRef.current,
      hdri === 'off' ? 0.55 : NIGHT_DROP_CLEAR,
    )
    const wantNight = n > 0.5
    if (wantNight !== isNightEnv.current) {
      isNightEnv.current = wantNight
      const slot = wantNight ? envs.night : envs.day
      gainRef.current = slot.gain
      scene.environment = slot.target.texture
    }
  })

  return null
})
