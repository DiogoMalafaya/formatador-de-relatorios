import { getObject } from "../storage/index.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { resolveRuleSetId } from "../specialties/index.ts";
import { mergeCoverWithDocument } from "../covers/merge.ts";
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
  if (!session.upload) {
    throw new DocumentNotReadyError("session has no upload");
  }

  const sourceBuffer = await getObject(session.upload.storageKey);
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
