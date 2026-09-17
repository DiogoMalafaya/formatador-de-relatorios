import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateUpload,
  validateSourceCollection,
  MAX_UPLOAD_BYTES,
  MAX_SOURCE_FILES,
  MAX_COMBINED_UPLOAD_BYTES,
} from "./validate.ts";

const DOCX_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_HEADER = Buffer.from([0x25, 0x50, 0x44, 0x46]);

function candidate(overrides: Partial<{ filename: string; sizeBytes: number; header: Buffer }> = {}) {
  return {
    filename: "curriculo.docx",
    sizeBytes: 1024,
    header: DOCX_HEADER,
    ...overrides,
  };
}

describe("validateUpload", () => {
  test("accepts a well-formed .docx", () => {
    assert.deepEqual(validateUpload(candidate()), { ok: true });
  });

  test("rejects when no file was selected", () => {
    const result = validateUpload(null);
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /Nenhum ficheiro/);
  });

  test("rejects a .pdf", () => {
    const result = validateUpload(
      candidate({ filename: "curriculo.pdf", header: PDF_HEADER }),
    );
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /Apenas ficheiros \.docx/);
  });

  test("rejects a legacy .doc", () => {
    const result = validateUpload(candidate({ filename: "curriculo.doc" }));
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /Apenas ficheiros \.docx/);
  });

  test("rejects a renamed-extension file — magic bytes don't match", () => {
    // A .pdf renamed to .docx: the extension passes, but the content doesn't.
    const result = validateUpload(
      candidate({ filename: "curriculo.docx", header: PDF_HEADER }),
    );
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /não é um documento \.docx válido/);
  });

  test("rejects an oversized file, naming the limit", () => {
    const result = validateUpload(candidate({ sizeBytes: MAX_UPLOAD_BYTES + 1 }));
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /excede o limite de 20 MB/);
  });

  test("accepts a file exactly at the limit", () => {
    assert.deepEqual(validateUpload(candidate({ sizeBytes: MAX_UPLOAD_BYTES })), { ok: true });
  });

  test("rejects an empty file", () => {
    const result = validateUpload(candidate({ sizeBytes: 0 }));
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /vazio/);
  });

  test("extension check is case-insensitive", () => {
    assert.deepEqual(validateUpload(candidate({ filename: "CURRICULO.DOCX" })), { ok: true });
  });
});

describe("validateSourceCollection (DIO-40 caps)", () => {
  test("accepts a set exactly at both caps", () => {
    assert.deepEqual(
      validateSourceCollection({
        existingCount: MAX_SOURCE_FILES - 1,
        existingCombinedBytes: MAX_COMBINED_UPLOAD_BYTES - 1,
        addedCount: 1,
        addedBytes: 1,
      }),
      { ok: true },
    );
  });

  test("rejects one file over the count cap, naming the limit", () => {
    const result = validateSourceCollection({
      existingCount: MAX_SOURCE_FILES,
      existingCombinedBytes: 0,
      addedCount: 1,
      addedBytes: 1,
    });
    assert.equal(result.ok, false);
    assert.match(
      (result as { errorMessagePt: string }).errorMessagePt,
      new RegExp(`máximo ${MAX_SOURCE_FILES} ficheiros`),
    );
  });

  test("rejects one byte over the combined cap, naming the limit", () => {
    const result = validateSourceCollection({
      existingCount: 1,
      existingCombinedBytes: MAX_COMBINED_UPLOAD_BYTES,
      addedCount: 1,
      addedBytes: 1,
    });
    assert.equal(result.ok, false);
    assert.match((result as { errorMessagePt: string }).errorMessagePt, /excede o limite de 60 MB/);
  });

  test("the combined cap counts what the session already stores", () => {
    // A batch that would pass alone must fail against accumulated state —
    // the append flow is what makes repeated single-file requests safe.
    const half = MAX_COMBINED_UPLOAD_BYTES / 2;
    assert.equal(
      validateSourceCollection({
        existingCount: 3,
        existingCombinedBytes: half + 1,
        addedCount: 1,
        addedBytes: half,
      }).ok,
      false,
    );
  });

  test("the first single file passes — the degenerate case has no extra friction", () => {
    assert.deepEqual(
      validateSourceCollection({
        existingCount: 0,
        existingCombinedBytes: 0,
        addedCount: 1,
        addedBytes: MAX_UPLOAD_BYTES,
      }),
      { ok: true },
    );
  });
});
