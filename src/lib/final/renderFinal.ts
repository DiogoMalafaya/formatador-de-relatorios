/**
 * Full render pipeline for the clean, non-watermarked download (DIO-15):
 * stored upload → formatting → cover → PDF, written back to storage under a
 * session-scoped key. Same pipeline as the preview (DIO-13) minus the
 * watermark step — see `prepareDocument.ts` for the shared part.
 *
 * Re-runs on every call rather than caching, same reasoning as the preview:
 * cheap to re-parse, and it means a payment right after a last-minute cover
 * change doesn't serve a stale render.
 */

import { putObject } from "../storage/index.ts";
import { renderPdf } from "../pdf/render.ts";
import { DocumentNotReadyError, prepareDocument } from "../rendering/prepareDocument.ts";
import type { SessionRecord } from "../session/types.ts";

export const FINAL_CONTENT_TYPE = "application/pdf";

export class FinalNotReadyError extends Error {}

export interface RenderedFinal {
  storageKey: string;
  pdf: Buffer;
}

export async function renderFinalPdf(session: SessionRecord): Promise<RenderedFinal> {
  let prepared;
  try {
    prepared = await prepareDocument(session);
  } catch (error) {
    if (error instanceof DocumentNotReadyError) {
      throw new FinalNotReadyError(error.message);
    }
    throw error;
  }

  const pdf = await renderPdf(prepared.document, { candidateName: prepared.candidateName });

  const storageKey = `${session.id}/final.pdf`;
  await putObject(storageKey, pdf, FINAL_CONTENT_TYPE);

  return { storageKey, pdf };
}
