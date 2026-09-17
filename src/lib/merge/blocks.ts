/**
 * Top-level block scanner over mammoth's semantic HTML (DIO-41).
 *
 * mammoth emits well-formed body HTML whose top level is a flat sequence of
 * blocks (headings, paragraphs, lists, tables), so a tag-depth scan is enough
 * to split it — the same reasoning `parseDocx.ts` uses for its table counter.
 * No DOM parser, no dependency on how deep the *inside* of a block nests.
 */

export interface HtmlBlock {
  /** Lowercase tag name of the top-level element, or `"#text"` for stray top-level text. */
  tag: string;
  /** The block's full outer HTML (or the raw text for `"#text"`). */
  html: string;
}

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;

export function splitTopLevelBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];
  const pattern = new RegExp(TAG_PATTERN.source, "g");
  let depth = 0;
  let blockStart = -1;
  let blockTag = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const [full, slash, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    const selfContained = VOID_ELEMENTS.has(name) || /\/\s*$/.test(attrs);

    if (depth === 0) {
      const text = html.slice(cursor, match.index);
      if (text.trim().length > 0) {
        blocks.push({ tag: "#text", html: text });
      }
      cursor = match.index;
    }

    if (!slash) {
      if (depth === 0) {
        if (selfContained) {
          blocks.push({ tag: name, html: full });
          cursor = pattern.lastIndex;
        } else {
          blockStart = match.index;
          blockTag = name;
          depth = 1;
        }
      } else if (!selfContained) {
        depth += 1;
      }
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) {
        blocks.push({ tag: blockTag, html: html.slice(blockStart, pattern.lastIndex) });
        cursor = pattern.lastIndex;
      }
    } else {
      // Stray closing tag at top level — mammoth never emits one; skip it.
      cursor = pattern.lastIndex;
    }
  }

  const tail = html.slice(cursor);
  if (depth === 0 && tail.trim().length > 0) {
    blocks.push({ tag: "#text", html: tail });
  } else if (depth > 0) {
    // Unclosed block (malformed input) — keep the remainder rather than losing content.
    blocks.push({ tag: blockTag, html: html.slice(blockStart) });
  }

  return blocks;
}

/** `"h1"` … `"h6"` → 1 … 6, anything else → undefined. */
export function headingLevelOf(tag: string): number | undefined {
  const match = /^h([1-6])$/.exec(tag);
  return match ? Number(match[1]) : undefined;
}

/** Plain text of a block: tags stripped, common entities decoded, whitespace collapsed. */
export function blockText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/* ------------------------------------------------------------------ *
 * Counters over the merged HTML, mirroring `parseDocx.ts` semantics  *
 * so the merged `ParsedDocument` reports what a fresh parse would.   *
 * ------------------------------------------------------------------ */

export function countImages(html: string): number {
  return (html.match(/<img[\s/>]/gi) ?? []).length;
}

/** Depth-1 `<table>` count — same scan `parseDocx.ts` uses; nested tables don't add. */
export function countTopLevelTables(html: string): number {
  let depth = 0;
  let count = 0;
  const pattern = /<(\/?)table[\s>]/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    if (match[1] !== "/") {
      depth += 1;
      if (depth === 1) count += 1;
    } else if (depth > 0) {
      depth -= 1;
    }
  }
  return count;
}

export function countHeadingLevels(html: string): { h1: number; h2: number; h3: number } {
  const count = (tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
  return { h1: count("h1"), h2: count("h2"), h3: count("h3") };
}

export function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (text.length === 0) return 0;
  return text.split(/\s+/).length;
}
