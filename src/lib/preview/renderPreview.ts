/**
 * Full render pipeline for the watermarked preview (DIO-13): stored upload →
 * formatting → cover → watermark → PDF, then written back to storage under a
 * session-scoped key.
 *
 * Deliberately re-runs the whole pipeline on every call rather than caching —
 * DIO-12's acceptance criteria require a cover switch to re-render without a
 * re-upload, and the source `.docx` is cheap to re-parse. Revisit if a typical
 * report makes this too slow in practice (DIO-20 QA is the place to notice).
 */

import { getObject, putObject } from "../storage/index.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { resolveRuleSetId } from "../specialties/index.ts";
import { mergeCoverWithDocument } from "../covers/merge.ts";
import { applyWatermark } from "./watermark.ts";
import { renderPdf } from "../pdf/render.ts";
import type { SessionRecord } from "../session/types.ts";

export const PREVIEW_CONTENT_TYPE = "application/pdf";

export class PreviewNotReadyError extends Error {}

export interface RenderedPreview {
  storageKey: string;
  pdf: Buffer;
}

export async function renderPreviewPdf(session: SessionRecord): Promise<RenderedPreview> {
  if (!session.upload) {
    throw new PreviewNotReadyError("session has no upload");
  }

  const sourceBuffer = await getObject(session.upload.storageKey);
  if (!sourceBuffer) {
    throw new PreviewNotReadyError("uploaded file is no longer in storage");
  }

  const ruleSetId = session.specialtyId ? resolveRuleSetId(session.specialtyId) : GENERIC_RULE_SET_ID;
  const formatted = await applyFormatting(sourceBuffer, { ruleSetId });
  const withCover = mergeCoverWithDocument(formatted, {
    coverId: session.coverId,
    candidateName: formatted.extractedCandidateName,
  });
  const watermarked = applyWatermark(withCover);

  const pdf = await renderPdf(watermarked, {
    candidateName: formatted.extractedCandidateName ?? "Candidato(a)",
  });

  const storageKey = `${session.id}/preview.pdf`;
  await putObject(storageKey, pdf, PREVIEW_CONTENT_TYPE);

  return { storageKey, pdf };
}
