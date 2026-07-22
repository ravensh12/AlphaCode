import { memo, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SIM } from '../simulation'
import { useMeshyModels } from '../meshy/useMeshyModels'
import { arcadeScreenContent, arcadeScreenKey, marqueePulse } from './arcadeCabinetCore'

/* ============================================================================
   ArcadeCabinet — the plaza Pattern Arcade machine.

   Retro-holo cabinet from primitives: body, angled canvas-texture screen
   (redrawn ONLY when the due-count content key changes), a marquee whose
   emissive breathes shader-free via a material ref, and a night-only attract
   glow (NightOnly pattern: one visibility write per frame off SIM.night).

   `meshyShell` (MEDIUM+) streams the Meshy retro-cabinet model in as the
   body; the live elements — due-count screen, marquee pulse, attract glow —
   stay primitive on top of it. Until the GLB decodes (and always on LOW)
   the full primitive cabinet renders.
   ========================================================================== */

const MESHY_SHELL_ID = 'interact-arcade-cabinet'

export interface ArcadeCabinetProps {
  x: number
  z: number
  /** Yaw so the screen faces the plaza walkway. */
  rotationY?: number
  /** Review patterns currently due — the number on the screen. */
  dueCount: number
  /** No review history yet — the screen shows the standby copy. */
  empty?: boolean
  /** Night attract glow (cheap, but skippable on the lowest tier). */
  attractGlow?: boolean
  /** Cabinet accent (marquee + trim). */
  accent?: string
  /** Stream the Meshy cabinet shell (MEDIUM+); primitive fallback otherwise. */
  meshyShell?: boolean
}

const SCREEN_W = 256
const SCREEN_H = 192

function drawScreen(
  canvas: HTMLCanvasElement,
  dueCount: number,
  empty: boolean,
  accent: string,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { title, big, sub } = arcadeScreenContent(dueCount, empty)
  const gradient = ctx.createLinearGradient(0, 0, 0, SCREEN_H)
  gradient.addColorStop(0, '#060a18')
  gradient.addColorStop(1, '#0c1030')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  // Scanlines sell the retro tube.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'
  for (let y = 0; y < SCREEN_H; y += 6) ctx.fillRect(0, y, SCREEN_W, 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#7fd8ff'
  ctx.font = '700 19px monospace'
  ctx.fillText(title, SCREEN_W / 2, 40)
  ctx.fillStyle = accent
  ctx.font = '800 64px monospace'
  ctx.fillText(big, SCREEN_W / 2, 118)
  ctx.fillStyle = '#9fd0ff'
  ctx.font = '700 17px monospace'
  ctx.fillText(sub, SCREEN_W / 2, 160)
}

export const ArcadeCabinet = memo(function ArcadeCabinet({
  x,
  z,
  rotationY = 0,
  dueCount,
  empty = false,
  attractGlow = true,
  accent = '#ffb347',
  meshyShell = false,
}: ArcadeCabinetProps) {
  const meshyModels = useMeshyModels(meshyShell ? [MESHY_SHELL_ID] : null)
  const shell = meshyModels?.[MESHY_SHELL_ID] ?? null
  const assets = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = SCREEN_W
    canvas.height = SCREEN_H
    const screenTex = new THREE.CanvasTexture(canvas)
    screenTex.colorSpace = THREE.SRGBColorSpace
    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTex,
      toneMapped: false,
    })
    const glowMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.16,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { canvas, screenTex, screenMat, glowMat }
  }, [accent])
  useEffect(
    () => () => {
      assets.screenTex.dispose()
      assets.screenMat.dispose()
      assets.glowMat.dispose()
    },
    [assets],
  )

  // Canvas regeneration guard: repaint only when the CONTENT key changes (or
  // the canvas itself was recreated — e.g. an accent swap rebuilt the assets).
  const screenKey = arcadeScreenKey(dueCount, empty)
  const painted = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  useEffect(() => {
    if (
      painted.current?.key === screenKey &&
      painted.current.canvas === assets.canvas
    ) {
      return
    }
    painted.current = { key: screenKey, canvas: assets.canvas }
    drawScreen(assets.canvas, dueCount, empty, accent)
    assets.screenTex.needsUpdate = true
  }, [screenKey, dueCount, empty, accent, assets])

  const marqueeMat = useRef<THREE.MeshStandardMaterial>(null)
  const attractRef = useRef<THREE.Group>(null)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (marqueeMat.current) {
      marqueeMat.current.emissiveIntensity = marqueePulse(t)
    }
    // NightOnly pattern: the attract glow draws only once night rises.
    const attract = attractRef.current
    if (attract) {
      const on = attractGlow && SIM.night.value > 0.02
      if (attract.visible !== on) attract.visible = on
    }
  })

  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      {shell ? (
        /* Meshy retro cabinet as the body (screen faces +z like the shell). */
        <mesh geometry={shell.geometry} material={shell.material} castShadow receiveShadow />
      ) : (
        <>
          {/* Cabinet body + base plinth. */}
          <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.15, 1.9, 0.85]} />
            <meshStandardMaterial color="#1a2130" roughness={0.55} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.06, 0.1]} receiveShadow>
            <boxGeometry args={[1.3, 0.12, 1.1]} />
            <meshStandardMaterial color="#12161f" roughness={0.8} metalness={0.2} />
          </mesh>
          {/* Side trim strips. */}
          <mesh position={[-0.6, 0.95, 0.12]}>
            <boxGeometry args={[0.05, 1.86, 0.62]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.35}
              roughness={0.5}
            />
          </mesh>
          <mesh position={[0.6, 0.95, 0.12]}>
            <boxGeometry args={[0.05, 1.86, 0.62]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={0.35}
              roughness={0.5}
            />
          </mesh>
          {/* Control deck. */}
          <mesh position={[0, 0.98, 0.52]} rotation={[-0.6, 0, 0]} castShadow>
            <boxGeometry args={[0.98, 0.08, 0.4]} />
            <meshStandardMaterial color="#232c3f" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[-0.2, 1.05, 0.6]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshBasicMaterial color="#ff5a5f" toneMapped={false} />
          </mesh>
          <mesh position={[0.16, 1.04, 0.62]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshBasicMaterial color="#7fd8ff" toneMapped={false} />
          </mesh>
        </>
      )}
      {/* Angled due-count screen (canvas texture, guard-gated repaints) —
          floats just proud of the Meshy shell's own screen recess. */}
      <mesh
        position={[0, 1.42, shell ? 0.42 : 0.45]}
        rotation={[-0.22, 0, 0]}
        material={assets.screenMat}
      >
        <planeGeometry args={[0.92, 0.7]} />
      </mesh>
      {/* Marquee — the shader-free animated emissive pulse. */}
      <mesh position={[0, 2.05, shell ? 0.16 : 0.28]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[1.2, 0.34, 0.16]} />
        <meshStandardMaterial
          ref={marqueeMat}
          color="#0a1016"
          emissive={accent}
          emissiveIntensity={0.8}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>
      {/* Night attract glow: light cone from the marquee + pavement pool. */}
      <group ref={attractRef} visible={false}>
        <mesh position={[0, 1.1, 0.55]} material={assets.glowMat}>
          <coneGeometry args={[0.95, 2.1, 20, 1, true]} />
        </mesh>
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.02, 0.7]}
          material={assets.glowMat}
        >
          <circleGeometry args={[1.15, 24]} />
        </mesh>
      </group>
    </group>
  )
})
