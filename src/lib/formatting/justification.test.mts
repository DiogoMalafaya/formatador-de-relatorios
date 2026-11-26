import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPdf } from "../pdf/render.ts";
import { applyFormatting } from "./apply.ts";
import type { FormattedDocument } from "./apply.ts";
import { buildDocx, bulletItem, heading, paragraph } from "./testFixtures.ts";
import { HOUSE_RULE_SET_ID } from "./ruleSet.ts";
import { buildCorpusCase } from "../quality/goldenCorpus.ts";
import { renderCorpusCase } from "../quality/renderCorpus.ts";

/**
 * Regression test for DIO-57: body text must come out *justified* in the
 * PDF we actually produce, not only in the CSS we meant to produce.
 *
 * Reads the rendered PDF with pdf.js, groups text into lines by baseline
 * and looks at where each line ends. In a justified paragraph every line but
 * the last ends at the same x (the right edge of the text block); ragged
 * text ends wherever its last word does. A control render with the
 * justification overridden proves the measurement can tell the two apart.
 *
 * These launch a real local Chrome, like the other `src/lib/pdf` suites.
 */

/** Invented prose, all lowercase after the first word so every word may hyphenate. */
const PROSE =
  "Durante o internato participei de forma ativa na atividade assistencial do serviço, " +
  "acompanhando doentes internados e em ambulatório, com especial interesse na reabilitação " +
  "neurológica e musculoesquelética. Colaborei na elaboração de planos terapêuticos " +
  "individualizados, na articulação com as equipas de enfermagem, fisioterapia e terapia " +
  "ocupacional, e no planeamento da alta em estreita colaboração com os cuidados de saúde " +
  "primários, consolidando competências de comunicação, organização e trabalho em equipa.";

/** Margin band holding the stamped footer and running header (2 cm). */
const FURNITURE_BAND_PT = 56;

/** Lines whose right edges agree within this are "flush" with each other. */
const FLUSH_TOLERANCE_PT = 0.5;

interface Line {
  page: number;
  y: number;
  left: number;
  right: number;
  text: string;
}

async function readLines(pdf: Uint8Array): Promise<Line[]> {
  const loadingTask = getDocument({ data: new Uint8Array(pdf), disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await loadingTask.promise;
  const lines: Line[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const [, , , height] = page.view;
      const byBaseline = new Map<number, Line>();
      for (const item of (await page.getTextContent()).items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5] * 2) / 2;
        // Only the text block: the stamped footer and running header sit in
        // the margins (≥ 2.5 cm under every profile) and have their own layout.
        if (y < FURNITURE_BAND_PT || y > height - FURNITURE_BAND_PT) continue;
        const line = byBaseline.get(y);
        const blank = item.str.trim().length === 0;
        if (!line && blank) continue;
        const x = item.transform[4];
        const current = line ?? { page: pageNumber, y, left: x, right: x, text: "" };
        if (!blank) {
          current.left = Math.min(current.left, x);
          current.right = Math.max(current.right, x + item.width);
        }
        current.text += item.str;
        byBaseline.set(y, current);
      }
      lines.push(...[...byBaseline.values()].sort((a, b) => b.y - a.y));
    }
  } finally {
    await loadingTask.destroy();
  }
  return lines;
}

/** The lines of the paragraph whose text starts with `opening`, in order. */
function paragraphLines(lines: Line[], opening: string, closing: string): Line[] {
  // Spaces in pdf.js text are unreliable (separate items, or none at all).
  const squash = (text: string) => text.replace(/[\s\u00ad\u2010-]+/g, "");
  const start = lines.findIndex((line) => squash(line.text).startsWith(squash(opening)));
  assert.ok(start >= 0, "the paragraph's first line is in the PDF");
  const end = lines.findIndex((line, index) => index > start && squash(line.text).endsWith(squash(closing)));
  assert.ok(end > start, "the paragraph wraps onto several lines");
  return lines.slice(start, end + 1);
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

async function renderProse(ruleSetId: string, extraCss = ""): Promise<{ lines: Line[]; document: FormattedDocument }> {
  const buffer = await buildDocx([
    heading(1, "Resumo"),
    paragraph(PROSE),
    paragraph(PROSE),
    bulletItem("Primeiro item, curto."),
    bulletItem("Segundo item, também curto."),
  ]);
  const formatted = await applyFormatting(buffer, { ruleSetId });
  const document = { ...formatted, css: formatted.css + extraCss };
  const pdf = await renderPdf(document, { candidateName: "Maria Silva" });
  return { lines: await readLines(pdf), document };
}

describe("body text is justified in the rendered PDF (DIO-57)", () => {
  for (const ruleSetId of ["mfr", "pediatria", HOUSE_RULE_SET_ID]) {
    test(`${ruleSetId}: every line of a body paragraph but the last ends flush right`, async () => {
      const { lines } = await renderProse(ruleSetId);
      const body = paragraphLines(lines, "Durante o internato", "pa.");
      const wrapped = body.slice(0, -1);
      assert.ok(wrapped.length >= 3, `expected the paragraph to wrap, got ${body.length} line(s)`);

      const edges = wrapped.map((line) => line.right);
      assert.ok(
        spread(edges) <= FLUSH_TOLERANCE_PT,
        `wrapped lines end at ${edges.map((edge) => edge.toFixed(1)).join(", ")} — not justified`,
      );
      // The last line is not stretched to the edge.
      assert.ok(body[body.length - 1].right < Math.min(...edges) - 20, "the paragraph's last line stays ragged");

      // Hyphenation still works: soft hyphens let at least one line break mid-word.
      assert.ok(
        wrapped.some((line) => /[‐­-]$/.test(line.text.trimEnd())),
        "at least one wrapped line ends in a hyphen",
      );

      // Headings and short list items are not stretched to the edge.
      const title = lines.find((line) => line.text.trim() === "Resumo");
      assert.ok(title && title.right < Math.min(...edges) - 100, "the heading keeps its natural width");
      const item = lines.find((line) => line.text.includes("Primeiro item"));
      assert.ok(item && item.right < Math.min(...edges) - 100, "a one-line list item keeps its natural width");
    });
  }

  test("control: the same measurement catches ragged-right text", async () => {
    const { lines } = await renderProse("mfr", "\np, li { text-align: left !important; }");
    const wrapped = paragraphLines(lines, "Durante o internato", "pa.").slice(0, -1);
    assert.ok(spread(wrapped.map((line) => line.right)) > FLUSH_TOLERANCE_PT * 4);
  });

  // The multi-file path a real CV takes: merge, front matter, numbering,
  // themes and two-pass pagination all run before the print.
  for (const specialtyId of ["medicina-fisica-e-de-reabilitacao", "pediatria"]) {
    test(`${specialtyId} golden corpus: every body paragraph's wrapped lines end flush right`, async () => {
      const corpusCase = await buildCorpusCase(specialtyId);
      const { result } = await renderCorpusCase(corpusCase);
      const lines = await readLines(result.pdf);

      // Every prose paragraph of the corpus opens the same way.
      const starts = lines.flatMap((line, index) => (line.text.startsWith("Durante este período") ? [index] : []));
      assert.ok(starts.length >= 3, `expected several body paragraphs, found ${starts.length}`);
      for (const start of starts) {
        const body = paragraphLines(lines.slice(start), "Durante este período", "rios.");
        const edges = body.slice(0, -1).map((line) => line.right);
        assert.ok(
          spread(edges) <= FLUSH_TOLERANCE_PT,
          `page ${body[0].page}: wrapped lines end at ${edges.map((edge) => edge.toFixed(1)).join(", ")} — not justified`,
        );
      }
    });
  }
});
