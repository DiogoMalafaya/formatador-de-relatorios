/**
 * Full render pipeline for the watermarked preview (DIO-13): stored upload →
 * formatting → cover → watermark → PDF, then written back to storage under a
 * session-scoped key.
 *
 * Deliberately re-runs the whole pipeline on every call rather than caching —
 * DIO-12's acceptance criteria require a cover switch to re-render without a
 * re-upload, and the source `.docx` is cheap to re-parse. Revisit if a typical
 * report makes this too slow in practice (DIO-20 QA is the place to notice).
 *
 * The stored-upload → formatting → cover part of this is shared with the
 * final-download pipeline (DIO-15) — see `prepareDocument.ts`.
 */

import { putObject } from "../storage/index.ts";
import { applyWatermark } from "./watermark.ts";
import { renderPdf } from "../pdf/render.ts";
import { DocumentNotReadyError, prepareDocument } from "../rendering/prepareDocument.ts";
import type { SessionRecord } from "../session/types.ts";

export const PREVIEW_CONTENT_TYPE = "application/pdf";

export class PreviewNotReadyError extends Error {}

export interface RenderedPreview {
  storageKey: string;
  pdf: Buffer;
}

export async function renderPreviewPdf(session: SessionRecord): Promise<RenderedPreview> {
  let prepared;
  try {
    prepared = await prepareDocument(session);
  } catch (error) {
    if (error instanceof DocumentNotReadyError) {
      throw new PreviewNotReadyError(error.message);
    }
    throw error;
  }

  const watermarked = applyWatermark(prepared.document);
  const pdf = await renderPdf(watermarked, { candidateName: prepared.candidateName });

  const storageKey = `${session.id}/preview.pdf`;
  await putObject(storageKey, pdf, PREVIEW_CONTENT_TYPE);

  return { storageKey, pdf };
}
