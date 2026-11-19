import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Document, Packer, Paragraph, Table, TableCell, TableRow } from "docx";
import { designTableHtml, stripCaptionPrefix, TableDesigner, SHORT_TABLE_MAX_ROWS } from "./tables.ts";
import { parseDocxDocument } from "./parseDocx.ts";
import { splitTopLevelBlocks } from "../merge/blocks.ts";
import { buildDocx, paragraph, simpleTable } from "./testFixtures.ts";

const table = (rows: string[][]) =>
  `<table>${rows.map((cells) => `<tr>${cells.map((cell) => `<td><p>${cell}</p></td>`).join("")}</tr>`).join("")}</table>`;

const blocks = (...html: string[]) => html.flatMap((part) => splitTopLevelBlocks(part));

describe("designTableHtml", () => {
  test("promotes the first row of a 3+ column table to a repeating header", () => {
    const html = designTableHtml(table([["Etapa", "Descrição", "Resultado"], ["2013-2019", "Mestrado", "17"], ["2020", "PNA", "88%"]]));
    assert.match(html, /<thead><tr><th scope="col"><p>Etapa<\/p><\/th>/);
    assert.equal((html.match(/<thead>/g) ?? []).length, 1);
    assert.match(html, /<tbody><tr><td><p>2013-2019<\/p><\/td>/);
  });

  test("leaves two-column label/value tables without a header row", () => {
    const html = designTableHtml(table([["Nome", "Rita Inventada"], ["Naturalidade", "Vila Inventada"], ["Cédula", "Fictícia"]]));
    assert.doesNotMatch(html, /<thead>/);
    assert.doesNotMatch(html, /<th/);
  });

  test("does not promote a first row holding numbers", () => {
    const html = designTableHtml(table([["2021", "Bloco", "10"], ["2022", "Dor", "12"], ["2023", "UCI", "8"]]));
    assert.doesNotMatch(html, /<thead>/);
  });

  test("keeps Word's own header row", () => {
    const html = designTableHtml(
      "<table><thead><tr><th><p>A</p></th><th><p>B</p></th></tr></thead><tbody><tr><td><p>x</p></td><td><p>1</p></td></tr></tbody></table>",
    );
    assert.match(html, /<thead><tr><th scope="col"><p>A<\/p><\/th><th scope="col" class="num"><p>B<\/p><\/th><\/tr><\/thead>/);
  });

  test("right-aligns numeric columns, header included, and bolds the Total row", () => {
    const html = designTableHtml(
      table([
        ["Área", "Primeiras", "Total"],
        ["Bloco", "12", "1 204"],
        ["Dor", "—", "35,5%"],
        ["Total", "12", "1 239"],
      ]),
    );
    assert.match(html, /<th scope="col" class="num"><p>Primeiras<\/p><\/th>/);
    assert.match(html, /<td class="num"><p>1 204<\/p><\/td>/);
    assert.match(html, /<td><p>Bloco<\/p><\/td>/);
    assert.match(html, /<tr class="table-total"><td><p>Total<\/p><\/td>/);
  });

  test("a column with any text is not numeric", () => {
    const html = designTableHtml(table([["Ano", "Nota", "Obs"], ["2021", "17", "a"], ["2022", "Apto", "b"]]));
    assert.match(html, /<th scope="col" class="num"><p>Ano<\/p>/);
    assert.match(html, /<th scope="col"><p>Nota<\/p>/);
  });

  test("short tables are kept whole; long ones may split", () => {
    const short = Array.from({ length: SHORT_TABLE_MAX_ROWS }, (_, i) => ["a", "b", String(i)]);
    const long = Array.from({ length: SHORT_TABLE_MAX_ROWS + 1 }, (_, i) => ["a", "b", String(i)]);
    assert.match(designTableHtml(table([["A", "B", "C"], ...short.slice(1)])), /class="designed-table table-keep"/);
    assert.match(designTableHtml(table([["A", "B", "C"], ...long.slice(1)])), /class="designed-table"/);
    assert.doesNotMatch(designTableHtml(table([["A", "B", "C"], ...long])), /table-keep/);
  });

  test("merged cells keep their spans, and column analysis follows the grid", () => {
    const html = designTableHtml(
      "<table><tr><td><p>Área</p></td><td><p>Ato</p></td><td><p>N</p></td></tr>" +
        '<tr><td rowspan="2"><p>Joelho</p></td><td><p>Artroscopia</p></td><td><p>12</p></td></tr>' +
        "<tr><td><p>Prótese</p></td><td><p>7</p></td></tr>" +
        '<tr><td colspan="2"><p>Total</p></td><td><p>19</p></td></tr></table>',
    );
    assert.match(html, /<td rowspan="2"><p>Joelho<\/p><\/td>/);
    assert.match(html, /<tr class="table-total"><td colspan="2"><p>Total<\/p><\/td><td class="num"><p>19<\/p><\/td><\/tr>/);
    // "Prótese" sits in grid column 1 (under the rowspan), so column 2 stays numeric.
    assert.match(html, /<td><p>Prótese<\/p><\/td><td class="num"><p>7<\/p><\/td>/);
    assert.match(html, /<th scope="col" class="num"><p>N<\/p><\/th>/);
  });

  test("leaves a table holding a nested table as it was", () => {
    const nested = `<table><tr><td>${table([["x"]])}</td></tr></table>`;
    assert.equal(designTableHtml(nested), nested.replace("<table>", '<table class="designed-table">'));
  });
});

