/**
 * Renders a formatted document to PDF and writes it to object storage
 * (DIO-6) under a session-scoped key (DIO-11 scope: "write the rendered PDF
 * to storage against the session").
 *
 * Deliberately generic about *which* key: DIO-13 (watermarked preview) and
 * DIO-15 (final download) decide that — and whether to watermark first —
 * this module only does the shared render-then-store step.
 */

import { putObject } from "../storage/index.ts";
import type { StoredObjectMeta } from "../storage/types.ts";
import { renderPdf } from "./render.ts";
import type { RenderPdfOptions } from "./render.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

export const PDF_CONTENT_TYPE = "application/pdf";

export async function renderAndStorePdf(
  storageKey: string,
  document: FormattedDocument,
  options: RenderPdfOptions,
): Promise<StoredObjectMeta> {
  const pdf = await renderPdf(document, options);
  return putObject(storageKey, pdf, PDF_CONTENT_TYPE);
}
