import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPaginatedPdf } from "./renderPaginated.ts";
import { extractPageMap } from "./pageMap.ts";
import { mergeDocuments } from "../merge/index.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { formatParsedDocument } from "../formatting/apply.ts";
import { HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, longParagraphs, paragraph } from "../formatting/testFixtures.ts";
import type { MergeSource } from "../merge/types.ts";
import { buildMasterWithListsAfterTocFixture } from "../merge/testFixtures.ts";

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
  const document = formatParsedDocument(merged.document, { ruleSetId: HOUSE_RULE_SET_ID }, {
    extraWarnings: merged.warnings,
  });

  return { document, headings: merged.headings, merged };
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

    // Numbering (DIO-51): one arabic sequence from the cover. The cover and
    // the blank fillers show nothing; every other page shows its own number.
    assert.equal(report.pageLabels[0], null, "the cover page carries no footer");
    assert.equal(report.pageLabels.length, report.totalPages);
    assert.ok(report.bodyStartPage > 1, "the fixture's front matter precedes the body");
    const blanks = new Set(report.blankPages);
    for (let page = 2; page <= report.totalPages; page += 1) {
      assert.equal(report.pageLabels[page - 1], blanks.has(page) ? null : String(page), `page ${page}`);
    }

    // Blank fillers carry no marks at all: no text, no footer, no number.
    const loading = getDocument({ data: new Uint8Array(result.pdf), verbosity: 0 });
    const pdfjs = await loading.promise;
    for (const blank of report.blankPages) {
      const content = await (await pdfjs.getPage(blank)).getTextContent();
      assert.equal(content.items.length, 0, `blank page ${blank} must be empty`);
    }
    await loading.destroy();

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

  test("every Índice number is the page its heading is printed on — zero tolerance (DIO-51)", async () => {
    const { document, headings } = await mergedFixture();
    const result = await renderPaginatedPdf(document, { candidateName: "Ana Pereira", headings });

    // Read the Índice off the PDF itself: "TITLE ... N" lines on its page.
    const loading = getDocument({ data: new Uint8Array(result.pdf), verbosity: 0 });
    const pdfjs = await loading.promise;
    const tocPage = result.report.tocStartPage;
    assert.ok(tocPage, "the fixture has an Índice");
    const tocText = (await (await pdfjs.getPage(tocPage)).getTextContent()).items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    await loading.destroy();

    let checked = 0;
    for (const heading of headings.filter((h) => h.level <= 3)) {
      const printed = result.report.headingPages[heading.id];
      // Case-insensitive: the stylesheet may uppercase part titles.
      const shown = new RegExp(`${heading.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)`, "iu").exec(tocText);
      if (!shown) continue;
      assert.equal(Number(shown[1]), printed, `${heading.text}: Índice says ${shown[1]}, printed on ${printed}`);
      // ...and the footer on that page says the same (page 1 counts but shows nothing).
      assert.equal(result.report.pageLabels[printed - 1], printed === 1 ? null : shown[1]);
      checked += 1;
    }
    assert.equal(checked, headings.length, "every heading's Índice entry was checked");
  });

  test("a PDF-delivered profile (Pediatria) gets no blank fillers (PRD Q12)", async () => {
    const { headings, merged } = await mergedFixture();
    const pediatria = formatParsedDocument(merged.document, { ruleSetId: "pediatria" }, { extraWarnings: merged.warnings });
    const { report } = await renderPaginatedPdf(pediatria, { candidateName: "Ana Pereira", headings });
    assert.deepEqual(report.blankPages, []);
    assert.equal(report.passes, 2, "still converges in two passes");
  });

  test("flags an over-long document with the exact count, not an estimate", async () => {
    const master = await source("master", [heading(1, "Ana Pereira"), paragraph("Curriculum Vitae.")]);
    // Deliberately enormous: MFR caps at 100 pages (amendment of 3.12.2018).
    const chapter = await source("gigante", [
      heading(1, "Casuística"),
      ...longParagraphs(400, 140),
    ]);

    const merged = mergeDocuments(master, [chapter]);
    const document = formatParsedDocument(merged.document, { ruleSetId: "mfr" }, {
      extraWarnings: merged.warnings,
    });

    const result = await renderPaginatedPdf(document, {
      candidateName: "Ana Pereira",
      headings: merged.headings,
    });

    const limit = result.warnings.find((warning) => warning.code === "page-limit-exceeded");
    assert.ok(limit, "a breach of the 100-page cap must be reported once the real count is known");
    assert.match(limit.messagePt, new RegExp(String(result.report.totalPages)));
  });
});

describe("renderPaginatedPdf — front matter after the Índice (DIO-45)", () => {
  test("lists stay front matter; every chapter and the Índice open on a recto; the header follows the chapter", async () => {
    const master = await buildMasterWithListsAfterTocFixture();
    const chapters = [
      await source("um", [heading(1, "SAÚDE MATERNA"), ...longParagraphs(5, 120)]),
      await source("dois", [heading(1, "Saúde Mental"), ...longParagraphs(5, 120)]),
      await source("tres", [heading(1, "planeamento familiar"), ...longParagraphs(5, 120)]),
    ];
    const merged = mergeDocuments(master, chapters);
    const document = formatParsedDocument(merged.document, { ruleSetId: HOUSE_RULE_SET_ID }, {
      extraWarnings: merged.warnings,
    });

    const { report } = await renderPaginatedPdf(document, {
      candidateName: merged.candidateName ?? "?",
      headings: merged.headings,
    });

    const page = (text: string) => {
      const heading = merged.headings.find((h) => h.text === text);
      assert.ok(heading, text);
      return report.headingPages[heading.id];
    };

    assert.equal(report.tocStartPage !== undefined && report.tocStartPage % 2, 1, "Índice on a recto");
    assert.ok(page("Lista de Abreviaturas e Siglas") < report.bodyStartPage, "abbreviations are front matter");
    assert.ok(page("Lista de Tabelas") > page("Lista de Abreviaturas e Siglas"), "each list on its own page");

    const parts = ["Identificação", "SAÚDE MATERNA", "Saúde Mental", "planeamento familiar"];
    for (const part of parts) {
      assert.equal(page(part) % 2, 1, `${part} opens on a recto`);
      // A chapter's opening page stays clean by design; the header names the
      // chapter from its second page on (it used to stay frozen on the
      // abbreviations list for the whole body).
      assert.equal(report.headers[page(part) - 1], null, `${part}'s opening page has no header`);
      if (part !== "Identificação") {
        // (Identificação is two lines long: its next page is a blank pad.)
        assert.equal(
          report.headers[page(part)],
          part.toLocaleUpperCase("pt-PT"),
          `running header on ${part}'s second page, in the part titles' case`,
        );
      }
    }
    assert.equal(new Set(parts.map(page)).size, parts.length, "no two chapters share a page");
    assert.equal(report.passes, 2, "still converges in two passes");
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
