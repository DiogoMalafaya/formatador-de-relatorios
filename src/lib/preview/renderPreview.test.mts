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

  test("renders a multi-file session by merging every source (DIO-40 layout)", async () => {
    const master = await buildDocx([heading(1, "Ana Pereira"), paragraph("Documento principal.")]);
    const chapter = await buildDocx([heading(1, "SAÚDE MATERNA"), paragraph("Casuística do estágio.")]);
    await putObject(
      "session-abc/source/0.docx",
      master,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    await putObject(
      "session-abc/source/1.docx",
      chapter,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const session = baseSession({
      sources: [
        { index: 0, storageKey: "session-abc/source/0.docx", originalFilename: "principal.docx", sizeBytes: master.byteLength },
        { index: 1, storageKey: "session-abc/source/1.docx", originalFilename: "capítulo.docx", sizeBytes: chapter.byteLength },
      ],
      masterIndex: 0,
    });

    const result = await renderPreviewPdf(session);
    assert.equal(result.storageKey, "session-abc/preview.pdf");
    assert.equal(result.pdf.subarray(0, 5).toString("latin1"), "%PDF-");

    const loaded = await PDFDocument.load(result.pdf);
    assert.ok(loaded.getPageCount() >= 2, "cover page plus merged body");
  });

  test("throws PreviewNotReadyError when a chapter source is gone from storage", async () => {
    // Since the merge engine (DIO-41/DIO-42) consumes every source, a missing
    // chapter must fail loudly: silently rendering without it would hand the
    // candidate an incomplete CV that still looks finished.
    const master = await buildDocx([heading(1, "Ana Pereira"), paragraph("Documento principal.")]);
    await putObject(
      "session-abc/source/0.docx",
      master,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const session = baseSession({
      sources: [
        { index: 0, storageKey: "session-abc/source/0.docx", originalFilename: "principal.docx", sizeBytes: master.byteLength },
        { index: 1, storageKey: "session-abc/source/1.docx", originalFilename: "capítulo.docx", sizeBytes: 10 },
      ],
      masterIndex: 0,
    });

    await assert.rejects(() => renderPreviewPdf(session), PreviewNotReadyError);
  });
});
