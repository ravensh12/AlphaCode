import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import {
  GROUND_HALF,
  BIOME_TINTS,
  SCENERY,
  ROADS,
  ROAD_LINES,
  ROAD_HALF_W,
  CITY_LIMIT,
  roadRoute,
  type Prop,
  type Building,
  type Vec2,
  type Landmark,
} from './layout'
import {
  SIM,
  applyFacadeAtlas,
  applyHologramResolve,
  applyNightDim,
  applyNightEmissive,
  applyNightFade,
  applyRoadPulse,
  applyStreetDecal,
  applyTrafficCycle,
  applyTreeSway,
  applyWetResponse,
} from './simulation'
import {
  asphaltMaps,
  concreteMaps,
  coneGlowTexture,
  decalAtlasTexture,
  facadeMaps,
  radialGlowTexture,
} from './proceduralTextures'
import { facadeAtlasTextures, roomAtlasTexture, signGlyphAtlasTexture } from './facadeAtlas'
import {
  buildBuildingDressing,
  buildingAppearance,
  furnitureTint,
  type DressItem,
} from './districtTheme'
import {
  keptBuildings,
  useMeshyHiddenBuildings,
  useMeshyKeptScenery,
} from './meshy/meshySwap'
import { buildStreetDecals } from './streetDecals'
import { buildInstancePack } from './proximityCulling'
import { useProximityInstances } from './ProximityInstances'
import type { QualityTier } from './cinematic/quality'
import type { FacadeMode } from '../../lib/graphicsQuality'
import type { World } from '../../content/adventure'

/* ------------------------------------------------------------------ Ground */

export const Ground = memo(function Ground() {
  // Concrete micro-detail tiles every ~6m via the texture transform (the
  // circle's planar UVs span the full 1944m diameter).
  const pavementMat = useMemo(() => {
    const maps = concreteMaps()
    const repeat = (GROUND_HALF * 2.7) / 6
    const normal = maps.normal.clone()
    const rough = maps.roughness.clone()
    normal.repeat.set(repeat, repeat)
    rough.repeat.set(repeat, repeat)
    // Phase 2: pavement soaks when SIM.rain rises (darker albedo, glossy
    // puddle pools that reflect the sky env). Uniform-gated; free while dry.
    // Value dropped from the old #aeb2ba: under the ACES sun the pavement
    // blew out to a snow-white sheet; this keeps it reading as street concrete.
    // NYC night: sidewalks dim toward black after dark (applyNightDim) so
    // they stop reading as glowing gray sheets under the night IBL, and the
    // wet response keeps its permanent night sheen.
    return applyNightDim(
      applyWetResponse(
        new THREE.MeshStandardMaterial({
          color: '#989da6',
          roughness: 0.96,
          metalness: 0.02,
          normalMap: normal,
          normalScale: new THREE.Vector2(0.7, 0.7),
          roughnessMap: rough,
        }),
      ),
      0.52,
    )
  }, [])
  // Free the material + its cloned detail textures on unmount (the source
  // concreteMaps() textures are shared singletons and are left untouched).
  useEffect(
    () => () => {
      pavementMat.normalMap?.dispose()
      pavementMat.roughnessMap?.dispose()
      pavementMat.dispose()
    },
    [pavementMat],
  )
  return (
    <group>
      {/* sidewalk / pavement base */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow position={[0, 0, 0]} material={pavementMat}>
        <circleGeometry args={[GROUND_HALF * 1.35, 96]} />
      </mesh>
      {/* soft district colour wash on the pavement */}
      {BIOME_TINTS.map((b, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[b.center.x, 0.02 + i * 0.004, b.center.z]}>
          <circleGeometry args={[b.radius, 48]} />
          <meshBasicMaterial color={b.color} transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
})

/* ------------------------------------------------------------------- Roads */

/**
 * Phase 3 — the real-asphalt hot-swap. The road material mounts instantly on
 * the procedural detail maps, then upgrades in place to the shipped PolyHaven
 * asphalt KTX2 set (diffuse/normal/ARM) the moment it decodes. Every map slot
 * is populated from frame one, so the swap changes texture *contents* only —
 * no define flips, no shader recompile, no hitch. Decoded textures are cached
 * module-wide; revisits never refetch.
 */
const ASPHALT_KTX2 = [
  { id: 'tex-asphalt-diff', path: 'assets/textures/asphalt/asphalt_diff.ktx2', srgb: true },
  { id: 'tex-asphalt-nor', path: 'assets/textures/asphalt/asphalt_nor.ktx2', srgb: false },
  { id: 'tex-asphalt-arm', path: 'assets/textures/asphalt/asphalt_arm.ktx2', srgb: false },
] as const

let asphaltKtx2Cache: Promise<(THREE.Texture | null)[]> | null = null

function loadAsphaltSet(gl: THREE.WebGLRenderer): Promise<(THREE.Texture | null)[]> {
  if (!asphaltKtx2Cache) {
    asphaltKtx2Cache = import('./assetLoaders').then((loaders) =>
      Promise.all(
        ASPHALT_KTX2.map(async (spec) => {
          try {
            const tex = await loaders.loadTextureWithFallback(
              { path: spec.path, srgb: spec.srgb },
              gl,
            )
            // A 1×1 neutral fallback means the fetch/transcode failed — keep
            // the procedural maps instead of flattening the road.
            const img = tex.image as { width?: number } | undefined
            if (!img || (img.width ?? 0) < 4) {
              tex.dispose()
              return null
            }
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping
            tex.anisotropy = 4
            return tex
          } catch {
            return null
          }
        }),
      ),
    )
  }
  return asphaltKtx2Cache
}

/** White 1×1 stand-in so `map` exists pre-swap (keeps USE_MAP stable). */
function whiteTexture(): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  tex.needsUpdate = true
  return tex
}

/** Asphalt avenues + dashed centre lines laid over the pavement. */
export const Roads = memo(function Roads() {
  const gl = useThree((s) => s.gl)
  const dash = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.5, 3.4)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  // Plain painted centre-line — a slightly muted yellow so it reads as road
  // paint, not a light source (the animated data-pulse treatment is retired).
  const dashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#c9ae4a' }),
    [],
  )
  const dashRef = useRef<THREE.InstancedMesh>(null)

  const dashes = useMemo(() => {
    const list: { x: number; z: number; rot: number }[] = []
    for (const r of ROADS) {
      const len = r.vertical ? r.d : r.w
      const n = Math.floor(len / 8)
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + 4 + i * 8
        if (r.vertical) list.push({ x: r.x, z: t, rot: 0 })
        else list.push({ x: t, z: r.z, rot: Math.PI / 2 })
      }
    }
    return list
  }, [])

  useEffect(() => {
    const m = dashRef.current
    if (!m) return
    const d = new THREE.Object3D()
    dashes.forEach((p, i) => {
      d.position.set(p.x, 0.05, p.z)
      d.rotation.set(0, p.rot, 0)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    // Without this the bounding sphere stays at the origin-centred base geometry,
    // so turning the camera frustum-culls the whole dashed line set and the
    // yellow road lines blink out. Recompute it to span the actual city grid.
    m.computeBoundingSphere()
  }, [dashes])

  // Phase 3 — ONE merged geometry for every avenue. The 38 per-strip planes
  // were 38 draw calls through one material; the merge reclaims 37 of them
  // (funding the whole city-life layer). World-space UVs come from the road
  // pulse patch, so the merged mesh needs no per-strip UV bookkeeping.
  const roadGeo = useMemo(() => {
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (const r of ROADS) {
      const x0 = r.x - r.w / 2
      const x1 = r.x + r.w / 2
      const z0 = r.z - r.d / 2
      const z1 = r.z + r.d / 2
      const base = pos.length / 3
      pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1)
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
      uv.push(0, 0, 1, 0, 1, 1, 0, 1)
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeBoundingSphere()
    return g
  }, [])

  // Data-pulse road network: emissive packets race along every avenue (M3).
  // The asphalt mounts on procedural PBR detail and hot-swaps to the shipped
  // KTX2 set (see loadAsphaltSet); wet response composes after the pulse so
  // it reuses the same world-space anchor (vSimWorldPos).
  const asphaltMat = useMemo(() => {
    const maps = asphaltMaps()
    return applyWetResponse(
      applyRoadPulse(
        new THREE.MeshStandardMaterial({
          color: '#33363e',
          map: whiteTexture(),
          roughness: 1.0,
          metalness: 0.04,
          normalMap: maps.normal,
          normalScale: new THREE.Vector2(0.8, 0.8),
          roughnessMap: maps.roughness,
        }),
        1 / 6,
      ),
    )
  }, [])

  // Upgrade the material's map contents in place once the KTX2 set decodes.
  useEffect(() => {
    let cancelled = false
    void loadAsphaltSet(gl).then(([diff, nor, arm]) => {
      if (cancelled) return
      if (diff) {
        asphaltMat.map?.dispose()
        asphaltMat.map = diff
        // The photo albedo carries the tone — lift the tint so the multiply
        // lands back on today's asphalt value.
        asphaltMat.color.set('#888d95')
      }
      if (nor) {
        asphaltMat.normalMap = nor
        asphaltMat.normalScale.set(0.55, 0.55)
      }
      if (arm) asphaltMat.roughnessMap = arm
      asphaltMat.needsUpdate = false // same defines — texture binds only
    })
    return () => {
      cancelled = true
    }
  }, [gl, asphaltMat])

  // White base so per-instance colors carry the full tone (instanceColor
  // multiplies the material color); weathering jitter is applied per segment.
  const curbMat = useMemo(
    () => applyWetResponse(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })),
    [],
  )
  // Phase 3 — real curb profile: a chamfered trapezoid prism instead of the
  // old sheer box, so kerbs catch a highlight along their beveled arris.
  const curbGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    // Cross-section in (x, y): bottom ±0.5 → top ±0.34, unit length along z.
    const pos = new Float32Array([
      // south end ring (z = -0.5) then north ring (z = +0.5)
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.34, 1, -0.5, -0.34, 1, -0.5,
      -0.5, 0, 0.5, 0.5, 0, 0.5, 0.34, 1, 0.5, -0.34, 1, 0.5,
    ])
    const idx = [
      // west slant, east slant, top
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
      3, 7, 6, 3, 6, 2,
      // end caps
      0, 3, 2, 0, 2, 1,
      4, 5, 6, 4, 6, 7,
    ]
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [])
  const curbRef = useRef<THREE.InstancedMesh>(null)

  // Kerb segments live between consecutive grid lines, leaving a gap at every
  // intersection so cross-streets stay open.
  const curbs = useMemo(() => {
    const list: { x: number; z: number; len: number; horizontal: boolean }[] = []
    const offset = ROAD_HALF_W + 0.3
    const gap = ROAD_HALF_W + 1.2
    for (const line of ROAD_LINES) {
      for (let k = 0; k < ROAD_LINES.length - 1; k++) {
        const a = ROAD_LINES[k]
        const b = ROAD_LINES[k + 1]
        const mid = (a + b) / 2
        const len = b - a - gap * 2
        if (len < 4) continue
        if (Math.hypot(line, mid) > CITY_LIMIT + 4) continue
        // vertical road at x=line → kerbs run along z
        list.push({ x: line - offset, z: mid, len, horizontal: false })
        list.push({ x: line + offset, z: mid, len, horizontal: false })
        // horizontal road at z=line → kerbs run along x
        list.push({ x: mid, z: line - offset, len, horizontal: true })
        list.push({ x: mid, z: line + offset, len, horizontal: true })
      }
    }
    return list
  }, [])

  useEffect(() => {
    const m = curbRef.current
    if (!m) return
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    curbs.forEach((c, i) => {
      d.position.set(c.x, 0, c.z)
      d.rotation.set(0, c.horizontal ? Math.PI / 2 : 0, 0)
      d.scale.set(0.6, 0.16, c.len)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      // Kerb weathering: each poured segment cures/soils a little differently
      // (deterministic position hash). Same draw call — instanceColor only.
      const h = Math.sin(c.x * 12.9898 + c.z * 78.233) * 43758.5453
      const jitter = 0.72 + (h - Math.floor(h)) * 0.14 // 0.72..0.86 of white
      col.setScalar(jitter)
      m.setColorAt(i, col)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [curbs])

  // Free the road geometries + materials on unmount. Disposing the materials
  // does NOT touch the shared asphaltMaps() / KTX2 cache textures.
  useEffect(
    () => () => {
      dash.dispose()
      dashMat.dispose()
      roadGeo.dispose()
      asphaltMat.dispose()
      curbMat.dispose()
      curbGeo.dispose()
    },
    [dash, dashMat, roadGeo, asphaltMat, curbMat, curbGeo],
  )

  return (
    <group>
      <mesh geometry={roadGeo} material={asphaltMat} position={[0, 0.03, 0]} receiveShadow />
      <instancedMesh ref={curbRef} args={[curbGeo, curbMat, Math.max(1, curbs.length)]} receiveShadow />
      {/* Centre-line dashes span the whole city; never frustum-cull them or they
          blink out as you turn / move between checkpoints. */}
      <instancedMesh
        ref={dashRef}
        args={[dash, dashMat, Math.max(1, dashes.length)]}
        frustumCulled={false}
      />
    </group>
  )
})

/* ----------------------------------------------------------- Street decals */

/**
 * Phase 3 — the street decal layer: every manhole, drain, lane arrow, crack,
 * oil stain, rain puddle, and crosswalk band in the city as ONE instanced
 * draw (placement is pure + tested — see streetDecals.ts). On decal tiers
 * this also carries the crosswalks, replacing the legacy per-stripe boxes.
 */
export const StreetDecals = memo(function StreetDecals() {
  const decals = useMemo(() => buildStreetDecals(true), [])

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.rotateX(-Math.PI / 2)
    const arr = new Float32Array(decals.length * 2)
    decals.forEach((d, i) => {
      arr[i * 2] = d.tile
      arr[i * 2 + 1] = d.rainOnly
    })
    g.setAttribute('aDecal', new THREE.InstancedBufferAttribute(arr, 2))
    return g
  }, [decals])

  const mat = useMemo(
    () =>
      applyWetResponse(
        applyStreetDecal(
          new THREE.MeshStandardMaterial({
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            roughness: 0.85,
            metalness: 0,
          }),
          decalAtlasTexture(),
        ),
      ),
    [],
  )

  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    decals.forEach((it, i) => {
      d.position.set(it.x, 0.045, it.z)
      d.rotation.set(0, it.rot, 0)
      d.scale.set(it.sx, 1, it.sz)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [decals])

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )

  return (
    <instancedMesh
      ref={ref}
      args={[geo, mat, Math.max(1, decals.length)]}
      receiveShadow
      renderOrder={2}
    />
  )
})

