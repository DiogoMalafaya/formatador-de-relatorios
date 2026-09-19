/**
 * Two-pass paginated render for merged multi-file documents (DIO-42).
 *
 * Pass 1 prints the document with empty Índice placeholders plus a page-map
 * probe (`template.ts`/`pageMap.ts`), giving the exact page every heading
 * lands on. `paginate.ts` turns that into blank-page insertions (recto starts
 * for double-sided printing) and sequence-local page numbers. Pass 2 prints
 * the document again with the Índice filled and the blanks in place; the
 * probe rides along so the result can be *verified* — if filling the Índice
 * somehow reflowed a page boundary, one corrective pass runs (three passes
 * maximum; geometry converges on the first re-render in practice).
 *
 * Footers (candidate name + roman/arabic page number) and the optional
 * running section header are stamped with pdf-lib after the final print —
 * Chromium's own header/footer templates can only produce one arabic
 * sequence, and the norms want roman front matter with the body restarting
 * at 1. The probe pages are stripped before stamping, so nothing synthetic
 * ever leaves the render. Both passes share one Chromium instance and one
 * invocation; no intermediate state is persisted anywhere.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { launchBrowser } from "./browser.ts";
import { extractPageMap } from "./pageMap.ts";
import {
  buildPageLabels,
  buildRunningHeaders,
  partHeadingLevel,
  planPagination,
  resumoSectionSpan,
} from "./paginate.ts";
import type { PaginationPlan } from "./paginate.ts";
import {
  BODY_START_MARKER_ID,
  PAGE_MAP_PROBE_CSS,
  PAGINATION_CSS,
  buildBlankPageHtml,
  buildBodyStartMarker,
  buildHtmlDocument,
  buildPageMapProbeHtml,
} from "./template.ts";
import { fillTocPageNumbers } from "../merge/toc.ts";
import type { MergedHeading } from "../merge/types.ts";
import { pageLimitExceededWarning, resumoTooLongWarning } from "../formatting/warnings.ts";
import type { FormattingWarning } from "../formatting/warnings.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

const MAX_PASSES = 3;

export interface PaginatedRenderOptions {
  candidateName: string;
  /** Merged headings in document order, from `mergeDocuments` (DIO-41). */
  headings: MergedHeading[];
}

/** What actually happened, for validations, tests and timing reports. Never contains document text. */
export interface PaginatedRenderReport {
  totalPages: number;
  /** 1-based absolute page where the arabic sequence starts. */
  bodyStartPage: number;
  /** Footer label per page (1-based order); null = footer suppressed (cover). */
  pageLabels: (string | null)[];
  /** 1-based absolute pages occupied by inserted "intencionalmente em branco" pages. */
  blankPages: number[];
  /** Render passes it took to converge (2 in the normal case). */
  passes: number;
  timings: { passMs: number[]; totalMs: number };
}

export interface PaginatedRenderResult {
  pdf: Buffer;
  report: PaginatedRenderReport;
  /** Exact-count validations over the final geometry (80-page limit, resumo length). */
  warnings: FormattingWarning[];
}

