/**
 * Índice detection and generation (DIO-41).
 *
 * Detection finds a stale table of contents in the master document so it can
 * be replaced. Generation produces the new Índice in two passes: pass 1 emits
 * entries with machine-readable page-number placeholders (so the document can
 * be rendered once and a heading-id → page map extracted — DIO-42), pass 2
 * fills the placeholders from that map, roman for front matter, arabic for
 * the body. Page numbers therefore come from the actual render, never from an
 * estimate (PRD G2, zero tolerance).
 */

import { escapeHtml } from "../html.ts";
import { blockText, headingLevelOf } from "./blocks.ts";
import type { HtmlBlock } from "./blocks.ts";
import type { MergedHeading, PageNumbering, TocEntry } from "./types.ts";

/* ------------------------------ detection ------------------------------ */

export interface DetectedToc {
  /** Index (into the block list) of the TOC's title heading. */
  startIndex: number;
  /** Index of the last block that belongs to the TOC (inclusive). */
  endIndex: number;
  /** Plain text of the title heading, e.g. "Índice". */
  title: string;
}

/** Accent-insensitive TOC title names: Índice/Indice, Sumário/Sumario, "Tabela de conteúdos". */
const TOC_TITLE_PATTERN = /^(indice|sumario|tabela de conteudos)$/;

/**
 * A TOC entry line: something ending in a page number (arabic or roman)
 * preceded by a dotted/ellipsis/tab leader — "Saúde Materna ...... 12".
 */
const DOTTED_LEADER_ENTRY_PATTERN = /(\.{2,}|…|\t)\s*(\d{1,3}|[ivxlcdm]{1,7})\s*$/i;

function normalizeTitle(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Heuristic TOC detection over a document's top-level blocks: a heading named
 * Índice/Indice/Sumário immediately followed by dotted-leader-like paragraph
 * entries or by a list of headings. Requires at least one entry-like block —
 * a lone heading that merely *says* "Índice" is not treated as a TOC.
 */
export function detectStaleToc(blocks: HtmlBlock[]): DetectedToc | undefined {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (headingLevelOf(block.tag) === undefined) continue;

    const title = blockText(block.html);
    if (!TOC_TITLE_PATTERN.test(normalizeTitle(title))) continue;

    let end = i;
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (!isTocEntryBlock(blocks[j])) break;
      end = j;
    }

    if (end > i) {
      return { startIndex: i, endIndex: end, title };
    }
  }
  return undefined;
}

function isTocEntryBlock(block: HtmlBlock): boolean {
  if (headingLevelOf(block.tag) !== undefined) return false;
  if (block.tag === "ul" || block.tag === "ol") {
    return blockText(block.html).length > 0;
  }
  if (block.tag === "p") {
    return DOTTED_LEADER_ENTRY_PATTERN.test(blockText(block.html));
  }
  return false;
}

/* ------------------------------ generation ----------------------------- */

export interface GenerateTocOptions {
  /** Deepest merged heading level included. Default 3. */
  maxLevel?: number;
  /** Title of the generated Índice. Default "Índice". */
  titlePt?: string;
}

const DEFAULT_TOC_MAX_LEVEL = 3;

/** Selects which merged headings appear in the Índice, preserving document order. */
export function buildTocEntries(
  headings: MergedHeading[],
  options: GenerateTocOptions = {},
): TocEntry[] {
  const maxLevel = options.maxLevel ?? DEFAULT_TOC_MAX_LEVEL;
  return headings
    .filter((heading) => heading.level <= maxLevel)
    .map((heading) => ({
      headingId: heading.id,
      depth: heading.level,
      text: heading.text,
      numbering: heading.numbering,
    }));
}

/**
 * Pass-1 form: Índice HTML whose page numbers are empty placeholder spans
 * carrying `data-toc-heading` (the target heading's anchor id) and
 * `data-toc-numbering` (roman/arabic). `fillTocPageNumbers` resolves them.
 */
