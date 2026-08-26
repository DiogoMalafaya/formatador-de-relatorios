import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { PreviewNotReadyError, renderPreviewPdf } from "./renderPreview.ts";
import { InMemoryObjectStore, setObjectStore, getObject, putObject } from "../storage/index.ts";
import { buildDocx, heading, paragraph } from "../formatting/testFixtures.ts";
import type { SessionRecord } from "../session/types.ts";

function baseSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "session-abc",
    createdAt: Date.now(),
    expiresAt: Date.now() + 1000 * 60 * 60,
    payment: { status: "unpaid" },
    ...overrides,
  };
}

describe("renderPreviewPdf", () => {
  beforeEach(() => {
    setObjectStore(new InMemoryObjectStore());
  });

  test("throws PreviewNotReadyError when the session has no upload", async () => {
    await assert.rejects(() => renderPreviewPdf(baseSession()), PreviewNotReadyError);
  });

  test("throws PreviewNotReadyError when the stored upload is gone", async () => {
    const session = baseSession({
      upload: { storageKey: "missing/upload.docx", originalFilename: "cv.docx", sizeBytes: 10 },
    });
    await assert.rejects(() => renderPreviewPdf(session), PreviewNotReadyError);
  });

  test("renders and stores a watermarked, cover-prefixed PDF under a session-scoped key", async () => {
    const buffer = await buildDocx([heading(1, "Ana Pereira"), paragraph("Experiência profissional.")]);
    await putObject("session-abc/upload.docx", buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    const session = baseSession({
      upload: { storageKey: "session-abc/upload.docx", originalFilename: "cv.docx", sizeBytes: buffer.byteLength },
    });

    const result = await renderPreviewPdf(session);

    assert.equal(result.storageKey, "session-abc/preview.pdf");
    assert.equal(result.pdf.subarray(0, 5).toString("latin1"), "%PDF-");

    const stored = await getObject("session-abc/preview.pdf");
    assert.ok(stored);

    const loaded = await PDFDocument.load(result.pdf);
    assert.ok(loaded.getPageCount() >= 2, "cover page plus at least one body page");
  });
});
