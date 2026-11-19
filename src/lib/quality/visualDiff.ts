/**
 * Visual regression for rendered PDFs (DIO-47).
 *
 * Pages are rasterised with pdf.js onto `@napi-rs/canvas` (Skia) rather than
 * screenshotted in Chrome: the PDF is the product, and pdf.js draws its
 * embedded fonts as paths, so the same PDF rasterises the same way on a Mac
 * and on the Linux CI runner. What can still differ between machines is the
 * PDF itself — Chrome's sub-pixel text positioning, anti-aliasing at glyph
 * edges — so the comparison is tolerant by design:
 *
 *  - a pixel counts as changed only if its grey level moved by more than
 *    `PIXEL_THRESHOLD` (absorbs anti-aliasing noise);
 *  - a page fails only if more than `MAX_CHANGED_RATIO` of its pixels changed
 *    (absorbs a glyph shifting by a fraction of a pixel, still catches a
 *    moved paragraph, a new rule line or a changed fill).
 *
 * The page count must match exactly: a page appearing or disappearing is
 * always a reviewable change.
 */

import { createCanvas } from "@napi-rs/canvas";
import sharp from "sharp";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Rasterisation resolution. Low enough to keep baselines small, high enough to see layout. */
export const BASELINE_DPI = 60;
/** Grey-level change (0–255) below which a pixel is considered unchanged. */
export const PIXEL_THRESHOLD = 48;
/** Share of a page's pixels allowed to change before the page counts as different. */
export const MAX_CHANGED_RATIO = 0.002;

export interface PageImage {
  width: number;
  height: number;
  /** One grey byte per pixel, row-major. */
  grey: Uint8Array;
}

function toGrey(rgba: Uint8ClampedArray | Uint8Array, pixels: number): Uint8Array {
  const grey = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    // Pages are opaque; Rec. 601 luma is plenty for "did this move".
    grey[i] = Math.round(0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]);
  }
  return grey;
}

/** Rasterises every page of a PDF to greyscale at `dpi`. */
export async function rasterisePdf(pdf: Buffer | Uint8Array, dpi = BASELINE_DPI): Promise<PageImage[]> {
  const loadingTask = getDocument({
    data: new Uint8Array(pdf), // pdf.js detaches the buffer it is given
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  try {
    const pages: PageImage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      const { data } = context.getImageData(0, 0, width, height);
      pages.push({ width, height, grey: toGrey(data, width * height) });
      page.cleanup();
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Encodes a page as a 16-level greyscale palette PNG. Quantising costs at
 * most ~8 grey levels, well under `PIXEL_THRESHOLD`, and keeps a whole
 * corpus CV around 100 KB, so baselines can live in git.
 */
export function encodePng(image: PageImage): Promise<Buffer> {
  return sharp(Buffer.from(image.grey), { raw: { width: image.width, height: image.height, channels: 1 } })
    .png({ compressionLevel: 9, palette: true, colours: 16 })
    .toBuffer();
}

export async function decodePng(png: Buffer): Promise<PageImage> {
  const { data, info } = await sharp(png).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`expected a greyscale baseline, got ${info.channels} channels`);
  return { width: info.width, height: info.height, grey: new Uint8Array(data) };
}

export interface PageDiff {
  /** Pixels whose grey level moved by more than the threshold. */
  changedPixels: number;
  changedRatio: number;
  /** Over the tolerance (or a different size). */
  different: boolean;
  /**
   * A review image: the baseline faded to light grey, with changed pixels
   * drawn in red, so a reviewer sees what moved in context.
   */
  diffPng: () => Promise<Buffer>;
}

export function diffPages(baseline: PageImage, actual: PageImage): PageDiff {
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return {
      changedPixels: Number.POSITIVE_INFINITY,
      changedRatio: 1,
      different: true,
      diffPng: () => encodePng(actual),
    };
  }

  const pixels = baseline.grey.length;
  const changed = new Uint8Array(pixels);
  let changedPixels = 0;
  for (let i = 0; i < pixels; i++) {
    if (Math.abs(baseline.grey[i] - actual.grey[i]) > PIXEL_THRESHOLD) {
      changed[i] = 1;
      changedPixels++;
    }
  }
  const changedRatio = changedPixels / pixels;

  return {
    changedPixels,
    changedRatio,
    different: changedRatio > MAX_CHANGED_RATIO,
    diffPng: () => {
      const rgb = Buffer.alloc(pixels * 3);
      for (let i = 0; i < pixels; i++) {
        const o = i * 3;
        if (changed[i]) {
          rgb[o] = 220;
          rgb[o + 1] = 30;
          rgb[o + 2] = 30;
        } else {
          rgb[o] = rgb[o + 1] = rgb[o + 2] = 255 - Math.round((255 - baseline.grey[i]) * 0.25);
        }
      }
      return sharp(rgb, { raw: { width: baseline.width, height: baseline.height, channels: 3 } }).png().toBuffer();
    },
  };
}
