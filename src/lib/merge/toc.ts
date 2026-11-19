/**
 * Índice detection and generation (DIO-41).
 *
 * Detection finds a stale table of contents in the master document so it can
 * be replaced. Generation produces the new Índice in two passes: pass 1 emits
 * entries with machine-readable page-number placeholders (so the document can
 * be rendered once and a heading-id → page map extracted — DIO-42), pass 2
 * fills the placeholders from that map with the page as printed (one arabic
 * sequence from the cover, DIO-51). Page numbers therefore come from the
 * actual render, never from an estimate (PRD G2, zero tolerance).
 */

import { escapeHtml } from "../html.ts";
import { blockText, headingLevelOf } from "./blocks.ts";
import type { HtmlBlock } from "./blocks.ts";
import type { MergedHeading, PageNumbering, TocEntry } from "./types.ts";
import { sectionNumberHtml } from "./numbering.ts";

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
  /**
   * How deep the Índice goes (DIO-53): body headings to this tier
   * (chapter = 1), front-matter headings to this level. Default 3.
   */
  depth?: number;
  /** Title of the generated Índice. Default "Índice". */
  titlePt?: string;
}

export const DEFAULT_TOC_DEPTH = 3;

/** Selects which merged headings appear in the Índice, preserving document order. */
export function buildTocEntries(
  headings: MergedHeading[],
  options: GenerateTocOptions = {},
): TocEntry[] {
  const depth = options.depth ?? DEFAULT_TOC_DEPTH;
  return headings
    .filter((heading) => (heading.tier ?? heading.level) <= depth)
    .map((heading) => ({
      headingId: heading.id,
      depth: heading.level,
      text: heading.text,
      numbering: heading.numbering,
      ...(heading.part ? { part: true } : {}),
      ...(heading.tier !== undefined ? { tier: heading.tier } : {}),
      ...(heading.number ? { number: heading.number } : {}),
    }));
}

