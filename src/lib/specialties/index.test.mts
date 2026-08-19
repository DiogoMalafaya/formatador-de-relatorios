import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getSpecialties,
  getSpecialtyById,
  resolveRuleSetId,
  GENERIC_RULE_SET_ID,
} from "./index.ts";

describe("specialties", () => {
  test("list is non-empty", () => {
    assert.ok(getSpecialties().length > 0);
  });

  test("every id is unique", () => {
    const ids = getSpecialties().map((specialty) => specialty.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("list is alphabetically ordered by name (pt-PT collation)", () => {
    // ignorePunctuation matters: without it, a hyphen in "Neuro-Radiologia"
    // sorts as a word break and moves it ahead of "Neurologia", which
    // disagrees with how the source (Ordem dos Médicos) actually orders it.
    const collator = new Intl.Collator("pt-PT", { ignorePunctuation: true });
    const names = getSpecialties().map((specialty) => specialty.name);
    const sorted = [...names].sort((a, b) => collator.compare(a, b));
    assert.deepEqual(names, sorted);
  });

  test("getSpecialtyById finds a known specialty", () => {
    const specialty = getSpecialtyById("pediatria");
    assert.equal(specialty?.name, "Pediatria");
  });

  test("getSpecialtyById returns undefined for an unknown id", () => {
    assert.equal(getSpecialtyById("not-a-real-specialty"), undefined);
  });

  describe("resolveRuleSetId", () => {
    test("falls back to the generic rule set when a specialty has no override", () => {
      assert.equal(resolveRuleSetId("pediatria"), GENERIC_RULE_SET_ID);
    });

    test("returns the specialty's own rule set when one exists", () => {
      assert.equal(
        resolveRuleSetId("medicina-fisica-e-de-reabilitacao"),
        "mfr",
      );
    });

    test("falls back to the generic rule set for an unknown specialty id", () => {
      assert.equal(resolveRuleSetId("not-a-real-specialty"), GENERIC_RULE_SET_ID);
    });
  });
});
