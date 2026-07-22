import { forwardRef, memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BlendFunction, Effect } from 'postprocessing'
import * as THREE from 'three'
import { SIM, SUN_DIR } from './simulation'

/* ============================================================================
   Phase 2 — ULTRA-only dawn/dusk god rays for the overworld.

   A single fused screen-space pass (no separate light-buffer render, no
   geometry): march the composer's input buffer toward the sun's screen
   position, accumulating only bright texels with per-step decay. Where the
   sky (or its >1 sun disc, which is toneMapped:false) peeks between the
   towers, warm shafts streak outward; buildings occlude them for free
   because their texels fail the luminance threshold.

   The pass is keyed to the day↔night transition: SUN_DIR is fixed in this
   world, so "sun elevation" is expressed by the corruption blend — shafts
   swell through the dusk/dawn window (SIM.night ≈ 0.5), vanish at full day
   and full night, hide behind rain overcast, and fade out as the camera
   turns away from the sun. Idle cost is one uniform branch per pixel.
   ========================================================================== */

const SHAFT_FRAG = /* glsl */ `
uniform vec2 uSunPos;
uniform float uIntensity;
uniform vec3 uColor;

#define SHAFT_SAMPLES 22

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uIntensity < 0.004) {
    outputColor = vec4(0.0);
    return;
  }
  vec2 delta = (uSunPos - uv) * (0.72 / float(SHAFT_SAMPLES));
  vec2 p = uv;
  float weight = 1.0;
  float acc = 0.0;
  for (int i = 0; i < SHAFT_SAMPLES; i++) {
    p += delta;
    vec3 s = texture2D(inputBuffer, p).rgb;
    float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
    acc += max(0.0, l - 0.55) * weight;
    weight *= 0.93;
  }
  // Normalize, roll off with distance from the sun so shafts stay anchored.
  float falloff = 1.0 - smoothstep(0.15, 0.85, distance(uv, uSunPos));
  outputColor = vec4(uColor * acc * (uIntensity / float(SHAFT_SAMPLES)) * falloff, 1.0);
}
`

class DuskShaftEffect extends Effect {
  constructor() {
    super('DuskShaftEffect', SHAFT_FRAG, {
      blendFunction: BlendFunction.ADD,
      uniforms: new Map<string, THREE.Uniform>([
        ['uSunPos', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uIntensity', new THREE.Uniform(0)],
        ['uColor', new THREE.Uniform(new THREE.Color('#ffd9a0'))],
      ]),
    })
  }
}

const _sunWorld = new THREE.Vector3()
const _camDir = new THREE.Vector3()

/**
 * ULTRA post pass. Render inside the overworld `EffectComposer` pass list.
 * Uniform updates run per frame; the effect object itself is stable so the
 * composer never rebuilds because of it.
 */
export const DuskLightShafts = memo(
  forwardRef<Effect>(function DuskLightShafts(_props, ref) {
    const camera = useThree((s) => s.camera)
    const effect = useMemo(() => new DuskShaftEffect(), [])
    const sunUv = useRef(new THREE.Vector2(0.5, 0.5))

    useEffect(() => () => effect.dispose(), [effect])

    useFrame(() => {
      const n = SIM.night.value
      // Dusk/dawn window — the low-sun moments of the blend. Closes BEFORE
      // the NYC ambient floor (0.62) so the permanent night city never runs
      // a crepuscular pass; only the brief boot ramp crosses this window,
      // and that happens behind the loading veil.
      const window =
        smoothstep01((n - 0.1) / 0.28) * (1 - smoothstep01((n - 0.45) / 0.14))
      let intensity = 0.62 * window
      if (intensity > 0.001) {
        // Fade as the camera turns away; kill entirely when the sun is behind.
        camera.getWorldDirection(_camDir)
        const facing = _camDir.dot(SUN_DIR)
        intensity *= smoothstep01((facing - 0.05) / 0.4)
        // Rain overcast buries the sun.
        intensity *= 1 - SIM.rain.value * 0.85
      }
      if (intensity > 0.001) {
        _sunWorld.copy(SUN_DIR).multiplyScalar(200).add(camera.position).project(camera)
        sunUv.current.set(_sunWorld.x * 0.5 + 0.5, _sunWorld.y * 0.5 + 0.5)
        const uSun = effect.uniforms.get('uSunPos')
        if (uSun) (uSun.value as THREE.Vector2).copy(sunUv.current)
      }
      const uInt = effect.uniforms.get('uIntensity')
      if (uInt) uInt.value = intensity
    })

    return <primitive ref={ref} object={effect} dispose={null} />
  }),
)

function smoothstep01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x
  return t * t * (3 - 2 * t)
}
