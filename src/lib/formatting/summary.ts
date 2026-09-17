/**
 * Formatting summary (DIO-17).
 *
 * A short pt-PT line shown next to the preview — "Fonte: ... · Margens: ...
 * · Espaçamento: ..." — derived from the rule set actually applied. Built
 * from `RuleSet` fields rather than hardcoded so a rule-set config change
 * (new Colégio, adjusted parameter) changes the copy with no code change.
 */

import type { RuleSet } from "./ruleSet.ts";

/** pt-PT uses a comma for the decimal separator ("2,5cm", not "2.5cm"). */
function formatPtNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

export function formatFormattingSummaryPt(ruleSet: RuleSet): string {
  const parts = [
    `Fonte: ${ruleSet.font.family.default} ${formatPtNumber(ruleSet.font.sizePt)}pt`,
    `Margens: ${formatPtNumber(ruleSet.marginsCm)}cm`,
    `Espaçamento: ${formatPtNumber(ruleSet.lineSpacing)}`,
  ];
  return parts.join(" · ");
}
