import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyFormatting } from "./apply.ts";
import { GENERIC_RULE_SET_ID } from "./ruleSet.ts";
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
    const result = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    assert.deepEqual(result.warnings, []);
    assert.match(result.html, /<h1>Formação<\/h1>/);
  });

  test("warns on an embedded image without stripping it", async () => {
    const buffer = await buildDocx([imageParagraph()]);
    const result = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    assert.ok(result.warnings.some((w) => w.code === "image-detected"));
    assert.match(result.html, /<img /);
  });

  test("warns on a table, asking for confirmation it's activity schematization", async () => {
    const buffer = await buildDocx([simpleTable([["Ano", "Rotação"]])]);
    const result = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    assert.ok(result.warnings.some((w) => w.code === "table-present"));
  });

  test("warns when the estimated page count reaches the rule set's limit", async () => {
    const buffer = await buildDocx(longParagraphs(90, 400));
    const result = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    assert.ok(result.warnings.some((w) => w.code === "page-limit-possibly-exceeded"));
  });

  test("an unknown rule set id falls back to generic rather than throwing", async () => {
    const buffer = await buildDocx([paragraph("Texto.")]);
    const result = await applyFormatting(buffer, { ruleSetId: "unknown-specialty" });
    assert.match(result.css, /margin: 2\.5cm/);
  });

  test("css reflects the requested font/title choices", async () => {
    const buffer = await buildDocx([paragraph("Texto.")]);
    const result = await applyFormatting(buffer, {
      ruleSetId: GENERIC_RULE_SET_ID,
      fontFamily: "Arial",
      titleSizePt: 12,
    });
    assert.match(result.css, /font-family: "Arial", sans-serif/);
  });

  test("rule set can be changed via config alone — mfr and generic behave identically today", async () => {
    const buffer = await buildDocx([imageParagraph()]);
    const generic = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    const mfr = await applyFormatting(buffer, { ruleSetId: "mfr" });
    assert.deepEqual(
      generic.warnings.map((w) => w.code),
      mfr.warnings.map((w) => w.code),
    );
  });
});
