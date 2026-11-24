/**
 * HTML/PDF template builders (DIO-11).
 *
 * Kept free of any Chromium dependency so they can be unit-tested without a
 * browser. `render.ts` is the only caller.
 */

import type { FormattedDocument } from "../formatting/apply.ts";
import { escapeHtml } from "../html.ts";

/** Wraps the parsed document + rule-set CSS into a full page Chromium can load. */
export function buildHtmlDocument(document: FormattedDocument): string {
  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8" />
<style>${document.css}</style>
</head>
<body>
${document.html}
</body>
</html>`;
}

/* ------------------------------------------------------------------------ *
 * Two-pass pagination furniture (DIO-42).                                   *
 *                                                                           *
 * The merged multi-file document is paginated like the real signed volume:  *
 * one arabic sequence from the cover (DIO-51), blank fillers forcing recto  *
 * starts for double-sided printing, and a page-map probe that turns         *
 * pass 1's printed PDF into an exact heading → page map (see pageMap.ts).   *
 * All of it is plain HTML/CSS so it stays unit-testable without Chromium.   *
 * ------------------------------------------------------------------------ */

/** Anchor id of the invisible marker where the body (arabic sequence) starts. */
export const BODY_START_MARKER_ID = "dio42-body-start";

/**
 * Marker div injected between the generated Índice and the first body block.
 * 1×1px so Chromium's link-destination for it resolves to a real position on
 * the body's first page without affecting layout.
 */
export function buildBodyStartMarker(): string {
  return `<div id="${BODY_START_MARKER_ID}" class="page-map-marker" aria-hidden="true"></div>`;
}

/** Anchor id of the invisible marker right before the generated Índice (DIO-45). */
export const TOC_START_MARKER_ID = "dio45-toc-start";

/**
 * Same 1×1px marker as the body's, opening the Índice on a fresh page and
 * giving the page map (and the blank-page plan) a handle on where it starts,
 * so it can be put on a recto.
 */
export function buildTocStartMarker(): string {
  return `<div id="${TOC_START_MARKER_ID}" class="page-map-marker" aria-hidden="true"></div>`;
}


/**
 * One truly blank filler page (DIO-51), inserted where double-sided printing
 * needs the following content to start on a recto (odd) page. No text; the
 * stamp leaves it without footer or number too, but it counts.
 */
export function buildBlankPageHtml(): string {
  return `<section class="intentional-blank-page" aria-hidden="true"></section>`;
}

/** CSS for the marker and blank pages. Shipped only by the paginated (multi-file) render path. */
export const PAGINATION_CSS = `
/* The marker opens the body on a fresh page: the front matter must never
   share its last page with the body's first block. It also makes the marker's
   printed position the body's own first page, which is what the page map reads,
   and makes an inserted blank shift the body by exactly one page. The first
   part heading deliberately gets no break of its own (see buildPartBreakCss)
   so it flows right after this marker instead of leaving a near-empty page. */
.page-map-marker { width: 1px; height: 1px; break-before: page; page-break-before: always; }
/* Every front-matter element starts on its own page (DIO-45). Adjacent forced
   breaks (the cover's break-after, the Índice's) collapse into one, so this
   never produces an empty page. */
.front-matter-title { break-before: page; page-break-before: always; }
.intentional-blank-page {
  break-before: page;
  page-break-before: always;
  break-after: page;
  page-break-after: always;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Just under the A4 printable height (29.7cm minus 2×2.5cm margins) so the
     section fills exactly one page without ever spilling onto a second. */
  height: 23.5cm;
}
`;

/** Anchor id of the probe section's own first element — everything before its page is real content. */
export const PAGE_MAP_PROBE_START_ID = "dio42-probe-start";

/**
 * The probe appended after the document on both render passes: one internal
 * link per anchor. Chromium's printToPDF materialises each link target as a
 * named destination (keyed by the anchor id) resolvable to the target's
 * page, which `pageMap.ts` reads back with pdf-lib. The first link targets
 * the probe's own start marker, so the extractor also learns where content
 * ends. The probe pages are stripped from the PDF before anything leaves the
 * render.
 */
export function buildPageMapProbeHtml(anchorIds: string[]): string {
  const links = [PAGE_MAP_PROBE_START_ID, ...anchorIds]
    .map((id) => `<a class="page-map-probe-link" href="#${escapeHtml(id)}">.</a>`)
    .join("\n");
  return `<section class="page-map-probe"><span id="${PAGE_MAP_PROBE_START_ID}"></span>\n${links}\n</section>`;
}

export const PAGE_MAP_PROBE_CSS = `
.page-map-probe { break-before: page; page-break-before: always; }
.page-map-probe-link { display: block; font-size: 8pt; line-height: 2; color: #000; text-decoration: none; }
`;

/* ------------------------------------------------------------------------ *
 * Chapter dividers (DIO-54, PRD US7).                                      *
 * ------------------------------------------------------------------------ */

/** Anchor id of the divider page that opens the chapter headed by `headingId`. */
export function chapterDividerId(headingId: string): string {
  return `dio54-divider-${headingId}`;
}

/**
 * One divider page: the chapter's number and title, alone on a page, placed
 * right before the chapter heading. Typographic only — no rule, no colour —
 * so it's compliant under a profile that forbids graphics or colour (MFR).
 * The house theme's accent-filled verso belongs to the themes (DIO-56).
 */
export function buildChapterDividerHtml(heading: { id: string; text: string; number?: string }): string {
  const number = heading.number?.replace(/\.$/, "");
  const numberHtml = number ? `<p class="chapter-divider-number">${escapeHtml(number)}</p>\n` : "";
  return `<section id="${chapterDividerId(heading.id)}" class="chapter-divider">\n${numberHtml}<p class="chapter-divider-title">${escapeHtml(heading.text)}</p>\n</section>`;
}

/**
 * Divider page CSS. Text stays at the profile's title size: the compliance
 * checker holds explicit profiles to their stated sizes (MFR: titles 12 or
 * 14 pt), so a large display numeral would be a violation there. Bigger,
 * theme-styled dividers come with the house themes (DIO-56).
 *
 * The divider breaks *after* itself, so the chapter heading opens the next
 * page; the break *before* each divider but the first is added per id (see
 * `buildPartBreakCss`), for the same reason the first part heading gets none.
 */
export function buildChapterDividerCss(titleSizePt: number): string {
  return `
.chapter-divider {
  break-after: page;
  page-break-after: always;
  break-inside: avoid;
  display: flex;
  flex-direction: column;
  justify-content: center;
  /* One page exactly, like the blank filler: under the printable height of
     every profile's margins, and never spilling onto a second page. */
  height: 23.5cm;
  overflow: hidden;
  text-align: center;
}
.chapter-divider p { margin: 0; text-align: center; text-indent: 0; hyphens: manual; }
.chapter-divider .chapter-divider-number {
  font-weight: bold;
  font-size: ${titleSizePt}pt;
  font-variant-numeric: tabular-nums;
  margin-bottom: 0.6em;
}
.chapter-divider .chapter-divider-title {
  font-weight: bold;
  font-size: ${titleSizePt}pt;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
`;
}
