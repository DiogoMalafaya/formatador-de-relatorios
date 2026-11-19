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
 *   4. Body headings are numbered hierarchically ("1.", "1.2.", "1.2.3."),
 *      replacing any number the student typed (DIO-53).
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
  CAPTION_LIST_TITLES_PT,
  isCaptionListTitle,
  renderCaptionListHtml,
  renderTocHtml,
} from "./toc.ts";
import type { CaptionListKind } from "./toc.ts";
import { detectSourceCover, normalizeForMatch, splitMasterAfterToc } from "./frontMatter.ts";
import { convertAbbreviationLists } from "./glossary.ts";
import { SectionNumberer, sectionNumberHtml, stripManualNumber } from "./numbering.ts";
import { sourceCoverReplacedWarning, staleCaptionListReplacedWarning, staleTocReplacedWarning } from "./warnings.ts";
import { TableDesigner } from "../formatting/tables.ts";
import { FigureDesigner } from "../formatting/figures.ts";
import type { NumberedCaption } from "../formatting/captions.ts";
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
      figureCaptions: [],
      rectoHeadingIds: [],
      warnings: [],
      passthrough: true,
    };
  }

  const headingIdPrefix = options.headingIdPrefix ?? DEFAULT_HEADING_ID_PREFIX;
  const warnings: FormattingWarning[] = [];
  const headings: MergedHeading[] = [];
  let nextHeadingIndex = 0;

  const assignHeadingId = () => `${headingIdPrefix}-${nextHeadingIndex++}`;
  // One designer per caption kind for the whole document, called in document
  // order, so captions are numbered across chapter files (DIO-48/49).
  const tables = new TableDesigner();
  const figures = new FigureDesigner();
  const design = (blocks: HtmlBlock[], numbering: PageNumbering) =>
    figures.designBlocks(tables.designBlocks(blocks, numbering), numbering);

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

  // The master's own Lista de tabelas/figuras is stale for the same reason
  // its Índice is: fenced here, and swapped for the generated one below when
  // there are captions to list.
  for (const kind of CAPTION_LIST_KINDS) {
    const fenced = fenceCaptionListSection(frontMatterBlocks, kind);
    if (fenced) frontMatterBlocks = fenced;
    else afterTocFrontMatterBlocks = fenceCaptionListSection(afterTocFrontMatterBlocks, kind) ?? afterTocFrontMatterBlocks;
  }

  // The abbreviations list reads as a glossary (DIO-50), when it cleanly can.
  frontMatterBlocks = convertAbbreviationLists(frontMatterBlocks);
  afterTocFrontMatterBlocks = convertAbbreviationLists(afterTocFrontMatterBlocks);

  const frontMatter = (blocks: HtmlBlock[]) =>
    emitBlocks(design(blocks, "roman"), {
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
  // Tiers count from the shallowest chapter level any body part lands on;
  // a file given a deeper override then numbers as a section of the
  // chapter before it.
  const bodySourceIds = [...(masterBodyBlocks.length > 0 ? [master.id] : []), ...chapters.map((chapter) => chapter.id)];
  const bodyTopLevel = Math.min(...bodySourceIds.map(chapterLevelFor));
  const numberer = new SectionNumberer(options.sectionNumbering ?? "decimal");

  const bodyPart = (sourceId: string, blocks: HtmlBlock[]) => {
    const targetLevel = chapterLevelFor(sourceId);
    const levels = blocks
      .map((block) => headingLevelOf(block.tag))
      .filter((level): level is number => level !== undefined);
    // The shallowest heading anchors the demotion. For a chapter file that's
    // normally its first heading; a file opening on an h2 then an h1 still
    // slots in at the chapter level.
    const topHeadingLevel = levels.length > 0 ? Math.min(...levels) : undefined;

    return emitBlocks(design(blocks, "arabic"), {
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
      sectionNumbers: { numberer, topLevel: bodyTopLevel },
    });
  };

  // Emission order is document order, so `headings` stays in document order.
  let frontMatterHtml = frontMatter(frontMatterBlocks);
  // Where a generated list's heading goes in `headings` when there's no
  // stale list to take the place of: right after the Índice.
  const afterTocHeadingIndex = headings.length;
  let afterTocFrontMatterHtml = frontMatter(afterTocFrontMatterBlocks);
  const masterBodyHtml = bodyPart(master.id, masterBodyBlocks);
  const chapterHtmlParts = chapters.map((chapter) =>
    bodyPart(chapter.id, splitTopLevelBlocks(chapter.document.html)),
  );

  // --- generated Lista de tabelas / figuras (DIO-48/49) --------------------
  // Where the master had its own, in that place; otherwise right after the
  // Índice (tables, then figures). A stale list is kept as the student wrote
  // it when we found no caption to list: replacing it with nothing would lose
  // their content.
  const captionsByKind: Record<CaptionListKind, NumberedCaption[]> = {
    table: tables.captions,
    figure: figures.captions,
  };
  const unplacedListsHtml: string[] = [];
  let unplacedHeadingIndex = afterTocHeadingIndex;
  for (const kind of CAPTION_LIST_KINDS) {
    const captions = captionsByKind[kind];
    const listHeading: MergedHeading = {
      id: `${headingIdPrefix}-${kind}-list`,
      level: 1,
      text: CAPTION_LIST_TITLES_PT[kind],
      sourceId: master.id,
      numbering: "roman",
      part: true,
    };
    const listHtml =
      captions.length > 0
        ? renderCaptionListHtml(
            kind,
            captions.map((caption) => ({ captionId: caption.id, text: caption.text, numbering: caption.numbering })),
            { headingId: listHeading.id },
          )
        : "";

    let placed = false;
    const resolveFence = (html: string) => {
      const [startMarker, endMarker] = fenceMarkers(kind);
      const start = html.indexOf(startMarker);
      const end = html.indexOf(endMarker);
      if (start === -1 || end === -1) return html;
      if (listHtml.length === 0) return html.replace(startMarker, "").replace(endMarker, "");
      const region = html.slice(start, end);
      const droppedIds = new Set([...region.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]));
      const firstDropped = headings.findIndex((heading) => droppedIds.has(heading.id));
      for (let i = headings.length - 1; i >= 0; i -= 1) {
        if (droppedIds.has(headings[i].id)) headings.splice(i, 1);
      }
      headings.splice(firstDropped === -1 ? headings.length : firstDropped, 0, listHeading);
      placed = true;
      warnings.push(staleCaptionListReplacedWarning(kind));
      return `${html.slice(0, start)}${listHtml}${html.slice(end + endMarker.length)}`;
    };
    frontMatterHtml = resolveFence(frontMatterHtml);
    afterTocFrontMatterHtml = resolveFence(afterTocFrontMatterHtml);
    if (listHtml.length > 0 && !placed) {
      headings.splice(unplacedHeadingIndex, 0, listHeading);
      unplacedHeadingIndex += 1;
      unplacedListsHtml.push(listHtml);
    }
  }

  // --- generated Índice at the stale TOC's position -----------------------
  const tocEntries = buildTocEntries(headings, { depth: options.tocDepth });
  const tocHtml = renderTocHtml(tocEntries);

  const mergedHtml = [
    frontMatterHtml,
    tocHtml,
    ...unplacedListsHtml,
    afterTocFrontMatterHtml,
    masterBodyHtml,
    ...chapterHtmlParts,
  ]
    .filter((part) => part.length > 0)
    .join("\n");

  const document: ParsedDocument = {
    html: mergedHtml,
    imageCount: countImages(mergedHtml),
    images: [],
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
    tableCaptions: tables.captions,
    figureCaptions: figures.captions,
    // A dedication or epigraph opens on a recto, alone on its page (DIO-50).
    rectoHeadingIds: headings
      .filter((heading) => heading.numbering === "roman" && heading.part && RECTO_FRONT_MATTER_PATTERN.test(normalizeForMatch(heading.text)))
      .map((heading) => heading.id),
    warnings,
    passthrough: false,
    ...(sourceCover?.candidateName ? { candidateName: sourceCover.candidateName } : {}),
  };
}

