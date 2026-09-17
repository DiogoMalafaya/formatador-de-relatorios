import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_RULE_SET_ID, getRuleSet } from "./ruleSet.ts";
import { formatFormattingSummaryPt } from "./summary.ts";

describe("formatFormattingSummaryPt", () => {
  test("reflects the rule set's actual values", () => {
    const ruleSet = getRuleSet(GENERIC_RULE_SET_ID);
    assert.equal(
      formatFormattingSummaryPt(ruleSet),
      "Fonte: Times New Roman 12pt · Margens: 2,5cm · Espaçamento: 1,5",
    );
  });

  test("uses pt-PT decimal comma only when the value is not an integer", () => {
    const ruleSet = getRuleSet(GENERIC_RULE_SET_ID);
    const summary = formatFormattingSummaryPt({
      ...ruleSet,
      font: { ...ruleSet.font, sizePt: 12 },
      marginsCm: 3,
      lineSpacing: 2,
    });
    assert.equal(summary, "Fonte: Times New Roman 12pt · Margens: 3cm · Espaçamento: 2");
  });

  test("changing the rule set config changes the summary with no code change", () => {
    const ruleSet = getRuleSet(GENERIC_RULE_SET_ID);
    const summary = formatFormattingSummaryPt({
      ...ruleSet,
      font: { ...ruleSet.font, family: { options: ["Arial"], default: "Arial" }, sizePt: 11 },
      marginsCm: 2,
      lineSpacing: 1,
    });
    assert.equal(summary, "Fonte: Arial 11pt · Margens: 2cm · Espaçamento: 1");
  });
});
