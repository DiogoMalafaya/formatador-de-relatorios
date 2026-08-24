/**
 * Upload validation (DIO-8).
 *
 * Pure and side-effect-free so it can be exercised the same way on the
 * client (instant PT feedback) and the server (the actual security control —
 * a client-side check is a UX affordance, never a substitute).
 */

/** 20MB. PRD placeholder, confirmed generous for a CV without embedded video. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const ACCEPTED_EXTENSION = ".docx";

export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * The first four bytes of a `.docx` file, which is a ZIP archive under the
 * hood (`PK\x03\x04` — local file header signature). Checking this, not just
 * the extension, is what catches a `.pdf` renamed to `.docx`.
 */
const DOCX_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; errorMessagePt: string };

export interface UploadCandidate {
  filename: string;
  sizeBytes: number;
  /** First bytes of the file. Only the first 4 are inspected. */
  header: Buffer;
}

export function validateUpload(candidate: UploadCandidate | null): UploadValidationResult {
  if (!candidate) {
    return { ok: false, errorMessagePt: "Nenhum ficheiro foi selecionado." };
  }

  if (!candidate.filename.toLowerCase().endsWith(ACCEPTED_EXTENSION)) {
    return {
      ok: false,
      errorMessagePt: "Apenas ficheiros .docx são aceites.",
    };
  }

  if (candidate.sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      errorMessagePt: `O ficheiro excede o limite de ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }

  if (candidate.sizeBytes === 0) {
    return { ok: false, errorMessagePt: "O ficheiro está vazio." };
  }

  if (!candidate.header.subarray(0, 4).equals(DOCX_MAGIC_BYTES)) {
    return {
      ok: false,
      errorMessagePt: "O ficheiro não é um documento .docx válido.",
    };
  }

  return { ok: true };
}
