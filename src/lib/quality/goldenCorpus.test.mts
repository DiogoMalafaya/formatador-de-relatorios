import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCorpusCase, GOLDEN_SPECIALTY_IDS } from "./goldenCorpus.ts";
import { renderCorpusCase } from "./renderCorpus.ts";
import { checkPdfCompliance } from "../compliance/checkPdf.ts";
import type { ComplianceCheckId } from "../compliance/checkPdf.ts";

/**
 * The quality gate (DIO-47): every golden-corpus CV, rendered through the
 * production pipeline, passes the PDF compliance checker for its profile.
 *
 * KNOWN_VIOLATIONS lists what the engine can't do *yet*, each tied to the
 * ticket that fixes it. The test fails both ways: on any violation not in
 * the list (a regression), and on a listed violation that no longer happens
 * (the fix landed, so the entry must go).
 */
const KNOWN_VIOLATIONS: Readonly<Record<string, readonly { check: ComplianceCheckId; ticket: string }[]>> = {
  // MFR forbids photographs and graphics; images are still kept (and warned
  // about) until DIO-49 omits them per profile.
  "medicina-fisica-e-de-reabilitacao": [{ check: "images-forbidden", ticket: "DIO-49" }],
};

describe("golden corpus (DIO-47)", () => {
  for (const specialtyId of GOLDEN_SPECIALTY_IDS) {
    test(`${specialtyId}: renders and passes its profile's compliance checks`, async () => {
      const corpusCase = await buildCorpusCase(specialtyId);
      const { prepared, result } = await renderCorpusCase(corpusCase);

      assert.equal(prepared.candidateName, corpusCase.candidateName, "name read from the master's own cover");
      assert.ok(result.report.totalPages > 8, "a realistic, multi-page CV");
      assert.equal(result.report.passes, 2, "converges in two passes");

      const violations = await checkPdfCompliance(result.pdf, {
        ruleSet: prepared.document.ruleSet,
        fontFamily: prepared.document.fontFamily,
        candidateName: prepared.candidateName,
      });

      const known = KNOWN_VIOLATIONS[specialtyId] ?? [];
      const unexpected = violations.filter((violation) => !known.some((entry) => entry.check === violation.check));
      assert.deepEqual(unexpected, [], "violations not on the known list");

      for (const entry of known) {
        assert.ok(
          violations.some((violation) => violation.check === entry.check),
          `${entry.check} no longer happens — ${entry.ticket} fixed it, so remove it from KNOWN_VIOLATIONS`,
        );
      }
    });
  }
});
