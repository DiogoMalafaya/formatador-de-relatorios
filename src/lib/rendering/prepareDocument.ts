import { getObject } from "../storage/index.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { resolveRuleSetId } from "../specialties/index.ts";
import { mergeCoverWithDocument } from "../covers/merge.ts";
import { getMasterSource } from "../session/sources.ts";
import type { FormattedDocument } from "../formatting/apply.ts";
import type { SessionRecord } from "../session/types.ts";

/**
 * Thrown when a session isn't far enough along to render anything — no
 * upload yet, or the stored upload has expired out from under it. Callers
 * (preview, final download) each wrap this in their own named error so a
 * caller can tell which pipeline failed from the error type alone.
 */
export class DocumentNotReadyError extends Error {}

export interface PreparedDocument {
  document: FormattedDocument;
  candidateName: string;
}

/**
 * Shared prefix of the preview (DIO-13) and final-download (DIO-15) render
 * pipelines: stored upload → formatting → cover merge. The two diverge after
 * this — preview watermarks the result, final download doesn't.
 */
export async function prepareDocument(session: SessionRecord): Promise<PreparedDocument> {
  // All reads of uploaded files go through the sources helper (DIO-40):
  // it owns the `{sessionId}/source/{index}.docx` layout and still
  // understands a pre-multi-file session's single `upload` as source 0.
  const master = getMasterSource(session);
  if (!master) {
    throw new DocumentNotReadyError("session has no uploaded sources");
  }

  // Until the merge engine (US7, PRD §6) lands, rendering consumes only the
  // documento principal — for a single-file session that is the whole CV,
  // exactly the pre-DIO-40 behaviour. The merge ticket replaces this read
  // with the full `getOrderedSources(session)` list.
  const sourceBuffer = await getObject(master.storageKey);
  if (!sourceBuffer) {
    throw new DocumentNotReadyError("uploaded file is no longer in storage");
  }

  const ruleSetId = session.specialtyId ? resolveRuleSetId(session.specialtyId) : GENERIC_RULE_SET_ID;
  const formatted = await applyFormatting(sourceBuffer, { ruleSetId });
  const withCover = mergeCoverWithDocument(formatted, {
    coverId: session.coverId,
    candidateName: formatted.extractedCandidateName,
  });

  return {
    document: withCover,
    candidateName: formatted.extractedCandidateName ?? "Candidato(a)",
  };
}
