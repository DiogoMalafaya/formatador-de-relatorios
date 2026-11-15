/**
 * Footer and running-header stamping, shared by both render paths (DIO-46).
 *
 * Done with pdf-lib *after* Chromium prints, rather than with Chromium's
 * header/footer templates, for two reasons:
 * - the paginated render needs roman/arabic labels and per-page section
 *   headers that a template can't express (DIO-42);
 * - templates render in their own context, which can't load the embedded
 *   fonts, so the footer would fall back to a system font, breaking the
 *   norms' font rule in the one line every page carries.
 *
 * Stamped text is drawn in the document's own embedded regular face.
 */

import { PDFDocument } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { FontFamily } from "../formatting/ruleSet.ts";
import { readRegularFontFile } from "./fonts.ts";

export interface StampOptions {
  /** Pages to keep; anything after is the page-map probe and gets dropped. */
  contentPageCount: number;
  pageLabels: (string | null)[];
  headers: (string | null)[];
  candidateName: string;
  /** Stamped text uses the document's own embedded font, not a PDF standard font (DIO-46). */
  fontFamily: FontFamily;
  includeCandidateName: boolean;
  includePageNumber: boolean;
}

const FOOTER_FONT_SIZE = 9;
const FOOTER_BASELINE_Y = 35;
const HEADER_FONT_SIZE = 9;
const HEADER_TOP_OFFSET = 42;

export async function stampPages(pdfBytes: Buffer, options: StampOptions): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);

  while (doc.getPageCount() > options.contentPageCount) {
    doc.removePage(doc.getPageCount() - 1);
  }

  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readRegularFontFile(options.fontFamily), { subset: true });
  const name = options.includeCandidateName ? sanitizeForWinAnsi(options.candidateName) : "";

  doc.getPages().forEach((page, index) => {
    const label = options.pageLabels[index];
    if (label !== null && label !== undefined) {
      const parts: string[] = [];
      if (name.length > 0) parts.push(name);
      if (options.includePageNumber) parts.push(label);
      if (parts.length > 0) {
        drawCentered(page, font, parts.join(" — "), FOOTER_FONT_SIZE, FOOTER_BASELINE_Y);
      }
    }

    const header = options.headers[index];
    if (header) {
      const text = sanitizeForWinAnsi(header);
      if (text.length > 0) {
        drawCentered(page, font, text, HEADER_FONT_SIZE, page.getHeight() - HEADER_TOP_OFFSET);
      }
    }
  });

  return Buffer.from(await doc.save());
}

function drawCentered(page: PDFPage, font: PDFFont, text: string, size: number, y: number): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (page.getWidth() - width) / 2,
    y,
    size,
    font,
  });
}

/**
 * Keeps stamped text to characters the embedded faces certainly cover: all
 * of pt-PT (ã, ç, é, …) and common punctuation. Anything else is dropped
 * rather than letting the whole render throw over an unusual glyph in a
 * heading. (A leftover of the Helvetica/WinAnsi days, still a cheap guard.)
 */
function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/[‐-‒]/g, "-")
    .replace(/[^\x20-\x7E -ÿ–—‘’‚“”„†‡•…€™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
