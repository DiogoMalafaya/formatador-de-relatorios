/**
 * Cover templates (DIO-12).
 *
 * Per the norms: white page, black text only, no colours/photographs/symbols
 * — see the "Cover" section of the project's `CLAUDE.md`. That rules out a
 * visual design gallery; what varies between templates is purely typographic
 * (alignment, spacing, rules), which is also why this stays config, not code
 * — the acceptance criteria require adding a template to be a config/asset
 * change. `buildHtml`/`css` are the "asset"; `COVER_TEMPLATES` is the config.
 *
 * `thumbnailSvg` is trusted, hand-authored markup (not user input) rendered
 * via `dangerouslySetInnerHTML` in `CoverSelect` — inlining avoids shipping
 * separate image assets for three simple line drawings.
 */

export interface CoverFields {
  /** Already HTML-escaped by `mergeCoverWithDocument` — templates must not escape again. */
  candidateName: string;
  /** Already HTML-escaped by `mergeCoverWithDocument`. */
  dateLabel: string;
}

export interface CoverTemplate {
  id: string;
  /** pt-PT label shown in the gallery. */
  name: string;
  thumbnailSvg: string;
  buildHtml(fields: CoverFields): string;
  /** Scoped under `.cover-${id}` — see `mergeCoverWithDocument`. */
  css: string;
}

export const COVER_TEMPLATES: readonly CoverTemplate[] = [
  {
    id: "classica",
    name: "Clássica",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="119" height="159" fill="#fff" stroke="#ccc"/>
      <rect x="30" y="55" width="60" height="4" fill="#000"/>
      <rect x="20" y="70" width="80" height="8" fill="#000"/>
      <rect x="45" y="120" width="30" height="3" fill="#666"/>
    </svg>`,
    css: `
.cover-classica {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: 30%;
}
.cover-classica .cover-kicker {
  margin: 0 0 24px;
  font-size: 12pt;
  letter-spacing: 3px;
  text-transform: uppercase;
}
.cover-classica .cover-name {
  margin: 0 0 40px;
  font-size: 26pt;
  font-weight: bold;
}
.cover-classica .cover-date {
  margin: 0;
  font-size: 11pt;
  color: #333;
}
`,
    buildHtml: ({ candidateName, dateLabel }) => `
<p class="cover-kicker">Curriculum Vitae</p>
<h1 class="cover-name">${candidateName}</h1>
<p class="cover-date">${dateLabel}</p>
`,
  },
  {
    id: "moderna",
    name: "Moderna",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="119" height="159" fill="#fff" stroke="#ccc"/>
      <rect x="14" y="30" width="45" height="7" fill="#000"/>
      <rect x="14" y="42" width="70" height="4" fill="#000"/>
      <rect x="14" y="130" width="24" height="3" fill="#666"/>
    </svg>`,
    css: `
.cover-moderna {
  padding-top: 22%;
  padding-left: 8%;
  padding-right: 8%;
}
.cover-moderna .cover-name {
  margin: 0 0 12px;
  font-size: 24pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.cover-moderna .cover-kicker {
  margin: 0;
  font-size: 13pt;
  color: #333;
}
.cover-moderna .cover-date {
  margin-top: 60%;
  font-size: 11pt;
  color: #333;
}
`,
    buildHtml: ({ candidateName, dateLabel }) => `
<h1 class="cover-name">${candidateName}</h1>
<p class="cover-kicker">Curriculum Vitae</p>
<p class="cover-date">${dateLabel}</p>
`,
  },
  {
    id: "formal",
    name: "Formal",
    thumbnailSvg: `<svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="119" height="159" fill="#fff" stroke="#ccc"/>
      <rect x="25" y="60" width="70" height="1.5" fill="#000"/>
      <rect x="30" y="68" width="60" height="7" fill="#000"/>
      <rect x="25" y="82" width="70" height="1.5" fill="#000"/>
      <rect x="42" y="120" width="36" height="3" fill="#666"/>
    </svg>`,
    css: `
.cover-formal {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-top: 32%;
}
.cover-formal .cover-kicker {
  margin: 0 0 18px;
  font-size: 11pt;
  letter-spacing: 4px;
  text-transform: uppercase;
}
.cover-formal .cover-rule {
  width: 40%;
  height: 1px;
  margin: 18px 0;
  background: #000;
  border: none;
}
.cover-formal .cover-name {
  margin: 0;
  font-size: 22pt;
  font-weight: bold;
}
.cover-formal .cover-date {
  margin-top: 32px;
  font-size: 11pt;
  color: #333;
}
`,
    buildHtml: ({ candidateName, dateLabel }) => `
<p class="cover-kicker">Curriculum Vitae</p>
<hr class="cover-rule" />
<h1 class="cover-name">${candidateName}</h1>
<hr class="cover-rule" />
<p class="cover-date">${dateLabel}</p>
`,
  },
];
