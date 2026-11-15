/**
 * Server-side PDF rendering (DIO-11).
 *
 * The shared rendering step feeding both the watermarked preview (DIO-13)
 * and the final clean download (DIO-15) — neither watermarking nor payment
 * gating happens here, only `.docx`-derived HTML+CSS in, PDF bytes out.
 *
 * Determinism note: the same `FormattedDocument` + candidate name always
 * produces the same visible content and page layout, since rendering is a
 * pure function of its inputs plus a pinned Chromium binary. It is *not*
 * byte-for-byte identical across runs — Chromium's PDF backend stamps its
 * own `/CreationDate`/`/ID` into the output — so don't hash the PDF for
 * caching or dedup without stripping that metadata first.
 */

import { PDFDocument } from "pdf-lib";
import { launchBrowser } from "./browser.ts";
import { buildHtmlDocument } from "./template.ts";
import { stampPages } from "./stamp.ts";
import type { FormattedDocument } from "../formatting/apply.ts";
import { printMargins } from "../formatting/ruleSet.ts";
import { serveEmbeddedFonts } from "./fonts.ts";

export interface RenderPdfOptions {
  /** Printed in the footer when the rule set's `footer.includeCandidateName` is set. */
  candidateName: string;
}

export async function renderPdf(document: FormattedDocument, options: RenderPdfOptions): Promise<Buffer> {
  const { ruleSet } = document;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await serveEmbeddedFonts(page);
    // Images are already inlined as data URIs by parseDocx.ts, so there is
    // nothing left to fetch over the network — "load" is enough to wait for.
    await page.setContent(buildHtmlDocument(document), { waitUntil: "load" });
    // Embedded faces load asynchronously; printing before they're ready
    // would lay the page out in a fallback font.
    await page.evaluate(() => globalThis.document.fonts.ready);

    const pdf = Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: false,
        margin: printMargins(ruleSet.margins),
      }),
    );

    // Footer stamped with pdf-lib in the embedded face (see stamp.ts):
    // Chromium's footer template can't load it. One sequential arabic count,
    // as the template's pageNumber gave before.
    const pageCount = (await PDFDocument.load(pdf)).getPageCount();
    return stampPages(pdf, {
      contentPageCount: pageCount,
      pageLabels: Array.from({ length: pageCount }, (_, index) => String(index + 1)),
      headers: new Array<string | null>(pageCount).fill(null),
      candidateName: options.candidateName,
      fontFamily: document.fontFamily,
      includeCandidateName: ruleSet.footer.includeCandidateName,
      includePageNumber: ruleSet.footer.includePageNumber,
    });
  } finally {
    await browser.close();
  }
}
