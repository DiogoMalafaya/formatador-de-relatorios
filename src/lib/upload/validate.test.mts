import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateUpload, MAX_UPLOAD_BYTES } from "./validate.ts";

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
