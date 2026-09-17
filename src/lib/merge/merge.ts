/**
 * Merge engine core (DIO-41).
 *
 * Concatenates the documento principal and the ordered chapter files into one
 * `ParsedDocument`-shaped model:
 *
 *   1. The master's front matter (everything up to and including its Índice,
 *      when one is detected) is split out; a stale Índice is removed and its
 *      position taken by the generated one.
 *   2. Each chapter's top heading is demoted to its assigned depth so it slots
 *      into the section hierarchy instead of becoming a new H1, preserving the
 *      file's internal heading hierarchy relative to its top.
 *   3. Every heading gets a stable anchor id, so a rendered page map
 *      (heading id → page, DIO-42) can fill the Índice's page numbers.
 *
 * Nothing is dropped: non-heading blocks pass through byte-identical, and the
 * merged counts are recomputed so the existing validations (images forbidden,
 * tables restricted, page limit) run against the merged document unchanged.
 */

import {
  blockText,
  countHeadingLevels,
  countImages,
  countTopLevelTables,
  countWords,
  headingLevelOf,
  splitTopLevelBlocks,
} from "./blocks.ts";
import type { HtmlBlock } from "./blocks.ts";
import { buildTocEntries, detectStaleToc, renderTocHtml } from "./toc.ts";
import { staleTocReplacedWarning } from "./warnings.ts";
import type { FormattingWarning } from "../formatting/warnings.ts";
import type { ParsedDocument } from "../formatting/parseDocx.ts";
import type {
  MergedHeading,
  MergeOptions,
  MergeResult,
  MergeSource,
  PageNumbering,
} from "./types.ts";

const DEFAULT_CHAPTER_DEPTH = 1;
const DEFAULT_HEADING_ID_PREFIX = "merged-heading";
const MAX_HEADING_LEVEL = 6;

export function mergeDocuments(
  master: MergeSource,
  chapters: MergeSource[],
  options: MergeOptions = {},
): MergeResult {
  if (chapters.length === 0) {
    // Single-document upload: nothing to merge, nothing to renumber — the
    // document passes through byte-identical and the single-file pipeline
    // behaves exactly as it does today.
    return {
      document: master.document,
      headings: [],
      tocEntries: [],
      replacedStaleToc: false,
      warnings: [],
      passthrough: true,
    };
  }

  const headingIdPrefix = options.headingIdPrefix ?? DEFAULT_HEADING_ID_PREFIX;
  const warnings: FormattingWarning[] = [];
  const headings: MergedHeading[] = [];
  let nextHeadingIndex = 0;

  const assignHeadingId = () => `${headingIdPrefix}-${nextHeadingIndex++}`;

  // --- master: split front matter from anything after its Índice ---------
  const masterBlocks = splitTopLevelBlocks(master.document.html);
  const staleToc = detectStaleToc(masterBlocks);

  let frontMatterBlocks: HtmlBlock[];
  let masterBodyBlocks: HtmlBlock[];
  if (staleToc) {
    frontMatterBlocks = masterBlocks.slice(0, staleToc.startIndex);
    masterBodyBlocks = masterBlocks.slice(staleToc.endIndex + 1);
    warnings.push(staleTocReplacedWarning());
  } else {
    frontMatterBlocks = masterBlocks;
    masterBodyBlocks = [];
  }

  const frontMatterHtml = emitBlocks(frontMatterBlocks, {
    sourceId: master.id,
    numbering: "roman",
    levelShift: 0,
    minLevel: 1,
    headings,
    assignHeadingId,
  });

  const masterBodyHtml = emitBlocks(masterBodyBlocks, {
    sourceId: master.id,
    numbering: "arabic",
    levelShift: 0,
    minLevel: 1,
    headings,
    assignHeadingId,
  });

  // --- chapters: demote each file's tree to its assigned depth ------------
  const chapterHtmlParts = chapters.map((chapter) => {
    const depth = options.chapterDepthOverrides?.[chapter.id] ?? options.chapterDepth ?? DEFAULT_CHAPTER_DEPTH;
    const targetLevel = clamp(depth, 1, MAX_HEADING_LEVEL - 1) + 1;

    const blocks = splitTopLevelBlocks(chapter.document.html);
    const topHeadingLevel = blocks
      .map((block) => headingLevelOf(block.tag))
      .find((level) => level !== undefined);

    return emitBlocks(blocks, {
      sourceId: chapter.id,
      numbering: "arabic",
      // A chapter without any heading has nothing to demote; its content
      // still merges verbatim.
      levelShift: topHeadingLevel === undefined ? 0 : targetLevel - topHeadingLevel,
      // Headings shallower than the file's top heading cannot escape the
      // chapter's subtree.
      minLevel: topHeadingLevel === undefined ? 1 : targetLevel,
      headings,
      assignHeadingId,
    });
  });

  // --- generated Índice at the stale TOC's position (end of front matter) -
  const tocEntries = buildTocEntries(headings, { maxLevel: options.tocMaxLevel });
  const tocHtml = renderTocHtml(tocEntries);

  const mergedHtml = [frontMatterHtml, tocHtml, masterBodyHtml, ...chapterHtmlParts]
    .filter((part) => part.length > 0)
    .join("\n");

  const document: ParsedDocument = {
    html: mergedHtml,
    imageCount: countImages(mergedHtml),
    tableCount: countTopLevelTables(mergedHtml),
    headingCounts: countHeadingLevels(mergedHtml),
    wordCount: countWords(mergedHtml),
    unsupportedStructures: [
      ...master.document.unsupportedStructures,
      ...chapters.flatMap((chapter) => chapter.document.unsupportedStructures),
    ],
  };

  return {
    document,
    headings,
    tocEntries,
    replacedStaleToc: staleToc !== undefined,
    warnings,
    passthrough: false,
  };
}

interface EmitContext {
  sourceId: string;
  numbering: PageNumbering;
  /** Added to every heading level in these blocks (0 = keep levels). */
  levelShift: number;
  /** Floor for shifted heading levels (a chapter's assigned level). */
  minLevel: number;
  headings: MergedHeading[];
  assignHeadingId: () => string;
}

/**
 * Re-emits blocks in order. Heading blocks are re-levelled and given an
 * anchor id (and recorded); every other block passes through untouched.
 */
function emitBlocks(blocks: HtmlBlock[], context: EmitContext): string {
  const parts = blocks.map((block) => {
    const level = headingLevelOf(block.tag);
    if (level === undefined) return block.html;

    const newLevel = clamp(Math.max(context.minLevel, level + context.levelShift), 1, MAX_HEADING_LEVEL);
    const id = context.assignHeadingId();
    context.headings.push({
      id,
      level: newLevel,
      text: blockText(block.html),
      sourceId: context.sourceId,
      numbering: context.numbering,
    });
    return rewriteHeadingBlock(block.html, newLevel, id);
  });
  return parts.join("\n");
}

function rewriteHeadingBlock(html: string, newLevel: number, id: string): string {
  return html
    .replace(/^<h[1-6]/i, `<h${newLevel} id="${id}"`)
    .replace(/<\/h[1-6]>\s*$/i, `</h${newLevel}>`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
