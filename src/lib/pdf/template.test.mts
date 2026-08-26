import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildFooterTemplate, buildHeaderTemplate, buildHtmlDocument } from "./template.ts";
import { getRuleSet, GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import type { FormattedDocument } from "../formatting/apply.ts";

const ruleSet = getRuleSet(GENERIC_RULE_SET_ID);

describe("buildHtmlDocument", () => {
  test("wraps the parsed html and css into a full page with a utf-8 charset", () => {
    const document: FormattedDocument = {
      html: "<h1>Formação</h1>",
      css: "body { font-size: 12pt; }",
      warnings: [],
      ruleSet,
    };
    const html = buildHtmlDocument(document);
    assert.match(html, /<meta charset="utf-8"/);
    assert.match(html, /<style>body \{ font-size: 12pt; \}<\/style>/);
    assert.match(html, /<h1>Formação<\/h1>/);
  });
});

describe("buildHeaderTemplate", () => {
  test("is always empty — no rule set seen so far requires generic header content", () => {
    assert.equal(buildHeaderTemplate(), "<div></div>");
  });
});

describe("buildFooterTemplate", () => {
  test("includes candidate name and page number per the rule set's footer flags", () => {
    const footer = buildFooterTemplate(ruleSet, "Maria Silva");
    assert.match(footer, /Maria Silva/);
    assert.match(footer, /class="pageNumber"/);
  });

  test("escapes html in the candidate name", () => {
    const footer = buildFooterTemplate(ruleSet, "<script>alert(1)</script>");
    assert.doesNotMatch(footer, /<script>/);
    assert.match(footer, /&lt;script&gt;/);
  });

  test("renders an empty box when the rule set asks for no footer content", () => {
    const noFooterRuleSet = {
      ...ruleSet,
      footer: { includeCandidateName: false, includePageNumber: false },
    };
    assert.equal(buildFooterTemplate(noFooterRuleSet, "Maria Silva"), "<div></div>");
  });
});
