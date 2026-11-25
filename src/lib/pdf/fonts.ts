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
import { EMBEDDED_FONTS, FONT_ORIGIN } from "./fontFamilies.ts";

export { EMBEDDED_FONTS, fontFaceCss, fontStack } from "./fontFamilies.ts";
export type { EmbeddedFamily, Face } from "./fontFamilies.ts";

/**
 * Where the font files live at runtime. `process.cwd()` is the project root
 * both under `node --test` and in a Next.js server function; Vercel only
 * ships the files because `next.config.ts` traces them into the PDF routes.
 */
const FONT_DIR = join(process.cwd(), "src", "lib", "pdf", "fonts");

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
