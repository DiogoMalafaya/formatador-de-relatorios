/**
 * Designed tables (DIO-48, PRD US8).
 *
 * mammoth gives us correct but bare tables: every row in the body, no header
 * semantics unless Word marked a "repeat header row", captions as loose
 * paragraphs wherever the student typed them. This pass gives the
 * stylesheet (`tableCss` in `styles.ts`) something to style:
 *
 * - A header row: Word's own `<thead>` when there is one; otherwise the
 *   first row is promoted when it clearly reads as one (see
 *   `shouldPromoteFirstRow`). `thead` repeats on every printed page.
 * - Numeric columns (`.num`, right-aligned), a bold "Total" row
 *   (`.table-total`), and short tables kept whole (`.table-keep`).
 * - Captions: a "Tabela N …" paragraph (or a Word Caption-style paragraph,
 *   `p.caption`) next to a table is moved *above* it, renumbered in document
 *   order and given an anchor id, so the two-pass render can put exact page
 *   numbers in the generated Lista de tabelas. Uncaptioned tables are not
 *   numbered: a "Tabela 3." entry with no title would tell the jury nothing.
 * - Legends/notes ("Legenda:", "Nota:", "Fonte:") right below a table get
 *   `.table-note`.
 *
 * Merged cells (`colspan`/`rowspan`) come through mammoth intact and are
 * re-emitted verbatim; column analysis tracks them on a grid. Tables holding
 * a nested table are already flagged as unsupported (parseDocx.ts) and are
 * left exactly as they are, captions aside.
 *
 * Like the rest of the pipeline this is a tag scan over mammoth's
 * well-formed HTML, not a DOM. Nothing is ever dropped: every cell's inner
 * HTML is re-emitted byte-identical.
 */

import { escapeHtml } from "../html.ts";
import { blockText } from "../merge/blocks.ts";
import type { HtmlBlock } from "../merge/blocks.ts";
import type { PageNumbering } from "../merge/types.ts";
import { isCaptionBlock, normalizeCaptionText, stripCaptionPrefix as stripPrefix } from "./captions.ts";
import type { NumberedCaption } from "./captions.ts";

export type TableCaption = NumberedCaption;

/** Tables with this many rows or fewer are never split across pages. */
export const SHORT_TABLE_MAX_ROWS = 12;

const DEFAULT_CAPTION_ID_PREFIX = "table-caption";

const NOTE_PATTERN = /^(legenda|nota|notas|fonte|fontes|abreviaturas)\s*[:.–—-]/;
const NUMERIC_PATTERN = /^[-+−]?\d[\d\s.,]*\s*%?$/;
const EMPTY_CELL_PATTERN = /^[-–—]?$/;
const TOTAL_PATTERN = /^(total|totais|subtotal)\b/;

const normalize = normalizeCaptionText;

/**
 * Stateful across calls so caption numbers and ids run through a whole
 * merged document in order: call `designBlocks` once per part, in document
 * order.
 */
export class TableDesigner {
  readonly captions: TableCaption[] = [];
  private readonly idPrefix: string;

  constructor(options: { captionIdPrefix?: string } = {}) {
    this.idPrefix = options.captionIdPrefix ?? DEFAULT_CAPTION_ID_PREFIX;
  }

  designBlocks(blocks: readonly HtmlBlock[], numbering: PageNumbering): HtmlBlock[] {
    const out: HtmlBlock[] = [];
    const consumed = new Set<number>();

    for (let i = 0; i < blocks.length; i += 1) {
      if (consumed.has(i)) continue;
      const block = blocks[i];

      if (block.tag !== "table") {
        // A caption immediately above a table is emitted with that table.
        if (isTableCaption(block) && blocks[i + 1]?.tag === "table") continue;
        out.push(block);
        continue;
      }

      const above = i > 0 && isTableCaption(blocks[i - 1]) && !consumed.has(i - 1) ? blocks[i - 1] : undefined;
      // A caption below counts only when it isn't the caption *above* the next table.
      const belowIndex = i + 1;
      const below =
        !above && isTableCaption(blocks[belowIndex]) && blocks[belowIndex + 1]?.tag !== "table"
          ? blocks[belowIndex]
          : undefined;
      if (below) consumed.add(belowIndex);

      const captionBlock = above ?? below;
      if (captionBlock) out.push({ tag: "p", html: this.captionHtml(captionBlock, numbering) });
      out.push({ tag: "table", html: designTableHtml(block.html) });

      const noteIndex = below ? belowIndex + 1 : belowIndex;
      const note = blocks[noteIndex];
      if (note && note.tag === "p" && NOTE_PATTERN.test(normalize(blockText(note.html)))) {
        out.push({ tag: "p", html: addClass(note.html, "table-note") });
        consumed.add(noteIndex);
      }
    }
    return out;
  }

