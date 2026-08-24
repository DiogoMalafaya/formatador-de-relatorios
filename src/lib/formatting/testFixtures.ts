/**
 * .docx builders shared by the DIO-10 test suites. Not a test file itself —
 * `docx` (which authors these) is a devDependency for exactly this reason;
 * `mammoth` (which the engine actually parses with) is a runtime dependency.
 */

import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";

/** A minimal 1x1 PNG, just enough for mammoth to recognise it as an image. */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function buildDocx(children: (Paragraph | Table)[]): Promise<Buffer> {
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export function heading(level: 1 | 2 | 3, text: string): Paragraph {
  const headingLevel = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 }[
    level
  ];
  return new Paragraph({ heading: headingLevel, children: [new TextRun(text)] });
}

export function paragraph(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)] });
}

export function bulletItem(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text)] });
}

export function simpleTable(rows: string[][]): Table {
  return new Table({
    rows: rows.map(
      (cells) =>
        new TableRow({
          children: cells.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
        }),
    ),
  });
}

/** A table with a table nested inside its first cell — the unsupported structure DIO-10 flags. */
export function nestedTable(): Table {
  return new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({ children: [simpleTable([["inner"]])] }),
        ],
      }),
    ],
  });
}

export function imageParagraph(): Paragraph {
  return new Paragraph({
    children: [new ImageRun({ data: ONE_PIXEL_PNG, type: "png", transformation: { width: 10, height: 10 } })],
  });
}

/** Enough distinct words to push the page-limit estimate over a small `maxPages`. */
export function longParagraphs(paragraphCount: number, wordsPerParagraph: number): Paragraph[] {
  const words = Array.from({ length: wordsPerParagraph }, (_, i) => `palavra${i}`).join(" ");
  return Array.from({ length: paragraphCount }, () => paragraph(words));
}
