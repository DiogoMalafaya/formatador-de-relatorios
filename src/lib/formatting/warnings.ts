/**
 * Formatting warnings (DIO-10).
 *
 * The engine's failure mode for anything it cannot safely or confidently
 * reformat is a warning surfaced to the student, never silent data loss —
 * see the DIO-10 comment thread's recommendation on images: "warn, do not
 * strip". `messagePt` is the copy shown in the UI; `code` is for tests and
 * any future logic keyed on warning kind.
 */

export type FormattingWarningCode =
  | "image-detected"
  | "unsupported-structure"
  | "table-present"
  | "page-limit-possibly-exceeded"
  /** Emitted by the merge engine (`src/lib/merge/warnings.ts`, DIO-41). */
  | "stale-toc-replaced"
  /** Exact-count variants, emitted by the two-pass render (DIO-42) once a real page map exists. */
  | "page-limit-exceeded"
  | "resumo-too-long";

export interface FormattingWarning {
  code: FormattingWarningCode;
  messagePt: string;
  /**
   * Original filename of the source document this finding came from (DIO-42,
   * US10). Only set for multi-file sessions, where "which file" is a real
   * question; single-file warnings stay unattributed, as before.
   */
  sourceFilename?: string;
}

/**
 * Attributes a warning to the source file it was found in (DIO-42, US10):
 * sets `sourceFilename` and prefixes the pt-PT copy so the attribution shows
 * even in a UI that only prints `messagePt`.
 */
export function withSourceFilename(warning: FormattingWarning, filename: string): FormattingWarning {
  return {
    ...warning,
    sourceFilename: filename,
    messagePt: `Em «${filename}»: ${warning.messagePt}`,
  };
}

export function imageDetectedWarning(count: number): FormattingWarning {
  return {
    code: "image-detected",
    messagePt:
      count === 1
        ? "O documento contém 1 imagem. Fotografias e imagens não são permitidas nesta norma — remove-a antes de continuares."
        : `O documento contém ${count} imagens. Fotografias e imagens não são permitidas nesta norma — remove-as antes de continuares.`,
  };
}

export function unsupportedStructureWarning(detail: string): FormattingWarning {
  return {
    code: "unsupported-structure",
    messagePt: `Foi encontrada uma estrutura que não pode ser reformatada com segurança (${detail}). Revê esta secção do documento — o conteúdo original foi preservado, mas o resultado pode não seguir a norma.`,
  };
}

export function tablePresentWarning(count: number): FormattingWarning {
  return {
    code: "table-present",
    messagePt:
      count === 1
        ? "O documento contém 1 tabela. As tabelas só são permitidas para esquematizar atividades (casuística, organização do internato) — confirma que é esse o caso."
        : `O documento contém ${count} tabelas. As tabelas só são permitidas para esquematizar atividades (casuística, organização do internato) — confirma que é esse o caso.`,
  };
}

export function pageLimitPossiblyExceededWarning(estimatedPages: number, maxPages: number): FormattingWarning {
  return {
    code: "page-limit-possibly-exceeded",
    messagePt: `O documento poderá exceder o limite de ${maxPages} páginas (estimativa: ~${estimatedPages}). Esta é uma estimativa — a contagem definitiva é feita ao gerar o PDF.`,
  };
}

/** Exact-count successor of the estimate above — the two-pass render knows the real page count (DIO-42). */
export function pageLimitExceededWarning(pages: number, maxPages: number): FormattingWarning {
  return {
    code: "page-limit-exceeded",
    messagePt: `O documento final tem ${pages} páginas — a norma permite no máximo ${maxPages}. Encurta o conteúdo antes de o entregares.`,
  };
}

/** The norms cap the "Resumo do currículo" at `maxPages` (2 in every rule set seen so far). */
export function resumoTooLongWarning(pages: number, maxPages: number): FormattingWarning {
  return {
    code: "resumo-too-long",
    messagePt: `O resumo do currículo ocupa ${pages} páginas — a norma permite no máximo ${maxPages}. Encurta essa secção antes de entregares.`,
  };
}
