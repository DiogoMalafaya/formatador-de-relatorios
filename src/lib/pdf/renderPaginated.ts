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
 * Footers (candidate name + page number) and the optional
 * running section header are stamped with pdf-lib after the final print —
 * Chromium's own header/footer templates can't leave the cover and blank
 * fillers unmarked or carry per-page section headers. The probe pages are stripped before stamping, so nothing synthetic
 * ever leaves the render. Both passes share one Chromium instance and one
 * invocation; no intermediate state is persisted anywhere.
 */

import { launchBrowser } from "./browser.ts";
import { extractPageMap } from "./pageMap.ts";
import {
  buildPageLabels,
  buildRunningHeaders,
  partHeadingLevel,
  planPagination,
  sectionSpan,
} from "./paginate.ts";
import type { PaginationPlan } from "./paginate.ts";
import {
  BODY_START_MARKER_ID,
  PAGE_MAP_PROBE_CSS,
  PAGINATION_CSS,
  TOC_START_MARKER_ID,
  buildBlankPageHtml,
  buildBodyStartMarker,
  buildTocStartMarker,
  buildHtmlDocument,
  buildPageMapProbeHtml,
} from "./template.ts";
import { fillTocPageNumbers } from "../merge/toc.ts";
import { buildRostoStartMarker, ROSTO_START_MARKER_ID } from "../covers/merge.ts";
import type { MergedHeading } from "../merge/types.ts";
import type { TableCaption } from "../formatting/tables.ts";
import type { NumberedCaption } from "../formatting/captions.ts";
import type { LowResolutionImage } from "../formatting/images.ts";
import { imageLowResolutionWarning, withSourceFilename } from "../formatting/warnings.ts";
import { pageLimitExceededWarning, summaryTooLongWarning } from "../formatting/warnings.ts";
import { printMargins } from "../formatting/ruleSet.ts";
import { serveEmbeddedFonts } from "./fonts.ts";
import { stampPages } from "./stamp.ts";
import type { FormattingWarning } from "../formatting/warnings.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

const MAX_PASSES = 3;

export interface PaginatedRenderOptions {
  candidateName: string;
  /** Merged headings in document order, from `mergeDocuments` (DIO-41). */
  headings: MergedHeading[];
  /** Numbered table captions, for the Lista de tabelas' page numbers (DIO-48). */
  tableCaptions?: readonly TableCaption[];
  /** Numbered figure captions, for the Lista de figuras' page numbers (DIO-49). */
  figureCaptions?: readonly NumberedCaption[];
  /** Front-matter headings that open on a recto, alone on their page: dedication, epigraph (DIO-50). */
  rectoHeadingIds?: readonly string[];
  /** Kept images below print resolution: warned about with the page they print on (DIO-49). */
  lowResolutionImages?: readonly (LowResolutionImage & { sourceFilename: string })[];
}

/** What actually happened, for validations, tests and timing reports. Never contains document text. */
export interface PaginatedRenderReport {
  totalPages: number;
  /** 1-based absolute page where the arabic sequence starts. */
  bodyStartPage: number;
  /** Footer label per page (1-based order); null = footer suppressed (cover). */
  pageLabels: (string | null)[];
  /** 1-based absolute pages occupied by inserted blank filler pages (no marks, DIO-51). */
  blankPages: number[];
  /** Final 1-based absolute page of each merged heading, by heading id. */
  headingPages: Record<string, number>;
  /** Final absolute page where the generated Índice starts, when there is one (DIO-45). */
  tocStartPage?: number;
  /** Running-header text per page (null = none), as stamped. */
  headers: (string | null)[];
  /** Render passes it took to converge (2 in the normal case). */
  passes: number;
  timings: { passMs: number[]; totalMs: number };
}

export interface PaginatedRenderResult {
  pdf: Buffer;
  report: PaginatedRenderReport;
  /** Exact-count validations over the final geometry (page cap, summary-section length). */
  warnings: FormattingWarning[];
}

