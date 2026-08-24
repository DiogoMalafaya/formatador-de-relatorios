import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseDocxDocument } from "./parseDocx.ts";
import {
  bulletItem,
  buildDocx,
  heading,
  imageParagraph,
  nestedTable,
  paragraph,
  simpleTable,
} from "./testFixtures.ts";

describe("parseDocxDocument", () => {
  test("preserves heading hierarchy", async () => {
    const buffer = await buildDocx([
      heading(1, "Formação"),
      heading(2, "Estágios"),
      heading(3, "Internato"),
    ]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(parsed.headingCounts.h1, 1);
    assert.equal(parsed.headingCounts.h2, 1);
    assert.equal(parsed.headingCounts.h3, 1);
    assert.match(parsed.html, /<h1>Formação<\/h1>/);
    assert.match(parsed.html, /<h2>Estágios<\/h2>/);
    assert.match(parsed.html, /<h3>Internato<\/h3>/);
  });

  test("Portuguese diacritics survive parsing", async () => {
    const text = "Não há dúvida: história clínica, secção, formação e avaliação.";
    const buffer = await buildDocx([paragraph(text)]);
    const parsed = await parseDocxDocument(buffer);
    assert.match(parsed.html, /Não há dúvida: história clínica, secção, formação e avaliação\./);
  });

  test("preserves list content", async () => {
    const buffer = await buildDocx([bulletItem("Primeiro item"), bulletItem("Segundo item")]);
    const parsed = await parseDocxDocument(buffer);
    assert.match(parsed.html, /<li>Primeiro item<\/li>/);
    assert.match(parsed.html, /<li>Segundo item<\/li>/);
  });

  test("counts a top-level table and preserves its content", async () => {
    const buffer = await buildDocx([simpleTable([["Ano", "Rotação"], ["1", "Medicina Interna"]])]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(parsed.tableCount, 1);
    assert.match(parsed.html, /<table>/);
    assert.match(parsed.html, /Medicina Interna/);
  });

  test("no tables in a document without one", async () => {
    const buffer = await buildDocx([paragraph("Sem tabelas aqui.")]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(parsed.tableCount, 0);
  });

  test("flags a nested table as an unsupported structure, without counting it as top-level", async () => {
    const buffer = await buildDocx([nestedTable()]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(parsed.tableCount, 1);
    assert.ok(
      parsed.unsupportedStructures.some((s) => /tabela aninhada/.test(s)),
      `expected a nested-table warning, got: ${JSON.stringify(parsed.unsupportedStructures)}`,
    );
  });

  test("counts an embedded image and keeps it in the output (warn, don't strip)", async () => {
    const buffer = await buildDocx([imageParagraph()]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(parsed.imageCount, 1);
    assert.match(parsed.html, /<img src="data:image\/png;base64,/);
  });

  test("word count reflects visible text only, not markup", async () => {
    const buffer = await buildDocx([heading(1, "Título"), paragraph("um dois três quatro")]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(parsed.wordCount, 5);
  });
});
