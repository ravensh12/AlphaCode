export type DurableTransitionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: unknown }

/** Runs navigation/state advancement only after the supplied local save resolves. */
export async function runDurableTransition(
  save: () => Promise<void>,
  onDurable: () => void,
): Promise<DurableTransitionResult> {
  try {
    await save()
    onDurable()
    return { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}
