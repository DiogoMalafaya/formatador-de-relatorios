import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FigureDesigner, isFigureBlock } from "./figures.ts";
import { TableDesigner } from "./tables.ts";
import { splitTopLevelBlocks } from "../merge/blocks.ts";

const figure = '<p><img src="data:image/png;base64,AA" /></p>';
const blocks = (...html: string[]) => html.flatMap((part) => splitTopLevelBlocks(part));
const tags = (out: { html: string }[]) =>
  out.map((block) => (block.html.includes("figure-caption") ? "caption" : block.html.includes("<img") ? "figure" : "p"));

describe("FigureDesigner", () => {
  test("a figure is a paragraph holding only images", () => {
    assert.equal(isFigureBlock(splitTopLevelBlocks(figure)[0]), true);
    assert.equal(isFigureBlock(splitTopLevelBlocks('<p>Logo <img src="x" /></p>')[0]), false);
  });

  test("keeps a caption below, moves one above to below, and numbers in document order", () => {
    const designer = new FigureDesigner();
    const first = designer.designBlocks(blocks(figure, "<p>Figura 4 – Distribuição</p>"), "arabic");
    const second = designer.designBlocks(blocks("<p>Gráfico 1: Evolução anual</p>", figure, "<p>Texto.</p>"), "arabic");

    assert.deepEqual(tags(first), ["figure", "caption"]);
    assert.deepEqual(tags(second), ["figure", "caption", "p"]);
    assert.deepEqual(
      designer.captions.map((caption) => caption.text),
      ["Figura 1. Distribuição", "Figura 2. Evolução anual"],
    );
    assert.match(first[0].html, /^<p class="figure">/);
    assert.equal(
      first[1].html,
      '<p id="figure-caption-1" class="figure-caption"><span class="figure-caption-label">Figura 1.</span> Distribuição</p>',
    );
  });

  test("between two figures, a caption belongs to the one above it", () => {
    const designer = new FigureDesigner();
    const out = designer.designBlocks(blocks(figure, "<p>Figura 1 – A</p>", figure), "arabic");
    assert.deepEqual(tags(out), ["figure", "caption", "figure"]);
    assert.equal(designer.captions.length, 1);
  });

  test("uncaptioned figures get no number; prose about an image isn't a caption", () => {
    const designer = new FigureDesigner();
    const out = designer.designBlocks(blocks("<p>Imagem de marca do serviço</p>", figure), "arabic");
    assert.equal(designer.captions.length, 0);
    assert.deepEqual(tags(out), ["p", "figure"]);
  });

  test("a Caption-styled paragraph goes to the table or the figure it names", () => {
    const tables = new TableDesigner();
    const figures = new FigureDesigner();
    const source = blocks(
      '<p class="caption">Figura 1 – Logótipo</p>',
      "<table><tr><td><p>a</p></td></tr><tr><td><p>b</p></td></tr></table>",
      figure,
    );
    figures.designBlocks(tables.designBlocks(source, "arabic"), "arabic");
    assert.equal(tables.captions.length, 0, "a caption naming a figure isn't a table's");
    assert.deepEqual(figures.captions.map((caption) => caption.text), []);
  });
});
