import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCorpusCase, GOLDEN_SPECIALTY_IDS } from "./goldenCorpus.ts";
import { renderCorpusCase } from "./renderCorpus.ts";
import { decodePng, diffPages, encodePng, rasterisePdf, MAX_CHANGED_RATIO } from "./visualDiff.ts";
import type { PageImage } from "./visualDiff.ts";

/**
 * Visual regression over the golden corpus (DIO-47): every page of every
 * corpus CV is compared against an approved baseline image, so a design
 * change shows up as a reviewed image diff instead of slipping through.
 *
 * Baselines live in `baselines/<specialty>/page-NN.png` and are derived only
 * from the invented golden corpus, never from a real CV.
 *
 * After an intended visual change, regenerate them and review the PNG diff
 * in the pull request:
 *
 *   npm run test:visual:update
 *
 * On a failure, the actual page, the baseline and a diff image (changes in
 * red over the faded baseline) are written to `.visual-diff/` — CI uploads
 * that folder as an artifact.
 */

const BASELINE_DIR = join(import.meta.dirname, "baselines");
const REVIEW_DIR = join(import.meta.dirname, "..", "..", "..", ".visual-diff");
const UPDATE = process.env.UPDATE_VISUAL_BASELINES === "1";

const pageFile = (n: number) => `page-${String(n).padStart(2, "0")}.png`;

function syntheticPage(draw: (x: number, y: number) => number): PageImage {
  const width = 100;
  const height = 140;
  const grey = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) grey[y * width + x] = draw(x, y);
  return { width, height, grey };
}

describe("visual diff", () => {
  const paragraph = (offsetY: number) => (x: number, y: number) =>
    x >= 10 && x < 90 && y >= 20 + offsetY && y < 40 + offsetY ? 0 : 255;

  test("identical pages and a PNG round trip are not different", async () => {
    const page = syntheticPage(paragraph(0));
    assert.equal(diffPages(page, page).changedPixels, 0);
    const roundTripped = await decodePng(await encodePng(page));
    assert.equal(diffPages(page, roundTripped).different, false);
  });

  test("anti-aliasing noise below the grey threshold is ignored", () => {
    const base = syntheticPage(paragraph(0));
    const noisy = syntheticPage((x, y) => Math.max(0, Math.min(255, paragraph(0)(x, y) + ((x + y) % 2 ? 20 : -20))));
    assert.equal(diffPages(base, noisy).changedPixels, 0);
  });

  test("a moved block of text is different", () => {
    const diff = diffPages(syntheticPage(paragraph(0)), syntheticPage(paragraph(30)));
    assert.ok(diff.changedRatio > MAX_CHANGED_RATIO);
    assert.equal(diff.different, true);
  });

  test("a page of a different size is different", () => {
    const small: PageImage = { width: 10, height: 10, grey: new Uint8Array(100).fill(255) };
    assert.equal(diffPages(syntheticPage(paragraph(0)), small).different, true);
  });
});

describe("golden corpus visual regression (DIO-47)", () => {
  for (const specialtyId of GOLDEN_SPECIALTY_IDS) {
    test(`${specialtyId}: every page matches its approved baseline`, async () => {
      const corpusCase = await buildCorpusCase(specialtyId);
      const { result } = await renderCorpusCase(corpusCase);
      const pages = await rasterisePdf(result.pdf);
      const dir = join(BASELINE_DIR, specialtyId);

      if (UPDATE) {
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        for (const [i, page] of pages.entries()) writeFileSync(join(dir, pageFile(i + 1)), await encodePng(page));
        return;
      }

      assert.ok(existsSync(dir), `no baselines for ${specialtyId} — run \`npm run test:visual:update\``);
      const baselineCount = readdirSync(dir).filter((name) => name.endsWith(".png")).length;

      const review = join(REVIEW_DIR, specialtyId);
      const failures: string[] = [];
      if (baselineCount !== pages.length) {
        failures.push(`page count changed: baseline ${baselineCount}, now ${pages.length}`);
      }

      for (const [i, page] of pages.entries()) {
        const file = join(dir, pageFile(i + 1));
        if (!existsSync(file)) continue; // covered by the page-count failure
        const baselinePng = readFileSync(file);
        const diff = diffPages(await decodePng(baselinePng), page);
        if (!diff.different) continue;

        failures.push(`page ${i + 1}: ${(diff.changedRatio * 100).toFixed(2)}% of pixels changed`);
        mkdirSync(review, { recursive: true });
        const stem = pageFile(i + 1).replace(".png", "");
        writeFileSync(join(review, `${stem}.baseline.png`), baselinePng);
        writeFileSync(join(review, `${stem}.actual.png`), await encodePng(page));
        writeFileSync(join(review, `${stem}.diff.png`), await diff.diffPng());
      }

      assert.deepEqual(
        failures,
        [],
        `${specialtyId} no longer matches its baselines (review images in .visual-diff/${specialtyId}/). ` +
          "If the change is intended, run `npm run test:visual:update` and commit the new baselines.",
      );
    });
  }
});