/* -------------------------------------------------------------- Instancing */

function Instanced({
  geometry,
  material,
  items,
  // City clutter spans the whole map, so each instanced mesh's bounding sphere
  // always intersects the (player-following) shadow frustum — meaning the entire
  // set is re-rendered into the shadow map every frame for thousands of
  // instances. The visible payoff is tiny (the light only covers ~46m around the
  // hero), so props default to NOT casting/receiving shadows. The ground still
  // catches the hero's shadow, which is the one that actually reads.
  shadow = false,
  palette,
  colorFor,
  cullRadius,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  items: readonly Prop[]
  shadow?: boolean
  palette?: string[]
  /** Phase 3 — position-aware tinting (district street-furniture palettes). */
  colorFor?: (item: Prop) => string
  /** Player-bubble cull radius (m); undefined renders the full set. */
  cullRadius?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const pack = useMemo(
    () =>
      buildInstancePack(items, {
        place: (it, d) => {
          d.position.set(it.x, it.y ?? 0, it.z)
          d.rotation.set(0, it.r, 0)
          d.scale.setScalar(it.s)
        },
        color: colorFor
          ? (it) => colorFor(it)
          : palette && palette.length
            ? (it) => {
                const h = Math.abs(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5)
                return palette[Math.floor((h % 1) * palette.length)]
              }
            : undefined,
      }),
    [items, palette, colorFor],
  )
  // Grow-only capacity: the kept lists shrink/grow as the Meshy swap rings
  // move with the player; recreating the InstancedMesh (fresh GPU buffers)
  // for every list change was a per-ring-crossing hitch while sprinting.
  // The first render sees the full SCENERY list, so this never regrows.
  const capacityRef = useRef(1)
  if (items.length > capacityRef.current) capacityRef.current = items.length
  useProximityInstances(ref, pack, cullRadius)
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, capacityRef.current]}
      castShadow={shadow}
      receiveShadow={shadow}
    />
  )
}

/* ----------------------------------------------------------- City buildings */

const BUILD_COLORS = ['#d8d2c4', '#cdd3da', '#c6b9a6', '#b9c2cc', '#d9c9b0', '#c2c6cd']
const ROOF_COLORS = ['#3c414b', '#473f3a', '#42474f']
const CAR_COLORS = ['#e8534e', '#3a86ff', '#ffd23f', '#14d39a', '#ededed', '#9b6bff']
/** Lawn-ring tints for the grass beds under street trees. */
const GRASS_COLORS = ['#4f7c38', '#557f3b', '#487235', '#5b8742']

/** Fraction of the tallest buildings that join the shadow pass (ULTRA/HIGH). */
const SHADOW_CASTER_FRACTION = 0.15
/** Skyline shadow casters only participate this close to the hero (m). */
const SHADOW_CASTER_RADIUS = 110

