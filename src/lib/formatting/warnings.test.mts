import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  imageDetectedWarning,
  pageLimitExceededWarning,
  pageLimitPossiblyExceededWarning,
  resumoTooLongWarning,
  tablePresentWarning,
  unsupportedStructureWarning,
  withSourceFilename,
} from "./warnings.ts";

describe("formatting warnings", () => {
  test("image warning pluralises correctly", () => {
    assert.match(imageDetectedWarning(1).messagePt, /1 imagem\./);
    assert.match(imageDetectedWarning(3).messagePt, /3 imagens\./);
  });

  test("table warning pluralises correctly", () => {
    assert.match(tablePresentWarning(1).messagePt, /1 tabela\./);
    assert.match(tablePresentWarning(2).messagePt, /2 tabelas\./);
  });

  test("unsupported structure warning includes the detail, preserves content", () => {
    const warning = unsupportedStructureWarning("tabela aninhada");
    assert.match(warning.messagePt, /tabela aninhada/);
    assert.match(warning.messagePt, /conteúdo original foi preservado/);
  });

  test("page limit warning states both the estimate and the limit", () => {
    const warning = pageLimitPossiblyExceededWarning(85, 80);
    assert.match(warning.messagePt, /~85/);
    assert.match(warning.messagePt, /80 páginas/);
  });

  test("every warning carries a stable code for tests and future logic", () => {
    assert.equal(imageDetectedWarning(1).code, "image-detected");
    assert.equal(tablePresentWarning(1).code, "table-present");
    assert.equal(unsupportedStructureWarning("x").code, "unsupported-structure");
    assert.equal(pageLimitPossiblyExceededWarning(1, 1).code, "page-limit-possibly-exceeded");
  });

  describe("cross-document attribution (DIO-42, US10)", () => {
    test("names the source file in both the field and the pt-PT copy", () => {
      const attributed = withSourceFilename(imageDetectedWarning(2), "SIJ.docx");

      assert.equal(attributed.sourceFilename, "SIJ.docx");
      assert.match(attributed.messagePt, /^Em «SIJ\.docx»: /);
      assert.match(attributed.messagePt, /2 imagens/, "the original finding survives the prefix");
    });

    test("preserves the code so downstream logic still groups findings", () => {
      assert.equal(withSourceFilename(tablePresentWarning(1), "DM.docx").code, "table-present");
    });

    test("does not mutate the warning it attributes", () => {
      const original = imageDetectedWarning(1);
      const before = original.messagePt;

      withSourceFilename(original, "PF.docx");

      assert.equal(original.messagePt, before);
      assert.equal(original.sourceFilename, undefined);
    });
  });

  describe("exact-count warnings from the paginated render (DIO-42)", () => {
    test("page-limit warning states the real count, not an estimate", () => {
      const warning = pageLimitExceededWarning(84, 80);

      assert.equal(warning.code, "page-limit-exceeded");
      assert.match(warning.messagePt, /84 páginas/);
      assert.match(warning.messagePt, /80/);
      assert.doesNotMatch(warning.messagePt, /~|estimativa/, "an exact count never hedges");
    });

    test("resumo warning states the span and the cap", () => {
      const warning = resumoTooLongWarning(4, 2);

      assert.equal(warning.code, "resumo-too-long");
      assert.match(warning.messagePt, /4 páginas/);
      assert.match(warning.messagePt, /2/);
    });
  });
});
