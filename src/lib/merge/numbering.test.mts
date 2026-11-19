import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { SectionNumberer, manualNumberPrefix, stripManualNumber, toRoman } from "./numbering.ts";
import { mergeDocuments } from "./merge.ts";
import { fillTocPageNumbers } from "./toc.ts";
import type { MergeSource } from "./types.ts";
import { buildMasterFixture } from "./testFixtures.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { buildDocx, heading, paragraph } from "../formatting/testFixtures.ts";

describe("manualNumberPrefix", () => {
  test("recognises the numbers students type", () => {
    for (const [text, prefix] of [
      ["3.1. Formação", "3.1. "],
      ["3.1 Formação", "3.1 "],
      ["3.1.2) Cursos", "3.1.2) "],
      ["2. Casuística", "2. "],
      ["4) Investigação", "4) "],
      ["5 - Formação", "5 - "],
      ["6 – Formação", "6 – "],
      ["III. Atividade assistencial", "III. "],
      ["IV - Formação", "IV - "],
      ["II.3. Cursos", "II.3. "],
    ] as const) {
      assert.equal(manualNumberPrefix(text), prefix, text);
    }
  });

  test("leaves headings that merely start with a number or capital letters", () => {
    for (const text of [
      "20 anos de Pediatria",
      "2020 em revisão",
      "CV — Resumo",
      "Vida académica",
      "Identificação",
      "XL Congresso Nacional",
      "3.1.",
      "1.º ano de internato",
    ]) {
      assert.equal(manualNumberPrefix(text), undefined, text);
    }
  });
});

describe("stripManualNumber", () => {
  test("strips plain text numbers", () => {
    assert.equal(stripManualNumber("3.1. Formação"), "Formação");
  });

  test("strips a number inside its own inline element, keeping the tags", () => {
    assert.equal(stripManualNumber("<strong>3.1.</strong> Formação"), "<strong></strong>Formação");
    assert.equal(stripManualNumber('<a id="_Toc1"></a>2. Casuística'), '<a id="_Toc1"></a>Casuística');
  });

  test("handles non-breaking spaces after the number", () => {
    assert.equal(stripManualNumber("3.1. Formação"), "Formação");
    assert.equal(stripManualNumber("3.1.&nbsp;Formação"), "Formação");
  });

  test("returns the input untouched when there's no typed number", () => {
    assert.equal(stripManualNumber("<em>Formação</em> contínua"), "<em>Formação</em> contínua");
  });
});

describe("SectionNumberer", () => {
  test("numbers chapters, sections and subsections hierarchically", () => {
    const numberer = new SectionNumberer();
    const numbers = [1, 2, 3, 3, 2, 1, 2].map((tier) => numberer.next(tier).number);
    assert.deepEqual(numbers, ["1.", "1.1.", "1.1.1.", "1.1.2.", "1.2.", "2.", "2.1."]);
  });

  test("a skipped level is numbered one tier below its parent, never 1.0.1", () => {
    const numberer = new SectionNumberer();
    assert.equal(numberer.next(1).number, "1.");
    assert.deepEqual(numberer.next(3), { tier: 2, number: "1.1." });
  });

  test("tiers past subsection are left unnumbered", () => {
    const numberer = new SectionNumberer();
    [1, 2, 3].forEach((tier) => numberer.next(tier));
    assert.deepEqual(numberer.next(4), { tier: 4 });
    assert.equal(numberer.next(3).number, "1.1.2.");
  });

  test("roman chapters as a theme option", () => {
    const numberer = new SectionNumberer("roman-chapters");
    assert.deepEqual([1, 2, 1, 1].map((tier) => numberer.next(tier).number), ["I.", "I.1.", "II.", "III."]);
  });

  test("numbering off still reports tiers, for the Índice", () => {
    const numberer = new SectionNumberer("none");
    assert.deepEqual(numberer.next(1), { tier: 1 });
    assert.deepEqual(numberer.next(2), { tier: 2 });
  });

  test("toRoman", () => {
    assert.deepEqual([1, 4, 9, 14, 39].map(toRoman), ["I", "IV", "IX", "XIV", "XXXIX"]);
  });
});