export async function renderPaginatedPdf(
  document: FormattedDocument,
  options: PaginatedRenderOptions,
): Promise<PaginatedRenderResult> {
  const startedAt = Date.now();
  const { headings } = options;
  const captions = [...(options.tableCaptions ?? []), ...(options.figureCaptions ?? [])];
  const lowResolutionImages = options.lowResolutionImages ?? [];
  const { ruleSet } = document;

  const baseHtml = injectTocStartMarker(injectBodyStartMarker(document.html, headings));
  // Front-matter pages that open on a recto: the página de rosto (DIO-50),
  // then the Índice (DIO-45).
  const frontRectoMarkers = [
    ...(baseHtml.includes(buildRostoStartMarker()) ? [ROSTO_START_MARKER_ID] : []),
    ...(options.rectoHeadingIds ?? []),
    ...(baseHtml.includes(buildTocStartMarker()) ? [TOC_START_MARKER_ID] : []),
  ];
  const css = [document.css, PAGINATION_CSS, PAGE_MAP_PROBE_CSS, buildPartBreakCss(headings)].join("\n");
  // A recto heading (dedication) is both a marker and a heading: probe it once.
  const anchorIds = [
    ...new Set([
      ...frontRectoMarkers,
      BODY_START_MARKER_ID,
      ...headings.map((h) => h.id),
      ...captions.map((caption) => caption.id),
      ...lowResolutionImages.map((image) => image.anchorId),
    ]),
  ];
  const probeHtml = buildPageMapProbeHtml(anchorIds);

  const passMs: number[] = [];
  const browser = await launchBrowser();
  let pdfBytes: Buffer | undefined;
  let plan: PaginationPlan | undefined;
  let blankCounts = new Map<string, number>();
  let tocNumbers = new Map<string, number>();
  let passes = 0;

  try {
    const page = await browser.newPage();
    await serveEmbeddedFonts(page);

    for (;;) {
      passes += 1;
      const passStart = Date.now();

      const html = composePassHtml(baseHtml, tocNumbers, blankCounts, probeHtml);
      await page.setContent(buildHtmlDocument({ ...document, html, css }), { waitUntil: "load" });
      // Embedded faces load asynchronously; printing (and measuring the page
      // map) before they're ready would paginate in a fallback font.
      await page.evaluate(() => globalThis.document.fonts.ready);
      pdfBytes = Buffer.from(
        await page.pdf({
          format: "A4",
          printBackground: true,
          displayHeaderFooter: false,
          margin: printMargins(ruleSet.margins),
        }),
      );

      const map = await extractPageMap(pdfBytes, anchorIds);
      plan = planPagination({
        headings,
        pages: map.pages,
        totalPages: map.contentPageCount,
        existingBlanks: new Set(blankCounts.keys()),
        frontRectoMarkers,
        // Recto starts and their blank fillers are for print; a PDF-delivered
        // profile (Pediatria) reads them as errors (DIO-51, PRD Q12).
        rectoStarts: ruleSet.page.delivery === "print",
        pointAnchors: captions,
        trackedAnchors: lowResolutionImages.map((image) => image.anchorId),
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
  const pageLabels = buildPageLabels(totalPages, new Set(blankPages));
  // The running header names a part, and part titles render uppercase
  // (GENERATED_TOC_CSS, DIO-45), so the header matches what the page shows
  // rather than whatever case the chapter file was typed in.
  const headers = ruleSet.header.allowed
    ? buildRunningHeaders(headings, plan.headingPages, totalPages, bodyStartPage, new Set(blankPages)).map(
        (header) => header?.toLocaleUpperCase("pt-PT") ?? null,
      )
    : new Array<string | null>(totalPages).fill(null);

  const pdf = await stampPages(pdfBytes, {
    contentPageCount: totalPages,
    pageLabels,
    headers,
    candidateName: options.candidateName,
    fontFamily: document.fontFamily,
    includeCandidateName: ruleSet.footer.includeCandidateName,
    includePageNumber: ruleSet.footer.includePageNumber,
  });

  const warnings: FormattingWarning[] = [];
  for (const image of lowResolutionImages) {
    const page = plan.pointPages.get(image.anchorId);
    const label = page === undefined ? undefined : (pageLabels[page - 1] ?? undefined);
    warnings.push(
      withSourceFilename(imageLowResolutionWarning(image.ordinal, image.dpi, label ?? undefined), image.sourceFilename),
    );
  }
  if (ruleSet.constraints.maxPages !== undefined && totalPages > ruleSet.constraints.maxPages) {
    warnings.push(pageLimitExceededWarning(totalPages, ruleSet.constraints.maxPages));
  }
  const summaryRule = ruleSet.constraints.summarySection;
  if (summaryRule) {
    const span = sectionSpan(headings, plan.headingPages, totalPages, summaryRule.headingPattern);
    if (span && span.pageCount > summaryRule.maxPages) {
      warnings.push(summaryTooLongWarning(summaryRule.labelPt, span.pageCount, summaryRule.maxPages));
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
      headingPages: Object.fromEntries(plan.headingPages),
      ...(plan.markerPages.has(TOC_START_MARKER_ID)
        ? { tocStartPage: plan.markerPages.get(TOC_START_MARKER_ID) }
        : {}),
      headers,
      passes,
      timings: { passMs, totalMs: Date.now() - startedAt },
    },
  };
}

/* ------------------------------ HTML composition ------------------------------ */

/**
 * Puts the invisible body-start marker right before the first body (arabic)
 * heading, so the page map knows where the arabic sequence begins. Front
 * matter that follows the Índice (abbreviations, lists — DIO-45) therefore
 * stays in the front matter. Falls back to just after the generated Índice,
 * then to the end, when there is no body heading.
 */
export function injectBodyStartMarker(html: string, headings: readonly MergedHeading[]): string {
  const marker = buildBodyStartMarker();

  const firstArabic = headings.find((heading) => heading.numbering === "arabic");
  if (firstArabic) {
    const headingIndex = html.search(headingOpenTagPattern(firstArabic.id));
    if (headingIndex !== -1) {
      return `${html.slice(0, headingIndex)}${marker}\n${html.slice(headingIndex)}`;
    }
  }

  const navStart = html.indexOf('<nav class="generated-toc">');
  if (navStart !== -1) {
    const navEnd = html.indexOf("</nav>", navStart);
    if (navEnd !== -1) {
      const insertAt = navEnd + "</nav>".length;
      return `${html.slice(0, insertAt)}\n${marker}${html.slice(insertAt)}`;
    }
  }

  return `${html}\n${marker}`;
}

/** Puts the Índice's start marker right before the generated Índice, when there is one. */
export function injectTocStartMarker(html: string): string {
  const navStart = html.indexOf('<nav class="generated-toc">');
  if (navStart === -1) return html;
  return `${html.slice(0, navStart)}${buildTocStartMarker()}\n${html.slice(navStart)}`;
}

/** Marker anchors and the exact HTML that stands for each in the composed document. */
const MARKER_HTML: Readonly<Record<string, string>> = {
  [BODY_START_MARKER_ID]: buildBodyStartMarker(),
  [TOC_START_MARKER_ID]: buildTocStartMarker(),
  [ROSTO_START_MARKER_ID]: buildRostoStartMarker(),
};

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
    const markerHtml = MARKER_HTML[anchor];
    if (markerHtml) {
      html = html.replace(markerHtml, `${blanks}\n${markerHtml}`);
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
  plan: {
    bodyStartPage: number;
    headingPages: ReadonlyMap<string, number>;
    markerPages: ReadonlyMap<string, number>;
  },
): number[] {
  const pages: number[] = [];
  for (const [anchor, count] of blankCounts) {
    const anchorPage =
      anchor === BODY_START_MARKER_ID
        ? plan.bodyStartPage
        : (plan.markerPages.get(anchor) ?? plan.headingPages.get(anchor));
    if (anchorPage === undefined) continue;
    for (let i = 1; i <= count; i += 1) {
      pages.push(anchorPage - i);
    }
  }
  return pages.sort((a, b) => a - b);
}
