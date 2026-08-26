import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { COVER_TEMPLATES } from "./templates.ts";

describe("COVER_TEMPLATES", () => {
  test("ships at least the launch set of three covers", () => {
    assert.ok(COVER_TEMPLATES.length >= 3);
  });

  test("every template has a unique id", () => {
    const ids = COVER_TEMPLATES.map((template) => template.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("every template renders both the candidate name and the date into its HTML", () => {
    for (const template of COVER_TEMPLATES) {
      const html = template.buildHtml({ candidateName: "NOME_TESTE", dateLabel: "DATA_TESTE" });
      assert.match(html, /NOME_TESTE/, `${template.id} must place the candidate name`);
      assert.match(html, /DATA_TESTE/, `${template.id} must place the date`);
    }
  });

  test("every template ships a non-empty thumbnail", () => {
    for (const template of COVER_TEMPLATES) {
      assert.match(template.thumbnailSvg, /<svg/);
    }
  });
});
