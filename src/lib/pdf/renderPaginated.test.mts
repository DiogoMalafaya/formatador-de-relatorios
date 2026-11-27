import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api.js";
import { renderPaginatedPdf } from "./renderPaginated.ts";
import { extractPageMap } from "./pageMap.ts";
import { mergeDocuments } from "../merge/index.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { formatParsedDocument } from "../formatting/apply.ts";
import { HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, longParagraphs, paragraph } from "../formatting/testFixtures.ts";
import type { MergeSource } from "../merge/types.ts";
import { buildMasterWithListsAfterTocFixture } from "../merge/testFixtures.ts";
import { checkPdfCompliance } from "../compliance/checkPdf.ts";
import { partHeadings } from "./paginate.ts";
import { tabBand } from "./chapterTabs.ts";

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

describe("renderPaginatedPdf — chapter dividers (DIO-54)", () => {
  async function pageTexts(pdf: Buffer): Promise<string[]> {
    const loading = getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    const pdfjs = await loading.promise;
    const texts: string[] = [];
    for (let page = 1; page <= pdfjs.numPages; page += 1) {
      const content = await (await pdfjs.getPage(page)).getTextContent();
      texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    await loading.destroy();
    return texts;
  }

  test("print delivery: each chapter gets a recto divider and a blank verso, costing exactly what was announced", async () => {
    const { headings, merged } = await mergedFixture();
    const mfr = formatParsedDocument(merged.document, { ruleSetId: "mfr" }, { extraWarnings: merged.warnings });
    const chapters = partHeadings(headings);
    assert.equal(chapters.length, 2, "the fixture has two chapters");

    const off = await renderPaginatedPdf(mfr, { candidateName: "Ana Pereira", headings });
    const on = await renderPaginatedPdf(mfr, { candidateName: "Ana Pereira", headings, chapterDividers: true });

    assert.deepEqual(off.report.dividerPages, []);
    assert.equal(off.report.dividerPageCost, 4, "two pages per chapter in print");
    assert.equal(on.report.dividerPageCost, off.report.dividerPageCost);
    assert.equal(on.report.totalPages, off.report.totalPages + on.report.dividerPageCost, "the announced cost is exact");
    assert.equal(on.report.passes, 2, "the blank plan stays a fixed point with dividers on");

    assert.equal(on.report.dividerPages.length, chapters.length);
    assert.equal(on.report.dividerPages[0], on.report.bodyStartPage, "the first divider opens the body");
    const blanks = new Set(on.report.blankPages);
    const texts = await pageTexts(on.pdf);
    for (const [i, chapter] of chapters.entries()) {
      const divider = on.report.dividerPages[i];
      assert.equal(divider % 2, 1, `${chapter.text}: divider on a recto`);
      assert.ok(blanks.has(divider + 1), `${chapter.text}: the divider's verso is a truly blank filler`);
      assert.equal(on.report.headingPages[chapter.id], divider + 2, `${chapter.text}: the chapter opens on the next recto`);
      // Number + title, nothing else but the footer; no running header.
      assert.match(texts[divider - 1], new RegExp(chapter.text, "iu"));
      assert.match(texts[divider - 1], new RegExp(`\\b${i + 1}\\b`));
      assert.equal(on.report.headers[divider - 1], null, "no running header on a divider");
      assert.equal(on.report.pageLabels[divider - 1], String(divider), "a divider counts and shows its number");
    }
    for (const blank of on.report.blankPages) {
      assert.equal(texts[blank - 1].trim(), "", `blank page ${blank} stays truly blank`);
    }

    // White, typographic, within the title sizes: MFR's rules hold.
    const violations = await checkPdfCompliance(new Uint8Array(on.pdf), {
      ruleSet: mfr.ruleSet,
      fontFamily: mfr.fontFamily,
      candidateName: "Ana Pereira",
      skip: ["cover-fields"],
    });
    assert.deepEqual(violations.filter((v) => v.page !== undefined && on.report.dividerPages.includes(v.page)), []);
  });

  test("PDF delivery (Pediatria): one page per chapter and still no blank fillers", async () => {
    const { headings, merged } = await mergedFixture();
    const pediatria = formatParsedDocument(merged.document, { ruleSetId: "pediatria" }, { extraWarnings: merged.warnings });

    const off = await renderPaginatedPdf(pediatria, { candidateName: "Ana Pereira", headings });
    const on = await renderPaginatedPdf(pediatria, { candidateName: "Ana Pereira", headings, chapterDividers: true });

    assert.equal(on.report.dividerPageCost, 2);
    assert.equal(on.report.totalPages, off.report.totalPages + 2);
    assert.deepEqual(on.report.blankPages, []);
    for (const [i, chapter] of partHeadings(headings).entries()) {
      assert.equal(on.report.headingPages[chapter.id], on.report.dividerPages[i] + 1);
    }
  });
});

describe("renderPaginatedPdf — mirrored furniture for duplex printing (DIO-55)", () => {
  /** Footer and header text items per page, with their horizontal centre. */
  async function furniture(pdf: Buffer) {
    const loading = getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    const pdfjs = await loading.promise;
    const pages: { width: number; footer: { str: string; mid: number }[]; header: { str: string; mid: number }[] }[] = [];
    for (let n = 1; n <= pdfjs.numPages; n += 1) {
      const page = await pdfjs.getPage(n);
      const [, , width, height] = page.view;
      const items = (await page.getTextContent()).items.filter(
        (item): item is TextItem => "str" in item && item.str.trim() !== "",
      );
      const at = (item: TextItem) => ({
        str: item.str.trim(),
        mid: item.transform[4] + item.width / 2,
      });
      pages.push({
        width,
        footer: items.filter((item) => item.transform[5] < 50).map(at),
        header: items.filter((item) => item.transform[5] > height - 50).map(at),
      });
    }
    await loading.destroy();
    return pages;
  }

  test("print (MFR): number and header on the outer edge, name inside — right after blanks and dividers too", async () => {
    const { headings, merged } = await mergedFixture();
    const mfr = formatParsedDocument(merged.document, { ruleSetId: "mfr" }, { extraWarnings: merged.warnings });
    const { pdf, report } = await renderPaginatedPdf(mfr, { candidateName: "Ana Pereira", headings, chapterDividers: true });
    assert.ok(report.blankPages.length > 0 && report.dividerPages.length > 0, "the fixture exercises blanks and dividers");

    const pages = await furniture(pdf);
    let checked = 0;
    for (const [i, page] of pages.entries()) {
      const pageNumber = i + 1;
      const label = report.pageLabels[i];
      if (label === null) {
        assert.deepEqual(page.footer, [], `page ${pageNumber}: the cover and blanks carry nothing`);
        continue;
      }
      const recto = pageNumber % 2 === 1;
      const outer = (mid: number) => (recto ? mid > page.width / 2 : mid < page.width / 2);
      const number = page.footer.find((item) => item.str === label);
      const name = page.footer.find((item) => item.str === "Ana Pereira");
      assert.ok(number && name, `page ${pageNumber}: name and number`);
      assert.ok(outer(number.mid), `page ${pageNumber} (${recto ? "recto" : "verso"}): number on the outer edge`);
      assert.ok(!outer(name.mid), `page ${pageNumber}: name on the inner side`);
      for (const header of page.header) assert.ok(outer(header.mid), `page ${pageNumber}: header on the outer edge`);
      checked += 1;
    }
    assert.ok(checked > 4);

    // MFR's footer is "name + number, nothing else": still compliant, and no rule drawn.
    const violations = await checkPdfCompliance(new Uint8Array(pdf), {
      ruleSet: mfr.ruleSet,
      fontFamily: mfr.fontFamily,
      candidateName: "Ana Pereira",
      skip: ["cover-fields"],
    });
    assert.deepEqual(violations.filter((v) => v.check === "footer-content"), []);
  });

  test("PDF delivery (Pediatria): furniture stays centred", async () => {
    const { headings, merged } = await mergedFixture();
    const pediatria = formatParsedDocument(merged.document, { ruleSetId: "pediatria" }, { extraWarnings: merged.warnings });
    const { pdf } = await renderPaginatedPdf(pediatria, { candidateName: "Ana Pereira", headings });
    for (const page of (await furniture(pdf)).slice(1)) {
      for (const item of page.footer) assert.ok(Math.abs(item.mid - page.width / 2) < 2, "centred footer");
    }
  });
});

describe("renderPaginatedPdf — outer-edge chapter tabs (DIO-58)", () => {
  interface BandText {
    str: string;
    size: number;
  }
  /** Text items in each page's outer and inner tab band (inner = where tabs must never be). */
  async function bandTexts(pdf: Buffer, margins: Parameters<typeof tabBand>[1]) {
    const loading = getDocument({ data: new Uint8Array(pdf), verbosity: 0 });
    const pdfjs = await loading.promise;
    const pages: { outer: BandText[]; inner: BandText[] }[] = [];
    for (let n = 1; n <= pdfjs.numPages; n += 1) {
      const page = await pdfjs.getPage(n);
      const [, , width, height] = page.view;
      const items = (await page.getTextContent()).items.filter(
        (item): item is TextItem => "str" in item && item.str.trim() !== "",
      );
      const inside = (band: ReturnType<typeof tabBand>, item: TextItem) =>
        item.transform[4] >= band.x - 2 &&
        item.transform[4] + item.width <= band.x + band.width + 2 &&
        item.transform[5] >= band.y - 2 &&
        item.transform[5] <= band.y + band.height + 2;
      const outerBand = tabBand({ width, height }, margins, n);
      // The other side's band: the same geometry with the parity flipped.
      const innerBand = tabBand({ width, height }, margins, n + 1);
      const at = (item: TextItem) => ({ str: item.str.trim(), size: Math.hypot(item.transform[0], item.transform[1]) });
      pages.push({
        outer: items.filter((item) => inside(outerBand, item)).map(at),
        inner: items.filter((item) => inside(innerBand, item)).map(at),
      });
    }
    await loading.destroy();
    return pages;
  }

  test("MFR with dividers: typographic tabs on the outer edge, current chapter emphasised, compliant", async () => {
    const { headings, merged } = await mergedFixture();
    const mfr = formatParsedDocument(merged.document, { ruleSetId: "mfr" }, { extraWarnings: merged.warnings });
    const off = await renderPaginatedPdf(mfr, { candidateName: "Ana Pereira", headings, chapterDividers: true });
    const on = await renderPaginatedPdf(mfr, {
      candidateName: "Ana Pereira",
      headings,
      chapterDividers: true,
      chapterTabs: true,
    });
    const chapters = partHeadings(headings);
    assert.ok(chapters.length >= 2 && on.report.blankPages.length > 0, "the fixture exercises chapters and blanks");

    // Tabs add no pages and leave the blank plan a fixed point.
    assert.equal(on.report.totalPages, off.report.totalPages);
    assert.deepEqual(on.report.blankPages, off.report.blankPages);
    assert.equal(on.report.passes, 2);
    assert.ok(off.report.chapterTabs.every((tab) => tab === null), "toggle off: no tabs");

    const pages = await bandTexts(on.pdf, mfr.ruleSet.margins);
    const firstChapterPage = on.report.dividerPages[0];
    let tabbed = 0;
    for (const [i, page] of pages.entries()) {
      const pageNumber = i + 1;
      const current = on.report.chapterTabs[i];
      assert.deepEqual(page.inner, [], `page ${pageNumber}: nothing in the inner band`);
      if (pageNumber === 1 || on.report.blankPages.includes(pageNumber) || pageNumber < firstChapterPage) {
        assert.equal(current, null, `page ${pageNumber}: cover, blanks and front matter have no tabs`);
        assert.deepEqual(page.outer, [], `page ${pageNumber}: no tab drawn`);
        continue;
      }
      assert.notEqual(current, null, `page ${pageNumber}: a body page carries tabs`);
      assert.deepEqual(
        page.outer.map((item) => item.str),
        chapters.map((_, index) => String(index + 1)),
        `page ${pageNumber}: one number per chapter, in order`,
      );
      for (const [index, item] of page.outer.entries()) {
        assert.ok(Math.abs(item.size - (index === current ? 14 : 12)) < 0.3, `page ${pageNumber}: current at 14 pt, others 12 pt`);
      }
      tabbed += 1;
    }
    assert.ok(tabbed > 4);
    for (const [index, divider] of on.report.dividerPages.entries()) {
      assert.equal(on.report.chapterTabs[divider - 1], index, "a divider page belongs to its chapter");
    }

    const violations = await checkPdfCompliance(new Uint8Array(on.pdf), {
      ruleSet: mfr.ruleSet,
      fontFamily: mfr.fontFamily,
      candidateName: "Ana Pereira",
      skip: ["cover-fields", "rosto-signatures", "candidate-signature"],
    });
    assert.deepEqual(violations, [], "margins, font size, footer, black text and no images all hold with tabs on");
  });

  test("house standard: filled tabs with the theme's accent, still inside the band", async () => {
    const { document, headings } = await mergedFixture();
    const { pdf, report } = await renderPaginatedPdf(document, {
      candidateName: "Ana Pereira",
      headings,
      chapterTabs: true,
    });
    const pages = await bandTexts(pdf, document.ruleSet.margins);
    const tabbedPages = report.chapterTabs.flatMap((tab, i) => (tab === null ? [] : [i]));
    assert.ok(tabbedPages.length > 2);
    for (const i of tabbedPages) {
      assert.equal(pages[i].outer.length, partHeadings(headings).length, `page ${i + 1}: one label per chapter`);
      assert.deepEqual(pages[i].inner, []);
    }
    const violations = await checkPdfCompliance(new Uint8Array(pdf), {
      ruleSet: document.ruleSet,
      fontFamily: document.fontFamily,
      candidateName: "Ana Pereira",
      skip: ["cover-fields"],
    });
    assert.deepEqual(violations.filter((v) => v.check === "margins" || v.check === "font-size"), []);
  });

  test("Pediatria (PDF delivery) never gets tabs", async () => {
    const { headings, merged } = await mergedFixture();
    const pediatria = formatParsedDocument(merged.document, { ruleSetId: "pediatria" }, { extraWarnings: merged.warnings });
    const { pdf, report } = await renderPaginatedPdf(pediatria, { candidateName: "Ana Pereira", headings, chapterTabs: true });
    assert.ok(report.chapterTabs.every((tab) => tab === null));
    for (const page of await bandTexts(pdf, pediatria.ruleSet.margins)) {
      assert.deepEqual([...page.outer, ...page.inner], []);
    }
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
