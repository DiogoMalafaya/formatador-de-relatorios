/**
 * Upload validation (DIO-8).
 *
 * Pure and side-effect-free so it can be exercised the same way on the
 * client (instant PT feedback) and the server (the actual security control —
 * a client-side check is a UX affordance, never a substitute).
 */

/**
 * Upload caps (DIO-40). The single source of truth — client-side checks and
 * every route import from here.
 *
 * PROVISIONAL pending Diogo's confirmation (PRD §12 Q1): 20 files / 60 MB
 * combined is the PRD's own proposal, 20 MB per file carries over from the
 * single-file flow (DIO-8). Adjust the numbers here only.
 */
/** Per-file cap: 20MB. Confirmed generous for a CV chapter without embedded video. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Maximum number of source documents per session (documento principal + chapters). */
export const MAX_SOURCE_FILES = 20;
/** Combined size cap across every stored source of a session: 60MB. */
export const MAX_COMBINED_UPLOAD_BYTES = 60 * 1024 * 1024;

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

/**
 * Collection-level caps for the multi-file CV (DIO-40): file count and
 * combined size across everything the session already stores plus what this
 * request adds. Per-file checks stay in `validateUpload`; this only answers
 * "does the whole set still fit?". Pure for the same reason as above — the
 * wizard runs it for instant feedback, the upload route as the real control.
 */
export function validateSourceCollection(input: {
  existingCount: number;
  existingCombinedBytes: number;
  addedCount: number;
  addedBytes: number;
}): UploadValidationResult {
  if (input.existingCount + input.addedCount > MAX_SOURCE_FILES) {
    return {
      ok: false,
      errorMessagePt: `Podes carregar no máximo ${MAX_SOURCE_FILES} ficheiros.`,
    };
  }

  if (input.existingCombinedBytes + input.addedBytes > MAX_COMBINED_UPLOAD_BYTES) {
    return {
      ok: false,
      errorMessagePt: `O conjunto dos ficheiros excede o limite de ${MAX_COMBINED_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }

  return { ok: true };
}
