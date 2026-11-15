/**
 * Front-matter classification for the documento principal (DIO-45).
 *
 * Two things the merge engine used to get wrong on real CVs:
 *
 * 1. **Content after the master's Índice.** Real CVs put the abbreviations
 *    list (and often a list of tables, a nota prévia, agradecimentos) right
 *    after the Índice. Treating all of it as body made those lists body page
 *    1 and, because they kept their `<h1>` while chapters are demoted to
 *    `<h2>`, made them the only "major part" — so no chapter got a page
 *    break or recto start, and the running header froze on them.
 *    `splitMasterAfterToc` keeps a leading run of recognisably front-matter
 *    sections in the front matter; whatever follows is body.
 *
 * 2. **The source cover.** The master opens with its own cover text (name,
 *    "Curriculum Vitae", internato, hospital, date), which got reprinted as
 *    plain paragraphs right after our generated cover. `detectSourceCover`
 *    finds that run so the merge can drop it, keeping the name for our cover.
 *
 * Both are deliberately conservative: anything not clearly front matter or
 * clearly a cover is left where it was.
 */

import { blockText, headingLevelOf } from "./blocks.ts";
import type { HtmlBlock } from "./blocks.ts";

/** Lowercase, accents stripped, whitespace collapsed — for title matching only. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Section titles that belong to the front matter wherever they appear in the
 * master. Matched against `normalizeForMatch(title)`.
 */
const FRONT_MATTER_TITLE_PATTERNS: readonly RegExp[] = [
  /^(lista|indice|index) (de|das|dos) /, // Lista de abreviaturas, Índice de tabelas/figuras/quadros
  /\b(abreviaturas|siglas|acronimos)\b/,
  /^(nota previa|preambulo|prefacio|nota vocacional)$/,
  /^(agradecimentos?|dedicatoria|epigrafe)$/,
];

export function isFrontMatterTitle(title: string): boolean {
  const normalized = normalizeForMatch(title);
  return FRONT_MATTER_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface MasterAfterTocSplit {
  /** Leading front-matter sections (and any stray blocks before the first heading). */
  frontMatter: HtmlBlock[];
  /** Everything from the first non-front-matter section on. */
  body: HtmlBlock[];
}

/**
 * Splits the master's blocks after its Índice. A section is a heading at the
 * shallowest heading level present plus everything up to the next heading at
 * that level. Leading sections whose title is front matter stay front
 * matter; the first other section starts the body, and everything after it is
 * body too (we never pull a section back out of the body's middle).
 */
export function splitMasterAfterToc(blocks: HtmlBlock[]): MasterAfterTocSplit {
  const levels = blocks
    .map((block) => headingLevelOf(block.tag))
    .filter((level): level is number => level !== undefined);
  if (levels.length === 0) {
    // No headings at all: nothing to classify. Stray text right after the
    // Índice is front matter by position.
    return { frontMatter: blocks, body: [] };
  }
  const sectionLevel = Math.min(...levels);

  for (let i = 0; i < blocks.length; i += 1) {
    const level = headingLevelOf(blocks[i].tag);
    if (level !== sectionLevel) continue;
    if (!isFrontMatterTitle(blockText(blocks[i].html))) {
      return { frontMatter: blocks.slice(0, i), body: blocks.slice(i) };
    }
  }
  return { frontMatter: blocks, body: [] };
}

/** A cover is a short run of short lines. Anything longer is content. */
const MAX_COVER_BLOCKS = 12;
const MAX_COVER_LINE_LENGTH = 160;
const MAX_NAME_LENGTH = 80;

const COVER_TITLE_PATTERN = /\bcurriculum vit(ae|æ|e)(?![a-z])/;

/** Lines on a cover that are labels, not the candidate's name. */
const NOT_A_NAME_PATTERNS: readonly RegExp[] = [
  COVER_TITLE_PATTERN,
  /\b(internato|especialidade|formacao|exame|prova|volume|hospital|centro hospitalar|unidade local|servico|colegio|ordem dos medicos)\b/,
  /\d/,
];

export interface SourceCover {
  /** Number of leading blocks that make up the source cover. */
  blockCount: number;
  /** The cover's name line, when one can be told apart from its labels. */
  candidateName?: string;
}

/**
 * The source cover: the leading run of non-heading blocks of the master,
 * when that run is short, made of short lines, and says "Curriculum Vitae".
 * Without that phrase the run is left alone. It might be an epigraph or a
 * note, and dropping student content on a guess is the worst failure mode.
 */
export function detectSourceCover(blocks: HtmlBlock[]): SourceCover | undefined {
  let end = 0;
  while (end < blocks.length && headingLevelOf(blocks[end].tag) === undefined) end += 1;

  const run = blocks.slice(0, end).filter((block) => blockText(block.html).length > 0);
  if (run.length === 0 || run.length > MAX_COVER_BLOCKS) return undefined;
  if (run.some((block) => block.tag !== "p" || blockText(block.html).length > MAX_COVER_LINE_LENGTH)) {
    return undefined;
  }

  const texts = run.map((block) => blockText(block.html));
  if (!texts.some((text) => COVER_TITLE_PATTERN.test(normalizeForMatch(text)))) return undefined;

  const candidateName = texts.find(
    (text) =>
      text.length <= MAX_NAME_LENGTH &&
      !NOT_A_NAME_PATTERNS.some((pattern) => pattern.test(normalizeForMatch(text))),
  );
  return { blockCount: end, ...(candidateName ? { candidateName } : {}) };
}
