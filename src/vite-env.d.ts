/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Build-time flag (vite `define`): QA/perf seams in a production bundle. */
declare const __QA_SEAMS__: boolean
