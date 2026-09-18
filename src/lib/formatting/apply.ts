/**
 * Formatting engine entry point (DIO-10).
 *
 * Ties the pieces together: parse the upload, resolve the rule set and the
 * student's font/title choices, and surface every constraint the norms
 * impose as a warning rather than silently dropping or rejecting content —
 * see the DIO-10 comment thread's "warn, do not strip" recommendation on
 * images, extended here to every other constraint.
 *
 * DIO-42 split the buffer path in two so the merge pipeline can reuse it:
 * `applyFormatting` (parse + format, the original single-file entry point)
 * and `formatParsedDocument` (format an already-parsed document — the merged
 * multi-file model, whose constraint warnings were already collected per
 * source file for attribution).
 */

import { parseDocxDocument } from "./parseDocx.ts";
import type { ParsedDocument } from "./parseDocx.ts";
import { extractCandidateName } from "./extractName.ts";
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
  /** Best-effort guess at the candidate's name, for the cover page (DIO-12). Undefined when nothing usable was found. */
  extractedCandidateName?: string;
}

/**
 * The per-document constraint findings (forbidden images, restricted tables,
 * unsupported structures). Exposed separately so the multi-file pipeline
 * (DIO-42) can collect them per source *before* merging and attribute each
 * one to its original filename.
 */
export function collectConstraintWarnings(parsed: ParsedDocument, ruleSet: RuleSet): FormattingWarning[] {
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

  return warnings;
}

export interface FormatParsedOverrides {
  /**
   * Pre-collected constraint warnings to use instead of computing them over
   * `parsed` — the merge pipeline collects them per source file (with
   * filename attribution) and must not double-count them over the merged
   * document.
   */
  constraintWarnings?: FormattingWarning[];
  /** Appended after the constraint warnings — merge-engine findings (stale TOC, …). */
  extraWarnings?: FormattingWarning[];
}

/** Rule-set formatting over an already-parsed document. See module docs for why this exists apart from `applyFormatting`. */
export function formatParsedDocument(
  parsed: ParsedDocument,
  options: ApplyFormattingOptions,
  overrides: FormatParsedOverrides = {},
): FormattedDocument {
  const ruleSet = getRuleSet(options.ruleSetId);
  const choices = resolveChoices(ruleSet, options);

  const warnings: FormattingWarning[] = [
    ...(overrides.constraintWarnings ?? collectConstraintWarnings(parsed, ruleSet)),
    ...(overrides.extraWarnings ?? []),
  ];

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
    extractedCandidateName: extractCandidateName(parsed),
  };
}

export async function applyFormatting(
  buffer: Buffer,
  options: ApplyFormattingOptions,
): Promise<FormattedDocument> {
  return formatParsedDocument(await parseDocxDocument(buffer), options);
}
