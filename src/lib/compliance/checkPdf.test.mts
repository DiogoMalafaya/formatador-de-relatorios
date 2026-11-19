import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { checkPdfCompliance } from "./checkPdf.ts";
import type { ComplianceCheckId } from "./checkPdf.ts";
import { renderPdf } from "../pdf/render.ts";
import { applyFormatting } from "../formatting/apply.ts";
import type { FormattedDocument } from "../formatting/apply.ts";
import { getRuleSet } from "../formatting/ruleSet.ts";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readRegularFontFile } from "../pdf/fonts.ts";
import { buildDocx, heading, imageParagraph, longParagraphs, paragraph } from "../formatting/testFixtures.ts";

/**
 * The checker has to *catch* things, not just pass clean documents: each
 * test here renders a real PDF that breaks exactly one rule and expects
 * exactly that check to fire. Invented content only.
 */

const NAME = "Pessoa Inventada";

async function mfrDocument(children = [heading(1, "Formação"), paragraph("Texto fictício.")]): Promise<FormattedDocument> {
  return applyFormatting(await buildDocx(children), { ruleSetId: "mfr" });
}

async function violations(document: FormattedDocument, candidateName = NAME) {
  const pdf = await renderPdf(document, { candidateName: NAME });
  const found = await checkPdfCompliance(pdf, {
    ruleSet: document.ruleSet,
    fontFamily: document.fontFamily,
    candidateName,
  });
  return found.map((violation) => violation.check).sort();
}

const withCss = (document: FormattedDocument, css: string): FormattedDocument => ({
  ...document,
  css: `${document.css}\n${css}`,
});

describe("checkPdfCompliance (DIO-47)", () => {
  let clean: FormattedDocument;
  before(async () => {
    clean = await mfrDocument();
  });

  const expectOnly = (found: ComplianceCheckId[], check: ComplianceCheckId) => assert.deepEqual(found, [check]);

  test("a clean MFR document passes every check", async () => {
    // Page 1 of this document is not a cover, so the cover check is the one
    // expected finding; everything else must pass.
    expectOnly(await violations(clean), "cover-fields");
  });

  test("catches text that isn't black", async () => {
    const found = await violations(withCss(clean, "p { color: #c00; }"));
    assert.ok(found.includes("text-colour"), found.join());
  });

  test("catches text below the norm's size", async () => {
    const document = await mfrDocument([heading(1, "Capa fictícia"), paragraph("Página de capa."), heading(1, "Formação"), ...longParagraphs(12, 120)]);
    const found = await violations(withCss(document, "p { font-size: 9pt; }"));
    assert.ok(found.includes("font-size"), found.join());
  });

  test("catches text drawn into the margins", async () => {
    // Chromium clips its own layout to the content box (overflow is cut off,
    // not drawn in the margin), so this guards text drawn outside it, such
    // as stamped text. A hand-built PDF exercises the check directly.
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(readRegularFontFile("Times New Roman"), { subset: true });
    const page = doc.addPage([595.28, 841.89]);
    page.drawText("Texto fictício na margem", { x: 20, y: 400, size: 12, font });
    const found = await checkPdfCompliance(await doc.save(), {
      ruleSet: getRuleSet("mfr"),
      fontFamily: "Times New Roman",
      candidateName: NAME,
      skip: ["cover-fields"],
    });
    assert.deepEqual(found.map((violation) => violation.check), ["margins"]);
  });

  test("catches a system font", async () => {
    // Helvetica exists on every Mac and Linux CI runner; our fonts never resolve to it.
    const found = await violations(withCss(clean, 'p { font-family: "Helvetica", "Courier New", monospace; }'));
    assert.ok(found.includes("system-font"), found.join());
  });

  test("catches a footer that says more than the name and the page number", async () => {
    const found = await violations(clean, "Outra Pessoa");
    assert.ok(found.includes("footer-content"), found.join());
  });

  test("catches images where the norms forbid them", async () => {
    const found = await violations(await mfrDocument([heading(1, "Formação"), imageParagraph()]));
    assert.ok(found.includes("images-forbidden"), found.join());
  });

  test("catches a document over the page cap", async () => {
    const document = await mfrDocument(longParagraphs(10, 400));
    const capped = { ...document, ruleSet: { ...document.ruleSet, constraints: { ...document.ruleSet.constraints, maxPages: 2 } } };
    const found = await violations(capped);
    assert.ok(found.includes("page-cap"), found.join());
  });

  test("does not check what a profile is silent on", async () => {
    // Pediatria is silent on colour and images: neither may be flagged.
    const document = await applyFormatting(await buildDocx([heading(1, "Formação"), imageParagraph()]), { ruleSetId: "pediatria" });
    const found = await violations(withCss(document, "p { color: #c00; }"));
    assert.ok(!found.includes("text-colour"), found.join());
    assert.ok(!found.includes("images-forbidden"), found.join());
    assert.equal(getRuleSet("pediatria").constraints.imagesForbidden, false);
  });

  test("messages never quote document text", async () => {
    const document = await mfrDocument([heading(1, "Segredo Clínico"), paragraph("Doente fictício X.")]);
    const pdf = await renderPdf(withCss(document, "p { color: #c00; margin-left: -2cm; }"), { candidateName: NAME });
    const found = await checkPdfCompliance(pdf, { ruleSet: document.ruleSet, fontFamily: document.fontFamily, candidateName: NAME });
    for (const violation of found) {
      assert.doesNotMatch(violation.messagePt, /Segredo|Doente|Inventada/, violation.messagePt);
    }
  });
});
