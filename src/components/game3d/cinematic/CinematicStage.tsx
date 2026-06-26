import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import {
  Environment,
  Lightformer,
  PerformanceMonitor,
  SoftShadows,
  type PerformanceMonitorApi,
} from '@react-three/drei'
import {
  EffectComposer,
  Bloom,
  Vignette,
  SMAA,
  SSAO,
  DepthOfField,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing'
import * as THREE from 'three'
import { CinematicQualityProvider, qualityDpr, useQuality, type QualityTier } from './quality'

/* ============================================================================
   CinematicStage — the single source of truth for the "realistic" look.

   Wraps a scene in a shadowed <Canvas> with ACES tone-mapping, a 3-point light
   rig, a fully procedural IBL mood (drei Environment + Lightformers, NO asset
   downloads) and a quality-aware post stack. A drei PerformanceMonitor steps
   the tier high → med → low on sustained low FPS; every effect reads the tier
   so consumer scenes inherit the scaling for free.

   USAGE (other agents — do not change the prop contract):

     import { CinematicStage } from '../cinematic'

     <CinematicStage
       environment="arena"
       fog={{ color: '#0a0b14', near: 24, far: 110 }}
       cameraInitial={{ position: [3, 5, 16], fov: 55 }}
       bloom={0.8}
       dof
       ssao
       hud={<MyHudOverlay />}
     >
       <MyScene />     // R3F content; runs its own useFrame sim
     </CinematicStage>
   ========================================================================== */

export interface CinematicStageProps {
  children: ReactNode
  /** IBL + light mood. 'arena' = warm key / cool rim cathedral; 'void' = cold starlit liminal. */
  environment?: 'arena' | 'void'
  fog?: { color: string; near: number; far: number }
  cameraInitial?: { position: [number, number, number]; fov?: number }
  /** Bloom intensity. */
  bloom?: number
  dof?: boolean
  ssao?: boolean
  /** Film grain. */
  grain?: boolean
  chromaticAberration?: boolean
  vignette?: boolean
  /** DOM overlay rendered as a sibling above the canvas. */
  hud?: ReactNode
  className?: string
}

/* --------------------------------------------------------- Procedural IBL -- */

/** Warm key + cool rim cathedral mood, built from emissive lightformers only. */
function ArenaIBL(): JSX.Element {
  return (
    <>
      {/* Dim ambient fill so metals never read pure black. */}
      <Lightformer form="rect" intensity={0.5} color="#3b3a55" scale={[40, 40, 1]} position={[0, 0, -16]} />
      {/* Warm dramatic key, high and to one side. */}
      <Lightformer form="rect" intensity={5} color="#ffd49a" scale={[12, 9, 1]} position={[8, 11, -7]} target={[0, 1, 0]} />
      {/* Cool rim from behind to separate silhouettes. */}
      <Lightformer form="rect" intensity={3} color="#7fb4ff" scale={[12, 6, 1]} position={[-9, 6, 9]} target={[0, 1, 0]} />
      {/* Soft top bounce. */}
      <Lightformer form="ring" intensity={1.6} color="#fff2dc" scale={7} position={[0, 14, 0]} target={[0, 0, 0]} />
    </>
  )
}

/** Cold, starlit, liminal void mood. */
function VoidIBL(): JSX.Element {
  return (
    <>
      <Lightformer form="rect" intensity={0.35} color="#10162e" scale={[40, 40, 1]} position={[0, 0, -16]} />
      {/* Pale cold key. */}
      <Lightformer form="rect" intensity={3.2} color="#bcd4ff" scale={[10, 12, 1]} position={[6, 12, -8]} target={[0, 1, 0]} />
      {/* Cyan rim. */}
      <Lightformer form="rect" intensity={2.6} color="#5ce8ff" scale={[10, 5, 1]} position={[-8, 5, 9]} target={[0, 1, 0]} />
      {/* Faint overhead star-glow. */}
      <Lightformer form="circle" intensity={1.0} color="#9fb4ff" scale={5} position={[0, 16, 2]} target={[0, 0, 0]} />
    </>
  )
}

/* ----------------------------------------------------------- Light rig + IBL */

function CinematicLighting({
  environment,
  tier,
}: {
  environment: 'arena' | 'void'
  tier: QualityTier
}): JSX.Element {
  const arena = environment === 'arena'
  // LOW disables shadow casting entirely; MED/HIGH step the map size.
  const shadowSize = tier === 'high' ? 2048 : 1024
  // Static one-time IBL bake (frames=1); modest cube resolution per tier.
  const envRes = tier === 'high' ? 256 : tier === 'med' ? 128 : 64

  return (
    <>
      <ambientLight intensity={arena ? 0.22 : 0.16} />
      <hemisphereLight
        args={arena ? ['#dfe6ff', '#3a3450', 0.5] : ['#22305c', '#05060f', 0.4]}
      />
      {/* Key — the ONLY shadow caster; frustum tightened to the play area. On LOW
          we drop shadow casting completely (no shadow pass) for a big win. */}
      <directionalLight
        castShadow={tier !== 'low'}
        position={arena ? [9, 18, 7] : [6, 17, 8]}
        intensity={arena ? 1.6 : 1.1}
        color={arena ? '#ffe6c2' : '#cfe0ff'}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-camera-near={2}
        shadow-camera-far={70}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />
      {/* Cool rim (no shadow) for edge separation. */}
      <directionalLight position={arena ? [-10, 7, -8] : [-9, 6, -7]} intensity={arena ? 0.7 : 0.9} color={arena ? '#8fb4ff' : '#5ce8ff'} />

      <Environment resolution={envRes} frames={1}>
        {arena ? <ArenaIBL /> : <VoidIBL />}
      </Environment>
    </>
  )
}

/* ------------------------------------------------------------- Post stack -- */

function CinematicEffects({
  bloom,
  dof,
  ssao,
  grain,
  chromaticAberration,
  vignette,
}: {
  bloom: number
  dof: boolean
  ssao: boolean
  grain: boolean
  chromaticAberration: boolean
  vignette: boolean
}): JSX.Element {
  const tier = useQuality()
  const high = tier === 'high'
  const low = tier === 'low'

  // Per-tier post budget:
  //   HIGH: Bloom + SSAO(½-res) + DoF(small) + Vignette + SMAA (+CA if requested)
  //   MED : Bloom + Vignette + SMAA
  //   LOW : Bloom(low) + Vignette only (SMAA dropped)
  const wantSSAO = ssao && high
  const wantDof = dof && high
  const wantGrain = grain && high
  const wantCA = chromaticAberration && !low
  const wantSMAA = !low
  const bloomIntensity = low ? Math.min(bloom, 0.4) : bloom

  const ssaoColor = useMemo(() => new THREE.Color('black'), [])
  const caOffset = useMemo(() => new THREE.Vector2(0.0009, 0.0009), [])

  // CRITICAL: memoize the pass list so its identity is stable across unrelated
  // re-renders. @react-three/postprocessing rebuilds the whole effect chain
  // whenever the children array identity changes — doing that on every HP tick
  // caused per-hit GPU stalls (a major input-delay source). Now it only rebuilds
  // when the tier or an effect toggle actually changes.
  const passes = useMemo(() => {
    const out: JSX.Element[] = []
    out.push(
      <Bloom key="bloom" mipmapBlur intensity={bloomIntensity} luminanceThreshold={0.72} luminanceSmoothing={0.18} />,
    )
    if (wantSSAO) {
      out.push(
        <SSAO
          key="ssao"
          resolutionScale={0.5}
          samples={16}
          rings={4}
          radius={0.2}
          intensity={14}
          luminanceInfluence={0.6}
          bias={0.03}
          color={ssaoColor}
        />,
      )
    }
    if (wantDof) {
      out.push(<DepthOfField key="dof" focusDistance={0.02} focalLength={0.05} bokehScale={2} />)
    }
    if (vignette) {
      out.push(<Vignette key="vig" eskil={false} offset={0.22} darkness={0.72} />)
    }
    if (wantCA) {
      out.push(<ChromaticAberration key="ca" offset={caOffset} radialModulation={false} modulationOffset={0} />)
    }
    if (wantGrain) {
      out.push(<Noise key="noise" opacity={0.045} premultiply />)
    }
    if (wantSMAA) out.push(<SMAA key="smaa" />)
    return out
  }, [bloomIntensity, wantSSAO, wantDof, wantCA, wantGrain, wantSMAA, vignette, ssaoColor, caOffset])

  return (
    <EffectComposer multisampling={0} enableNormalPass={wantSSAO}>
      {passes}
    </EffectComposer>
  )
}

/* ------------------------------------------------------------- DPR control - */

function DprSync({ tier }: { tier: QualityTier }): null {
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    setDpr(qualityDpr(tier))
  }, [tier, setDpr])
  return null
}

