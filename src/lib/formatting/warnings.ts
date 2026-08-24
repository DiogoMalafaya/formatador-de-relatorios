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
  | "page-limit-possibly-exceeded";

export interface FormattingWarning {
  code: FormattingWarningCode;
  messagePt: string;
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
