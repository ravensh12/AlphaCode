/* ============================================================================
   Tiny module-level mailbox between the Python workbench (which owns the
   run/submit results) and the tutor panel (which reads them at question
   time). One snapshot, keyed by assessment id, so a stale result from a
   previous step is never attached to a question about the current one.
   ========================================================================== */

export type TutorRunSnapshot = {
  assessmentId: string
  summary: string
}

let latestRun: TutorRunSnapshot | null = null

export function publishTutorRun(snapshot: TutorRunSnapshot): void {
  latestRun = snapshot
}

/** The latest run summary for this assessment, or null. */
export function readTutorRun(assessmentId: string | null): string | null {
  if (!assessmentId || !latestRun) return null
  return latestRun.assessmentId === assessmentId ? latestRun.summary : null
}
