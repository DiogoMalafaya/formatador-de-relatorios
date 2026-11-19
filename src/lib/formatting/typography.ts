/**
 * Body typography (DIO-52, PRD US9).
 *
 * Gives the student's prose the rhythm of a designed document instead of a
 * Word default: justified, hyphenated paragraphs, a small gap between
 * paragraphs instead of a blank line, lists without gaps between items, and
 * "Label: value" lines with a bold label.
 *
 * None of this touches the font size or the line spacing, which explicit
 * profiles fix (MFR 12pt/1.5, Pediatria 10pt/1.5). Paragraph gaps aren't
 * line spacing, so they are free under every profile.
 *
 * Hyphenation is done here, with soft hyphens from TeX's Portuguese
 * patterns, rather than with CSS `hyphens: auto`. Chromium's automatic
 * hyphenation depends on the platform: macOS hyphenates Portuguese, Linux
 * Chromium needs a dictionary that serverless Chromium doesn't ship. That
 * would make production output differ from a Mac render, and justified
 * lines would move between machines. Soft hyphens break the same way
 * everywhere.
 *
 * Only the student's own prose is touched: classless `<p>` and `<li>`,
 * outside tables and headings. Everything the pipeline generates (cover,
 * rosto, Índice, captions, glossary) carries a class, or is added after
 * this runs, so it keeps its own layout.
 */

import createHyphenator from "hyphen";
import ptPatterns from "hyphen/patterns/pt.js";

const SOFT_HYPHEN = "­";

/** Space after a paragraph: PRD US9 asks for ~0.4–0.6em instead of a blank line. */
export const PARAGRAPH_GAP_EM = 0.5;

/** Shortest word that gets break points, and the shortest fragment left on either side. */
const MIN_WORD_LENGTH = 6;
const MIN_PREFIX = 2;
const MIN_SUFFIX = 3;

let hyphenator: ((text: string) => string) | undefined;

function hyphenateWord(word: string): string {
  hyphenator ??= createHyphenator(ptPatterns, { hyphenChar: SOFT_HYPHEN, minWordLength: MIN_WORD_LENGTH });
  const parts = hyphenator(word).split(SOFT_HYPHEN);
  if (parts.length < 2) return word;

  // TeX's patterns allow a 1-letter fragment ("a-bri-go"); typesetting
  // convention doesn't, so breaks too close to either end are dropped.
  let out = "";
  let consumed = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index > 0) {
      const remaining = word.length - consumed;
      if (consumed >= MIN_PREFIX && remaining >= MIN_SUFFIX) out += SOFT_HYPHEN;
    }
    out += part;
    consumed += part.length;
  }
  return out;
}

/**
 * Soft hyphens into one run of text (no tags). Capitalised words are left
 * alone, which spares names, acronyms and institutions; so are tokens that
 * look like an address, an e-mail or carry digits.
 */
