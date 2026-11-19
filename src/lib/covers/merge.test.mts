import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mergeCoverWithDocument } from "./merge.ts";
import { COVER_TEMPLATES } from "./templates.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, paragraph } from "../formatting/testFixtures.ts";

describe("mergeCoverWithDocument", () => {
  test("prepends the cover as a distinct, page-broken section before the CV body", async () => {
    const buffer = await buildDocx([heading(1, "Ana Pereira"), paragraph("Experiência profissional.")]);
    const document = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { candidateName: document.extractedCandidateName });

    const coverIndex = merged.html.indexOf('class="cover-page');
    // Body prose carries soft hyphens (DIO-52); a capitalised word has none.
    const bodyIndex = merged.html.indexOf("Experiência");
    assert.ok(coverIndex >= 0 && coverIndex < bodyIndex, "cover must come before the CV body");
    assert.match(merged.html, /Ana Pereira/);
    assert.match(merged.css, /page-break-after: always/);
  });

  test("falls back to a placeholder name when none was extracted", async () => {
    const buffer = await buildDocx([paragraph("Texto sem nome óbvio à cabeça, com bastantes palavras para não parecer um nome próprio de todo.")]);
    const document = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { candidateName: document.extractedCandidateName });

    assert.match(merged.html, /Candidato\(a\)/);
  });

  test("escapes a candidate name pulled from the document before it reaches the HTML", async () => {
    const buffer = await buildDocx([heading(1, "<script>alert(1)</script>")]);
    const document = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { candidateName: document.extractedCandidateName });

    assert.doesNotMatch(merged.html, /<script>/);
    assert.match(merged.html, /&lt;script&gt;/);
  });

  test("falls back to the first template for an unknown coverId", async () => {
    const buffer = await buildDocx([heading(1, "Nome Teste")]);
    const document = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document, { coverId: "does-not-exist" });

    assert.match(merged.html, new RegExp(`cover-${COVER_TEMPLATES[0].id}`));
  });

  test("selects the requested cover template", async () => {
    const buffer = await buildDocx([heading(1, "Nome Teste")]);
    const document = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });
    const target = COVER_TEMPLATES[1];

    const merged = mergeCoverWithDocument(document, { coverId: target.id });

    assert.match(merged.html, new RegExp(`cover-${target.id}`));
  });

  test("preserves the rest of the FormattedDocument shape", async () => {
    const buffer = await buildDocx([heading(1, "Nome Teste")]);
    const document = await applyFormatting(buffer, { ruleSetId: HOUSE_RULE_SET_ID });

    const merged = mergeCoverWithDocument(document);

    assert.equal(merged.ruleSet, document.ruleSet);
    assert.equal(merged.warnings, document.warnings);
  });

  describe("página de rosto and signatures (DIO-50)", () => {
    const details = {
      hospital: "Hospital Imaginário",
      city: "Vila Inventada",
      orientador: "Dra. Orientadora Fictícia",
    };
    const formatted = async (ruleSetId: string) =>
      applyFormatting(await buildDocx([heading(1, "Nome Teste"), paragraph("Corpo.")]), { ruleSetId });

    test("cover and rosto carry the internato and the local de formação", async () => {
      const merged = mergeCoverWithDocument(await formatted("mfr"), {
        candidateName: "Nome Teste",
        specialtyNamePt: "Medicina Física e de Reabilitação",
        details,
      });
      const [cover, rest] = merged.html.split('<section class="rosto-page">');
      assert.match(cover, /Internato Médico de Medicina Física e de Reabilitação/);
      assert.match(cover, /Hospital Imaginário, Vila Inventada/);
      assert.match(rest, /Exame final de habilitação ao grau de Especialista em Medicina Física e de Reabilitação/);
      assert.ok(merged.html.indexOf("rosto-page") < merged.html.indexOf("Corpo."), "the rosto precedes the CV");
      assert.match(merged.html, /<div id="dio50-rosto-start" class="page-map-marker"/);
    });

    test("MFR always gets both rosto signature blocks and the candidate's on the last page", async () => {
      const merged = mergeCoverWithDocument(await formatted("mfr"), { candidateName: "Nome Teste", details });
      assert.match(merged.html, /Orientador\(a\) de Formação<\/p><p>Dra\. Orientadora Fictícia<\/p>/);
      assert.match(merged.html, /Diretor\(a\) do Serviço<\/p><\/div>/, "an unnamed signatory still gets a line");
      assert.ok(merged.html.trimEnd().endsWith("</section>"));
      assert.match(merged.html, /<section class="candidate-signature"><p>Vila Inventada, [^<]+<\/p>.*O\(A\) Candidato\(a\)/);
      assert.ok(merged.html.indexOf("candidate-signature") > merged.html.indexOf("Corpo."), "signed after the content");
    });

    test("elsewhere, rosto signatures only when the student named a signatory; no candidate signature", async () => {
      const unnamed = mergeCoverWithDocument(await formatted(HOUSE_RULE_SET_ID), {
        details: { hospital: "H", city: "C" },
      });
      assert.doesNotMatch(unnamed.html, /signature-block/);
      const named = mergeCoverWithDocument(await formatted(HOUSE_RULE_SET_ID), { details });
      assert.match(named.html, /signature-blocks/);
      assert.doesNotMatch(named.html, /candidate-signature/);
    });

    test("the name the student typed wins over the one read from the document", async () => {
      const merged = mergeCoverWithDocument(await formatted(HOUSE_RULE_SET_ID), {
        candidateName: "Nome Lido",
        details: { ...details, candidateName: "Nome Escolhido" },
      });
      assert.doesNotMatch(merged.html, /Nome Lido/);
      assert.match(merged.html, /Nome Escolhido/);
    });

    test("escapes everything the student typed", async () => {
      const merged = mergeCoverWithDocument(await formatted("mfr"), {
        details: { hospital: "<b>H</b>", city: "C & D", diretor: '"x"' },
      });
      assert.doesNotMatch(merged.html, /<b>H<\/b>/);
      assert.match(merged.html, /&lt;b&gt;H&lt;\/b&gt;, C &amp; D/);
    });
  });
});
