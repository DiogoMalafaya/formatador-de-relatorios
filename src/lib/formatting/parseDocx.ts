/**
 * .docx → semantic HTML (DIO-10).
 *
 * mammoth does the structural conversion (headings, lists, tables survive as
 * their HTML equivalents by default). This module adds what mammoth doesn't:
 * counting images and tables for the warnings in `warnings.ts`, and detecting
 * the structures the engine cannot safely reformat (nested tables, and
 * anything mammoth itself couldn't map — mammoth reports those as
 * `messages` rather than throwing).
 */

import mammoth from "mammoth";

const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Title'] => h1:fresh",
];

export interface ParsedDocument {
  /** Semantic HTML — body content only, no <html>/<head>. */
  html: string;
  imageCount: number;
  /** Top-level tables only; nested ones are counted separately and flagged. */
  tableCount: number;
  headingCounts: { h1: number; h2: number; h3: number };
  /** Word count of the visible text, used for the page-limit estimate. */
  wordCount: number;
  /** Free-text descriptions of structures mammoth could not map cleanly. */
  unsupportedStructures: string[];
}

export async function parseDocxDocument(buffer: Buffer): Promise<ParsedDocument> {
  let imageCount = 0;

  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      convertImage: mammoth.images.imgElement(async (image) => {
        imageCount += 1;
        const base64 = await image.read("base64");
        return { src: `data:${image.contentType};base64,${base64}` };
      }),
    },
  );

  const html = result.value;
  const unsupportedStructures = result.messages
    .filter((message) => message.type === "warning")
    .map((message) => message.message);

  const { tableCount, nestedTableCount } = countTables(html);
  if (nestedTableCount > 0) {
    unsupportedStructures.push(
      nestedTableCount === 1
        ? "1 tabela aninhada dentro de outra tabela"
        : `${nestedTableCount} tabelas aninhadas dentro de outras tabelas`,
    );
  }

  return {
    html,
    imageCount,
    tableCount,
    headingCounts: countHeadings(html),
    wordCount: countWords(html),
    unsupportedStructures,
  };
}

/**
 * Counts `<table>` elements, tracking nesting depth via a simple tag scan —
 * mammoth's own HTML is well-formed, so this doesn't need a full DOM parser.
 * Only depth-1 tables count toward `tableCount`; anything deeper is a nested
 * table, which the norms don't contemplate and the engine can't safely
 * reformat.
 */
function countTables(html: string): { tableCount: number; nestedTableCount: number } {
  let depth = 0;
  let tableCount = 0;
  let nestedTableCount = 0;
  const tagPattern = /<(\/?)table[\s>]/gi;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html)) !== null) {
    const isClosing = match[1] === "/";
    if (!isClosing) {
      depth += 1;
      if (depth === 1) {
        tableCount += 1;
      } else {
        nestedTableCount += 1;
      }
    } else if (depth > 0) {
      depth -= 1;
    }
  }
  return { tableCount, nestedTableCount };
}

function countHeadings(html: string): { h1: number; h2: number; h3: number } {
  const count = (tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) ?? []).length;
  return { h1: count("h1"), h2: count("h2"), h3: count("h3") };
}

function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (text.length === 0) return 0;
  return text.split(/\s+/).length;
}