export function renderTocHtml(entries: TocEntry[], options: GenerateTocOptions = {}): string {
  const title = options.titlePt ?? "Índice";
  const items = entries
    .map(
      (entry) =>
        `<li class="toc-entry toc-depth-${entry.depth}">` +
        `<span class="toc-entry-text">${escapeHtml(entry.text)}</span>` +
        `<span class="toc-leader"></span>` +
        tocPagePlaceholder(entry.headingId, entry.numbering) +
        `</li>`,
    )
    .join("\n");
  return `<nav class="generated-toc"><h1 class="toc-title">${escapeHtml(title)}</h1><ol class="toc-list">\n${items}\n</ol></nav>`;
}

export function tocPagePlaceholder(headingId: string, numbering: PageNumbering): string {
  return `<span class="toc-page" data-toc-heading="${escapeHtml(headingId)}" data-toc-numbering="${numbering}"></span>`;
}

/**
 * Dotted-leader layout for the generated Índice — ship this alongside the
 * rule-set CSS when the merge pipeline is wired up (DIO-42). Black only, per
 * the norms.
 */
export const GENERATED_TOC_CSS = `
.generated-toc { break-after: page; page-break-after: always; }
.generated-toc .toc-list { list-style: none; margin: 0; padding: 0; }
.generated-toc .toc-entry { display: flex; align-items: baseline; column-gap: 0.4em; }
.generated-toc .toc-leader { flex: 1 1 auto; min-width: 2em; border-bottom: 1px dotted #000; transform: translateY(-0.3em); }
.generated-toc .toc-page { white-space: nowrap; }
.generated-toc .toc-depth-2 { padding-left: 0; }
.generated-toc .toc-depth-3 { padding-left: 1.5em; }
.generated-toc .toc-depth-4 { padding-left: 3em; }
.generated-toc .toc-depth-5 { padding-left: 4.5em; }
.generated-toc .toc-depth-6 { padding-left: 6em; }
`;

/* -------------------------------- pass 2 ------------------------------- */

export interface FillTocResult {
  html: string;
  /** Heading ids whose page number was not in the map — their slot stays empty. */
  missingHeadingIds: string[];
}

const PLACEHOLDER_PATTERN =
  /<span class="toc-page" data-toc-heading="([^"]*)" data-toc-numbering="(roman|arabic)"><\/span>/g;

/**
 * Pass-2 form: fills every placeholder emitted by `renderTocHtml` /
 * `tocPagePlaceholder` from the rendered page map. Page numbers in the map
 * are sequence-local (front matter counted in its roman sequence, body
 * restarting at 1) — the render pass owns pagination math, this owns display.
 */
export function fillTocPageNumbers(
  html: string,
  pageNumbers: ReadonlyMap<string, number>,
): FillTocResult {
  const missingHeadingIds: string[] = [];
  const filled = html.replace(PLACEHOLDER_PATTERN, (whole, headingId: string, numbering: PageNumbering) => {
    const page = pageNumbers.get(headingId);
    if (page === undefined) {
      missingHeadingIds.push(headingId);
      return whole;
    }
    return `<span class="toc-page">${formatTocPageNumber(page, numbering)}</span>`;
  });
  return { html: filled, missingHeadingIds };
}

export function formatTocPageNumber(page: number, numbering: PageNumbering): string {
  return numbering === "roman" ? toRomanLowercase(page) : String(page);
}

const ROMAN_DIGITS: readonly [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"],
  [100, "c"], [90, "xc"], [50, "l"], [40, "xl"],
  [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

/** Lowercase roman numerals — the front-matter convention ("i, ii, iii"). */
export function toRomanLowercase(value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`roman numeral requires a positive integer, got ${value}`);
  }
  let remaining = value;
  let out = "";
  for (const [magnitude, digits] of ROMAN_DIGITS) {
    while (remaining >= magnitude) {
      out += digits;
      remaining -= magnitude;
    }
  }
  return out;
}
