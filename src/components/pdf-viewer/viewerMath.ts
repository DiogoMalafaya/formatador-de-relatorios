/**
 * Pure geometry and zoom helpers for the pdf.js preview viewer (DIO-39).
 *
 * Deliberately free of DOM and pdf.js imports so they run under Node's test
 * runner (`viewerMath.test.mts`) — the canvas rendering itself is not
 * unit-testable there, so everything with actual logic lives here and the
 * component keeps only glue.
 */

/**
 * Discrete zoom stops for the +/- buttons, PDF-viewer convention. Fit-width
 * and fit-page produce scales in between; stepping from one snaps to the
 * next stop in the chosen direction.
 */
export const ZOOM_STEPS: readonly number[] = [
  0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
];

export const MIN_SCALE = ZOOM_STEPS[0];
export const MAX_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Relative tolerance for float comparisons between scales. */
const SCALE_EPSILON = 1e-3;

/**
 * Fit-derived scales may fall below MIN_SCALE in very narrow containers;
 * they are still valid (the user asked for "fit"), but never below this.
 */
const MIN_FIT_SCALE = 0.1;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Scale at which a page of `pageWidth` CSS units fills the container width. */
export function fitWidthScale(
  containerWidth: number,
  pageWidth: number,
  padding: number,
): number {
  if (pageWidth <= 0) return 1;
  const available = containerWidth - 2 * padding;
  if (available <= 0) return MIN_FIT_SCALE;
  return Math.max(MIN_FIT_SCALE, available / pageWidth);
}

/** Scale at which the whole page fits inside the container, both axes. */
export function fitPageScale(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
  padding: number,
): number {
  if (pageWidth <= 0 || pageHeight <= 0) return 1;
  const availableW = containerWidth - 2 * padding;
  const availableH = containerHeight - 2 * padding;
  if (availableW <= 0 || availableH <= 0) return MIN_FIT_SCALE;
  return Math.max(
    MIN_FIT_SCALE,
    Math.min(availableW / pageWidth, availableH / pageHeight),
  );
}

/**
 * Next discrete zoom stop from `current` in `direction` (1 = in, -1 = out).
 * A `current` produced by a fit mode lands on the nearest stop beyond it;
 * stepping past either end clamps to that end.
 */
export function stepScale(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    for (const step of ZOOM_STEPS) {
      if (step > current * (1 + SCALE_EPSILON)) return step;
    }
    return MAX_SCALE;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < current * (1 - SCALE_EPSILON)) return ZOOM_STEPS[i];
  }
  return MIN_SCALE;
}

export interface StackLayout {
  /** Top offset of each page inside the scroll content, in CSS pixels. */
  tops: number[];
  /** Height of each page in CSS pixels (echo of the input, post-rounding). */
  heights: number[];
  /** Total scrollable content height, including padding on both ends. */
  totalHeight: number;
}

/**
 * Vertical layout of the page stack: pages of `heights`, separated by `gap`,
 * with `padding` above the first and below the last. Must mirror the CSS of
 * the stack element (flex column with the same gap and padding), which the
 * component guarantees by feeding both from the same constants.
 */
export function stackLayout(
  heights: readonly number[],
  gap: number,
  padding: number,
): StackLayout {
  const tops: number[] = [];
  let cursor = padding;
  for (const height of heights) {
    tops.push(cursor);
    cursor += height + gap;
  }
  const totalHeight =
    heights.length > 0 ? cursor - gap + padding : 2 * padding;
  return { tops, heights: [...heights], totalHeight };
}

/**
 * Index of the page under the vertical center of the viewport — what the
 * "página x de y" indicator should display. A center inside the gap between
 * two pages counts as the later page; before the first page or past the last
 * clamps to the ends.
 */
export function pageIndexAtScrollCenter(
  scrollTop: number,
  viewportHeight: number,
  tops: readonly number[],
  heights: readonly number[],
): number {
  const count = Math.min(tops.length, heights.length);
  if (count === 0) return 0;
  const center = scrollTop + viewportHeight / 2;
  for (let i = 0; i < count; i++) {
    if (center < tops[i] + heights[i]) return i;
  }
  return count - 1;
}

/**
 * iOS Safari refuses canvases above ~16.7M pixels; give ourselves headroom.
 */
export const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * Device-pixel scale to render a page canvas at: the devicePixelRatio for
 * crisp text, reduced when CSS size x DPR would exceed the platform canvas
 * area limit (deep zoom on a retina phone).
 */
export function canvasPixelScale(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxPixels: number = MAX_CANVAS_PIXELS,
): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const area = cssWidth * cssHeight;
  if (area <= 0) return dpr;
  return Math.max(0.25, Math.min(dpr, Math.sqrt(maxPixels / area)));
}
