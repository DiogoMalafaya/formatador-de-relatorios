import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildPageLabels,
  buildRunningHeaders,
  planPagination,
  resumoSectionSpan,
} from "./paginate.ts";
import { BODY_START_MARKER_ID } from "./template.ts";
import type { MergedHeading } from "../merge/types.ts";

/**
 * Pure pagination math (DIO-42). No Chromium, no pdf-lib: these feed the
 * planner a hand-written page map and assert the numbering the norms require
 * — roman front matter, arabic body restarting at 1, and recto starts for
 * double-sided printing.
 */

function frontHeading(id: string, level = 1, text = id): MergedHeading {
  return { id, level, text, sourceId: "master", numbering: "roman" };
}

function bodyHeading(id: string, level = 1, text = id): MergedHeading {
  return { id, level, text, sourceId: `source-${id}`, numbering: "arabic" };
}

describe("planPagination", () => {
  test("leaves geometry alone when the body already starts on a recto page", () => {
    const headings = [frontHeading("indice"), bodyHeading("parte-1")];
    const pages = new Map([
      ["indice", 2],
      [BODY_START_MARKER_ID, 5],
      ["parte-1", 5],
    ]);

    const plan = planPagination({ headings, pages, totalPages: 20 });

    assert.deepEqual(plan.blankAnchors, []);
    assert.equal(plan.stable, true);
    assert.equal(plan.bodyStartPage, 5);
    assert.equal(plan.totalPages, 20);
  });

  test("inserts a blank page when the body would start on a verso page", () => {
    const headings = [frontHeading("indice"), bodyHeading("parte-1")];
    const pages = new Map([
      ["indice", 2],
      [BODY_START_MARKER_ID, 4],
      ["parte-1", 4],
    ]);

    const plan = planPagination({ headings, pages, totalPages: 20 });

    assert.deepEqual(plan.blankAnchors, [BODY_START_MARKER_ID]);
    assert.equal(plan.stable, false);
    assert.equal(plan.bodyStartPage, 5, "body shifts one page later onto the recto");
    assert.equal(plan.totalPages, 21, "the inserted blank lengthens the document");
  });

  test("cascades shifts so a later part accounts for an earlier insertion", () => {
    const headings = [bodyHeading("parte-1"), bodyHeading("parte-2")];
    // Body starts on a verso page (blank #1). parte-2 sits on page 9, which is
    // recto on its own — but the first blank pushes it to 10, needing a second.
    const pages = new Map([
      [BODY_START_MARKER_ID, 4],
      ["parte-1", 4],
      ["parte-2", 9],
    ]);

    const plan = planPagination({ headings, pages, totalPages: 30 });

    assert.deepEqual(plan.blankAnchors, [BODY_START_MARKER_ID, "parte-2"]);
    assert.equal(plan.totalPages, 32);
    assert.equal(plan.headingPages.get("parte-2"), 11);
  });

  test("one blank fixes every anchor sharing the same page", () => {
    // The body marker and the first part heading land on the same page: that
    // is one insertion, not two.
    const headings = [bodyHeading("parte-1")];
    const pages = new Map([
      [BODY_START_MARKER_ID, 4],
      ["parte-1", 4],
    ]);

    const plan = planPagination({ headings, pages, totalPages: 10 });

    assert.equal(plan.blankAnchors.length, 1);
  });

  test("only level-1 body headings force a recto start", () => {
    const headings = [bodyHeading("parte-1", 1), bodyHeading("subseccao", 2)];
    const pages = new Map([
      [BODY_START_MARKER_ID, 5],
      ["parte-1", 5],
      ["subseccao", 8], // verso, but a subsection never forces a blank
    ]);

    const plan = planPagination({ headings, pages, totalPages: 12 });

    assert.deepEqual(plan.blankAnchors, []);
  });

  test("TOC numbers are roman-sequence absolute for front matter, body-relative for the body", () => {
    const headings = [frontHeading("dedicatoria"), frontHeading("indice"), bodyHeading("parte-1")];
    const pages = new Map([
      ["dedicatoria", 3],
      ["indice", 4],
      [BODY_START_MARKER_ID, 5],
      ["parte-1", 5],
    ]);

    const plan = planPagination({ headings, pages, totalPages: 20 });

    assert.equal(plan.tocPageNumbers.get("dedicatoria"), 3, "front matter keeps its absolute page");
    assert.equal(plan.tocPageNumbers.get("indice"), 4);
    assert.equal(plan.tocPageNumbers.get("parte-1"), 1, "the body restarts at 1");
  });

  test("treats a document with no body as entirely front matter", () => {
    const headings = [frontHeading("indice")];
    const pages = new Map([["indice", 2]]);

    const plan = planPagination({ headings, pages, totalPages: 4 });

    assert.equal(plan.bodyStartPage, 5, "one past the end — nothing is arabic");
    assert.deepEqual(plan.blankAnchors, []);
  });

  describe("re-planning against a render that already has blanks", () => {
    test("reports stable instead of stacking a second blank on the same anchor", () => {
      const headings = [frontHeading("indice"), bodyHeading("parte-1")];
      // The render already carries the blank: the body now sits on page 5.
      const pages = new Map([
        ["indice", 2],
        [BODY_START_MARKER_ID, 5],
        ["parte-1", 5],
      ]);

      const plan = planPagination({
        headings,
        pages,
        totalPages: 21,
        existingBlanks: new Set([BODY_START_MARKER_ID]),
      });

      assert.deepEqual(plan.blankAnchors, [BODY_START_MARKER_ID], "the existing blank is kept, not doubled");
      assert.equal(plan.stable, true);
      assert.equal(plan.bodyStartPage, 5);
      assert.equal(plan.totalPages, 21, "an already-counted blank is not counted twice");
    });

    test("drops a blank that a reflow made unnecessary", () => {
      // A reflow shortened the front matter: without its blank the body would
      // now land on page 5 (recto) by itself, so the blank must go.
      const headings = [bodyHeading("parte-1")];
      const pages = new Map([
        [BODY_START_MARKER_ID, 6],
        ["parte-1", 6],
      ]);

      const plan = planPagination({
        headings,
        pages,
        totalPages: 21,
        existingBlanks: new Set([BODY_START_MARKER_ID]),
      });

      assert.deepEqual(plan.blankAnchors, [], "the stale blank is removed");
      assert.equal(plan.stable, false, "the render still carries it, so another pass is needed");
      assert.equal(plan.bodyStartPage, 5);
      assert.equal(plan.totalPages, 20);
    });

    test("feeding a plan's own blanks back reproduces it exactly (fixed point)", () => {
      const headings = [bodyHeading("parte-1"), bodyHeading("parte-2")];
      const pages = new Map([
        [BODY_START_MARKER_ID, 4],
        ["parte-1", 4],
        ["parte-2", 9],
      ]);

      const first = planPagination({ headings, pages, totalPages: 30 });

      // Re-plan against the geometry the first plan predicts, declaring its
      // blanks as already rendered. Without this property the render loop
      // ratchets: every pass adds blanks it can never take back.
      const rendered = new Map<string, number>([
        [BODY_START_MARKER_ID, first.bodyStartPage],
        ["parte-1", first.headingPages.get("parte-1") as number],
        ["parte-2", first.headingPages.get("parte-2") as number],
      ]);
      const second = planPagination({
        headings,
        pages: rendered,
        totalPages: first.totalPages,
        existingBlanks: new Set(first.blankAnchors),
      });

      assert.deepEqual(second.blankAnchors, first.blankAnchors);
      assert.equal(second.totalPages, first.totalPages);
      assert.equal(second.bodyStartPage, first.bodyStartPage);
      assert.deepEqual([...second.tocPageNumbers], [...first.tocPageNumbers]);
      assert.equal(second.stable, true, "the second pass must converge");
    });
  });
});

