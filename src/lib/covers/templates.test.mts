import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { COVER_TEMPLATES, STRICT_COVER_TOKENS } from "./templates.ts";

describe("COVER_TEMPLATES", () => {
  test("ships at least six layouts, so each mode has at least three (DIO-56)", () => {
    assert.ok(COVER_TEMPLATES.length >= 6);
  });

  test("the DIO-12 ids stay valid, so stored sessions keep their cover", () => {
    const ids = COVER_TEMPLATES.map((template) => template.id);
    for (const id of ["classica", "moderna", "formal"]) assert.ok(ids.includes(id), id);
  });

  test("every layout's CSS is scoped under its own class", () => {
    for (const template of COVER_TEMPLATES) {
      const selectors = template.css(STRICT_COVER_TOKENS).match(/^\.[^{]+\{/gm) ?? [];
      assert.ok(selectors.length > 0, template.id);
      for (const selector of selectors) assert.ok(selector.startsWith(`.cover-${template.id}`), `${template.id}: ${selector}`);
    }
  });

  test("every template has a unique id", () => {
    const ids = COVER_TEMPLATES.map((template) => template.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every template places all four of MFR's cover fields plus the internato (DIO-50)", () => {
    for (const template of COVER_TEMPLATES) {
      const html = template.buildHtml({
        candidateName: "NOME_TESTE",
        dateLabel: "DATA_TESTE",
        internatoPt: "INTERNATO_TESTE",
        localPt: "LOCAL_TESTE",
      });
      assert.match(html, /NOME_TESTE/, `${template.id} must place the candidate name`);
      assert.match(html, /Curriculum Vitae/, `${template.id} must say Curriculum Vitae`);
      assert.match(html, /LOCAL_TESTE/, `${template.id} must place the local de formação`);
      assert.match(html, /INTERNATO_TESTE/, `${template.id} must place the internato`);
      assert.match(html, /DATA_TESTE/, `${template.id} must place the date`);
    }
  });

  test("a line not known yet leaves no empty paragraph", () => {
    for (const template of COVER_TEMPLATES) {
      const html = template.buildHtml({ candidateName: "N", dateLabel: "D", internatoPt: "", localPt: "" });
      assert.doesNotMatch(html, /<p class="cover-line"><\/p>/, template.id);
    }
  });

  test("every template ships a non-empty thumbnail", () => {
    for (const template of COVER_TEMPLATES) {
      assert.match(template.thumbnailSvg, /<svg/);
    }
  });
});
