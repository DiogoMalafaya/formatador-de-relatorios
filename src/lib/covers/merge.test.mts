import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mergeCoverWithDocument } from "./merge.ts";
import { COVER_TEMPLATES } from "./templates.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, paragraph } from "../formatting/testFixtures.ts";

describe("mergeCoverWithDocument", () => {
  test("prepends the cover as a distinct, page-broken section before the CV body", async () => {
    const buffer = await buildDocx([heading(1, "Ana Pereira"), paragraph("Experiência profissional.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { candidateName: document.extractedCandidateName });

    const coverIndex = merged.html.indexOf('class="cover-page');
    const bodyIndex = merged.html.indexOf("Experiência profissional");
    assert.ok(coverIndex >= 0 && coverIndex < bodyIndex, "cover must come before the CV body");
    assert.match(merged.html, /Ana Pereira/);
    assert.match(merged.css, /page-break-after: always/);
  });

  test("falls back to a placeholder name when none was extracted", async () => {
    const buffer = await buildDocx([paragraph("Texto sem nome óbvio à cabeça, com bastantes palavras para não parecer um nome próprio de todo.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { candidateName: document.extractedCandidateName });

    assert.match(merged.html, /Candidato\(a\)/);
  });

  test("escapes a candidate name pulled from the document before it reaches the HTML", async () => {
    const buffer = await buildDocx([heading(1, "<script>alert(1)</script>")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { candidateName: document.extractedCandidateName });

    assert.doesNotMatch(merged.html, /<script>/);
    assert.match(merged.html, /&lt;script&gt;/);
  });

  test("falls back to the first template for an unknown coverId", async () => {
    const buffer = await buildDocx([heading(1, "Nome Teste")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { coverId: "does-not-exist" });

    assert.match(merged.html, new RegExp(`cover-${COVER_TEMPLATES[0].id}`));
  });

  test("selects the requested cover template", async () => {
    const buffer = await buildDocx([heading(1, "Nome Teste")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    const target = COVER_TEMPLATES[1];

    const merged = mergeCoverWithDocument(document, { coverId: target.id });

    assert.match(merged.html, new RegExp(`cover-${target.id}`));
  });

  test("preserves the rest of the FormattedDocument shape", async () => {
    const buffer = await buildDocx([heading(1, "Nome Teste")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document);

    assert.equal(merged.ruleSet, document.ruleSet);
    assert.equal(merged.warnings, document.warnings);
  });
});
