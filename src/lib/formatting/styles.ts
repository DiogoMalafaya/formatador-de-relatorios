/**
 * Rule set → CSS (DIO-10).
 *
 * Produces the stylesheet DIO-11 hands to Chromium alongside the parsed HTML.
 * `@page` margins map directly onto the norms' margin requirement; the
 * footer (candidate name + page number) is deliberately left out — Chromium's
 * `printToPDF` renders footers from a separate HTML header/footer template,
 * not from page-margin CSS, so that's DIO-11's concern, not this module's.
 */

import type { FontFamily, RuleSet, TitleSizePt } from "./ruleSet.ts";
import { fontFaceCss, fontStack as embeddedFontStack } from "../pdf/fonts.ts";
import { IMAGE_CSS } from "./images.ts";
import { FIGURE_CAPTION_CSS } from "./figures.ts";
import { BODY_TYPOGRAPHY_CSS } from "./typography.ts";
import { constrain, resolveTheme } from "../themes/index.ts";
import type { EffectiveTheme } from "../themes/index.ts";

export interface RuleSetChoices {
  fontFamily: FontFamily;
  titleSizePt: TitleSizePt;
}

/** Resolves user choices against a rule set's allowed options, falling back to its defaults. */
export function resolveChoices(
  ruleSet: RuleSet,
  requested?: { fontFamily?: FontFamily; titleSizePt?: TitleSizePt },
): RuleSetChoices {
  const fontFamily =
    requested?.fontFamily && ruleSet.font.family.options.includes(requested.fontFamily)
      ? requested.fontFamily
      : ruleSet.font.family.default;
  const titleSizePt =
    requested?.titleSizePt && ruleSet.title.sizePt.options.includes(requested.titleSizePt)
      ? requested.titleSizePt
      : ruleSet.title.sizePt.default;
  return { fontFamily, titleSizePt };
}

export function buildRuleSetCss(
  ruleSet: RuleSet,
  choices: RuleSetChoices,
  theme: EffectiveTheme = constrain(resolveTheme(undefined), ruleSet, { fontFamily: choices.fontFamily }),
): string {
  // The norm's font, embedded from files we ship (DIO-46): serverless
  // Chromium has none of Arial, Times New Roman or Verdana installed.
  const fontStack = embeddedFontStack(choices.fontFamily);
  // The cover's display face (DIO-56), when the profile lets it differ.
  const displayFaces = theme.displayFamily !== choices.fontFamily ? `\n${fontFaceCss(theme.displayFamily)}` : "";

  return `
${fontFaceCss(choices.fontFamily)}${displayFaces}

@page {
  size: A4;
  margin: ${ruleSet.margins.topCm}cm ${ruleSet.margins.rightCm}cm ${ruleSet.margins.bottomCm}cm ${ruleSet.margins.leftCm}cm;
}

body {
  font-family: ${fontStack};
  font-size: ${ruleSet.font.sizePt}pt;
  color: ${ruleSet.font.color};
  background: ${ruleSet.page.color};
  line-height: ${ruleSet.lineSpacing};
}

${BODY_TYPOGRAPHY_CSS}

h1, h2, h3 {
  font-family: ${fontStack};
  font-weight: bold;
  font-size: ${choices.titleSizePt}pt;
}

h2 {
  font-size: ${Math.max(choices.titleSizePt - 1, ruleSet.font.sizePt)}pt;
}

h3 {
  font-size: ${ruleSet.font.sizePt}pt;
}

${buildThemeAccentCss(theme)}
${buildTableCss(ruleSet, theme)}
${IMAGE_CSS}
${FIGURE_CAPTION_CSS}
`.trim();
}

/**
 * Table look (DIO-48, PRD US8 / §6.2). Header fill is grey with black text
 * where the profile states colour rules (MFR: black text only), and the
 * house accent with white text where the profile is silent on colour.
 *
 * Table text stays at the body size in every profile (PRD Q9, answered
 * "no" on 2026-11-19): explicit profiles fix one size, and the house
 * standard doesn't let a theme shrink it. Legends/notes are the one smaller
 * element, and only where the profile is silent on typography — the
 * compliance checker holds explicit profiles to their stated size.
 */
export function buildTableCss(
  ruleSet: RuleSet,
  theme: EffectiveTheme = constrain(resolveTheme(undefined), ruleSet),
): string {
  const colourAllowed = theme.mode === "expressive";
  const typographyFree = ruleSet.silentOn.includes("typography");
  const headerFill = colourAllowed ? theme.accent : TABLE_TOKENS.strictHeaderFill;
  const headerText = colourAllowed ? theme.onAccent : ruleSet.font.color;

  return `
table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.4em 0 1em;
  line-height: ${TABLE_TOKENS.lineHeight};
  page-break-inside: auto;
}
/* Repeats on every printed page. */
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td {
  padding: ${TABLE_TOKENS.cellPadding};
  vertical-align: top;
  text-align: left;
  border-bottom: ${TABLE_TOKENS.ruleWidth} solid ${TABLE_TOKENS.rowRule};
}
th p, td p { margin: 0; }
thead th {
  background: ${headerFill};
  color: ${headerText};
  font-weight: bold;
  vertical-align: bottom;
  border-bottom: ${TABLE_TOKENS.headerRuleWidth} solid ${colourAllowed ? headerFill : TABLE_TOKENS.headerRule};
}
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.table-total td, tr.table-total th {
  font-weight: bold;
  border-top: ${TABLE_TOKENS.headerRuleWidth} solid ${TABLE_TOKENS.headerRule};
}
/* Short tables never split (see SHORT_TABLE_MAX_ROWS in tables.ts). */
table.table-keep { break-inside: avoid; page-break-inside: avoid; }
.table-caption {
  margin: 1em 0 0.3em;
  line-height: ${TABLE_TOKENS.lineHeight};
  break-after: avoid;
  page-break-after: avoid;
}
.table-caption-label { font-weight: bold; }
.table-note {
  margin: -0.6em 0 1em;
  line-height: ${TABLE_TOKENS.lineHeight};
  ${typographyFree ? `font-size: ${TABLE_TOKENS.noteScale}em;` : ""}
}
`.trim();
}

/**
 * The theme's accent on headings and caption labels (DIO-56, PRD §6.2:
 * "Headings … may use one accent colour"). Nothing in strict mode: body
 * text and headings stay the profile's black.
 */
export function buildThemeAccentCss(theme: EffectiveTheme): string {
  if (theme.mode === "strict") return "";
  return `
h1, h2 { color: ${theme.accent}; }
.table-caption-label, .figure-caption-label { color: ${theme.accent}; }
`.trim();
}

/**
 * Table tokens other than colour, which comes from the theme (DIO-56). The
 * strict header fill is the one grey a profile that states colour rules gets.
 */
export const TABLE_TOKENS = {
  /** Word's "Branco, Fundo 1, Mais Escuro 15%" — the grey the Oftalmologia template uses. */
  strictHeaderFill: "#d9d9d9",
  headerRule: "#808080",
  rowRule: "#c8c8c8",
  ruleWidth: "0.5pt",
  headerRuleWidth: "0.75pt",
  cellPadding: "0.22em 0.45em",
  lineHeight: 1.15,
  noteScale: 0.85,
} as const;
