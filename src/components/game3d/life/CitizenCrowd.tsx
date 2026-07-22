import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM } from '../simulation'
import { radialGlowTexture } from '../proceduralTextures'
import { parseCitizenBank, type CitizenBank } from '../citizenBank'
import {
  buildCitizenRoutes,
  citizenClipFor,
  citizenPoseAt,
  type CitizenPose,
} from '../citizenRoutes'
import { assetById } from '../../../content/assets/assetManifest'

/* ============================================================================
   Phase 3 — CITIZENS. Robot pedestrians stroll the sidewalks by day, baked
   through the ZombieHorde VAT pipeline's Phase-3 extension
   (scripts/bake-citizen-anim.mjs): the Quaternius CC0 "Robot Expressive" rig
   is folded into ONE merged geometry where every vertex rides a single
   carrier bone, and each clip's bone matrices live in a small float texture.

   - One InstancedMesh for the whole crowd (+ one soft blob-shadow draw).
   - Real Idle/Walk cycles per citizen: the vertex shader blends two baked
     frames per vertex; phase/rate follow measured route speed so feet plant.
   - Per-frame CPU is one tiny loop (pose along a tested ping-pong route +
     three attribute writes per citizen) — no allocations, no React state.
   - Citizens de-rez at dusk (they shelter from the corruption), freeing the
     frame exactly when the night horde peaks. The night gate is a single
     visibility write.
   ========================================================================== */

const CITIZEN_URL = `/${assetById('model-citizen-bot')?.path ?? 'assets/models/citizen-bot.bin'}`
/** World height of a citizen (the bake normalizes rest height to meters). */
const CITIZEN_HEIGHT = 1.52

// Start the crowd-bank fetch the moment this module loads (with the page
// chunk, i.e. behind the boot veil) instead of on first render inside a
// post-boot Suspense boundary — the whole sidewalk crowd used to materialize
// a beat AFTER the veil dropped on cold caches.
const withArrayBuffer = (l: THREE.Loader) => {
  ;(l as THREE.FileLoader).setResponseType('arraybuffer')
}
useLoader.preload(THREE.FileLoader, CITIZEN_URL, withArrayBuffer)

const CITIZEN_TINTS = [
  new THREE.Color('#dfe4ea'),
  new THREE.Color('#ffd23f'),
  new THREE.Color('#7fd8ff'),
  new THREE.Color('#ff9e7a'),
  new THREE.Color('#9bf6c3'),
  new THREE.Color('#c9b2ff'),
]

const VERT_PARS = /* glsl */ `
uniform sampler2D uBoneTex;
attribute float aBone;
attribute vec3 aAnim; // x = clip row start, y = frame count, z = phase (frames)
mat4 cBoneMat( const in int row ) {
  int x = int( aBone ) * 4;
  return mat4(
    texelFetch( uBoneTex, ivec2( x, row ), 0 ),
    texelFetch( uBoneTex, ivec2( x + 1, row ), 0 ),
    texelFetch( uBoneTex, ivec2( x + 2, row ), 0 ),
    texelFetch( uBoneTex, ivec2( x + 3, row ), 0 ) );
}
mat4 cSkinMat() {
  float frames = max( aAnim.y - 1.0, 0.0 );
  float f = clamp( aAnim.z, 0.0, frames - 0.0005 );
  mat4 a = cBoneMat( int( aAnim.x + floor( f ) ) );
  mat4 b = cBoneMat( int( aAnim.x + min( floor( f ) + 1.0, frames ) ) );
  return a * ( 1.0 - fract( f ) ) + b * fract( f );
}
`

function makeCitizenMaterial(boneTex: THREE.DataTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.16 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBoneTex = { value: boneTex }
    shader.uniforms.uSimNight = SIM.night
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
mat4 cSkin = cSkinMat();
vec3 objectNormal = normalize( mat3( cSkin ) * vec3( normal ) );
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = ( cSkin * vec4( position, 1.0 ) ).xyz;')
    // Simulation-cyan rim by day, corruption red at night — same language as
    // the horde so every character in the city speaks it.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSimNight;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
{
  vec3 cRimCol = mix( vec3( 0.45, 0.85, 1.0 ), vec3( 1.0, 0.3, 0.3 ), uSimNight );
  float cRim = pow( 1.0 - abs( dot( normalize( normal ), normalize( vViewPosition ) ) ), 3.0 );
  outgoingLight += cRimCol * cRim * 0.22;
}
#include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'citizen-vat-v1'
  return mat
}