export function hyphenateText(text: string): string {
  return text.replace(/\S+/g, (token) => {
    if (/[@/\\\d_]|www\.|&#?\w+;/.test(token)) return token;
    return token.replace(/\p{L}+/gu, (word) => {
      if (word.length < MIN_WORD_LENGTH) return word;
      if (word[0] !== word[0].toLowerCase()) return word;
      return hyphenateWord(word);
    });
  });
}

const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
/** Text under any of these is never hyphenated. */
const NO_HYPHENATION = new Set(["table", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code", "a", "script", "style", "nav", "dl"]);

/**
 * Soft hyphens into the text of the student's prose. A tag scan, like the
 * rest of the pipeline: mammoth's HTML is well-formed.
 */
export function hyphenateProse(html: string): string {
  const stack: { name: string; prose: boolean; blocked: boolean }[] = [];
  const pattern = new RegExp(TAG_PATTERN.source, "g");
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  const flushText = (end: number) => {
    const text = html.slice(cursor, end);
    const top = stack[stack.length - 1];
    out += top && top.prose && !top.blocked ? hyphenateText(text) : text;
  };

  while ((match = pattern.exec(html)) !== null) {
    flushText(match.index);
    out += match[0];
    cursor = pattern.lastIndex;

    const [, slash, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (VOID_ELEMENTS.has(name) || /\/\s*$/.test(attrs)) continue;

    if (slash) {
      // Pop up to and including the matching element.
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name === name) {
          stack.length = index;
          break;
        }
      }
      continue;
    }

    const parent = stack[stack.length - 1];
    const classless = !/\sclass\s*=/.test(attrs);
    const opensProse = (name === "p" || name === "li") && classless;
    stack.push({
      name,
      // A classed <p> (caption, figure) inside a list item stops being prose.
      prose: opensProse || (parent?.prose === true && name !== "p" && name !== "li"),
      // A classed element inside prose is generated (the omitted-image
      // placeholder, a caption label): its text stays as written.
      blocked: NO_HYPHENATION.has(name) || (!classless && !opensProse) || parent?.blocked === true,
    });
  }
  flushText(html.length);
  return out;
}

/*
 * "Label: value" lines — Identificação ("Nome: …", "Data de nascimento: …")
 * and course entries ("Local: …", "Duração: …").
 *
 * The label is short (≤ 5 words, ≤ 40 characters), capitalised, has no
 * digits or commas, and is followed by a value on the same line. A single
 * line like that can just as well be prose ("Realizei as seguintes
 * atividades: …"), so a label is only bolded in a run of at least two
 * consecutive such lines, which is what a field block looks like.
 */
const LABEL_LINE = /^(\s*)([A-ZÀ-ÖØ-Ý][^:<>,;.!?\d]{0,38}[^\s:<>,;.!?\d]):(?=\s+\S)/;
const MAX_LABEL_WORDS = 5;
const MIN_RUN = 2;

function labelOf(openTag: string, content: string): RegExpExecArray | null {
  if (openTag !== "<p>" && openTag !== "<li>") return null;
  const match = LABEL_LINE.exec(content);
  if (!match) return null;
  if (match[2].trim().split(/\s+/).length > MAX_LABEL_WORDS) return null;
  return match;
}

/** Bolds the label in runs of "Label: value" paragraphs or list items. */
export function boldFieldLabels(html: string): string {
  // Each candidate element: a classless <p>/<li> whose content starts with text.
  const element = /(<(p|li)>)([^<]*)/g;
  const candidates: { index: number; length: number; open: string; leading: string; label: RegExpExecArray | null; end: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = element.exec(html)) !== null) {
    candidates.push({
      index: match.index,
      length: match[0].length,
      open: match[1],
      leading: match[3],
      label: labelOf(match[1], match[3]),
      end: html.indexOf(`</${match[2]}>`, match.index),
    });
  }

  // Two label lines form a run when nothing but whitespace or the
  // previous element's closing tag sits between them.
  const runId: number[] = [];
  let current = -1;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate.label) {
      runId.push(-1);
      continue;
    }
    const previous = candidates[index - 1];
    const adjacent =
      previous?.label &&
      runId[index - 1] >= 0 &&
      previous.end >= 0 &&
      /^<\/(p|li)>\s*$/.test(html.slice(previous.end, candidate.index));
    if (!adjacent) current = index;
    runId.push(current);
  }
  const runSize = new Map<number, number>();
  for (const id of runId) if (id >= 0) runSize.set(id, (runSize.get(id) ?? 0) + 1);

  let out = "";
  let cursor = 0;
  candidates.forEach((candidate, index) => {
    const id = runId[index];
    if (id < 0 || (runSize.get(id) ?? 0) < MIN_RUN || !candidate.label) return;
    const [whole, space, label] = candidate.label;
    const contentStart = candidate.index + candidate.open.length;
    out += html.slice(cursor, contentStart);
    out += `${space}<strong class="field-label">${label}:</strong>`;
    cursor = contentStart + whole.length;
  });
  return out + html.slice(cursor);
}

/** Bold labels, then soft hyphens: the order keeps labels intact as matched. */
export function applyBodyTypography(html: string): string {
  return hyphenateProse(boldFieldLabels(html));
}

/**
 * The CSS half. Selectors sit inside `:where()` so they carry no
 * specificity: any classed or contextual rule (table cells, captions, the
 * cover, the Índice) overrides them without having to know they exist.
 */
export const BODY_TYPOGRAPHY_CSS = `
:where(p:not([class]), li:not([class])) {
  text-align: justify;
  hyphens: manual;
}
:where(p:not([class])) { margin: 0 0 ${PARAGRAPH_GAP_EM}em; }
:where(ul:not([class]), ol:not([class])) { margin: 0 0 ${PARAGRAPH_GAP_EM}em; padding-left: 1.5em; }
:where(li:not([class])) { margin: 0; }
:where(li:not([class])) > :where(p:not([class])) { margin: 0; }
:where(li:not([class])) > :where(ul, ol) { margin: 0; }
/* Cells keep their own alignment (left, or right for numbers). */
:where(td, th) :where(p, li) { text-align: inherit; }
.field-label { font-weight: bold; }
`.trim();