describe("stripCaptionPrefix", () => {
  test("drops the student's own label and number", () => {
    assert.equal(stripCaptionPrefix("Tabela 1 – Casuística"), "Casuística");
    assert.equal(stripCaptionPrefix("Tabela n.º 12: Cursos"), "Cursos");
    assert.equal(stripCaptionPrefix("Quadro 3. Cronograma do internato"), "Cronograma do internato");
    assert.equal(stripCaptionPrefix("TABELA 2.1 - Resumo"), "Resumo");
    assert.equal(stripCaptionPrefix("Tabela 4"), "");
  });
});

describe("TableDesigner", () => {
  test("moves a caption below the table above it and numbers captions in document order", () => {
    const designer = new TableDesigner();
    const first = designer.designBlocks(blocks("<p>Tabela 7 – Resumo</p>", table([["A", "B", "C"], ["1", "2", "3"]])), "arabic");
    const second = designer.designBlocks(blocks(table([["A", "B", "C"], ["1", "2", "3"]]), "<p>Tabela 1: Casuística</p>"), "arabic");

    assert.equal(first[0].html, '<p id="table-caption-1" class="table-caption"><span class="table-caption-label">Tabela 1.</span> Resumo</p>');
    assert.equal(first[1].tag, "table");
    assert.equal(second[0].tag, "p");
    assert.match(second[0].html, /Tabela 2\.<\/span> Casuística/);
    assert.equal(second[1].tag, "table");
    assert.equal(second.length, 2);
    assert.deepEqual(
      designer.captions.map((caption) => caption.text),
      ["Tabela 1. Resumo", "Tabela 2. Casuística"],
    );
  });

  test("a caption between two tables belongs to the one below it", () => {
    const designer = new TableDesigner();
    const out = designer.designBlocks(
      blocks(table([["a"], ["b"]]), "<p>Tabela 2 – Segunda</p>", table([["c"], ["d"]])),
      "arabic",
    );
    assert.deepEqual(out.map((block) => block.tag), ["table", "p", "table"]);
    assert.equal(designer.captions.length, 1);
    assert.match(out[1].html, /Tabela 1\.<\/span> Segunda/);
  });

  test("uncaptioned tables get no number; prose mentioning a table is not a caption", () => {
    const designer = new TableDesigner();
    const out = designer.designBlocks(
      blocks("<p>Tabela de preços praticados no serviço</p>", table([["A", "B", "C"], ["1", "2", "3"]])),
      "arabic",
    );
    assert.equal(designer.captions.length, 0);
    assert.equal(out[0].html, "<p>Tabela de preços praticados no serviço</p>");
  });

  test("marks a legend right below the table as a note", () => {
    const designer = new TableDesigner();
    const out = designer.designBlocks(
      blocks("<p>Tabela 1 – Casuística</p>", table([["A", "B", "C"], ["1", "2", "3"]]), "<p>Legenda: N – número de doentes.</p>", "<p>Texto seguinte.</p>"),
      "arabic",
    );
    assert.equal(out[2].html, '<p class="table-note">Legenda: N – número de doentes.</p>');
    assert.equal(out[3].html, "<p>Texto seguinte.</p>");
  });

  test("records the page-number sequence of each caption", () => {
    const designer = new TableDesigner();
    designer.designBlocks(blocks("<p>Tabela 1 – A</p>", table([["a"], ["b"]])), "roman");
    designer.designBlocks(blocks("<p>Tabela 2 – B</p>", table([["a"], ["b"]])), "arabic");
    assert.deepEqual(designer.captions.map((caption) => caption.numbering), ["roman", "arabic"]);
  });

  test("escapes caption text", () => {
    const designer = new TableDesigner();
    const out = designer.designBlocks(blocks("<p>Tabela 1 – A &lt;b&gt; &amp; C</p>", table([["a"], ["b"]])), "arabic");
    assert.match(out[0].html, /A &lt;b&gt; &amp; C<\/p>$/);
  });
});

