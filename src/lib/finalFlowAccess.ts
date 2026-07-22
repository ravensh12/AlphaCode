export type FinalFlowAccess =
  | { status: 'loading' }
  | { status: 'allowed' }
  | { status: 'redirect'; to: '/quest' | '/threshold' }

export function resolveThresholdAccess(
  ready: boolean,
  academyCampaignComplete: boolean,
): FinalFlowAccess {
  if (!ready) return { status: 'loading' }
  return academyCampaignComplete
    ? { status: 'allowed' }
    : { status: 'redirect', to: '/quest' }
}

export function resolveFinalGauntletAccess(
  ready: boolean,
  academyCampaignComplete: boolean,
  readyForFinalGauntlet: boolean,
): FinalFlowAccess {
  if (!ready) return { status: 'loading' }
  if (readyForFinalGauntlet) return { status: 'allowed' }
  return {
    status: 'redirect',
    to: academyCampaignComplete ? '/threshold' : '/quest',
  }
}
