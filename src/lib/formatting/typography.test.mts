import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_TYPOGRAPHY_CSS,
  applyBodyTypography,
  boldFieldLabels,
  hyphenateProse,
  hyphenateText,
} from "./typography.ts";
import { getRuleSet } from "./ruleSet.ts";
import { buildRuleSetCss } from "./styles.ts";

const SHY = "­";
const visible = (text: string) => text.replaceAll(SHY, "-");

describe("hyphenateText", () => {
  test("adds Portuguese break points to long lowercase words", () => {
    assert.equal(visible(hyphenateText("reabilitação")), "re-a-bi-li-ta-ção");
    assert.equal(visible(hyphenateText("desenvolvimento")), "de-sen-vol-vi-mento");
  });

  test("never leaves fewer than 2 letters before or 3 after a break", () => {
    for (const word of ["abrigo", "otorrinolaringologia", "hospitalar", "internacional"]) {
      for (const [index, part] of hyphenateText(word).split(SHY).entries()) {
        if (index === 0) assert.ok(part.length >= 2, `${word}: prefix ${part}`);
      }
      const parts = hyphenateText(word).split(SHY);
      assert.ok(parts[parts.length - 1].length >= 3, `${word}: suffix`);
      assert.equal(hyphenateText(word).replaceAll(SHY, ""), word);
    }
  });

  test("leaves short words, names, addresses and numbers alone", () => {
    for (const text of ["casa", "Lisboa", "Hospital", "SPMFR", "joana@exemplo.pt", "www.exemplo.pt/internato", "2019/2020"]) {
      assert.equal(hyphenateText(text), text);
    }
  });

  test("keeps whitespace and punctuation exactly", () => {
    const text = "  consulta externa,\tenfermaria e urgência.  ";
    assert.equal(hyphenateText(text).replaceAll(SHY, ""), text);
  });
});

describe("hyphenateProse", () => {
  test("hyphenates classless paragraphs and list items", () => {
    const out = hyphenateProse("<p>reabilitação</p><ul><li>desenvolvimento</li></ul>");
    assert.equal(out.split(SHY).length - 1, 9);
  });

  test("leaves headings, tables, captions and links untouched", () => {
    const html =
      '<h2>reabilitação</h2><table><tr><td><p>reabilitação</p></td></tr></table>' +
      '<p class="table-caption">reabilitação</p><p><a href="#x">reabilitação</a></p>';
    assert.equal(hyphenateProse(html), html);
  });

  test("leaves generated, classed inline text alone (the omitted-image placeholder)", () => {
    const html = '<p><span class="omitted-image">Imagem removida — as normas não permitem fotografias</span></p>';
    assert.equal(hyphenateProse(html), html);
  });

  test("never touches tags or attributes", () => {
    const html = '<p><strong data-note="reabilitação">reabilitação</strong></p>';
    const out = hyphenateProse(html);
    assert.ok(out.startsWith('<p><strong data-note="reabilitação">'));
    assert.equal(out.replaceAll(SHY, ""), html);
  });
});

describe("boldFieldLabels", () => {
  test("bolds labels in a run of field lines", () => {
    const html = "<p>Nome: Joana Exemplo</p><p>Data de nascimento: 1 de janeiro</p><p>Naturalidade: Lisboa</p>";
    assert.equal(
      boldFieldLabels(html),
      '<p><strong class="field-label">Nome:</strong> Joana Exemplo</p>' +
        '<p><strong class="field-label">Data de nascimento:</strong> 1 de janeiro</p>' +
        '<p><strong class="field-label">Naturalidade:</strong> Lisboa</p>',
    );
  });

  test("works on list items too (course entries)", () => {
    const html = "<ul><li>Local: Hospital Fictício</li><li>Duração: 20 horas</li></ul>";
    assert.match(boldFieldLabels(html), /<li><strong class="field-label">Local:<\/strong> Hospital/);
    assert.match(boldFieldLabels(html), /<li><strong class="field-label">Duração:<\/strong> 20/);
  });

  test("a lone label-like line is prose, not a field", () => {
    const html = "<p>Realizei as seguintes atividades: consulta e enfermaria.</p><p>Texto corrido sem rótulo.</p>";
    assert.equal(boldFieldLabels(html), html);
  });

  test("ignores long labels, times, addresses and lines without a value", () => {
    for (const html of [
      "<p>Durante este período eu realizei muitas coisas: a</p><p>Nome: B</p>",
      "<p>Às 10:30 houve reunião</p><p>Nome: B</p>",
      "<p>Ver http://exemplo.pt</p><p>Nome: B</p>",
      "<p>Formação:</p><p>Nome: B</p>",
    ]) {
      assert.equal(boldFieldLabels(html), html, html);
    }
  });

  test("leaves lines that are already bold or classed alone", () => {
    const html = '<p><strong>Nome:</strong> A</p><p class="caption">Nome: B</p>';
    assert.equal(boldFieldLabels(html), html);
  });
});

describe("applyBodyTypography", () => {
  test("bolds labels and hyphenates values", () => {
    const out = applyBodyTypography("<p>Local: reabilitação</p><p>Duração: semanas</p>");
    assert.match(out, /<strong class="field-label">Local:<\/strong> re­a/);
  });
});

describe("body typography CSS", () => {
  test("justifies prose and replaces blank lines with a small gap", () => {
    assert.match(BODY_TYPOGRAPHY_CSS, /text-align: justify/);
    assert.match(BODY_TYPOGRAPHY_CSS, /:where\(p:not\(\[class\]\)\) \{ margin: 0 0 0\.5em; \}/);
    assert.match(BODY_TYPOGRAPHY_CSS, /:where\(li:not\(\[class\]\)\) \{ margin: 0; \}/);
  });

  test("explicit profiles keep their size and line spacing", () => {
    const mfr = buildRuleSetCss(getRuleSet("mfr"), { fontFamily: "Arial", titleSizePt: 14 });
    assert.match(mfr, /font-size: 12pt;[^}]*line-height: 1\.5;/);
    const pediatria = buildRuleSetCss(getRuleSet("pediatria"), { fontFamily: "Verdana", titleSizePt: 12 });
    assert.match(pediatria, /font-size: 10pt;[^}]*line-height: 1\.5;/);
    assert.ok(mfr.includes(BODY_TYPOGRAPHY_CSS));
    // Nothing in the body typography sets a size or a line height.
    assert.doesNotMatch(BODY_TYPOGRAPHY_CSS, /font-size|line-height/);
  });
});