describe("numbering in the merge (DIO-53)", () => {
  let master: MergeSource;
  let chapters: MergeSource[];

  const sourceOf = async (id: string, children: Parameters<typeof buildDocx>[0]): Promise<MergeSource> => ({
    id,
    document: await parseDocxDocument(await buildDocx(children)),
  });

  before(async () => {
    master = await buildMasterFixture();
    // Mixed manual numbering, the way separately written files arrive:
    // one numbered by hand, one restarting at 1, one with roman numerals,
    // one with none.
    chapters = [
      await sourceOf("a", [heading(1, "3. Formação"), heading(2, "3.1. Cursos"), heading(3, "3.1.1 Suporte de vida"), paragraph("Texto.")]),
      await sourceOf("b", [heading(1, "1. Investigação"), heading(2, "1.1 Publicações"), paragraph("Texto.")]),
      await sourceOf("c", [heading(1, "IV - Atividade assistencial"), heading(2, "Consulta"), paragraph("Texto.")]),
      await sourceOf("d", [heading(1, "Considerações finais"), paragraph("Texto.")]),
    ];
  });

  test("mixed manual numbering renders with one consistent scheme", () => {
    const result = mergeDocuments(master, chapters);
    const body = result.headings.filter((h) => h.numbering === "arabic").map((h) => `${h.number} ${h.text}`);
    assert.deepEqual(body, [
      "1. Formação",
      "1.1. Cursos",
      "1.1.1. Suporte de vida",
      "2. Investigação",
      "2.1. Publicações",
      "3. Atividade assistencial",
      "3.1. Consulta",
      "4. Considerações finais",
    ]);
    // The typed numbers are gone from the HTML: never "3.1. 3.1.".
    assert.doesNotMatch(result.document.html, /<\/span> \d/);
    assert.match(result.document.html, /<h2 id="[^"]+" class="part-title"><span class="section-number">1\.<\/span> Formação<\/h2>/);
    assert.match(result.document.html, /<h4 id="[^"]+"><span class="section-number">1\.1\.1\.<\/span> Suporte de vida<\/h4>/);
  });

  test("front matter is never numbered", () => {
    const result = mergeDocuments(master, chapters);
    for (const heading of result.headings.filter((h) => h.numbering === "roman")) {
      assert.equal(heading.number, undefined, heading.text);
    }
  });

  test("the Índice lists chapters, sections and subsections, numbered and styled by tier", () => {
    const result = mergeDocuments(master, chapters);
    const entry = (text: string) => result.tocEntries.find((e) => e.text === text);
    assert.equal(entry("Formação")?.tier, 1);
    assert.equal(entry("Cursos")?.tier, 2);
    assert.equal(entry("Suporte de vida")?.tier, 3);
    assert.equal(entry("Suporte de vida")?.number, "1.1.1.");
    assert.match(result.document.html, /class="toc-entry toc-depth-4 toc-tier-3"><span class="toc-entry-text"><span class="toc-number">1\.1\.1\.<\/span> Suporte de vida/);
  });

  test("tocDepth 2 stops the Índice at sections", () => {
    const result = mergeDocuments(master, chapters, { tocDepth: 2 });
    assert.ok(!result.tocEntries.some((e) => e.text === "Suporte de vida"));
    assert.ok(result.tocEntries.some((e) => e.text === "Cursos"));
  });

  test("Índice page numbers still fill exactly", () => {
    const result = mergeDocuments(master, chapters);
    const pages = new Map(result.headings.map((h, index) => [h.id, index + 2]));
    const filled = fillTocPageNumbers(result.document.html, pages);
    assert.deepEqual(filled.missingHeadingIds, []);
    const formacao = result.headings.find((h) => h.text === "Formação");
    assert.ok(formacao);
    assert.match(filled.html, new RegExp(`<span class="toc-number">1\\.</span> Formação</span><span class="toc-leader"></span><span class="toc-page">${pages.get(formacao.id)}</span>`));
  });

  test("roman chapters and numbering off are options", () => {
    const roman = mergeDocuments(master, chapters, { sectionNumbering: "roman-chapters" });
    assert.equal(roman.headings.find((h) => h.text === "Publicações")?.number, "II.1.");
    const off = mergeDocuments(master, chapters, { sectionNumbering: "none" });
    assert.ok(off.headings.every((h) => h.number === undefined));
    assert.doesNotMatch(off.document.html, /section-number/);
    // With numbering off the student's own numbers stay.
    assert.ok(off.headings.some((h) => h.text === "3.1. Cursos"));
  });
});
