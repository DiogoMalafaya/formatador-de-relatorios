/**
 * Merge engine core (DIO-41).
 *
 * Concatenates the documento principal and the ordered chapter files into one
 * `ParsedDocument`-shaped model:
 *
 *   1. The master's own cover text is dropped (our cover replaces it) and
 *      its front matter split out: everything up to its Índice, plus any
 *      leading front-matter sections after it (abbreviations, lists…, see
 *      `frontMatter.ts`, DIO-45). A stale Índice is removed and its position
 *      taken by the generated one. The rest of the master is body, demoted
 *      to chapter level like any chapter file.
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
import {
  buildTocEntries,
  detectStaleToc,
  isTableListTitle,
  renderTableListHtml,
  renderTocHtml,
  TABLE_LIST_TITLE_PT,
} from "./toc.ts";
import { detectSourceCover, splitMasterAfterToc } from "./frontMatter.ts";
import { sourceCoverReplacedWarning, staleTableListReplacedWarning, staleTocReplacedWarning } from "./warnings.ts";
import { TableDesigner } from "../formatting/tables.ts";
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
      tableCaptions: [],
      warnings: [],
      passthrough: true,
    };
  }

  const headingIdPrefix = options.headingIdPrefix ?? DEFAULT_HEADING_ID_PREFIX;
  const warnings: FormattingWarning[] = [];
  const headings: MergedHeading[] = [];
  let nextHeadingIndex = 0;

  const assignHeadingId = () => `${headingIdPrefix}-${nextHeadingIndex++}`;
  // One designer for the whole document, called in document order, so table
  // captions are numbered across chapter files (DIO-48).
  const tables = new TableDesigner();

  // --- master: drop its cover, split front matter from body ---------------
  let masterBlocks = splitTopLevelBlocks(master.document.html);

  // Our generated cover replaces the master's own; keep its name line, since
  // the first heading of a merged CV is a front-matter title, not the name.
  const sourceCover = detectSourceCover(masterBlocks);
  if (sourceCover) {
    masterBlocks = masterBlocks.slice(sourceCover.blockCount);
    warnings.push(sourceCoverReplacedWarning());
  }

  const staleToc = detectStaleToc(masterBlocks);

  let frontMatterBlocks: HtmlBlock[];
  let afterTocFrontMatterBlocks: HtmlBlock[] = [];
  let masterBodyBlocks: HtmlBlock[] = [];
  if (staleToc) {
    frontMatterBlocks = masterBlocks.slice(0, staleToc.startIndex);
    const split = splitMasterAfterToc(masterBlocks.slice(staleToc.endIndex + 1));
    afterTocFrontMatterBlocks = split.frontMatter;
    masterBodyBlocks = split.body;
    warnings.push(staleTocReplacedWarning());
  } else {
    frontMatterBlocks = masterBlocks;
  }

  // The master's own Lista de tabelas is stale for the same reason its Índice
  // is: fenced here, and swapped for the generated one below when there are
  // captions to list.
  const staleList = fenceTableListSection(frontMatterBlocks) ?? fenceTableListSection(afterTocFrontMatterBlocks);
  if (staleList) {
    if (staleList.blocks === frontMatterBlocks) frontMatterBlocks = staleList.fenced;
    else afterTocFrontMatterBlocks = staleList.fenced;
  }

  const frontMatter = (blocks: HtmlBlock[]) =>
    emitBlocks(tables.designBlocks(blocks, "roman"), {
      sourceId: master.id,
      numbering: "roman",
      levelShift: 0,
      minLevel: 1,
      partLevel: 1,
      headings,
      assignHeadingId,
    });

  /**
   * Body content is demoted so its top heading sits at the chapter level, so
   * every chapter (including body sections written into the master) shares
   * one level and therefore one notion of "major part" (DIO-45).
   */
  const chapterLevelFor = (sourceId: string) => {
    const depth = options.chapterDepthOverrides?.[sourceId] ?? options.chapterDepth ?? DEFAULT_CHAPTER_DEPTH;
    return clamp(depth, 1, MAX_HEADING_LEVEL - 1) + 1;
  };
  const bodyPart = (sourceId: string, blocks: HtmlBlock[]) => {
    const targetLevel = chapterLevelFor(sourceId);
    const levels = blocks
      .map((block) => headingLevelOf(block.tag))
      .filter((level): level is number => level !== undefined);
    // The shallowest heading anchors the demotion. For a chapter file that's
    // normally its first heading; a file opening on an h2 then an h1 still
    // slots in at the chapter level.
    const topHeadingLevel = levels.length > 0 ? Math.min(...levels) : undefined;

    return emitBlocks(tables.designBlocks(blocks, "arabic"), {
      sourceId,
      numbering: "arabic",
      // A part without any heading has nothing to demote; its content still
      // merges verbatim.
      levelShift: topHeadingLevel === undefined ? 0 : targetLevel - topHeadingLevel,
      // Headings shallower than the file's top heading cannot escape the
      // chapter's subtree.
      minLevel: topHeadingLevel === undefined ? 1 : targetLevel,
      partLevel: targetLevel,
      headings,
      assignHeadingId,
    });
  };

  // Emission order is document order, so `headings` stays in document order.
  let frontMatterHtml = frontMatter(frontMatterBlocks);
  // Where the generated Lista's heading goes in `headings` when there's no
  // stale list to take the place of: right after the Índice.
  const afterTocHeadingIndex = headings.length;
  let afterTocFrontMatterHtml = frontMatter(afterTocFrontMatterBlocks);
  const masterBodyHtml = bodyPart(master.id, masterBodyBlocks);
  const chapterHtmlParts = chapters.map((chapter) =>
    bodyPart(chapter.id, splitTopLevelBlocks(chapter.document.html)),
  );

  // --- generated Lista de tabelas (DIO-48) ---------------------------------
  // Where the master had its own, in that place; otherwise right after the
  // Índice. A stale list is kept as the student wrote it when we found no
  // caption to list: replacing it with nothing would lose their content.
  const tableCaptions = tables.captions;
  const tableListHeading: MergedHeading = {
    id: `${headingIdPrefix}-table-list`,
    level: 1,
    text: TABLE_LIST_TITLE_PT,
    sourceId: master.id,
    numbering: "roman",
    part: true,
  };
  const tableListHtml =
    tableCaptions.length > 0
      ? renderTableListHtml(
          tableCaptions.map((caption) => ({ captionId: caption.id, text: caption.text, numbering: caption.numbering })),
          { headingId: tableListHeading.id },
        )
      : "";
  let tableListPlaced = false;
  const resolveFence = (html: string) => {
    const start = html.indexOf(STALE_LIST_START);
    const end = html.indexOf(STALE_LIST_END);
    if (start === -1 || end === -1) return html;
    if (tableListHtml.length === 0) {
      return html.replace(STALE_LIST_START, "").replace(STALE_LIST_END, "");
    }
    const region = html.slice(start, end);
    const droppedIds = new Set([...region.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]));
    const firstDropped = headings.findIndex((heading) => droppedIds.has(heading.id));
    for (let i = headings.length - 1; i >= 0; i -= 1) {
      if (droppedIds.has(headings[i].id)) headings.splice(i, 1);
    }
    headings.splice(firstDropped === -1 ? headings.length : firstDropped, 0, tableListHeading);
    tableListPlaced = true;
    warnings.push(staleTableListReplacedWarning());
    return `${html.slice(0, start)}${tableListHtml}${html.slice(end + STALE_LIST_END.length)}`;
  };
  frontMatterHtml = resolveFence(frontMatterHtml);
  afterTocFrontMatterHtml = resolveFence(afterTocFrontMatterHtml);
  if (tableListHtml.length > 0 && !tableListPlaced) {
    headings.splice(afterTocHeadingIndex, 0, tableListHeading);
  }

  // --- generated Índice at the stale TOC's position -----------------------
  const tocEntries = buildTocEntries(headings, { maxLevel: options.tocMaxLevel });
  const tocHtml = renderTocHtml(tocEntries);

  const mergedHtml = [
    frontMatterHtml,
    tocHtml,
    tableListPlaced ? "" : tableListHtml,
    afterTocFrontMatterHtml,
    masterBodyHtml,
    ...chapterHtmlParts,
  ]
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
    tableCaptions,
    warnings,
    passthrough: false,
    ...(sourceCover?.candidateName ? { candidateName: sourceCover.candidateName } : {}),
  };
}

