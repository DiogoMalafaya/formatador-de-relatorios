/**
 * Footer and running-header stamping, shared by both render paths (DIO-46).
 *
 * Done with pdf-lib *after* Chromium prints, rather than with Chromium's
 * header/footer templates, for two reasons:
 * - the paginated render needs per-page labels (none on the cover and on
 *   blank fillers, DIO-51) and section headers a template can't express;
 * - templates render in their own context, which can't load the embedded
 *   fonts, so the footer would fall back to a system font, breaking the
 *   norms' font rule in the one line every page carries.
 *
 * Stamped text is drawn in the document's own embedded regular face.
 *
 * Layout (DIO-55, PRD US10): a print-delivered profile is bound and printed
 * double-sided, so furniture is **mirrored** — the page number and running
 * header on the outer edge (right on a recto, left on a verso), the name on
 * the inner side. Recto/verso is the absolute page's parity: one sequence
 * from the cover (DIO-51), so it stays right after blank fillers and
 * dividers. A PDF-delivered profile is read on screen: centred, as before.
 * A hairline rule sets the furniture off only where the profile doesn't fix
 * the footer's content (MFR: name + number, "nothing else").
 */

import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { FontFamily, RuleSet } from "../formatting/ruleSet.ts";
import { EMBEDDED_FONTS, readRegularFontFile } from "./fonts.ts";

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
  /**
   * Mirrored recto/verso layout for a print-delivered profile; absent or
   * false = centred (DIO-55). Needs `margins` to find the text edges.
   */
  mirrored?: boolean;
  /** Hairline rules above the footer and under the running header (DIO-55). */
  rules?: boolean;
  /** Left/right page margins, to align furniture with the text block. */
  margins?: { leftCm: number; rightCm: number };
}

/**
 * The furniture layout a profile gets (DIO-55): mirrored when it's printed
 * and bound, hairline rules only where the norms don't fix the footer's
 * content — explicit norms get exactly what they state and nothing drawn.
 */
export function furnitureLayout(
  ruleSet: Pick<RuleSet, "kind" | "page" | "margins">,
): Pick<StampOptions, "mirrored" | "rules" | "margins"> {
  return {
    mirrored: ruleSet.page.delivery === "print",
    rules: ruleSet.kind !== "explicit",
    margins: { leftCm: ruleSet.margins.leftCm, rightCm: ruleSet.margins.rightCm },
  };
}

const FOOTER_FONT_SIZE = 9;
const FOOTER_BASELINE_Y = 35;
const HEADER_FONT_SIZE = 9;
const HEADER_TOP_OFFSET = 42;
const POINTS_PER_CM = 72 / 2.54;
/** Gap between the furniture's text and its hairline rule. */
const RULE_GAP = 5;
const RULE_THICKNESS = 0.4;
const RULE_GREY = rgb(0.55, 0.55, 0.55);

export async function stampPages(pdfBytes: Buffer, options: StampOptions): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);

  while (doc.getPageCount() > options.contentPageCount) {
    doc.removePage(doc.getPageCount() - 1);
  }

  doc.registerFontkit(fontkit);
  // A variable face loses its outlines when subset (see `EmbeddedFamily.variable`).
  const font = await doc.embedFont(readRegularFontFile(options.fontFamily), {
    subset: EMBEDDED_FONTS[options.fontFamily].variable !== true,
  });
  const name = options.includeCandidateName ? sanitizeForWinAnsi(options.candidateName) : "";

  const mirrored = options.mirrored === true && options.margins !== undefined;
  const leftEdge = (options.margins?.leftCm ?? 0) * POINTS_PER_CM;
  const rightInset = (options.margins?.rightCm ?? 0) * POINTS_PER_CM;

  doc.getPages().forEach((page, index) => {
    // Page 1 is the cover, a recto: odd absolute pages are rectos.
    const recto = (index + 1) % 2 === 1;
    const rightEdge = page.getWidth() - rightInset;
    const outer = recto ? "right" : "left";
    const inner = recto ? "left" : "right";
    const place = (text: string, size: number, y: number, side: "left" | "right" | "centre") => {
      const width = font.widthOfTextAtSize(text, size);
      const x =
        side === "centre" ? (page.getWidth() - width) / 2 : side === "left" ? leftEdge : rightEdge - width;
      page.drawText(text, { x, y, size, font });
    };
    const hairline = (y: number) =>
      page.drawLine({
        start: { x: leftEdge, y },
        end: { x: rightEdge, y },
        thickness: RULE_THICKNESS,
        color: RULE_GREY,
      });

    const label = options.pageLabels[index];
    if (label !== null && label !== undefined) {
      const number = options.includePageNumber ? label : "";
      if (mirrored && (name.length > 0 || number.length > 0)) {
        if (name.length > 0) place(name, FOOTER_FONT_SIZE, FOOTER_BASELINE_Y, inner);
        if (number.length > 0) place(number, FOOTER_FONT_SIZE, FOOTER_BASELINE_Y, outer);
        if (options.rules) hairline(FOOTER_BASELINE_Y + FOOTER_FONT_SIZE + RULE_GAP);
      } else {
        const parts = [name, number].filter((part) => part.length > 0);
        if (parts.length > 0) {
          place(parts.join(" — "), FOOTER_FONT_SIZE, FOOTER_BASELINE_Y, "centre");
          if (options.rules && options.margins) hairline(FOOTER_BASELINE_Y + FOOTER_FONT_SIZE + RULE_GAP);
        }
      }
    }

    const header = options.headers[index];
    if (header) {
      const text = sanitizeForWinAnsi(header);
      if (text.length > 0) {
        const y = page.getHeight() - HEADER_TOP_OFFSET;
        place(text, HEADER_FONT_SIZE, y, mirrored ? outer : "centre");
        if (options.rules && options.margins) hairline(y - RULE_GAP);
      }
    }
  });

  return Buffer.from(await doc.save());
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
