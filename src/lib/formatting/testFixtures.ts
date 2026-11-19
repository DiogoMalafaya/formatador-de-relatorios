/**
 * .docx builders shared by the DIO-10 test suites. Not a test file itself —
 * `docx` (which authors these) is a devDependency for exactly this reason;
 * `mammoth` (which the engine actually parses with) is a runtime dependency.
 */

import { deflateSync } from "node:zlib";
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

export function imageParagraph(options: { png?: Buffer; widthPx?: number; heightPx?: number } = {}): Paragraph {
  return new Paragraph({
    children: [
      new ImageRun({
        data: options.png ?? ONE_PIXEL_PNG,
        type: "png",
        // docx places images in CSS pixels (1/96 in).
        transformation: { width: options.widthPx ?? 10, height: options.heightPx ?? 10 },
      }),
    ],
  });
}

/**
 * A synthetic greyscale PNG of the given pixel size: vertical bars, like a
 * small bar chart, so it's a real image with a real header (DIO-49). `seed`
 * varies the bars, so two images of one size don't hash alike.
 */
export function syntheticPng(width: number, height: number, seed = 1): Buffer {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width + 1)] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const bar = Math.floor((x * 8) / width);
      const barTop = height * (0.15 + 0.1 * ((bar * 3 + seed) % 7));
      raw[y * (width + 1) + 1 + x] = y > barTop && x % Math.max(1, Math.floor(width / 8)) > 2 ? 90 + bar * 15 : 255;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Enough distinct words to push the page-limit estimate over a small `maxPages`. */
export function longParagraphs(paragraphCount: number, wordsPerParagraph: number): Paragraph[] {
  const words = Array.from({ length: wordsPerParagraph }, (_, i) => `palavra${i}`).join(" ");
  return Array.from({ length: paragraphCount }, () => paragraph(words));
}
