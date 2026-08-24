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

export function buildRuleSetCss(ruleSet: RuleSet, choices: RuleSetChoices): string {
  const fontStack = `"${choices.fontFamily}", ${genericFallback(choices.fontFamily)}`;

  return `
@page {
  size: A4;
  margin: ${ruleSet.marginsCm}cm;
}

body {
  font-family: ${fontStack};
  font-size: ${ruleSet.font.sizePt}pt;
  color: ${ruleSet.font.color};
  background: ${ruleSet.page.color};
  line-height: ${ruleSet.lineSpacing};
}

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

table {
  border-collapse: collapse;
}
`.trim();
}

function genericFallback(fontFamily: FontFamily): string {
  return fontFamily === "Arial" ? "sans-serif" : "serif";
}
