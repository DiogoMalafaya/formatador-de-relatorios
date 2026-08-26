/**
 * Watermarked preview overlay (DIO-13).
 *
 * Diagonal, repeated, low-opacity text — the ticket's own recommended
 * default (D3: the preview must be good enough to build trust, not good
 * enough to use). Rendered as a tiled SVG `background-image` rather than
 * many individual text nodes so the tiling is even without hand-computing
 * how many copies fit a page.
 *
 * The overlay `<div>` uses `position: fixed`. Chromium's `printToPDF`
 * repeats `position: fixed` elements on every generated page (unlike most
 * other CSS positioning), which is exactly what "no unwatermarked page"
 * needs and is why this doesn't have to run once per page — see
 * https://developer.chrome.com/blog/print-fixed and the DIO-13 test that
 * checks a multi-page document for the CSS, not per-page markup.
 */

import { escapeHtml } from "../html.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

export const PREVIEW_WATERMARK_TEXT = "PRÉ-VISUALIZAÇÃO";

export function applyWatermark(
  document: FormattedDocument,
  text: string = PREVIEW_WATERMARK_TEXT,
): FormattedDocument {
  const tile = buildWatermarkTileDataUri(text);

  const html = `<div class="preview-watermark" aria-hidden="true"></div>\n${document.html}`;
  const css = `${document.css}

.preview-watermark {
  position: fixed;
  inset: 0;
  background-image: url("${tile}");
  background-repeat: repeat;
  pointer-events: none;
}
`;

  return { ...document, html, css };
}

function buildWatermarkTileDataUri(text: string): string {
  const escaped = escapeHtml(text);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">
<text x="160" y="120" transform="rotate(-30 160 110)" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000" fill-opacity="0.12">${escaped}</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}
