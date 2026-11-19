/**
 * Student images (DIO-49, PRD US12).
 *
 * Every image in the uploaded documents reaches the output **unless the
 * profile forbids it** (MFR: "fotografias ou gráficos"; PRD Q13 defaults to
 * every embedded image, logos and diagrams included, and Q10 to no signature
 * exception). Nothing goes silently either way:
 *
 * - Kept images are placed at the size the student gave them in Word
 *   (`wp:extent`), scaled down to the text width when wider, never up. Each
 *   gets an anchor id so the two-pass render can say which page a
 *   low-resolution one landed on.
 * - Forbidden images are removed. The constraint warnings carry one warning
 *   per image, and the preview (only) shows a placeholder where each was, so
 *   the student can see what went. The final PDF has no trace of them.
 *
 * mammoth exposes an image's bytes but not its Word extent, so the extents
 * are read from `word/document.xml` directly and matched to images by a hash
 * of their bytes — independent of the order mammoth visits them in.
 *
 * PRIVACY: image bytes are hashed and measured in memory, never logged or
 * written anywhere; they live inside the document HTML like any other
 * content and follow its retention window.
 */

import { createHash } from "node:crypto";
import JSZip from "jszip";
import { escapeHtml } from "../html.ts";
import type { RuleSet } from "./ruleSet.ts";

/** One image as parsed, before any profile decision. Never holds the image bytes. */
export interface ParsedImage {
  /** 0-based, document order; matches `data-lauda-img` on the `<img>`. */
  index: number;
  /** Intrinsic pixel size, when the format's header could be read (PNG, JPEG, GIF). */
  widthPx?: number;
  heightPx?: number;
  /** The size it's placed at in Word, in points, when the document says. */
  placedWidthPt?: number;
  placedHeightPt?: number;
}

/** Below this, an image prints visibly soft (PRD US12). */
export const MIN_PRINT_DPI = 150;

const EMU_PER_POINT = 12700;
const POINTS_PER_CM = 72 / 2.54;
const A4_WIDTH_CM = 21;

/* ------------------------------ parse-time facts ------------------------------ */

