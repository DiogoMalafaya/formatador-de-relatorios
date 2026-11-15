import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyFormatting } from "./apply.ts";
import { HOUSE_RULE_SET_ID } from "./ruleSet.ts";
import {
  buildDocx,
  heading,
  imageParagraph,
  longParagraphs,
  paragraph,
  simpleTable,
} from "./testFixtures.ts";

describe("applyFormatting", () => {
  test("a clean document produces no warnings", async () => {
    const buffer = await buildDocx([heading(1, "Formação"), paragraph("Texto simples, sem problemas.")]);
    const result = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });
    assert.deepEqual(result.warnings, []);
    assert.match(result.html, /<h1>Formação<\/h1>/);
  });

  test("warns on an embedded image without stripping it where the norms forbid images (MFR)", async () => {
    const buffer = await buildDocx([imageParagraph()]);
    const result = await applyFormatting(buffer, { ruleSetId: "mfr" });
    assert.ok(result.warnings.some((w) => w.code === "image-detected"));
    assert.match(result.html, /<img /);
  });

  test("warns on a table where the norms restrict tables to activity schematization (MFR)", async () => {
    const buffer = await buildDocx([simpleTable([["Ano", "Rotação"]])]);
    const result = await applyFormatting(buffer, { ruleSetId: "mfr" });
    assert.ok(result.warnings.some((w) => w.code === "table-present"));
  });

  test("warns when the estimated page count reaches MFR's 100-page limit", async () => {
    const buffer = await buildDocx(longParagraphs(110, 400));
    const result = await applyFormatting(buffer, { ruleSetId: "mfr" });
    assert.ok(result.warnings.some((w) => w.code === "page-limit-possibly-exceeded"));
  });

  test("an unknown rule set id falls back to the house standard rather than throwing", async () => {
    const buffer = await buildDocx([paragraph("Texto.")]);
    const result = await applyFormatting(buffer, { ruleSetId: "unknown-specialty" });
    assert.match(result.css, /margin: 2\.5cm/);
  });

  test("css reflects the requested font/title choices", async () => {
    const buffer = await buildDocx([paragraph("Texto.")]);
    const result = await applyFormatting(buffer, {
      ruleSetId: HOUSE_RULE_SET_ID,
      fontFamily: "Arial",
      titleSizePt: 12,
    });
    assert.match(result.css, /font-family: "Arimo", sans-serif/);
  });

  test("the same document is checked against whichever profile applies — no code change", async () => {
    const buffer = await buildDocx([imageParagraph(), simpleTable([["Ano", "Rotação"]])]);
    const house = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });
    const mfr = await applyFormatting(buffer, { ruleSetId: "mfr" });
    assert.deepEqual(house.warnings.map((w) => w.code), []);
    assert.deepEqual(mfr.warnings.map((w) => w.code).sort(), ["image-detected", "table-present"]);
  });

  test("Pediatria's profile sets Verdana 10 and its own margins", async () => {
    const buffer = await buildDocx([paragraph("Texto.")]);
    const result = await applyFormatting(buffer, { ruleSetId: "pediatria" });
    assert.match(result.css, /margin: 2\.5cm 3cm 2\.5cm 3cm/);
    assert.match(result.css, /font-family: "DejaVu LGC Sans", sans-serif/);
    assert.match(result.css, /font-size: 10pt/);
  });
});
