/**
 * HTML/PDF template builders (DIO-11).
 *
 * Kept free of any Chromium dependency so they can be unit-tested without a
 * browser. `render.ts` is the only caller.
 */

import type { FormattedDocument } from "../formatting/apply.ts";
import type { RuleSet } from "../formatting/ruleSet.ts";
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
 * roman front matter, arabic body restarting at 1, blank pages forcing      *
 * recto starts for double-sided printing, and a page-map probe that turns   *
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

export const INTENTIONAL_BLANK_TEXT_PT = "Página intencionalmente deixada em branco";

/**
 * One intentionally-blank page, inserted where double-sided printing needs
 * the following content to start on a recto (odd) page. Carries the pt-PT
 * convention text the reference document uses, centred, nothing else.
 */
export function buildBlankPageHtml(): string {
  return `<section class="intentional-blank-page" aria-hidden="true"><p>${INTENTIONAL_BLANK_TEXT_PT}</p></section>`;
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
.intentional-blank-page p { font-style: italic; text-align: center; }
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

/**
 * The norms treat a header as optional and scoped to a section/subsection
 * reference (see `ruleSet.header.allowed`) — the engine has no per-page
 * section context to put there today, so every rule set gets an empty header
 * box. Revisit once a rule set actually requires header content.
 */
export function buildHeaderTemplate(): string {
  return "<div></div>";
}

/**
 * Footer per the rule set's `footer` flags: candidate name and/or a
 * sequential page number, nothing else (per the norms' own footer rule).
 * `.pageNumber` is a Puppeteer-recognised class Chromium fills in at print
 * time — see https://pptr.dev/api/puppeteer.pdfoptions.footertemplate.
 */
export function buildFooterTemplate(ruleSet: RuleSet, candidateName: string): string {
  if (!ruleSet.footer.includeCandidateName && !ruleSet.footer.includePageNumber) {
    return "<div></div>";
  }

  const parts: string[] = [];
  if (ruleSet.footer.includeCandidateName) {
    parts.push(escapeHtml(candidateName));
  }
  if (ruleSet.footer.includePageNumber) {
    parts.push('<span class="pageNumber"></span>');
  }

  return `<div style="width:100%; font-size:9px; font-family:Arial,sans-serif; text-align:center; color:#000;">${parts.join(" — ")}</div>`;
}
