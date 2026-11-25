/**
 * Cover layouts (DIO-12, redesigned for the house themes in DIO-56).
 *
 * A layout is HTML plus CSS built from `CoverTokens`, which come from the
 * effective theme (`themes/index.ts`): the theme's accent, tint and display
 * face where the profile allows them, black and the norm font where it
 * doesn't. So every layout exists in both modes:
 *
 * - **expressive** (house standard, Oftalmologia, Pediatria): display face,
 *   large type, accent rules and colour fields;
 * - **strict** (MFR: white cover, black text, no colours or symbols): the
 *   same composition with the fields dropped and the rules black hairlines.
 *
 * Typographic only in both: no imagery, no icons (PRD §6.2). Every layout
 * fits one page inside every profile's margins (`COVER_HEIGHT`), so cover
 * text never reaches the margin the compliance checker reads as footer.
 *
 * Adding a layout is config, as DIO-12 required: an entry here. Thumbnails
 * are trusted, hand-authored SVG (not user input) rendered via
 * `dangerouslySetInnerHTML` in `CoverSelect`, drawn in neutral greys because
 * the gallery doesn't know the profile.
 *
 * No Node imports: the client gallery imports this module.
 */

export interface CoverFields {
  /** Already HTML-escaped by `mergeCoverWithDocument` — templates must not escape again. */
  candidateName: string;
  /** Already HTML-escaped by `mergeCoverWithDocument`. */
  dateLabel: string;
  /**
   * "Internato Médico de …", already escaped. Empty when the specialty is
   * unknown — templates render `coverLines` rather than this directly.
   */
  internatoPt: string;
  /** Local de formação, "Hospital …, Cidade", already escaped. Empty when not given yet (DIO-50). */
  localPt: string;
}

/** What a layout's CSS may use, already constrained by the profile. */
export interface CoverTokens {
  /** Kicker, rules, fields. "#000000" in strict mode. */
  accent: string;
  /** Light fill; null where the cover may not carry colour. */
  tint: string | null;
  /** Text on an accent field; "#000000" in strict mode. */
  onAccent: string;
  /** Colour fields allowed: the cover's colour and layout are unregulated. */
  colourFields: boolean;
  /** CSS font stack for the candidate's name. */
  displayFont: string;
  displayItalic: boolean;
}

/** Strict tokens: black text on white, the body face. The fallback for any caller without a theme. */
export const STRICT_COVER_TOKENS: CoverTokens = {
  accent: "#000000",
  tint: null,
  onAccent: "#000000",
  colourFields: false,
  displayFont: "inherit",
  displayItalic: false,
};

/**
 * The cover's box: one page under the printable height of every profile
 * (the same bound the chapter divider uses), never spilling onto page 2.
 */
export const COVER_HEIGHT = "23.5cm";

/**
 * The internato and local de formação lines (DIO-50: MFR requires the local
 * de formação on the cover), as `<p>`s with the given class; empty lines are
 * left out so a cover without them yet doesn't print gaps.
 */
export function coverLines(fields: CoverFields, className: string): string {
  return [fields.internatoPt, fields.localPt]
    .filter((line) => line.length > 0)
    .map((line) => `<p class="${className}">${line}</p>`)
    .join("\n");
}

export interface CoverTemplate {
  id: string;
  /** pt-PT label shown in the gallery. */
  name: string;
  thumbnailSvg: string;
  buildHtml(fields: CoverFields): string;
  /** Scoped under `.cover-${id}` — see `mergeCoverWithDocument`. */
  css(tokens: CoverTokens): string;
}

/** Shared by every layout: the page box, the name face, body overrides. */
export function coverBaseCss(tokens: CoverTokens): string {
  return `
.cover-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: ${COVER_HEIGHT};
  overflow: hidden;
  text-align: left;
  color: #000;
}
.cover-page p, .cover-page h1 {
  margin: 0;
  text-indent: 0;
  text-align: inherit;
  hyphens: manual;
  line-height: 1.3;
}
.cover-page .cover-name {
  font-family: ${tokens.displayFont};
  font-style: ${tokens.displayItalic ? "italic" : "normal"};
  font-weight: ${tokens.displayItalic ? "normal" : "bold"};
  line-height: 1.1;
  color: #000;
}
.cover-page .cover-kicker {
  font-size: 10.5pt;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: ${tokens.accent};
}
.cover-page .cover-line { font-size: 12pt; margin-bottom: 0.12cm; }
.cover-page .cover-date { font-size: 11pt; letter-spacing: 0.04em; }
.cover-page hr { border: none; height: 0; margin: 0; }
`;
}

