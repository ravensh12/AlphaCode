import { memo, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SIM } from '../simulation'
import { radialGlowTexture } from '../proceduralTextures'
import { LANDMARKS, SCENERY } from '../layout'
import { districtIndexAt } from '../districtTheme'

/* ============================================================================
   Phase 3 — AMBIENT LIFE. Three fully GPU-driven instanced systems that make
   the city breathe without a byte of per-frame CPU:

   - BIRDS: gull silhouettes orbit the six district landmarks (cylindrical
     billboards, wing fold in the vertex shader). They roost at night.
   - STEAM: soft additive wisps rise from rooftop AC units (positions already
     exist in SCENERY.ac) and loop forever, phase-offset per wisp.
   - LEAVES: wind-blown leaves tumble in slow spirals around park trees,
     biased to the Old Town / Mountain districts.

   Every system is ONE draw whose motion derives entirely from the shared SIM
   clock — the same zero-CPU architecture as the rain and the road pulses.
   ========================================================================== */

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Instance base positions + per-instance seeds packed as attributes. */
function instancedQuad(
  w: number,
  h: number,
  bases: { x: number; y: number; z: number }[],
): THREE.InstancedBufferGeometry {
  const quad = new THREE.PlaneGeometry(w, h)
  const geo = new THREE.InstancedBufferGeometry()
  geo.index = quad.index
  geo.attributes.position = quad.attributes.position
  geo.attributes.uv = quad.attributes.uv
  const base = new Float32Array(bases.length * 3)
  const seed = new Float32Array(bases.length * 2)
  const rnd = seededRandom(777001)
  bases.forEach((b, i) => {
    base[i * 3] = b.x
    base[i * 3 + 1] = b.y
    base[i * 3 + 2] = b.z
    seed[i * 2] = rnd()
    seed[i * 2 + 1] = rnd()
  })
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3))
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2))
  geo.instanceCount = bases.length
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
  return geo
}

const BIRD_VERT = /* glsl */ `
uniform float uSimTime;
attribute vec3 aBase;
attribute vec2 aSeed;
varying float vFade;
void main() {
  float r = 9.0 + aSeed.x * 16.0;
  float h = 13.0 + aSeed.y * 22.0;
  float w = ( 0.16 + aSeed.y * 0.1 ) * ( aSeed.x > 0.5 ? 1.0 : -1.0 );
  float ang = uSimTime * w + aSeed.x * 6.2831;
  vec3 center = aBase + vec3( cos( ang ) * r, h + sin( uSimTime * 0.7 + aSeed.y * 9.0 ) * 1.6, sin( ang ) * r );
  // Wing fold: outer verts flap; tangent-billboard along the flight path.
  vec3 fwd = normalize( vec3( -sin( ang ) * w, 0.0, cos( ang ) * w ) );
  vec3 side = normalize( cross( vec3( 0.0, 1.0, 0.0 ), fwd ) );
  float flap = sin( uSimTime * ( 9.0 + aSeed.x * 4.0 ) + aSeed.y * 20.0 );
  vec3 world = center
    + side * position.x
    + fwd * position.y * 0.5
    + vec3( 0.0, abs( position.x ) * flap * 0.7, 0.0 );
  vFade = 1.0;
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`
const BIRD_FRAG = /* glsl */ `
uniform float uSimNight;
varying float vFade;
void main() {
  float a = ( 1.0 - uSimNight ) * 0.85 * vFade;
  if ( a < 0.01 ) discard;
  gl_FragColor = vec4( vec3( 0.16, 0.18, 0.22 ), a );
}
`

const STEAM_VERT = /* glsl */ `
uniform float uSimTime;
attribute vec3 aBase;
attribute vec2 aSeed;
varying vec2 vUvS;
varying float vAlpha;
void main() {
  float cycle = fract( uSimTime * ( 0.10 + aSeed.x * 0.08 ) + aSeed.y );
  float rise = cycle * ( 2.6 + aSeed.x * 2.0 );
  float grow = 0.7 + cycle * 2.0;
  vec3 center = aBase + vec3( sin( uSimTime * 0.6 + aSeed.y * 9.0 ) * cycle * 0.8, 0.9 + rise, 0.0 );
  vec2 toCam = cameraPosition.xz - center.xz;
  vec3 right = normalize( vec3( toCam.y, 0.0, -toCam.x ) + 1e-4 );
  vec3 world = center + right * position.x * grow + vec3( 0.0, position.y * grow, 0.0 );
  vUvS = uv;
  vAlpha = ( 1.0 - cycle ) * ( 0.14 + aSeed.x * 0.08 );
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`
const STEAM_FRAG = /* glsl */ `
uniform sampler2D uGlow;
uniform float uSimNight;
varying vec2 vUvS;
varying float vAlpha;
void main() {
  float mask = texture2D( uGlow, vUvS ).g;
  float a = mask * vAlpha;
  if ( a < 0.008 ) discard;
  vec3 col = mix( vec3( 0.92, 0.94, 0.98 ), vec3( 0.62, 0.58, 0.72 ), uSimNight );
  gl_FragColor = vec4( col, a );
}
`

