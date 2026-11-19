/**
 * Merge-specific warnings (DIO-41), same shape and register as
 * `src/lib/formatting/warnings.ts` so the UI surfaces them through the one
 * existing mechanism.
 */

import type { FormattingWarning } from "../formatting/warnings.ts";

/** The master's own cover text was dropped because our generated cover replaces it (DIO-45). */
export function sourceCoverReplacedWarning(): FormattingWarning {
  return {
    code: "source-cover-replaced",
    messagePt:
      "A capa do teu documento principal foi substituída pela capa escolhida aqui, para não aparecer duas vezes.",
  };
}

export function staleTocReplacedWarning(): FormattingWarning {
  return {
    code: "stale-toc-replaced",
    messagePt:
      "O Índice do teu documento principal estava desatualizado e foi substituído por um índice gerado automaticamente, com os números de página do documento final.",
  };
}

/** The master's own Lista de tabelas/figuras was replaced by one generated from the numbered captions (DIO-48/49). */
export function staleCaptionListReplacedWarning(kind: "table" | "figure"): FormattingWarning {
  return kind === "table"
    ? {
        code: "stale-table-list-replaced",
        messagePt:
          "A lista de tabelas do teu documento principal foi substituída por uma lista gerada a partir das legendas das tabelas, com os números de página do documento final.",
      }
    : {
        code: "stale-figure-list-replaced",
        messagePt:
          "A lista de figuras do teu documento principal foi substituída por uma lista gerada a partir das legendas das figuras, com os números de página do documento final.",
      };
}
