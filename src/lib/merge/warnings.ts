/**
 * Merge-specific warnings (DIO-41), same shape and register as
 * `src/lib/formatting/warnings.ts` so the UI surfaces them through the one
 * existing mechanism.
 */

import type { FormattingWarning } from "../formatting/warnings.ts";

export function staleTocReplacedWarning(): FormattingWarning {
  return {
    code: "stale-toc-replaced",
    messagePt:
      "O Índice do teu documento principal estava desatualizado e foi substituído por um índice gerado automaticamente, com os números de página do documento final.",
  };
}
