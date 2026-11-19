/**
 * Cover and página de rosto details the student types in (DIO-50, PRD US5).
 *
 * The norms want the cover to name the **local de formação** (MFR: "nome do
 * candidato, «curriculum vitae», local de formação e data"), and the rosto to
 * carry signature blocks for the Orientador de Formação and the Diretor do
 * Serviço. None of that is reliably in the uploaded documents, so the wizard's
 * cover step asks for it.
 *
 * Shared by the API route (validation) and the client form (the same limits),
 * so it stays free of server-only imports.
 *
 * PRIVACY: these are personal data. They live on the session record and
 * expire with it; never log them.
 */

export interface CoverDetails {
  /** Overrides the name read from the documents, when the student sets it. */
  candidateName?: string;
  /** Hospital / institution of the internato — the local de formação. */
  hospital: string;
  city: string;
  /** Printed under the Orientador de Formação's signature line, when given. */
  orientador?: string;
  /** Printed under the Diretor do Serviço's signature line, when given. */
  diretor?: string;
}

export const COVER_DETAIL_MAX_LENGTH = 120;

const OPTIONAL_KEYS = ["candidateName", "orientador", "diretor"] as const;

/** Labels for the form and for validation messages. */
export const COVER_DETAIL_LABELS_PT: Readonly<Record<keyof CoverDetails, string>> = {
  candidateName: "Nome na capa",
  hospital: "Hospital ou instituição de formação",
  city: "Cidade",
  orientador: "Orientador(a) de formação",
  diretor: "Diretor(a) do serviço",
};

export type CoverDetailsResult = { ok: true; details: CoverDetails } | { ok: false; errorMessagePt: string };

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Validates untrusted input (an API body) into `CoverDetails`. */
export function parseCoverDetails(input: unknown): CoverDetailsResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errorMessagePt: "Pedido inválido." };
  }
  const raw = input as Record<string, unknown>;
  for (const key of ["hospital", "city", ...OPTIONAL_KEYS] as const) {
    const value = clean(raw[key]);
    if (value && value.length > COVER_DETAIL_MAX_LENGTH) {
      return {
        ok: false,
        errorMessagePt: `«${COVER_DETAIL_LABELS_PT[key]}» é demasiado longo (máximo ${COVER_DETAIL_MAX_LENGTH} caracteres).`,
      };
    }
  }
  const hospital = clean(raw.hospital);
  const city = clean(raw.city);
  if (!hospital || !city) {
    return { ok: false, errorMessagePt: "Indica o hospital e a cidade onde fizeste o internato." };
  }
  const details: CoverDetails = { hospital, city };
  for (const key of OPTIONAL_KEYS) {
    const value = clean(raw[key]);
    if (value) details[key] = value;
  }
  return { ok: true, details };
}

/** Everything the cover needs to be compliant is there. */
export function isCoverDetailsComplete(details: CoverDetails | undefined): details is CoverDetails {
  return !!details && clean(details.hospital) !== undefined && clean(details.city) !== undefined;
}

/** "Hospital de Santa Maria, Lisboa" — the local de formação as one line. */
export function formatLocalDeFormacao(details: Pick<CoverDetails, "hospital" | "city">): string {
  return `${details.hospital}, ${details.city}`;
}