/** Every building drawn as two instanced meshes (body + roof cap). */
function CityBuildings({
  items,
  shadowCasters = false,
  facadeMode = 'legacy',
  atlasFull = true,
  cullRadius,
}: {
  items: Building[]
  shadowCasters?: boolean
  /** 'legacy' = pre-Phase-3 facade (LOW); 'atlas'/'interior' = style atlas. */
  facadeMode?: FacadeMode
  atlasFull?: boolean
  /** Player-bubble cull radius (m); undefined renders the full skyline. */
  cullRadius?: number
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null)
  const roofRef = useRef<THREE.InstancedMesh>(null)
  const casterRef = useRef<THREE.InstancedMesh>(null)
  const styled = facadeMode !== 'legacy'
  // Legacy PBR facade family (LOW tier) — generated once, shared by every
  // building so both instanced meshes stay a single draw call each.
  const facade = useMemo(() => (styled ? null : facadeMaps()), [styled])

  // Per-instance facade look (atlas style + window lit-bias). Kept as a pack
  // "extra" so the proximity compactor rewrites it in lockstep with the
  // matrices — instance i's facade must always describe instance i.
  const facadeData = useMemo(() => {
    if (!styled) return null
    const arr = new Float32Array(items.length * 2)
    items.forEach((it, i) => {
      const look = buildingAppearance(it)
      arr[i * 2] = look.style
      arr[i * 2 + 1] = look.litBias
    })
    return arr
  }, [styled, items])

  const bodyGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  // Phase 3 — the styled body geometry carries the per-instance facade
  // attributes the facade shader reads. The attribute gets its OWN copy of
  // the data (the pack keeps the pristine source the compactor reads from).
  // The plain bodyGeo stays untouched for the shadow-caster proxy mesh.
  const styledGeo = useMemo(() => {
    if (!styled || !facadeData) return null
    const g = bodyGeo.clone()
    g.setAttribute('aFacade', new THREE.InstancedBufferAttribute(new Float32Array(facadeData), 2))
    return g
  }, [styled, bodyGeo, facadeData])
  const roofGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])

  // Phase 2 — skyline shadows: the tallest ~15% of buildings (the towers that
  // actually throw readable shadows across avenues) get a THIRD instanced
  // mesh that exists only for the shadow pass. Its material writes neither
  // color nor depth, so the camera pass rasterizes nothing visible, while the
  // shadow pass (which swaps in its own depth material and only skips
  // `material.visible === false`) renders all of them in ONE depth draw per
  // cascade. The full 900-building set stays out of the shadow pass.
  const tallItems = useMemo(() => {
    if (!shadowCasters) return []
    const sorted = [...items].sort((a, b) => b.h - a.h)
    return sorted.slice(0, Math.max(1, Math.ceil(sorted.length * SHADOW_CASTER_FRACTION)))
  }, [items, shadowCasters])
  const casterMat = useMemo(
    () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    [],
  )
  // Living Simulation: the shared hologram-resolve patch turns far buildings
  // into compiling holograms (see simulation.ts). LEGACY: the old canvas
  // facade with `officeWindows`. STYLED (Phase 3): the 8-style meter-space
  // atlas with the ported office schedule + parallax interior-mapped windows
  // (applyFacadeAtlas carries the same hologram block, so the compile-world
  // effect survives the re-skin identically).
  const bodyMat = useMemo(() => {
    if (!styled) {
      return applyHologramResolve(
        new THREE.MeshStandardMaterial({
          map: facade!.map,
          emissiveMap: facade!.emissive,
          emissive: new THREE.Color('#fff0cf'),
          emissiveIntensity: 1.0,
          roughness: 1.0,
          metalness: 0.06,
          normalMap: facade!.normal,
          roughnessMap: facade!.roughness,
          envMapIntensity: 0.9,
        }),
        true,
      )
    }
    const atlas = facadeAtlasTextures(atlasFull ? 'full' : 'half')
    return applyFacadeAtlas(
      new THREE.MeshStandardMaterial({
        roughness: 1.0,
        metalness: 0.06,
        envMapIntensity: 0.9,
      }),
      { map: atlas.map, emissive: atlas.emissive, data: atlas.data, rooms: roomAtlasTexture() },
      facadeMode === 'interior',
    )
  }, [styled, facade, facadeMode, atlasFull])
  // Roof caps go near-black at night (real cities read as dark slabs from
  // above — the lit windows below carry the silhouette).
  const roofMat = useMemo(
    () => applyNightDim(applyHologramResolve(new THREE.MeshStandardMaterial({ roughness: 0.9 })), 0.42),
    [],
  )

  // Buildings keep rendering a little past the bubble edge in proportion to
  // their size — a tower's wall can be near you while its center is far, and
  // tall silhouettes vanishing early reads as popping instead of atmosphere.
  const buildingPad = (it: Building) => Math.max(it.w, it.d) * 0.5 + it.h * 0.3

  const bodyPack = useMemo(
    () =>
      buildInstancePack(
        items,
        {
          place: (it, d) => {
            d.position.set(it.x, 0, it.z)
            d.rotation.set(0, it.r, 0)
            d.scale.set(it.w, it.h, it.d)
          },
          color: (it) =>
            styled ? buildingAppearance(it).wall : BUILD_COLORS[it.color % BUILD_COLORS.length],
          pad: buildingPad,
        },
        facadeData ? [{ name: 'aFacade', size: 2, data: facadeData }] : [],
      ),
    [items, styled, facadeData],
  )
  const roofPack = useMemo(
    () =>
      buildInstancePack(items, {
        place: (it, d) => {
          d.position.set(it.x, it.h, it.z)
          d.rotation.set(0, it.r, 0)
          d.scale.set(it.w + 0.6, 0.7, it.d + 0.6)
        },
        color: (it) =>
          styled ? buildingAppearance(it).roof : ROOF_COLORS[it.roof % ROOF_COLORS.length],
        pad: buildingPad,
      }),
    [items, styled],
  )
  // Shadow casters only matter inside the sun cascade's follow box (±34m
  // around the hero) plus the longest shadow throw — a tight bubble.
  const casterPack = useMemo(
    () =>
      buildInstancePack(tallItems, {
        place: (it, d) => {
          d.position.set(it.x, 0, it.z)
          d.rotation.set(0, it.r, 0)
          d.scale.set(it.w, it.h, it.d)
        },
        pad: buildingPad,
      }),
    [tallItems],
  )
  useProximityInstances(bodyRef, bodyPack, cullRadius)
  useProximityInstances(roofRef, roofPack, cullRadius)
  useProximityInstances(
    casterRef,
    casterPack,
    cullRadius === undefined ? undefined : Math.min(cullRadius, SHADOW_CASTER_RADIUS),
  )

  // Free the building geometries + materials on unmount. Disposing bodyMat
  // does NOT touch the shared facadeMaps()/facadeAtlasTextures() singletons.
  useEffect(
    () => () => {
      bodyGeo.dispose()
      styledGeo?.dispose()
      roofGeo.dispose()
      bodyMat.dispose()
      roofMat.dispose()
      casterMat.dispose()
    },
    [bodyGeo, styledGeo, roofGeo, bodyMat, roofMat, casterMat],
  )

  return (
    <group>
      {/* No shadows on the FULL set: casting/receiving would push ~900
          instances through every shadow cascade each frame. The tall-subset
          caster mesh below carries the skyline shadows instead. */}
      <instancedMesh
        ref={bodyRef}
        args={[styledGeo ?? bodyGeo, bodyMat, Math.max(1, items.length)]}
      />
      <instancedMesh ref={roofRef} args={[roofGeo, roofMat, Math.max(1, items.length)]} />
      {tallItems.length > 0 && (
        <instancedMesh
          ref={casterRef}
          args={[bodyGeo, casterMat, tallItems.length]}
          castShadow
        />
      )}
    </group>
  )
}

/* ------------------------------------------------------ building dressing */

/** Non-uniformly scaled instanced set (crowns / awnings) with per-item color. */
function DressedInstanced({
  geometry,
  material,
  items,
  cullRadius,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  items: DressItem[]
  cullRadius?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const pack = useMemo(
    () =>
      buildInstancePack(items, {
        place: (it, d) => {
          d.position.set(it.x, it.y, it.z)
          d.rotation.set(0, it.ry, 0)
          d.scale.set(it.sx, it.sy, it.sz)
        },
        color: (it) => it.color,
      }),
    [items],
  )
  useProximityInstances(ref, pack, cullRadius)
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, items.length)]} />
}

/**
 * Phase 3 — silhouette variety + district signage, three instanced draws:
 * tower setback crowns, shop awnings, and emissive code-glyph holo-signs
 * (violet quarter runs 4× density). All placements are pure + deterministic
 * (districtTheme.buildBuildingDressing) and live inside existing collider
 * footprints, so gameplay never changes.
 */
