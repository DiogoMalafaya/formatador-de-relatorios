import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { applyWatermark, PREVIEW_WATERMARK_TEXT } from "./watermark.ts";
import { renderPdf } from "../pdf/render.ts";
import { applyFormatting } from "../formatting/apply.ts";
import { GENERIC_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, longParagraphs, paragraph } from "../formatting/testFixtures.ts";

describe("applyWatermark", () => {
  test("adds a fixed-position overlay that repeats on every printed page", async () => {
    const buffer = await buildDocx([paragraph("Texto simples.")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });

    const watermarked = applyWatermark(document);

    assert.match(watermarked.html, /class="preview-watermark"/);
    assert.match(watermarked.css, /position: fixed/);
    assert.match(watermarked.css, /background-image: url\("data:image\/svg\+xml;base64,/);
  });

  test("embeds the watermark text into the tile it generates", () => {
    const document = { html: "<p>x</p>", css: "", warnings: [], ruleSet: {} as never };
    const watermarked = applyWatermark(document, "TESTE");
    const base64 = watermarked.css.match(/base64,([^"]+)"/)?.[1];
    assert.ok(base64);
    const decoded = Buffer.from(base64!, "base64").toString("utf-8");
    assert.match(decoded, />TESTE</);
  });

  test("escapes watermark text before it reaches the SVG markup", () => {
    const document = { html: "<p>x</p>", css: "", warnings: [], ruleSet: {} as never };
    const watermarked = applyWatermark(document, "<script>alert(1)</script>");
    const base64 = watermarked.css.match(/base64,([^"]+)"/)?.[1];
    const decoded = Buffer.from(base64!, "base64").toString("utf-8");
    assert.doesNotMatch(decoded, /<script>/);
  });

  test("a multi-page watermarked document still renders a valid PDF", async () => {
    const buffer = await buildDocx(longParagraphs(90, 400));
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    const watermarked = applyWatermark(document);

    const pdf = await renderPdf(watermarked, { candidateName: "Maria Silva" });
    const loaded = await PDFDocument.load(pdf);
    assert.ok(loaded.getPageCount() > 1);
  });

  test("default watermark text is the pt-PT preview label", async () => {
    const buffer = await buildDocx([heading(1, "Formação")]);
    const document = await applyFormatting(buffer, { ruleSetId: GENERIC_RULE_SET_ID });
    const watermarked = applyWatermark(document);
    const base64 = watermarked.css.match(/base64,([^"]+)"/)?.[1];
    const decoded = Buffer.from(base64!, "base64").toString("utf-8");
    assert.match(decoded, new RegExp(PREVIEW_WATERMARK_TEXT));
  });
});
