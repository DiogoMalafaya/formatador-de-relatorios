/**
 * House themes (DIO-56, PRD US11).
 *
 * A theme is a set of design tokens: body face, cover display face, one
 * accent colour plus a light tint. A norm profile then **constrains** it
 * (`constrain`): wherever a Colégio states a rule, the rule wins and the
 * theme degrades to a compliant variant. Never the other way round, so no
 * theme × profile combination can produce a violation (PRD §8).
 *
 * What a profile takes away:
 *
 * | Profile states…  | Effect on the theme                                           |
 * |------------------|---------------------------------------------------------------|
 * | typography (MFR, Pediatria) | Body *and* cover use the profile's default font (DIO-46: the student never picks a font where the norms name one). No display face on the cover (PRD Q2a, decided 2026-11-22), no type sizes beyond the profile's. |
 * | colour (MFR)     | Strict mode: accent becomes black, no tints, no colour fields. |
 * | cover (MFR)      | No colour fields on the cover even if colour were allowed.    |
 *
 * Where the profile is silent (house standard: Anestesiologia, Cirurgia
 * Geral, Ortopedia; and Oftalmologia's template) the theme applies in full.
 *
 * The display face is one of the embedded families (`pdf/fonts.ts`) for
 * now, set larger and in italic: no extra display font has been added to
 * the repository yet. The token is in place so a new face is one change.
 *
 * Shared by the server render and the client picker: no Node imports here.
 */

import type { FontFamily, RuleSet } from "../formatting/ruleSet.ts";

export type ThemeMode = "expressive" | "strict";

export interface HouseTheme {
  id: string;
  /** pt-PT name for the picker. */
  namePt: string;
  /** One short pt-PT line for the picker. */
  descriptionPt: string;
  /** Body face where the profile doesn't fix one. */
  bodyFamily: FontFamily;
  /** Cover name face where the profile doesn't fix one (Q2a). */
  displayFamily: FontFamily;
  displayItalic: boolean;
  /** The one accent colour (§6.2: one accent + neutrals). */
  accent: string;
  /** A very light tint of the accent, for cover fields. */
  accentTint: string;
  /** Text drawn on an accent fill. */
  onAccent: string;
}

export const HOUSE_THEMES: readonly HouseTheme[] = [
  {
    id: "sobria",
    namePt: "Sóbria",
    descriptionPt: "Serifada, em azul-tinta. Clássica e discreta.",
    bodyFamily: "Times New Roman",
    displayFamily: "Times New Roman",
    displayItalic: true,
    accent: "#1f3a5f",
    accentTint: "#e8edf3",
    onAccent: "#ffffff",
  },
  {
    id: "contemporanea",
    namePt: "Contemporânea",
    descriptionPt: "Sem serifa, em verde-petróleo. Linhas limpas.",
    bodyFamily: "Arial",
    displayFamily: "Arial",
    displayItalic: false,
    accent: "#0f5752",
    accentTint: "#e4efed",
    onAccent: "#ffffff",
  },
];

export const DEFAULT_THEME_ID = HOUSE_THEMES[0].id;

export function getThemes(): readonly HouseTheme[] {
  return HOUSE_THEMES;
}

export function getThemeById(id: string): HouseTheme | undefined {
  return HOUSE_THEMES.find((theme) => theme.id === id);
}

/** The theme for an id, falling back to the default for an unknown or unset one. */
export function resolveTheme(id: string | undefined): HouseTheme {
  return (id ? getThemeById(id) : undefined) ?? HOUSE_THEMES[0];
}

/** A theme after its profile's constraints: what the render actually uses. */
export interface EffectiveTheme {
  themeId: string;
  /** `strict` where the profile forbids colour (MFR): black and white only. */
  mode: ThemeMode;
  bodyFamily: FontFamily;
  displayFamily: FontFamily;
  displayItalic: boolean;
  /** Headings, rules, table headers, cover fields. Black in strict mode. */
  accent: string;
  /** Light fills; null in strict mode. */
  accentTint: string | null;
  onAccent: string;
  /** The cover may carry colour fields (colour *and* cover unregulated). */
  colourCover: boolean;
  /** Type may go beyond the profile's sizes (divider numerals); false where typography is stated. */
  freeTypeScale: boolean;
}

export interface ConstrainOptions {
  /** An explicit body font (tests, legacy callers). Honoured only if the profile allows it. */
  fontFamily?: FontFamily;
}

export function constrain(theme: HouseTheme, ruleSet: RuleSet, options: ConstrainOptions = {}): EffectiveTheme {
  const typographyFree = ruleSet.silentOn.includes("typography");
  const colour = ruleSet.silentOn.includes("colour");
  const allowed = ruleSet.font.family.options;

  const requested = options.fontFamily ?? (typographyFree ? theme.bodyFamily : undefined);
  const bodyFamily = requested && allowed.includes(requested) ? requested : ruleSet.font.family.default;

  return {
    themeId: theme.id,
    mode: colour ? "expressive" : "strict",
    bodyFamily,
    displayFamily: typographyFree ? theme.displayFamily : bodyFamily,
    displayItalic: typographyFree && theme.displayItalic,
    accent: colour ? theme.accent : "#000000",
    accentTint: colour ? theme.accentTint : null,
    onAccent: colour ? theme.onAccent : "#000000",
    colourCover: colour && ruleSet.silentOn.includes("cover"),
    freeTypeScale: typographyFree,
  };
}

/** A rendered document's effective theme, or the default theme constrained by its profile. */
export function documentTheme(document: {
  theme?: EffectiveTheme;
  ruleSet: RuleSet;
  fontFamily: FontFamily;
}): EffectiveTheme {
  return document.theme ?? constrain(resolveTheme(undefined), document.ruleSet, { fontFamily: document.fontFamily });
}

/** The pt-PT notes the picker shows when a profile constrains the themes. */
export function constraintNotesPt(ruleSet: RuleSet): string[] {
  const notes: string[] = [];
  if (!ruleSet.silentOn.includes("colour")) {
    notes.push("As normas do teu Colégio não permitem cor: o tema é aplicado a preto e branco.");
  }
  if (!ruleSet.silentOn.includes("typography")) {
    notes.push(`O tipo de letra é o das normas (${ruleSet.font.family.default}), em todos os temas.`);
  }
  return notes;
}
