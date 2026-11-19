/**
 * Caption recognition shared by tables (DIO-48) and figures (DIO-49).
 *
 * A caption is a short paragraph that starts with its kind's label and a
 * number or a separator ("Tabela 2 – …", "Figura 3: …"), or a paragraph in
 * Word's Caption style (`p.caption`, see parseDocx.ts) that doesn't name the
 * *other* kind. Each kind renumbers its own captions in document order and
 * feeds its own generated list.
 */

import { blockText } from "../merge/blocks.ts";
import type { HtmlBlock } from "../merge/blocks.ts";
import type { PageNumbering } from "../merge/types.ts";

/** A caption we numbered, ready for a generated list (Lista de tabelas/figuras). */
export interface NumberedCaption {
  /** Anchor id on the caption paragraph; the page map resolves it. */
  id: string;
  /** 1-based, document order, per kind. */
  number: number;
  /** Plain text as shown, e.g. "Tabela 2. Casuística". */
  text: string;
  /** The page-number sequence the caption's page belongs to. */
  numbering: PageNumbering;
}

export type CaptionKind = "table" | "figure";

/** Accent-stripped, lowercased labels. "fig." is matched with its dot. */
const LABELS: Readonly<Record<CaptionKind, string>> = {
  table: "tabela|quadro",
  figure: "figura|fig\\.|imagem|grafico|ilustracao|diagrama|fotografia",
};

const NUMBER = "(n\\.?\\s*[oº°]\\.?\\s*)?\\d+([.-]\\d+)*";

const PREFIX_PATTERNS: Readonly<Record<CaptionKind, RegExp>> = {
  table: new RegExp(`^(${LABELS.table})(\\s*${NUMBER})?\\s*([.:–—-]\\s*)?`),
  figure: new RegExp(`^(${LABELS.figure})(\\s*${NUMBER})?\\s*([.:–—-]\\s*)?`),
};

/** A label alone isn't a caption: "Tabela de preços" and "Imagem de marca" are prose. */
const CAPTION_PATTERNS: Readonly<Record<CaptionKind, RegExp>> = {
  table: new RegExp(`^(${LABELS.table})(\\s*${NUMBER}\\s*([.:–—-]|$)|\\s*[.:–—-])`),
  figure: new RegExp(`^(${LABELS.figure})(\\s*${NUMBER}\\s*([.:–—-]|$)|\\s*[.:–—-])`),
};

export const MAX_CAPTION_LENGTH = 240;

export function normalizeCaptionText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isCaptionBlock(block: HtmlBlock | undefined, kind: CaptionKind): boolean {
  if (!block || block.tag !== "p") return false;
  const text = blockText(block.html);
  if (text.length === 0 || text.length > MAX_CAPTION_LENGTH) return false;
  const normalized = normalizeCaptionText(text);
  if (CAPTION_PATTERNS[kind].test(normalized)) return true;
  const other: CaptionKind = kind === "table" ? "figure" : "table";
  return /^<p[^>]*class="[^"]*\bcaption\b/.test(block.html) && !CAPTION_PATTERNS[other].test(normalized);
}

/** Drops the student's own "Tabela 3 –"/"Figura 3:" so ours is the only number. */
export function stripCaptionPrefix(text: string, kind: CaptionKind = "table"): string {
  const original = text.replace(/\s+/g, " ").trim();
  // Fold accents and case one character at a time, so an index into the
  // folded string is an index into the original.
  const folded = [...original].map((char) => char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()).join("");
  if (folded.length !== original.length) return original;
  const match = PREFIX_PATTERNS[kind].exec(folded);
  if (!match || match[0].length === 0) return original;
  return original.slice(match[0].length).trim();
}
