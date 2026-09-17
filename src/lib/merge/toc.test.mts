import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { splitTopLevelBlocks } from "./blocks.ts";
import type { HtmlBlock } from "./blocks.ts";
import {
  detectStaleToc,
  fillTocPageNumbers,
  formatTocPageNumber,
  renderTocHtml,
  toRomanLowercase,
} from "./toc.ts";
import { mergeDocuments } from "./merge.ts";
import type { MergeSource } from "./types.ts";
import {
  buildChapterFixtures,
  buildChapterSaudeMaterna,
  buildMasterFixture,
  buildMasterWithoutTocFixture,
} from "./testFixtures.ts";

describe("detectStaleToc", () => {
  let master: MergeSource;

  before(async () => {
    master = await buildMasterFixture();
  });

  test("hits the master fixture's Índice and spans its dotted-leader entries", () => {
    const blocks = splitTopLevelBlocks(master.document.html);
    const toc = detectStaleToc(blocks);
    assert.ok(toc, "expected the stale Índice to be detected");
    assert.equal(toc.title, "Índice");
    // Title heading + the three stale entry paragraphs.
    assert.equal(toc.endIndex - toc.startIndex, 3);
    assert.match(blocks[toc.startIndex].html, /Índice/);
    assert.match(blocks[toc.endIndex].html, /Planeamento Familiar/);
  });

  test("misses a document without a TOC", async () => {
    const chapter = await buildChapterSaudeMaterna();
    assert.equal(detectStaleToc(splitTopLevelBlocks(chapter.document.html)), undefined);
    const noToc = await buildMasterWithoutTocFixture();
    assert.equal(detectStaleToc(splitTopLevelBlocks(noToc.document.html)), undefined);
  });

  test("a heading merely named Índice, without entry-like blocks, is not a TOC", () => {
    const blocks: HtmlBlock[] = [
      { tag: "h1", html: "<h1>Índice</h1>" },
      { tag: "p", html: "<p>Um parágrafo normal, sem pontos nem números de página.</p>" },
    ];
    assert.equal(detectStaleToc(blocks), undefined);
  });

  test("accepts accent-less and Sumário spellings, and a list-of-headings body", () => {
    const blocks: HtmlBlock[] = [
      { tag: "h2", html: "<h2>Sumario</h2>" },
      { tag: "ul", html: "<ul><li>Saúde Materna</li><li>Saúde Mental</li></ul>" },
    ];
    const toc = detectStaleToc(blocks);
    assert.ok(toc);
    assert.equal(toc.endIndex, 1);
  });
});

describe("Índice generation and page-number fill", () => {
  let master: MergeSource;
  let chapters: MergeSource[];

  before(async () => {
    master = await buildMasterFixture();
    chapters = await buildChapterFixtures();
  });

  test("round-trips with a page map — roman for front matter, arabic for the body", () => {
    const result = mergeDocuments(master, chapters);

    const pageMap = new Map<string, number>();
    let romanPage = 2; // cover is page i
    let arabicPage = 1;
    for (const heading of result.headings) {
      pageMap.set(heading.id, heading.numbering === "roman" ? romanPage++ : (arabicPage += 3) - 3);
    }

    const filled = fillTocPageNumbers(result.document.html, pageMap);
    assert.deepEqual(filled.missingHeadingIds, []);
    // No unresolved placeholders remain.
    assert.ok(!filled.html.includes("data-toc-heading"));
    // Front-matter entries (Estrutura do Documento, Dedicatória) show roman pages ii and iii.
    assert.match(filled.html, /<span class="toc-page">ii<\/span>/);
    assert.match(filled.html, /<span class="toc-page">iii<\/span>/);
    // First body entry shows arabic page 1.
    assert.match(filled.html, /<span class="toc-page">1<\/span>/);
    // Entry text and dotted-leader slot are in place for a chapter entry.
    assert.match(
      filled.html,
      /<span class="toc-entry-text">SAÚDE MATERNA<\/span><span class="toc-leader"><\/span><span class="toc-page">\d+<\/span>/,
    );
  });

  test("entries carry the merged depth for indentation", () => {
    const result = mergeDocuments(master, chapters);
    const byText = new Map(result.tocEntries.map((entry) => [entry.text, entry]));
    assert.equal(byText.get("Dedicatória")?.depth, 1);
    assert.equal(byText.get("SAÚDE MATERNA")?.depth, 2);
    assert.equal(byText.get("Consultas de vigilância")?.depth, 3);
    assert.match(result.document.html, /<li class="toc-entry toc-depth-3">/);
  });

  test("headings deeper than tocMaxLevel are left out of the Índice", () => {
    const result = mergeDocuments(master, chapters, { tocMaxLevel: 2 });
    assert.ok(result.tocEntries.every((entry) => entry.depth <= 2));
    assert.ok(!result.tocEntries.some((entry) => entry.text === "Consultas de vigilância"));
  });

  test("a heading missing from the page map keeps its placeholder and is reported", () => {
    const entries = [
      { headingId: "merged-heading-0", depth: 1, text: "Dedicatória", numbering: "roman" as const },
      { headingId: "merged-heading-1", depth: 2, text: "Saúde Mental", numbering: "arabic" as const },
    ];
    const html = renderTocHtml(entries);
    const filled = fillTocPageNumbers(html, new Map([["merged-heading-1", 7]]));
    assert.deepEqual(filled.missingHeadingIds, ["merged-heading-0"]);
    assert.match(filled.html, /data-toc-heading="merged-heading-0"/);
    assert.match(filled.html, /<span class="toc-page">7<\/span>/);
  });

  test("escapes entry text destined for the generated HTML", () => {
    const html = renderTocHtml([
      { headingId: "h", depth: 1, text: 'Título com <b> & "aspas"', numbering: "arabic" },
    ]);
    assert.ok(html.includes("Título com &lt;b&gt; &amp; &quot;aspas&quot;"));
    assert.ok(!html.includes("<b>"));
  });
});

describe("roman numerals", () => {
  test("converts the front-matter range correctly", () => {
    assert.equal(toRomanLowercase(1), "i");
    assert.equal(toRomanLowercase(4), "iv");
    assert.equal(toRomanLowercase(9), "ix");
    assert.equal(toRomanLowercase(14), "xiv");
    assert.equal(toRomanLowercase(40), "xl");
    assert.equal(toRomanLowercase(2026), "mmxxvi");
  });

  test("rejects non-positive input", () => {
    assert.throws(() => toRomanLowercase(0), RangeError);
  });

  test("formatTocPageNumber picks the sequence's display form", () => {
    assert.equal(formatTocPageNumber(3, "roman"), "iii");
    assert.equal(formatTocPageNumber(3, "arabic"), "3");
  });
});
