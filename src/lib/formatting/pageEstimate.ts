/**
 * Rough page-count estimate (DIO-10).
 *
 * Purely for the "possibly exceeds the page limit" warning ahead of PDF
 * rendering — the definitive count only exists once DIO-11 actually renders
 * the document. Baseline is calibrated to the parameters every rule set seen
 * so far shares (12pt, 1.5 line spacing, 2.5cm margins on A4): ~400 words per
 * page at those settings, scaled for rule sets that differ.
 */

const BASELINE_WORDS_PER_PAGE = 400;
const BASELINE_FONT_SIZE_PT = 12;
const BASELINE_LINE_SPACING = 1.5;

export function estimatePageCount(wordCount: number, ruleSet: { font: { sizePt: number }; lineSpacing: number }): number {
  if (wordCount === 0) return 0;
  const wordsPerPage =
    BASELINE_WORDS_PER_PAGE *
    (BASELINE_FONT_SIZE_PT / ruleSet.font.sizePt) *
    (BASELINE_LINE_SPACING / ruleSet.lineSpacing);
  return Math.ceil(wordCount / wordsPerPage);
}
