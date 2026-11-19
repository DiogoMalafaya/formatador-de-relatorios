import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assembleMultiFileDocument } from "./prepareDocument.ts";
import type { ParsedSource } from "./prepareDocument.ts";
import { parseDocxDocument } from "../formatting/parseDocx.ts";
import { HOUSE_RULE_SET_ID } from "../formatting/ruleSet.ts";
import { buildDocx, heading, imageParagraph, paragraph, syntheticPng } from "../formatting/testFixtures.ts";

/** Student images across a multi-file CV (DIO-49): decided per source, attributed per file. */
async function sources(): Promise<ParsedSource[]> {
  const source = async (id: string, filename: string, children: Parameters<typeof buildDocx>[0]) => ({
    id,
    filename,
    document: await parseDocxDocument(await buildDocx(children)),
  });
  return [
    await source("master", "Principal.docx", [heading(1, "Dedicatória"), paragraph("Texto.")]),
    await source("a", "Capítulo A.docx", [
      heading(1, "Capítulo A"),
      // 640px across 5in: 128 dpi.
      imageParagraph({ png: syntheticPng(640, 400, 1), widthPx: 480, heightPx: 300 }),
      imageParagraph({ png: syntheticPng(300, 300, 2), widthPx: 96, heightPx: 96 }),
    ]),
    await source("b", "Capítulo B.docx", [heading(1, "Capítulo B"), imageParagraph({ png: syntheticPng(320, 200, 3), widthPx: 96, heightPx: 60 })]),
  ];
}

describe("assembleMultiFileDocument — images (DIO-49)", () => {
  test("MFR: every image removed, one warning per image naming its file", async () => {
    const prepared = assembleMultiFileDocument({ sources: await sources(), masterPosition: 0, ruleSetId: "mfr" });
    assert.doesNotMatch(prepared.document.html, /<img/);
    assert.doesNotMatch(prepared.document.html, /omitted-image/);
    assert.deepEqual(
      prepared.document.warnings.filter((w) => w.code === "image-omitted").map((w) => w.sourceFilename),
      ["Capítulo A.docx", "Capítulo A.docx", "Capítulo B.docx"],
    );
    assert.deepEqual(prepared.merge?.lowResolutionImages, []);
  });

  test("the preview marks each removed image", async () => {
    const prepared = assembleMultiFileDocument({
      sources: await sources(),
      masterPosition: 0,
      ruleSetId: "mfr",
      imagePlaceholders: true,
    });
    assert.equal((prepared.document.html.match(/class="omitted-image"/g) ?? []).length, 3);
  });

  test("house standard: every image kept with a unique anchor; soft ones listed with their file", async () => {
    const prepared = assembleMultiFileDocument({ sources: await sources(), masterPosition: 0, ruleSetId: HOUSE_RULE_SET_ID });
    const ids = [...prepared.document.html.matchAll(/<img [^>]*id="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(ids, ["src1-img-0", "src1-img-1", "src2-img-0"]);
    assert.deepEqual(prepared.merge?.lowResolutionImages, [
      { anchorId: "src1-img-0", ordinal: 1, dpi: 128, sourceFilename: "Capítulo A.docx" },
    ]);
    assert.ok(!prepared.document.warnings.some((w) => w.code === "image-omitted"));
  });
});