const BuildingDressing = memo(function BuildingDressing({
  cullRadius,
}: {
  cullRadius?: number
}) {
  const dressing = useMemo(() => buildBuildingDressing(), [])

  const crownGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const awningGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, -0.5, 0.5) // hangs below its anchor, projecting outward
    return g
  }, [])
  const crownMat = useMemo(
    () => applyHologramResolve(new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.12 })),
    [],
  )
  const awningMat = useMemo(
    () => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
    [],
  )

  // Holo-signs: instanced quads with a per-instance glyph tile + accent color
  // packed into one vec4 attribute; alpha breathes and flares after dark.
  const signData = useMemo(() => {
    const arr = new Float32Array(dressing.signs.length * 4)
    const col = new THREE.Color()
    dressing.signs.forEach((s, i) => {
      col.set(s.color)
      arr[i * 4] = col.r
      arr[i * 4 + 1] = col.g
      arr[i * 4 + 2] = col.b
      arr[i * 4 + 3] = s.glyph
    })
    return arr
  }, [dressing.signs])
  const signGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    // Own copy: the pack keeps the pristine source the compactor reads from.
    g.setAttribute('aSign', new THREE.InstancedBufferAttribute(new Float32Array(signData), 4))
    return g
  }, [signData])
  const signMat = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSimTime: SIM.time,
        uSimNight: SIM.night,
        uGlyphs: { value: signGlyphAtlasTexture() },
      },
      vertexShader: /* glsl */ `
attribute vec4 aSign;
varying vec2 vGUv;
varying vec3 vGCol;
varying float vGSeed;
void main() {
  float tile = aSign.w;
  vec2 o = vec2( mod( tile, 4.0 ) * 0.25, tile < 4.0 ? 0.5 : 0.0 );
  vGUv = o + uv * vec2( 0.25, 0.5 );
  vGCol = aSign.rgb;
  vGSeed = tile * 17.31 + aSign.r * 41.0;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`,
      fragmentShader: /* glsl */ `
uniform sampler2D uGlyphs;
uniform float uSimTime;
uniform float uSimNight;
varying vec2 vGUv;
varying vec3 vGCol;
varying float vGSeed;
void main() {
  float a = texture2D( uGlyphs, vGUv ).r;
  if ( a < 0.06 ) discard;
  float breathe = 0.82 + 0.18 * sin( uSimTime * 1.7 + vGSeed );
  float amp = ( 0.5 + uSimNight * 1.9 ) * breathe;
  gl_FragColor = vec4( vGCol * amp * 2.0, a * ( 0.55 + uSimNight * 0.45 ) );
}`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    })
    return mat
  }, [])

  useEffect(
    () => () => {
      crownGeo.dispose()
      awningGeo.dispose()
      signGeo.dispose()
      crownMat.dispose()
      awningMat.dispose()
      signMat.dispose()
    },
    [crownGeo, awningGeo, signGeo, crownMat, awningMat, signMat],
  )

  const signRef = useRef<THREE.InstancedMesh>(null)
  const signPack = useMemo(
    () =>
      buildInstancePack(
        dressing.signs,
        {
          place: (s, d) => {
            d.position.set(s.x, s.y, s.z)
            d.rotation.set(0, s.ry, 0)
            d.scale.set(s.sx, s.sy, 1)
          },
        },
        [{ name: 'aSign', size: 4, data: signData }],
      ),
    [dressing.signs, signData],
  )
  useProximityInstances(signRef, signPack, cullRadius)

  return (
    <group>
      <DressedInstanced
        geometry={crownGeo}
        material={crownMat}
        items={dressing.crowns}
        cullRadius={cullRadius}
      />
      <DressedInstanced
        geometry={awningGeo}
        material={awningMat}
        items={dressing.awnings}
        cullRadius={cullRadius}
      />
      {dressing.signs.length > 0 && (
        <instancedMesh ref={signRef} args={[signGeo, signMat, dressing.signs.length]} />
      )}
    </group>
  )
})

/**
 * Hides its children until the shared night blend actually rises, so the
 * additive streetlight volumes cost literally nothing during the day (their
 * shader fades them with uSimNight² anyway — this skips the draws entirely).
 */
function NightOnly({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const on = SIM.night.value > 0.02
    if (g.visible !== on) g.visible = on
  })
  return (
    <group ref={ref} visible={false}>
      {children}
    </group>
  )
}