  private captionHtml(block: HtmlBlock, numbering: PageNumbering): string {
    const number = this.captions.length + 1;
    const id = `${this.idPrefix}-${number}`;
    const raw = blockText(block.html);
    const rest = stripPrefix(raw, "table");
    const label = `Tabela ${number}.`;
    const text = rest.length > 0 ? `${label} ${rest}` : label;
    this.captions.push({ id, number, text, numbering });
    const restHtml = rest.length > 0 ? ` ${escapeHtml(rest)}` : "";
    return `<p id="${id}" class="table-caption"><span class="table-caption-label">${label}</span>${restHtml}</p>`;
  }
}

const isTableCaption = (block: HtmlBlock | undefined) => isCaptionBlock(block, "table");

/** Drops the student's own "Tabela 3 –" so ours is the only number. */
export function stripCaptionPrefix(text: string): string {
  return stripPrefix(text, "table");
}

function addClass(html: string, className: string): string {
  const open = /^<([a-z0-9]+)([^>]*)>/i.exec(html);
  if (!open) return html;
  const [whole, tag, attrs] = open;
  const classMatch = /\sclass="([^"]*)"/.exec(attrs);
  const newAttrs = classMatch
    ? attrs.replace(classMatch[0], ` class="${classMatch[1]} ${className}"`)
    : `${attrs} class="${className}"`;
  return `<${tag}${newAttrs}>${html.slice(whole.length)}`;
}

/* ------------------------------ table model ------------------------------ */

interface Cell {
  tag: "td" | "th";
  /** Original attributes (colspan/rowspan), minus any class. */
  attrs: string;
  inner: string;
  text: string;
  colspan: number;
  rowspan: number;
  /** Grid column the cell starts in. */
  col: number;
  classes: string[];
}

interface Row {
  cells: Cell[];
  header: boolean;
  classes: string[];
}

/**
 * Restyles one table's HTML. Exported for tests; `TableDesigner` is the
 * pipeline entry point.
 */
export function designTableHtml(html: string): string {
  // Nested tables are flagged unsupported upstream; the row scan below can't
  // see through them, so leave them alone rather than guess.
  if ((html.match(/<table[\s>]/gi) ?? []).length > 1) return addClass(html, "designed-table");

  const rows = parseRows(html);
  if (rows.length === 0) return addClass(html, "designed-table");

  if (!rows.some((row) => row.header) && shouldPromoteFirstRow(rows)) {
    rows[0].header = true;
    for (const cell of rows[0].cells) cell.tag = "th";
  }

  const bodyRows = rows.filter((row) => !row.header);
  for (const col of numericColumns(rows)) {
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.col === col && cell.colspan === 1) cell.classes.push("num");
      }
    }
  }
  for (const row of bodyRows) {
    const first = row.cells.find((cell) => cell.text.length > 0);
    if (first && TOTAL_PATTERN.test(normalize(first.text))) row.classes.push("table-total");
  }

  const tableClasses = ["designed-table"];
  if (rows.length <= SHORT_TABLE_MAX_ROWS) tableClasses.push("table-keep");

  const headerRows = rows.filter((row) => row.header);
  const renderRow = (row: Row) =>
    `<tr${classAttr(row.classes)}>` +
    row.cells
      .map((cell) => {
        const scope = cell.tag === "th" && row.header ? ' scope="col"' : "";
        return `<${cell.tag}${cell.attrs}${scope}${classAttr(cell.classes)}>${cell.inner}</${cell.tag}>`;
      })
      .join("") +
    `</tr>`;

  const tableOpen = /^<table([^>]*)>/i.exec(html);
  const tableAttrs = (tableOpen?.[1] ?? "").replace(/\sclass="[^"]*"/, "");
  return (
    `<table${tableAttrs} class="${tableClasses.join(" ")}">` +
    (headerRows.length > 0 ? `<thead>${headerRows.map(renderRow).join("")}</thead>` : "") +
    `<tbody>${bodyRows.map(renderRow).join("")}</tbody>` +
    `</table>`
  );
}