describe("through mammoth", () => {
  test("Word merged cells and a Caption-styled paragraph survive parsing and design", async () => {
    const cell = (text: string, extra: object = {}) => new TableCell({ children: [new Paragraph(text)], ...extra });
    const buffer = await Packer.toBuffer(
      new Document({
        styles: { paragraphStyles: [{ id: "Caption", name: "caption", run: {} }] },
        sections: [
          {
            children: [
              new Paragraph({ style: "Caption", text: "Casuística por área" }),
              new Table({
                rows: [
                  new TableRow({ tableHeader: true, children: [cell("Área"), cell("Ato"), cell("N")] }),
                  new TableRow({ children: [cell("Joelho", { rowSpan: 2 }), cell("Artroscopia"), cell("12")] }),
                  new TableRow({ children: [cell("Prótese"), cell("7")] }),
                  new TableRow({ children: [cell("Total", { columnSpan: 2 }), cell("19")] }),
                ],
              }),
            ],
          },
        ],
      }),
    );
    const parsed = await parseDocxDocument(buffer);
    const designer = new TableDesigner();
    const out = designer.designBlocks(splitTopLevelBlocks(parsed.html), "arabic").map((block) => block.html).join("");

    assert.equal(designer.captions[0]?.text, "Tabela 1. Casuística por área");
    assert.match(out, /rowspan="2"/);
    assert.match(out, /<tr class="table-total"><td colspan="2"><p>Total<\/p><\/td><td class="num"><p>19<\/p><\/td><\/tr>/);
    assert.match(out, /<thead><tr><th scope="col"><p>Área<\/p><\/th>/);
  });

  test("a plain docx table comes out designed", async () => {
    const parsed = await parseDocxDocument(
      await buildDocx([paragraph("Tabela 1 – Percurso"), simpleTable([["Etapa", "Descrição", "Resultado"], ["2013-2019", "Mestrado", "17"], ["2020", "PNA", "88%"]])]),
    );
    const out = new TableDesigner().designBlocks(splitTopLevelBlocks(parsed.html), "arabic");
    assert.equal(out.length, 2);
    assert.match(out[1].html, /^<table class="designed-table table-keep"><thead>/);
  });
});
