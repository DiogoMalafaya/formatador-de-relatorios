import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectSourceCover, isFrontMatterTitle, splitMasterAfterToc } from "./frontMatter.ts";
import type { HtmlBlock } from "./blocks.ts";

// Invented content only — see testFixtures.ts.
const p = (text: string): HtmlBlock => ({ tag: "p", html: `<p>${text}</p>` });
const h = (level: number, text: string): HtmlBlock => ({ tag: `h${level}`, html: `<h${level}>${text}</h${level}>` });

describe("isFrontMatterTitle", () => {
  for (const title of [
    "Lista de Abreviaturas e Siglas",
    "LISTA DE ABREVIATURAS",
    "Siglas e acrónimos",
    "Índice de Tabelas",
    "Índice de figuras",
    "Lista de quadros",
    "Nota prévia",
    "Agradecimentos",
    "Dedicatória",
  ]) {
    test(`recognises "${title}"`, () => assert.equal(isFrontMatterTitle(title), true));
  }

  for (const title of ["Identificação", "Resumo do currículo", "Percurso formativo", "Atividade Científica"]) {
    test(`leaves body title "${title}" alone`, () => assert.equal(isFrontMatterTitle(title), false));
  }
});

describe("splitMasterAfterToc", () => {
  test("keeps leading front-matter sections, starts the body at the first other section", () => {
    const blocks = [
      h(1, "Lista de abreviaturas"),
      p("AVC – Acidente vascular cerebral"),
      h(1, "Lista de tabelas"),
      p("Tabela 1 – Casuística"),
      h(1, "Identificação"),
      p("Nome: Pessoa Inventada"),
      h(1, "Agradecimentos"),
      p("Já no corpo, por isso fica no corpo."),
    ];
    const split = splitMasterAfterToc(blocks);
    assert.equal(split.frontMatter.length, 4);
    assert.equal(split.body.length, 4);
    assert.equal(split.body[0].html, "<h1>Identificação</h1>");
  });

  test("everything after the Índice is front matter when every section is", () => {
    const blocks = [h(1, "Siglas"), p("UCI – Unidade de Cuidados Intensivos")];
    assert.deepEqual(splitMasterAfterToc(blocks), { frontMatter: blocks, body: [] });
  });

  test("classifies by the shallowest heading level present", () => {
    const blocks = [h(2, "Lista de abreviaturas"), h(3, "Identificação"), h(2, "Formação")];
    const split = splitMasterAfterToc(blocks);
    assert.equal(split.frontMatter.length, 2, "an h3 inside a front-matter section stays with it");
    assert.equal(split.body[0].html, "<h2>Formação</h2>");
  });
});

describe("detectSourceCover", () => {
  test("finds a cover run and its name line", () => {
    const blocks = [
      p("Beatriz Fictícia Andrade"),
      p("Curriculum Vitae"),
      p("Internato Médico de Pediatria"),
      p("Hospital Inventado, 2021-2026"),
      h(1, "Nota prévia"),
    ];
    assert.deepEqual(detectSourceCover(blocks), { blockCount: 4, candidateName: "Beatriz Fictícia Andrade" });
  });

  test("accepts Vitæ and a name that comes after the title line", () => {
    const blocks = [p("CURRICULUM VITÆ"), p("Rui Inventado Sousa"), h(1, "Índice")];
    assert.deepEqual(detectSourceCover(blocks), { blockCount: 2, candidateName: "Rui Inventado Sousa" });
  });

  test("leaves a leading run alone when it never says Curriculum Vitae", () => {
    assert.equal(detectSourceCover([p("Aos meus pais."), h(1, "Índice")]), undefined);
  });

  test("leaves long prose alone even if it mentions Curriculum Vitae", () => {
    const long = "Este curriculum vitae descreve ".repeat(10);
    assert.equal(detectSourceCover([p(long), h(1, "Índice")]), undefined);
  });

  test("a master that opens on a heading has no source cover", () => {
    assert.equal(detectSourceCover([h(1, "Dedicatória"), p("Curriculum Vitae")]), undefined);
  });
});
