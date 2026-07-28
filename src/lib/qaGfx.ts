import { QA_SEAMS } from './qaSeams'

/* ============================================================================
   QA graphics overrides — the A/B harness behind the smoothness probes.

   Attributing a frame-time cost to a specific subsystem needs two things the
   shipping build deliberately does not offer: a PINNED quality notch (the
   invisible governor moves during a capture, so two runs are otherwise not
   comparable) and the ability to switch one renderer feature off at a time.

   Read once from the URL, and only when QA_SEAMS is on — a shipped build
   folds every field to `null` and the call sites collapse to their normal
   behaviour. Never referenced by gameplay logic.

     ?qa_notch=0..3    pin the governor notch (no demote/promote at all)
     ?qa_post=off      mount the scene without the EffectComposer
     ?qa_post=nobloom  full chain minus Bloom
     ?qa_post=nosmaa   full chain minus SMAA
     ?qa_post=bloomonly  Bloom only
     ?qa_bloomlevels=N mipmap-blur level count (default 8)
     ?qa_bloomres=0.5  bloom prefilter/mip resolution scale
     ?qa_msaa=N        EffectComposer multisampling samples
     ?qa_shadows=off   sun shadow maps off
   ========================================================================== */

export interface QaGfxOverrides {
  notch: number | null
  post: 'off' | 'nobloom' | 'nosmaa' | 'bloomonly' | null
  bloomLevels: number | null
  bloomRes: number | null
  msaa: number | null
  shadows: boolean | null
}

const NONE: QaGfxOverrides = {
  notch: null,
  post: null,
  bloomLevels: null,
  bloomRes: null,
  msaa: null,
  shadows: null,
}

function readOverrides(): QaGfxOverrides {
  if (!QA_SEAMS || typeof window === 'undefined') return NONE
  let params: URLSearchParams
  try {
    params = new URLSearchParams(window.location.search)
  } catch {
    return NONE
  }
  const num = (key: string): number | null => {
    const raw = params.get(key)
    if (raw == null) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  const post = params.get('qa_post')
  return {
    notch: num('qa_notch'),
    post:
      post === 'off' || post === 'nobloom' || post === 'nosmaa' || post === 'bloomonly'
        ? post
        : null,
    bloomLevels: num('qa_bloomlevels'),
    bloomRes: num('qa_bloomres'),
    msaa: num('qa_msaa'),
    shadows: params.get('qa_shadows') === 'off' ? false : null,
  }
}

export const QA_GFX: QaGfxOverrides = readOverrides()
