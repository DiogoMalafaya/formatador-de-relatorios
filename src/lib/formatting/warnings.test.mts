import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  imageLowResolutionWarning,
  imageOmittedWarning,
  pageLimitExceededWarning,
  pageLimitPossiblyExceededWarning,
  summaryTooLongWarning,
  tablePresentWarning,
  unsupportedStructureWarning,
  withSourceFilename,
} from "./warnings.ts";

describe("formatting warnings", () => {
  test("an omitted image is named by position and the Colégio whose norms forbid it", () => {
    const warning = imageOmittedWarning(2, "Colégio de Medicina Física e de Reabilitação");
    assert.match(warning.messagePt, /^Removemos a 2\.ª imagem deste documento: as normas do Colégio de Medicina Física e de Reabilitação/);
  });

  test("a low-resolution image names its page when the render knows it", () => {
    assert.match(imageLowResolutionWarning(1, 96, "12").messagePt, /^A 1\.ª imagem deste documento \(na página 12\) tem pouca resolução.*cerca de 96 ppp/);
    assert.doesNotMatch(imageLowResolutionWarning(1, 96).messagePt, /página/);
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
    assert.equal(imageOmittedWarning(1, "x").code, "image-omitted");
    assert.equal(imageLowResolutionWarning(1, 1).code, "image-low-resolution");
    assert.equal(tablePresentWarning(1).code, "table-present");
    assert.equal(unsupportedStructureWarning("x").code, "unsupported-structure");
    assert.equal(pageLimitPossiblyExceededWarning(1, 1).code, "page-limit-possibly-exceeded");
  });

  describe("cross-document attribution (DIO-42, US10)", () => {
    test("names the source file in both the field and the pt-PT copy", () => {
      const attributed = withSourceFilename(imageOmittedWarning(2, "Colégio de MFR"), "SIJ.docx");

      assert.equal(attributed.sourceFilename, "SIJ.docx");
      assert.match(attributed.messagePt, /^Em «SIJ\.docx»: /);
      assert.match(attributed.messagePt, /2\.ª imagem/, "the original finding survives the prefix");
    });

    test("preserves the code so downstream logic still groups findings", () => {
      assert.equal(withSourceFilename(tablePresentWarning(1), "DM.docx").code, "table-present");
    });

    test("does not mutate the warning it attributes", () => {
      const original = imageOmittedWarning(1, "Colégio de MFR");
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

    test("summary-section warning names the section, the span and the cap", () => {
      const warning = summaryTooLongWarning("A síntese curricular", 4, 3);

      assert.equal(warning.code, "summary-section-too-long");
      assert.match(warning.messagePt, /^A síntese curricular ocupa 4 páginas/);
      assert.match(warning.messagePt, /no máximo 3/);
    });
  });
});
