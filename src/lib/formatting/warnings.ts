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
  /** Pre-DIO-49 "warn, don't strip" image warning; may still sit on stored sessions. */
  | "image-detected"
  | "unsupported-structure"
  | "table-present"
  | "page-limit-possibly-exceeded"
  /** Emitted by the merge engine (`src/lib/merge/warnings.ts`, DIO-41). */
  | "stale-toc-replaced"
  /** Emitted by the merge engine (DIO-45) when the master's own cover is dropped. */
  | "source-cover-replaced"
  /** Emitted by the merge engine (DIO-48) when the master's own Lista de tabelas is regenerated. */
  | "stale-table-list-replaced"
  /** Same, for the Lista de figuras (DIO-49). */
  | "stale-figure-list-replaced"
  /** A forbidden image was left out of the output (DIO-49): one per image. */
  | "image-omitted"
  /** A kept image prints below 150 dpi at its placed size (DIO-49). */
  | "image-low-resolution"
  /** Exact-count variants, emitted by the two-pass render (DIO-42) once a real page map exists. */
  | "page-limit-exceeded"
  /** The PDF compliance checker (DIO-47) found the output breaking a rule of the profile. */
  | "compliance-violation"
  | "summary-section-too-long";

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

/**
 * One forbidden image left out of the output (DIO-49). One warning per image,
 * so the student can find each one; the preview shows a placeholder where it
 * was. Never quotes the image's alt text: warnings can reach logs.
 */
export function imageOmittedWarning(ordinal: number, colegioName: string): FormattingWarning {
  return {
    code: "image-omitted",
    messagePt: `Removemos a ${ordinal}.ª imagem deste documento: as normas do ${colegioName} não permitem fotografias nem gráficos. Na pré-visualização, um aviso marca o sítio onde estava.`,
  };
}

/** A kept image prints soft at the size it's placed at (DIO-49). Page when the render knows it. */
export function imageLowResolutionWarning(ordinal: number, dpi: number, pageLabel?: string): FormattingWarning {
  const where = pageLabel ? ` (na página ${pageLabel})` : "";
  return {
    code: "image-low-resolution",
    messagePt: `A ${ordinal}.ª imagem deste documento${where} tem pouca resolução para impressão: cerca de ${dpi} ppp no tamanho em que aparece, quando o recomendado são pelo menos 150. Se tiveres uma versão maior, usa-a.`,
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

/**
 * A profile's capped summary section ran long (MFR "Resumo do currículo" ≤ 2,
 * Pediatria "Síntese curricular" ≤ 3). `labelPt` is the section as the
 * sentence subject, e.g. "O resumo do currículo".
 */
export function summaryTooLongWarning(labelPt: string, pages: number, maxPages: number): FormattingWarning {
  return {
    code: "summary-section-too-long",
    messagePt: `${labelPt} ocupa ${pages} páginas — a norma permite no máximo ${maxPages}. Encurta essa secção antes de entregares.`,
  };
}
