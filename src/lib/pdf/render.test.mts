import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { renderPdf } from "./render.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, longParagraphs, paragraph } from "../formatting/testFixtures.ts";

/**
 * These tests launch a real local Chrome (see `browser.ts` for how it's
 * found) — slower than the rest of the suite, but there is no way to verify
 * actual PDF output without one.
 */
describe("renderPdf", () => {
  test("renders a short document to a valid single-page A4 PDF", async () => {
    const buffer = await buildDocx([heading(1, "Formação"), paragraph("Texto simples, sem problemas.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const pdf = await renderPdf(document, { candidateName: "Maria Silva" });

    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");

    const loaded = await PDFDocument.load(pdf);
    assert.equal(loaded.getPageCount(), 1);

    const { width, height } = loaded.getPage(0).getSize();
    // A4 at 72dpi, ~1pt tolerance for Chromium rounding.
    assert.ok(Math.abs(width - 595.28) < 2);
    assert.ok(Math.abs(height - 841.89) < 2);
  });

  test("a document with Portuguese diacritics in the candidate name still renders a valid PDF", async () => {
    const buffer = await buildDocx([paragraph("Formação em Medicina Física e de Reabilitação — condições.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    // Actual glyph rendering can't be asserted without OCR; this only checks
    // the pipeline doesn't choke on non-ASCII input anywhere along the way.
    // See DIO-20 for QA against real reports.
    const pdf = await renderPdf(document, { candidateName: "João Cação" });
    const loaded = await PDFDocument.load(pdf);
    assert.equal(loaded.getPageCount(), 1);
  });

  test("a longer document spans multiple pages", async () => {
    const buffer = await buildDocx(longParagraphs(90, 400));
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const pdf = await renderPdf(document, { candidateName: "Maria Silva" });
    const loaded = await PDFDocument.load(pdf);
    assert.ok(loaded.getPageCount() > 1);
  });

  test("rendering the same input twice produces the same page count and a valid PDF each time", async () => {
    const buffer = await buildDocx([heading(1, "Formação"), paragraph("Texto simples.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const first = await renderPdf(document, { candidateName: "Maria Silva" });
    const second = await renderPdf(document, { candidateName: "Maria Silva" });

    const firstLoaded = await PDFDocument.load(first);
    const secondLoaded = await PDFDocument.load(second);
    assert.equal(firstLoaded.getPageCount(), secondLoaded.getPageCount());
  });
});