/* --------------------------------------------------------------- The world - */

function CinematicWorld({
  children,
  environment,
  bloom,
  dof,
  ssao,
  grain,
  chromaticAberration,
  vignette,
}: {
  children: ReactNode
  environment: 'arena' | 'void'
  bloom: number
  dof: boolean
  ssao: boolean
  grain: boolean
  chromaticAberration: boolean
  vignette: boolean
}): JSX.Element {
  // Start at LOW so the opening frames (when input feels worst) are cheap; ramp
  // up only once FPS is comfortably stable, and drop fast on dips. Cooldowns add
  // hysteresis so the tier never oscillates (and tier-change recompiles stay rare).
  const [tier, setTier] = useState<QualityTier>('low')
  const cooldown = useRef(0)
  // Hold the first ~1.5s at LOW no matter what so the fight opens smooth.
  useEffect(() => {
    cooldown.current = performance.now() + 1500
  }, [])

  const stepDown = useCallback(() => {
    const now = performance.now()
    if (now < cooldown.current) return
    cooldown.current = now + 2000 // downgrade readily
    setTier((t) => (t === 'high' ? 'med' : 'low'))
  }, [])
  const stepUp = useCallback((api: PerformanceMonitorApi) => {
    // Only climb when there's clear, sustained headroom.
    if (api.fps < 58) return
    const now = performance.now()
    if (now < cooldown.current) return
    cooldown.current = now + 6000 // upgrade conservatively
    setTier((t) => (t === 'low' ? 'med' : 'high'))
  }, [])
  const fallback = useCallback(() => setTier('low'), [])

  return (
    <CinematicQualityProvider value={tier}>
      <PerformanceMonitor
        ms={300}
        iterations={7}
        flipflops={3}
        onDecline={stepDown}
        onIncline={stepUp}
        onFallback={fallback}
      />
      <DprSync tier={tier} />
      {/* PCSS soft shadows are HIGH-only; MED/LOW use the renderer's PCF default. */}
      {tier === 'high' && <SoftShadows size={24} samples={12} focus={0.55} />}

      <CinematicLighting environment={environment} tier={tier} />

      {children}

      <CinematicEffects
        bloom={bloom}
        dof={dof}
        ssao={ssao}
        grain={grain}
        chromaticAberration={chromaticAberration}
        vignette={vignette}
      />
    </CinematicQualityProvider>
  )
}

