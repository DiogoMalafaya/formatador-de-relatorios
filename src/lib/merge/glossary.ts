/**
 * The abbreviations list as a glossary (DIO-50, PRD US5): term in bold, its
 * expansion aligned beside it, instead of a run of "HUI – Hospital …" lines.
 *
 * Deliberately all-or-nothing per section: it converts only when *every*
 * entry splits cleanly into a short term and an expansion. A list with even
 * one line it can't read is left exactly as the student wrote it, since a
 * half-converted glossary reads worse than none, and guessing where a term
 * ends risks garbling content.
 *
 * Two columns grouped by letter is the PRD's first cut (§9) and isn't done.
 */

import { escapeHtml } from "../html.ts";
import { blockText, headingLevelOf } from "./blocks.ts";
import type { HtmlBlock } from "./blocks.ts";
import { normalizeForMatch } from "./frontMatter.ts";

const ABBREVIATIONS_TITLE_PATTERN = /\b(abreviaturas|siglas|acronimos)\b/;

/** "HUI – Hospital …", "UCI: Unidade …", "PNA - Prova …", "SNS\tServiço …". */
const ENTRY_PATTERN = /^(\S.{0,23}?)\s*(?:[–—:]|\s-|\t)\s*(\S.*)$/;
const MAX_TERM_WORDS = 3;

export interface GlossaryEntry {
  term: string;
  expansion: string;
}

export function parseGlossaryEntry(text: string): GlossaryEntry | undefined {
  const match = ENTRY_PATTERN.exec(text.trim());
  if (!match) return undefined;
  const term = match[1].trim();
  const expansion = match[2].trim();
  if (term.split(/\s+/).length > MAX_TERM_WORDS || expansion.length === 0) return undefined;
  return { term, expansion };
}

/** The entry lines of a section: its paragraphs, or the items of its lists. */
function entryTexts(blocks: HtmlBlock[]): string[] | undefined {
  const texts: string[] = [];
  for (const block of blocks) {
    if (block.tag === "p") {
      const text = blockText(block.html);
      if (text.length > 0) texts.push(text);
    } else if (block.tag === "ul" || block.tag === "ol") {
      for (const item of block.html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) texts.push(blockText(item[1]));
    } else {
      return undefined; // a table or anything else: not a plain list
    }
  }
  return texts;
}

export function renderGlossaryHtml(entries: readonly GlossaryEntry[]): string {
  const rows = entries
    .map((entry) => `<dt>${escapeHtml(entry.term)}</dt><dd>${escapeHtml(entry.expansion)}</dd>`)
    .join("\n");
  return `<dl class="glossary">\n${rows}\n</dl>`;
}

/**
 * Rewrites every abbreviations section in `blocks` whose entries all parse.
 * Headings pass through untouched (the merge still anchors and levels them).
 */
export function convertAbbreviationLists(blocks: HtmlBlock[]): HtmlBlock[] {
  const out: HtmlBlock[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    out.push(block);
    const level = headingLevelOf(block.tag);
    if (level === undefined || !ABBREVIATIONS_TITLE_PATTERN.test(normalizeForMatch(blockText(block.html)))) continue;

    // The section ends at the next heading at its level or above, or at a
    // merge fence (a stale caption list starting, see merge.ts).
    let end = i + 1;
    while (end < blocks.length) {
      if (blocks[end].tag.startsWith("#fence")) break;
      const next = headingLevelOf(blocks[end].tag);
      if (next !== undefined && next <= level) break;
      end += 1;
    }
    const body = blocks.slice(i + 1, end);
    const texts = entryTexts(body);
    const entries = texts?.map(parseGlossaryEntry);
    if (!entries || entries.length < 2 || entries.some((entry) => entry === undefined)) continue;

    out.push({ tag: "dl", html: renderGlossaryHtml(entries as GlossaryEntry[]) });
    i = end - 1;
  }
  return out;
}

export const GLOSSARY_CSS = `
dl.glossary {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 1.2em;
  row-gap: 0.15em;
  margin: 0;
}
dl.glossary dt { font-weight: bold; break-after: avoid; }
dl.glossary dd { margin: 0; }
`;