export async function renderPaginatedPdf(
  document: FormattedDocument,
  options: PaginatedRenderOptions,
): Promise<PaginatedRenderResult> {
  const startedAt = Date.now();
  const { headings } = options;
  const { ruleSet } = document;

  const baseHtml = injectBodyStartMarker(document.html, headings);
  const css = [document.css, PAGINATION_CSS, PAGE_MAP_PROBE_CSS, buildPartBreakCss(headings)].join("\n");
  const probeHtml = buildPageMapProbeHtml([BODY_START_MARKER_ID, ...headings.map((h) => h.id)]);
  const anchorIds = [BODY_START_MARKER_ID, ...headings.map((h) => h.id)];

  const passMs: number[] = [];
  const browser = await launchBrowser();
  let pdfBytes: Buffer | undefined;
  let plan: PaginationPlan | undefined;
  let blankCounts = new Map<string, number>();
  let tocNumbers = new Map<string, number>();
  let passes = 0;

  try {
    const page = await browser.newPage();
    const marginCm = `${ruleSet.marginsCm}cm`;

    for (;;) {
      passes += 1;
      const passStart = Date.now();

      const html = composePassHtml(baseHtml, tocNumbers, blankCounts, probeHtml);
      await page.setContent(buildHtmlDocument({ ...document, html, css }), { waitUntil: "load" });
      pdfBytes = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          displayHeaderFooter: false,
          margin: { top: marginCm, bottom: marginCm, left: marginCm, right: marginCm },
        }),
      );

      const map = await extractPageMap(pdfBytes, anchorIds);
      plan = planPagination({
        headings,
        pages: map.pages,
        totalPages: map.contentPageCount,
        existingBlanks: new Set(blankCounts.keys()),
      });
      passMs.push(Date.now() - passStart);

      const converged = plan.stable && mapsEqual(plan.tocPageNumbers, tocNumbers);
      if (converged || passes >= MAX_PASSES) break;

      // The plan is the absolute blank set, so replacing the map is a fixed
      // point: a blank a reflow made unnecessary disappears instead of being
      // joined by a second one.
      blankCounts = new Map(plan.blankAnchors.map((anchor) => [anchor, 1]));
      tocNumbers = plan.tocPageNumbers;
    }
  } finally {
    await browser.close();
  }

  if (!plan || !pdfBytes) {
    throw new Error("paginated render loop produced no output");
  }

  const totalPages = plan.totalPages;
  const bodyStartPage = plan.bodyStartPage;
  const blankPages = resolveBlankPages(blankCounts, plan);
  const pageLabels = buildPageLabels(totalPages, bodyStartPage);
  const headers = ruleSet.header.allowed
    ? buildRunningHeaders(headings, plan.headingPages, totalPages, bodyStartPage, new Set(blankPages))
    : new Array<string | null>(totalPages).fill(null);

  const pdf = await stripProbeAndStamp(pdfBytes, {
    contentPageCount: totalPages,
    pageLabels,
    headers,
    candidateName: options.candidateName,
    includeCandidateName: ruleSet.footer.includeCandidateName,
    includePageNumber: ruleSet.footer.includePageNumber,
  });

  const warnings: FormattingWarning[] = [];
  if (ruleSet.constraints.maxPages !== undefined && totalPages > ruleSet.constraints.maxPages) {
    warnings.push(pageLimitExceededWarning(totalPages, ruleSet.constraints.maxPages));
  }
  if (ruleSet.constraints.resumoMaxPages !== undefined) {
    const span = resumoSectionSpan(headings, plan.headingPages, totalPages);
    if (span && span.pageCount > ruleSet.constraints.resumoMaxPages) {
      warnings.push(resumoTooLongWarning(span.pageCount, ruleSet.constraints.resumoMaxPages));
    }
  }

  return {
    pdf,
    warnings,
    report: {
      totalPages,
      bodyStartPage,
      pageLabels,
      blankPages,
      passes,
      timings: { passMs, totalMs: Date.now() - startedAt },
    },
  };
}

/* ------------------------------ HTML composition ------------------------------ */

/**
 * Puts the invisible body-start marker between the generated Índice and the
 * first body block, so the page map knows where the arabic sequence begins.
 * Falls back to just before the first arabic heading when no generated
 * Índice is present.
 */
export function injectBodyStartMarker(html: string, headings: readonly MergedHeading[]): string {
  const marker = buildBodyStartMarker();

  const navStart = html.indexOf('<nav class="generated-toc">');
  if (navStart !== -1) {
    const navEnd = html.indexOf("</nav>", navStart);
    if (navEnd !== -1) {
      const insertAt = navEnd + "</nav>".length;
      return `${html.slice(0, insertAt)}\n${marker}${html.slice(insertAt)}`;
    }
  }

  const firstArabic = headings.find((heading) => heading.numbering === "arabic");
  if (firstArabic) {
    const headingIndex = html.search(headingOpenTagPattern(firstArabic.id));
    if (headingIndex !== -1) {
      return `${html.slice(0, headingIndex)}${marker}\n${html.slice(headingIndex)}`;
    }
  }

  return `${html}\n${marker}`;
}