export const CitizenCrowd = memo(function CitizenCrowd({ count }: { count: number }) {
  const buf = useLoader(THREE.FileLoader, CITIZEN_URL, withArrayBuffer) as unknown as ArrayBuffer

  const bank = useMemo<CitizenBank>(() => parseCitizenBank(buf), [buf])
  const routes = useMemo(() => buildCitizenRoutes(count), [count])

  const assets = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(bank.positions, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(bank.normals, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(bank.colors, 3))
    geo.setAttribute('aBone', new THREE.BufferAttribute(bank.bones, 1))
    geo.setIndex(new THREE.BufferAttribute(bank.indices, 1))
    geo.computeBoundingSphere()
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(routes.length * 3), 3)
    anim.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aAnim', anim)

    const tex = new THREE.DataTexture(
      bank.texture,
      bank.header.width,
      bank.header.height,
      THREE.RGBAFormat,
      THREE.FloatType,
    )
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true

    const material = makeCitizenMaterial(tex)
    const blobGeo = new THREE.CircleGeometry(0.42, 16)
    blobGeo.rotateX(-Math.PI / 2)
    const blobMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.24,
      alphaMap: radialGlowTexture(),
      depthWrite: false,
      fog: false,
    })
    return { geo, anim, tex, material, blobGeo, blobMat }
  }, [bank, routes.length])

  useEffect(
    () => () => {
      assets.geo.dispose()
      assets.tex.dispose()
      assets.material.dispose()
      assets.blobGeo.dispose()
      assets.blobMat.dispose()
    },
    [assets],
  )

  const meshRef = useRef<THREE.InstancedMesh>(null)
  const blobRef = useRef<THREE.InstancedMesh>(null)
  const groupRef = useRef<THREE.Group>(null)

  // Seed instance colors once (outfit tints per route).
  useEffect(() => {
    const m = meshRef.current
    if (!m) return
    routes.forEach((r, i) => m.setColorAt(i, CITIZEN_TINTS[r.tint % CITIZEN_TINTS.length]))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [routes])

  const scratch = useMemo(
    () => ({
      o: new THREE.Object3D(),
      pose: { x: 0, z: 0, heading: 0 } as CitizenPose,
      phases: new Float32Array(count),
      // 1 = currently written as a hidden (zero-scale) instance.
      hidden: new Uint8Array(count),
    }),
    [count],
  )

  const scale = CITIZEN_HEIGHT / Math.max(0.001, bank.header.restHeight)
  const walkClip = bank.clipByName.get('Walk')!
  const idleClip = bank.clipByName.get('Idle')!

  // Citizens beyond this range freeze: no pose math, no matrix writes, no
  // skinned draw (their instance collapses to zero scale). The fog has fully
  // dissolved a 1.5m pedestrian long before 130m.
  const CITIZEN_ACTIVE_RADIUS = 130

  useFrame((state, dtRaw) => {
    const g = groupRef.current
    const m = meshRef.current
    const blob = blobRef.current
    if (!g || !m || !blob) return
    // Citizens walk the calm neon night (NYC identity — the sidewalks stay
    // alive) and shelter only through the deep corruption/horde phase.
    const daylight = SIM.night.value < 0.85
    if (g.visible !== daylight) g.visible = daylight
    if (!daylight) return

    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const { o, pose, phases, hidden } = scratch
    const animArr = assets.anim.array as Float32Array
    const camX = state.camera.position.x
    const camZ = state.camera.position.z
    const r2 = CITIZEN_ACTIVE_RADIUS * CITIZEN_ACTIVE_RADIUS
    let wrote = false

    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]
      citizenPoseAt(r, t, pose)
      const dx = pose.x - camX
      const dz = pose.z - camZ
      if (dx * dx + dz * dz > r2) {
        // Far: park a zero-scale matrix once and skip all per-frame work.
        if (!hidden[i]) {
          hidden[i] = 1
          o.position.set(pose.x, -10, pose.z)
          o.rotation.set(0, 0, 0)
          o.scale.setScalar(0.0001)
          o.updateMatrix()
          m.setMatrixAt(i, o.matrix)
          blob.setMatrixAt(i, o.matrix)
          wrote = true
        }
        continue
      }
      hidden[i] = 0
      o.position.set(pose.x, 0, pose.z)
      o.rotation.set(0, pose.heading, 0)
      o.scale.setScalar(scale)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)

      o.position.y = 0.02
      o.scale.setScalar(1)
      o.updateMatrix()
      blob.setMatrixAt(i, o.matrix)

      // Walk cycle rate follows route speed so feet plant instead of skating.
      const { clip, rate } = citizenClipFor(r.speed)
      const meta = clip === 'Walk' ? walkClip : idleClip
      const maxF = meta.frames - 1
      phases[i] = (phases[i] + rate * meta.fps * dt) % maxF
      const base = i * 3
      animArr[base] = meta.row
      animArr[base + 1] = meta.frames
      animArr[base + 2] = phases[i]
      wrote = true
    }
    if (wrote) {
      m.instanceMatrix.needsUpdate = true
      blob.instanceMatrix.needsUpdate = true
      assets.anim.needsUpdate = true
    }
  })

  if (count <= 0) return null
  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={meshRef}
        args={[assets.geo, assets.material, routes.length]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={blobRef}
        args={[assets.blobGeo, assets.blobMat, routes.length]}
        frustumCulled={false}
        renderOrder={1}
      />
    </group>
  )
})
