/**
 * QA / perf instrumentation seams (renderer handles, `?nohorde`, render
 * counters). Always on in dev; in a build only when `VITE_QA_SEAMS=1` was set,
 * so the frame-time probes can measure a genuine production bundle. A normal
 * `npm run build` folds this to `false` and strips every guarded block.
 */
export const QA_SEAMS: boolean = import.meta.env.DEV || __QA_SEAMS__
