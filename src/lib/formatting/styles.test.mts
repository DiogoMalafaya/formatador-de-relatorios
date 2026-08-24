import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getRuleSet } from "./ruleSet.ts";
import { buildRuleSetCss, resolveChoices } from "./styles.ts";

describe("resolveChoices", () => {
  test("uses the rule set's defaults when nothing is requested", () => {
    const ruleSet = getRuleSet("generic");
    const choices = resolveChoices(ruleSet);
    assert.equal(choices.fontFamily, ruleSet.font.family.default);
    assert.equal(choices.titleSizePt, ruleSet.title.sizePt.default);
  });

  test("honours a valid requested choice", () => {
    const ruleSet = getRuleSet("generic");
    const choices = resolveChoices(ruleSet, { fontFamily: "Arial", titleSizePt: 12 });
    assert.equal(choices.fontFamily, "Arial");
    assert.equal(choices.titleSizePt, 12);
  });

  test("falls back to default for a choice outside the rule set's options", () => {
    const ruleSet = getRuleSet("generic");
    // @ts-expect-error deliberately outside the allowed union, to prove the runtime guard holds
    const choices = resolveChoices(ruleSet, { titleSizePt: 16 });
    assert.equal(choices.titleSizePt, ruleSet.title.sizePt.default);
  });
});

describe("buildRuleSetCss", () => {
  test("margins, font, size and line spacing all match the rule set", () => {
    const ruleSet = getRuleSet("generic");
    const css = buildRuleSetCss(ruleSet, { fontFamily: "Times New Roman", titleSizePt: 14 });
    assert.match(css, /margin: 2\.5cm/);
    assert.match(css, /font-family: "Times New Roman", serif/);
    assert.match(css, /font-size: 12pt/);
    assert.match(css, /line-height: 1\.5/);
    assert.match(css, /color: black/);
  });

  test("heading styles reflect the requested title size and are bold", () => {
    const ruleSet = getRuleSet("generic");
    const css = buildRuleSetCss(ruleSet, { fontFamily: "Arial", titleSizePt: 12 });
    assert.match(css, /h1, h2, h3 \{[^}]*font-weight: bold;[^}]*font-size: 12pt;/);
    assert.match(css, /font-family: "Arial", sans-serif/);
  });
});
