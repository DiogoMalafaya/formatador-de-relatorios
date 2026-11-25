/**
 * Formatting summary (DIO-17).
 *
 * A short pt-PT line shown next to the preview — "Fonte: ... · Margens: ...
 * · Espaçamento: ..." — derived from the rule set actually applied. Built
 * from `RuleSet` fields rather than hardcoded so a rule-set config change
 * (new Colégio, adjusted parameter) changes the copy with no code change.
 */

import type { FontFamily, RuleSet } from "./ruleSet.ts";

/** pt-PT uses a comma for the decimal separator ("2,5cm", not "2.5cm"). */
function formatPtNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function formatMarginsPt(margins: RuleSet["margins"]): string {
  const { topCm, rightCm, bottomCm, leftCm } = margins;
  if (topCm === rightCm && topCm === bottomCm && topCm === leftCm) {
    return `${formatPtNumber(topCm)}cm`;
  }
  if (topCm === bottomCm && leftCm === rightCm) {
    return `${formatPtNumber(topCm)}cm (sup./inf.), ${formatPtNumber(leftCm)}cm (esq./dir.)`;
  }
  return [topCm, rightCm, bottomCm, leftCm].map((cm) => `${formatPtNumber(cm)}cm`).join(" ");
}

/** `fontFamily` is the face actually used: the theme's, where the profile leaves the font free (DIO-56). */
export function formatFormattingSummaryPt(ruleSet: RuleSet, fontFamily: FontFamily = ruleSet.font.family.default): string {
  const parts = [
    `Fonte: ${fontFamily} ${formatPtNumber(ruleSet.font.sizePt)}pt`,
    `Margens: ${formatMarginsPt(ruleSet.margins)}`,
    `Espaçamento: ${formatPtNumber(ruleSet.lineSpacing)}`,
  ];
  return parts.join(" · ");
}
