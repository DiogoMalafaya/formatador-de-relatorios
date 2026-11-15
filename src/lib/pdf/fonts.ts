/**
 * Embedded fonts for every PDF we render (DIO-46).
 *
 * The norms name proprietary faces (Arial, Times New Roman, Verdana), and the
 * serverless Chromium we render with (`@sparticuz/chromium`) ships exactly
 * one font family: Open Sans. Without this module, production PDFs silently
 * fell back to whatever Chromium had, which breaks the one rule every
 * published norm agrees on. Locally it looked fine only because macOS has the
 * originals installed.
 *
 * So we ship open-licence files in `./fonts/` (licence texts alongside) and
 * load them into the page ourselves:
 *
 * | Norm asks for   | We embed          | Why                                                   |
 * |-----------------|-------------------|-------------------------------------------------------|
 * | Arial           | Arimo (OFL)       | Metric-compatible: same widths, same line breaks      |
 * | Times New Roman | Tinos (OFL)       | Metric-compatible: same widths, same line breaks      |
 * | Verdana         | DejaVu LGC Sans   | No metric-compatible open Verdana exists; closest look (PRD Q2b, decided 2026-11-15) |
 *
 * Faces are referenced by a fake origin and served from disk through request
 * interception, so Chromium fetches only the faces a page actually uses
 * (base64 data URIs would push every face through every render pass).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer-core";
import type { FontFamily } from "../formatting/ruleSet.ts";

/**
 * Where the font files live at runtime. `process.cwd()` is the project root
 * both under `node --test` and in a Next.js server function; Vercel only
 * ships the files because `next.config.ts` traces them into the PDF routes.
 */
const FONT_DIR = join(process.cwd(), "src", "lib", "pdf", "fonts");

/** Never resolves: requests to it are answered by `serveEmbeddedFonts` or not at all. */
const FONT_ORIGIN = "https://lauda-fonts.invalid/";

interface Face {
  file: string;
  /** CSS font-weight descriptor; a range for variable fonts. */
  weight: string;
  style: "normal" | "italic";
}

interface EmbeddedFamily {
  /** The CSS family name we register — also the name the PDF will report. */
  cssFamily: string;
  generic: "serif" | "sans-serif";
  faces: readonly Face[];
  /** Regular face, embedded by pdf-lib for stamped footers/headers. */
  regularFile: string;
}

export const EMBEDDED_FONTS: Readonly<Record<FontFamily, EmbeddedFamily>> = {
  Arial: {
    cssFamily: "Arimo",
    generic: "sans-serif",
    faces: [
      { file: "Arimo-VariableWght.ttf", weight: "400 700", style: "normal" },
      { file: "Arimo-Italic-VariableWght.ttf", weight: "400 700", style: "italic" },
    ],
    regularFile: "Arimo-VariableWght.ttf",
  },
  "Times New Roman": {
    cssFamily: "Tinos",
    generic: "serif",
    faces: [
      { file: "Tinos-Regular.ttf", weight: "400", style: "normal" },
      { file: "Tinos-Bold.ttf", weight: "700", style: "normal" },
      { file: "Tinos-Italic.ttf", weight: "400", style: "italic" },
      { file: "Tinos-BoldItalic.ttf", weight: "700", style: "italic" },
    ],
    regularFile: "Tinos-Regular.ttf",
  },
  Verdana: {
    cssFamily: "DejaVu LGC Sans",
    generic: "sans-serif",
    faces: [
      { file: "DejaVuLGCSans.ttf", weight: "400", style: "normal" },
      { file: "DejaVuLGCSans-Bold.ttf", weight: "700", style: "normal" },
      { file: "DejaVuLGCSans-Oblique.ttf", weight: "400", style: "italic" },
      { file: "DejaVuLGCSans-BoldOblique.ttf", weight: "700", style: "italic" },
    ],
    regularFile: "DejaVuLGCSans.ttf",
  },
};

/** The CSS `font-family` value for a norm's font: our embedded face, then a generic fallback. */
export function fontStack(family: FontFamily): string {
  const embedded = EMBEDDED_FONTS[family];
  return `"${embedded.cssFamily}", ${embedded.generic}`;
}

/** `@font-face` rules for one norm font. Only faces the page uses get fetched. */
export function fontFaceCss(family: FontFamily): string {
  const embedded = EMBEDDED_FONTS[family];
  return embedded.faces
    .map(
      (face) =>
        `@font-face { font-family: "${embedded.cssFamily}"; ` +
        `src: url("${FONT_ORIGIN}${face.file}") format("truetype"); ` +
        `font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; }`,
    )
    .join("\n");
}

const fileCache = new Map<string, Buffer>();

/** Font file bytes, read once per process. */
export function readFontFile(file: string): Buffer {
  let bytes = fileCache.get(file);
  if (!bytes) {
    bytes = readFileSync(join(FONT_DIR, file));
    fileCache.set(file, bytes);
  }
  return bytes;
}

/** The regular face of a norm font, for pdf-lib to embed in stamped text. */
export function readRegularFontFile(family: FontFamily): Buffer {
  return readFontFile(EMBEDDED_FONTS[family].regularFile);
}

const KNOWN_FILES = new Set(
  Object.values(EMBEDDED_FONTS).flatMap((family) => family.faces.map((face) => face.file)),
);

/**
 * Answers the page's font requests from disk. Call once per page, before
 * `setContent`. Everything else continues untouched. A request for a file we
 * don't ship is aborted rather than left hanging.
 */
export async function serveEmbeddedFonts(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(FONT_ORIGIN)) {
      void request.continue();
      return;
    }
    const file = decodeURIComponent(url.slice(FONT_ORIGIN.length));
    if (!KNOWN_FILES.has(file)) {
      void request.abort();
      return;
    }
    void request.respond({
      status: 200,
      contentType: "font/ttf",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: readFontFile(file),
    });
  });
}