/** The whole city rendered as a handful of instanced draw calls. */
export const InstancedWorld = memo(function InstancedWorld({
  tier = 'high',
  buildingShadows = false,
  facadeMode = 'legacy',
  facadeAtlasFull = true,
  cullRadius,
}: {
  /** Gates the night street-lighting layer: HIGH every lamp, MED half, LOW off. */
  tier?: QualityTier
  /** ULTRA/HIGH profiles: tallest ~15% of buildings join the shadow casters. */
  buildingShadows?: boolean
  /** Phase 3 facade pipeline (profile-driven; 'legacy' = today's LOW look). */
  facadeMode?: FacadeMode
  facadeAtlasFull?: boolean
  /**
   * Player-bubble cull radius in meters (profile-driven). Buildings use the
   * full radius; street-level clutter fades from view far earlier anyway, so
   * each family gets a proportionally tighter bubble. Undefined = render all.
   */
  cullRadius?: number
}) {
  const styled = facadeMode !== 'legacy'
  // Per-family bubbles: things you can only resolve up close cull sooner.
  const buildingR = cullRadius
  const dressR = cullRadius === undefined ? undefined : cullRadius * 0.8
  const treeR = cullRadius === undefined ? undefined : cullRadius * 0.7
  const propR = cullRadius === undefined ? undefined : cullRadius * 0.55
  // Rooftop clutter culls with the props (≤165m): the Meshy rooftop band
  // covers the street NEAR ring (170m guaranteed), so a primitive tank/AC
  // box is never inside the visible bubble while the band is live.
  const roofR = cullRadius === undefined ? undefined : cullRadius * 0.55
  const nightR = cullRadius === undefined ? undefined : cullRadius * 0.5
  const geo = useMemo(() => {
    // Grass bed under every tree: a ground disc that reads as a lawn ring /
    // planter bed, so street trees never look planted straight into concrete.
    const grassBed = new THREE.CircleGeometry(1.7, 20)
    grassBed.rotateX(-Math.PI / 2)
    grassBed.translate(0, 0.045, 0)

    const trunk = new THREE.CylinderGeometry(0.18, 0.26, 1.8, 6)
    trunk.translate(0, 0.9, 0)
    const canopy = new THREE.IcosahedronGeometry(1.5, 0)
    canopy.translate(0, 2.7, 0)
    const bush = new THREE.IcosahedronGeometry(0.8, 0)
    bush.translate(0, 0.5, 0)

    const lampPost = new THREE.CylinderGeometry(0.1, 0.14, 4.2, 6)
    lampPost.translate(0, 2.1, 0)
    const lampHead = new THREE.BoxGeometry(0.5, 0.26, 0.5)
    lampHead.translate(0, 4.25, 0)

    const benchSeat = new THREE.BoxGeometry(2, 0.16, 0.6)
    benchSeat.translate(0, 0.5, 0)
    const benchBack = new THREE.BoxGeometry(2, 0.5, 0.12)
    benchBack.translate(0, 0.85, -0.24)

    const carBody = new THREE.BoxGeometry(2, 0.7, 4.2)
    carBody.translate(0, 0.55, 0)
    const carCabin = new THREE.BoxGeometry(1.8, 0.6, 2.2)
    carCabin.translate(0, 1.15, -0.1)

    const hydrant = new THREE.CylinderGeometry(0.22, 0.26, 0.9, 8)
    hydrant.translate(0, 0.45, 0)

    // rooftop water tank (cylinder on stubby legs, sits at building height via y)
    const roofTank = new THREE.CylinderGeometry(1, 1, 1.6, 10)
    roofTank.translate(0, 1.4, 0)
    // rooftop AC / vent box
    const acBox = new THREE.BoxGeometry(1.6, 0.9, 1.6)
    acBox.translate(0, 0.45, 0)

    // traffic light: tall pole + signal head
    const tlPost = new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6)
    tlPost.translate(0, 2.7, 0)
    const tlHead = new THREE.BoxGeometry(0.42, 1.1, 0.42)
    tlHead.translate(0, 5.1, 0.25)

    // trash can
    const trash = new THREE.CylinderGeometry(0.38, 0.32, 1, 10)
    trash.translate(0, 0.5, 0)
    const trashLid = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10)
    trashLid.translate(0, 1.05, 0)

    // crosswalk stripe (flat on the road)
    const stripe = new THREE.BoxGeometry(0.55, 0.04, 4)
    stripe.translate(0, 0.05, 0)

    // M3: fake streetlight beam — an open cone from the lamp head to the
    // ground — plus a soft light pool decal where it lands. NO real lights:
    // both are additive fluff that only exists after dark (applyNightFade).
    const lightCone = new THREE.CylinderGeometry(0.24, 2.3, 4.1, 12, 1, true)
    lightCone.translate(0, 2.06, 0)
    const lightPool = new THREE.CircleGeometry(2.5, 24)
    lightPool.rotateX(-Math.PI / 2)
    lightPool.translate(0, 0.03, 0)

    return {
      grassBed, trunk, canopy, bush, lampPost, lampHead, benchSeat, benchBack, carBody, carCabin, hydrant,
      roofTank, acBox, tlPost, tlHead, trash, trashLid, stripe, lightCone, lightPool,
    }
  }, [])

  const mat = useMemo(
    () => ({
      // Base stays white — the per-instance GRASS_COLORS tint carries the hue.
      grass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
      bark: new THREE.MeshStandardMaterial({ color: '#7c5532', roughness: 1 }),
      // Foliage sways in a lazy wind (vertex shader, per-instance phase).
      // Styled tiers hand the color to per-instance district tints (base must
      // be white for the multiply); legacy keeps today's fixed greens.
      leaf: applyTreeSway(
        new THREE.MeshStandardMaterial({
          color: styled ? '#ffffff' : '#3f9e54',
          flatShading: true,
          roughness: 0.9,
        }),
      ),
      bush: applyTreeSway(
        new THREE.MeshStandardMaterial({
          color: styled ? '#ffffff' : '#4fae5a',
          flatShading: true,
          roughness: 1,
        }),
        0.04,
      ),
      lampPost: new THREE.MeshStandardMaterial({ color: '#2c2f38', roughness: 0.6, metalness: 0.3 }),
      // Heads idle at a pilot glow by day and flare sodium-warm after dark.
      lampHead: applyNightEmissive(
        new THREE.MeshStandardMaterial({ color: '#ffe6a8', emissive: '#ffcf6a', emissiveIntensity: 1.4 }),
        0.18,
        1.9,
      ),
      bench: new THREE.MeshStandardMaterial({ color: styled ? '#ffffff' : '#8a6a44', roughness: 0.9 }),
      // Glossy metallic paint + smooth glass: both drink from the baked sky
      // env, so parked cars catch a real sun glare and mirror the dusk sky.
      carBody: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.28, metalness: 0.65, envMapIntensity: 1.25 }),
      carCabin: new THREE.MeshStandardMaterial({ color: '#3a4a5c', roughness: 0.08, metalness: 0.9, envMapIntensity: 1.5, emissive: '#22344a', emissiveIntensity: 0.12 }),
      hydrant: new THREE.MeshStandardMaterial({ color: '#d23b46', roughness: 0.7 }),
      roofMetal: new THREE.MeshStandardMaterial({ color: '#9aa1ab', roughness: 0.6, metalness: 0.5 }),
      acMetal: new THREE.MeshStandardMaterial({ color: '#b9bec6', roughness: 0.7, metalness: 0.3 }),
      tlPost: new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.6, metalness: 0.4 }),
      // Signal heads run a real green→amber→red cycle, per intersection.
      tlHead: applyTrafficCycle(
        new THREE.MeshStandardMaterial({ color: '#15181d', emissive: '#ffae3c', emissiveIntensity: 0.5, roughness: 0.5 }),
      ),
      trash: new THREE.MeshStandardMaterial({ color: '#2f6b46', roughness: 0.8 }),
      trashLid: new THREE.MeshStandardMaterial({ color: '#24563a', roughness: 0.7 }),
      stripe: new THREE.MeshBasicMaterial({ color: '#eef0f2', toneMapped: false }),
      // Additive night-only streetlight volumetrics: a fake beam cone + a
      // warm pool on the pavement. Fog off (additive + fog = haze bloom);
      // alpha rides uSimNight² so they simply don't exist by day.
      lightCone: applyNightFade(
        new THREE.MeshBasicMaterial({
          color: '#ffd9a0',
          transparent: true,
          opacity: 0.16,
          alphaMap: coneGlowTexture(),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
          toneMapped: false,
        }),
      ),
      lightPool: applyNightFade(
        new THREE.MeshBasicMaterial({
          color: '#ffce8a',
          transparent: true,
          opacity: 0.42,
          alphaMap: radialGlowTexture(),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
          toneMapped: false,
        }),
      ),
    }),
    [styled],
  )

  // Phase 3 — district street-furniture palettes (styled tiers only).
  const tintCanopy = useMemo(
    () => (styled ? (it: Prop) => furnitureTint('canopy', it.x, it.z) : undefined),
    [styled],
  )
  const tintBush = useMemo(
    () => (styled ? (it: Prop) => furnitureTint('planter', it.x, it.z) : undefined),
    [styled],
  )
  const tintBench = useMemo(
    () => (styled ? (it: Prop) => furnitureTint('bench', it.x, it.z) : undefined),
    [styled],
  )

  // Tier-gated street lighting: every lamp on HIGH, every other on MED,
  // none on LOW (the emissive heads still glow there, just no volumetrics).
  const lightStep = tier === 'high' ? 1 : tier === 'med' ? 2 : 0
  const litLamps = useMemo(
    () => (lightStep === 0 ? [] : SCENERY.lamp.filter((_, i) => i % lightStep === 0)),
    [lightStep],
  )

  // Meshy prop swaps (MEDIUM+): instances the lazy Meshy city layer renders
  // as real models are dropped from these primitive batches. On LOW (and
  // until any model decodes) every list keeps the original SCENERY identity,
  // so the pre-Meshy draw list is untouched. The night light cones above
  // deliberately keep the FULL lamp list — the Meshy lamp stands on the
  // exact same spot, so its volumetrics stay put.
  const kept = useMeshyKeptScenery()
  // Showpiece structures replace a handful of primitive mid-rises 1:1 (same
  // box, same collider); the original identity returns when nothing is live.
  const hiddenBuildings = useMeshyHiddenBuildings()
  const keptBuildingList = useMemo(
    () => keptBuildings(SCENERY.building, hiddenBuildings) as Building[],
    [hiddenBuildings],
  )

  // Free every generated geometry + material on unmount. Material.dispose does
  // NOT free the shared cone/radial-glow singleton textures they reference.
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose()
      for (const m of Object.values(mat)) m.dispose()
    },
    [geo, mat],
  )

  return (
    <group>
      <CityBuildings
        items={keptBuildingList}
        shadowCasters={buildingShadows}
        facadeMode={facadeMode}
        atlasFull={facadeAtlasFull}
        cullRadius={buildingR}
      />
      {styled && <BuildingDressing cullRadius={dressR} />}

      {/* grass beds ride the FULL tree list (not the kept list): when the
          Meshy layer swaps a primitive tree for a real model on the same
          spot, the lawn ring under it must stay put. */}
      <Instanced geometry={geo.grassBed} material={mat.grass} items={SCENERY.tree} palette={GRASS_COLORS} shadow={false} cullRadius={treeR} />
      <Instanced geometry={geo.trunk} material={mat.bark} items={kept.tree} cullRadius={treeR} />
      <Instanced geometry={geo.canopy} material={mat.leaf} items={kept.tree} colorFor={tintCanopy} cullRadius={treeR} />
      {/* planter bushes cull with the PROPS (≤165m), not the trees: the
          Meshy planter swap covers the 170m NEAR ring, so the icosahedron
          bush — the owner's "blocky bushes" — never renders inside view. */}
      <Instanced geometry={geo.bush} material={mat.bush} items={kept.planter} shadow={false} colorFor={tintBush} cullRadius={propR} />

      <Instanced geometry={geo.benchSeat} material={mat.bench} items={kept.bench} colorFor={tintBench} cullRadius={propR} />
      <Instanced geometry={geo.benchBack} material={mat.bench} items={kept.bench} colorFor={tintBench} cullRadius={propR} />

      <Instanced geometry={geo.carBody} material={mat.carBody} items={kept.car} palette={CAR_COLORS} cullRadius={propR} />
      <Instanced geometry={geo.carCabin} material={mat.carCabin} items={kept.car} cullRadius={propR} />

      <Instanced geometry={geo.hydrant} material={mat.hydrant} items={kept.hydrant} cullRadius={propR} />

      <Instanced geometry={geo.lampPost} material={mat.lampPost} items={kept.lamp} cullRadius={propR} />
      <Instanced geometry={geo.lampHead} material={mat.lampHead} items={kept.lamp} shadow={false} cullRadius={propR} />
      {/* night-only fake light volumes (no real lights, no shadow casters) */}
      {litLamps.length > 0 && (
        <NightOnly>
          <Instanced geometry={geo.lightCone} material={mat.lightCone} items={litLamps} shadow={false} cullRadius={nightR} />
          <Instanced geometry={geo.lightPool} material={mat.lightPool} items={litLamps} shadow={false} cullRadius={nightR} />
        </NightOnly>
      )}

      {/* rooftop clutter — read at building height via per-item y; the
          wave-2 Meshy rooftop band replaces these near the player once its
          models land (kept lists shrink exactly like the street furniture) */}
      <Instanced geometry={geo.roofTank} material={mat.roofMetal} items={kept.rooftop} cullRadius={roofR} />
      <Instanced geometry={geo.acBox} material={mat.acMetal} items={kept.ac} cullRadius={roofR} />

      {/* intersections — styled tiers get painted crosswalk decals instead of
          the raised stripe boxes (one reclaimed draw + a worn-paint look). */}
      <Instanced geometry={geo.tlPost} material={mat.tlPost} items={SCENERY.trafficLight} cullRadius={propR} />
      <Instanced geometry={geo.tlHead} material={mat.tlHead} items={SCENERY.trafficLight} shadow={false} cullRadius={propR} />
      {!styled && (
        <Instanced geometry={geo.stripe} material={mat.stripe} items={SCENERY.crosswalk} shadow={false} cullRadius={propR} />
      )}

      {/* trash cans */}
      <Instanced geometry={geo.trash} material={mat.trash} items={kept.trashCan} cullRadius={propR} />
      <Instanced geometry={geo.trashLid} material={mat.trashLid} items={kept.trashCan} shadow={false} cullRadius={propR} />
    </group>
  )
})

