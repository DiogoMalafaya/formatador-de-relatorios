import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { HOUSE_RULE_SET_ID, getAllRuleSets, getRuleSet, printMargins } from "./ruleSet.ts";
import { getSpecialties } from "../specialties/index.ts";

const LAUNCH_SPECIALTIES = [
  "anestesiologia",
  "cirurgia-geral",
  "medicina-fisica-e-de-reabilitacao",
  "oftalmologia",
  "ortopedia",
  "pediatria",
];

describe("norm profiles", () => {
  test("every profile other than the house standard cites a source on ordemdosmedicos.pt", () => {
    for (const ruleSet of getAllRuleSets()) {
      if (ruleSet.id === HOUSE_RULE_SET_ID) continue;
      assert.ok(ruleSet.sources.length > 0, `${ruleSet.id} has no source`);
      for (const source of ruleSet.sources) {
        assert.match(source.url, /^https:\/\/ordemdosmedicos\.pt\//, `${ruleSet.id}: ${source.url}`);
        assert.ok(source.versionPt.length > 0, `${ruleSet.id} source has no version`);
      }
      assert.match(ruleSet.retrievedOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(ruleSet.provenancePt.length > 0);
    }
  });

  test("every launch specialty resolves to its own sourced profile", () => {
    const byId = new Map(getSpecialties().map((specialty) => [specialty.id, specialty]));
    for (const id of LAUNCH_SPECIALTIES) {
      const ruleSetId = byId.get(id)?.ruleSetId;
      assert.ok(ruleSetId, `${id} has no profile`);
      const ruleSet = getRuleSet(ruleSetId);
      assert.equal(ruleSet.id, ruleSetId, `${id} fell back instead of resolving`);
      assert.ok(ruleSet.sources.length > 0);
    }
  });

  test("an unknown id gets the house standard, never another Colégio's norms", () => {
    const ruleSet = getRuleSet("nonexistent-specialty");
    assert.equal(ruleSet.id, HOUSE_RULE_SET_ID);
    assert.equal(ruleSet.constraints.imagesForbidden, false);
    assert.equal(ruleSet.constraints.maxPages, undefined);
  });
});

describe("MFR profile", () => {
  const mfr = getRuleSet("mfr");

  test("is explicit and cites both the 2013 norms and the 2018 amendment", () => {
    assert.equal(mfr.kind, "explicit");
    assert.equal(mfr.sources.length, 2);
    assert.match(mfr.sources[1].versionPt, /3\.12\.2018/);
  });

  test("caps the CV at 100 pages, per the 3.12.2018 amendment (was 80)", () => {
    assert.equal(mfr.constraints.maxPages, 100);
  });

  test("keeps the Secção A parameters", () => {
    assert.equal(mfr.font.sizePt, 12);
    assert.equal(mfr.font.color, "black");
    assert.deepEqual([...mfr.font.family.options].sort(), ["Arial", "Times New Roman"]);
    assert.equal(mfr.font.family.default, "Times New Roman");
    assert.deepEqual([...mfr.title.sizePt.options].sort(), [12, 14]);
    assert.equal(mfr.lineSpacing, 1.5);
    assert.deepEqual(mfr.margins, { topCm: 2.5, rightCm: 2.5, bottomCm: 2.5, leftCm: 2.5 });
    assert.equal(mfr.constraints.imagesForbidden, true);
    assert.equal(mfr.constraints.summarySection?.maxPages, 2);
    assert.equal(mfr.page.delivery, "print");
  });
});

describe("Pediatria profile", () => {
  const pediatria = getRuleSet("pediatria");

  test("applies Verdana 10, 1.5 spacing and 2.5/3cm margins", () => {
    assert.equal(pediatria.kind, "explicit");
    assert.deepEqual([...pediatria.font.family.options], ["Verdana"]);
    assert.equal(pediatria.font.sizePt, 10);
    assert.equal(pediatria.lineSpacing, 1.5);
    assert.deepEqual(pediatria.margins, { topCm: 2.5, rightCm: 3, bottomCm: 2.5, leftCm: 3 });
  });

  test("caps the síntese curricular at 3 pages and is delivered as PDF", () => {
    assert.equal(pediatria.constraints.summarySection?.maxPages, 3);
    assert.ok(pediatria.constraints.summarySection?.headingPattern.test("sintese curricular"));
    assert.equal(pediatria.page.delivery, "pdf");
  });

  test("is silent on images and an overall page cap, so neither is restricted", () => {
    assert.ok(pediatria.silentOn.includes("images"));
    assert.equal(pediatria.constraints.imagesForbidden, false);
    assert.equal(pediatria.constraints.maxPages, undefined);
  });
});

describe("Oftalmologia profile", () => {
  test("is a template profile carrying the template's character limits", () => {
    const oftalmologia = getRuleSet("oftalmologia");
    assert.equal(oftalmologia.kind, "template");
    const preambulo = oftalmologia.sectionLimits?.find((limit) => limit.titlePt === "Preâmbulo");
    assert.equal(preambulo?.maxCharactersNoSpaces, 2000);
  });
});

describe("no-norms profiles", () => {
  for (const id of ["anestesiologia", "cirurgia-geral", "ortopedia"]) {
    test(`${id} uses the house standard and says so`, () => {
      const ruleSet = getRuleSet(id);
      const house = getRuleSet(HOUSE_RULE_SET_ID);
      assert.equal(ruleSet.kind, "none");
      assert.match(ruleSet.provenancePt, /não publica normas/);
      assert.match(ruleSet.provenancePt, /padrão Lauda/);
      assert.deepEqual(ruleSet.font, house.font);
      assert.deepEqual(ruleSet.constraints, house.constraints);
    });
  }
});

describe("printMargins", () => {
  test("maps per-side centimetres to Chromium's margin shape", () => {
    assert.deepEqual(printMargins(getRuleSet("pediatria").margins), {
      top: "2.5cm",
      right: "3cm",
      bottom: "2.5cm",
      left: "3cm",
    });
  });
});
