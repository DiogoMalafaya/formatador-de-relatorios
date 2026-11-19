/**
 * Merge engine types (DIO-41).
 *
 * A real CV arrives as one "documento principal" (cover text, structure page,
 * dedication, an Índice) plus N chapter files. The merge engine concatenates
 * them into ONE `ParsedDocument`-shaped model so everything downstream —
 * rule-set CSS, cover merge, validations, Chromium render — keeps consuming
 * the exact shape it consumes today.
 */

import type { ParsedDocument } from "../formatting/parseDocx.ts";
import type { FormattingWarning } from "../formatting/warnings.ts";
import type { TableCaption } from "../formatting/tables.ts";
import type { NumberedCaption } from "../formatting/captions.ts";

/** One source document in the merge: the master or one ordered chapter. */
export interface MergeSource {
  /**
   * Stable caller-chosen identifier (upload id, filename slug). Used to key
   * per-file depth overrides and to trace which file a heading came from.
   */
  id: string;
  document: ParsedDocument;
}

/** Which page-numbering sequence a heading's page belongs to. */
export type PageNumbering = "roman" | "arabic";

/** A heading in the merged document, addressable by the anchor id injected into the HTML. */
export interface MergedHeading {
  /** Anchor id injected as `id="…"` on the heading tag in the merged HTML. */
  id: string;
  /** Heading level in the merged document (1 = `<h1>` … 6 = `<h6>`). */
  level: number;
  /** Plain text of the heading, entities decoded, whitespace collapsed. */
  text: string;
  /** `MergeSource.id` of the file this heading came from. */
  sourceId: string;
  /** Roman for front-matter headings, arabic for body headings (PRD US8). */
  numbering: PageNumbering;
  /**
   * A part title: a chapter's top heading (body) or a level-1 front-matter
   * title. Themes style these as one family; carries `class="part-title"`.
   */
  part?: boolean;
}

/** One generated Índice entry. Page number is a placeholder until pass 2 fills it. */
export interface TocEntry {
  /** The `MergedHeading.id` this entry points at. */
  headingId: string;
  /** Indent depth in the Índice — the heading's merged level. */
  depth: number;
  text: string;
  numbering: PageNumbering;
  /** Mirrors `MergedHeading.part`, so the Índice styles part titles like the headings. */
  part?: boolean;
}

export interface MergeOptions {
  /**
   * Depth at which chapter files slot in under the body: depth 1 means each
   * chapter's top heading becomes an `<h2>` (a section of the CV, not a new
   * `<h1>`), its internal hierarchy shifting with it. Default 1 — the
   * automatic strategy. PRD §12 Q2 (automatic vs manual assignment) is still
   * open, so per-file manual control lives in `chapterDepthOverrides` rather
   * than in a different function.
   */
  chapterDepth?: number;
  /** Per-file override of `chapterDepth`, keyed by `MergeSource.id`. */
  chapterDepthOverrides?: Record<string, number>;
  /** Deepest merged heading level listed in the generated Índice. Default 3. */
  tocMaxLevel?: number;
  /** Prefix for generated heading anchor ids. Default "merged-heading". */
  headingIdPrefix?: string;
}

export interface MergeResult {
  /**
   * The merged document, same shape the single-file pipeline consumes.
   * Counts (images, tables, headings, words) are recomputed over the merged
   * HTML so the existing validations/warnings run against it unchanged.
   */
  document: ParsedDocument;
  /** Every heading in the merged document, in document order. */
  headings: MergedHeading[];
  /** The generated Índice entries (empty on single-document pass-through). */
  tocEntries: TocEntry[];
  /** True when a stale Índice was found in the master and replaced. */
  replacedStaleToc: boolean;
  /**
   * Numbered table captions in document order (DIO-48). Their anchor ids go
   * into the page map so the generated Lista de tabelas gets exact pages.
   */
  tableCaptions: TableCaption[];
  /** Numbered figure captions in document order (DIO-49), for the Lista de figuras. */
  figureCaptions: NumberedCaption[];
  /** Front-matter part headings that open on a recto: dedication, epigraph (DIO-50). */
  rectoHeadingIds: string[];
  /** Merge-specific warnings (stale-TOC replacement). Source-document warnings keep flowing via `document`'s counts. */
  warnings: FormattingWarning[];
  /** True when there was nothing to merge and the master passed through byte-identical. */
  passthrough: boolean;
  /**
   * The candidate's name, read from the master's own cover before it was
   * dropped (DIO-45). Preferred over `extractCandidateName`, which would pick
   * the first front-matter title in a merged document.
   */
  candidateName?: string;
}
