import type * as THREE from 'three'

/**
 * Renderer settings applied on creation of every gameplay <Canvas>.
 *
 * three validates each freshly linked shader program the first time it is
 * used, by reading getProgramInfoLog, getShaderInfoLog and LINK_STATUS. All
 * three are synchronous round-trips to the GPU process that block the main
 * thread until the driver has finished compiling, so every first-encounter
 * material turns into a stall on the frame that needs it — visible in a CPU
 * profile of base-city traversal, where getProgramInfoLog / getShaderInfoLog
 * were among the top self-time entries while districts streamed in.
 *
 * Development keeps the checks: they are the only way a broken shader ever
 * gets diagnosed, and a silent black material is far worse than a hitch.
 * Production turns them off, which is three's own guidance for shipped apps.
 */
export function tuneRenderer(gl: THREE.WebGLRenderer): void {
  gl.debug.checkShaderErrors = import.meta.env.DEV
}
