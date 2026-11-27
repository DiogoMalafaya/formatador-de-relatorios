/**
 * Outer-edge chapter tabs (DIO-58, PRD US10/Q7): a thumb index for the
 * printed, bound CV.
 *
 * One tab per body chapter (the same major parts as the dividers,
 * `partHeadings`), stacked in chapter order down the outer margin, beside
 * the text block. The current chapter's tab is emphasised and the others
 * stay visible but quieter. The tabs are mirrored like the DIO-55
 * furniture: on the right of a recto (odd absolute page) and on the left of
 * a verso. They're additive to the running header, which stays at the top
 * outer corner. The tabs run along the outer *vertical* edge, so the two
 * never meet.
 *
 * Only print-delivered profiles that allow a header get tabs (PRD Q7: under
 * MFR a tab is the Colégio's "cabeçalho com referência à secção"). A
 * PDF-delivered profile (Pediatria) is read on screen and never has them.
 *
 * The geometry lives here, apart from `stamp.ts`, because the compliance
 * checker needs the same band. Text in the band on a page's outer edge is a
 * sanctioned tab, not body text in the margin (`checkPdf.ts`). Pure, so no
 * pdf-lib in here.
 */

import type { PageMargins, RuleSet } from "../formatting/ruleSet.ts";
import type { MergedHeading } from "../merge/types.ts";

const POINTS_PER_CM = 72 / 2.54;

/** Clear space between the text block and the tab band. */
export const TAB_GAP_FROM_TEXT_CM = 0.3;
/** Inset from the paper edge: visible on a standard A4 print, not a bleed (there is no bleed box). */
export const TAB_EDGE_INSET_CM = 0.4;
/** Tallest a tab gets; shorter when many chapters share the text block's height. */
export const TAB_MAX_HEIGHT_CM = 2.2;
/** Vertical gap between stacked tabs. */
export const TAB_SPACING_PT = 3;

/** Whether a profile can carry chapter tabs at all (DIO-58 default 2). */
export function chapterTabsAvailable(ruleSet: Pick<RuleSet, "page" | "header">): boolean {
  return ruleSet.page.delivery === "print" && ruleSet.header.allowed;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The tab band of one page, in PDF points (origin bottom-left): the outer
 * margin minus the gap to the text block and the inset from the paper edge,
 * spanning the text block's height. Odd absolute pages are rectos.
 */
export function tabBand(
  page: { width: number; height: number },
  margins: PageMargins,
  pageNumber: number,
): Rect {
  const recto = pageNumber % 2 === 1;
  const gap = TAB_GAP_FROM_TEXT_CM * POINTS_PER_CM;
  const inset = TAB_EDGE_INSET_CM * POINTS_PER_CM;
  const bottom = margins.bottomCm * POINTS_PER_CM;
  const top = page.height - margins.topCm * POINTS_PER_CM;
  const x = recto ? page.width - margins.rightCm * POINTS_PER_CM + gap : inset;
  const right = recto ? page.width - inset : margins.leftCm * POINTS_PER_CM - gap;
  return { x, y: bottom, width: Math.max(0, right - x), height: Math.max(0, top - bottom) };
}

/** The `count` tabs, top to bottom in chapter order, inside a band. */
export function tabRects(band: Rect, count: number): Rect[] {
  if (count <= 0) return [];
  const maxHeight = TAB_MAX_HEIGHT_CM * POINTS_PER_CM;
  const height = Math.min(maxHeight, (band.height - TAB_SPACING_PT * (count - 1)) / count);
  const top = band.y + band.height;
  return Array.from({ length: count }, (_, index) => ({
    x: band.x,
    y: top - (index + 1) * height - index * TAB_SPACING_PT,
    width: band.width,
    height,
  }));
}

/** One chapter's tab: its number, and its title for a theme that has room for words. */
export interface ChapterTab {
  number: string;
  title: string;
}

export interface ChapterTabPlan {
  tabs: ChapterTab[];
  /** Per page (0-based index = page − 1): the current chapter's tab index, or null for no tabs. */
  current: (number | null)[];
}

/**
 * Which chapter each page belongs to. A chapter starts on its divider page
 * when it has one, otherwise on its heading's page. Pages before the first
 * chapter (the cover and the front matter) and truly blank fillers get
 * nothing (DIO-51). Divider pages belong to their chapter.
 */
export function planChapterTabs(input: {
  chapters: readonly MergedHeading[];
  /** Absolute page each chapter starts on, same order as `chapters`; undefined = not in the PDF. */
  startPages: readonly (number | undefined)[];
  totalPages: number;
  blankPages: ReadonlySet<number>;
}): ChapterTabPlan {
  const placed = input.chapters
    .map((chapter, index) => ({ chapter, page: input.startPages[index] }))
    .filter((entry): entry is { chapter: MergedHeading; page: number } => entry.page !== undefined)
    .sort((a, b) => a.page - b.page);

  const tabs = placed.map(({ chapter }, index) => ({
    number: chapter.number?.replace(/\.$/, "") || String(index + 1),
    title: chapter.text,
  }));

  const current: (number | null)[] = [];
  let tab = -1;
  for (let page = 1; page <= input.totalPages; page += 1) {
    while (tab + 1 < placed.length && placed[tab + 1].page <= page) tab += 1;
    current.push(page === 1 || tab < 0 || input.blankPages.has(page) ? null : tab);
  }
  return { tabs, current };
}
