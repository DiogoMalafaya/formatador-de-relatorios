/**
 * Merge engine public surface (DIO-41).
 *
 * Library core only — pipeline wiring (multi-file upload, two-pass render)
 * lands with DIO-40/DIO-42.
 */

export { mergeDocuments } from "./merge.ts";
export {
  buildTocEntries,
  detectStaleToc,
  fillTocPageNumbers,
  formatTocPageNumber,
  renderTocHtml,
  tocPagePlaceholder,
  toRomanLowercase,
  GENERATED_TOC_CSS,
} from "./toc.ts";
export type { DetectedToc, FillTocResult, GenerateTocOptions } from "./toc.ts";
export { staleTocReplacedWarning } from "./warnings.ts";
export { splitTopLevelBlocks, blockText, headingLevelOf } from "./blocks.ts";
export type { HtmlBlock } from "./blocks.ts";
export type {
  MergedHeading,
  MergeOptions,
  MergeResult,
  MergeSource,
  PageNumbering,
  TocEntry,
} from "./types.ts";
