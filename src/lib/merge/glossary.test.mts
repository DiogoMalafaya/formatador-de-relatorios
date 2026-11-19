import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { convertAbbreviationLists, parseGlossaryEntry } from "./glossary.ts";
import { splitTopLevelBlocks } from "./blocks.ts";

const blocks = (html: string) => splitTopLevelBlocks(html);

describe("abbreviations as a glossary (DIO-50)", () => {
  test("splits the common separators", () => {
    assert.deepEqual(parseGlossaryEntry("HUI – Hospital Universitário Imaginário"), { term: "HUI", expansion: "Hospital Universitário Imaginário" });
    assert.deepEqual(parseGlossaryEntry("UCI: Unidade de Cuidados Intensivos"), { term: "UCI", expansion: "Unidade de Cuidados Intensivos" });
    assert.deepEqual(parseGlossaryEntry("PNA - Prova Nacional de Acesso"), { term: "PNA", expansion: "Prova Nacional de Acesso" });
    assert.deepEqual(parseGlossaryEntry("Dr.ª — Doutora"), { term: "Dr.ª", expansion: "Doutora" });
    assert.equal(parseGlossaryEntry("Uma frase comprida sem separador nenhum"), undefined);
    assert.equal(parseGlossaryEntry("Isto é uma frase longa – com um travessão"), undefined, "a term is at most three words");
  });

  test("converts a section whose every line parses, paragraphs or list items", () => {
    const fromParagraphs = convertAbbreviationLists(
      blocks("<h1>Lista de Abreviaturas e Siglas</h1><p>HUI – Hospital X</p><p>SNF – Serviço Y</p><h1>Índice</h1>"),
    );
    assert.deepEqual(fromParagraphs.map((block) => block.tag), ["h1", "dl", "h1"]);
    assert.equal(fromParagraphs[1].html, '<dl class="glossary">\n<dt>HUI</dt><dd>Hospital X</dd>\n<dt>SNF</dt><dd>Serviço Y</dd>\n</dl>');

    const fromList = convertAbbreviationLists(blocks("<h1>Siglas</h1><ul><li>A – Alfa</li><li>B – Beta &amp; Gama</li></ul>"));
    assert.match(fromList[1].html, /<dt>B<\/dt><dd>Beta &amp; Gama<\/dd>/);
  });

  test("leaves a section with any unreadable line exactly as written", () => {
    const html = "<h1>Abreviaturas</h1><p>HUI – Hospital X</p><p>Ver também o anexo final do documento.</p>";
    assert.deepEqual(convertAbbreviationLists(blocks(html)), blocks(html));
  });

  test("stops at a merge fence and leaves other sections alone", () => {
    const out = convertAbbreviationLists([
      ...blocks("<h1>Siglas</h1><p>A – Alfa</p><p>B – Beta</p>"),
      { tag: "#fence", html: "<!--x-->" },
      ...blocks("<h1>Lista de Tabelas</h1><p>Tabela 1 – Algo</p>"),
    ]);
    assert.deepEqual(out.map((block) => block.tag), ["h1", "dl", "#fence", "h1", "p"]);
  });
});
