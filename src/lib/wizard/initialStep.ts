import type { SessionRecord } from "../session/types.ts";

/**
 * Guided-setup wizard steps (DIO-37/DIO-38): 1 = upload, 2 = specialty,
 * 3 = cover, 4 = the two-pane workspace (preview + checkout/download).
 */
export type WizardStep = 1 | 2 | 3 | 4;

/**
 * Furthest step the record's actual state supports. The record — never the
 * persisted `setupStep` number — decides what counts as completed.
 */
export function maxReachableStep(session: SessionRecord | null): WizardStep {
  if (!session?.upload) return 1;
  if (!session.specialtyId) return 2;
  if (!session.coverId) return 3;
  return 4;
}

/**
 * Where the wizard should open: the persisted step while it is still
 * reachable, otherwise the furthest reachable step. A paid session always
 * opens on the workspace (DIO-38) — the student came back for their download,
 * not to redo a decision — provided the record actually reaches it.
 */
export function resolveInitialSetupStep(session: SessionRecord | null): WizardStep {
  const maxReachable = maxReachableStep(session);

  if (session?.payment.status === "paid") {
    return maxReachable;
  }

  const stored = session?.setupStep;
  if (
    typeof stored === "number" &&
    Number.isInteger(stored) &&
    stored >= 1 &&
    stored < maxReachable
  ) {
    return stored as WizardStep;
  }
  return maxReachable;
}
