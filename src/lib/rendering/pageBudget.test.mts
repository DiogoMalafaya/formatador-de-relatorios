import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computePageBudget, pageCapBlockedMessagePt, renderInputsKey } from "./pageBudget.ts";
import type { SessionRecord } from "../session/types.ts";

/** Live page budget (DIO-54). Pure: hand-written session records, no render. */

function session(patch: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s1",
    createdAt: 0,
    expiresAt: 1,
    sources: [
      { index: 0, storageKey: "s1/source/0.docx", originalFilename: "principal.docx", sizeBytes: 1 },
      { index: 1, storageKey: "s1/source/1.docx", originalFilename: "capitulo.docx", sizeBytes: 1 },
    ],
    masterIndex: 0,
    specialtyId: "medicina-fisica-e-de-reabilitacao",
    coverId: "classica",
    payment: { status: "unpaid" },
    ...patch,
  };
}

/** A session whose last preview rendered `pages` pages with dividers `on`. */
function rendered(pages: number, on: boolean, patch: Partial<SessionRecord> = {}): SessionRecord {
  const base = session({ chapterDividers: on, ...patch });
  return {
    ...base,
    artifacts: {
      renderedPageCount: pages,
      renderedWithDividers: on,
      dividerPageCost: 14,
      renderInputsKey: renderInputsKey(base),
    },
  };
}

describe("computePageBudget", () => {
  test("no preview yet: the count is unknown and nothing is blocked", () => {
    const budget = computePageBudget({ session: session(), maxPages: 100, dividerPageCost: 14 });
    assert.equal(budget.pages, undefined);
    assert.equal(budget.overCap, false);
    assert.equal(budget.dividerPageCost, 14, "the toggle's cost is known before any render");
  });

  test("the last render's exact count, against the cap", () => {
    const budget = computePageBudget({ session: rendered(84, false), maxPages: 100 });
    assert.equal(budget.pages, 84);
    assert.equal(budget.rendered, true);
    assert.equal(budget.overCap, false);
  });

  test("toggling dividers moves the count by their exact cost, before any re-render", () => {
    const on = { ...rendered(84, false), chapterDividers: true };
    const budget = computePageBudget({ session: on, maxPages: 100 });
    assert.equal(budget.pages, 98);
    assert.equal(budget.rendered, false, "not what the current preview shows");

    const off = { ...rendered(98, true), chapterDividers: false };
    assert.equal(computePageBudget({ session: off, maxPages: 100 }).pages, 84);
  });

  test("over the cap blocks — including when only the dividers push it over", () => {
    const on = { ...rendered(90, false), chapterDividers: true };
    const budget = computePageBudget({ session: on, maxPages: 100 });
    assert.equal(budget.pages, 104);
    assert.equal(budget.overCap, true);
    assert.match(pageCapBlockedMessagePt(budget), /104 páginas.*limite do Colégio é 100.*Desliga os separadores/);
  });

  test("exactly at the cap is allowed", () => {
    assert.equal(computePageBudget({ session: rendered(100, false), maxPages: 100 }).overCap, false);
  });

  test("a profile without a cap never blocks", () => {
    const budget = computePageBudget({ session: rendered(240, false) });
    assert.equal(budget.pages, 240);
    assert.equal(budget.overCap, false);
  });

  test("a render of different inputs doesn't count: the budget goes unknown, never stale", () => {
    const stale = rendered(120, false);
    for (const patch of [
      { coverId: "moderna" },
      { specialtyId: "pediatria" },
      { masterIndex: 1 },
      { sources: stale.sources?.slice().reverse() },
      { coverDetails: { hospital: "Hospital Fictício", city: "Lisboa" } },
    ] as Partial<SessionRecord>[]) {
      const budget = computePageBudget({ session: { ...stale, ...patch }, maxPages: 100 });
      assert.equal(budget.pages, undefined, JSON.stringify(Object.keys(patch)));
      assert.equal(budget.overCap, false);
    }
  });

  test("the inputs key hashes the cover details rather than copying them", () => {
    const key = renderInputsKey(session({ coverDetails: { hospital: "Hospital Fictício", city: "Lisboa" } } as Partial<SessionRecord>));
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(key, /Fict/);
  });
});
