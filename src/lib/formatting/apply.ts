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
import { TableDesigner } from "./tables.ts";
import { FigureDesigner } from "./figures.ts";
import { applyImagePolicy } from "./images.ts";
import { splitTopLevelBlocks } from "../merge/blocks.ts";
import type { ParsedDocument } from "./parseDocx.ts";
import { extractCandidateName } from "./extractName.ts";
import { getRuleSet } from "./ruleSet.ts";
import type { FontFamily, RuleSet, TitleSizePt } from "./ruleSet.ts";
import { buildRuleSetCss, resolveChoices } from "./styles.ts";
import { estimatePageCount } from "./pageEstimate.ts";
import { applyBodyTypography } from "./typography.ts";
import {
  imageLowResolutionWarning,
  imageOmittedWarning,
  pageLimitPossiblyExceededWarning,
  tablePresentWarning,
  unsupportedStructureWarning,
} from "./warnings.ts";
import type { FormattingWarning } from "./warnings.ts";

export interface ApplyFormattingOptions {
  ruleSetId: string;
  /** Preview only: mark where a forbidden image was removed (DIO-49). */
  imagePlaceholders?: boolean;
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
  /** The norm font in use, so the render can embed it in stamped footers too (DIO-46). */
  fontFamily: FontFamily;
}

/**
 * The per-document constraint findings (forbidden images, restricted tables,
 * unsupported structures). Exposed separately so the multi-file pipeline
 * (DIO-42) can collect them per source *before* merging and attribute each
 * one to its original filename.
 */
export function collectConstraintWarnings(parsed: ParsedDocument, ruleSet: RuleSet): FormattingWarning[] {
  const warnings: FormattingWarning[] = [];

  // Forbidden images are removed by `applyImagePolicy` (DIO-49); one
  // warning per image, so each can be found.
  if (ruleSet.constraints.imagesForbidden) {
    for (let ordinal = 1; ordinal <= parsed.imageCount; ordinal += 1) {
      warnings.push(imageOmittedWarning(ordinal, ruleSet.name));
    }
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
    // Last step over the student's content (DIO-52): everything that reads
    // the text (merge, captions, name extraction) has already run.
    html: applyBodyTypography(parsed.html),
    css: buildRuleSetCss(ruleSet, choices),
    warnings,
    ruleSet,
    extractedCandidateName: extractCandidateName(parsed),
    fontFamily: choices.fontFamily,
  };
}

/**
 * Single-file entry point. Tables are designed here (DIO-48); the merge
 * engine does the same for multi-file CVs, numbering captions across files.
 * A single file has no generated front matter, so no Lista de tabelas.
 */
export async function applyFormatting(
  buffer: Buffer,
  options: ApplyFormattingOptions,
): Promise<FormattedDocument> {
  const parsed = await parseDocxDocument(buffer);
  const ruleSet = getRuleSet(options.ruleSetId);
  const policy = applyImagePolicy(parsed.html, parsed.images, {
    ruleSet,
    anchorPrefix: "doc",
    placeholders: options.imagePlaceholders ?? false,
  });
  // No page map on this path, so low-resolution warnings can't name a page.
  const extraWarnings = policy.lowResolution.map((image) => imageLowResolutionWarning(image.ordinal, image.dpi));

  if (!/<table[\s>]|<img\b/i.test(policy.html)) {
    return formatParsedDocument({ ...parsed, html: policy.html }, options, { extraWarnings });
  }
  const numbering = "arabic";
  const designed = new FigureDesigner()
    .designBlocks(new TableDesigner().designBlocks(splitTopLevelBlocks(policy.html), numbering), numbering)
    .map((block) => block.html)
    .join("\n");
  return formatParsedDocument({ ...parsed, html: designed }, options, { extraWarnings });
}