export function hashImage(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

/**
 * Word placement sizes keyed by image hash. An image used twice at two sizes
 * keeps the first; the low-resolution check is a warning, not a gate.
 * Returns an empty map for anything that isn't a readable .docx.
 */
export async function readImageExtents(docx: Buffer): Promise<Map<string, { widthPt: number; heightPt: number }>> {
  const extents = new Map<string, { widthPt: number; heightPt: number }>();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(docx);
  } catch {
    return extents;
  }
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  if (!documentXml || !relsXml) return extents;

  const targets = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[0])?.[1];
    if (id && target && !/TargetMode="External"/.test(match[0])) targets.set(id, target);
  }

  for (const drawing of documentXml.matchAll(/<w:drawing>([\s\S]*?)<\/w:drawing>/g)) {
    const extent = /<wp:extent\s+cx="(\d+)"\s+cy="(\d+)"/.exec(drawing[1]);
    const embed = /<a:blip\b[^>]*\br:embed="([^"]+)"/.exec(drawing[1]);
    if (!extent || !embed) continue;
    const target = targets.get(embed[1]);
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`;
    const bytes = await zip.file(path)?.async("uint8array");
    if (!bytes) continue;
    const key = hashImage(bytes);
    if (extents.has(key)) continue;
    extents.set(key, {
      widthPt: Number(extent[1]) / EMU_PER_POINT,
      heightPt: Number(extent[2]) / EMU_PER_POINT,
    });
  }
  return extents;
}

/** Pixel size from the file header: PNG, JPEG and GIF. Anything else is undefined. */
export function imagePixelSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // PNG: signature, then the IHDR chunk's width/height.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  // GIF: "GIF8", little-endian logical screen size.
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  }
  return undefined;
}

/** The `<img>` attributes the parser emits: an index to find the image again, and its Word size. */
export function imageAttributes(image: ParsedImage): Record<string, string> {
  const attributes: Record<string, string> = { "data-lauda-img": String(image.index) };
  if (image.placedWidthPt !== undefined) attributes.style = `width: ${round(image.placedWidthPt)}pt`;
  return attributes;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ------------------------------ the profile's decision ------------------------------ */

export interface LowResolutionImage {
  /** Anchor id on the `<img>` — the page map resolves it to a page. */
  anchorId: string;
  /** 1-based position of the image within its source file, for the message. */
  ordinal: number;
  /** Effective resolution at the placed size, rounded. */
  dpi: number;
}

export interface ImagePolicyResult {
  html: string;
  /** Kept images printing below `MIN_PRINT_DPI`. Empty when images are forbidden. */
  lowResolution: LowResolutionImage[];
}

export interface ImagePolicyOptions {
  ruleSet: RuleSet;
  /** Prefix for image anchor ids; must be unique per source in a merged document. */
  anchorPrefix: string;
  /** Preview only: show where a forbidden image was. Never in the final PDF. */
  placeholders: boolean;
}

const IMG_TAG_PATTERN = /<img\b[^>]*>/gi;

/**
 * Keeps or removes each image per the profile, over one source's HTML.
 * Removal is exactly the `<img>` tag (plus a paragraph it leaves empty);
 * text around it is untouched.
 */
export function applyImagePolicy(
  html: string,
  images: readonly ParsedImage[],
  options: ImagePolicyOptions,
): ImagePolicyResult {
  const { ruleSet } = options;

  if (ruleSet.constraints.imagesForbidden) {
    const replaced = html.replace(IMG_TAG_PATTERN, () =>
      options.placeholders ? omittedImagePlaceholderHtml(ruleSet) : "",
    );
    // A paragraph that held nothing but the image would print as a gap.
    return { html: replaced.replace(/<p>\s*<\/p>/g, ""), lowResolution: [] };
  }

  const textWidthPt = (A4_WIDTH_CM - ruleSet.margins.leftCm - ruleSet.margins.rightCm) * POINTS_PER_CM;
  const byIndex = new Map(images.map((image) => [image.index, image]));
  const lowResolution: LowResolutionImage[] = [];

  const out = html.replace(IMG_TAG_PATTERN, (tag) => {
    const index = Number(/\sdata-lauda-img="(\d+)"/.exec(tag)?.[1]);
    if (!Number.isInteger(index)) return tag;
    const anchorId = `${options.anchorPrefix}-img-${index}`;
    const image = byIndex.get(index);
    if (image?.widthPx !== undefined && image.placedWidthPt !== undefined && image.placedWidthPt > 0) {
      // Wider than the text column means scaled down, which only raises the resolution.
      const placedInches = Math.min(image.placedWidthPt, textWidthPt) / 72;
      const dpi = image.widthPx / placedInches;
      if (dpi < MIN_PRINT_DPI) lowResolution.push({ anchorId, ordinal: index + 1, dpi: Math.round(dpi) });
    }
    return tag.replace(/\sdata-lauda-img="\d+"/, ` id="${escapeHtml(anchorId)}"`);
  });

  return { html: out, lowResolution };
}

export const OMITTED_IMAGE_TEXT_PT = "Imagem removida — as normas não permitem fotografias ou gráficos";

function omittedImagePlaceholderHtml(ruleSet: RuleSet): string {
  return `<span class="omitted-image" title="${escapeHtml(ruleSet.name)}">${escapeHtml(OMITTED_IMAGE_TEXT_PT)}</span>`;
}

/**
 * Image layout. Images never split across pages and stay with their caption
 * (`figures.ts` puts the caption right below with no break between). The
 * placeholder is preview-only furniture: black text, a hairline frame.
 */
export const IMAGE_CSS = `
img { max-width: 100%; height: auto; break-inside: avoid; page-break-inside: avoid; }
p.figure { text-align: center; line-height: 1; margin: 0.8em 0 0.3em; break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
td img, th img { display: block; }
.omitted-image {
  display: inline-block;
  padding: 0.6em 1em;
  border: 0.75pt dashed #808080;
  font-style: italic;
}
`;
