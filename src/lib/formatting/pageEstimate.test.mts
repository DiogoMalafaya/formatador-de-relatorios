import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { estimatePageCount } from "./pageEstimate.ts";

const BASELINE_RULE_SET = { font: { sizePt: 12 }, lineSpacing: 1.5 };

describe("estimatePageCount", () => {
  test("an empty document is zero pages", () => {
    assert.equal(estimatePageCount(0, BASELINE_RULE_SET), 0);
  });

  test("roughly 400 words per page at the baseline parameters", () => {
    assert.equal(estimatePageCount(400, BASELINE_RULE_SET), 1);
    assert.equal(estimatePageCount(401, BASELINE_RULE_SET), 2);
    assert.equal(estimatePageCount(800, BASELINE_RULE_SET), 2);
  });

  test("a smaller font fits more words per page", () => {
    const smallerFont = { font: { sizePt: 8 }, lineSpacing: 1.5 };
    assert.ok(estimatePageCount(1200, smallerFont) < estimatePageCount(1200, BASELINE_RULE_SET));
  });

  test("wider line spacing fits fewer words per page", () => {
    const widerSpacing = { font: { sizePt: 12 }, lineSpacing: 3 };
    assert.ok(estimatePageCount(1200, widerSpacing) > estimatePageCount(1200, BASELINE_RULE_SET));
  });
});
