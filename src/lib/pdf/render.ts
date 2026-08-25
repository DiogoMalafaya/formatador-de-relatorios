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

import { launchBrowser } from "./browser.ts";
import { buildFooterTemplate, buildHeaderTemplate, buildHtmlDocument } from "./template.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

export interface RenderPdfOptions {
  /** Printed in the footer when the rule set's `footer.includeCandidateName` is set. */
  candidateName: string;
}

export async function renderPdf(document: FormattedDocument, options: RenderPdfOptions): Promise<Buffer> {
  const { ruleSet } = document;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    // Images are already inlined as data URIs by parseDocx.ts, so there is
    // nothing left to fetch over the network — "load" is enough to wait for.
    await page.setContent(buildHtmlDocument(document), { waitUntil: "load" });

    const marginCm = `${ruleSet.marginsCm}cm`;
    const displayHeaderFooter = ruleSet.footer.includeCandidateName || ruleSet.footer.includePageNumber;

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter,
      headerTemplate: buildHeaderTemplate(),
      footerTemplate: buildFooterTemplate(ruleSet, options.candidateName),
      margin: { top: marginCm, bottom: marginCm, left: marginCm, right: marginCm },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