describe("buildPageLabels", () => {
  test("suppresses the cover footer, then runs roman until the body restarts at 1", () => {
    const labels = buildPageLabels(8, 5);

    assert.deepEqual(labels, [null, "ii", "iii", "iv", "1", "2", "3", "4"]);
  });

  test("numbers every page when the body starts immediately after the cover", () => {
    assert.deepEqual(buildPageLabels(3, 2), [null, "1", "2"]);
  });
});

describe("buildRunningHeaders", () => {
  test("carries the current section from the page after it opens, and never on front matter", () => {
    const headings = [bodyHeading("parte-1", 1, "Atividade Clínica"), bodyHeading("parte-2", 1, "Investigação")];
    const headingPages = new Map([
      ["parte-1", 3],
      ["parte-2", 6],
    ]);

    const headers = buildRunningHeaders(headings, headingPages, 7, 3, new Set());

    assert.deepEqual(headers, [
      null, // cover
      null, // front matter
      null, // the section's own opening page stays clean
      "Atividade Clínica",
      "Atividade Clínica",
      null, // parte-2 opens here
      "Investigação",
    ]);
  });

  test("leaves inserted blank pages without a header", () => {
    const headings = [bodyHeading("parte-1", 1, "Atividade Clínica")];
    const headingPages = new Map([["parte-1", 2]]);

    // Absolute page 4 is an inserted blank; pages 3 and 5 sit inside the same
    // section and must still carry it.
    const headers = buildRunningHeaders(headings, headingPages, 5, 2, new Set([4]));

    assert.deepEqual(headers, [null, null, "Atividade Clínica", null, "Atividade Clínica"]);
  });
});

describe("resumoSectionSpan", () => {
  test("measures the resumo up to the next same-or-shallower heading", () => {
    const headings = [
      bodyHeading("resumo", 1, "Resumo do currículo"),
      bodyHeading("detalhe", 2, "Detalhe"),
      bodyHeading("seguinte", 1, "Atividade Clínica"),
    ];
    const headingPages = new Map([
      ["resumo", 4],
      ["detalhe", 5],
      ["seguinte", 7],
    ]);

    const span = resumoSectionSpan(headings, headingPages, 20);

    assert.deepEqual(span, { startPage: 4, pageCount: 3 });
  });

  test("runs to the end of the document when the resumo is last", () => {
    const headings = [bodyHeading("resumo", 1, "Resumo")];
    const headingPages = new Map([["resumo", 9]]);

    assert.deepEqual(resumoSectionSpan(headings, headingPages, 10), { startPage: 9, pageCount: 2 });
  });

  test("matches the heading regardless of accents or case", () => {
    const headings = [bodyHeading("resumo", 1, "RESUMO DO CURRICULO")];
    const headingPages = new Map([["resumo", 3]]);

    assert.ok(resumoSectionSpan(headings, headingPages, 8));
  });

  test("returns undefined when the document has no resumo", () => {
    const headings = [bodyHeading("parte-1", 1, "Atividade Clínica")];
    const headingPages = new Map([["parte-1", 3]]);

    assert.equal(resumoSectionSpan(headings, headingPages, 8), undefined);
  });
});
