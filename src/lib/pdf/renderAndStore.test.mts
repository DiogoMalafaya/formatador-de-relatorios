import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { renderAndStorePdf, PDF_CONTENT_TYPE } from "./renderAndStore.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, paragraph } from "../formatting/testFixtures.ts";
import { InMemoryObjectStore, setObjectStore, getObject } from "../storage/index.ts";

describe("renderAndStorePdf", () => {
  beforeEach(() => {
    setObjectStore(new InMemoryObjectStore());
  });

  test("writes the rendered PDF under the given session-scoped key", async () => {
    const buffer = await buildDocx([paragraph("Texto simples.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const meta = await renderAndStorePdf("session-123/final.pdf", document, {
      candidateName: "Maria Silva",
    });

    assert.equal(meta.key, "session-123/final.pdf");
    assert.equal(meta.contentType, PDF_CONTENT_TYPE);

    const stored = await getObject("session-123/final.pdf");
    assert.ok(stored);
    assert.equal(stored.subarray(0, 5).toString("latin1"), "%PDF-");
  });
});
