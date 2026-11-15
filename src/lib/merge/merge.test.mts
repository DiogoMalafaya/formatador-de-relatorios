import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mergeDocuments } from "./merge.ts";
import { splitTopLevelBlocks, headingLevelOf } from "./blocks.ts";
import type { MergeSource } from "./types.ts";
import {
  buildChapterFixtures,
  buildChapterWithImage,
  buildMasterFixture,
  buildMasterWithListsAfterTocFixture,
  buildMasterWithoutTocFixture,
} from "./testFixtures.ts";

describe("mergeDocuments", () => {
  let master: MergeSource;
  let masterWithoutToc: MergeSource;
  let chapters: MergeSource[];

  before(async () => {
    master = await buildMasterFixture();
    masterWithoutToc = await buildMasterWithoutTocFixture();
    chapters = await buildChapterFixtures();
  });

  test("single-document input passes through unchanged", async () => {
    const result = mergeDocuments(master, []);
    assert.equal(result.passthrough, true);
    assert.equal(result.document, master.document);
    assert.equal(result.document.html, master.document.html);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.tocEntries, []);
    assert.equal(result.replacedStaleToc, false);
  });

  test("merging preserves every non-heading block of every source verbatim", () => {
    const result = mergeDocuments(master, chapters);
    for (const chapter of chapters) {
      for (const block of splitTopLevelBlocks(chapter.document.html)) {
        if (headingLevelOf(block.tag) !== undefined) continue;
        assert.ok(
          result.document.html.includes(block.html),
          `lost a <${block.tag}> block from ${chapter.id}: ${block.html.slice(0, 80)}`,
        );
      }
    }
  });

  test("merged counts aggregate the sources — tables and lists survive", () => {
    const result = mergeDocuments(master, chapters);
    const expectedTables = master.document.tableCount + chapters.reduce((n, c) => n + c.document.tableCount, 0);
    assert.equal(result.document.tableCount, expectedTables);
    assert.equal(expectedTables, 2);
    assert.match(result.document.html, /<ul>/);
    // Every chapter's words survive in full (front matter loses only its stale Índice).
    const chapterWords = chapters.reduce((n, c) => n + c.document.wordCount, 0);
    assert.ok(result.document.wordCount >= chapterWords);
  });

  test("forbidden images keep flowing through the merged document's counts", async () => {
    const withImage = await buildChapterWithImage();
    const result = mergeDocuments(master, [...chapters, withImage]);
    assert.equal(result.document.imageCount, 1);
    assert.match(result.document.html, /<img /);
  });

  test("chapter top headings are demoted to h2 by default, internal hierarchy preserved", () => {
    const result = mergeDocuments(master, chapters);
    // h1 top heading → h2.
    assert.match(result.document.html, /<h2 id="[^"]+"(?: class="[^"]*")?>SAÚDE MATERNA<\/h2>/);
    // Its internal h2 shifts with it → h3.
    assert.match(result.document.html, /<h3 id="[^"]+"(?: class="[^"]*")?>Consultas de vigilância<\/h3>/);
    // A chapter whose top heading is already an h2 stays at the target level (shift 0).
    assert.match(result.document.html, /<h2 id="[^"]+"(?: class="[^"]*")?>Saúde do Adulto<\/h2>/);
    assert.match(result.document.html, /<h3 id="[^"]+"(?: class="[^"]*")?>Doença crónica<\/h3>/);
    // No chapter heading survives as an h1 in the body.
    const bodyStart = result.document.html.indexOf("SAÚDE MATERNA");
    assert.ok(!result.document.html.slice(bodyStart).includes("<h1"));
  });

  test("per-file depth override demotes just that chapter deeper", () => {
    const result = mergeDocuments(master, chapters, {
      chapterDepthOverrides: { "saude-materna": 2 },
    });
    assert.match(result.document.html, /<h3 id="[^"]+"(?: class="[^"]*")?>SAÚDE MATERNA<\/h3>/);
    assert.match(result.document.html, /<h4 id="[^"]+"(?: class="[^"]*")?>Consultas de vigilância<\/h4>/);
    // Other chapters keep the automatic default.
    assert.match(result.document.html, /<h2 id="[^"]+"(?: class="[^"]*")?>Saúde Mental<\/h2>/);
  });

  test("merge is deterministic — same inputs, byte-identical output", () => {
    const first = mergeDocuments(master, chapters);
    const second = mergeDocuments(master, chapters);
    assert.equal(first.document.html, second.document.html);
    assert.deepEqual(first.headings, second.headings);
    assert.deepEqual(first.tocEntries, second.tocEntries);
  });

  test("stale Índice is removed, replaced in place, and surfaced as a warning", () => {
    const result = mergeDocuments(master, chapters);
    assert.equal(result.replacedStaleToc, true);
    assert.ok(result.warnings.some((w) => w.code === "stale-toc-replaced"));
    // The stale dotted-leader entries are gone…
    assert.doesNotMatch(result.document.html, /\.{5,}\s*12/);
    // …the generated Índice stands at the stale one's position: after the
    // front matter, before the chapters.
    const html = result.document.html;
    const navIndex = html.indexOf('<nav class="generated-toc">');
    assert.ok(navIndex > -1);
    assert.ok(html.indexOf("Dedicatória") < navIndex);
    assert.ok(navIndex < html.indexOf("SAÚDE MATERNA"));
  });

  test("a master without an Índice still gets a generated one, without the stale-Índice warning", () => {
    const result = mergeDocuments(masterWithoutToc, chapters);
    assert.equal(result.replacedStaleToc, false);
    assert.ok(!result.warnings.some((w) => w.code === "stale-toc-replaced"));
    assert.ok(result.document.html.includes('<nav class="generated-toc">'));
  });

  test("front-matter headings are roman, chapter headings arabic", () => {
    const result = mergeDocuments(master, chapters);
    const byText = new Map(result.headings.map((h) => [h.text, h]));
    assert.equal(byText.get("Dedicatória")?.numbering, "roman");
    assert.equal(byText.get("Estrutura do Documento")?.numbering, "roman");
    assert.equal(byText.get("SAÚDE MATERNA")?.numbering, "arabic");
    // The stale Índice's own title heading was removed, not recorded.
    assert.equal(byText.has("Índice"), false);
  });

  test("every recorded heading id is present exactly once in the merged HTML", () => {
    const result = mergeDocuments(master, chapters);
    assert.ok(result.headings.length > 0);
    for (const heading of result.headings) {
      const occurrences = result.document.html.split(`id="${heading.id}"`).length - 1;
      assert.equal(occurrences, 1, `heading id ${heading.id} (${heading.text})`);
    }
  });

  describe("front matter after the Índice and the source cover (DIO-45)", () => {
    let listsMaster: MergeSource;
    before(async () => {
      listsMaster = await buildMasterWithListsAfterTocFixture();
    });

    test("lists after the Índice stay roman front matter", () => {
      const result = mergeDocuments(listsMaster, chapters);
      const byText = new Map(result.headings.map((h) => [h.text, h]));
      assert.equal(byText.get("Lista de Abreviaturas e Siglas")?.numbering, "roman");
      assert.equal(byText.get("Lista de Tabelas")?.numbering, "roman");
    });

    test("a body section written into the master is demoted to chapter level, like the chapters", () => {
      const result = mergeDocuments(listsMaster, chapters);
      const byText = new Map(result.headings.map((h) => [h.text, h]));
      assert.deepEqual(
        { level: byText.get("Identificação")?.level, numbering: byText.get("Identificação")?.numbering },
        { level: 2, numbering: "arabic" },
      );
      assert.equal(byText.get("Contactos")?.level, 3);
      assert.equal(byText.get("SAÚDE MATERNA")?.level, 2);
      // One chapter level means one notion of "major part".
      const arabicLevels = new Set(result.headings.filter((h) => h.numbering === "arabic").map((h) => h.level));
      assert.equal(Math.min(...arabicLevels), 2);
      assert.ok(!result.headings.some((h) => h.numbering === "arabic" && h.level === 1));
    });

    test("the generated Índice sits before the lists, keeping the student's order", () => {
      const html = mergeDocuments(listsMaster, chapters).document.html;
      const nav = html.indexOf('<nav class="generated-toc">');
      assert.ok(html.indexOf("Dedicatória") < nav);
      assert.ok(nav < html.indexOf("Lista de Abreviaturas"));
      assert.ok(html.indexOf("Lista de Tabelas") < html.indexOf(">Identificação<"));
    });

    test("the master's cover text is dropped, its name kept, and the student told", () => {
      const result = mergeDocuments(listsMaster, chapters);
      assert.equal(result.candidateName, "Beatriz Fictícia Andrade");
      assert.ok(!result.document.html.includes("<p>Curriculum Vitae</p>"));
      assert.ok(!result.document.html.includes("Internato Médico de Medicina Geral"));
      assert.ok(result.warnings.some((w) => w.code === "source-cover-replaced"));
      // The name still appears where the student wrote it in the body.
      assert.ok(result.document.html.includes("Nome: Beatriz Fictícia Andrade"));
    });

    test("part titles carry the part class, in the headings and the Índice", () => {
      const result = mergeDocuments(listsMaster, chapters);
      const html = result.document.html;
      assert.match(html, /<h2 id="[^"]+" class="part-title">Saúde Mental<\/h2>/);
      assert.match(html, /<h1 id="[^"]+" class="part-title front-matter-title">Lista de Tabelas<\/h1>/);
      assert.match(html, /<h3 id="[^"]+">Contactos<\/h3>/, "subsections are not part titles");
      assert.match(html, /toc-depth-2 toc-part"><span class="toc-entry-text">Saúde Mental/);
    });
  });
});