/* --------------------------------------------------------------- Component - */

export function CinematicStage({
  children,
  environment = 'arena',
  fog,
  cameraInitial,
  bloom = 0.7,
  dof = false,
  ssao = true,
  grain = true,
  chromaticAberration = false,
  vignette = true,
  hud,
  className,
}: CinematicStageProps): JSX.Element {
  const camPos = cameraInitial?.position ?? [0, 6, 16]
  const camFov = cameraInitial?.fov ?? 55

  // Stable identities for the Canvas props — passing fresh arrays/objects each
  // render makes R3F re-apply dpr/camera/gl (a resize/clear) every render, which
  // stalls input. These never need to change (DprSync drives DPR imperatively).
  const dpr = useMemo<[number, number]>(() => qualityDpr('low'), [])
  const glOpts = useMemo(
    () => ({
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance' as const,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.0,
    }),
    [],
  )
  const cameraOpts = useMemo(
    () => ({ position: camPos, fov: camFov, near: 0.1, far: 200 }),
    // Depend on the coordinate values, not the array identity (which is fresh
    // each render when the caller passes an inline cameraInitial).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [camPos[0], camPos[1], camPos[2], camFov],
  )

  return (
    <div className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Canvas
        shadows
        // The composer renders to offscreen targets and SMAA does the edge AA,
        // so a multisampled/stencil default framebuffer would only cost memory.
        gl={glOpts}
        // Start at the LOW clamp (matches the scaler's LOW start); DprSync
        // re-clamps as the PerformanceMonitor steps the tier.
        dpr={dpr}
        camera={cameraOpts}
      >
        {fog && <fog attach="fog" args={[fog.color, fog.near, fog.far]} />}
        <CinematicWorld
          environment={environment}
          bloom={bloom}
          dof={dof}
          ssao={ssao}
          grain={grain}
          chromaticAberration={chromaticAberration}
          vignette={vignette}
        >
          {children}
        </CinematicWorld>
      </Canvas>

      {hud != null && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{hud}</div>
      )}
    </div>
  )
}