function tocEntryClasses(entry: TocEntry): string {
  return [
    "toc-entry",
    `toc-depth-${entry.depth}`,
    ...(entry.tier !== undefined ? [`toc-tier-${entry.tier}`] : []),
    ...(entry.part ? ["toc-part"] : []),
  ].join(" ");
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
        `<li class="${tocEntryClasses(entry)}">` +
        `<span class="toc-entry-text">` +
        (entry.number ? sectionNumberHtml(escapeHtml(entry.number), "toc-number") : "") +
        `${escapeHtml(entry.text)}</span>` +
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

/* -------------------- Lista de tabelas / Lista de figuras -------------------- */

/** Which generated caption list: tables (DIO-48) or figures (DIO-49). */
export type CaptionListKind = "table" | "figure";

export const TABLE_LIST_TITLE_PT = "Lista de tabelas";
export const FIGURE_LIST_TITLE_PT = "Lista de figuras";

export const CAPTION_LIST_TITLES_PT: Readonly<Record<CaptionListKind, string>> = {
  table: TABLE_LIST_TITLE_PT,
  figure: FIGURE_LIST_TITLE_PT,
};

/** The master's own list, accent-insensitive: "Lista de tabelas", "Índice de quadros", "Lista das figuras"… */
const CAPTION_LIST_TITLE_PATTERNS: Readonly<Record<CaptionListKind, RegExp>> = {
  table: /^(lista|indice|index) (de|das|dos) (tabelas|quadros)$/,
  figure: /^(lista|indice|index) (de|das|dos) (figuras|imagens|ilustracoes|graficos)$/,
};

export function isCaptionListTitle(title: string, kind: CaptionListKind): boolean {
  return CAPTION_LIST_TITLE_PATTERNS[kind].test(normalizeTitle(title).replace(/\s+/g, " "));
}

/** One entry of a generated caption list: a numbered caption. */
export interface CaptionListEntry {
  /** Anchor id of the caption paragraph. */
  captionId: string;
  text: string;
  numbering: PageNumbering;
}

/**
 * A caption list, in the Índice's pass-1 form: page numbers are the same
 * placeholders, keyed by the caption's anchor id, so the same
 * `fillTocPageNumbers` resolves them from the same page map.
 */
export function renderCaptionListHtml(
  kind: CaptionListKind,
  entries: readonly CaptionListEntry[],
  options: { headingId?: string } = {},
): string {
  const items = entries
    .map(
      (entry) =>
        `<li class="toc-entry toc-depth-2">` +
        `<span class="toc-entry-text">${escapeHtml(entry.text)}</span>` +
        `<span class="toc-leader"></span>` +
        tocPagePlaceholder(entry.captionId, entry.numbering) +
        `</li>`,
    )
    .join("\n");
  // The title is a front-matter part like the abbreviations list, so it gets
  // an Índice entry; with an id, the page map can find it.
  const idAttr = options.headingId ? ` id="${escapeHtml(options.headingId)}"` : "";
  return `<nav class="generated-toc generated-caption-list generated-${kind}-list"><h1${idAttr} class="toc-title part-title front-matter-title">${escapeHtml(CAPTION_LIST_TITLES_PT[kind])}</h1><ol class="toc-list">\n${items}\n</ol></nav>`;
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

/* Styled by level (DIO-53): chapters bold with air above, sections and
   subsections indented under them. Weight and indentation only: the size
   stays the body's, which explicit profiles fix. Numbers sit in a column
   per tier so titles of one level line up. */
.generated-toc .toc-part { font-weight: bold; margin-top: 0.45em; }
.generated-toc .toc-tier-1 { padding-left: 0; font-weight: bold; margin-top: 0.45em; }
.generated-toc .toc-tier-2 { padding-left: 1.85em; }
.generated-toc .toc-tier-3 { padding-left: 4.1em; }
.generated-toc .toc-tier-4 { padding-left: 7.15em; }
.generated-toc .toc-number { display: inline-block; }
.generated-toc .toc-tier-1 .toc-number { min-width: 1.6em; }
.generated-toc .toc-tier-2 .toc-number { min-width: 2em; }
.generated-toc .toc-tier-3 .toc-number { min-width: 2.8em; }
.generated-toc .toc-entry-text { flex: 0 1 auto; }

/* Numbers in headings (DIO-53). */
.section-number { font-variant-numeric: tabular-nums; }
/* Each generated caption list (DIO-48/49) is its own front-matter page wherever it sits. */
.generated-caption-list { break-before: page; page-break-before: always; }

/* Document structure (DIO-45). Part titles (chapter titles, front-matter
   titles) share one case wherever they appear, so chapter files typed in
   different cases still read as one document. Uppercase is the case that
   needs no guessing: title-casing would mangle acronyms. */
.part-title, .generated-toc .toc-title, .generated-toc .toc-part .toc-entry-text { text-transform: uppercase; }
`;

/* -------------------------------- pass 2 ------------------------------- */

export interface FillTocResult {
  html: string;
  /** Heading ids whose page number was not in the map — their slot stays empty. */
  missingHeadingIds: string[];
}

const PLACEHOLDER_PATTERN =
  /<span class="toc-page" data-toc-heading="([^"]*)" data-toc-numbering="(?:roman|arabic)"><\/span>/g;

/**
 * Pass-2 form: fills every placeholder emitted by `renderTocHtml` /
 * `tocPagePlaceholder` from the rendered page map. One arabic sequence from
 * the cover (DIO-51), so the number is the page as printed; the render pass
 * owns pagination math, this owns display.
 */
export function fillTocPageNumbers(
  html: string,
  pageNumbers: ReadonlyMap<string, number>,
): FillTocResult {
  const missingHeadingIds: string[] = [];
  const filled = html.replace(PLACEHOLDER_PATTERN, (whole, headingId: string) => {
    const page = pageNumbers.get(headingId);
    if (page === undefined) {
      missingHeadingIds.push(headingId);
      return whole;
    }
    return `<span class="toc-page">${formatTocPageNumber(page)}</span>`;
  });
  return { html: filled, missingHeadingIds };
}

export function formatTocPageNumber(page: number): string {
  return String(page);
}
