import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { renderPdf } from "./render.ts";
import { renderPaginatedPdf } from "./renderPaginated.ts";
import { EMBEDDED_FONTS, readFontFile } from "./fonts.ts";
import { applyFormatting, formatParsedDocument } from "../formatting/apply.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { buildDocx, heading, longParagraphs, paragraph } from "../formatting/testFixtures.ts";
import { mergeDocuments } from "../merge/index.ts";
import type { FontFamily } from "../formatting/ruleSet.ts";

/**
 * DIO-46: the fonts in the PDF are the ones we ship, never whatever the
 * rendering machine happens to have. These run on a developer's Mac where
 * Arial and Times New Roman *are* installed, which is exactly why they're
 * meaningful: if anything fell back to a system font, it would show here.
 * Invented content only.
 */

async function embeddedFontNames(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf);
  const names = new Set<string>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFDict && object.get(PDFName.of("Type"))?.toString() === "/Font") {
      const baseFont = object.get(PDFName.of("BaseFont"));
      // Subset prefix ("ABCDEF+") stripped: we care about the face, not the subset.
      if (baseFont) names.add(baseFont.toString().replace(/^\/([A-Z]{6}\+)?/, ""));
    }
  }
  return [...names].sort();
}

const SYSTEM_FONTS = /arial|times|helvetica|verdana|opensans|liberation/i;

const CASES: { ruleSetId: string; family: FontFamily; expected: RegExp }[] = [
  { ruleSetId: "mfr", family: "Times New Roman", expected: /^Tinos/ },
  { ruleSetId: "mfr", family: "Arial", expected: /^Arimo/ },
  { ruleSetId: "pediatria", family: "Verdana", expected: /^DejaVuLGCSans/ },
];

describe("embedded fonts (DIO-46)", () => {
  test("every shipped face file exists and is a TrueType font", () => {
    for (const family of Object.values(EMBEDDED_FONTS)) {
      for (const face of family.faces) {
        const bytes = readFontFile(face.file);
        assert.equal(bytes.readUInt32BE(0), 0x00010000, `${face.file} is TrueType`);
      }
    }
  });

  for (const { ruleSetId, family, expected } of CASES) {
    test(`single-file render (${ruleSetId}, ${family}) embeds only the shipped face, footer included`, async () => {
      const buffer = await buildDocx([heading(1, "Formação"), paragraph("Texto fictício com acentuação: ção, ã, é.")]);
      const document = await applyFormatting(buffer, { ruleSetId, fontFamily: family });
      const names = await embeddedFontNames(await renderPdf(document, { candidateName: "Pessoa Inventada" }));

      assert.ok(names.length > 0);
      assert.ok(names.every((name) => expected.test(name)), `${family}: ${names.join(", ")}`);
      assert.ok(!names.some((name) => SYSTEM_FONTS.test(name)), names.join(", "));
    });
  }

  test("paginated render stamps its footer and header in the document's own face", async () => {
    const source = async (id: string, children: Parameters<typeof buildDocx>[0]) => ({
      id,
      document: await parseDocxDocument(await buildDocx(children)),
    });
    const master = await source("master", [heading(1, "Dedicatória"), paragraph("Aos meus pais."), heading(1, "Índice"), paragraph("Um ......... 1")]);
    const chapter = await source("um", [heading(1, "Capítulo"), ...longParagraphs(8, 120)]);
    const merged = mergeDocuments(master, [chapter]);
    const document = formatParsedDocument(merged.document, { ruleSetId: "mfr", fontFamily: "Times New Roman" });

    const { pdf } = await renderPaginatedPdf(document, { candidateName: "Pessoa Inventada", headings: merged.headings });
    const names = await embeddedFontNames(pdf);

    assert.ok(names.every((name) => /^Tinos/.test(name)), names.join(", "));
    assert.ok(!names.some((name) => SYSTEM_FONTS.test(name)), "no Helvetica from the stamped footer");
  });
});
