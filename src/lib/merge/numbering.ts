/**
 * Automatic section numbering (DIO-53, PRD US6).
 *
 * Body headings are numbered hierarchically from the merged structure
 * (chapter "1.", section "1.2.", subsection "1.2.3."), the scheme every
 * reference CV uses. Students number by hand, inconsistently, and chapter
 * files written separately restart at 1, so whatever they typed is stripped
 * first ("3.1. Formação" → "Formação") and ours applied, never "3.1. 3.1.".
 *
 * Front matter (dedication, abbreviations, Índice) is never numbered.
 */

/** Decimal throughout (default), or roman chapter numerals as a theme option ("II.3."). */
export type SectionNumberingStyle = "decimal" | "roman-chapters" | "none";

/** Chapter, section, subsection. Deeper headings keep whatever the student typed. */
export const NUMBERED_TIERS = 3;

/**
 * A number the student typed at the start of a heading, with its separator.
 * Needs a dot, a parenthesis or a dash after a lone number, so a heading
 * that merely starts with a number ("20 anos de Pediatria") is left alone.
 * Roman numerals are uppercase and at most XXXIX, so "CV — Resumo" or "Vida"
 * never match.
 */
const MANUAL_NUMBER_PATTERN = new RegExp(
  "^\\s*(?:" +
    // 3.1  3.1.  3.1.2)  3.1 -
    "\\d{1,2}(?:\\.\\d{1,2})+\\.?(?:\\s*[)\\-–—:])?" +
    // 3.  3)  3 -  3:
    "|\\d{1,2}(?:[.)]|\\s*[-–—:])" +
    // II.  IV)  III -  II.3.
    "|(?=[IVX])X{0,3}(?:IX|IV|V?I{0,3})(?:\\.\\d{1,2})*(?:[.)]|\\s*[-–—:])" +
    ")\\s+(?=\\S)",
  "u",
);

/** The typed number at the start of plain heading text, or undefined. */
export function manualNumberPrefix(text: string): string | undefined {
  const match = MANUAL_NUMBER_PATTERN.exec(text);
  return match ? match[0] : undefined;
}

/**
 * Removes a typed number from a heading's inner HTML. The number can sit in
 * its own inline element (`<strong>3.1.</strong> Formação`), so text
 * characters are matched across tags and removed in place; tags stay.
 */
export function stripManualNumber(innerHtml: string): string {
  // Visible characters and where each one sits in the HTML.
  const chars: { start: number; end: number; char: string }[] = [];
  let index = 0;
  while (index < innerHtml.length && chars.length < 40) {
    const char = innerHtml[index];
    if (char === "<") {
      const close = innerHtml.indexOf(">", index);
      if (close === -1) break;
      index = close + 1;
      continue;
    }
    if (char === "&") {
      const semi = innerHtml.indexOf(";", index);
      if (semi !== -1 && semi - index <= 8) {
        const entity = innerHtml.slice(index, semi + 1);
        chars.push({ start: index, end: semi + 1, char: entity === "&nbsp;" || entity === "&#160;" ? " " : "&" });
        index = semi + 1;
        continue;
      }
    }
    chars.push({ start: index, end: index + 1, char: char === " " ? " " : char });
    index += 1;
  }

  const prefix = manualNumberPrefix(chars.map((entry) => entry.char).join(""));
  if (!prefix) return innerHtml;

  const removed = chars.slice(0, prefix.length);
  let out = "";
  let cursor = 0;
  for (const entry of removed) {
    out += innerHtml.slice(cursor, entry.start);
    cursor = entry.end;
  }
  return out + innerHtml.slice(cursor);
}

const ROMAN: readonly [number, string][] = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

export function toRoman(value: number): string {
  if (value >= 40) return String(value);
  let rest = value;
  let out = "";
  for (const [amount, numeral] of ROMAN) {
    while (rest >= amount) {
      out += numeral;
      rest -= amount;
    }
  }
  return out;
}

/**
 * Hands out numbers in document order. A heading that skips a level (a
 * chapter whose first subheading is an `<h4>`) is numbered one tier below
 * its parent, so there's never a "1.0.1".
 */
export class SectionNumberer {
  private readonly counters: number[] = [];
  private readonly style: SectionNumberingStyle;

  constructor(style: SectionNumberingStyle = "decimal") {
    this.style = style;
  }

  /**
   * The effective tier (1 = chapter) and its number, for a heading at
   * `tier` levels below the body's top. Undefined number past the numbered
   * tiers or when numbering is off.
   */
  next(tier: number): { tier: number; number?: string } {
    const effective = Math.max(1, Math.min(tier, this.counters.length + 1));
    if (effective > NUMBERED_TIERS) return { tier: effective };

    this.counters.length = effective;
    this.counters[effective - 1] = (this.counters[effective - 1] ?? 0) + 1;
    if (this.style === "none") return { tier: effective };
    const parts = this.counters.map((count, position) =>
      position === 0 && this.style === "roman-chapters" ? toRoman(count) : String(count),
    );
    return { tier: effective, number: `${parts.join(".")}.` };
  }
}

/** The number as it appears in a heading and in the Índice. */
export function sectionNumberHtml(number: string, className: string): string {
  return `<span class="${className}">${number}</span> `;
}
