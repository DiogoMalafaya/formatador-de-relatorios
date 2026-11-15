import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  formatSupportedSpecialtiesPt,
  getSupportedSpecialties,
  isSupportedSpecialty,
  needsSpecialtyReselection,
  getSpecialties,
  getSpecialtyById,
  resolveRuleSetId,
  HOUSE_RULE_SET_ID,
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
    test("falls back to the house standard when a specialty has no profile yet", () => {
      assert.equal(resolveRuleSetId("cardiologia"), HOUSE_RULE_SET_ID);
    });

    test("resolves Pediatria to its own profile", () => {
      assert.equal(resolveRuleSetId("pediatria"), "pediatria");
    });

    test("returns the specialty's own rule set when one exists", () => {
      assert.equal(
        resolveRuleSetId("medicina-fisica-e-de-reabilitacao"),
        "mfr",
      );
    });

    test("falls back to the house standard for an unknown specialty id", () => {
      assert.equal(resolveRuleSetId("not-a-real-specialty"), HOUSE_RULE_SET_ID);
    });
  });

  describe("supported specialties (DIO-44)", () => {
    test("are exactly the six with a sourced norm profile", () => {
      assert.deepEqual(
        getSupportedSpecialties().map((specialty) => specialty.id),
        [
          "anestesiologia",
          "cirurgia-geral",
          "medicina-fisica-e-de-reabilitacao",
          "oftalmologia",
          "ortopedia",
          "pediatria",
        ],
      );
    });

    test("isSupportedSpecialty rejects listed-but-unprofiled and unknown ids", () => {
      assert.equal(isSupportedSpecialty("pediatria"), true);
      assert.equal(isSupportedSpecialty("cardiologia"), false);
      assert.equal(isSupportedSpecialty("not-a-real-specialty"), false);
    });

    test("only an unpaid session with an unsupported specialty must re-select", () => {
      const unpaid = { status: "unpaid" };
      assert.equal(needsSpecialtyReselection({ specialtyId: "cardiologia", payment: unpaid }), true);
      assert.equal(needsSpecialtyReselection({ specialtyId: "pediatria", payment: unpaid }), false);
      assert.equal(needsSpecialtyReselection({ payment: unpaid }), false);
      assert.equal(
        needsSpecialtyReselection({ specialtyId: "cardiologia", payment: { status: "paid" } }),
        false,
        "a paid session is never blocked from its download",
      );
    });

    test("formats the supported list as pt-PT prose", () => {
      assert.equal(
        formatSupportedSpecialtiesPt(),
        "Anestesiologia, Cirurgia Geral, Medicina Física e de Reabilitação, Oftalmologia, Ortopedia e Pediatria",
      );
    });
  });
});
