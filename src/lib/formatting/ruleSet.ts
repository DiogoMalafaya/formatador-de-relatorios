/**
 * Formatting rule sets (DIO-10).
 *
 * A rule set is data, not code: it is what a Colégio da Ordem dos Médicos'
 * "Normas para a elaboração de um Curriculum Vitae" boils down to once
 * translated into parameters the engine can apply. Keyed by `id` and
 * resolved from a specialty via `resolveRuleSetId` (DIO-9) — never hardcode
 * a specialty's parameters into the engine itself.
 *
 * Two Secção A parameters are a user choice with a default, not a fixed
 * value (font family, title size) — the schema below expresses that
 * directly rather than picking one for the student.
 */

export type FontFamily = "Arial" | "Times New Roman";
export type TitleSizePt = 12 | 14;

export interface Choice<T> {
  options: readonly T[];
  default: T;
}

export interface RuleSet {
  id: string;
  /** pt-PT label, e.g. for a "formatação aplicada" summary (DIO-17). */
  name: string;

  font: {
    family: Choice<FontFamily>;
    sizePt: number;
    color: string;
  };

  title: {
    bold: true;
    sizePt: Choice<TitleSizePt>;
  };

  lineSpacing: number;

  /** Centimetres, all four sides equal per every rule set seen so far. */
  marginsCm: number;

  page: {
    size: "A4";
    color: "white";
    duplex: boolean;
  };

  footer: {
    includeCandidateName: boolean;
    includePageNumber: boolean;
  };

  header: {
    /** Optional in every rule set seen so far — never required content. */
    allowed: boolean;
  };

  constraints: {
    imagesForbidden: boolean;
    /** Tables are allowed, but only for this kind of content — flagged, not blocked (open question, DIO-10). */
    tablesRestrictedToActivitySchematization: boolean;
    maxPages?: number;
  };
}

/**
 * Secção A of the Colégio de Medicina Física e de Reabilitação's norms
 * (`PAHJ-Normas_CV_MFR_final.pdf`) — see the DIO-10 comment thread for the
 * full extraction. Used as both the `mfr` rule set and, per CLAUDE.md's
 * "one rule set among many, with a documented default", the interim
 * `generic` default until more Colégio documents are collected.
 */
const MFR_PARAMETERS: Omit<RuleSet, "id" | "name"> = {
  font: {
    family: { options: ["Arial", "Times New Roman"], default: "Times New Roman" },
    sizePt: 12,
    color: "black",
  },
  title: {
    bold: true,
    sizePt: { options: [12, 14], default: 14 },
  },
  lineSpacing: 1.5,
  marginsCm: 2.5,
  page: {
    size: "A4",
    color: "white",
    duplex: true,
  },
  footer: {
    includeCandidateName: true,
    includePageNumber: true,
  },
  header: {
    allowed: true,
  },
  constraints: {
    imagesForbidden: true,
    tablesRestrictedToActivitySchematization: true,
    maxPages: 80,
  },
};

export const GENERIC_RULE_SET_ID = "generic";

const RULE_SETS: Record<string, RuleSet> = {
  [GENERIC_RULE_SET_ID]: {
    id: GENERIC_RULE_SET_ID,
    name: "Norma genérica",
    ...MFR_PARAMETERS,
  },
  mfr: {
    id: "mfr",
    name: "Colégio de Medicina Física e de Reabilitação",
    ...MFR_PARAMETERS,
  },
};

/** Falls back to the generic rule set for an unknown id — never throws on config drift. */
export function getRuleSet(ruleSetId: string): RuleSet {
  return RULE_SETS[ruleSetId] ?? RULE_SETS[GENERIC_RULE_SET_ID];
}