const CAPTION_LIST_KINDS: readonly CaptionListKind[] = ["table", "figure"];

/** Front-matter pages that stand alone on a recto, like the reference CVs' dedication. */
const RECTO_FRONT_MATTER_PATTERN = /^(dedicatoria|epigrafe)$/;

function fenceMarkers(kind: CaptionListKind): [string, string] {
  return [`<!--lauda:stale-${kind}-list-start-->`, `<!--lauda:stale-${kind}-list-end-->`];
}

/**
 * Brackets the master's own caption list section (its heading and
 * everything up to the next heading at the same or a shallower level) with
 * comment fences, so the merge can swap it for the generated list once it
 * knows whether there is anything to list. Undefined when there's none.
 */
function fenceCaptionListSection(blocks: HtmlBlock[], kind: CaptionListKind): HtmlBlock[] | undefined {
  const start = blocks.findIndex(
    (block) => headingLevelOf(block.tag) !== undefined && isCaptionListTitle(blockText(block.html), kind),
  );
  if (start === -1) return undefined;
  const level = headingLevelOf(blocks[start].tag) as number;
  let end = start + 1;
  while (end < blocks.length) {
    const next = headingLevelOf(blocks[end].tag);
    if (next !== undefined && next <= level) break;
    end += 1;
  }
  const [startMarker, endMarker] = fenceMarkers(kind);
  return [
    ...blocks.slice(0, start),
    { tag: "#fence", html: startMarker },
    ...blocks.slice(start, end),
    { tag: "#fence", html: endMarker },
    ...blocks.slice(end),
  ];
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
  /** Body only: numbers headings by tier below `topLevel` (DIO-53). */
  sectionNumbers?: { numberer: SectionNumberer; topLevel: number };
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

    let html = block.html;
    let section: { tier: number; number?: string } | undefined;
    if (context.sectionNumbers) {
      section = context.sectionNumbers.numberer.next(newLevel - context.sectionNumbers.topLevel + 1);
      // A typed number goes only where ours replaces it; past the numbered
      // tiers the student's own numbering is all there is.
      if (section.number) html = replaceHeadingContent(html, stripManualNumber(headingContent(html)));
    }

    context.headings.push({
      id,
      level: newLevel,
      text: blockText(html),
      sourceId: context.sourceId,
      numbering: context.numbering,
      part,
      ...(section ? { tier: section.tier } : {}),
      ...(section?.number ? { number: section.number } : {}),
    });
    const classes = part
      ? context.numbering === "roman"
        ? [PART_TITLE_CLASS, FRONT_MATTER_TITLE_CLASS]
        : [PART_TITLE_CLASS]
      : [];
    if (section?.number) {
      html = replaceHeadingContent(html, sectionNumberHtml(section.number, SECTION_NUMBER_CLASS) + headingContent(html));
    }
    return rewriteHeadingBlock(html, newLevel, id, classes);
  });
  return parts.join("\n");
}

/** Part titles carry a class so themes can treat them as one family (case, breaks). */
export const PART_TITLE_CLASS = "part-title";
/** Front-matter part titles additionally start their own page (DIO-45). */
export const FRONT_MATTER_TITLE_CLASS = "front-matter-title";
/** The generated section number inside a body heading (DIO-53). */
export const SECTION_NUMBER_CLASS = "section-number";

const HEADING_PARTS = /^(<h[1-6][^>]*>)([\s\S]*)(<\/h[1-6]>\s*)$/i;

function headingContent(html: string): string {
  return HEADING_PARTS.exec(html)?.[2] ?? html;
}

function replaceHeadingContent(html: string, content: string): string {
  const match = HEADING_PARTS.exec(html);
  return match ? `${match[1]}${content}${match[3]}` : html;
}

function rewriteHeadingBlock(html: string, newLevel: number, id: string, classes: string[]): string {
  const classAttr = classes.length > 0 ? ` class="${classes.join(" ")}"` : "";
  return html
    .replace(/^<h[1-6]/i, `<h${newLevel} id="${id}"${classAttr}`)
    .replace(/<\/h[1-6]>\s*$/i, `</h${newLevel}>`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
