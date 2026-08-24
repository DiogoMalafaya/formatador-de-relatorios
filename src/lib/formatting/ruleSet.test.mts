import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GENERIC_RULE_SET_ID, getRuleSet } from "./ruleSet.ts";

describe("getRuleSet", () => {
  test("returns the generic rule set by id", () => {
    const ruleSet = getRuleSet(GENERIC_RULE_SET_ID);
    assert.equal(ruleSet.id, GENERIC_RULE_SET_ID);
    assert.equal(ruleSet.font.sizePt, 12);
    assert.equal(ruleSet.marginsCm, 2.5);
    assert.equal(ruleSet.lineSpacing, 1.5);
  });

  test("falls back to generic for an unknown id, never throws", () => {
    const ruleSet = getRuleSet("nonexistent-specialty");
    assert.equal(ruleSet.id, GENERIC_RULE_SET_ID);
  });

  test("mfr rule set matches the generic default (interim, per CLAUDE.md)", () => {
    const mfr = getRuleSet("mfr");
    const generic = getRuleSet(GENERIC_RULE_SET_ID);
    assert.deepEqual(
      { ...mfr, id: undefined, name: undefined },
      { ...generic, id: undefined, name: undefined },
    );
  });

  test("font family and title size are user choices with a default", () => {
    const ruleSet = getRuleSet(GENERIC_RULE_SET_ID);
    assert.deepEqual([...ruleSet.font.family.options].sort(), ["Arial", "Times New Roman"]);
    assert.equal(ruleSet.font.family.default, "Times New Roman");
    assert.deepEqual([...ruleSet.title.sizePt.options].sort(), [12, 14]);
    assert.equal(ruleSet.title.sizePt.default, 14);
  });
});