/* -------------------------------------------------------------- Checkpoints */

export type CheckpointVisual = {
  world: World
  pos: Vec2
  locked: boolean
  cleared: boolean
  active: boolean
  /** Hide the floating map label (completion is shown in the list instead). */
  hideLabel?: boolean
}

export function CheckpointPortal({ world, pos, locked, cleared, active }: Omit<CheckpointVisual, 'hideLabel'>) {
  const doorGlow = useRef<THREE.MeshStandardMaterial>(null)
  const threshold = useRef<THREE.MeshStandardMaterial>(null)
  const invite = useRef<THREE.Group>(null)
  const inviteRing = useRef<THREE.Mesh>(null)

  const accent = locked ? '#9a93c0' : world.theme.accent
  const soft = locked ? '#d8d5e0' : world.theme.accentSoft
  const plaster = locked ? '#c3bfce' : '#efe7d6'
  const roofCol = locked ? '#9b97a8' : '#b5563f'
  const warm = '#ffe6a8'

  // Entrance (front face, +Z) points toward the map center.
  const facing = Math.atan2(-pos.x, -pos.z)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (active) {
      const pulse = 0.9 + Math.sin(t * 2.6) * 0.55
      if (doorGlow.current) doorGlow.current.emissiveIntensity = Math.max(0.2, pulse)
      if (threshold.current) threshold.current.emissiveIntensity = Math.max(0.25, pulse * 0.9)
      if (invite.current) invite.current.position.y = 3.7 + Math.sin(t * 2.2) * 0.22
      if (inviteRing.current) inviteRing.current.rotation.z += 0.02
    }
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* Foundation / plinth */}
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[9.8, 0.5, 8.8]} />
        <meshStandardMaterial color={soft} roughness={0.95} />
      </mesh>

      {/* Walls */}
      <mesh position={[0, 3, 0]} receiveShadow castShadow>
        <boxGeometry args={[9, 5, 8]} />
        <meshStandardMaterial color={plaster} roughness={0.9} />
      </mesh>

      {/* Corner pilasters (trim accent) */}
      {[-4.4, 4.4].map((x) =>
        [-3.9, 3.9].map((z) => (
          <mesh key={`${x}_${z}`} position={[x, 3, z]} castShadow>
            <boxGeometry args={[0.5, 5.2, 0.5]} />
            <meshStandardMaterial color={accent} roughness={0.7} />
          </mesh>
        )),
      )}

      {/* Hipped roof with overhang */}
      <mesh position={[0, 6.9, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[7.1, 3.4, 4]} />
        <meshStandardMaterial color={roofCol} flatShading roughness={0.85} />
      </mesh>

      {/* Decorative banner over the entrance (accent) */}
      <mesh position={[0, 4.6, 4.06]}>
        <boxGeometry args={[5.2, 0.7, 0.12]} />
        <meshStandardMaterial color={accent} roughness={0.7} emissive={accent} emissiveIntensity={locked ? 0 : 0.25} />
      </mesh>

      {/* ----- Arched doorway on the front face ----- */}
      {/* Dark interior recess */}
      <mesh position={[0, 1.35, 3.55]}>
        <boxGeometry args={[1.9, 2.7, 0.9]} />
        <meshStandardMaterial color="#15171f" roughness={1} />
      </mesh>
      <mesh position={[0, 2.7, 3.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.9, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#15171f" roughness={1} />
      </mesh>

      {/* Door side trim posts */}
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 1.35, 4.02]} castShadow>
          <boxGeometry args={[0.28, 2.8, 0.28]} />
          <meshStandardMaterial
            ref={x < 0 ? doorGlow : undefined}
            color={accent}
            emissive={accent}
            emissiveIntensity={locked ? 0 : active ? 0.9 : 0.5}
            roughness={0.6}
          />
        </mesh>
      ))}
      {/* Arched trim above the door */}
      <mesh position={[0, 2.75, 4.02]}>
        <torusGeometry args={[0.95, 0.14, 8, 20, Math.PI]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={locked ? 0 : active ? 0.9 : 0.5}
          roughness={0.6}
        />
      </mesh>

      {/* Locked: bars across the doorway */}
      {locked && (
        <group>
          {[-0.55, 0, 0.55].map((x) => (
            <mesh key={x} position={[x, 1.5, 3.95]}>
              <boxGeometry args={[0.16, 2.7, 0.16]} />
              <meshStandardMaterial color="#7d788f" roughness={0.8} metalness={0.2} />
            </mesh>
          ))}
        </group>
      )}

      {/* Warm threshold glow (only when not locked) */}
      {!locked && (
        <mesh position={[0, 0.06, 4.7]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 1.6]} />
          <meshStandardMaterial
            ref={threshold}
            color={accent}
            emissive={accent}
            emissiveIntensity={active ? 0.9 : 0.45}
            transparent
            opacity={0.55}
            roughness={1}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Front windows with a faint warm glow */}
      {[-3, 3].map((x) => (
        <mesh key={x} position={[x, 3.1, 4.02]}>
          <boxGeometry args={[1.1, 1.4, 0.12]} />
          <meshStandardMaterial
            color={locked ? '#6f6a82' : warm}
            emissive={warm}
            emissiveIntensity={locked ? 0 : 0.55}
            roughness={0.5}
          />
        </mesh>
      ))}

      {/* Active: floating ring + downward arrow inviting entry */}
      {active && (
        <group ref={invite} position={[0, 3.7, 4.4]}>
          <mesh ref={inviteRing}>
            <torusGeometry args={[0.55, 0.09, 8, 22]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} />
          </mesh>
          <mesh position={[0, -0.05, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.32, 0.55, 4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} flatShading />
          </mesh>
        </group>
      )}

      {/* Cleared: flag + checkmark on the roof */}
      {cleared && (
        <group position={[0, 8.5, 0]}>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 1.8, 6]} />
            <meshStandardMaterial color="#cfcad9" roughness={0.7} />
          </mesh>
          <mesh position={[0.7, 1.1, 0]}>
            <boxGeometry args={[1.3, 0.8, 0.06]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} roughness={0.7} />
          </mesh>
        </group>
      )}

    </group>
  )
}