function classAttr(classes: string[]): string {
  return classes.length > 0 ? ` class="${classes.join(" ")}"` : "";
}

function parseRows(html: string): Row[] {
  const rows: Row[] = [];
  // Rows inside <thead> are header rows; mammoth emits one only for Word's
  // "repeat as header row".
  const theadEnd = html.search(/<\/thead>/i);
  const rowPattern = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<(td|th)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  // Grid occupancy from rowspans: column → rows still covered.
  const covered = new Map<number, number>();

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const header = theadEnd !== -1 && rowMatch.index < theadEnd;
    const cells: Cell[] = [];
    let col = 0;
    const nextFree = () => {
      while ((covered.get(col) ?? 0) > 0) col += 1;
    };
    let cellMatch: RegExpExecArray | null;
    cellPattern.lastIndex = 0;
    while ((cellMatch = cellPattern.exec(rowMatch[1])) !== null) {
      const rawAttrs = cellMatch[2] ?? "";
      const colspan = Number(/colspan="(\d+)"/i.exec(rawAttrs)?.[1] ?? 1) || 1;
      const rowspan = Number(/rowspan="(\d+)"/i.exec(rawAttrs)?.[1] ?? 1) || 1;
      nextFree();
      const cell: Cell = {
        tag: cellMatch[1].toLowerCase() as "td" | "th",
        attrs: rawAttrs.replace(/\s(class|scope)="[^"]*"/gi, ""),
        inner: cellMatch[3],
        text: blockText(cellMatch[3]),
        colspan,
        rowspan,
        col,
        classes: [],
      };
      cells.push(cell);
      if (rowspan > 1) {
        for (let c = col; c < col + colspan; c += 1) covered.set(c, rowspan);
      }
      col += colspan;
    }
    // This row consumed one row of every active rowspan (including the ones it started).
    for (const [c, remaining] of covered) {
      if (remaining <= 1) covered.delete(c);
      else covered.set(c, remaining - 1);
    }
    rows.push({ cells, header, classes: [] });
  }
  return rows;
}

/**
 * A first row reads as a header when it has no numbers in it and the table
 * is the kind that has one: three or more columns, or a numeric column below
 * it. Two-column "label | value" tables (Identificação) stay as they are —
 * a filled first row there would mislabel a datum as a heading.
 */
function shouldPromoteFirstRow(rows: Row[]): boolean {
  if (rows.length < 3) return false;
  const [first] = rows;
  if (first.cells.length === 0) return false;
  if (first.cells.some((cell) => cell.text.length === 0 || NUMERIC_PATTERN.test(cell.text))) return false;
  const columns = Math.max(...rows.map((row) => row.cells.reduce((sum, cell) => sum + cell.colspan, 0)));
  return columns >= 3 || numericColumns(rows.slice(1)).length > 0;
}

/** Grid columns whose every non-empty body cell is a number (at least one must be). */
function numericColumns(rows: Row[]): number[] {
  const body = rows.filter((row) => !row.header && !row.classes.includes("table-total"));
  const stats = new Map<number, { numeric: number; other: number }>();
  for (const row of body) {
    for (const cell of row.cells) {
      if (cell.colspan !== 1) continue;
      const entry = stats.get(cell.col) ?? { numeric: 0, other: 0 };
      if (NUMERIC_PATTERN.test(cell.text)) entry.numeric += 1;
      else if (!EMPTY_CELL_PATTERN.test(cell.text)) entry.other += 1;
      stats.set(cell.col, entry);
    }
  }
  return [...stats]
    .filter(([, entry]) => entry.numeric > 0 && entry.other === 0)
    .map(([col]) => col)
    .sort((a, b) => a - b);
}