/** Every level-1 body heading (major part) starts on a fresh page, like the reference volume. */
/**
 * Page breaks before every major part except the first: the body-start marker
 * already opens the body's page, so breaking on the first part too would
 * leave a page holding nothing but that 1px marker.
 */
function buildPartBreakCss(headings: readonly MergedHeading[]): string {
  const partLevel = partHeadingLevel(headings);
  if (partLevel === undefined) return "";

  const selectors = headings
    .filter((heading) => heading.numbering === "arabic" && heading.level === partLevel)
    .slice(1)
    .map((heading) => `#${heading.id}`);
  if (selectors.length === 0) return "";
  return `${selectors.join(", ")} { break-before: page; page-break-before: always; }`;
}

function composePassHtml(
  baseHtml: string,
  tocNumbers: ReadonlyMap<string, number>,
  blankCounts: ReadonlyMap<string, number>,
  probeHtml: string,
): string {
  let html = fillTocPageNumbers(baseHtml, tocNumbers).html;

  for (const [anchor, count] of blankCounts) {
    const blanks = Array.from({ length: count }, buildBlankPageHtml).join("\n");
    if (anchor === BODY_START_MARKER_ID) {
      html = html.replace(buildBodyStartMarker(), `${blanks}\n${buildBodyStartMarker()}`);
    } else {
      const index = html.search(headingOpenTagPattern(anchor));
      if (index !== -1) {
        html = `${html.slice(0, index)}${blanks}\n${html.slice(index)}`;
      }
    }
  }

  return `${html}\n${probeHtml}`;
}

function headingOpenTagPattern(headingId: string): RegExp {
  return new RegExp(`<h[1-6] id="${headingId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`);
}

function mapsEqual(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

/** Final absolute pages occupied by inserted blanks: the `count` pages right before each blanked anchor. */
function resolveBlankPages(
  blankCounts: ReadonlyMap<string, number>,
  plan: { bodyStartPage: number; headingPages: ReadonlyMap<string, number> },
): number[] {
  const pages: number[] = [];
  for (const [anchor, count] of blankCounts) {
    const anchorPage = anchor === BODY_START_MARKER_ID ? plan.bodyStartPage : plan.headingPages.get(anchor);
    if (anchorPage === undefined) continue;
    for (let i = 1; i <= count; i += 1) {
      pages.push(anchorPage - i);
    }
  }
  return pages.sort((a, b) => a - b);
}

/* ------------------------------ pdf-lib stamping ------------------------------ */

interface StampOptions {
  contentPageCount: number;
  pageLabels: (string | null)[];
  headers: (string | null)[];
  candidateName: string;
  includeCandidateName: boolean;
  includePageNumber: boolean;
}

const FOOTER_FONT_SIZE = 9;
const FOOTER_BASELINE_Y = 35;
const HEADER_FONT_SIZE = 9;
const HEADER_TOP_OFFSET = 42;

async function stripProbeAndStamp(pdfBytes: Buffer, options: StampOptions): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);

  while (doc.getPageCount() > options.contentPageCount) {
    doc.removePage(doc.getPageCount() - 1);
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
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
 * Helvetica is WinAnsi-encoded, which covers all of pt-PT (ã, ç, é, …) but
 * not arbitrary Unicode. Characters outside it are dropped rather than
 * letting the whole render throw over an unusual glyph in a heading.
 */
function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/[‐-‒]/g, "-")
    .replace(/[^\x20-\x7E -ÿ–—‘’‚“”„†‡•…€™]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