export function BossTotem({ world, pos, locked, cleared, hideLabel }: Omit<CheckpointVisual, 'active'>) {
  const sigil = useRef<THREE.MeshStandardMaterial>(null)
  const eyeL = useRef<THREE.MeshStandardMaterial>(null)
  const eyeR = useRef<THREE.MeshStandardMaterial>(null)

  const red = '#ff5a5f'
  const glow = !locked
  const baseIntensity = locked ? 0 : cleared ? 0.5 : 1.6
  const stone = locked ? '#4a4756' : cleared ? '#3c3947' : '#46424f'
  const darkStone = locked ? '#3d3a47' : '#322f3a'

  // Gate (front face, +Z) faces the map center.
  const facing = Math.atan2(-pos.x, -pos.z)

  useFrame((state) => {
    if (!glow) return
    const pulse = baseIntensity + Math.sin(state.clock.elapsedTime * 3) * (cleared ? 0.15 : 0.6)
    if (sigil.current) sigil.current.emissiveIntensity = Math.max(0.1, pulse)
    if (eyeL.current) eyeL.current.emissiveIntensity = Math.max(0.1, pulse)
    if (eyeR.current) eyeR.current.emissiveIntensity = Math.max(0.1, pulse)
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* Base platform */}
      <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
        <boxGeometry args={[11, 0.8, 8]} />
        <meshStandardMaterial color={darkStone} roughness={1} flatShading />
      </mesh>

      {/* Main keep */}
      <mesh position={[0, 4, 0]} receiveShadow castShadow>
        <boxGeometry args={[8, 7, 6]} />
        <meshStandardMaterial color={stone} roughness={1} flatShading />
      </mesh>

      {/* Battlement merlons / jagged crown */}
      {[-3, -1.8, -0.6, 0.6, 1.8, 3].map((x) => (
        <mesh key={x} position={[x, 7.9, 2.6]} castShadow>
          <boxGeometry args={[0.9, 1.2, 0.9]} />
          <meshStandardMaterial color={darkStone} roughness={1} flatShading />
        </mesh>
      ))}

      {/* Flanking towers with menacing horns */}
      {[-4.4, 4.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 5, 0]} castShadow>
            <cylinderGeometry args={[1.4, 1.7, 10, 6]} />
            <meshStandardMaterial color={stone} roughness={1} flatShading />
          </mesh>
          {/* Twin horns */}
          <mesh position={[-0.6, 10.4, 0]} rotation={[0, 0, 0.35]} castShadow>
            <coneGeometry args={[0.5, 2.4, 5]} />
            <meshStandardMaterial color={darkStone} roughness={1} flatShading />
          </mesh>
          <mesh position={[0.6, 10.4, 0]} rotation={[0, 0, -0.35]} castShadow>
            <coneGeometry args={[0.5, 2.4, 5]} />
            <meshStandardMaterial color={darkStone} roughness={1} flatShading />
          </mesh>
        </group>
      ))}

      {/* Roof spikes on the keep */}
      {[-2, 0, 2].map((x) => (
        <mesh key={x} position={[x, 8.6, -1]} rotation={[0, 0, 0]} castShadow>
          <coneGeometry args={[0.55, 2, 5]} />
          <meshStandardMaterial color={darkStone} roughness={1} flatShading />
        </mesh>
      ))}

      {/* ----- Arched gate on the front face ----- */}
      <mesh position={[0, 1.9, 2.7]}>
        <boxGeometry args={[2.8, 3.8, 1.0]} />
        <meshStandardMaterial color="#0c0b10" roughness={1} />
      </mesh>
      <mesh position={[0, 3.8, 2.7]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.4, 1.4, 1.0, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#0c0b10" roughness={1} />
      </mesh>

      {/* Portcullis bars */}
      {[-1, -0.5, 0, 0.5, 1].map((x) => (
        <mesh key={`v${x}`} position={[x, 2, 3.18]}>
          <boxGeometry args={[0.14, 4, 0.14]} />
          <meshStandardMaterial color="#2a2730" roughness={0.7} metalness={0.4} />
        </mesh>
      ))}
      {[1, 2.6].map((y) => (
        <mesh key={`h${y}`} position={[0, y, 3.18]}>
          <boxGeometry args={[2.6, 0.14, 0.14]} />
          <meshStandardMaterial color="#2a2730" roughness={0.7} metalness={0.4} />
        </mesh>
      ))}

      {/* Glowing sigil above the gate */}
      <mesh position={[0, 6, 3.06]} rotation={[0, 0, Math.PI / 4]}>
        <torusGeometry args={[0.7, 0.13, 4, 16]} />
        <meshStandardMaterial ref={sigil} color={red} emissive={red} emissiveIntensity={baseIntensity} flatShading />
      </mesh>
      <mesh position={[0, 6, 3.0]}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color={red} emissive={red} emissiveIntensity={baseIntensity} flatShading />
      </mesh>

      {/* Menacing eyes on the keep */}
      <mesh position={[-1.2, 6.6, 3.02]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial ref={eyeL} color={red} emissive={red} emissiveIntensity={baseIntensity} />
      </mesh>
      <mesh position={[1.2, 6.6, 3.02]}>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial ref={eyeR} color={red} emissive={red} emissiveIntensity={baseIntensity} />
      </mesh>

      {/* Cleared: cracks across the gate */}
      {cleared && (
        <mesh position={[0.3, 4, 3.04]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.12, 5, 0.06]} />
          <meshStandardMaterial color="#1c1a22" roughness={1} />
        </mesh>
      )}

      {!hideLabel && (
        <Html position={[0, 12.2, 0]} center distanceFactor={55} occlude={false} zIndexRange={[40, 0]}>
          <div className={`cp-label boss ${locked ? 'is-locked' : ''}`}>
            <span className="cp-label-name">Level {world.index + 1}</span>
            <span className="cp-label-sub">{locked ? 'Sealed' : 'Boss'}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

/** Enterable lesson-part building — solid walls, glowing doorway when active. */
export function GateBuilding({
  pos,
  color,
  active,
}: {
  pos: Vec2
  color: string
  active: boolean
}) {
  const doorGlow = useRef<THREE.MeshStandardMaterial>(null)
  const threshold = useRef<THREE.MeshStandardMaterial>(null)
  const invite = useRef<THREE.Group>(null)

  const accent = color
  const soft = '#e8e4f4'
  const plaster = '#f2ebe0'
  const roofCol = '#6a4a38'
  const facing = Math.atan2(-pos.x, -pos.z)

  useFrame((state) => {
    if (!active) return
    const t = state.clock.elapsedTime
    const pulse = 0.85 + Math.sin(t * 2.4) * 0.55
    if (doorGlow.current) doorGlow.current.emissiveIntensity = Math.max(0.25, pulse)
    if (threshold.current) threshold.current.emissiveIntensity = Math.max(0.2, pulse * 0.85)
    if (invite.current) invite.current.position.y = 3.2 + Math.sin(t * 2) * 0.18
  })

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, facing, 0]}>
      {/* foundation */}
      <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
        <boxGeometry args={[8.2, 0.44, 7.2]} />
        <meshStandardMaterial color={soft} roughness={0.95} />
      </mesh>

      {/* walls — solid, you can't walk through */}
      <mesh position={[0, 2.6, 0]} receiveShadow castShadow>
        <boxGeometry args={[7.6, 4.6, 6.6]} />
        <meshStandardMaterial color={plaster} roughness={0.92} />
      </mesh>

      {/* roof */}
      <mesh position={[0, 5.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[5.8, 2.6, 4]} />
        <meshStandardMaterial color={roofCol} flatShading roughness={0.88} />
      </mesh>

      {/* accent trim */}
      <mesh position={[0, 4.2, 3.35]}>
        <boxGeometry args={[4.4, 0.55, 0.12]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={active ? 0.5 : 0.2} roughness={0.65} />
      </mesh>

      {/* doorway recess */}
      <mesh position={[0, 1.25, 3.15]}>
        <boxGeometry args={[1.7, 2.5, 0.85]} />
        <meshStandardMaterial color="#12141c" roughness={1} />
      </mesh>
      <mesh position={[0, 2.45, 3.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.85, 0.85, 0.85, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#12141c" roughness={1} />
      </mesh>

      {/* door frame glow */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 1.25, 3.42]} castShadow>
          <boxGeometry args={[0.22, 2.5, 0.22]} />
          <meshStandardMaterial
            ref={x < 0 ? doorGlow : undefined}
            color={accent}
            emissive={accent}
            emissiveIntensity={active ? 0.9 : 0.35}
            roughness={0.55}
          />
        </mesh>
      ))}

      {/* threshold pad — stand here to enter */}
      <mesh position={[0, 0.05, 4.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 1.8]} />
        <meshStandardMaterial
          ref={threshold}
          color={accent}
          emissive={accent}
          emissiveIntensity={active ? 0.75 : 0.3}
          transparent
          opacity={0.6}
          roughness={1}
          depthWrite={false}
        />
      </mesh>

      {/* side windows */}
      {[-2.8, 2.8].map((x) => (
        <mesh key={x} position={[x, 2.8, 3.36]}>
          <boxGeometry args={[0.95, 1.2, 0.1]} />
          <meshStandardMaterial color="#ffe6a8" emissive="#ffe6a8" emissiveIntensity={active ? 0.6 : 0.35} roughness={0.5} />
        </mesh>
      ))}

      {active && (
        <group ref={invite} position={[0, 3.2, 4.0]}>
          <mesh>
            <coneGeometry args={[0.28, 0.5, 4]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.1} flatShading />
          </mesh>
        </group>
      )}

    </group>
  )
}

