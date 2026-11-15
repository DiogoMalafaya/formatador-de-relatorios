import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildHtmlDocument } from "./template.ts";
import { getRuleSet, HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

const ruleSet = getRuleSet(HOUSE_RULE_SET_ID);

describe("buildHtmlDocument", () => {
  test("wraps the parsed html and css into a full page with a utf-8 charset", () => {
    const document: FormattedDocument = {
      html: "<h1>Formação</h1>",
      css: "body { font-size: 12pt; }",
      warnings: [],
      ruleSet,
      fontFamily: "Times New Roman",
    };
    const html = buildHtmlDocument(document);
    assert.match(html, /<meta charset="utf-8"/);
    assert.match(html, /<style>body \{ font-size: 12pt; \}<\/style>/);
    assert.match(html, /<h1>Formação<\/h1>/);
  });
});
