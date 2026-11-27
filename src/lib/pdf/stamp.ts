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
import type { PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { FontFamily, PageMargins, RuleSet } from "../formatting/ruleSet.ts";
import type { ChapterTabStyle } from "../themes/index.ts";
import { EMBEDDED_FONTS, readRegularFontFile } from "./fonts.ts";
import { tabBand, tabRects } from "./chapterTabs.ts";
import type { ChapterTabPlan, Rect } from "./chapterTabs.ts";

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
  /** Page margins, to align furniture with the text block (and tabs with its height). */
  margins?: PageMargins;
  /**
   * Outer-edge chapter tabs (DIO-58): mirrored like the furniture, so they
   * need `mirrored` and `margins`. Absent = no tabs.
   */
  chapterTabs?: ChapterTabPlan & { style: ChapterTabStyle };
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
    margins: { ...ruleSet.margins },
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

    const current = options.chapterTabs?.current[index];
    if (mirrored && options.chapterTabs && options.margins && current !== null && current !== undefined) {
      const band = tabBand({ width: page.getWidth(), height: page.getHeight() }, options.margins, index + 1);
      const rects = tabRects(band, options.chapterTabs.tabs.length);
      const labels = chapterTabLabels(options.chapterTabs.tabs, options.chapterTabs.style, font, band.width);
      labels.forEach((label, tabIndex) =>
        drawChapterTab(page, font, rects[tabIndex], label, tabIndex === current, options.chapterTabs!.style),
      );
    }
  });

  return Buffer.from(await doc.save());
}

/** Inner padding of a filled tab, so a title never touches its edges. */
const TAB_PADDING_PT = 3;

/**
 * What each tab says (DIO-58). Typographic tabs carry the chapter number.
 * Filled tabs carry a short title (the title, or its first word cut short)
 * when *every* tab's fits on one line, and the numbers otherwise: a column
 * mixing words and numbers reads as a mistake.
 */
function chapterTabLabels(
  tabs: readonly { number: string; title: string }[],
  style: ChapterTabStyle,
  font: PDFFont,
  tabWidth: number,
): string[] {
  const numbers = tabs.map((tab) => sanitizeForWinAnsi(tab.number));
  if (style.kind === "typographic") return numbers;
  const fits = (text: string) =>
    text.length > 0 && font.widthOfTextAtSize(text, style.sizePt) <= tabWidth - 2 * TAB_PADDING_PT;
  const titles = tabs.map((tab) => {
    const title = sanitizeForWinAnsi(tab.title).toLocaleUpperCase("pt-PT");
    const firstWord = title.split(" ")[0];
    return [title, firstWord !== title ? `${firstWord}…` : ""].find(fits);
  });
  return titles.every((title) => title !== undefined) ? (titles as string[]) : numbers;
}

/**
 * One chapter tab (DIO-58). Typographic: the label alone, black, centred
 * in its slot, the current chapter at the larger size. Filled: the accent
 * (current) or a neutral (others) block with the label on it. Vector
 * fills, never an image.
 */
function drawChapterTab(
  page: PDFPage,
  font: PDFFont,
  rect: Rect,
  label: string,
  isCurrent: boolean,
  style: ChapterTabStyle,
): void {
  const centred = (text: string, size: number, colour: ReturnType<typeof rgb>) => {
    const width = font.widthOfTextAtSize(text, size);
    const capHeight = font.heightAtSize(size, { descender: false });
    page.drawText(text, {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y + (rect.height - capHeight) / 2,
      size,
      font,
      color: colour,
    });
  };

  if (style.kind === "typographic") {
    if (label.length > 0) centred(label, isCurrent ? style.currentSizePt : style.sizePt, hexToRgb(style.colour));
    return;
  }

  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: hexToRgb(isCurrent ? style.currentFill : style.otherFill),
  });
  if (label.length > 0) centred(label, style.sizePt, hexToRgb(isCurrent ? style.currentText : style.otherText));
}

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const value = Number.parseInt(hex.replace(/^#/, ""), 16);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
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
