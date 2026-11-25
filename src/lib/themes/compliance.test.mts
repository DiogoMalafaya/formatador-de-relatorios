import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOUSE_THEMES } from "./index.ts";
import { COVER_TEMPLATES } from "../covers/templates.ts";
import { buildCorpusCase, GOLDEN_SPECIALTY_IDS } from "../quality/goldenCorpus.ts";
import { renderCorpusCase } from "../quality/renderCorpus.ts";
import { checkPdfCompliance } from "../compliance/checkPdf.ts";
import { rasterisePdf } from "../quality/visualDiff.ts";

/**
 * DIO-56 acceptance: every theme × profile combination passes the PDF
 * compliance check. Each combination renders a golden-corpus CV with
 * chapter dividers on (the most theme-styled pages there are).
 *
 * Covers: under the strict profile (MFR) every cover layout renders with
 * every theme; elsewhere the layouts rotate, so each one also renders in
 * expressive mode at least once per theme. That is "≥ 3 cover layouts per
 * mode" checked at the PDF level, not just in CSS.
 */
const STRICT_SPECIALTY = "medicina-fisica-e-de-reabilitacao";

const renders: { themeId: string; specialtyId: string; coverId: string }[] = [];
for (const [themeIndex, theme] of HOUSE_THEMES.entries()) {
  for (const cover of COVER_TEMPLATES) {
    renders.push({ themeId: theme.id, specialtyId: STRICT_SPECIALTY, coverId: cover.id });
  }
  const expressive = GOLDEN_SPECIALTY_IDS.filter((id) => id !== STRICT_SPECIALTY);
  // Enough renders to reach every layout, and every specialty at least once.
  const count = Math.max(expressive.length, COVER_TEMPLATES.length);
  for (let i = 0; i < count; i += 1) {
    renders.push({
      themeId: theme.id,
      specialtyId: expressive[i % expressive.length],
      coverId: COVER_TEMPLATES[(i + themeIndex) % COVER_TEMPLATES.length].id,
    });
  }
}

describe("every theme × profile × cover passes the compliance check (DIO-56)", () => {
  for (const { themeId, specialtyId, coverId } of renders) {
    test(`${themeId} × ${specialtyId} × ${coverId}`, async () => {
      const corpusCase = await buildCorpusCase(specialtyId);
      const { prepared, result } = await renderCorpusCase(corpusCase, coverId, { themeId, chapterDividers: true });
      assert.ok(result.report.dividerPages.length > 0, "dividers rendered");

      const violations = await checkPdfCompliance(result.pdf, {
        ruleSet: prepared.document.ruleSet,
        fontFamily: prepared.document.fontFamily,
        candidateName: prepared.candidateName,
        ...(prepared.localDeFormacao ? { localDeFormacao: prepared.localDeFormacao } : {}),
      });
      assert.deepEqual(violations, []);
    });
  }
});

/** Dark pixels in the footer strip (name + number; mirrored, so the name changes sides). */
async function footerNameInk(pdf: Uint8Array | Buffer, pageNumber: number): Promise<number> {
  const page = (await rasterisePdf(pdf, 100))[pageNumber - 1];
  const top = Math.floor(page.height * 0.9);
  let ink = 0;
  for (let y = top; y < page.height; y += 1) {
    for (let x = 0; x < page.width; x += 1) {
      if (page.grey[y * page.width + x] < 128) ink += 1;
    }
  }
  return ink;
}

describe("stamped footers draw every glyph in every theme's face (DIO-56)", () => {
  // Arimo is a variable font: subset by pdf-lib, its footer text extracted
  // fine but drew only a few glyphs. Compare the ink against the Tinos footer.
  test("the sans theme's footer name draws about as much ink as the serif theme's", async () => {
    const corpusCase = await buildCorpusCase("anestesiologia");
    const sans = await renderCorpusCase(corpusCase, "classica", { themeId: "contemporanea" });
    const serif = await renderCorpusCase(corpusCase, "classica", { themeId: "sobria" });
    assert.equal(sans.prepared.document.fontFamily, "Arial");
    const { bodyStartPage, blankPages } = sans.result.report;
    let page = bodyStartPage + 1;
    while (blankPages.includes(page)) page += 1;
    const sansInk = await footerNameInk(sans.result.pdf, page);
    const serifInk = await footerNameInk(serif.result.pdf, page);
    assert.ok(serifInk > 0, "the serif footer has a name");
    assert.ok(sansInk > serifInk * 0.6, `sans footer ink ${sansInk} vs serif ${serifInk}`);
  });
});
