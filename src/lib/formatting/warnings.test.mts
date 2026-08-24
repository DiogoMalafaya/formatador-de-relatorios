import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  imageDetectedWarning,
  pageLimitPossiblyExceededWarning,
  tablePresentWarning,
  unsupportedStructureWarning,
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
});
