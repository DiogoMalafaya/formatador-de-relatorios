import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractCandidateName } from "./extractName.ts";
import { parseDocxDocument } from "./parseDocx.ts";
import { buildDocx, heading, paragraph } from "./testFixtures.ts";

describe("extractCandidateName", () => {
  test("prefers the first heading over the first paragraph", async () => {
    const buffer = await buildDocx([heading(1, "Maria Silva"), paragraph("Médica interna.")]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(extractCandidateName(parsed), "Maria Silva");
  });

  test("falls back to the first paragraph when there is no heading", async () => {
    const buffer = await buildDocx([paragraph("João Costa"), paragraph("Outro texto.")]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(extractCandidateName(parsed), "João Costa");
  });

  test("returns undefined for an empty document", async () => {
    const buffer = await buildDocx([]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(extractCandidateName(parsed), undefined);
  });

  test("rejects an implausibly long first line rather than guessing", async () => {
    const longLine = Array.from({ length: 30 }, (_, i) => `palavra${i}`).join(" ");
    const buffer = await buildDocx([paragraph(longLine)]);
    const parsed = await parseDocxDocument(buffer);
    assert.equal(extractCandidateName(parsed), undefined);
  });
});
