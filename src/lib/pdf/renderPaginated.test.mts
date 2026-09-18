import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { renderPaginatedPdf } from "./renderPaginated.ts";
import { extractPageMap } from "./pageMap.ts";
import { mergeDocuments } from "../merge/index.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { formatParsedDocument } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, longParagraphs, paragraph } from "../formatting/testFixtures.ts";
import type { MergeSource } from "../merge/types.ts";

/**
 * End-to-end two-pass render (DIO-42). Like `render.test.mts` these launch a
 * real local Chrome — the page map is read out of Chromium's own printed
 * link annotations, so there is no way to verify it without printing.
 *
 * Every fixture here is invented. The reference corpus that motivated this
 * ticket contains patient and personal data and must never reach this public
 * repository.
 */

async function source(id: string, children: Parameters<typeof buildDocx>[0]): Promise<MergeSource> {
  return { id, document: await parseDocxDocument(await buildDocx(children)) };
}

/**
 * Master + chapters through the real merge, formatted exactly as the render
 * pipeline does. The master follows the real volume's ordering — cover,
 * dedication, Índice — because everything up to and including the Índice is
 * what the merge engine classifies as roman front matter.
 */
async function mergedFixture() {
  const master = await source("master", [
    heading(1, "Ana Pereira"),
    paragraph("Curriculum Vitae."),
    heading(1, "Dedicatória"),
    ...longParagraphs(4, 90),
    heading(1, "Índice"),
    paragraph("Introdução ......... 4"),
  ]);
  const chapters = [
    await source("saude-materna", [
      heading(1, "SAÚDE MATERNA"),
      ...longParagraphs(6, 120),
    ]),
    await source("planeamento", [
      heading(1, "Planeamento Familiar"),
      ...longParagraphs(6, 120),
    ]),
  ];

  const merged = mergeDocuments(master, chapters);
  const document = formatParsedDocument(merged.document, { ruleSetId: GENERIC_RULE_SET_ID }, {
    extraWarnings: merged.warnings,
  });

  return { document, headings: merged.headings };
}

describe("renderPaginatedPdf", () => {
  test("prints a merged document with a converged page map and compliant numbering", async () => {
    const { document, headings } = await mergedFixture();

    const result = await renderPaginatedPdf(document, {
      candidateName: "Ana Pereira",
      headings,
    });

    assert.equal(result.pdf.subarray(0, 5).toString("latin1"), "%PDF-");

    const { report } = result;
    assert.ok(report.passes >= 2, "a page map needs at least one probe pass plus a final print");
    // Regression guard: blank insertion used to be monotonic, so a reflow
    // between passes added a second blank instead of moving the first. The
    // loop then burned its whole budget oscillating and emitted two blank
    // pages in a row. Converging in exactly 2 is the fixed-point property.
    assert.equal(report.passes, 2, "geometry must converge on the first re-render");
    assert.ok(report.totalPages > 1);

    // The probe section exists only to carry link annotations and must never
    // survive into the document the candidate receives.
    const loaded = await PDFDocument.load(result.pdf);
    assert.equal(loaded.getPageCount(), report.totalPages, "probe pages are stripped before output");

    // Numbering: the cover carries no footer, front matter is roman, and the
    // body restarts at arabic 1 exactly at bodyStartPage.
    assert.equal(report.pageLabels[0], null, "the cover page carries no footer");
    assert.equal(report.pageLabels.length, report.totalPages);
    assert.ok(report.bodyStartPage > 1, "the fixture's front matter precedes the body");
    assert.equal(report.pageLabels[report.bodyStartPage - 1], "1", "the body restarts at 1");
    assert.equal(report.pageLabels[report.bodyStartPage], "2", "and counts up from there");

    for (let page = 2; page < report.bodyStartPage; page += 1) {
      assert.match(
        String(report.pageLabels[page - 1]),
        /^[ivxlcdm]+$/,
        `front-matter page ${page} should be lowercase roman`,
      );
    }

    assert.ok(report.timings.totalMs > 0);
    assert.equal(report.timings.passMs.length, report.passes);
  });

  test("every inserted blank page falls on a verso page and precedes a recto start", async () => {
    const { document, headings } = await mergedFixture();

    const { report } = await renderPaginatedPdf(document, {
      candidateName: "Ana Pereira",
      headings,
    });

    for (const blank of report.blankPages) {
      assert.equal(blank % 2, 0, `blank page ${blank} should be a verso page`);
      assert.ok(blank < report.totalPages, "a document never ends on an inserted blank");
    }

    // Two blanks in a row is the signature of the non-convergence bug.
    const sorted = [...report.blankPages].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      assert.notEqual(sorted[i] - sorted[i - 1], 1, "blank pages must never be consecutive");
    }

    // Whatever else happens, the body must open on a recto page — that is the
    // entire reason blanks get inserted.
    assert.equal(report.bodyStartPage % 2, 1, "the body starts on a recto page");
  });

  test("flags an over-long document with the exact count, not an estimate", async () => {
    const master = await source("master", [heading(1, "Ana Pereira"), paragraph("Curriculum Vitae.")]);
    // Deliberately enormous: the generic rule set caps at 80 pages.
    const chapter = await source("gigante", [
      heading(1, "Casuística"),
      ...longParagraphs(320, 140),
    ]);

    const merged = mergeDocuments(master, [chapter]);
    const document = formatParsedDocument(merged.document, { ruleSetId: GENERIC_RULE_SET_ID }, {
      extraWarnings: merged.warnings,
    });

    const result = await renderPaginatedPdf(document, {
      candidateName: "Ana Pereira",
      headings: merged.headings,
    });

    const limit = result.warnings.find((warning) => warning.code === "page-limit-exceeded");
    assert.ok(limit, "an 80-page breach must be reported once the real count is known");
    assert.match(limit.messagePt, new RegExp(String(result.report.totalPages)));
  });
});

describe("extractPageMap", () => {
  test("rejects a PDF that carries no probe marker", async () => {
    const blank = await PDFDocument.create();
    blank.addPage();
    const bytes = Buffer.from(await blank.save());

    await assert.rejects(() => extractPageMap(bytes, []));
  });
});