const LEAF_VERT = /* glsl */ `
uniform float uSimTime;
attribute vec3 aBase;
attribute vec2 aSeed;
varying float vTint;
void main() {
  float cycle = fract( uSimTime * ( 0.07 + aSeed.x * 0.06 ) + aSeed.y );
  float ang = uSimTime * ( 0.8 + aSeed.x ) + aSeed.y * 6.2831;
  float r = 1.2 + aSeed.x * 2.2 + cycle * 1.4;
  // Spiral down from canopy height, then loop back up (re-blown by the wind).
  vec3 center = aBase + vec3( cos( ang ) * r, 3.4 * ( 1.0 - cycle ) + 0.15, sin( ang ) * r );
  float spin = uSimTime * ( 4.0 + aSeed.x * 5.0 );
  vec2 rot = vec2( cos( spin ), sin( spin ) );
  vec3 world = center + vec3(
    position.x * rot.x - position.y * rot.y,
    ( position.x * rot.y + position.y * rot.x ) * 0.6,
    position.x * rot.y + position.y * rot.x );
  vTint = aSeed.x;
  gl_Position = projectionMatrix * viewMatrix * vec4( world, 1.0 );
}
`
const LEAF_FRAG = /* glsl */ `
uniform float uSimNight;
varying float vTint;
void main() {
  vec3 green = vec3( 0.32, 0.55, 0.28 );
  vec3 amber = vec3( 0.78, 0.52, 0.2 );
  vec3 col = mix( green, amber, step( 0.55, vTint ) ) * ( 1.0 - uSimNight * 0.6 );
  gl_FragColor = vec4( col, 0.9 );
}
`

function shaderMat(vert: string, frag: string, extra?: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uSimTime: SIM.time, uSimNight: SIM.night, ...extra },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

export const AmbientLife = memo(function AmbientLife({
  birds,
  steam,
  leaves,
}: {
  birds: number
  steam: number
  leaves: number
}) {
  // Birds circle the landmarks (harbor lighthouse gets a double flock).
  const birdGeo = useMemo(() => {
    if (birds <= 0) return null
    const bases: { x: number; y: number; z: number }[] = []
    for (let i = 0; i < birds; i++) {
      const lm = LANDMARKS[i % 2 === 0 ? 1 : i % LANDMARKS.length]
      bases.push({ x: lm.pos.x, y: 0, z: lm.pos.z })
    }
    return instancedQuad(0.62, 0.2, bases)
  }, [birds])

  // Steam rises from a deterministic subset of rooftop AC boxes (y already
  // carries the roof height in SCENERY.ac).
  const steamGeo = useMemo(() => {
    if (steam <= 0) return null
    const rnd = seededRandom(424242)
    const pool = SCENERY.ac
    const bases: { x: number; y: number; z: number }[] = []
    let guard = 0
    while (bases.length < steam && guard < steam * 20 && pool.length > 0) {
      guard++
      const p = pool[Math.floor(rnd() * pool.length) % pool.length]
      bases.push({ x: p.x, y: p.y ?? 0, z: p.z })
    }
    return instancedQuad(1.2, 1.2, bases)
  }, [steam])

  // Leaves swirl around park trees, biased toward Old Town + the Outskirts.
  const leafGeo = useMemo(() => {
    if (leaves <= 0) return null
    const rnd = seededRandom(515151)
    const pool = SCENERY.tree
    const bases: { x: number; y: number; z: number }[] = []
    let guard = 0
    while (bases.length < leaves && guard < leaves * 40 && pool.length > 0) {
      guard++
      const p = pool[Math.floor(rnd() * pool.length) % pool.length]
      const district = districtIndexAt(p.x, p.z)
      const keep = district === 3 || district === 5 ? 1 : 0.25
      if (rnd() > keep) continue
      bases.push({ x: p.x, y: 0, z: p.z })
    }
    return instancedQuad(0.16, 0.12, bases)
  }, [leaves])

  const mats = useMemo(
    () => ({
      bird: shaderMat(BIRD_VERT, BIRD_FRAG),
      steam: shaderMat(STEAM_VERT, STEAM_FRAG, { uGlow: { value: radialGlowTexture() } }),
      leaf: shaderMat(LEAF_VERT, LEAF_FRAG),
    }),
    [],
  )

  useEffect(
    () => () => {
      birdGeo?.dispose()
      steamGeo?.dispose()
      leafGeo?.dispose()
      mats.bird.dispose()
      mats.steam.dispose()
      mats.leaf.dispose()
    },
    [birdGeo, steamGeo, leafGeo, mats],
  )

  return (
    <group>
      {birdGeo && <mesh geometry={birdGeo} material={mats.bird} frustumCulled={false} />}
      {steamGeo && (
        <mesh geometry={steamGeo} material={mats.steam} frustumCulled={false} renderOrder={18} />
      )}
      {leafGeo && <mesh geometry={leafGeo} material={mats.leaf} frustumCulled={false} />}
    </group>
  )
})
