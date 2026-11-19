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
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { buildDocx, heading, imageParagraph, paragraph, simpleTable, syntheticPng } from "../formatting/testFixtures.ts";

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
        if (block.tag === "table") {
          // Tables are restyled (DIO-48): the markup around cells changes,
          // but every cell's content must survive verbatim.
          for (const [, inner] of block.html.matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/g)) {
            assert.ok(result.document.html.includes(inner), `lost a table cell from ${chapter.id}: ${inner.slice(0, 80)}`);
          }
          continue;
        }
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

  describe("Lista de tabelas (DIO-48)", () => {
    let listsMaster: MergeSource;
    let captioned: MergeSource[];

    const sourceOf = async (id: string, children: Parameters<typeof buildDocx>[0]): Promise<MergeSource> => ({
      id,
      document: await parseDocxDocument(await buildDocx(children)),
    });

    before(async () => {
      listsMaster = await buildMasterWithListsAfterTocFixture();
      captioned = [
        await sourceOf("cap-a", [
          heading(1, "Atividade assistencial"),
          paragraph("Tabela 4 – Consultas por ano"),
          simpleTable([["Ano", "Consultas", "Notas"], ["2024", "111", "a"], ["2025", "222", "b"]]),
        ]),
        await sourceOf("cap-b", [
          heading(1, "Atividade cirúrgica"),
          simpleTable([["Área", "Atos", "Notas"], ["Joelho", "12", "a"], ["Anca", "7", "b"]]),
          paragraph("Tabela 1: Atos por área"),
        ]),
      ];
    });

    test("captions are numbered across chapter files in document order", () => {
      const result = mergeDocuments(master, captioned);
      assert.deepEqual(
        result.tableCaptions.map((caption) => [caption.text, caption.numbering]),
        [
          ["Tabela 1. Consultas por ano", "arabic"],
          ["Tabela 2. Atos por área", "arabic"],
        ],
      );
      // The caption below the second table was moved above it.
      const html = result.document.html;
      assert.ok(html.indexOf("Tabela 2.</span> Atos por área") < html.indexOf("<p>Joelho</p>"));
    });

    test("without a stale list, the generated one goes right after the Índice", () => {
      const result = mergeDocuments(master, captioned);
      const html = result.document.html;
      const tocEnd = html.indexOf("</nav>");
      const list = html.search(/<nav class="[^"]*\bgenerated-table-list\b/);
      assert.ok(list > tocEnd && list < tocEnd + 20, "Lista de tabelas follows the Índice");
      assert.match(html, /data-toc-heading="table-caption-1" data-toc-numbering="arabic"/);
      assert.match(html, /<span class="toc-entry-text">Tabela 2\. Atos por área<\/span>/);
      assert.ok(!result.warnings.some((warning) => warning.code === "stale-table-list-replaced"));
      const listEntry = result.tocEntries.find((entry) => entry.text === "Lista de tabelas");
      assert.deepEqual(
        { numbering: listEntry?.numbering, part: listEntry?.part },
        { numbering: "roman", part: true },
        "listed in the Índice as front matter",
      );
      assert.match(html, /<h1 id="merged-heading-table-list" class="toc-title part-title front-matter-title">Lista de tabelas<\/h1>/);
    });

    test("the master's stale list is replaced in place, and leaves the Índice", () => {
      const result = mergeDocuments(listsMaster, captioned);
      const html = result.document.html;
      assert.doesNotMatch(html, /Consultas fictícias/, "the stale entry is gone");
      assert.equal((html.match(/generated-table-list/g) ?? []).length, 1);
      // In place: after the abbreviations list, before the body.
      assert.ok(html.indexOf("generated-table-list") > html.indexOf("Lista de Abreviaturas e Siglas</h1>"));
      assert.ok(html.indexOf("generated-table-list") < html.indexOf("Nome: Beatriz"));
      assert.ok(!result.headings.some((h) => h.text === "Lista de Tabelas"), "the stale heading is gone");
      // The generated list takes its place in the Índice, between the abbreviations and the body.
      const titles = result.tocEntries.map((entry) => entry.text);
      assert.deepEqual(
        titles.slice(titles.indexOf("Lista de Abreviaturas e Siglas"), titles.indexOf("Lista de Abreviaturas e Siglas") + 3),
        ["Lista de Abreviaturas e Siglas", "Lista de tabelas", "Identificação"],
      );
      assert.ok(result.warnings.some((warning) => warning.code === "stale-table-list-replaced"));
    });

    test("with no captions, the student's own list is kept and nothing is generated", () => {
      const result = mergeDocuments(listsMaster, chapters);
      const html = result.document.html;
      assert.match(html, /Consultas fictícias/);
      assert.doesNotMatch(html, /generated-table-list/);
      assert.doesNotMatch(html, /lauda:stale-table-list/);
      assert.deepEqual(result.tableCaptions, []);
    });
  });

  test("a dedication is reported as a recto front-matter page (DIO-50)", () => {
    const result = mergeDocuments(master, chapters);
    const dedication = result.headings.find((heading) => heading.text === "Dedicatória");
    assert.ok(dedication);
    assert.deepEqual(result.rectoHeadingIds, [dedication.id]);
  });

  describe("Lista de figuras (DIO-49)", () => {
    const sourceOf = async (id: string, children: Parameters<typeof buildDocx>[0]): Promise<MergeSource> => ({
      id,
      document: await parseDocxDocument(await buildDocx(children)),
    });

    test("figure captions are numbered across files and listed after the Lista de tabelas", async () => {
      const result = mergeDocuments(master, [
        await sourceOf("fig-a", [
          heading(1, "Atividade"),
          paragraph("Tabela 1 – Consultas"),
          simpleTable([["Ano", "Consultas", "Notas"], ["2024", "111", "a"], ["2025", "222", "b"]]),
          imageParagraph({ png: syntheticPng(40, 30, 1) }),
          paragraph("Figura 7 – Evolução"),
        ]),
        await sourceOf("fig-b", [heading(1, "Mais"), paragraph("Gráfico 1: Distribuição"), imageParagraph({ png: syntheticPng(40, 30, 2) })]),
      ]);
      assert.deepEqual(
        result.figureCaptions.map((caption) => caption.text),
        ["Figura 1. Evolução", "Figura 2. Distribuição"],
      );
      const html = result.document.html;
      const tables = html.search(/generated-table-list/);
      const figures = html.search(/generated-figure-list/);
      assert.ok(tables > 0 && figures > tables, "tables list, then figures list");
      const titles = result.tocEntries.map((entry) => entry.text);
      assert.ok(titles.indexOf("Lista de figuras") === titles.indexOf("Lista de tabelas") + 1);
    });
  });
});