export function FloorPath({
  from,
  target,
  color,
}: {
  /** Fixed leg start (spawn point). The path is stable for the whole leg. */
  from: Vec2 | null
  target: Vec2 | null
  color: string
}) {
  const COUNT = 56
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const tint = useMemo(() => new THREE.Color(), [])

  // Soft elongated glow streak, laid flat along the route direction. With
  // additive blending the streaks melt into one continuous light ribbon; the
  // radial falloff keeps every edge feathered (no hard polygon reads).
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.9, 5.4)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useEffect(() => () => geo.dispose(), [geo])

  const layout = useMemo(() => {
    if (!from || !target) return null
    if (Math.hypot(target.x - from.x, target.z - from.z) < 2) return null

    const route = roadRoute(from, target)
    const segs: { x: number; z: number; nx: number; nz: number; len: number; acc: number }[] = []
    let total = 0
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i]
      const b = route[i + 1]
      const sx = b.x - a.x
      const sz = b.z - a.z
      const len = Math.hypot(sx, sz) || 0.0001
      segs.push({ x: a.x, z: a.z, nx: sx / len, nz: sz / len, len, acc: total })
      total += len
    }

    const start = 1.5
    const end = Math.max(start + 0.001, total - 1.0)
    const span = end - start
    const pts: { x: number; z: number; angle: number; f: number }[] = []
    for (let i = 0; i < COUNT; i++) {
      const f = COUNT > 1 ? i / (COUNT - 1) : 0
      const along = start + f * span
      let seg = segs[0]
      for (let s = 0; s < segs.length; s++) {
        if (along >= segs[s].acc && along <= segs[s].acc + segs[s].len) {
          seg = segs[s]
          break
        }
      }
      const local = along - seg.acc
      pts.push({
        x: seg.x + seg.nx * local,
        z: seg.z + seg.nz * local,
        angle: Math.atan2(seg.nx, seg.nz),
        f,
      })
    }
    return pts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.x, from?.z, target?.x, target?.z])

  useFrame((state) => {
    const m = meshRef.current
    if (!m) return
    if (!layout) {
      if (m.visible) m.visible = false
      return
    }
    m.visible = true
    const t = state.clock.elapsedTime
    for (let i = 0; i < COUNT; i++) {
      const pt = layout[i]
      // Energy pulse travelling toward the objective (phase advances with f,
      // recedes with t — crests flow from the player to the goal).
      const wave = 0.5 + 0.5 * Math.sin(pt.f * Math.PI * 16 - t * 3.2)
      // The ribbon breathes near the player and eases only slightly with
      // distance — with the ambient road pulses retired it is the ONLY light
      // line on the ground, so it can afford to stay readable to the horizon.
      const fade = 1 - 0.3 * pt.f
      dummy.position.set(pt.x, 0.06, pt.z)
      dummy.rotation.set(0, pt.angle, 0)
      // Pulse stretches the dash along the direction of travel only — the
      // strip stays slim, so crests read as light surging down a rail rather
      // than swelling blobs.
      dummy.scale.set(1, 1, 0.85 + 0.4 * wave)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      // Per-instance brightness (instanceColor multiplies the accent color);
      // additive blending turns intensity straight into glow. Crests push a
      // little past 1.0 for a hot core that reads on daylight asphalt.
      m.setColorAt(i, tint.setScalar((0.75 + 1.0 * wave) * fade))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[geo, undefined, COUNT]} frustumCulled={false} visible={false}>
      {/* Additive + toneMapped=false keeps the objective ribbon hot day or
          night — the only light line on the ground now, and it still reads
          through rain. */}
      <meshBasicMaterial
        color={color}
        map={radialGlowTexture()}
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        depthWrite={false}
        fog={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}

/* --------------------------------------------------------------- Landmarks */

function Cliff() {
  const tex = useTexture('/textures/cliff_tile.webp')
  useMemo(() => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(3, 3)
  }, [tex])
  return (
    <group>
      <mesh position={[0, 22, 0]} castShadow>
        <coneGeometry args={[26, 48, 6]} />
        <meshStandardMaterial map={tex} color="#c9c4cf" roughness={1} flatShading />
      </mesh>
      <mesh position={[14, 12, 8]} castShadow>
        <coneGeometry args={[12, 26, 6]} />
        <meshStandardMaterial map={tex} color="#bfbac8" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 45, 0]}>
        <coneGeometry args={[9, 8, 6]} />
        <meshStandardMaterial color="#ffffff" roughness={0.8} flatShading />
      </mesh>
    </group>
  )
}

export function LandmarkMesh({ landmark }: { landmark: Landmark }) {
  const { type, pos, color } = landmark
  const spin = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.6
  })
  // Phase 3 — the Harborfront lighthouse actually sweeps: two additive beam
  // fins ride the shared spin ref and fade in with dusk (night-only draws).
  const beamMat = useMemo(
    () =>
      applyNightFade(
        new THREE.MeshBasicMaterial({
          color: '#ffe9a8',
          transparent: true,
          opacity: 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
          toneMapped: false,
        }),
      ),
    [],
  )
  useEffect(() => () => beamMat.dispose(), [beamMat])

  return (
    <group position={[pos.x, 0, pos.z]}>
      {type === 'mountain' && <Cliff />}

      {type === 'lighthouse' && (
        <group>
          <mesh position={[0, 11, 0]} castShadow>
            <cylinderGeometry args={[2.4, 3.6, 22, 16]} />
            <meshStandardMaterial color="#f4f4f8" roughness={0.8} />
          </mesh>
          <mesh position={[0, 7, 0]}>
            <cylinderGeometry args={[2.7, 2.9, 3, 16]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 15, 0]}>
            <cylinderGeometry args={[2.7, 2.9, 3, 16]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <mesh position={[0, 23.5, 0]}>
            <cylinderGeometry args={[2, 2, 3, 16]} />
            <meshStandardMaterial color="#ffe9a8" emissive="#ffd23f" emissiveIntensity={1.2} />
          </mesh>
          {/* Sweeping twin beams — night-only (alpha rides uSimNight²). */}
          <group ref={spin} position={[0, 23.5, 0]}>
            {[0, Math.PI].map((a) => (
              <mesh key={a} rotation={[0, a, 0]} position={[Math.sin(a + Math.PI / 2) * 15, 0, Math.cos(a + Math.PI / 2) * 15]} material={beamMat}>
                <planeGeometry args={[28, 2.4]} />
              </mesh>
            ))}
          </group>
          <mesh position={[0, 26, 0]} castShadow>
            <coneGeometry args={[2.6, 3, 16]} />
            <meshStandardMaterial color="#d23b46" roughness={0.7} />
          </mesh>
        </group>
      )}

      {type === 'spire' && (
        <group ref={spin}>
          <mesh position={[0, 16, 0]} castShadow>
            <coneGeometry args={[5, 34, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} flatShading roughness={0.16} envMapIntensity={1.5} />
          </mesh>
          <mesh position={[6, 8, 2]} rotation={[0, 0, 0.2]} castShadow>
            <coneGeometry args={[2.6, 18, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} flatShading roughness={0.16} envMapIntensity={1.5} />
          </mesh>
          <mesh position={[-6, 6, -3]} rotation={[0, 0, -0.2]} castShadow>
            <coneGeometry args={[2.2, 14, 6]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} flatShading roughness={0.16} envMapIntensity={1.5} />
          </mesh>
        </group>
      )}

      {type === 'arch' && (
        <group>
          {[-7, 7].map((x) => (
            <group key={x} position={[x, 0, 0]}>
              <mesh position={[0, 9, 0]} castShadow>
                <torusGeometry args={[7, 1.4, 10, 20, Math.PI]} />
                <meshStandardMaterial color={color} roughness={0.8} flatShading />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 1, 0]} receiveShadow>
            <boxGeometry args={[30, 2, 6]} />
            <meshStandardMaterial color="#c2b189" roughness={1} />
          </mesh>
        </group>
      )}

      {type === 'tower' && (
        <group>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[0, 4 + i * 6, 0]} rotation={[0, i * 0.5, 0]} castShadow>
              <boxGeometry args={[8 - i * 1.1, 5.5, 8 - i * 1.1]} />
              <meshStandardMaterial color={i % 2 ? color : '#ffffff'} roughness={0.8} flatShading />
            </mesh>
          ))}
        </group>
      )}

      {type === 'windmill' && (
        <group>
          <mesh position={[0, 9, 0]} castShadow>
            <cylinderGeometry args={[2.6, 4, 18, 12]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.9} />
          </mesh>
          <mesh position={[0, 19, 0]} castShadow>
            <coneGeometry args={[4, 5, 12]} />
            <meshStandardMaterial color={color} roughness={0.8} />
          </mesh>
          <group ref={spin} position={[0, 15, 4]}>
            {[0, 1, 2, 3].map((i) => (
              <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0, 0]} castShadow>
                <boxGeometry args={[1.4, 11, 0.4]} />
                <meshStandardMaterial color="#f4f4f8" roughness={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      )}
    </group>
  )
}
