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
 * final-download pipeline (DIO-15) — see `prepareDocument.ts`. Multi-file
 * sessions go through the paginated two-pass render (DIO-42): merged
 * document, roman front matter/arabic body, blank recto-start pages, exact
 * page-count validations.
 */

import { putObject } from "../storage/index.ts";
import { applyWatermark } from "./watermark.ts";
import { renderPdf } from "../pdf/render.ts";
import { renderPaginatedPdf } from "../pdf/renderPaginated.ts";
import { DocumentNotReadyError, prepareDocument } from "../rendering/prepareDocument.ts";
import type { FormattingWarning } from "../formatting/warnings.ts";
import { complianceWarnings } from "../compliance/checkPdf.ts";
import type { SessionRecord } from "../session/types.ts";

export const PREVIEW_CONTENT_TYPE = "application/pdf";

export class PreviewNotReadyError extends Error {}

export interface RenderedPreview {
  storageKey: string;
  pdf: Buffer;
  /**
   * Post-render findings: the paginated render's exact-count validations
   * (page cap, summary section — DIO-42) plus the PDF compliance checker's
   * (DIO-47, both paths). Undefined when there are none.
   */
  renderWarnings?: FormattingWarning[];
  /** Exact page count of the rendered document, when the paginated render produced one. */
  pageCount?: number;
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

  let pdf: Buffer;
  let renderWarnings: FormattingWarning[] | undefined;
  let pageCount: number | undefined;
  if (prepared.merge) {
    const rendered = await renderPaginatedPdf(watermarked, {
      candidateName: prepared.candidateName,
      headings: prepared.merge.headings,
    });
    pdf = rendered.pdf;
    renderWarnings = rendered.warnings;
    pageCount = rendered.report.totalPages;
  } else {
    pdf = await renderPdf(watermarked, { candidateName: prepared.candidateName });
  }

  // Check the PDF we actually produced against its profile (DIO-47). The
  // watermark tile is an image, so the image check is left out here (images
  // are already warned about at parse time), and the page cap is already an
  // exact-count warning from the paginated render.
  const compliance = await complianceWarnings(pdf, {
    ruleSet: prepared.document.ruleSet,
    fontFamily: prepared.document.fontFamily,
    candidateName: prepared.candidateName,
    skip: ["images-forbidden", "page-cap"],
  });
  if (compliance.length > 0) {
    renderWarnings = [...(renderWarnings ?? []), ...compliance];
  }

  const storageKey = `${session.id}/preview.pdf`;
  await putObject(storageKey, pdf, PREVIEW_CONTENT_TYPE);

  return { storageKey, pdf, renderWarnings, pageCount };
}
