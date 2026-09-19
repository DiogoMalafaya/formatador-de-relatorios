import { getObject } from "../storage/index.ts";
import {
  applyFormatting,
  collectConstraintWarnings,
  formatParsedDocument,
} from "../formatting/apply.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { getRuleSet, GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { withSourceFilename } from "../formatting/warnings.ts";
import { resolveRuleSetId } from "../specialties/index.ts";
import { mergeCoverWithDocument } from "../covers/merge.ts";
import { mergeDocuments, GENERATED_TOC_CSS } from "../merge/index.ts";
import type { MergedHeading, MergeSource } from "../merge/types.ts";
import { getMasterSource, getOrderedSources } from "../session/sources.ts";
import type { FormattedDocument } from "../formatting/apply.ts";
import type { SessionRecord } from "../session/types.ts";

/**
 * Thrown when a session isn't far enough along to render anything — no
 * upload yet, or a stored upload has expired out from under it. Callers
 * (preview, final download) each wrap this in their own named error so a
 * caller can tell which pipeline failed from the error type alone.
 */
export class DocumentNotReadyError extends Error {}

export interface PreparedDocument {
  document: FormattedDocument;
  candidateName: string;
  /**
   * Present only for multi-file sessions: what the paginated two-pass render
   * (DIO-42) needs beyond the document itself. Absent for a single source,
   * which keeps the original single-file render path untouched.
   */
  merge?: {
    headings: MergedHeading[];
  };
}

/**
 * Shared prefix of the preview (DIO-13) and final-download (DIO-15) render
 * pipelines: stored upload(s) → formatting → cover merge. The two diverge
 * after this — preview watermarks the result, final download doesn't.
 *
 * A single-file session takes exactly the pre-DIO-42 path. A multi-file
 * session parses every source, collects constraint warnings *per source* so
 * each finding names its original file (US10), merges the documento
 * principal with the ordered chapters (DIO-41), and formats the merged
 * model.
 */
export async function prepareDocument(session: SessionRecord): Promise<PreparedDocument> {
  // All reads of uploaded files go through the sources helper (DIO-40):
  // it owns the `{sessionId}/source/{index}.docx` layout and still
  // understands a pre-multi-file session's single `upload` as source 0.
  const sources = getOrderedSources(session);
  const master = getMasterSource(session);
  if (!master || sources.length === 0) {
    throw new DocumentNotReadyError("session has no uploaded sources");
  }

  const ruleSetId = session.specialtyId ? resolveRuleSetId(session.specialtyId) : GENERIC_RULE_SET_ID;

  if (sources.length === 1) {
    const sourceBuffer = await getObject(master.storageKey);
    if (!sourceBuffer) {
      throw new DocumentNotReadyError("uploaded file is no longer in storage");
    }

    const formatted = await applyFormatting(sourceBuffer, { ruleSetId });
    return withCover(formatted, session);
  }

  // --- multi-file: parse everything, warn per file, merge, format ---------
  const buffers = await Promise.all(sources.map((source) => getObject(source.storageKey)));
  const missing = buffers.findIndex((buffer) => buffer === null);
  if (missing !== -1) {
    throw new DocumentNotReadyError("an uploaded file is no longer in storage");
  }

  const parsedSources: MergeSource[] = await Promise.all(
    sources.map(async (source, index) => ({
      id: `source-${source.index}`,
      document: await parseDocxDocument(buffers[index] as Buffer),
    })),
  );

  const ruleSet = getRuleSet(ruleSetId);
  const perSourceWarnings = sources.flatMap((source, index) =>
    collectConstraintWarnings(parsedSources[index].document, ruleSet).map((warning) =>
      withSourceFilename(warning, source.originalFilename),
    ),
  );

  const masterPosition = sources.findIndex((source) => source.index === master.index);
  const merged = mergeDocuments(
    parsedSources[masterPosition],
    parsedSources.filter((_, index) => index !== masterPosition),
  );

  const formatted = formatParsedDocument(merged.document, { ruleSetId }, {
    constraintWarnings: perSourceWarnings,
    extraWarnings: merged.warnings,
  });

  return withCover(
    { ...formatted, css: `${formatted.css}\n${GENERATED_TOC_CSS}` },
    session,
    { headings: merged.headings },
  );
}

function withCover(
  formatted: FormattedDocument,
  session: SessionRecord,
  merge?: { headings: MergedHeading[] },
): PreparedDocument {
  const withCoverDocument = mergeCoverWithDocument(formatted, {
    coverId: session.coverId,
    candidateName: formatted.extractedCandidateName,
  });

  return {
    document: withCoverDocument,
    candidateName: formatted.extractedCandidateName ?? "Candidato(a)",
    ...(merge ? { merge } : {}),
  };
}
