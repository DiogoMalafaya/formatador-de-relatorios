/**
 * Pagination math for the two-pass render (DIO-42). Pure functions, no
 * Chromium, no pdf-lib — `renderPaginated.ts` feeds them extracted page maps.
 *
 * The numbering scheme mirrors the real signed volume and the norms:
 *
 * - Front matter (cover, structure page, dedication, Índice) is one roman
 *   sequence starting at the cover (= page i, footer suppressed there).
 * - The body restarts at arabic 1 on its first page.
 * - Double-sided printing wants the body — and each major part (level-1 body
 *   heading) — to start on a recto (odd absolute) page, so a blank page
 *   ("página intencionalmente deixada em branco") is inserted where the
 *   preceding sequence ends on an odd absolute page.
 */

import { toRomanLowercase } from "../merge/toc.ts";
import type { MergedHeading } from "../merge/types.ts";
import { BODY_START_MARKER_ID } from "./template.ts";

export interface PaginationInput {
  headings: readonly MergedHeading[];
  /** 1-based absolute pages in the current render, keyed by anchor id. Includes `BODY_START_MARKER_ID`. */
  pages: ReadonlyMap<string, number>;
  /** Content pages in the current render (probe excluded). */
  totalPages: number;
  /**
   * Anchors the *rendered* HTML already carries a blank page before. The plan
   * strips their shift back out before deciding, so each pass re-derives the
   * blank set from blank-free geometry: a blank that a reflow made unnecessary
   * is dropped rather than joined by a second one.
   */
  existingBlanks?: ReadonlySet<string>;
}

export interface PaginationPlan {
  /**
   * Every anchor that needs a blank page immediately before it in the final
   * document — the absolute set, not a delta, so feeding it back as
   * `existingBlanks` on the next pass is a fixed point.
   * `BODY_START_MARKER_ID` means "before the body", a heading id means
   * "before that part heading". At most one blank per anchor: a blank shifts
   * parity by exactly one, so a second could never help.
   */
  blankAnchors: string[];
  /** Predicted final 1-based absolute page where the arabic sequence starts. */
  bodyStartPage: number;
  /** Predicted final total content pages. */
  totalPages: number;
  /** Predicted final absolute page per heading id (for convergence checks). */
  headingPages: Map<string, number>;
  /**
   * Sequence-local page numbers per heading id, for `fillTocPageNumbers`:
   * roman-sequence headings get their absolute page (the sequence starts at
   * the cover), arabic ones restart at 1 on the body's first page.
   */
  tocPageNumbers: Map<string, number>;
  /** True when the render already carries exactly the blanks this plan wants. */
  stable: boolean;
}

/**
 * Evaluates the current render's geometry: which blanks the final document
 * needs, and what every page number will be once they are in.
 */
export function planPagination(input: PaginationInput): PaginationPlan {
  const { headings, pages, totalPages } = input;
  const existingBlanks = input.existingBlanks ?? new Set<string>();

  const bodyStartRendered = resolveBodyStart(headings, pages, totalPages);

  // Recto-start anchors, in document order: the body itself, then each
  // level-1 body heading (major part). Deduplicate by page — one blank fixes
  // every anchor sharing that page.
  const anchors: { anchor: string; page: number }[] = [];
  const seenPages = new Set<number>();
  const push = (anchor: string, page: number | undefined) => {
    if (page === undefined || seenPages.has(page)) return;
    seenPages.add(page);
    anchors.push({ anchor, page });
  };
  const partLevel = partHeadingLevel(headings);
  push(BODY_START_MARKER_ID, bodyStartRendered);
  for (const heading of headings) {
    if (heading.numbering !== "arabic" || heading.level !== partLevel) continue;
    push(heading.id, pages.get(heading.id));
  }
  anchors.sort((a, b) => a.page - b.page);

  // Undo the shift the blanks already in the HTML contributed, so the decision
  // below is made against blank-free geometry. Each such blank sits
  // immediately before its anchor, so it shifted that anchor and everything
  // after it.
  const existingBlankPages = anchors
    .filter(({ anchor }) => existingBlanks.has(anchor))
    .map(({ page }) => page);
  const rawOf = (page: number) => page - existingBlankPages.filter((p) => p <= page).length;

  // Cascade: each inserted blank shifts everything at or after its page.
  const blankAnchors: string[] = [];
  const insertionPages: number[] = [];
  let shift = 0;
  for (const { anchor, page } of anchors) {
    const raw = rawOf(page);
    if ((raw + shift) % 2 === 0) {
      blankAnchors.push(anchor);
      insertionPages.push(raw);
      shift += 1;
    }
  }

  const shiftFor = (raw: number) => insertionPages.filter((p) => p <= raw).length;
  const finalPageOf = (page: number) => {
    const raw = rawOf(page);
    return raw + shiftFor(raw);
  };

  const bodyStartPage = finalPageOf(bodyStartRendered);
  const headingPages = new Map<string, number>();
  const tocPageNumbers = new Map<string, number>();
  for (const heading of headings) {
    const rendered = pages.get(heading.id);
    if (rendered === undefined) continue;
    const finalPage = finalPageOf(rendered);
    headingPages.set(heading.id, finalPage);
    tocPageNumbers.set(
      heading.id,
      heading.numbering === "roman" || finalPage < bodyStartPage ? finalPage : finalPage - bodyStartPage + 1,
    );
  }

  const stable =
    blankAnchors.length === existingBlanks.size &&
    blankAnchors.every((anchor) => existingBlanks.has(anchor));

  return {
    blankAnchors,
    bodyStartPage,
    totalPages: totalPages - existingBlankPages.length + blankAnchors.length,
    headingPages,
    tocPageNumbers,
    stable,
  };
}