const thumbFrame = `<rect x="0.5" y="0.5" width="119" height="159" fill="#fff" stroke="#ccc"/>`;

export const COVER_TEMPLATES: readonly CoverTemplate[] = [
  {
    id: "classica",
    name: "Clássica",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${thumbFrame}
      <rect x="44" y="44" width="32" height="2.5" fill="#666"/>
      <rect x="22" y="54" width="76" height="9" fill="#111"/>
      <rect x="53" y="71" width="14" height="0.8" fill="#666"/>
      <rect x="34" y="80" width="52" height="3" fill="#888"/>
      <rect x="40" y="86" width="40" height="3" fill="#888"/>
      <rect x="48" y="138" width="24" height="3" fill="#888"/>
    </svg>`,
    css: (t) => `
.cover-classica { align-items: center; text-align: center; padding-top: 5.2cm; }
.cover-classica .cover-name { font-size: 30pt; margin-top: 0.7cm; }
.cover-classica .cover-rule { width: 2cm; border-top: 0.75pt solid ${t.accent}; margin: 0.9cm auto; }
.cover-classica .cover-date { margin-top: auto; }
`,
    buildHtml: (fields) => `
<p class="cover-kicker">Curriculum Vitae</p>
<h1 class="cover-name">${fields.candidateName}</h1>
<hr class="cover-rule" />
${coverLines(fields, "cover-line")}
<p class="cover-date">${fields.dateLabel}</p>
`,
  },
  {
    id: "moderna",
    name: "Moderna",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${thumbFrame}
      <rect x="14" y="20" width="30" height="2.5" fill="#666"/>
      <rect x="14" y="28" width="80" height="11" fill="#111"/>
      <rect x="14" y="42" width="56" height="11" fill="#111"/>
      <rect x="14" y="116" width="92" height="2.5" fill="#444"/>
      <rect x="14" y="124" width="60" height="3" fill="#888"/>
      <rect x="14" y="130" width="48" height="3" fill="#888"/>
      <rect x="14" y="140" width="24" height="3" fill="#888"/>
    </svg>`,
    css: (t) => `
.cover-moderna { padding-top: 0.8cm; }
.cover-moderna .cover-name { font-size: 38pt; margin-top: 0.5cm; max-width: 92%; letter-spacing: -0.01em; }
.cover-moderna .cover-foot {
  margin-top: auto;
  padding-top: 0.5cm;
  border-top: ${t.colourFields ? "3pt" : "0.75pt"} solid ${t.accent};
}
.cover-moderna .cover-date { margin-top: 0.4cm; }
`,
    buildHtml: (fields) => `
<p class="cover-kicker">Curriculum Vitae</p>
<h1 class="cover-name">${fields.candidateName}</h1>
<div class="cover-foot">
${coverLines(fields, "cover-line")}
<p class="cover-date">${fields.dateLabel}</p>
</div>
`,
  },
  {
    id: "formal",
    name: "Formal",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${thumbFrame}
      <rect x="42" y="50" width="36" height="2.5" fill="#666"/>
      <rect x="22" y="60" width="76" height="0.8" fill="#444"/>
      <rect x="26" y="68" width="68" height="8" fill="#111"/>
      <rect x="22" y="83" width="76" height="0.8" fill="#444"/>
      <rect x="34" y="96" width="52" height="3" fill="#888"/>
      <rect x="40" y="102" width="40" height="3" fill="#888"/>
      <rect x="48" y="114" width="24" height="3" fill="#888"/>
    </svg>`,
    css: (t) => `
.cover-formal { align-items: center; justify-content: center; text-align: center; }
.cover-formal .cover-rule { width: 70%; border-top: 0.5pt solid ${t.accent}; margin: 0.55cm auto; }
.cover-formal .cover-rule-first { margin-top: 0.7cm; }
.cover-formal .cover-name { font-size: 26pt; }
.cover-formal .cover-details { margin-top: 0.9cm; }
.cover-formal .cover-date { margin-top: 0.6cm; }
`,
    buildHtml: (fields) => `
<p class="cover-kicker">Curriculum Vitae</p>
<hr class="cover-rule cover-rule-first" />
<h1 class="cover-name">${fields.candidateName}</h1>
<hr class="cover-rule" />
<div class="cover-details">
${coverLines(fields, "cover-line")}
</div>
<p class="cover-date">${fields.dateLabel}</p>
`,
  },
  {
    id: "faixa",
    name: "Faixa",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${thumbFrame}
      <rect x="12" y="12" width="96" height="62" fill="#3a3a3a"/>
      <rect x="20" y="46" width="26" height="2.5" fill="#bbb"/>
      <rect x="20" y="53" width="72" height="10" fill="#fff"/>
      <rect x="20" y="86" width="60" height="3" fill="#888"/>
      <rect x="20" y="92" width="48" height="3" fill="#888"/>
      <rect x="20" y="140" width="24" height="3" fill="#888"/>
    </svg>`,
    css: (t) => `
.cover-faixa .cover-band {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 9.5cm;
  box-sizing: border-box;
  ${
    t.colourFields
      ? `padding: 1cm 1.1cm 1.1cm; background: ${t.accent};`
      : `padding: 0 0 0.7cm; border-bottom: 0.75pt solid ${t.accent};`
  }
}
.cover-faixa .cover-band .cover-kicker { color: ${t.colourFields ? (t.tint ?? t.onAccent) : t.accent}; }
.cover-faixa .cover-band .cover-name { font-size: 34pt; margin-top: 0.45cm; color: ${t.onAccent}; }
.cover-faixa .cover-details { padding: 1cm ${t.colourFields ? "1.1cm" : "0"} 0; }
.cover-faixa .cover-date { margin-top: auto; padding: 0 ${t.colourFields ? "1.1cm" : "0"}; }
`,
    buildHtml: (fields) => `
<div class="cover-band">
<p class="cover-kicker">Curriculum Vitae</p>
<h1 class="cover-name">${fields.candidateName}</h1>
</div>
<div class="cover-details">
${coverLines(fields, "cover-line")}
</div>
<p class="cover-date">${fields.dateLabel}</p>
`,
  },
  {
    id: "margem",
    name: "Margem",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${thumbFrame}
      <rect x="12" y="12" width="5" height="136" fill="#3a3a3a"/>
      <rect x="26" y="16" width="26" height="2.5" fill="#666"/>
      <rect x="26" y="62" width="74" height="10" fill="#111"/>
      <rect x="26" y="75" width="50" height="10" fill="#111"/>
      <rect x="26" y="124" width="58" height="3" fill="#888"/>
      <rect x="26" y="130" width="46" height="3" fill="#888"/>
      <rect x="26" y="140" width="24" height="3" fill="#888"/>
    </svg>`,
    css: (t) => `
.cover-margem {
  padding: 0.2cm 0 0.2cm ${t.colourFields ? "1.3cm" : "1cm"};
  border-left: ${t.colourFields ? "0.6cm" : "0.75pt"} solid ${t.accent};
}
.cover-margem .cover-name { font-size: 34pt; margin-top: 6.2cm; }
.cover-margem .cover-foot { margin-top: auto; }
.cover-margem .cover-date { margin-top: 0.4cm; }
`,
    buildHtml: (fields) => `
<p class="cover-kicker">Curriculum Vitae</p>
<h1 class="cover-name">${fields.candidateName}</h1>
<div class="cover-foot">
${coverLines(fields, "cover-line")}
<p class="cover-date">${fields.dateLabel}</p>
</div>
`,
  },
  {
    id: "bloco",
    name: "Bloco",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">${thumbFrame}
      <rect x="12" y="12" width="96" height="136" fill="#e6e6e6"/>
      <rect x="22" y="26" width="26" height="2.5" fill="#555"/>
      <rect x="22" y="34" width="12" height="0.8" fill="#555"/>
      <rect x="22" y="94" width="76" height="10" fill="#333"/>
      <rect x="22" y="107" width="54" height="10" fill="#333"/>
      <rect x="22" y="128" width="56" height="3" fill="#888"/>
      <rect x="22" y="134" width="24" height="3" fill="#888"/>
    </svg>`,
    css: (t) => `
.cover-bloco {
  ${t.colourFields && t.tint ? `padding: 1.5cm 1.3cm; background: ${t.tint};` : "padding: 0.4cm 0; text-align: right;"}
}
.cover-bloco .cover-rule { width: 1.4cm; border-top: 0.75pt solid ${t.accent}; margin: 0.4cm ${t.colourFields ? "auto 0 0" : "0 0 auto"}; }
.cover-bloco .cover-name { font-size: 34pt; margin-top: auto; color: ${t.colourFields ? t.accent : "#000"}; }
.cover-bloco .cover-details { margin-top: 0.9cm; }
.cover-bloco .cover-date { margin-top: 0.3cm; }
`,
    buildHtml: (fields) => `
<p class="cover-kicker">Curriculum Vitae</p>
<hr class="cover-rule" />
<h1 class="cover-name">${fields.candidateName}</h1>
<div class="cover-details">
${coverLines(fields, "cover-line")}
<p class="cover-date">${fields.dateLabel}</p>
</div>
`,
  },
];
