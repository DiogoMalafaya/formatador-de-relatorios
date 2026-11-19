/**
 * Figures (DIO-49, PRD US12): a paragraph holding nothing but images, plus
 * its caption.
 *
 * Captions go *below* a figure (the convention, and Word's default). A
 * "Figura N …" paragraph (or a Word Caption-style one that doesn't name a
 * table) right below a figure is its caption; one right above it is moved
 * below, unless it's the caption of the figure before. Captions are
 * renumbered "Figura N." in document order and anchored, so the generated
 * Lista de figuras gets exact pages. Uncaptioned images get no number — the
 * same rule as tables: an untitled "Figura 3." entry tells the jury nothing.
 *
 * The figure paragraph gets `.figure` so it's centred, never split, and kept
 * on the same page as its caption (see `IMAGE_CSS`).
 */

import { escapeHtml } from "../html.ts";
import { blockText } from "../merge/blocks.ts";
import type { HtmlBlock } from "../merge/blocks.ts";
import type { PageNumbering } from "../merge/types.ts";
import { isCaptionBlock, stripCaptionPrefix } from "./captions.ts";
import type { NumberedCaption } from "./captions.ts";

const DEFAULT_CAPTION_ID_PREFIX = "figure-caption";

/** A top-level paragraph whose only content is one or more images. */
export function isFigureBlock(block: HtmlBlock | undefined): boolean {
  return !!block && block.tag === "p" && /<img\b/i.test(block.html) && blockText(block.html).length === 0;
}

const isFigureCaption = (block: HtmlBlock | undefined) => isCaptionBlock(block, "figure");

export class FigureDesigner {
  readonly captions: NumberedCaption[] = [];
  private readonly idPrefix: string;

  constructor(options: { captionIdPrefix?: string } = {}) {
    this.idPrefix = options.captionIdPrefix ?? DEFAULT_CAPTION_ID_PREFIX;
  }

  /** Call once per part, in document order, so numbers run through the whole document. */
  designBlocks(blocks: readonly HtmlBlock[], numbering: PageNumbering): HtmlBlock[] {
    const out: HtmlBlock[] = [];
    const consumed = new Set<number>();

    for (let i = 0; i < blocks.length; i += 1) {
      if (consumed.has(i)) continue;
      const block = blocks[i];

      if (!isFigureBlock(block)) {
        // A caption written above a figure is emitted after it — unless it's
        // the caption below the previous figure.
        const claimedAbove = isFigureCaption(block) && isFigureBlock(blocks[i + 1]) && !isFigureBlock(blocks[i - 1]);
        if (claimedAbove && !isFigureCaption(blocks[i + 2])) continue;
        out.push(block);
        continue;
      }

      out.push({ tag: "p", html: addFigureClass(block.html) });

      const below = isFigureCaption(blocks[i + 1]) ? i + 1 : undefined;
      const above =
        below === undefined && isFigureCaption(blocks[i - 1]) && !isFigureBlock(blocks[i - 2]) ? i - 1 : undefined;
      const captionIndex = below ?? above;
      if (captionIndex !== undefined) {
        consumed.add(captionIndex);
        out.push({ tag: "p", html: this.captionHtml(blocks[captionIndex], numbering) });
      }
    }
    return out;
  }

  private captionHtml(block: HtmlBlock, numbering: PageNumbering): string {
    const number = this.captions.length + 1;
    const id = `${this.idPrefix}-${number}`;
    const rest = stripCaptionPrefix(blockText(block.html), "figure");
    const label = `Figura ${number}.`;
    this.captions.push({ id, number, text: rest.length > 0 ? `${label} ${rest}` : label, numbering });
    const restHtml = rest.length > 0 ? ` ${escapeHtml(rest)}` : "";
    return `<p id="${id}" class="figure-caption"><span class="figure-caption-label">${label}</span>${restHtml}</p>`;
  }
}

function addFigureClass(html: string): string {
  return html.replace(/^<p(\s[^>]*)?>/i, (open, attrs: string | undefined) => {
    const existing = /\sclass="([^"]*)"/.exec(attrs ?? "");
    if (existing) return open.replace(existing[0], ` class="${existing[1]} figure"`);
    return `<p${attrs ?? ""} class="figure">`;
  });
}

/** Caption type for the figure list; same shape as a table caption. */
export type FigureCaption = NumberedCaption;

export const FIGURE_CAPTION_CSS = `
.figure-caption {
  text-align: center;
  margin: 0.2em 0 1em;
  line-height: 1.15;
  break-before: avoid;
  page-break-before: avoid;
}
.figure-caption-label { font-weight: bold; }
`;