/**
 * The heading level that counts as a "major part" of the body — the
 * shallowest level actually present in the arabic sequence.
 *
 * This is deliberately not hardcoded to 1: `mergeDocuments` demotes each
 * chapter file's top heading to depth 1 (an `<h2>`) so chapters slot under
 * the CV's hierarchy instead of becoming new `<h1>`s. A merged document
 * therefore usually has no level-1 body heading at all, and testing for one
 * would silently disable part breaks and recto starts on exactly the
 * multi-file documents this ticket exists to paginate.
 */
export function partHeadingLevel(headings: readonly MergedHeading[]): number | undefined {
  let level: number | undefined;
  for (const heading of headings) {
    if (heading.numbering !== "arabic") continue;
    if (level === undefined || heading.level < level) level = heading.level;
  }
  return level;
}

/**
 * Where the arabic sequence starts: the body-start marker's page, falling
 * back to the first arabic heading, falling back to "no body" (one past the
 * end, leaving the whole document roman).
 */
function resolveBodyStart(
  headings: readonly MergedHeading[],
  pages: ReadonlyMap<string, number>,
  totalPages: number,
): number {
  const marked = pages.get(BODY_START_MARKER_ID);
  if (marked !== undefined) return marked;

  let first: number | undefined;
  for (const heading of headings) {
    if (heading.numbering !== "arabic") continue;
    const page = pages.get(heading.id);
    if (page !== undefined && (first === undefined || page < first)) first = page;
  }
  return first ?? totalPages + 1;
}

/**
 * Per-page footer labels for a stable geometry. `null` = no footer (the
 * cover); roman lowercase for the rest of the front matter; arabic
 * restarting at 1 from `bodyStartPage`. Blank pages are ordinary members of
 * whichever sequence they fall in — the norms put the candidate name and a
 * sequential page number on every page.
 */
export function buildPageLabels(totalPages: number, bodyStartPage: number): (string | null)[] {
  const labels: (string | null)[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (page === 1) {
      labels.push(null);
    } else if (page < bodyStartPage) {
      labels.push(toRomanLowercase(page));
    } else {
      labels.push(String(page - bodyStartPage + 1));
    }
  }
  return labels;
}

/**
 * Running-header text per page (optional per the norms: section reference
 * only). Body pages carry the current major section's heading text — the
 * shallowest heading level present in the arabic sequence — starting on the
 * page after the one where the section begins, so a part's opening page
 * stays clean like the reference volume. Front matter and blanks get none.
 */
export function buildRunningHeaders(
  headings: readonly MergedHeading[],
  headingPages: ReadonlyMap<string, number>,
  totalPages: number,
  bodyStartPage: number,
  blankPages: ReadonlySet<number>,
): (string | null)[] {
  const bodyHeadings = headings.filter(
    (heading) => heading.numbering === "arabic" && headingPages.has(heading.id),
  );
  const sectionLevel = bodyHeadings.reduce((min, h) => Math.min(min, h.level), Number.POSITIVE_INFINITY);

  const sections = bodyHeadings
    .filter((heading) => heading.level === sectionLevel)
    .map((heading) => ({ page: headingPages.get(heading.id) as number, text: heading.text }))
    .sort((a, b) => a.page - b.page);

  const headers: (string | null)[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (page < bodyStartPage || blankPages.has(page)) {
      headers.push(null);
      continue;
    }
    // A page where a section opens stays clean. Parts are forced onto recto
    // pages, so such a page carries none of the previous section's content —
    // labelling it with that section would mislabel the page, and the norms
    // make the running header optional but never wrong.
    if (sections.some((section) => section.page === page)) {
      headers.push(null);
      continue;
    }
    let current: { page: number; text: string } | undefined;
    for (const section of sections) {
      if (section.page < page) current = section;
      else break;
    }
    headers.push(current ? current.text : null);
  }
  return headers;
}

export interface ResumoSpan {
  /** Final absolute page where the resumo section starts. */
  startPage: number;
  /** Pages between the resumo heading and the next same-or-shallower heading (or end of document). */
  pageCount: number;
}

const RESUMO_PATTERN = /^resumo( do curriculo)?$/;

/** Locates the "Resumo do currículo" section and how many pages it spans, if present. */
export function resumoSectionSpan(
  headings: readonly MergedHeading[],
  headingPages: ReadonlyMap<string, number>,
  totalPages: number,
): ResumoSpan | undefined {
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (!RESUMO_PATTERN.test(normalize(heading.text))) continue;

    const startPage = headingPages.get(heading.id);
    if (startPage === undefined) return undefined;

    let endPage = totalPages + 1;
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j].level > heading.level) continue;
      const page = headingPages.get(headings[j].id);
      if (page !== undefined) {
        endPage = page;
        break;
      }
    }

    return { startPage, pageCount: Math.max(1, endPage - startPage) };
  }
  return undefined;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}
