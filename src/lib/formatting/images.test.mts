import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { applyImagePolicy, imagePixelSize, MIN_PRINT_DPI, readImageExtents } from "./images.ts";
import type { ParsedImage } from "./images.ts";
import { parseDocxDocument } from "./parseDocx.ts";
import { getRuleSet, HOUSE_RULE_SET_ID } from "./ruleSet.ts";
import { buildDocx, imageParagraph, paragraph, syntheticPng } from "./testFixtures.ts";

const house = getRuleSet(HOUSE_RULE_SET_ID);
const mfr = getRuleSet("mfr");

describe("imagePixelSize", () => {
  test("reads PNG, GIF and JPEG headers", () => {
    assert.deepEqual(imagePixelSize(syntheticPng(640, 400)), { width: 640, height: 400 });

    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02]);
    assert.deepEqual(imagePixelSize(gif), { width: 800, height: 600 });

    // SOI, an APP0 segment of length 4, then SOF0 with height 300, width 500.
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x01, 0xf4, 0x03,
    ]);
    assert.deepEqual(imagePixelSize(jpeg), { width: 500, height: 300 });

    assert.equal(imagePixelSize(Buffer.from("<svg/>")), undefined);
  });
});

describe("readImageExtents + parse", () => {
  test("each image knows its pixel size and the size Word places it at", async () => {
    const chart = syntheticPng(640, 400, 1);
    const logo = syntheticPng(300, 300, 2);
    const buffer = await buildDocx([
      imageParagraph({ png: chart, widthPx: 480, heightPx: 300 }),
      paragraph("Texto."),
      imageParagraph({ png: logo, widthPx: 96, heightPx: 96 }),
    ]);

    const extents = await readImageExtents(buffer);
    assert.equal(extents.size, 2);

    const parsed = await parseDocxDocument(buffer);
    assert.deepEqual(parsed.images, [
      { index: 0, widthPx: 640, heightPx: 400, placedWidthPt: 360, placedHeightPt: 225 },
      { index: 1, widthPx: 300, heightPx: 300, placedWidthPt: 72, placedHeightPt: 72 },
    ]);
    assert.match(parsed.html, /<img [^>]*data-lauda-img="0"[^>]*style="width: 360pt"/);
  });

  test("a buffer that isn't a docx yields no extents rather than throwing", async () => {
    assert.equal((await readImageExtents(Buffer.from("not a zip"))).size, 0);
  });
});

describe("applyImagePolicy", () => {
  const img = (index: number) => `<img src="data:image/png;base64,AA" data-lauda-img="${index}" />`;
  const images: ParsedImage[] = [
    // 640px across 5in: 128 dpi — soft.
    { index: 0, widthPx: 640, heightPx: 400, placedWidthPt: 360, placedHeightPt: 225 },
    // 300px across 1in: 300 dpi — fine.
    { index: 1, widthPx: 300, heightPx: 300, placedWidthPt: 72, placedHeightPt: 72 },
    // 1400px placed at 10in, wider than the 16cm text column, so scaled down
    // to ~6.3in: 222 dpi — fine, though 140 dpi at the size Word asked for.
    { index: 2, widthPx: 1400, heightPx: 700, placedWidthPt: 720, placedHeightPt: 360 },
    // No pixel size (e.g. EMF): no verdict either way.
    { index: 3, placedWidthPt: 100 },
  ];
  const html = `<p>${img(0)}</p><p>Texto ${img(1)}</p><p>${img(2)}</p><p>${img(3)}</p>`;

  test("keeps every image where the profile allows them, anchoring each", () => {
    const result = applyImagePolicy(html, images, { ruleSet: house, anchorPrefix: "src2", placeholders: false });
    assert.equal((result.html.match(/<img /g) ?? []).length, 4);
    assert.match(result.html, /<img src="data:image\/png;base64,AA" id="src2-img-0" \/>/);
    assert.doesNotMatch(result.html, /data-lauda-img/);
  });

  test("flags only images below 150 dpi at the size they actually print", () => {
    const result = applyImagePolicy(html, images, { ruleSet: house, anchorPrefix: "src2", placeholders: false });
    assert.deepEqual(result.lowResolution, [{ anchorId: "src2-img-0", ordinal: 1, dpi: 128 }]);
    assert.ok(128 < MIN_PRINT_DPI);
  });

  test("removes every image where the profile forbids them; text around them stays", () => {
    const result = applyImagePolicy(html, images, { ruleSet: mfr, anchorPrefix: "src2", placeholders: false });
    assert.equal(result.html, "<p>Texto </p>");
    assert.deepEqual(result.lowResolution, []);
  });

  test("the preview gets a placeholder where each forbidden image was", () => {
    const result = applyImagePolicy(html, images, { ruleSet: mfr, anchorPrefix: "src2", placeholders: true });
    assert.equal((result.html.match(/class="omitted-image"/g) ?? []).length, 4);
    assert.doesNotMatch(result.html, /<img/);
  });
});
