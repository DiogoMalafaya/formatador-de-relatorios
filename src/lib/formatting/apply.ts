/**
 * Formatting engine entry point (DIO-10).
 *
 * Ties the pieces together: parse the upload, resolve the rule set and the
 * student's font/title choices, and surface every constraint the norms
 * impose as a warning rather than silently dropping or rejecting content —
 * see the DIO-10 comment thread's "warn, do not strip" recommendation on
 * images, extended here to every other constraint.
 */

import { parseDocxDocument } from "./parseDocx.ts";
import { getRuleSet } from "./ruleSet.ts";
import type { FontFamily, RuleSet, TitleSizePt } from "./ruleSet.ts";
import { buildRuleSetCss, resolveChoices } from "./styles.ts";
import { estimatePageCount } from "./pageEstimate.ts";
import {
  imageDetectedWarning,
  pageLimitPossiblyExceededWarning,
  tablePresentWarning,
  unsupportedStructureWarning,
} from "./warnings.ts";
import type { FormattingWarning } from "./warnings.ts";

export interface ApplyFormattingOptions {
  ruleSetId: string;
  fontFamily?: FontFamily;
  titleSizePt?: TitleSizePt;
}

export interface FormattedDocument {
  html: string;
  css: string;
  warnings: FormattingWarning[];
  /** The rule set actually applied — DIO-11 needs its margins/footer/header config to render a PDF. */
  ruleSet: RuleSet;
}

export async function applyFormatting(
  buffer: Buffer,
  options: ApplyFormattingOptions,
): Promise<FormattedDocument> {
  const ruleSet = getRuleSet(options.ruleSetId);
  const choices = resolveChoices(ruleSet, options);

  const parsed = await parseDocxDocument(buffer);
  const warnings: FormattingWarning[] = [];

  if (ruleSet.constraints.imagesForbidden && parsed.imageCount > 0) {
    warnings.push(imageDetectedWarning(parsed.imageCount));
  }

  if (ruleSet.constraints.tablesRestrictedToActivitySchematization && parsed.tableCount > 0) {
    warnings.push(tablePresentWarning(parsed.tableCount));
  }

  for (const structure of parsed.unsupportedStructures) {
    warnings.push(unsupportedStructureWarning(structure));
  }

  if (ruleSet.constraints.maxPages !== undefined) {
    const estimatedPages = estimatePageCount(parsed.wordCount, ruleSet);
    if (estimatedPages >= ruleSet.constraints.maxPages) {
      warnings.push(pageLimitPossiblyExceededWarning(estimatedPages, ruleSet.constraints.maxPages));
    }
  }

  return {
    html: parsed.html,
    css: buildRuleSetCss(ruleSet, choices),
    warnings,
    ruleSet,
  };
}
