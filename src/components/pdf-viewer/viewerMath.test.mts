import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SCALE,
  MIN_SCALE,
  ZOOM_STEPS,
  canvasPixelScale,
  clampScale,
  fitPageScale,
  fitWidthScale,
  pageIndexAtScrollCenter,
  stackLayout,
  stepScale,
} from "./viewerMath.ts";

describe("clampScale", () => {
  test("passes through in-range values and clamps the ends", () => {
    assert.equal(clampScale(1.25), 1.25);
    assert.equal(clampScale(0.01), MIN_SCALE);
    assert.equal(clampScale(99), MAX_SCALE);
  });

  test("falls back to 1 for non-finite input", () => {
    assert.equal(clampScale(Number.NaN), 1);
    assert.equal(clampScale(Number.POSITIVE_INFINITY), 1);
  });
});

describe("fitWidthScale", () => {
  test("fills the available width minus padding on both sides", () => {
    // A4 at 72dpi is 595pt wide; container 643 with 24 padding leaves 595.
    assert.equal(fitWidthScale(643, 595, 24), 1);
    assert.ok(Math.abs(fitWidthScale(619, 595, 12) - 1) < 1e-9);
  });

  test("scales down in narrow containers but never collapses to zero", () => {
    const scale = fitWidthScale(300, 595, 24);
    assert.ok(scale > 0.1 && scale < 0.5);
    assert.equal(fitWidthScale(10, 595, 24), 0.1);
    assert.equal(fitWidthScale(-5, 595, 24), 0.1);
  });

  test("degenerate page width yields the neutral scale", () => {
    assert.equal(fitWidthScale(800, 0, 24), 1);
  });
});

describe("fitPageScale", () => {
  test("is limited by the tighter axis", () => {
    // Tall container: width is the constraint, same as fit-width.
    assert.equal(
      fitPageScale(643, 10_000, 595, 842, 24),
      fitWidthScale(643, 595, 24),
    );
    // Short container: height is the constraint.
    const scale = fitPageScale(2_000, 445, 595, 842, 12);
    assert.ok(Math.abs(scale - (445 - 24) / 842) < 1e-9);
  });

  test("never exceeds fit-width for the same container", () => {
    const fp = fitPageScale(700, 500, 595, 842, 24);
    const fw = fitWidthScale(700, 595, 24);
    assert.ok(fp <= fw);
  });
});

describe("stepScale", () => {
  test("steps to adjacent stops from an exact stop", () => {
    assert.equal(stepScale(1, 1), 1.1);
    assert.equal(stepScale(1, -1), 0.9);
  });

  test("snaps a fit-derived scale to the next stop in the direction", () => {
    assert.equal(stepScale(0.93, 1), 1);
    assert.equal(stepScale(0.93, -1), 0.9);
    assert.equal(stepScale(1.05, 1), 1.1);
    assert.equal(stepScale(1.05, -1), 1);
  });

  test("clamps at both ends", () => {
    assert.equal(stepScale(MAX_SCALE, 1), MAX_SCALE);
    assert.equal(stepScale(MIN_SCALE, -1), MIN_SCALE);
    assert.equal(stepScale(0.2, -1), MIN_SCALE);
    assert.equal(stepScale(10, 1), MAX_SCALE);
  });

  test("is immune to float noise around a stop", () => {
    // 1.1 stored as 1.1000000000000001 must not "step" onto itself.
    assert.equal(stepScale(1.1 + 1e-12, 1), 1.25);
    assert.equal(stepScale(1.1 - 1e-12, -1), 1);
  });

  test("zoom stops are strictly increasing", () => {
    for (let i = 1; i < ZOOM_STEPS.length; i++) {
      assert.ok(ZOOM_STEPS[i] > ZOOM_STEPS[i - 1]);
    }
  });
});

describe("stackLayout", () => {
  test("accumulates tops with gap and padding", () => {
    const layout = stackLayout([100, 200, 150], 16, 24);
    assert.deepEqual(layout.tops, [24, 140, 356]);
    assert.equal(layout.totalHeight, 24 + 100 + 16 + 200 + 16 + 150 + 24);
  });

  test("empty stack is just the padding", () => {
    const layout = stackLayout([], 16, 24);
    assert.deepEqual(layout.tops, []);
    assert.equal(layout.totalHeight, 48);
  });
});

describe("pageIndexAtScrollCenter", () => {
  const { tops, heights } = stackLayout([800, 800, 800], 16, 24);

  test("at the top of the stack, page 1", () => {
    assert.equal(pageIndexAtScrollCenter(0, 600, tops, heights), 0);
  });

  test("tracks the page under the viewport center", () => {
    // Center at scrollTop + 300; page 2 spans [840, 1640).
    assert.equal(pageIndexAtScrollCenter(700, 600, tops, heights), 1);
  });

  test("a center inside the gap counts as the later page", () => {
    // Gap between page 1 and 2 is [824, 840); center = 830.
    assert.equal(pageIndexAtScrollCenter(530, 600, tops, heights), 1);
  });

  test("clamps past the last page", () => {
    assert.equal(pageIndexAtScrollCenter(100_000, 600, tops, heights), 2);
  });

  test("empty document maps to index 0", () => {
    assert.equal(pageIndexAtScrollCenter(0, 600, [], []), 0);
  });
});

describe("canvasPixelScale", () => {
  test("uses the devicePixelRatio when the canvas stays under the limit", () => {
    assert.equal(canvasPixelScale(595, 842, 2), 2);
  });

  test("reduces below the DPR when the area would exceed the platform cap", () => {
    // A4 at 3x zoom on a 3x display: 1785x2526 CSS px, needs ~1.88 to stay
    // under 16M device pixels.
    const scale = canvasPixelScale(595 * 3, 842 * 3, 3);
    assert.ok(scale < 3);
    const pixels = 595 * 3 * scale * (842 * 3 * scale);
    assert.ok(pixels <= 16_000_000 * 1.001);
  });

  test("never drops below the readability floor", () => {
    assert.equal(canvasPixelScale(100_000, 100_000, 2), 0.25);
  });

  test("guards degenerate inputs", () => {
    assert.equal(canvasPixelScale(0, 0, 2), 2);
    assert.equal(canvasPixelScale(595, 842, 0), 1);
  });
});
