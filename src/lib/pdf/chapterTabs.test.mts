import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chapterTabsAvailable, planChapterTabs, tabBand, tabRects, TAB_EDGE_INSET_CM } from "./chapterTabs.ts";
import { getRuleSet, HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import type { MergedHeading } from "../merge/types.ts";

const A4 = { width: 595.28, height: 841.89 };
const CM = 72 / 2.54;
const UNIFORM = { topCm: 2.5, rightCm: 2.5, bottomCm: 2.5, leftCm: 2.5 };

const chapter = (id: string, number?: string): MergedHeading => ({
  id,
  level: 2,
  text: `Capítulo ${id}`,
  sourceId: id,
  numbering: "arabic",
  part: true,
  tier: 1,
  ...(number ? { number } : {}),
});

describe("chapterTabsAvailable (DIO-58)", () => {
  test("print-delivered profiles that allow a header get tabs; Pediatria (PDF) doesn't", () => {
    assert.equal(chapterTabsAvailable(getRuleSet("mfr")), true);
    assert.equal(chapterTabsAvailable(getRuleSet(HOUSE_RULE_SET_ID)), true);
    assert.equal(chapterTabsAvailable(getRuleSet("oftalmologia")), true);
    assert.equal(chapterTabsAvailable(getRuleSet("pediatria")), false);
  });
});

describe("tabBand / tabRects", () => {
  test("the band is the outer margin, mirrored by absolute page parity, clear of the text block and the paper edge", () => {
    const recto = tabBand(A4, UNIFORM, 3);
    const verso = tabBand(A4, UNIFORM, 4);
    const textRight = A4.width - 2.5 * CM;
    const textLeft = 2.5 * CM;

    assert.ok(recto.x > textRight, "recto: right of the text block");
    assert.ok(Math.abs(recto.x + recto.width - (A4.width - TAB_EDGE_INSET_CM * CM)) < 0.01, "recto: inset from the edge");
    assert.ok(verso.x + verso.width < textLeft, "verso: left of the text block");
    assert.ok(Math.abs(verso.x - TAB_EDGE_INSET_CM * CM) < 0.01, "verso: inset from the edge");
    assert.ok(Math.abs(recto.width - verso.width) < 0.01, "mirror images");
    for (const band of [recto, verso]) {
      assert.ok(Math.abs(band.y - 2.5 * CM) < 0.01 && Math.abs(band.y + band.height - (A4.height - 2.5 * CM)) < 0.01, "text block's height");
    }
  });

  test("tabs stack top to bottom inside the band, capped in height, never overlapping", () => {
    const band = tabBand(A4, UNIFORM, 1);
    for (const count of [1, 3, 7, 20]) {
      const rects = tabRects(band, count);
      assert.equal(rects.length, count);
      assert.ok(Math.abs(rects[0].y + rects[0].height - (band.y + band.height)) < 0.01, "first tab at the top");
      for (const [i, rect] of rects.entries()) {
        assert.ok(rect.y >= band.y - 0.01, `${count} tabs: inside the band`);
        assert.ok(rect.height <= 2.2 * CM + 0.01);
        if (i > 0) assert.ok(rect.y + rect.height < rects[i - 1].y, "stacked in order, with a gap");
      }
    }
    assert.deepEqual(tabRects(band, 0), []);
  });
});

describe("planChapterTabs", () => {
  test("cover, front matter and blank fillers get no tabs; every later page is its chapter's", () => {
    // 1 cover, 2-4 front matter, 5 ch.1 divider, 6 blank, 7-9 ch.1, 10 blank, 11 ch.2 divider, 12 blank, 13-14 ch.2
    const plan = planChapterTabs({
      chapters: [chapter("a", "1."), chapter("b", "2.")],
      startPages: [5, 11],
      totalPages: 14,
      blankPages: new Set([6, 10, 12]),
    });
    assert.deepEqual(plan.tabs.map((tab) => tab.number), ["1", "2"]);
    assert.deepEqual(plan.current, [null, null, null, null, 0, null, 0, 0, 0, null, 1, null, 1, 1]);
  });

  test("unnumbered chapters fall back to their ordinal; chapters missing from the PDF are left out", () => {
    const plan = planChapterTabs({
      chapters: [chapter("a"), chapter("b"), chapter("c")],
      startPages: [3, undefined, 5],
      totalPages: 6,
      blankPages: new Set(),
    });
    assert.deepEqual(plan.tabs.map((tab) => tab.number), ["1", "2"]);
    assert.deepEqual(plan.current, [null, null, 0, 0, 1, 1]);
  });

  test("the cover never carries tabs, even if a chapter claims page 1", () => {
    const plan = planChapterTabs({ chapters: [chapter("a")], startPages: [1], totalPages: 2, blankPages: new Set() });
    assert.deepEqual(plan.current, [null, 0]);
  });
});