const STALE_LIST_START = "<!--lauda:stale-table-list-start-->";
const STALE_LIST_END = "<!--lauda:stale-table-list-end-->";

/**
 * Brackets the master's own "Lista de tabelas" section (its heading and
 * everything up to the next heading at the same or a shallower level) with
 * comment fences, so the merge can swap it for the generated list once it
 * knows whether there is anything to list.
 */
function fenceTableListSection(
  blocks: HtmlBlock[],
): { blocks: HtmlBlock[]; fenced: HtmlBlock[] } | undefined {
  const start = blocks.findIndex(
    (block) => headingLevelOf(block.tag) !== undefined && isTableListTitle(blockText(block.html)),
  );
  if (start === -1) return undefined;
  const level = headingLevelOf(blocks[start].tag) as number;
  let end = start + 1;
  while (end < blocks.length) {
    const next = headingLevelOf(blocks[end].tag);
    if (next !== undefined && next <= level) break;
    end += 1;
  }
  return {
    blocks,
    fenced: [
      ...blocks.slice(0, start),
      { tag: "#fence", html: STALE_LIST_START },
      ...blocks.slice(start, end),
      { tag: "#fence", html: STALE_LIST_END },
      ...blocks.slice(end),
    ],
  };
}

interface EmitContext {
  sourceId: string;
  numbering: PageNumbering;
  /** Added to every heading level in these blocks (0 = keep levels). */
  levelShift: number;
  /** Floor for shifted heading levels (a chapter's assigned level). */
  minLevel: number;
  /** Headings landing on this level are part titles (chapter/front-matter titles). */
  partLevel: number;
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
    const part = newLevel === context.partLevel;
    context.headings.push({
      id,
      level: newLevel,
      text: blockText(block.html),
      sourceId: context.sourceId,
      numbering: context.numbering,
      part,
    });
    const classes = part
      ? context.numbering === "roman"
        ? [PART_TITLE_CLASS, FRONT_MATTER_TITLE_CLASS]
        : [PART_TITLE_CLASS]
      : [];
    return rewriteHeadingBlock(block.html, newLevel, id, classes);
  });
  return parts.join("\n");
}

/** Part titles carry a class so themes can treat them as one family (case, breaks). */
export const PART_TITLE_CLASS = "part-title";
/** Front-matter part titles additionally start their own page (DIO-45). */
export const FRONT_MATTER_TITLE_CLASS = "front-matter-title";

function rewriteHeadingBlock(html: string, newLevel: number, id: string, classes: string[]): string {
  const classAttr = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";
  return html
    .replace(/^<h[1-6]/i, `<h${newLevel} id="${id}"${classAttr}`)
    .replace(/<\/h[1-6]>\s*$/i, `</h${newLevel}>`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
