import { getOrderedSources } from "../session/sources.ts";
import type { SessionRecord } from "../session/types.ts";
import { needsSpecialtyReselection } from "../specialties/index.ts";
import { isCoverDetailsComplete } from "../covers/details.ts";

/**
 * Guided-setup wizard steps (DIO-37/DIO-38): 1 = upload, 2 = specialty,
 * 3 = cover, 4 = the two-pane workspace (preview + checkout/download).
 */
export type WizardStep = 1 | 2 | 3 | 4;

/**
 * Furthest step the record's actual state supports. The record — never the
 * persisted `setupStep` number — decides what counts as completed.
 *
 * "Has an upload" goes through `getOrderedSources`, which knows both the
 * multi-file `sources[]` layout (DIO-40) and the legacy single `upload`.
 */
export function maxReachableStep(session: SessionRecord | null): WizardStep {
  if (!session || getOrderedSources(session).length === 0) return 1;
  // An unsupported specialty counts as not chosen (DIO-44), unless paid.
  if (!session.specialtyId || needsSpecialtyReselection(session)) return 2;
  if (!session.coverId) return 3;
  // The cover needs its local de formação (DIO-50). A session paid before
  // that field existed still reaches its download.
  if (!isCoverDetailsComplete(session.coverDetails) && session.payment.status !== "paid") return 3;
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
