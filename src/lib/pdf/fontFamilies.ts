/**
 * The embedded font families (DIO-46) as pure data: no filesystem access, so
 * modules the client bundle also reaches (the cover templates, DIO-56) can
 * name a family's CSS stack. `fonts.ts` reads the files and serves them.
 */

import type { FontFamily } from "../formatting/ruleSet.ts";

/** Never resolves: requests to it are answered by `serveEmbeddedFonts` or not at all. */
export const FONT_ORIGIN = "https://lauda-fonts.invalid/";

export interface Face {
  file: string;
  /** CSS font-weight descriptor; a range for variable fonts. */
  weight: string;
  style: "normal" | "italic";
}

export interface EmbeddedFamily {
  /** The CSS family name we register — also the name the PDF will report. */
  cssFamily: string;
  generic: "serif" | "sans-serif";
  faces: readonly Face[];
  /** Regular face, embedded by pdf-lib for stamped footers/headers. */
  regularFile: string;
  /**
   * The regular face is a variable font. pdf-lib's subsetter drops its
   * outlines (the text extracts, but most glyphs don't draw), so stamping
   * embeds it whole. Found when the sans theme (DIO-56) put Arimo footers
   * on house-standard CVs.
   */
  variable?: true;
}

export const EMBEDDED_FONTS: Readonly<Record<FontFamily, EmbeddedFamily>> = {
  Arial: {
    cssFamily: "Arimo",
    generic: "sans-serif",
    faces: [
      { file: "Arimo-VariableWght.ttf", weight: "400 700", style: "normal" },
      { file: "Arimo-Italic-VariableWght.ttf", weight: "400 700", style: "italic" },
    ],
    regularFile: "Arimo-VariableWght.ttf",
    variable: true,
  },
  "Times New Roman": {
    cssFamily: "Tinos",
    generic: "serif",
    faces: [
      { file: "Tinos-Regular.ttf", weight: "400", style: "normal" },
      { file: "Tinos-Bold.ttf", weight: "700", style: "normal" },
      { file: "Tinos-Italic.ttf", weight: "400", style: "italic" },
      { file: "Tinos-BoldItalic.ttf", weight: "700", style: "italic" },
    ],
    regularFile: "Tinos-Regular.ttf",
  },
  Verdana: {
    cssFamily: "DejaVu LGC Sans",
    generic: "sans-serif",
    faces: [
      { file: "DejaVuLGCSans.ttf", weight: "400", style: "normal" },
      { file: "DejaVuLGCSans-Bold.ttf", weight: "700", style: "normal" },
      { file: "DejaVuLGCSans-Oblique.ttf", weight: "400", style: "italic" },
      { file: "DejaVuLGCSans-BoldOblique.ttf", weight: "700", style: "italic" },
    ],
    regularFile: "DejaVuLGCSans.ttf",
  },
};

/** The CSS `font-family` value for a norm's font: our embedded face, then a generic fallback. */
export function fontStack(family: FontFamily): string {
  const embedded = EMBEDDED_FONTS[family];
  return `"${embedded.cssFamily}", ${embedded.generic}`;
}

/** `@font-face` rules for one norm font. Only faces the page uses get fetched. */
export function fontFaceCss(family: FontFamily): string {
  const embedded = EMBEDDED_FONTS[family];
  return embedded.faces
    .map(
      (face) =>
        `@font-face { font-family: "${embedded.cssFamily}"; ` +
        `src: url("${FONT_ORIGIN}${face.file}") format("truetype"); ` +
        `font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; }`,
    )
    .join("\n");
}
