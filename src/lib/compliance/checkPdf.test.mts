import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { checkPdfCompliance } from "./checkPdf.ts";
import { mergeCoverWithDocument } from "../covers/merge.ts";
import { renderPdf } from "../pdf/render.ts";
import { applyFormatting } from "../formatting/apply.ts";
import type { FormattedDocument } from "../formatting/apply.ts";
import { getRuleSet, HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readRegularFontFile } from "../pdf/fonts.ts";
import { tabBand } from "../pdf/chapterTabs.ts";
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

/** The front matter MFR requires (DIO-50): cover with its four fields, signed rosto, signed last page. */
const LOCAL = "Hospital Imaginário, Vila Inventada";
const withFrontMatter = (document: FormattedDocument): FormattedDocument =>
  mergeCoverWithDocument(document, {
    candidateName: NAME,
    dateLabel: "12 de março de 2026",
    specialtyNamePt: "Medicina Física e de Reabilitação",
    details: { hospital: "Hospital Imaginário", city: "Vila Inventada" },
  });

async function violations(document: FormattedDocument, candidateName = NAME) {
  const pdf = await renderPdf(document, { candidateName: NAME });
  const found = await checkPdfCompliance(pdf, {
    ruleSet: document.ruleSet,
    fontFamily: document.fontFamily,
    candidateName,
    localDeFormacao: LOCAL,
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
    clean = withFrontMatter(await mfrDocument());
  });


  test("a clean MFR document, front matter included, passes every check", async () => {
    assert.deepEqual(await violations(clean), []);
  });

  test("catches a cover without the local de formação (DIO-50)", async () => {
    const withoutLocal = mergeCoverWithDocument(await mfrDocument(), { candidateName: NAME, dateLabel: "12 de março de 2026" });
    const found = await violations(withoutLocal);
    assert.ok(found.includes("cover-fields"), found.join());
  });

  test("catches MFR front matter without its signature blocks (DIO-50)", async () => {
    assert.deepEqual(
      await violations({ ...(await mfrDocument()), html: `<p>${NAME}</p><p>Curriculum Vitae</p><p>${LOCAL}</p><p>2026</p>` }),
      ["candidate-signature", "rosto-signatures"],
    );
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
      skip: ["cover-fields", "rosto-signatures", "candidate-signature"],
    });
    assert.deepEqual(found.map((violation) => violation.check), ["margins"]);
  });

  describe("chapter tabs in the outer margin (DIO-58)", () => {
    const A4: [number, number] = [595.28, 841.89];
    /** A hand-built two-page PDF with one text item per page, like the margins test above. */
    async function check(ruleSetId: string, draws: { page: 1 | 2; x: number; y: number; text?: string; size?: number }[]) {
      const ruleSet = getRuleSet(ruleSetId);
      const fontFamily = ruleSet.font.family.default;
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(readRegularFontFile(fontFamily), { subset: true });
      const pages = [doc.addPage(A4), doc.addPage(A4)];
      for (const draw of draws) {
        pages[draw.page - 1].drawText(draw.text ?? "3", { x: draw.x, y: draw.y, size: draw.size ?? 12, font });
      }
      const found = await checkPdfCompliance(await doc.save(), {
        ruleSet,
        fontFamily,
        candidateName: NAME,
        skip: ["cover-fields", "rosto-signatures", "candidate-signature"],
      });
      return found.map((violation) => violation.check);
    }
    const band = (ruleSetId: string, page: number) => tabBand({ width: A4[0], height: A4[1] }, getRuleSet(ruleSetId).margins, page);
    const middle = (rect: ReturnType<typeof band>) => ({ x: rect.x + rect.width / 2 - 3, y: rect.y + rect.height / 2 });

    test("a tab in the outer band passes, on a recto and on a verso, at either allowed size", async () => {
      assert.deepEqual(
        await check("mfr", [
          { page: 1, ...middle(band("mfr", 1)), size: 14 },
          { page: 2, ...middle(band("mfr", 2)), size: 12 },
        ]),
        [],
      );
    });

    test("the same mark on the inner side is still text in the margins", async () => {
      // The recto's inner side is where a verso's tab would be.
      assert.deepEqual(await check("mfr", [{ page: 1, ...middle(band("mfr", 2)) }]), ["margins"]);
    });

    test("body text running past the text block still fails, even into the band", async () => {
      const right = A4[0] - getRuleSet("mfr").margins.rightCm * (72 / 2.54);
      assert.deepEqual(
        await check("mfr", [{ page: 1, x: right - 60, y: 400, text: "Texto fictício que transborda a margem" }]),
        ["margins"],
      );
    });

    test("a tab above or below the text block's height is not a tab", async () => {
      const outer = band("mfr", 1);
      assert.deepEqual(await check("mfr", [{ page: 1, x: middle(outer).x, y: outer.y + outer.height + 20 }]), []);
      // Above the text block is the running header's zone (allowed); below it, the footer's, which says too much.
      assert.deepEqual(await check("mfr", [{ page: 1, x: middle(outer).x, y: outer.y - 20 }]), ["footer-content"]);
    });

    test("Pediatria (PDF delivery) has no tab band: the same mark is text in the margins", async () => {
      const outer = band("pediatria", 1);
      assert.deepEqual(await check("pediatria", [{ page: 1, ...middle(outer), size: 10 }]), ["margins"]);
    });

    test("a tab is still held to the text colour", async () => {
      const ruleSet = getRuleSet("mfr");
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(readRegularFontFile(ruleSet.font.family.default), { subset: true });
      const page = doc.addPage(A4);
      page.drawText("3", { ...middle(band("mfr", 1)), size: 12, font, color: rgb(0.1, 0.2, 0.6) });
      const found = await checkPdfCompliance(await doc.save(), {
        ruleSet,
        fontFamily: ruleSet.font.family.default,
        candidateName: NAME,
        skip: ["cover-fields", "rosto-signatures", "candidate-signature"],
      });
      assert.deepEqual(found.map((violation) => violation.check), ["text-colour"]);
    });
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
    // The pipeline removes them under MFR (DIO-49), so the image is slipped
    // in after formatting: the checker is the backstop if that ever fails.
    const document = await mfrDocument([heading(1, "Formação")]);
    const kept = await applyFormatting(await buildDocx([imageParagraph()]), { ruleSetId: HOUSE_RULE_SET_ID });
    const found = await violations({ ...document, html: `${document.html}\n${kept.html}` });
    assert.ok(found.includes("images-forbidden"), found.join());
  });

  test("an MFR document through the pipeline carries no image", async () => {
    const found = await violations(await mfrDocument([heading(1, "Formação"), imageParagraph()]));
    assert.ok(!found.includes("images-forbidden"), found.join());
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
